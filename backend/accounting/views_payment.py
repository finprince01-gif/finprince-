from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from core.mixins import BranchQuerysetMixin, IsBranchMember
from core.tenant import get_tenant_from_request
from .models import (
    Voucher, JournalEntry, PaymentVoucher, PaymentVoucherItem,
    PendingTransaction, AdvanceAllocation, Transaction, TransactionAllocation
)  # type: ignore
from .serializers_payment import (
    PaymentVoucherSerializer, 
    VoucherPaymentSingleSerializer, 
    VoucherPaymentBulkSerializer,
    AdvancePaymentSerializer
)
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
            exists = TransactionAllocation.objects.filter(
                tenant_id=tenant_id,
                reference_number=ref_no,
                reference_type='ADVANCE'
            ).exists()
            return Response({'is_unique': not exists})
            
        if v_num:
            # Check if voucher number is taken in the unified transaction table
            exists = Transaction.objects.filter(
                tenant_id=tenant_id, 
                voucher_number=v_num
            ).exists()
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
                 from .models import PendingTransaction
                 from django.db.models import Sum
                 applied = PendingTransaction.objects.filter(tenant_id=tenant_id, reference_number=v.voucher_number).aggregate(t=Sum('allocated_amount'))['t'] or 0
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
            
            is_partially_paid = float(pending_amt) < float(v_amt) - 0.01
            
            # FILTER: only show "Due", "Due Today", or "Partially Paid" as requested
            if due_status in ["Due", "Due Today"] or is_partially_paid:
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
    Common function to fetch advance payments for a specific ledger from all sources.
    Matches against pay_to_ledger (Vendor-side) or pay_from_ledger (Customer-side).
    """
    from django.db.models import Q
    from accounting.models import AdvanceAllocation, PendingTransaction
    
    # ── Source 1: AdvanceAllocation (Voucher-based and Portal-based advances) ──
    payment_qs = AdvanceAllocation.objects.filter(
        amount__gt=0
    ).select_related('pay_to_ledger', 'pay_from_ledger')
    
    if ledger_id:
        payment_qs = payment_qs.filter(
            Q(pay_to_ledger_id=ledger_id) | Q(pay_from_ledger_id=ledger_id)
        )
    if tenant_id:
        payment_qs = payment_qs.filter(tenant_id=tenant_id)
        
    if category:
        from django.db.models.functions import Trim, Upper
        payment_qs = payment_qs.annotate(
            v_cat=Upper(Trim('pay_to_ledger__vendors_basic__vendor_category')),
            c_cat=Upper(Trim('pay_to_ledger__customers_basic__customer_category__category')),
            c_from_cat=Upper(Trim('pay_from_ledger__customers_basic__customer_category__category'))
        ).filter(
            Q(v_cat=category.strip().upper()) |
            Q(c_cat=category.strip().upper()) |
            Q(c_from_cat=category.strip().upper())
        )

    # ── Source 2: PendingTransaction (Receipt-based advances direct from core logic) ──
    # Note: Only needed if not already synced to AdvanceAllocation
    receipt_qs = PendingTransaction.objects.filter(
        is_advance=True,
        amount__gt=0
    ).select_related('pay_from_ledger', 'pay_to_ledger')
    
    if ledger_id:
        receipt_qs = receipt_qs.filter(
            Q(pay_from_ledger_id=ledger_id) | Q(pay_to_ledger_id=ledger_id)
        )
    if tenant_id:
        receipt_qs = receipt_qs.filter(tenant_id=tenant_id)

    # ── Combine and De-duplicate ──
    results = []
    seen_combinations = set()

    def process_qs(qs, source_type_default):
        for r in qs:
            # Mark the type for allocation logic
            is_payment = 'payment' in str(getattr(r, 'type', '')).lower()
            
            # Label as receipt if the ledger we filtered for is the sender (customer side)
            if source_type_default == 'payment' and ledger_id and str(r.pay_from_ledger_id) == str(ledger_id):
                r._source = 'receipt'
            else:
                r._source = source_type_default or ('payment' if is_payment else 'receipt')
            
            # Fix display name mapping for Serializer get_pay_to_name
            # If it's a customer-receipt-advance, Serializer expects customer in pay_to_ledger
            if r._source == 'receipt' and r.pay_from_ledger and not getattr(r, '_party_fixed', False):
                r.pay_to_ledger = r.pay_from_ledger
                r._party_fixed = True

            combo = (r.__class__.__name__, r.id)
            if combo not in seen_combinations:
                results.append(r)
                seen_combinations.add(combo)

    process_qs(payment_qs, 'payment')
    process_qs(receipt_qs, 'receipt')

    return results

class AdvancePaymentViewSet(viewsets.ModelViewSet):
    """
    API for managing Advance Payments.
    Fetches available advances from both payments and receipts.
    """
    queryset = AdvanceAllocation.objects.none() # Dummy for router
    serializer_class = AdvancePaymentSerializer
    permission_classes = [IsAuthenticated, IsBranchMember]

    def list(self, request, *args, **kwargs):
        tenant_id = get_tenant_from_request(self.request)
        ledger_id = self.request.query_params.get('ledger_id')
        category = self.request.query_params.get('category')

        # 1. Fetch Advances from all sources
        combined = list(get_advances_by_ledger(ledger_id, tenant_id, category))

        # 2. Calculate Remaining and Filter
        from decimal import Decimal
        from accounting.services.advance_service import get_allocated_amount
        import datetime
        
        final_list = []
        for adv in combined:
            source_type = getattr(adv, '_source', 'payment')
            
            # Resolve total amount (handles different field names in subclasses)
            total_amt = Decimal(str(getattr(adv, 'amount', 0) or getattr(adv, 'received_amount', 0) or 0))
            
            allocated = get_allocated_amount(adv.id, source_type, tenant_id)
            remaining = total_amt - allocated
            
            # Attach to object for serializer
            adv._allocated = allocated
            adv._remaining = remaining
            
            # Only include if remaining balance is positive
            if remaining > Decimal('0.01'):
                final_list.append(adv)
        
        # 3. Sort by date descending
        def get_best_date(obj):
            for f in ['voucher_date', 'transaction_date', 'invoice_date', 'date']:
                d = getattr(obj, f, None)
                if d: return d
            if hasattr(obj, 'voucher') and obj.voucher:
                return getattr(obj.voucher, 'date', None)
            return None

        final_list.sort(key=lambda x: get_best_date(x) or datetime.date.min, reverse=True)

        serializer = self.get_serializer(final_list, many=True)
        return Response(serializer.data)

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        return AdvanceAllocation.objects.filter(tenant_id=tenant_id)

