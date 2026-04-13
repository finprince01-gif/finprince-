from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from core.mixins import BranchQuerysetMixin, IsBranchMember
from core.tenant import get_tenant_from_request
from .models import Voucher, JournalEntry, PaymentVoucher, PaymentVoucherItem  # type: ignore
from .serializers_payment import (
    PaymentVoucherSerializer, 
    VoucherPaymentSingleSerializer, 
    VoucherPaymentBulkSerializer,
    AdvancePaymentSerializer
)
from .models_advance_allocation import AdvanceAllocation
from .models_pending_transaction import PendingTransaction
from .models_bank_reconciliation import BankStatementTransaction, BankReconciliationLink  # type: ignore
from django.utils import timezone  # type: ignore
from django.db import transaction as db_transaction  # type: ignore
import datetime
from django.db.models import Q # type: ignore


# ============================================================================
# UNIFIED PAYMENT VOUCHER VIEWSET
# ============================================================================

class PaymentVoucherViewSet(viewsets.ModelViewSet):
    """
    Unified endpoint for all payment vouchers.

    Single payment → POST with items=[{pay_to, amount, ...}]  (1 item)
    Bulk   payment → POST with items=[{pay_to, amount, ...}]  (N items)

    The single/bulk distinction is a UI concept only and does NOT affect the
    API contract.
    """
    queryset = PaymentVoucher.objects.prefetch_related('items__pay_to_ledger').all()
    serializer_class = PaymentVoucherSerializer

    def get_queryset(self):
        user = self.request.user
        qs = self.queryset

        if hasattr(user, 'tenant_id') and user.branch_id:
            qs = qs.filter(tenant_id=user.branch_id)

        # Optional filters
        pay_to_ledger = self.request.query_params.get('pay_to_ledger')
        if pay_to_ledger:
            qs = qs.filter(items__pay_to_ledger__name__icontains=pay_to_ledger)

        return qs.distinct()

    @action(detail=False, methods=['get'], url_path='check-uniqueness')
    def check_uniqueness(self, request):
        """Check if a reference number (Advance Ref No) is already used."""
        ref_no = request.query_params.get('ref_no')
        v_num = request.query_params.get('voucher_number')
        tenant_id = getattr(request.user, 'tenant_id', None)
        
        if not tenant_id:
            tenant_id = request.headers.get('X-Branch-Id')

        if ref_no:
            # Check for standard advance ref no
            exists = AdvanceAllocation.objects.filter(
                tenant_id=tenant_id,
                advance_ref_no=ref_no
            ).exclude(advance_ref_no='').exists()
            return Response({'is_unique': not exists})
            
        if v_num:
            exists = (
                PaymentVoucher.objects.filter(tenant_id=tenant_id, voucher_number=v_num).exists() or
                AdvanceAllocation.objects.filter(tenant_id=tenant_id, voucher_number=v_num).exists()
            )
            return Response({'is_unique': not exists})

        return Response({'is_unique': True})

    def _parse_credit_days(self, raw_val):
        import re
        raw = str(raw_val).strip()
        if raw.isdigit():
            return int(raw)
        m = re.search(r"(\d+)", raw)
        return int(m.group(1)) if m else 0

    @action(detail=False, methods=['get'], url_path='pending-invoices')
    def pending_invoices(self, request):
        ledger_id = request.query_params.get('ledger_id')
        if not ledger_id:
            return Response([])

        tenant_id = getattr(request.user, 'tenant_id', None)
        if not tenant_id:
            tenant_id = request.headers.get('X-Branch-Id')

        # 1. Find all Purchase/Sales vouchers involving this ledger via Journal Entries
        # This is the bill-wise lookup source of truth
        entry_qs = JournalEntry.objects.filter(
            tenant_id=tenant_id,
            ledger_id=ledger_id
        ).values('voucher_id', 'voucher_type').distinct()
        
        valid_types = ['purchase', 'sales', 'Journal', 'purchase-manual', 'Purchase']
        matched_vouchers_criteria = []
        for e in entry_qs:
            v_type = e['voucher_type']
            if v_type and any(t.lower() in v_type.lower() for t in ['purchase', 'sales']):
                matched_vouchers_criteria.append(e['voucher_id'])
        
        if not matched_vouchers_criteria:
            return Response([])

        # 2. Fetch the corresponding Voucher records
        vouchers = Voucher.objects.filter(
            tenant_id=tenant_id,
            id__in=matched_vouchers_criteria
        ).order_by('-date')
        
        # 3. Get Credit Period for this ledger
        credit_period_days = 0
        from vendors.models import VendorMasterTerms, VendorMasterBasicDetail
        vendor = VendorMasterBasicDetail.objects.filter(ledger_id=ledger_id, tenant_id=tenant_id).first()
        if vendor:
            terms = VendorMasterTerms.objects.filter(vendor_basic_detail=vendor, tenant_id=tenant_id).first()
            if terms and terms.credit_period:
                credit_period_days = self._parse_credit_days(terms.credit_period)
        else:
            # Check customers
            from customerportal.database import CustomerMasterCustomerTermsCondition, CustomerMasterCustomerBasicDetails
            customer = CustomerMasterCustomerBasicDetails.objects.filter(ledger_id=ledger_id, tenant_id=tenant_id).first()
            if customer:
                terms = CustomerMasterCustomerTermsCondition.objects.filter(customer_basic_detail=customer, tenant_id=tenant_id).first()
                if terms and terms.credit_period:
                    credit_period_days = self._parse_credit_days(terms.credit_period)

        from datetime import timedelta
        today = datetime.date.today()
        
        # 4. Format response for the frontend Pending Transactions table
        results = []
        for v in vouchers:
            v_amt = v.total if v.total and v.total > 0 else (v.amount if v.amount else 0)
            if v_amt == 0:
                 v_amt = v.total_debit if v.total_debit > 0 else v.total_credit

            pending_amt = v_amt
            v_type_lower = (v.type or '').lower()
            
            if 'sales' in v_type_lower:
                from .models_voucher_sales import VoucherSalesInvoiceDetails
                sale = VoucherSalesInvoiceDetails.objects.filter(tenant_id=tenant_id, sales_invoice_no=v.voucher_number).select_related('payment_details').first()
                if sale and hasattr(sale, 'payment_details') and sale.payment_details:
                    pending_amt = sale.payment_details.payment_balance if sale.payment_details.payment_balance is not None else v_amt
            elif 'purchase' in v_type_lower:
                from .models_voucher_purchase import VoucherPurchaseDetails
                purch = VoucherPurchaseDetails.objects.filter(tenant_id=tenant_id, purchase_invoice_no=v.voucher_number).select_related('payment_details').first()
                if purch and hasattr(purch, 'payment_details') and purch.payment_details:
                    pending_amt = purch.payment_details.payment_balance if purch.payment_details.payment_balance is not None else v_amt
            else:
                 from .models_pending_transaction import PendingTransaction
                 from django.db.models import Sum
                 applied = PendingTransaction.objects.filter(tenant_id=tenant_id, reference_number=v.voucher_number).aggregate(t=Sum('amount_applied'))['t'] or 0
                 pending_amt = float(v_amt) - float(applied)
                 
            # If the invoice is fully paid, skip it
            if float(pending_amt) <= 0.01:
                 continue

            due_date = v.date + timedelta(days=credit_period_days) if v.date else None
            due_status = "Not Due"
            days_to_due = 0
            
            if due_date:
                days_to_due = (due_date - today).days
                if days_to_due < 0:
                    due_status = "Due"
                elif days_to_due == 0:
                    due_status = "Due Today"
            
            # FILTER: only show "Due" or "Due Today" as requested by user
            if due_status in ["Due", "Due Today"]:
                results.append({
                    'id': v.id,
                    'date': v.date.strftime('%Y-%m-%d') if v.date else '',
                    'reference_number': v.voucher_number or v.invoice_no or f"V-{v.id}",
                    'amount': float(v_amt),
                    'pending': float(pending_amt), 
                    'type': v.type,
                    'credit_period': credit_period_days,
                    'due_date': due_date.strftime('%Y-%m-%d') if due_date else '',
                    'due_status': due_status,
                    'days_to_due': days_to_due
                })
            
        return Response(results)


    def create(self, request, *args, **kwargs):
        bank_transaction_id = request.data.get('bank_transaction_id')

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with db_transaction.atomic():
            self.perform_create(serializer)
            voucher_record = serializer.instance
            accounting_voucher_id = getattr(
                voucher_record, '_accounting_voucher_id', voucher_record.id
            )

            # Link to bank transaction if ID provided
            reconciliation_link_created = False
            if bank_transaction_id:
                try:
                    tenant_id = (
                        self.request.user.branch_id
                        if hasattr(self.request.user, 'tenant_id')
                        else None
                    )
                    st_txn = BankStatementTransaction.objects.get(
                        id=bank_transaction_id, tenant_id=tenant_id
                    )

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
                            reconciled_at=timezone.now(),
                        ),
                    )
                    if not created:
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

                    st_txn.status = 'MANUAL_MATCHED'
                    st_txn.matched_voucher_id = accounting_voucher_id
                    st_txn.reconciled_at = timezone.now()
                    st_txn.is_ignored = False
                    st_txn.save(update_fields=[
                        'status', 'matched_voucher_id', 'reconciled_at', 'is_ignored'
                    ])

                    PaymentVoucher.objects.filter(id=voucher_record.id).update(
                        bank_reconciled=True,
                        bank_reconcile_date=st_txn.transaction_date,
                        bank_statement_id=st_txn.id,
                        bank_reference_number=st_txn.reference_number,
                    )
                    reconciliation_link_created = True

                except BankStatementTransaction.DoesNotExist:
                    pass  # Invalid bank_transaction_id – save voucher without linking

        headers = self.get_success_headers(serializer.data)
        response_data = dict(serializer.data)
        response_data['voucher_created'] = True
        response_data['reconciliation_link_created'] = reconciliation_link_created
        if bank_transaction_id:
            response_data['bank_transaction_id'] = bank_transaction_id

        return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        user = self.request.user
        if hasattr(user, 'tenant_id') and user.branch_id:
            serializer.save(tenant_id=user.branch_id)
        else:
            serializer.save()


