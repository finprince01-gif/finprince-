from rest_framework import viewsets, status # pyre-fixme
from rest_framework.decorators import action # pyre-fixme
from rest_framework.response import Response # pyre-fixme
from rest_framework.permissions import IsAuthenticated, AllowAny # pyre-fixme
from rest_framework.views import APIView # pyre-fixme
from django.db import connection # pyre-fixme
from core.mixins import BranchQuerysetMixin, IsBranchMember
from .models import (
    MasterLedgerGroup, MasterLedger, MasterHierarchyRaw,
    Voucher, JournalEntry
)
from customerportal.database import CustomerMasterCustomerBasicDetails as Customer
from vendors.models import VendorMasterBasicDetail as Vendor
from .serializers import ( # pyre-fixme
    MasterLedgerGroupSerializer, MasterLedgerSerializer,
    MasterHierarchyRawSerializer, VoucherSerializer, JournalEntrySerializer
)

# ============================================================================
# MASTER VIEWSETS
# ============================================================================

class MasterLedgerGroupViewSet(BranchQuerysetMixin, viewsets.ModelViewSet):
    queryset = MasterLedgerGroup.objects.all() # pyre-ignore
    serializer_class = MasterLedgerGroupSerializer
    permission_classes = [IsAuthenticated, IsBranchMember]
    required_permission = 'MASTERS_LEDGER_GROUPS'


class MasterLedgerViewSet(BranchQuerysetMixin, viewsets.ModelViewSet):
    queryset = MasterLedger.objects.all() # pyre-ignore
    serializer_class = MasterLedgerSerializer
    permission_classes = [IsAuthenticated, IsBranchMember]
    required_permission = 'MASTERS_LEDGERS'
    
    def get_queryset(self):
        """Filter ledgers by tenant and query parameters (group, category)"""
        queryset = super().get_queryset()
        
        group = self.request.query_params.get('group')
        category = self.request.query_params.get('category')
        
        if group:
            queryset = queryset.filter(group__icontains=group) # pyre-ignore
        if category:
            queryset = queryset.filter(category__icontains=category) # pyre-ignore
            
        return queryset

    def list(self, request, *args, **kwargs):
        """Override list to add logging"""
        import logging
        logger = logging.getLogger('accounting.views')
        try:
            logger.info(f"🔍 MasterLedgerViewSet.list called - User: {request.user}, Branch: {getattr(request.user, 'tenant_id', None)}")
            queryset = self.get_queryset()
            logger.info(f"🔍 Queryset count: {queryset.count()} (Filters: group={request.query_params.get('group')}, category={request.query_params.get('category')})")
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"❌ Error in MasterLedgerViewSet.list: {type(e).__name__}: {str(e)}", exc_info=True)
            raise
    
    def create(self, request, *args, **kwargs):
        """Create a new ledger with auto-generated code and retry logic"""
        import logging
        from django.db import IntegrityError, transaction # pyre-fixme
        from .utils import generate_ledger_code # pyre-fixme
        
        logger = logging.getLogger('accounting.views')
        
        try:
            logger.info(f"📝 Creating ledger - Data: {request.data}")
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            
            # Auto-generate ledger code based on hierarchy
            # Enforce tenant isolation from authenticated user
            tenant_id = request.user.branch_id
            if not tenant_id:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("Authentication with a valid Branch ID is required.")
            
            # Retry logic for code generation (handles race conditions)
            max_retries = 3
            ledger = None
            
            for attempt in range(max_retries):
                try:
                    with transaction.atomic():
                        # Generate code
                        ledger_code = generate_ledger_code(
                            serializer.validated_data, 
                            tenant_id
                        )
                        logger.info(
                            f"🔢 Generated ledger code: {ledger_code} "
                            f"(attempt {attempt + 1}/{max_retries})"
                        )
                        
                        # Save with generated code
                        ledger = serializer.save(code=ledger_code)
                        logger.info(f"✅ Ledger saved successfully with code: {ledger_code}")
                        break  # Success, exit retry loop
                        
                except IntegrityError as e:
                    if attempt == max_retries - 1:
                        # Last attempt failed
                        logger.error(
                            f"❌ Failed to generate unique code after {max_retries} attempts. "
                            f"Error: {str(e)}"
                        )
                        from rest_framework import serializers as drf_serializers # pyre-fixme
                        raise drf_serializers.ValidationError({
                            'code': 'Failed to generate unique ledger code. Please try again.'
                        })
                    
                    # Retry on next iteration
                    logger.warning(
                        f"⚠️ Code collision detected on attempt {attempt + 1}, retrying..."
                    )
                    continue
            
            # Re-serialize to include the code in response
            response_serializer = self.get_serializer(ledger)
            
            logger.info(f"✅ Ledger created successfully: {response_serializer.data}")
            headers = self.get_success_headers(response_serializer.data)
            return Response(
                response_serializer.data, 
                status=status.HTTP_201_CREATED, 
                headers=headers
            )
            
        except Exception as e:
            logger.error(
                f"❌ Error creating ledger: {type(e).__name__}: {str(e)}", 
                exc_info=True
            )
            raise
    
    def update(self, request, *args, **kwargs):
        """Update a ledger with logging"""
        import logging
        logger = logging.getLogger('accounting.views')
        try:
            partial = kwargs.pop('partial', False)
            instance = self.get_object()
            logger.info(f"📝 Updating ledger {instance.id} - Data: {request.data}")
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            logger.info(f"✅ Ledger updated successfully: {serializer.data}")
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"❌ Error updating ledger: {type(e).__name__}: {str(e)}", exc_info=True)
            raise

    @action(detail=False, methods=['get'], url_path='cash-bank')
    def cash_bank(self, request):
        """Get only Cash and Bank ledgers for dropdowns"""
        queryset = self.get_queryset().filter( # pyre-ignore
            category__icontains='Asset',
            group__icontains='Cash and Bank Balances'
        )
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


