"""
API endpoints for Vendor management.
This module handles all API operations for vendors.
"""

from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import IntegrityError, transaction

from .models import Vendor
from .vendor_serializers import (
    VendorSerializer,
    VendorCreateSerializer,
    VendorUpdateSerializer,
    VendorListSerializer,
    VendorSummarySerializer,
    VendorBalanceSerializer,
    VendorStatisticsSerializer
)
from .vendorbasicdetail_database import VendorBasicDetailDatabase
from .models import (
    VendorMasterBasicDetail, 
    VendorMasterGSTDetails,
    VendorMasterTDS,
    VendorMasterBanking,
    VendorMasterTerms,
    VendorMasterProductService
)
from .vendor_database import VendorDatabase
from accounting.models_voucher_payment import PaymentVoucherItem
from accounting.serializers import PaymentVoucherItemSerializer


class VendorViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Vendor management.
    
    Provides CRUD operations for vendors with tenant isolation.
    """
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer
    permission_classes = [IsAuthenticated]
    
    def get_tenant_id(self):
        """Extract tenant_id from authenticated user"""
        user = self.request.user
        if hasattr(user, 'tenant_id'):
            return user.tenant_id
        elif hasattr(user, 'tenant') and hasattr(user.tenant, 'tenant_id'):
            return user.tenant.tenant_id
        else:
            # Fallback for development/testing
            return getattr(user, 'id', 'default_tenant')
    
    def get_username(self):
        """Get username from request"""
        return self.request.user.username if hasattr(self.request.user, 'username') else None
    
    def get_queryset(self):
        """Filter queryset by tenant and apply filters"""
        tenant_id = self.get_tenant_id()
        
        # Get query parameters
        is_active = self.request.query_params.get('is_active')
        vendor_type = self.request.query_params.get('vendor_type')
        category_id = self.request.query_params.get('category_id')
        is_verified = self.request.query_params.get('is_verified')
        search = self.request.query_params.get('search')
        
        # Build filters
        filters = {}
        if vendor_type:
            filters['vendor_type'] = vendor_type
        if category_id:
            filters['category_id'] = category_id
        if is_verified is not None:
            filters['is_verified'] = is_verified.lower() == 'true'
        
        # Handle is_active filter
        active_filter = None if is_active is None else (is_active.lower() == 'true')
        
        # Search or filter
        if search:
            return VendorDatabase.search_vendors(tenant_id, search)
        else:
            return VendorDatabase.get_vendors_by_tenant(tenant_id, active_filter, filters)
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'create':
            return VendorCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return VendorUpdateSerializer
        elif self.action == 'list':
            # Check if summary is requested
            if self.request.query_params.get('summary') == 'true':
                return VendorSummarySerializer
            return VendorListSerializer
        return VendorSerializer
    
    def create(self, request, *args, **kwargs):
        """
        Create a new vendor.
        
        Expected payload:
        {
            "vendor_name": "ABC Suppliers",
            "vendor_code": "VEN00001",  // Optional, auto-generated if not provided
            "vendor_type": "supplier",
            "email": "contact@abc.com",
            "phone": "1234567890",
            ...
        }
        """
        tenant_id = self.get_tenant_id()
        username = self.get_username()
        serializer = self.get_serializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check for duplicate vendor code if provided
        vendor_code = serializer.validated_data.get('vendor_code')
        if vendor_code and VendorDatabase.check_duplicate_vendor_code(tenant_id, vendor_code):
            return Response(
                {'error': f'Vendor code "{vendor_code}" already exists'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check for duplicate email
        email = serializer.validated_data.get('email')
        if email and VendorDatabase.check_duplicate_email(tenant_id, email):
            return Response(
                {'error': f'Email "{email}" is already registered'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Prepare data
            vendor_data = serializer.validated_data.copy()
            
            # Handle category
            if 'category' in vendor_data:
                category = vendor_data.pop('category')
                vendor_data['category_id'] = category.id if category else None
            
            vendor = VendorDatabase.create_vendor(
                tenant_id=tenant_id,
                vendor_data=vendor_data,
                created_by=username
            )
            
            response_serializer = VendorSerializer(vendor)
            return Response(
                response_serializer.data,
                status=status.HTTP_201_CREATED
            )
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except IntegrityError as e:
            return Response(
                {'error': 'Database integrity error', 'details': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def update(self, request, *args, **kwargs):
        """Update an existing vendor"""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        username = self.get_username()
        
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check for duplicate email (excluding current vendor)
        email = serializer.validated_data.get('email', instance.email)
        if email and VendorDatabase.check_duplicate_email(
            instance.tenant_id, email, exclude_id=instance.id
        ):
            return Response(
                {'error': f'Email "{email}" is already registered'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            update_data = serializer.validated_data.copy()
            
            # Handle category
            if 'category' in update_data:
                category = update_data.pop('category')
                update_data['category_id'] = category.id if category else None
            
            updated_vendor = VendorDatabase.update_vendor(
                instance.id,
                update_data,
                updated_by=username
            )
            
            if updated_vendor:
                response_serializer = VendorSerializer(updated_vendor)
                return Response(response_serializer.data)
            else:
                return Response(
                    {'error': 'Vendor not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def destroy(self, request, *args, **kwargs):
        """Soft delete a vendor"""
        instance = self.get_object()
        success = VendorDatabase.delete_vendor(instance.id, soft_delete=True)
        
        if success:
            return Response(
                {'message': 'Vendor deactivated successfully'},
                status=status.HTTP_204_NO_CONTENT
            )
        else:
            return Response(
                {'error': 'Vendor not found'},
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=True, methods=['post'])
    def update_balance(self, request, pk=None):
        """
        Update vendor balance.
        
        POST /api/vendors/{id}/update_balance/
        {
            "amount": 1000.00,
            "operation": "add"  // or "subtract"
        }
        """
        vendor = self.get_object()
        serializer = VendorBalanceSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )
        
        amount = serializer.validated_data['amount']
        operation = serializer.validated_data['operation']
        
        try:
            updated_vendor = VendorDatabase.update_vendor_balance(
                vendor.id,
                amount,
                operation
            )
            
            if updated_vendor:
                response_serializer = VendorSerializer(updated_vendor)
                return Response(response_serializer.data)
            else:
                return Response(
                    {'error': 'Failed to update balance'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """
        Get vendor statistics for the tenant.
        
        GET /api/vendors/statistics/
        """
        tenant_id = self.get_tenant_id()
        stats = VendorDatabase.get_vendor_statistics(tenant_id)
        serializer = VendorStatisticsSerializer(stats)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def by_category(self, request):
        """
        Get vendors filtered by category.
        
        GET /api/vendors/by_category/?category_id={id}
        """
        category_id = request.query_params.get('category_id')
        if not category_id:
            return Response(
                {'error': 'category_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        tenant_id = self.get_tenant_id()
        vendors = VendorDatabase.get_vendors_by_category(tenant_id, category_id)
        
        serializer = VendorListSerializer(vendors, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def outstanding(self, request):
        """
        Get vendors with outstanding balance.
        
        GET /api/vendors/outstanding/?min_balance=1000
        """
        min_balance = request.query_params.get('min_balance', 0)
        try:
            min_balance = float(min_balance)
        except ValueError:
            min_balance = 0
        
        tenant_id = self.get_tenant_id()
        vendors = VendorDatabase.get_vendors_with_outstanding_balance(
            tenant_id,
            min_balance
        )
        
        serializer = VendorListSerializer(vendors, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        """
        Verify a vendor.
        
        POST /api/vendors/{id}/verify/
        """
        vendor = self.get_object()
        username = self.get_username()
        
        updated_vendor = VendorDatabase.update_vendor(
            vendor.id,
            {'is_verified': True},
            updated_by=username
        )
        
        if updated_vendor:
            response_serializer = VendorSerializer(updated_vendor)
            return Response(response_serializer.data)
        else:
            return Response(
                {'error': 'Failed to verify vendor'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """
        Activate a vendor.
        
        POST /api/vendors/{id}/activate/
        """
        vendor = self.get_object()
        username = self.get_username()
        
        updated_vendor = VendorDatabase.update_vendor(
            vendor.id,
            {'is_active': True},
            updated_by=username
        )
        
        if updated_vendor:
            response_serializer = VendorSerializer(updated_vendor)
            return Response(response_serializer.data)
        else:
            return Response(
                {'error': 'Failed to activate vendor'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """
        Deactivate a vendor.
        
        POST /api/vendors/{id}/deactivate/
        """
        vendor = self.get_object()
        username = self.get_username()
        
        updated_vendor = VendorDatabase.update_vendor(
            vendor.id,
            {'is_active': False},
            updated_by=username
        )
        
        if updated_vendor:
            response_serializer = VendorSerializer(updated_vendor)
            return Response(response_serializer.data)
        else:
            return Response(
                {'error': 'Failed to deactivate vendor'},
                status=status.HTTP_400_BAD_REQUEST
            )


    @action(detail=False, methods=['post'], url_path='validate-from-invoice')
    def validate_from_invoice(self, request):
        """
        Validate whether the Vendor exists in Vendor Master based on invoice data.
        """
        tenant_id = self.get_tenant_id()
        vendor_name = request.data.get('vendor_name', '').strip()
        gstin = request.data.get('gstin', '')
        if gstin:
            gstin = gstin.strip()
        state = request.data.get('state', '').strip()

        # Step 1: Match by GSTIN (STRICT ORDER)
        if gstin:
            vendor = Vendor.objects.filter(tenant_id=tenant_id, gstin__iexact=gstin).first()
            if vendor:
                # GSTIN matches but name differs
                if vendor.vendor_name.lower() != vendor_name.lower():
                    return Response({
                        "status": "GSTIN_CONFLICT",
                        "message": "GSTIN exists but name differs. Manual verification required."
                    })
                return Response({
                    "status": "FOUND",
                    "matched_by": "GSTIN",
                    "vendor_id": vendor.id,
                    "vendor_name": vendor.vendor_name
                })

        # Step 2: Match by exact vendor name and state
        if vendor_name and state:
            vendor = Vendor.objects.filter(
                tenant_id=tenant_id,
                vendor_name__iexact=vendor_name,
                billing_state__iexact=state
            ).first()
            if vendor:
                return Response({
                    "status": "FOUND",
                    "matched_by": "NAME_STATE",
                    "vendor_id": vendor.id,
                    "vendor_name": vendor.vendor_name
                })

        # Step 3: No Match
        return Response({"status": "NOT_FOUND"})

    @action(detail=False, methods=['post'], url_path='create-from-invoice')
    def create_from_invoice(self, request):
        """
        Create a new Vendor from invoice extraction.
        """
        tenant_id = self.get_tenant_id()
        username = self.get_username()
        
        vendor_name = request.data.get('vendor_name', '').strip()
        gstin = request.data.get('gstin', '')
        if gstin:
            gstin = gstin.strip()
        address = request.data.get('address', '').strip()
        state = request.data.get('state', '').strip()
        
        # Check uniqueness of GSTIN
        if gstin:
            exists = Vendor.objects.filter(tenant_id=tenant_id, gstin__iexact=gstin).exists()
            if exists:
                return Response({
                    "error": "GSTIN already exists."
                }, status=status.HTTP_400_BAD_REQUEST)
                
        vendor_data = {
            "vendor_name": vendor_name,
            "gstin": gstin if gstin else None,
            "billing_address_line1": address,
            "billing_state": state,
            "notes": "Created from Invoice Upload",
            "vendor_type": "supplier",
            "is_active": True
        }
        
        try:
            vendor = VendorDatabase.create_vendor(
                tenant_id=tenant_id,
                vendor_data=vendor_data,
                created_by=username
            )
            return Response({
                "status": "CREATED",
                "vendor_id": vendor.id
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

class PurchaseVendorCreateView(APIView):
    """
    Create a new Vendor specifically for Purchase invoices.
    """
    permission_classes = [IsAuthenticated]

    def get_tenant_id(self):
        user = self.request.user
        if hasattr(user, 'tenant_id') and user.tenant_id:
            return user.tenant_id
        elif hasattr(user, 'tenant') and hasattr(user.tenant, 'tenant_id'):
            return user.tenant.tenant_id
        return None
            
    def get_username(self):
        user = self.request.user
        return getattr(user, 'username', 'system')

    def post(self, request, *args, **kwargs):
        tenant_id = self.get_tenant_id()
        username = self.get_username()
        
        vendor_name = request.data.get('vendor_name', '').strip()
        gstin = request.data.get('gstin', '')
        if gstin:
            gstin = gstin.strip().upper()
        branch = request.data.get('branch', '').strip()
        address = request.data.get('address', '').strip()
        state = request.data.get('state', '').strip()
        supplier_items = request.data.get('supplier_items', [])
        
        # Step 1: Pre-creation Validation (Branch-based rules)
        from .vendor_validation_logic import validate_vendor
        val_result = validate_vendor(
            tenant_id=tenant_id,
            vendor_name=vendor_name,
            gstin=gstin,
            branch=branch
        )

        if val_result['status'] == 'FOUND':
            # Rule 1: Exact Duplicate (Name + GSTIN + Branch match)
            # We treat this as "CREATED" to maintain idempotency in the creation flow
            return Response({
                "status": "CREATED",
                "vendor_id": val_result['vendor_id'],
                "message": val_result['message']
            }, status=status.HTTP_200_OK)
            
        elif val_result['status'] == 'GSTIN_CONFLICT':
            # Rule 4: GSTIN matches but Name is different
            return Response({
                "status": "VALIDATION_WARNING",
                "message": val_result['message'],
                "vendor_id": val_result['vendor_id']
            }, status=status.HTTP_400_BAD_REQUEST)

        # Rule 2 & 3: Allowed to continue (val_result['status'] == 'NOT_FOUND')
        
        # Cleanup orphaned GST records for this GSTIN if any (to prevent UNIQUE constraints failure if we create a new link)
        if gstin:
            VendorMasterGSTDetails.objects.filter(
                tenant_id=tenant_id, 
                gstin__iexact=gstin, 
                vendor_basic_detail__isnull=True
            ).delete()
                
        # Vendor Master Basic Detail requires some mandatory fields (email/phone)
        # If not provided, we add placeholder values.
        tenant_prefix = str(tenant_id)[:5] if tenant_id else "unknown"
        vendor_data = {
            "vendor_name": vendor_name,
            "pan_no": gstin[2:12] if gstin and len(gstin) >= 15 else None,
            "email": f"pending_{tenant_prefix}@example.com",
            "contact_no": "+910000000000",
            "vendor_category": "Supplier",
        }
        
        try:
            with transaction.atomic():
                vendor = VendorBasicDetailDatabase.create_vendor_basic_detail(
                    tenant_id=tenant_id,
                    vendor_data=vendor_data,
                    created_by=username
                )
                
                # Use the tenant_id that was actually used for the vendor
                effective_tenant_id = vendor.tenant_id
                
                # If a GSTIN was found, also create the GST Details record attached to it.
                if gstin:
                    VendorMasterGSTDetails.objects.create(
                        tenant_id=effective_tenant_id,
                        vendor_basic_detail=vendor,
                        gstin=gstin,
                        legal_name=vendor_name,
                        gst_state=state,
                        reference_name=branch if branch else "Main Branch",
                        branch_address=address
                    )

                # Generate default workflow records to complete Vendor Portal table instantiation
                # 1. TDS & Statutory
                VendorMasterTDS.objects.create(
                    tenant_id=effective_tenant_id,
                    vendor_basic_detail=vendor,
                    created_by=username
                )
                
                # 2. Banking Info
                VendorMasterBanking.objects.create(
                    tenant_id=effective_tenant_id,
                    vendor_basic_detail=vendor,
                    bank_account_no="",
                    bank_name="",
                    ifsc_code="",
                    created_by=username
                )
                
                # 3. Terms & Conditions
                VendorMasterTerms.objects.create(
                    tenant_id=effective_tenant_id,
                    vendor_basic_detail=vendor,
                    delivery_terms="",
                    warranty_guarantee_details="",
                    force_majeure="",
                    dispute_redressal_terms="",
                    created_by=username
                )

                # 4. Product Services (Supplier Items)
                # Filter out items that are completely empty
                valid_items = []
                if supplier_items:
                    for item in supplier_items:
                        s_name = item.get("supplierItemName", "").strip()
                        s_code = item.get("supplierItemCode", "").strip()
                        hsn = item.get("hsnSacCode", item.get("hsnSac", "")).strip()
                        
                        # At least name or code should exist
                        if s_name or s_code:
                            valid_items.append({
                                "hsn_sac_code": hsn,
                                "item_code": "", # Internal item code mapping can happen later
                                "item_name": "", 
                                "supplier_item_code": s_code,
                                "supplier_item_name": s_name
                            })
                
                VendorMasterProductService.objects.create(
                    tenant_id=effective_tenant_id,
                    vendor_basic_detail=vendor,
                    items=valid_items,
                    created_by=username
                )

                return Response({
                    "status": "CREATED",
                    "vendor_id": vendor.id
                }, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

class PurchaseVendorValidateView(APIView):
    """
    Validates whether the Vendor exists in Vendor Master for Purchase.
    Matches specifically against Sundry Creditors / Accounts Payable.
    """
    permission_classes = [IsAuthenticated]

    def get_tenant_id(self):
        user = self.request.user
        if hasattr(user, 'tenant_id'):
            return user.tenant_id
        elif hasattr(user, 'tenant') and hasattr(user.tenant, 'tenant_id'):
            return user.tenant.tenant_id
        else:
            return getattr(user, 'id', 'default_tenant')

    def post(self, request, *args, **kwargs):
        from .vendor_validation_logic import validate_vendor
        print("Purchase Vendor Validation API Hit") # As requested
        tenant_id = self.get_tenant_id()
        
        vendor_name = request.data.get('vendor_name', '')
        gstin = request.data.get('gstin', '')
        branch = request.data.get('branch', '')
        state = request.data.get('state', '')
        address = request.data.get('address', '')
        
        print(f"Received payload - Name: {vendor_name}, GSTIN: {gstin}, Branch: {branch}, Address: {address}")
        
        result = validate_vendor(
            tenant_id=tenant_id,
            vendor_name=vendor_name,
            gstin=gstin,
            branch=branch,
            address=address,
            state=state
        )
        
        if result['status'] == 'FOUND':
            print(f"Found vendor by {result['matched_by']} match: {result['vendor_name']}")
        elif result['status'] == 'GSTIN_CONFLICT':
            print(f"GSTIN {gstin} found but name mismatch: {result['message']}")
        else:
            print(f"No match found for Vendor: {vendor_name}, GSTIN: {gstin}")
            
        return Response(result)


class PurchaseVendorResolveConflictView(APIView):
    """
    Handles resolution of GSTIN_CONFLICT in Bulk Scan.
    Options: 
      - use_existing: Confirm the extraction is correct and use master info.
      - update_name: Update the Vendor Master Basic Detail name to match the invoice extraction.
    """
    permission_classes = [IsAuthenticated]

    def get_tenant_id(self):
        user = self.request.user
        if hasattr(user, 'tenant_id'):
            return user.tenant_id
        elif hasattr(user, 'tenant') and hasattr(user.tenant, 'tenant_id'):
            return user.tenant.tenant_id
        return getattr(user, 'id', 'default_tenant')

    def post(self, request, *args, **kwargs):
        from .models import VendorMasterBasicDetail, VendorMasterGSTDetails
        tenant_id = self.get_tenant_id()
        file_hash = request.data.get('file_hash')
        resolution = request.data.get('resolution') # 'use_existing' or 'update_name'
        
        if not file_hash or resolution not in ['use_existing', 'update_name']:
            return Response({'error': 'Invalid request data'}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Get the staged invoice to know what name we have there
        from core.ocr_cache import get_cached_ocr, update_ocr_cache_validation_status
        staged = get_cached_ocr(file_hash, tenant_id)
        if not staged:
            return Response({'error': 'Staged invoice not found'}, status=status.HTTP_404_NOT_FOUND)

        extracted = staged.get('extracted_data', {})
        invoice_header = extracted.get('invoice', extracted.get('header', extracted))
        if isinstance(invoice_header, list) and invoice_header:
            invoice_header = invoice_header[0]

        invoice_name = invoice_header.get('Vendor Name') or invoice_header.get('vendor_name') or ''
        gstin = invoice_header.get('GSTIN') or invoice_header.get('vendor_gstin') or ''

        if not gstin:
            return Response({'error': 'No GSTIN found for resolution'}, status=status.HTTP_400_BAD_REQUEST)

        # 2. Find the master vendor causing conflict
        gst_record = VendorMasterGSTDetails.objects.filter(
            tenant_id=tenant_id, 
            gstin__iexact=gstin
        ).select_related('vendor_basic_detail').first()

        if not gst_record or not gst_record.vendor_basic_detail:
            return Response({'error': 'Conflict record not found in master'}, status=status.HTTP_404_NOT_FOUND)

        vendor = gst_record.vendor_basic_detail

        if resolution == 'update_name':
            # Update master name to match invoice
            vendor.vendor_name = invoice_name
            vendor.save()
            print(f"Vendor Resolve: Updated master vendor {vendor.id} name to {invoice_name}")
        else:
            # use_existing: Keep master as-is.
            print(f"Vendor Resolve: Using existing master vendor {vendor.id} ({vendor.vendor_name}) for {gstin}")

        # 3. Mark the staging record as FOUND now that it's resolved
        update_ocr_cache_validation_status(file_hash, tenant_id, 'FOUND')

        return Response({
            'success': True,
            'status': 'FOUND',
            'vendor_id': vendor.id,
            'vendor_name': vendor.vendor_name,
            'message': f"Resolved using vendor {vendor.vendor_name}"
        })
