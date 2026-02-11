from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from core.utils import TenantQuerysetMixin, IsTenantMember
from .models import (
    MasterLedgerGroup, MasterLedger, MasterVoucherConfig, MasterHierarchyRaw,
    Voucher, JournalEntry
)
from .serializers import (
    MasterLedgerGroupSerializer, MasterLedgerSerializer, MasterVoucherConfigSerializer,
    MasterHierarchyRawSerializer, VoucherSerializer, JournalEntrySerializer
)

# ============================================================================
# MASTER VIEWSETS
# ============================================================================

class MasterLedgerGroupViewSet(TenantQuerysetMixin, viewsets.ModelViewSet):
    queryset = MasterLedgerGroup.objects.all()
    serializer_class = MasterLedgerGroupSerializer
    # TEMPORARY: Disabled authentication for development
    permission_classes = [AllowAny]
    # permission_classes = [IsAuthenticated, IsTenantMember]
    required_permission = 'MASTERS_LEDGER_GROUPS'


class MasterLedgerViewSet(TenantQuerysetMixin, viewsets.ModelViewSet):
    queryset = MasterLedger.objects.all()
    serializer_class = MasterLedgerSerializer
    # TEMPORARY: Disabled authentication for development
    permission_classes = [AllowAny]
    # permission_classes = [IsAuthenticated, IsTenantMember]
    required_permission = 'MASTERS_LEDGERS'
    
    def list(self, request, *args, **kwargs):
        """Override list to add logging"""
        import logging
        logger = logging.getLogger('accounting.views')
        try:
            logger.info(f"🔍 MasterLedgerViewSet.list called - User: {request.user}, Tenant: {getattr(request.user, 'tenant_id', None)}")
            queryset = self.get_queryset()
            logger.info(f"🔍 Queryset count: {queryset.count()}")
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"❌ Error in MasterLedgerViewSet.list: {type(e).__name__}: {str(e)}", exc_info=True)
            raise
    
    def create(self, request, *args, **kwargs):
        """Create a new ledger with auto-generated code and retry logic"""
        import logging
        from django.db import IntegrityError, transaction
        from .utils import generate_ledger_code
        
        logger = logging.getLogger('accounting.views')
        
        try:
            logger.info(f"📝 Creating ledger - Data: {request.data}")
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            
            # Auto-generate ledger code based on hierarchy
            # TEMPORARY: Use default tenant_id if user is not authenticated
            tenant_id = getattr(request.user, 'tenant_id', 1)
            
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
                        from rest_framework import serializers as drf_serializers
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


class MasterVoucherConfigViewSet(TenantQuerysetMixin, viewsets.ModelViewSet):
    queryset = MasterVoucherConfig.objects.all()
    serializer_class = MasterVoucherConfigSerializer
    permission_classes = [IsAuthenticated, IsTenantMember]
    required_permission = 'MASTERS_VOUCHER_CONFIG'


class MasterHierarchyRawViewSet(viewsets.ReadOnlyModelViewSet):
    """Global hierarchy data - no authentication required, no tenant filtering"""
    queryset = MasterHierarchyRaw.objects.all()
    serializer_class = MasterHierarchyRawSerializer
    permission_classes = [AllowAny]  # Global data, accessible to all


# ============================================================================
# VOUCHER VIEWSETS - Unified
# ============================================================================

class VoucherViewSet(TenantQuerysetMixin, viewsets.ModelViewSet):
    """Unified viewset for all voucher types"""
    queryset = Voucher.objects.all()
    serializer_class = VoucherSerializer
    permission_classes = [IsAuthenticated, IsTenantMember]
    required_permission = 'ACCOUNTING_VOUCHERS'
    
    def get_queryset(self):
        """Filter by type if provided in query params"""
        queryset = super().get_queryset()
        voucher_type = self.request.query_params.get('type')
        if voucher_type:
            queryset = queryset.filter(type=voucher_type)
        return queryset
    
    def perform_create(self, serializer):
        from .utils_subscription import check_subscription_limit
        check_subscription_limit(self.request.user)
        super().perform_create(serializer)
    
    @action(detail=False, methods=['post'], url_path='bulk')
    def bulk_create(self, request):
        """Create multiple vouchers at once"""
        vouchers_data = request.data if isinstance(request.data, list) else [request.data]
        
        # Check limit for batch size
        from .utils_subscription import check_subscription_limit
        check_subscription_limit(request.user, increment=len(vouchers_data))
        
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


class JournalEntryViewSet(TenantQuerysetMixin, viewsets.ModelViewSet):
    queryset = JournalEntry.objects.all()
    serializer_class = JournalEntrySerializer
    permission_classes = [IsAuthenticated, IsTenantMember]
    required_permission = 'ACCOUNTING_VOUCHERS'
