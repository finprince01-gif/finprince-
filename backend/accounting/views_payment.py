from rest_framework import viewsets, status # type: ignore
from rest_framework.response import Response # type: ignore
from .models_voucher_payment import VoucherPaymentSingle, VoucherPaymentBulk # type: ignore
from .serializers_payment import VoucherPaymentSingleSerializer, VoucherPaymentBulkSerializer # type: ignore
from .models_bank_reconciliation import BankStatementTransaction, BankReconciliationLink # type: ignore
from django.utils import timezone # type: ignore
from django.db import transaction as db_transaction # type: ignore
import datetime

class VoucherPaymentSingleViewSet(viewsets.ModelViewSet):
    queryset = VoucherPaymentSingle.objects.all()
    serializer_class = VoucherPaymentSingleSerializer
    
    def get_queryset(self):
        user = self.request.user
        queryset = self.queryset

        # Filter by tenant_id if available on user
        if hasattr(user, 'tenant_id') and user.tenant_id:
            queryset = queryset.filter(tenant_id=user.tenant_id)

        # Filter by pay_to (vendor name) for ledger view
        pay_to = self.request.query_params.get('pay_to')
        if pay_to:
            queryset = queryset.filter(pay_to__name__icontains=pay_to)

        return queryset

    def create(self, request, *args, **kwargs):
        bank_transaction_id = request.data.get('bank_transaction_id')
        
        # Original create logic
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        with db_transaction.atomic():
            self.perform_create(serializer)
            voucher_record = serializer.instance
            accounting_voucher_id = getattr(voucher_record, '_accounting_voucher_id', voucher_record.id)
            
            # Link to bank transaction if ID provided
            reconciliation_link_created = False
            if bank_transaction_id:
                try:
                    tenant_id = self.request.user.tenant_id if hasattr(self.request.user, 'tenant_id') else None
                    st_txn = BankStatementTransaction.objects.get(id=bank_transaction_id, tenant_id=tenant_id)
                    
                    # Upsert: create if missing, skip if already linked
                    link, created = BankReconciliationLink.objects.get_or_create(
                        bank_transaction=st_txn,
                        defaults=dict(
                            tenant_id=tenant_id,
                            voucher_id=accounting_voucher_id,
                            voucher_type='payment',
                            reconciliation_type='manual',
                            reconciliation_date=datetime.date.today(),
                            reconciliation_status='Reconciled',
                            match_method='manual_create',
                            confidence_score=100,
                            cheque_number=st_txn.cheque_number,
                            reconciled_at=timezone.now()
                        )
                    )
                    if not created:
                        # Update existing link to point to the latest voucher
                        link.voucher_id = accounting_voucher_id
                        link.voucher_type = 'payment'
                        link.reconciliation_type = 'manual'
                        link.reconciliation_date = datetime.date.today()
                        link.reconciliation_status = 'Reconciled'
                        link.match_method = 'manual_create'
                        link.confidence_score = 100
                        link.cheque_number = st_txn.cheque_number
                        link.reconciled_at = timezone.now()
                        link.save()

                    # Update staging transaction status to MANUAL_MATCHED
                    st_txn.status = 'MANUAL_MATCHED'
                    st_txn.matched_voucher_id = accounting_voucher_id
                    st_txn.reconciled_at = timezone.now()
                    st_txn.is_ignored = False
                    st_txn.save(update_fields=['status', 'matched_voucher_id', 'reconciled_at', 'is_ignored'])

                    # Mark voucher itself as bank-reconciled
                    VoucherPaymentSingle.objects.filter(id=voucher_record.id).update(
                        bank_reconciled=True,
                        bank_reconcile_date=st_txn.transaction_date,
                        bank_statement_id=st_txn.id,
                        bank_reference_number=st_txn.reference_number
                    )
                    reconciliation_link_created = True
                except BankStatementTransaction.DoesNotExist:
                    pass  # bank_transaction_id was invalid – just save the voucher without linking

            headers = self.get_success_headers(serializer.data)
            response_data = serializer.data
            response_data['voucher_created'] = True
            response_data['reconciliation_link_created'] = reconciliation_link_created
            if bank_transaction_id:
                response_data['bank_transaction_id'] = bank_transaction_id
                
            return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        user = self.request.user
        if hasattr(user, 'tenant_id') and user.tenant_id:
            serializer.save(tenant_id=user.tenant_id)
        else:
            serializer.save()

class VoucherPaymentBulkViewSet(viewsets.ModelViewSet):
    queryset = VoucherPaymentBulk.objects.all()
    serializer_class = VoucherPaymentBulkSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = self.queryset

        if hasattr(user, 'tenant_id') and user.tenant_id:
            queryset = queryset.filter(tenant_id=user.tenant_id)

        return queryset
        
    def perform_create(self, serializer):
        user = self.request.user
        if hasattr(user, 'tenant_id') and user.tenant_id:
            serializer.save(tenant_id=user.tenant_id)
        else:
            serializer.save()