# MasterVoucherConfigViewSet removed (deprecated)


class MasterHierarchyRawViewSet(viewsets.ReadOnlyModelViewSet):
    """Global hierarchy data - restricted to authenticated staff/master users"""
    queryset = MasterHierarchyRaw.objects.all() # pyre-ignore
    serializer_class = MasterHierarchyRawSerializer
    permission_classes = [IsAuthenticated]
    
    def list(self, request, *args, **kwargs):
        """Builds and returns a hierarchical tree structure from raw CSV data."""
        from .hierarchy_service import build_ledger_hierarchy_tree
        tree = build_ledger_hierarchy_tree()
        return Response(tree)


# ============================================================================
# VOUCHER VIEWSETS - Unified
# ============================================================================

class VoucherViewSet(BranchQuerysetMixin, viewsets.ModelViewSet):
    """Unified viewset for all voucher types"""
    queryset = Voucher.objects.all() # pyre-ignore
    serializer_class = VoucherSerializer
    permission_classes = [IsAuthenticated, IsBranchMember]
    required_permission = 'ACCOUNTING_VOUCHERS'
    
    def get_queryset(self):
        """Filter by type if provided in query params"""
        queryset = super().get_queryset()
        voucher_type = self.request.query_params.get('type')
        if voucher_type:
            queryset = queryset.filter(type=voucher_type) # pyre-ignore
        return queryset
    
    def perform_create(self, serializer):
        super().perform_create(serializer)
    
    @action(detail=False, methods=['post'], url_path='bulk')
    def bulk_create(self, request):
        """Create multiple vouchers at once"""
        vouchers_data = request.data if isinstance(request.data, list) else [request.data]
        serializer = self.get_serializer(data=vouchers_data, many=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'success': True, 'count': len(vouchers_data)}, status=status.HTTP_201_CREATED)

