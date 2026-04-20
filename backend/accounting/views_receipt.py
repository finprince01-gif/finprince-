from rest_framework import viewsets, status # type: ignore
from rest_framework.decorators import action # type: ignore
from rest_framework.response import Response  # type: ignore
from django.db import transaction as db_transaction # type: ignore
from django.utils import timezone # type: ignore
import datetime

from .models import (
    ReceiptVoucher, ReceiptVoucherItem, Voucher, JournalEntry,
    PendingTransaction, AdvanceAllocation, Transaction, TransactionAllocation
) # type: ignore
from .serializers_receipt import ReceiptVoucherSerializer # type: ignore
from .models_bank_reconciliation import BankStatementTransaction, BankReconciliationLink # type: ignore
from .services.sales_status_service import update_sales_invoice_payment_status
from .services.portal_mirror_service import delete_transaction_from_portal

class ReceiptVoucherViewSet(viewsets.ModelViewSet):
    """
    Unified ViewSet for Receipt Vouchers.
    Replaces VoucherReceiptSingle and VoucherReceiptBulk viewsets.
    """
    queryset = ReceiptVoucher.objects.all()
    serializer_class = ReceiptVoucherSerializer
    
    def get_queryset(self):
        user = self.request.user
        queryset = self.queryset
        if hasattr(user, 'tenant_id') and user.branch_id:
            queryset = queryset.filter(tenant_id=user.branch_id)

        customer_name = self.request.query_params.get('customer')
        if customer_name:
            # Filter vouchers that have at least one item matching this customer
            queryset = queryset.filter(items__customer__name__icontains=customer_name).distinct()
        
        return queryset

    def create(self, request, *args, **kwargs):
        print(f"!!! DIAG DIAG RAW PAYLOAD: {request.data}")
        bank_transaction_id = request.data.get('bank_transaction_id')
        
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            with db_transaction.atomic():
                self.perform_create(serializer)
                receipt = serializer.instance
                
                # Handle Bank Reconciliation Link
                reconciliation_link_created = False
                if bank_transaction_id:
                    reconciliation_link_created = self._handle_bank_reconciliation(receipt, bank_transaction_id)

                headers = self.get_success_headers(serializer.data)
                response_data = serializer.data
                response_data['voucher_created'] = True
                response_data['reconciliation_link_created'] = reconciliation_link_created
                if bank_transaction_id:
                    response_data['bank_transaction_id'] = bank_transaction_id
                    
                return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)
        except Exception as e:
            from django.db import IntegrityError
            if isinstance(e, IntegrityError):
                import traceback
                error_details = traceback.format_exc()
                print(f"!!! IntegrityError details:\n{error_details}")
                return Response({"message": f"A database conflict occurred: {str(e)}", "debug_info": str(e)}, status=status.HTTP_409_CONFLICT)
            print(f"!!! Error in create: {str(e)}")
            import traceback
            print(traceback.format_exc())
            return Response({"message": "Failed to post voucher. Check logs."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _handle_bank_reconciliation(self, receipt, bank_transaction_id):
        """Link the newly created receipt to a bank statement transaction"""
        try:
            tenant_id = receipt.tenant_id
            st_txn = BankStatementTransaction.objects.get(id=bank_transaction_id, tenant_id=tenant_id)
            
            link, created = BankReconciliationLink.objects.get_or_create(
                bank_transaction=st_txn,
                defaults=dict(
                    tenant_id=tenant_id,
                    voucher_id=receipt.id,
                    voucher_type='receipt',
                    reconciliation_type='manual',
                    reconciliation_date=datetime.date.today(),
                    reconciliation_status='Reconciled',
                    match_method='manual_create',
                    confidence_score=100,
                    reconciled_at=timezone.now()
                )
            )
            
            if not created:
                link.voucher_id = receipt.id
                link.save()

            # Update staging transaction
            st_txn.status = 'MANUAL_MATCHED'
            st_txn.matched_voucher_id = receipt.id
            st_txn.reconciled_at = timezone.now()
            st_txn.save()

            # Mark ReceiptVoucher as reconciled
            ReceiptVoucher.objects.filter(id=receipt.id).update(
                bank_reconciled=True,
                bank_reconcile_date=st_txn.transaction_date,
                bank_statement_id=st_txn.id,
                bank_reference_number=st_txn.reference_number
            )
            return True
        except BankStatementTransaction.DoesNotExist:
            return False

    def perform_create(self, serializer):
        user = self.request.user
        if hasattr(user, 'tenant_id') and user.branch_id:
            serializer.save(tenant_id=user.branch_id)
        else:
            serializer.save()

    def perform_destroy(self, instance):
        tenant_id = instance.tenant_id
        items = list(instance.get_items()) # Capture before deletion
        
        # 1. Mirror deletion to portal
        try:
            delete_transaction_from_portal(instance)
        except Exception as e:
            print(f"!!! Failed to delete portal mirror: {e}")

        # 2. Delete the actual voucher
        instance.delete()
        
        # 3. Recalculate status for all affected invoices
        for it in items:
            ref_id = getattr(it, 'reference_id', None)
            if ref_id and str(ref_id).strip():
                try:
                    update_sales_invoice_payment_status(tenant_id, str(ref_id))
                except Exception as status_err:
                    print(f"!!! Status cleanup failed for invoice {ref_id}: {status_err}")

    @action(detail=False, methods=['get'], url_path='check-uniqueness')
    def check_uniqueness(self, request):
        ref_no = request.query_params.get('ref_no')
        tenant_id = self.request.user.branch_id if hasattr(self.request.user, 'tenant_id') else None
        
        if not tenant_id:
             tenant_id = request.headers.get('X-Branch-Id')

        # Check for Advance Ref or Voucher Number in the unified transaction table
        exists_voucher = Transaction.objects.filter(voucher_number=ref_no, tenant_id=tenant_id).exists()
        exists_advance = TransactionAllocation.objects.filter(
            reference_number=ref_no, 
            reference_type='ADVANCE',
            tenant_id=tenant_id
        ).exists()
        
        is_unique = not (exists_voucher or exists_advance or Voucher.objects.filter(voucher_number=ref_no, tenant_id=tenant_id).exists())
        return Response({"is_unique": is_unique, "ref_no": ref_no})

# --- DEPRECATED VIEWSETS (Aliases to prevent runtime errors in urls.py) ---
VoucherReceiptSingleViewSet = ReceiptVoucherViewSet
VoucherReceiptBulkViewSet = ReceiptVoucherViewSet
