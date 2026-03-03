"""
API endpoints for Vendor management.
This module handles all API operations for vendors.
"""

from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import IntegrityError

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
    VendorMasterTerms
)


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
        if hasattr(user, 'tenant_id'):
            return user.tenant_id
        elif hasattr(user, 'tenant') and hasattr(user.tenant, 'tenant_id'):
            return user.tenant.tenant_id
        else:
            return getattr(user, 'id', 'default_tenant')
            
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
        
        # Check uniqueness of GSTIN
        if gstin:
            exists = VendorMasterGSTDetails.objects.filter(tenant_id=tenant_id, gstin__iexact=gstin).exists()
            if exists:
                return Response({
                    "error": "GSTIN already exists."
                }, status=status.HTTP_400_BAD_REQUEST)
                
        # Vendor Master Basic Detail requires some mandatory fields (email/phone)
        # If not provided, we add placeholder values.
        vendor_data = {
            "vendor_name": vendor_name,
            "pan_no": gstin[2:12] if gstin and len(gstin) >= 15 else None,
            "email": f"pending_{tenant_id[:5]}@example.com",
            "contact_no": "+910000000000",
            "vendor_category": "Supplier",
        }
        
        try:
            vendor = VendorBasicDetailDatabase.create_vendor_basic_detail(
                tenant_id=tenant_id,
                vendor_data=vendor_data,
                created_by=username
            )
            
            # If a GSTIN was found, also create the GST Details record attached to it.
            if gstin:
                VendorMasterGSTDetails.objects.create(
                    tenant_id=tenant_id,
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
                tenant_id=tenant_id,
                vendor_basic_detail=vendor,
                created_by=username
            )
            
            # 2. Banking Info
            VendorMasterBanking.objects.create(
                tenant_id=tenant_id,
                vendor_basic_detail=vendor,
                bank_account_no="",
                bank_name="",
                ifsc_code="",
                created_by=username
            )
            
            # 3. Terms & Conditions
            VendorMasterTerms.objects.create(
                tenant_id=tenant_id,
                vendor_basic_detail=vendor,
                delivery_terms="",
                warranty_guarantee_details="",
                force_majeure="",
                dispute_redressal_terms="",
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
        print("Purchase Vendor Validation API Hit") # As requested
        tenant_id = self.get_tenant_id()
        
        vendor_name = request.data.get('vendor_name', '')
        if vendor_name: vendor_name = vendor_name.strip()
        
        gstin = request.data.get('gstin', '')
        if gstin: gstin = gstin.strip().upper()  # Upper and trim
        
        # Branch, state and address
        branch = request.data.get('branch', '').strip()
        state = request.data.get('state', '').strip()
        address = request.data.get('address', '').strip()
        
        print(f"Received payload - Name: {vendor_name}, GSTIN: {gstin}, Branch: {branch}, Address: {address}")
        
        # Step 1: Match by GSTIN (STRICT ORDER)
        if gstin:
            # Try GSTIN + Branch first if branch provided
            gst_record = None
            if branch:
                gst_record = VendorMasterGSTDetails.objects.filter(
                    tenant_id=tenant_id,
                    gstin__iexact=gstin,
                    reference_name__iexact=branch
                ).select_related('vendor_basic_detail').first()
            
            # Then try GSTIN + Address if address provided
            if not gst_record and address:
                gst_record = VendorMasterGSTDetails.objects.filter(
                    tenant_id=tenant_id,
                    gstin__iexact=gstin,
                    branch_address__icontains=address
                ).select_related('vendor_basic_detail').first()
            
            # Fallback to GSTIN only
            if not gst_record:
                gst_record = VendorMasterGSTDetails.objects.filter(
                    tenant_id=tenant_id, 
                    gstin__iexact=gstin
                ).select_related('vendor_basic_detail').first()
            
            if gst_record and gst_record.vendor_basic_detail:
                vendor = gst_record.vendor_basic_detail
                # GSTIN exists but name differs -> Conflict
                if vendor.vendor_name.lower() != vendor_name.lower() and gst_record.legal_name.lower() != vendor_name.lower():
                    print(f"GSTIN {gstin} found but name mismatch: Master={vendor.vendor_name}, Invoice={vendor_name}")
                    return Response({
                        "status": "GSTIN_CONFLICT",
                        "message": "GSTIN exists but name differs. Manual verification required."
                    })
                
                print(f"Found vendor by GSTIN match: {vendor.vendor_name}")
                return Response({
                    "status": "FOUND",
                    "matched_by": "GSTIN",
                    "vendor_id": vendor.id,
                    "vendor_name": vendor.vendor_name,
                    "branch": gst_record.reference_name
                })
        
        # Step 2: Match by exact vendor name + Branch/Address
        if vendor_name:
            # Try Name + Branch
            if branch:
                gst_record = VendorMasterGSTDetails.objects.filter(
                    tenant_id=tenant_id,
                    vendor_basic_detail__vendor_name__iexact=vendor_name,
                    reference_name__iexact=branch
                ).select_related('vendor_basic_detail').first()
                if gst_record:
                    print(f"Found vendor by Name + Branch: {vendor_name} ({branch})")
                    return Response({
                        "status": "FOUND",
                        "matched_by": "Name_Branch",
                        "vendor_id": gst_record.vendor_basic_detail.id,
                        "vendor_name": gst_record.vendor_basic_detail.vendor_name,
                        "branch": gst_record.reference_name
                    })

            # Try Name + Address
            if address:
                gst_record = VendorMasterGSTDetails.objects.filter(
                    tenant_id=tenant_id,
                    vendor_basic_detail__vendor_name__iexact=vendor_name,
                    branch_address__icontains=address
                ).select_related('vendor_basic_detail').first()
                if gst_record:
                    print(f"Found vendor by Name + Address: {vendor_name}")
                    return Response({
                        "status": "FOUND",
                        "matched_by": "Name_Address",
                        "vendor_id": gst_record.vendor_basic_detail.id,
                        "vendor_name": gst_record.vendor_basic_detail.vendor_name,
                        "branch": gst_record.reference_name
                    })

            # Last fallback: Name match only
            vendor = VendorMasterBasicDetail.objects.filter(
                tenant_id=tenant_id,
                vendor_name__iexact=vendor_name
            ).first()
            
            if vendor:
                print(f"Found vendor by Name only: {vendor_name}")
                return Response({
                    "status": "FOUND",
                    "matched_by": "Name",
                    "vendor_id": vendor.id,
                    "vendor_name": vendor.vendor_name
                })
                
        # NOT FOUND
        print(f"No match found for Vendor: {vendor_name}, GSTIN: {gstin}")
        return Response({"status": "NOT_FOUND"})