class JournalEntryViewSet(BranchQuerysetMixin, viewsets.ModelViewSet):
    queryset = JournalEntry.objects.all() # pyre-ignore
    serializer_class = JournalEntrySerializer
    permission_classes = [IsAuthenticated, IsBranchMember]
    required_permission = 'ACCOUNTING_VOUCHERS'

    def get_queryset(self):
        """Exclude supplementary GST and TDS detail rows from the default list.
        These are only surfaced in the report action for ledger drill-downs."""
        qs = super().get_queryset()
        # Exclude detail rows from summary/list endpoints
        return qs.exclude(voucher_type__in=[
            'PURCHASE_GST_DETAIL', 'SALES_GST_DETAIL',
            'PURCHASE_TDS_DETAIL', 'SALES_TCS_DETAIL'
        ])

    def perform_update(self, serializer):
        import logging
        logger = logging.getLogger('accounting.views')
        
        # Automatically set status to Utilized if reference_number is being set
        data = self.request.data
        if 'reference_number' in data and data['reference_number'] and 'allocation_status' not in data:
            serializer.validated_data['allocation_status'] = 'Utilized'
            
        logger.info(f"📝 Updating JournalEntry {self.get_object().id} - Data: {data}")
        instance = serializer.save()
        logger.info(f"✅ Updated JournalEntry {instance.id} - Ref: {instance.reference_number}, Status: {instance.allocation_status}")

    @action(detail=False, methods=['get'])
    def report(self, request):
        """
        Dedicated Ledger Report API following strict double-entry accounting.

        For a given ledger_id, shows all journal entries affecting that ledger with:
          - particulars = the OPPOSITE (counterpart) ledger name on the same voucher
          - debit / credit as recorded in the entry
          - running balance (Dr positive, Cr negative convention)
        
        For GST ledgers (Input Tax Credit Ledger / Output Tax Liability Ledger),
        also merges supplementary GST detail rows showing IGST/CGST/SGST/Cess breakdown.
        """
        ledger_id = request.query_params.get('ledger_id')
        ledger_name = request.query_params.get('ledger_name')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        # Normalize input
        if ledger_id in [None, "", "ALL", "0", "null"]:
            ledger_id = None
        if ledger_name in [None, "", "ALL", "null"]:
            ledger_name = None

        tenant_id = getattr(request.user, 'tenant_id', None)

        # Determine if this is a special ledger that uses supplementary detail rows (GST or TDS)
        is_gst_ledger = False
        is_tds_ledger = False
        if ledger_name:
            if 'Input Tax Credit Ledger' in ledger_name or 'Output Tax Liability Ledger' in ledger_name:
                is_gst_ledger = True
            elif ('TDS Payable' in ledger_name or 'TCS Payable' in ledger_name
                  or 'TCS Receivable' in ledger_name or 'TDS Receivable' in ledger_name):
                is_tds_ledger = True

        resolved_ledger = None
        if ledger_id:
            resolved_ledger = MasterLedger.objects.filter(id=ledger_id, tenant_id=tenant_id).first() # pyre-ignore
        elif is_gst_ledger or is_tds_ledger:
            resolved_ledger = MasterLedger.objects.filter(name=ledger_name, tenant_id=tenant_id).first() # pyre-ignore
        elif ledger_name:
            resolved_ledger = MasterLedger.objects.filter(name=ledger_name, tenant_id=tenant_id).first()

        # Try to resolve credit period if this ledger belongs to a vendor or customer
        credit_period = 0
        if resolved_ledger:
            # Check additional_data first
            if isinstance(resolved_ledger.additional_data, dict):
                cp = resolved_ledger.additional_data.get('credit_period')
                if cp: credit_period = int(cp)
            
            # If still 0, try to find a vendor or customer
            if not credit_period:
                try:
                    from vendors.models import VendorMasterBasicDetail, VendorMasterTerms
                    vendor = VendorMasterBasicDetail.objects.filter(ledger=resolved_ledger).first()
                    if vendor:
                        vterm = VendorMasterTerms.objects.filter(vendor_basic_detail=vendor).first()
                        if vterm and vterm.credit_period:
                            import re
                            raw = str(vterm.credit_period)
                            if raw.isdigit():
                                credit_period = int(raw)
                            else:
                                m = re.search(r'(\d+)', raw)
                                if m: credit_period = int(m.group(1))
                except Exception:
                    pass
                
                # Check Customer if still 0
                if not credit_period:
                    try:
                        from customerportal.database import CustomerMasterCustomerBasicDetails, CustomerMasterTerms
                        customer = CustomerMasterCustomerBasicDetails.objects.filter(ledger=resolved_ledger).first()
                        if customer:
                            cterm = CustomerMasterTerms.objects.filter(customer_basic_detail=customer).first()
                            if cterm and cterm.credit_period:
                                import re
                                raw = str(cterm.credit_period)
                                if raw.isdigit():
                                    credit_period = int(raw)
                                else:
                                    m = re.search(r'(\d+)', raw)
                                    if m: credit_period = int(m.group(1))
                    except Exception:
                        pass

        # Base queryset — GST/TDS detail rows are excluded by get_queryset()
        queryset = self.get_queryset().select_related('ledger').order_by('transaction_date', 'id') # pyre-ignore

        if ledger_id:
            from django.db.models import Q
            if resolved_ledger and resolved_ledger.name:
                queryset = queryset.filter(Q(ledger_id=ledger_id) | Q(ledger_name=resolved_ledger.name) | Q(ledger__name=resolved_ledger.name))
            else:
                queryset = queryset.filter(ledger_id=ledger_id)
        elif ledger_name:
            from django.db.models import Q
            queryset = queryset.filter(Q(ledger_name=ledger_name) | Q(ledger__name=ledger_name)) # pyre-ignore

        # ── Also include all entries linked to the same VENDOR via vendor FK ──────
        # This covers debit notes / payments that were posted against a different sub-ledger
        # (e.g. "supin6", "supin7") but still belong to the same vendor (vendor4).
        if resolved_ledger:
            try:
                from vendors.models import VendorMasterBasicDetail
                from django.db.models import Q as VQ
                linked_vendor = VendorMasterBasicDetail.objects.filter(
                    ledger=resolved_ledger, tenant_id=tenant_id
                ).first()
                if linked_vendor:
                    vendor_entries_qs = self.get_queryset().select_related('ledger').filter(
                        vendor_id=linked_vendor.id
                    ).order_by('transaction_date', 'id')
                    if start_date:
                        try: vendor_entries_qs = vendor_entries_qs.filter(transaction_date__gte=start_date)
                        except (ValueError, TypeError): pass
                    if end_date:
                        try: vendor_entries_qs = vendor_entries_qs.filter(transaction_date__lte=end_date)
                        except (ValueError, TypeError): pass
                    # Merge: union of both querysets, deduplicated by ID
                    existing_ids = set(queryset.values_list('id', flat=True))
                    vendor_only = vendor_entries_qs.exclude(id__in=existing_ids)
                    # Combine using union — order by date, id afterwards
                    from itertools import chain
                    from django.db.models import Q as DQ2
                    all_ids = list(existing_ids) + list(vendor_entries_qs.values_list('id', flat=True))
                    queryset = self.get_queryset().select_related('ledger').filter(
                        id__in=all_ids
                    ).order_by('transaction_date', 'id')
            except Exception:
                pass  # Fall back to ledger-only query if vendor lookup fails

        if start_date:
            try:
                queryset = queryset.filter(transaction_date__gte=start_date) # pyre-ignore
            except (ValueError, TypeError):
                pass

        if end_date:
            try:
                queryset = queryset.filter(transaction_date__lte=end_date) # pyre-ignore
            except (ValueError, TypeError):
                pass

        # Pre-fetch all entries for each voucher to resolve counterpart ledger names
        from django.db.models import Q as DQ
        voucher_ids = list(queryset.values_list('voucher_id', flat=True).distinct())

        # Build a map: voucher_id -> list of (ledger_id, ledger_name)
        counterpart_map = {}
        if voucher_ids:
            all_entries_for_vouchers = JournalEntry.objects.filter( # pyre-ignore
                tenant_id=tenant_id,
                voucher_id__in=voucher_ids
            ).exclude(
                voucher_type__in=['PURCHASE_GST_DETAIL', 'SALES_GST_DETAIL', 'PURCHASE_TDS_DETAIL', 'SALES_TCS_DETAIL']
            ).select_related('ledger').values('voucher_id', 'ledger_id', 'ledger__name', 'ledger_name') # pyre-ignore

            for ae in all_entries_for_vouchers:
                vid = ae['voucher_id']
                lid = ae['ledger_id']
                lname = ae['ledger_name'] or ae['ledger__name'] or 'N/A'
                counterpart_map.setdefault(vid, []).append((lid, lname))

        # For GST/TDS ledgers, build a map of detail rows per voucher
        supplementary_detail_map = {}
        if (is_gst_ledger or is_tds_ledger) and resolved_ledger and voucher_ids:
            detail_types = []
            if is_gst_ledger:
                detail_types = ['PURCHASE_GST_DETAIL', 'SALES_GST_DETAIL']
            elif is_tds_ledger:
                # TCS Receivable detail rows are stored as SALES_TCS_DETAIL / SALES_TDS_DETAIL
                # TCS Payable / TDS Payable detail rows use PURCHASE_TDS_DETAIL / PURCHASE_TCS_DETAIL
                detail_types = ['PURCHASE_TDS_DETAIL', 'SALES_TCS_DETAIL', 'PURCHASE_TCS_DETAIL', 'SALES_TDS_DETAIL']
                
            detail_qs = JournalEntry.objects.filter( # pyre-ignore
                tenant_id=tenant_id,
                voucher_type__in=detail_types,
                ledger_id=resolved_ledger.id,
                voucher_id__in=voucher_ids
            ).order_by('id')
            
            for drow in detail_qs:
                vid = drow.voucher_id
                # Extract component name from ledger_name e.g. "Input Tax Credit Ledger (IGST)" -> "IGST"
                comp = drow.ledger_name
                if '(' in comp and comp.endswith(')'):
                    comp = comp[comp.index('(')+1:-1]
                supplementary_detail_map.setdefault(vid, []).append({
                    'component': comp,
                    'debit': float(drow.debit),
                    'credit': float(drow.credit),
                })

        # Build a map of FULL entries for each voucher to power accurate double-entry rendering in UI
        full_legs_map = {}
        if voucher_ids:
            all_entries_with_tax = JournalEntry.objects.filter( # pyre-ignore
                tenant_id=tenant_id,
                voucher_id__in=voucher_ids
            ).select_related('ledger').values('voucher_id', 'ledger_id', 'ledger__name', 'ledger_name', 'debit', 'credit', 'voucher_type') # pyre-ignore
            
            for ae in all_entries_with_tax:
                vid = ae['voucher_id']
                lid = ae['ledger_id']
                lname = ae['ledger_name'] or ae['ledger__name'] or 'N/A'
                vtype = ae['voucher_type']
                
                # Only add if debit or credit is > 0
                if float(ae['debit']) > 0 or float(ae['credit']) > 0:
                    full_legs_map.setdefault(vid, []).append({
                        'ledger_id': lid,
                        'ledger_name': lname,
                        'debit': float(ae['debit']),
                        'credit': float(ae['credit']),
                        'type': vtype
                    })

        # Clean up full_legs_map to prevent double counting
        for vid, legs in full_legs_map.items():
            detail_lids = {leg['ledger_id'] for leg in legs if leg['type'].endswith('_DETAIL')}
            if detail_lids:
                full_legs_map[vid] = [
                    leg for leg in legs
                    if not (leg['ledger_id'] in detail_lids and leg['type'] in ['sales', 'purchase', 'SALES', 'PURCHASE', 'PAYMENT', 'payment', 'RECEIPT', 'receipt'])
                ]

        # Build response with running balance
        data = []
        running_balance = 0.0  # Positive = Dr balance, Negative = Cr balance

        # Build a map: journal_entry_voucher_id (UUID) -> generic Voucher row data
        # This lets us pass the correct integer PK and reference_id to the frontend
        voucher_meta_map = {}
        if voucher_ids:
            try:
                voucher_rows = Voucher.objects.filter(
                    tenant_id=tenant_id,
                    id__in=voucher_ids
                ).values('id', 'source', 'reference_id', 'type')
                for vrow in voucher_rows:
                    voucher_meta_map[vrow['id']] = {
                        'voucher_pk': vrow['id'],
                        'source': vrow['source'] or '',
                        'reference_id': vrow['reference_id'],
                        'voucher_type_generic': vrow['type'] or '',
                    }
            except Exception:
                pass  # Fail silently; just won't enrich the response

        # ── Enrich with Purchase Voucher payment data (due_status, paid_amount) ──
        # VoucherPurchaseSupplierDetails is the Purchase Voucher header; due details are on
        # the linked VoucherPurchaseDueDetails. PendingTransaction holds per-invoice due_status.
        # We key by purchase_voucher_no (= e.voucher_number on the JournalEntry).
        purchase_payment_map = {}  # voucher_number -> {due_status, paid_amount, total_amount}
        if voucher_ids:
            try:
                from accounting.models_voucher_purchase import (  # pyre-fixme
                    VoucherPurchaseSupplierDetails, VoucherPurchaseDueDetails
                )
                from accounting.models import PendingTransaction  # pyre-fixme
                # Collect purchase voucher numbers that appear in our journal entries
                purch_voucher_nos = list(
                    queryset.filter(voucher_type__icontains='purchase')  # pyre-ignore
                            .values_list('voucher_number', flat=True).distinct()
                )
                if purch_voucher_nos:
                    pv_headers = VoucherPurchaseSupplierDetails.objects.filter(  # pyre-ignore
                        tenant_id=tenant_id,
                        purchase_voucher_no__in=purch_voucher_nos
                    ).prefetch_related('due_details')
                    for pvh in pv_headers:
                        due_d = getattr(pvh, 'due_details', None)
                        advance_paid = float(getattr(due_d, 'advance_paid', 0) or 0)
                        to_pay = float(getattr(due_d, 'to_pay', 0) or 0)
                        # Check PendingTransaction for due_status of this invoice
                        # (due_status is set by the payment serializer when a payment is applied)
                        pending = PendingTransaction.objects.filter(  # pyre-ignore
                            tenant_id=tenant_id,
                            reference_number=pvh.purchase_voucher_no
                        ).order_by('-id').first()
                        due_status_val = getattr(pending, 'due_status', '') or ''
                        total_amt = advance_paid + to_pay
                        purchase_payment_map[pvh.purchase_voucher_no] = {
                            'due_status': due_status_val,
                            'paid_amount': advance_paid,
                            'total_amount': total_amt,
                        }
            except Exception:
                pass  # Fail silently if model not available

        # ── Enrich with Payment/Receipt Voucher advance data ──
        # Transaction model (= PaymentVoucher = ReceiptVoucher) has is_advance/amount info.
        # AdvanceAllocation sub-items tell us how much has been utilized.
        payment_advance_map = {}  # voucher_number -> {is_advance, paid_amount, total_amount}
        if voucher_ids:
            try:
                from accounting.models import Transaction, AdvanceAllocation  # pyre-fixme
                pmt_voucher_nos = list(
                    queryset.filter(  # pyre-ignore
                        voucher_type__in=['payment', 'receipt', 'PAYMENT', 'RECEIPT', 'contra', 'CONTRA']
                    ).values_list('voucher_number', flat=True).distinct()
                )
                if pmt_voucher_nos:
                    pmt_txns = Transaction.objects.filter(  # pyre-ignore
                        tenant_id=tenant_id,
                        voucher_number__in=pmt_voucher_nos
                    ).values('id', 'voucher_number', 'total_amount', 'amount')
                    pmt_ids = [t['id'] for t in pmt_txns]
                    # Check AdvanceAllocation to find if this txn has advance items
                    advance_alloc_map = {}  # txn_id -> total utilized amount
                    if pmt_ids:
                        adv_items = AdvanceAllocation.objects.filter(  # pyre-ignore
                            tenant_id=tenant_id,
                            transaction_id__in=pmt_ids,
                            reference_type='ADVANCE'
                        ).values('transaction_id')
                        for ai in adv_items:
                            advance_alloc_map[ai['transaction_id']] = 0

                        # Fetch utilized amounts from PendingTransaction
                        from accounting.models import PendingTransaction as PT  # pyre-ignore
                        pt_items = PT.objects.filter(
                            tenant_id=tenant_id,
                            transaction_id__in=pmt_ids
                        ).values('transaction_id', 'allocated_amount')
                        for pt in pt_items:
                            tid = pt['transaction_id']
                            if tid in advance_alloc_map:
                                advance_alloc_map[tid] += float(pt.get('allocated_amount') or 0)
                    for t in pmt_txns:
                        tid = t['id']
                        is_adv = tid in advance_alloc_map
                        utilized = advance_alloc_map.get(tid, 0)
                        total = float(t.get('total_amount') or t.get('amount') or 0)
                        payment_advance_map[t['voucher_number']] = {
                            'is_advance': is_adv,
                            'paid_amount': utilized,
                            'total_amount': total,
                            'reference_type': 'ADVANCE' if is_adv else 'INVOICE',
                        }
            except Exception:
                pass

        # ── Debit Note status enrichment (Vendor Portal parity) ──────────────────
        # In the VP: debit notes marked "Paid" = allocation_status=Utilized OR
        # the debit note number appears in a PendingTransaction.reference_number.
        # We compute this per-voucher-number here so the frontend receives it ready.
        debit_note_status_map = {}  # voucher_number -> {due_status, allocation_status}
        if voucher_ids:
            try:
                from accounting.models import PendingTransaction as PT  # pyre-fixme
                dn_voucher_nos = list(
                    queryset.filter(  # pyre-ignore
                        voucher_type__icontains='debit'
                    ).values_list('voucher_number', flat=True).distinct()
                )
                if dn_voucher_nos:
                    # Check JournalEntry allocation_status for each debit note number
                    dn_entries = self.get_queryset().filter(  # pyre-ignore
                        voucher_number__in=dn_voucher_nos
                    ).values('voucher_number', 'allocation_status').distinct()
                    for de in dn_entries:
                        vno = de['voucher_number']
                        alloc_st = de.get('allocation_status') or 'Unutilized'
                        if alloc_st == 'Utilized':
                            debit_note_status_map[vno] = {'due_status': 'Paid', 'allocation_status': alloc_st}
                        elif alloc_st == 'Partially Utilized':
                            debit_note_status_map[vno] = {'due_status': 'Partially Paid', 'allocation_status': alloc_st}
                    # Also check PendingTransaction: if ref_number points here, it's been utilized
                    utilized_by_pending = PT.objects.filter(  # pyre-ignore
                        tenant_id=tenant_id, reference_number__in=dn_voucher_nos
                    ).values_list('reference_number', flat=True).distinct()
                    for ref in utilized_by_pending:
                        if ref not in debit_note_status_map:
                            debit_note_status_map[ref] = {'due_status': 'Paid', 'allocation_status': 'Utilized'}
            except Exception:
                pass

        # ── VendorTransaction status map (single source of truth for VP parity) ───
        # Fetch due_status directly from vendor_transaction table (same data VP shows)
        vendor_txn_status_map = {}  # voucher_number -> due_status
        if resolved_ledger:
            try:
                from vendors.models import VendorMasterBasicDetail, VendorTransaction as VT  # pyre-fixme
                lv = VendorMasterBasicDetail.objects.filter(
                    ledger=resolved_ledger, tenant_id=tenant_id
                ).first()
                if lv:
                    vt_rows = VT.objects.filter(  # pyre-ignore
                        tenant_id=tenant_id, vendor_id=lv.id
                    ).values('transaction_number', 'status', 'transaction_type',
                             'total_amount', 'reference_number', 'is_advance')
                    from datetime import date as dt_date, timedelta
                    cp_days = credit_period
                    for vtr in vt_rows:
                        vno = vtr['transaction_number']
                        vtype = (vtr.get('transaction_type') or '').lower()
                        vstatus = (vtr.get('status') or '').lower()
                        # For purchase: compute paid_sum same as VP by_vendor
                        if vtype == 'purchase':
                            ref_no = vtr.get('reference_number')
                            total_amt = float(vtr.get('total_amount') or 0)
                            paid_sum = 0.0
                            if ref_no:
                                linking = VT.objects.filter(  # pyre-ignore
                                    tenant_id=tenant_id, vendor_id=lv.id,
                                    reference_number=ref_no
                                ).exclude(transaction_number=vno)
                                for ltx in linking:
                                    lt = (ltx.transaction_type or '').lower()
                                    if lt in ['payment', 'debit_note']:
                                        paid_sum += float(ltx.total_amount or ltx.amount or 0)
                            status_val = None
                            if total_amt > 0 and paid_sum >= total_amt:
                                status_val = 'Paid'
                            elif paid_sum > 0:
                                status_val = 'Partially Paid'
                            # else: aging logic — frontend handles via isExpired
                            if status_val:
                                vendor_txn_status_map[vno] = status_val
                                if ref_no and ref_no.upper() not in ('ADVANCE', ''):
                                    vendor_txn_status_map[ref_no] = status_val
                        elif vtype == 'debit_note':
                            ref_no = vtr.get('reference_number')
                            if ref_no:
                                usage = VT.objects.filter(  # pyre-ignore
                                    tenant_id=tenant_id, vendor_id=lv.id,
                                    reference_number=ref_no,
                                    transaction_type__iexact='purchase'
                                ).exists()
                                if usage:
                                    vendor_txn_status_map[vno] = 'Paid'
                                    vendor_txn_status_map[ref_no] = 'Paid'
                        elif vtype in ['payment', 'receipt']:
                            # Compute utilization SAME way as VP by_vendor API:
                            # look for VendorTransaction rows whose notes say
                            # "Allocated from <transaction_number>"
                            from django.db.models import Sum as VTSum  # pyre-fixme
                            used_sum = VT.objects.filter(  # pyre-ignore
                                tenant_id=tenant_id,
                                vendor_id=lv.id,
                                notes__icontains=f"Allocated from {vno}"
                            ).aggregate(s=VTSum('total_amount'))['s'] or 0
                            used_sum = float(used_sum)
                            total_amt = float(vtr.get('total_amount') or 0)
                            if total_amt > 0 and used_sum >= total_amt:
                                pmt_status_val = 'Utilized'
                            elif used_sum > 0:
                                pmt_status_val = 'Partially Utilized'
                            else:
                                pmt_status_val = 'Unutilized'
                            # Key by BOTH transaction_number and reference_number so
                            # the ledger lookup by voucher_number or reference_number both hit
                            vendor_txn_status_map[vno] = pmt_status_val
                            ref_no = vtr.get('reference_number') or ''
                            if ref_no and ref_no.upper() not in ('ADVANCE', ''):
                                vendor_txn_status_map[ref_no] = pmt_status_val
            except Exception:
                pass

        # ── CustomerTransaction status map — DIRECT READ from CustomerTransaction.payment_status ──
        # CustomerTransaction.payment_status is already set to the exact value the Customer Portal
        # displays (Due, Not Due, Received, Partially Received, Open, Advance Applied, Utilized…).
        # No need to recompute — just read it directly and map by transaction_number.
        customer_txn_status_map = {}  # voucher_number -> due_status
        if resolved_ledger:
            try:
                from customerportal.models import CustomerMasterCustomerBasicDetails, CustomerTransaction as CT  # pyre-fixme

                lc = CustomerMasterCustomerBasicDetails.objects.filter(
                    ledger=resolved_ledger, tenant_id=tenant_id
                ).first()

                if lc:
                    ct_rows = CT.objects.filter(  # pyre-ignore
                        tenant_id=tenant_id, customer_id=lc.id
                    ).values('transaction_number', 'payment_status')

                    for ctr in ct_rows:
                        vno = ctr.get('transaction_number')
                        pstatus = (ctr.get('payment_status') or '').strip()
                        if vno and pstatus:
                            customer_txn_status_map[vno] = pstatus

            except Exception:
                pass


        for e in queryset:
            dr = float(e.debit)
            cr = float(e.credit)

            # Determine particulars: find the OTHER ledger(s) in this voucher
            vid = e.voucher_id
            own_lid = e.ledger_id
            own_lname = e.ledger.name if e.ledger else (e.ledger_name or 'N/A')
            counterparts = counterpart_map.get(vid, [])
            opposite_names = []
            for lid, lname in counterparts:
                if lid is not None and own_lid is not None:
                    if lid != own_lid:
                        opposite_names.append(lname)
                else:
                    if lname != own_lname:
                        opposite_names.append(lname)
            # Remove duplicates while preserving order
            seen = set()
            unique_opposites = []
            for n in opposite_names:
                if n not in seen:
                    seen.add(n)
                    unique_opposites.append(n)

            particulars = ', '.join(unique_opposites) if unique_opposites else (
                e.ledger.name if e.ledger else e.ledger_name or 'N/A'
            )

            # Running balance: Dr increases balance, Cr decreases it
            running_balance += dr - cr

            # Balance type label
            if running_balance > 0:
                balance_type = 'Dr'
            elif running_balance < 0:
                balance_type = 'Cr'
            else:
                balance_type = ''

            # Look up enrichment data for this voucher
            vmeta = voucher_meta_map.get(vid, {})
            ref_id = vmeta.get('reference_id')
            vsource = vmeta.get('source', '')
            vno = e.voucher_number or ''

            # Purchase payment enrichment (keyed by voucher_number)
            pv_data = purchase_payment_map.get(vno, {})
            # Payment/Receipt advance enrichment (keyed by voucher_number)
            pmt_data = payment_advance_map.get(vno, {})
            # Debit Note status enrichment (keyed by voucher_number)
            dn_data = debit_note_status_map.get(vno, {})
            # Vendor transaction exact match status — try both voucher_number and reference_number
            e_ref = getattr(e, 'reference_number', '') or ''
            vt_status = vendor_txn_status_map.get(vno) or vendor_txn_status_map.get(e_ref) or None
            # Customer transaction exact match status
            ct_status = customer_txn_status_map.get(vno) or customer_txn_status_map.get(e_ref) or None

            row = {
                'id': e.id,
                'transaction_date': e.transaction_date,
                'date': e.transaction_date,
                'particulars': particulars,
                'voucher_type': e.voucher_type,
                'voucherType': e.voucher_type,
                'voucher_number': e.voucher_number,
                'voucherNo': e.voucher_number,
                'debit': dr,
                'credit': cr,
                'balance': abs(running_balance),
                'balance_type': balance_type,
                'voucher_id': e.voucher_id,
                'reference_number': getattr(e, 'reference_number', None),
                'referenceNo': getattr(e, 'reference_number', None),
                'allocation_status': dn_data.get('allocation_status') or getattr(e, 'allocation_status', 'Unutilized'),
                'allocationStatus': dn_data.get('allocation_status') or getattr(e, 'allocation_status', 'Unutilized'),
                # Enriched fields from generic Voucher table
                'source': vsource,
                'reference_id': ref_id,
                'voucher_pk': vmeta.get('voucher_pk'),
                # ── Purchase/Debit Note/Customer payment status enrichment (for Portal parity) ──
                'due_status': ct_status or vt_status or pv_data.get('due_status') or dn_data.get('due_status') or '',
                'paid_amount': pv_data.get('paid_amount', pmt_data.get('paid_amount', 0)),
                'total_amount': pv_data.get('total_amount', pmt_data.get('total_amount', 0)),
                # ── Payment/Receipt advance enrichment ──
                'is_advance': pmt_data.get('is_advance', False),
                'reference_type': pmt_data.get('reference_type', ''),
                'ledger_credit_period': credit_period,
            }

            # Attach full legs to power the journal breakdown UI
            row['full_legs'] = full_legs_map.get(vid, [])

            # For GST/TDS ledgers, embed the component breakdown
            if is_gst_ledger or is_tds_ledger:
                components = supplementary_detail_map.get(vid, [])
                if components:
                    if is_gst_ledger:
                        row['gst_components'] = components
                    elif is_tds_ledger:
                        row['tds_components'] = components
                        
                    # Build a readable particulars string showing breakdown
                    comp_str = ', '.join(
                        f"{c['component']}: ₹{c['debit'] or c['credit']:.2f}"
                        for c in components
                    )
                    row['particulars'] = f"{particulars} | {comp_str}"

            data.append(row)

        return Response(data)