# ============================================================================
# BACKWARD-COMPATIBILITY VIEWSETS
# (These keep the old /api/vouchers/payment-single/ and
#  /api/vouchers/payment-bulk/ endpoints alive during the transition.
#  They translate old payload shapes to the new unified schema via the
#  shim serializers defined in serializers_payment.py.)
# ============================================================================

class VoucherPaymentSingleViewSet(PaymentVoucherViewSet):
    """
    DEPRECATED endpoint – /api/vouchers/payment-single/
    Kept alive for backward compatibility. Translates old single-payment
    payload (pay_to, total_payment at top level) to new unified schema.
    """
    serializer_class = VoucherPaymentSingleSerializer


class VoucherPaymentBulkViewSet(PaymentVoucherViewSet):
    """
    DEPRECATED endpoint – /api/vouchers/payment-bulk/
    Kept alive for backward compatibility. Translates old bulk-payment
    payload (payment_rows JSON array) to new unified schema.
    """
    serializer_class = VoucherPaymentBulkSerializer

def get_advances_by_ledger(ledger_id=None, tenant_id=None, category=None):
    """
    Common function to fetch advance payments for a specific ledger.
    Optionally filters by category (for Portal tiles).
    """
    # Advances are exclusively stored in AdvanceAllocation in the new system
    qs = AdvanceAllocation.objects.filter(
        advance_amount__gt=0
    ).select_related('pay_to_ledger')
    
    if ledger_id:
        qs = qs.filter(pay_to_ledger_id=ledger_id)

    if tenant_id:
        qs = qs.filter(tenant_id=tenant_id)
        
    if category:
        from django.db.models.functions import Trim, Upper
        # Check if it's a vendor or customer to apply category filter correctly
        # We try to join both but it's safe since they are different related_names
        qs = qs.annotate(
            v_cat=Upper(Trim('pay_to_ledger__vendors_basic__vendor_category')),
            c_cat=Upper(Trim('pay_to_ledger__customers_basic__customer_category__category'))
        ).filter(
            Q(v_cat=category.strip().upper()) | 
            Q(c_cat=category.strip().upper())
        )
        
    return qs

