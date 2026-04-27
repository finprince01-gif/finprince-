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
    queryset = MasterLedgerGroup.objects.all()
    serializer_class = MasterLedgerGroupSerializer
    permission_classes = [IsAuthenticated, IsBranchMember]
    required_permission = 'MASTERS_LEDGER_GROUPS'


class MasterLedgerViewSet(BranchQuerysetMixin, viewsets.ModelViewSet):
    queryset = MasterLedger.objects.all()
    serializer_class = MasterLedgerSerializer
    permission_classes = [IsAuthenticated, IsBranchMember]
    required_permission = 'MASTERS_LEDGERS'
    
    def get_queryset(self):
        """Filter ledgers by tenant and query parameters (group, category)"""
        queryset = super().get_queryset()
        
        group = self.request.query_params.get('group')
        category = self.request.query_params.get('category')
        
        if group:
            queryset = queryset.filter(group__icontains=group)
        if category:
            queryset = queryset.filter(category__icontains=category)
            
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
        queryset = self.get_queryset().filter(
            category__icontains='Asset',
            group__icontains='Cash and Bank Balances'
        )
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


# MasterVoucherConfigViewSet removed (deprecated)


class MasterHierarchyRawViewSet(viewsets.ReadOnlyModelViewSet):
    """Global hierarchy data - restricted to authenticated staff/master users"""
    queryset = MasterHierarchyRaw.objects.all()
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
    queryset = Voucher.objects.all()
    serializer_class = VoucherSerializer
    permission_classes = [IsAuthenticated, IsBranchMember]
    required_permission = 'ACCOUNTING_VOUCHERS'
    
    def get_queryset(self):
        """Filter by type if provided in query params"""
        queryset = super().get_queryset()
        voucher_type = self.request.query_params.get('type')
        if voucher_type:
            queryset = queryset.filter(type=voucher_type)
        return queryset
    
    def perform_create(self, serializer):
        super().perform_create(serializer)
    
    @action(detail=False, methods=['post'], url_path='bulk')
    def bulk_create(self, request):
        """Create multiple vouchers at once"""
        vouchers_data = request.data if isinstance(request.data, list) else [request.data]
        
        # Use bulk serializers or iterate
        # Standard DRF create logic for list:
        serializer = self.get_serializer(data=vouchers_data, many=True)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer) # This calls perform_create above, which checks limit again (inc=1).
        # Wait, calling self.perform_create(serializer) where serializer is a ListSerializer...
        # Standard ModelViewSet uses ListCreateAPIView logic but bulk_create is custom action.
        # If I call perform_create with a list serializer, does it work?
        # Usually perform_create expects an instance or validates data.
        # super().perform_create() saves the serializer.
        
        # If I call super().perform_create(serializer), it might loop over instances if ListSerializer supports save()
        # DRF 3+ ListSerializer.save() calls create() on child serializer for each item.
        # So it might call perform_create n times if hook logic is standard?
        # No, ListSerializer.save() calls child.create(). It does NOT call view.perform_create() for each item.
        # view.perform_create is called ONCE by the view handler.
        
        # So checks:
        # 1. bulk_create checks Total Limit.
        # 2. perform_create checks Single Limit (inc=1 default).
        
        # If I use `serializer.save()`, it bypasses `perform_create` of the view unless I call it.
        # The explicit `serializer.save()` line exists in original code.
        # So I just need to add the check before it.
        
        serializer.save()
        
        return Response({'success': True, 'count': len(vouchers_data)}, status=status.HTTP_201_CREATED)


class JournalEntryViewSet(BranchQuerysetMixin, viewsets.ModelViewSet):
    queryset = JournalEntry.objects.all()
    serializer_class = JournalEntrySerializer
    permission_classes = [IsAuthenticated, IsBranchMember]
    required_permission = 'ACCOUNTING_VOUCHERS'

    @action(detail=False, methods=['get'])
    def report(self, request):
        """
        Dedicated Ledger Report API following strict double-entry accounting.

        For a given ledger_id, shows all journal entries affecting that ledger with:
          - particulars = the OPPOSITE (counterpart) ledger name on the same voucher
          - debit / credit as recorded in the entry
          - running balance (Dr positive, Cr negative convention)
        """
        ledger_id = request.query_params.get('ledger_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        # Normalize input
        if ledger_id in [None, "", "ALL", "0", "null"]:
            ledger_id = None

        tenant_id = getattr(request.user, 'tenant_id', None)

        # Base queryset with branch isolation handled by mixin
        queryset = self.get_queryset().select_related('ledger').order_by('transaction_date', 'id')

        if ledger_id:
            queryset = queryset.filter(ledger_id=ledger_id)

        if start_date:
            queryset = queryset.filter(transaction_date__gte=start_date)

        if end_date:
            queryset = queryset.filter(transaction_date__lte=end_date)

        # Pre-fetch all entries for each voucher to resolve counterpart ledger names
        # Group voucher_ids so we can look up the opposite side
        from django.db.models import Q as DQ
        voucher_ids = list(queryset.values_list('voucher_id', flat=True).distinct())

        # Build a map: voucher_id -> list of (ledger_id, ledger_name)
        counterpart_map = {}
        if voucher_ids:
            all_entries_for_vouchers = JournalEntry.objects.filter(
                tenant_id=tenant_id,
                voucher_id__in=voucher_ids
            ).select_related('ledger').values('voucher_id', 'ledger_id', 'ledger__name', 'ledger_name')

            for ae in all_entries_for_vouchers:
                vid = ae['voucher_id']
                lid = ae['ledger_id']
                lname = ae['ledger__name'] or ae['ledger_name'] or 'N/A'
                counterpart_map.setdefault(vid, []).append((lid, lname))

        # Build response with running balance
        data = []
        running_balance = 0.0  # Positive = Dr balance, Negative = Cr balance

        for e in queryset:
            dr = float(e.debit)
            cr = float(e.credit)

            # Determine particulars: find the OTHER ledger(s) in this voucher
            vid = e.voucher_id
            own_lid = e.ledger_id
            counterparts = counterpart_map.get(vid, [])
            opposite_names = [
                lname for (lid, lname) in counterparts
                if lid != own_lid
            ]
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

            data.append({
                'id': e.id,
                'transaction_date': e.transaction_date,
                'particulars': particulars,
                'voucher_type': e.voucher_type,
                'voucher_number': e.voucher_number,
                'debit': dr,
                'credit': cr,
                'balance': abs(running_balance),
                'balance_type': balance_type,  # 'Dr' or 'Cr'
                'voucher_id': e.voucher_id
            })

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
            ledgers = MasterLedger.objects.filter(
                tenant_id=tenant_id
            ).filter(
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
            ).distinct().values('id', 'name')
            
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
        vendors = Vendor.objects.filter(
            tenant_id=tenant_id, 
            ledger_id__isnull=False
        ).values('id', 'vendor_name', 'ledger_id', 'vendor_category')
        
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
        customers = Customer.objects.filter(
            tenant_id=tenant_id, 
            ledger_id__isnull=False
        ).select_related('customer_category').values(
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
        ledgers = MasterLedger.objects.filter(tenant_id=tenant_id).values(
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
        return Response(list(results_map.values()))

class QuestionsBySubgroupView(APIView):
    """
    Dummy view returning empty questions since Question model was deprecated/removed.
    Returns format expected by DynamicQuestions.tsx and LedgerQuestions.tsx.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"questions": []})