class PayFromLedgerView(APIView):
    """
    Returns only ledgers eligible for 'Pay From' in Payment Vouchers.
    Filters:
    - Assets: Cash and bank balances, Cash and cash equivalents
    - Liabilities: Short term borrowings, Loans
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant_id = getattr(request.user, 'tenant_id', None)
        
        if not tenant_id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Branch context missing. Please log in again.")
            
        from django.db.models import Q
        
        try:
            # Query directly from MasterLedger filtering by group and category
            # Assets -> Cash, Bank, OD, CC
            # Liabilities -> Borrowing, Loan
            ledgers = MasterLedger.objects.filter( # pyre-ignore
                tenant_id=tenant_id
            ).filter( # pyre-ignore
                Q(category__icontains='Asset') & Q(group__icontains='Cash') |
                Q(category__icontains='Asset') & Q(group__icontains='Bank') |
                Q(category__icontains='Asset') & Q(group__icontains='OD') |
                Q(category__icontains='Asset') & Q(group__icontains='CC') |
                Q(category__icontains='Liability') & Q(group__icontains='Borrowing') |
                Q(category__icontains='Liability') & Q(group__icontains='Loan') |
                # Fallbacks in case category is not properly set
                Q(group__icontains='Cash') | 
                Q(group__icontains='Bank') |
                Q(group__icontains='Borrowing') |
                Q(group__icontains='Loan')
            ).distinct().values('id', 'name') # pyre-ignore
            
            return Response(list(ledgers))
        except Exception as e:
            return Response({"error": f"Failed to fetch ledgers: {str(e)}"}, status=500)

class PayToLedgerView(APIView):
    """
    Returns a unified list of possible 'Pay To' targets:
    - Vendors (resolved via vendor table)
    - Customers (resolved via customer table)
    - All other Ledgers (direct)
    
    Each item contains {id, name, type} where id is the entity PK.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant_id = getattr(request.user, 'tenant_id', None)

        if not tenant_id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Branch context missing.")

        # Map to store our final results by ledger_id to ensure deduplication
        results_map = {}

        # 1. Fetch Vendors with associated ledgers
        vendors = Vendor.objects.filter( # pyre-ignore
            tenant_id=tenant_id, 
            ledger_id__isnull=False
        ).values('id', 'vendor_name', 'ledger_id', 'vendor_category') # pyre-ignore
        
        for v in vendors:
            lid = v['ledger_id']
            results_map[lid] = {
                "id": v['id'],
                "name": v['vendor_name'],
                "type": "vendor",
                "ledger_id": lid,
                "category": v['vendor_category'] or "General"
            }

        # 2. Fetch Customers with associated ledgers
        customers = Customer.objects.filter( # pyre-ignore
            tenant_id=tenant_id, 
            ledger_id__isnull=False
        ).select_related('customer_category').values( # pyre-ignore
            'id', 'customer_name', 'ledger_id', 'customer_category__category'
        )
        
        for c in customers:
            lid = c['ledger_id']
            # Only add if not already in (Vendor takes precedence if ledger is shared)
            if lid not in results_map:
                results_map[lid] = {
                    "id": c['id'],
                    "name": c['customer_name'],
                    "type": "customer",
                    "ledger_id": lid,
                    "category": c['customer_category__category'] or "General"
                }

        def _norm(v):
            return (v or '').strip().lower()

        # 3. Fetch all other Ledgers
        # Exclude structural "subgroup nodes" that were accidentally saved as ledgers
        # (e.g., name == sub_group_2). These should never appear in Pay To / Receive From dropdowns.
        ledgers = MasterLedger.objects.filter(tenant_id=tenant_id).values( # pyre-ignore
            'id', 'name', 'category', 'group', 'sub_group_1', 'sub_group_2', 'sub_group_3'
        )
        for l in ledgers:
            lid = l['id']
            if lid not in results_map:
                n = _norm(l.get('name'))
                if not n:
                    continue
                if n and (
                    n == _norm(l.get('sub_group_1')) or
                    n == _norm(l.get('sub_group_2')) or
                    n == _norm(l.get('sub_group_3')) or
                    n == _norm(l.get('group'))
                ):
                    continue
                results_map[lid] = {
                    "id": lid,
                    "name": l['name'],
                    "type": "ledger",
                    "ledger_id": lid,
                    "category": l['category'] or "Other"
                }

        # Convert map to list and return
        return Response(list(results_map.values())) # pyre-ignore

class QuestionsBySubgroupView(APIView):
    """
    Dummy view returning empty questions since Question model was deprecated/removed.
    Returns format expected by DynamicQuestions.tsx and LedgerQuestions.tsx.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"questions": []})