class AdvancePaymentViewSet(viewsets.ModelViewSet):

    """
    API for managing Advance Payments.
    Filters by ledger_id and category (for Vendors/Customers).
    """
    queryset = PaymentVoucherItem.objects.all()
    serializer_class = AdvancePaymentSerializer
    permission_classes = [IsAuthenticated, IsBranchMember]

    def list(self, request, *args, **kwargs):
        tenant_id = get_tenant_from_request(self.request)
        ledger_id = self.request.query_params.get('ledger_id')
        category = self.request.query_params.get('category')

        # 1. Fetch Advances (AdvanceAllocation now stores both payment and receipt advances)
        combined = list(get_advances_by_ledger(ledger_id, tenant_id, category))

        
        # 3. Calculate Remaining and Filter (Phase 3 & 4A)
        from decimal import Decimal
        from accounting.services.advance_service import get_allocated_amount
        
        final_list = []
        for adv in combined:
            # Type is stored in AdvanceAllocation as payment_single, receipt_bulk, etc.
            is_payment = 'payment' in str(adv.type).lower()
            source_type = 'payment' if is_payment else 'receipt'
            
            # Amount is now definitively stored in advance_amount
            total_amt = Decimal(str(adv.advance_amount or 0))
            
            allocated = get_allocated_amount(adv.id, source_type, tenant_id)
            remaining = total_amt - allocated
            
            # Attach to object for serializer
            adv._allocated = allocated
            adv._remaining = remaining
            
            # Only include if remaining balance is positive (> 0.01 tolerance)
            if remaining > Decimal('0.01'):
                final_list.append(adv)
        
        # Sort by date descending
        import datetime
        final_list.sort(key=lambda x: getattr(x, 'voucher_date', getattr(getattr(x, 'voucher', None), 'date', None)) or datetime.date.min, reverse=True)

        serializer = self.get_serializer(final_list, many=True)
        return Response(serializer.data)

    def _get_receipt_advances(self, ledger_id, tenant_id=None, category=None):
        from .models_voucher_receipt import ReceiptVoucherItem
        qs = ReceiptVoucherItem.objects.filter(
            # matches either bool or string as some legacy code uses types
            Q(is_advance=True) | Q(reference_type__iexact='advance'),
            amount__gt=0
        ).select_related('voucher', 'customer')

        if ledger_id:
            qs = qs.filter(customer_id=ledger_id)
        if tenant_id:
            qs = qs.filter(voucher__tenant_id=tenant_id)
        if category:
            from django.db.models.functions import Trim, Upper
            qs = qs.annotate(
                v_cat=Upper(Trim('customer__vendors_basic__vendor_category')),
                c_cat=Upper(Trim('customer__customers_basic__customer_category__category'))
            ).filter(
                Q(v_cat=category.strip().upper()) | 
                Q(c_cat=category.strip().upper())
            )
        return qs

    def get_queryset(self):
        # Fallback for other ModelViewSet default methods
        tenant_id = get_tenant_from_request(self.request)
        return PaymentVoucherItem.objects.filter(voucher__tenant_id=tenant_id, reference_type='ADVANCE')
