"""
Customer Portal API
Handles all API endpoints for customer portal functionality
"""
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from .models import (
    CustomerMasterCategory,
    CustomerMastersSalesQuotation,
    CustomerMastersSalesOrder,
    CustomerMasterCustomer,
    CustomerTransaction,
    # CustomerSalesQuotation,
    # CustomerSalesOrder,
    CustomerMasterLongTermContractBasicDetail,
    CustomerTransactionSalesQuotationGeneral,
    CustomerTransactionSalesQuotationSpecific,
    CustomerTransactionSalesOrderBasicDetails
)
from .serializers import (
    CustomerMasterCategorySerializer,
    CustomerMastersSalesQuotationSerializer,
    CustomerMasterCustomerSerializer,
    CustomerTransactionSerializer,
    # CustomerSalesQuotationSerializer,
    # CustomerSalesOrderSerializer,
    CustomerMasterLongTermContractBasicDetailSerializer,
    CustomerMasterLongTermContractProductServiceSerializer,
    CustomerMasterLongTermContractTermsConditionSerializer,
    CustomerTransactionSalesQuotationGeneralSerializer,
    CustomerTransactionSalesQuotationSpecificSerializer,
    CustomerTransactionSalesOrderSerializer,
    CustomerMastersSalesOrderSerializer
)


class CustomerMasterViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Customer Master operations
    Handles CRUD operations for customer records
    Uses customer_master_customer_basicdetails table (the actual customer table)
    """
    permission_classes = [IsAuthenticated]
    serializer_class = CustomerMasterCustomerSerializer

    def get_queryset(self):
        """Filter customers by tenant"""
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        if tenant_id:
            return CustomerMasterCustomer.objects.filter(tenant_id=tenant_id, is_deleted=False)
        return CustomerMasterCustomer.objects.none()

    def perform_create(self, serializer):
        """Set tenant_id and created_by when creating"""
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        if not tenant_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'error': 'User does not have a tenant_id.'})
        serializer.save(
            tenant_id=tenant_id,
            created_by=user.username if hasattr(user, 'username') else None
        )

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """Soft delete a customer"""
        customer = self.get_object()
        customer.is_deleted = True
        customer.save()
        return Response({'status': 'customer deactivated'})



class CustomerCategoryViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Customer Category operations
    Manages customer categorization with hierarchy (Category -> Group -> Subgroup)
    """
    permission_classes = [IsAuthenticated]
    serializer_class = CustomerMasterCategorySerializer
    
    def get_queryset(self):
        """Filter categories by tenant"""
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        if tenant_id:
            return CustomerMasterCategory.objects.filter(tenant_id=tenant_id, is_active=True)
        return CustomerMasterCategory.objects.none()

    def perform_create(self, serializer):
        """Set tenant_id when creating category"""
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        if not tenant_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'error': 'User does not have a tenant_id.'})
        serializer.save(tenant_id=tenant_id)


class CustomerMastersSalesQuotationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Customer Masters Sales Quotation Series operations
    Manages sales quotation series configuration
    """
    permission_classes = [IsAuthenticated]
    serializer_class = CustomerMastersSalesQuotationSerializer
    
    def get_queryset(self):
        """Filter sales quotation series by tenant"""
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        if tenant_id:
            return CustomerMastersSalesQuotation.objects.filter(tenant_id=tenant_id, is_deleted=False)
        return CustomerMastersSalesQuotation.objects.none()
    
    def perform_create(self, serializer):
        """Set tenant_id and created_by when creating"""
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        
        if not tenant_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'error': 'User does not have a tenant_id. Please contact administrator.'})
        
        serializer.save(
            tenant_id=tenant_id,
            created_by=user.username if hasattr(user, 'username') else None
        )
    
    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """Soft delete a sales quotation series"""
        series = self.get_object()
        series.is_deleted = True
        series.save()
        return Response({'status': 'sales quotation series deactivated'})
    
    @action(detail=True, methods=['get'])
    def preview(self, request, pk=None):
        """Preview the next quotation number without incrementing"""
        series = self.get_object()
        next_number = series.current_number + 1
        number_str = str(next_number).zfill(series.required_digits)
        preview_number = f"{series.prefix}{number_str}{series.suffix}"
        return Response({
            'preview': preview_number,
            'current_number': series.current_number,
            'next_number': next_number
        })


class CustomerMastersSalesOrderViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Customer Masters Sales Order Series operations
    Manages sales order series configuration
    """
    permission_classes = [IsAuthenticated]
    serializer_class = CustomerMastersSalesOrderSerializer
    
    def get_queryset(self):
        """Filter sales order series by tenant"""
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        if tenant_id:
            return CustomerMastersSalesOrder.objects.filter(tenant_id=tenant_id, is_deleted=False)
        return CustomerMastersSalesOrder.objects.none()
    
    def perform_create(self, serializer):
        """Set tenant_id and created_by when creating"""
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        
        if not tenant_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'error': 'User does not have a tenant_id. Please contact administrator.'})
        
        serializer.save(
            tenant_id=tenant_id,
            created_by=user.username if hasattr(user, 'username') else None
        )
    
    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """Soft delete a sales order series"""
        series = self.get_object()
        series.is_deleted = True
        series.save()
        return Response({'status': 'sales order series deactivated'})
    
    @action(detail=True, methods=['get'])
    def preview(self, request, pk=None):
        """Preview the next order number without incrementing"""
        series = self.get_object()
        next_number = series.current_number + 1
        number_str = str(next_number).zfill(series.required_digits)
        preview_number = f"{series.prefix}{number_str}{series.suffix}"
        return Response({
            'preview': preview_number,
            'current_number': series.current_number,
            'next_number': next_number
        })

class CustomerMasterCustomerViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Customer Master Customer operations
    Handles Create New Customer form submissions
    """
    permission_classes = [IsAuthenticated]
    serializer_class = CustomerMasterCustomerSerializer
    
    def get_queryset(self):
        """Filter customers by tenant"""
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        if tenant_id:
            return CustomerMasterCustomer.objects.filter(tenant_id=tenant_id, is_deleted=False)
        return CustomerMasterCustomer.objects.none()
    
    def create(self, request, *args, **kwargs):
        """Override create to add logging"""
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info("=" * 80)
        logger.info("CUSTOMER CREATE REQUEST RECEIVED")
        logger.info("=" * 80)
        logger.info(f"User: {request.user.username}")
        logger.info(f"Tenant ID: {getattr(request.user, 'tenant_id', 'NOT SET')}")
        logger.info(f"Request Data Keys: {list(request.data.keys())}")
        logger.info(f"Full Request Data: {request.data}")
        
        # Check for Terms & Conditions specifically
        terms_fields = ['credit_period', 'credit_terms', 'penalty_terms', 'delivery_terms', 
                       'warranty_details', 'force_majeure', 'dispute_terms']
        terms_data = {k: request.data.get(k) for k in terms_fields if k in request.data}
        logger.info(f"Terms & Conditions Data: {terms_data}")
        
        try:
            response = super().create(request, *args, **kwargs)
            logger.info("✅ Customer created successfully!")
            logger.info(f"Response: {response.data}")
            return response
        except Exception as e:
            logger.error(f"❌ Error creating customer: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            raise
    
    def perform_create(self, serializer):
        """Set tenant_id and created_by when creating"""
        import logging
        logger = logging.getLogger(__name__)
        
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        
        logger.info(f"perform_create called with tenant_id: {tenant_id}")
        
        if not tenant_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'error': 'User does not have a tenant_id. Please contact administrator.'})
        
        serializer.save(
            tenant_id=tenant_id,
            created_by=user.username if hasattr(user, 'username') else None
        )
        
        logger.info("perform_create completed successfully")
    
    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """Soft delete a customer"""
        customer = self.get_object()
        customer.is_deleted = True
        customer.save()
        return Response({'status': 'customer deactivated'})


class CustomerTransactionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Customer Transaction operations
    Handles customer transaction records
    """
    permission_classes = [IsAuthenticated]
    serializer_class = CustomerTransactionSerializer
    
    def get_queryset(self):
        """Filter transactions by tenant"""
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        if tenant_id:
            return CustomerTransaction.objects.filter(tenant_id=tenant_id)
        return CustomerTransaction.objects.none()
    
    @action(detail=False, methods=['get'])
    def by_customer(self, request):
        """Get all transactions for a specific customer"""
        customer_id = request.query_params.get('customer_id')
        if not customer_id:
            return Response(
                {'error': 'customer_id parameter required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        transactions = self.get_queryset().filter(customer_id=customer_id)
        serializer = self.get_serializer(transactions, many=True)
        return Response(serializer.data)


# class CustomerSalesQuotationViewSet(viewsets.ModelViewSet):
#     """
#     ViewSet for Sales Quotation operations
#     Manages customer sales quotations
#     """
#     permission_classes = [IsAuthenticated]
#     # serializer_class = CustomerSalesQuotationSerializer
#     
#     def get_queryset(self):
#         """Filter quotations by tenant"""
#         user = self.request.user
#         tenant_id = getattr(user, 'tenant_id', None)
#         if tenant_id:
#             pass # return CustomerSalesQuotation.objects.filter(tenant_id=tenant_id)
#         # return CustomerSalesQuotation.objects.none()
#         return []
#     
#     @action(detail=True, methods=['post'])
#     def convert_to_order(self, request, pk=None):
#         """Convert quotation to sales order"""
#         return Response({"error": "Not implemented"}, status=501)
#         # quotation = self.get_object()
#         
#         # with transaction.atomic():
#         #     # Create sales order from quotation
#         #     order = CustomerSalesOrder.objects.create(
#         #         tenant_id=quotation.tenant_id,
#         #         customer_id=quotation.customer_id,
#         #         quotation_reference=quotation.quotation_number,
#         #         # Copy other relevant fields
#         #     )
#         #     
#         #     quotation.status = 'converted'
#         #     quotation.save()
#         
#         # return Response({
#         #     'status': 'quotation converted to order',
#         #     'order_id': order.id
#         # })


# class CustomerSalesOrderViewSet(viewsets.ModelViewSet):
#     """
#     ViewSet for Sales Order operations
#     Manages customer sales orders
#     """
#     permission_classes = [IsAuthenticated]
#     # serializer_class = CustomerSalesOrderSerializer
#     
#     def get_queryset(self):
#         """Filter orders by tenant"""
#         # user = self.request.user
#         # tenant_id = getattr(user, 'tenant_id', None)
#         # if tenant_id:
#         #     return CustomerSalesOrder.objects.filter(tenant_id=tenant_id)
#         # return CustomerSalesOrder.objects.none()
#         return []


# TODO: Uncomment when CustomerMasterLongTermContract model is created
# class CustomerMasterLongTermContractViewSet(viewsets.ModelViewSet):
#     """
#     ViewSet for Customer Master Long-term Contracts
#     Manages long-term contracts including rate contracts, service contracts, and AMC
#     """
#     permission_classes = [IsAuthenticated]
#     serializer_class = CustomerMasterLongTermContractSerializer
#     
#     def get_queryset(self):
#         """Filter contracts by tenant"""
#         user = self.request.user
#         tenant_id = getattr(user, 'tenant_id', None)
#         if tenant_id:
#             return CustomerMasterLongTermContract.objects.filter(tenant_id=tenant_id, is_deleted=False)
#         return CustomerMasterLongTermContract.objects.none()
#     
#     def perform_create(self, serializer):
#         """Set tenant_id and created_by when creating"""
#         user = self.request.user
#         tenant_id = getattr(user, 'tenant_id', None)
#         
#         if not tenant_id:
#             from rest_framework.exceptions import ValidationError
#             raise ValidationError({'error': 'User does not have a tenant_id. Please contact administrator.'})
#         
#         serializer.save(
#             tenant_id=tenant_id,
#             created_by=user.username if hasattr(user, 'username') else None
#         )
#     
#     @action(detail=True, methods=['post'])
#     def deactivate(self, request, pk=None):
#         """Soft delete a contract"""
#         contract = self.get_object()
#         contract.is_deleted = True
#         contract.save()
#         return Response({'status': 'contract deactivated'})



class CustomerMasterLongTermContractViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Customer Master Long-term Contracts
    Manages long-term contracts including rate contracts, service contracts, and AMC
    Handles saving to three separate tables: BasicDetail, ProductServices, and TermsCondition
    """
    permission_classes = [IsAuthenticated]
    serializer_class = CustomerMasterLongTermContractBasicDetailSerializer
    
    def get_queryset(self):
        """Filter contracts by tenant"""
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        if tenant_id:
            return CustomerMasterLongTermContractBasicDetail.objects.filter(tenant_id=tenant_id, is_deleted=False)
        return CustomerMasterLongTermContractBasicDetail.objects.none()
    
    def perform_create(self, serializer):
        """
        Set tenant_id and created_by when creating
        Save data to all three tables: BasicDetail, ProductServices, and TermsCondition
        """
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        
        if not tenant_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'error': 'User does not have a tenant_id. Please contact administrator.'})
        
        # Save basic details
        basic_detail = serializer.save(
            tenant_id=tenant_id,
            created_by=user.username if hasattr(user, 'username') else None
        )
        
        # Save products/services if provided
        products_data = self.request.data.get('products_services', [])
        if products_data:
            from .models import CustomerMasterLongTermContractProductService
            for product in products_data:
                CustomerMasterLongTermContractProductService.objects.create(
                    tenant_id=tenant_id,
                    contract_basic_detail=basic_detail,
                    item_code=product.get('item_code'),
                    item_name=product.get('item_name'),
                    customer_item_name=product.get('customer_item_name'),
                    qty_min=product.get('qty_min'),
                    qty_max=product.get('qty_max'),
                    price_min=product.get('price_min'),
                    price_max=product.get('price_max'),
                    acceptable_price_deviation=product.get('acceptable_price_deviation'),
                    created_by=user.username if hasattr(user, 'username') else None
                )
        
        # Save terms & conditions if provided
        terms_data = self.request.data.get('terms_conditions', {})
        if terms_data:
            from .models import CustomerMasterLongTermContractTermsCondition
            CustomerMasterLongTermContractTermsCondition.objects.create(
                tenant_id=tenant_id,
                contract_basic_detail=basic_detail,
                payment_terms=terms_data.get('payment_terms'),
                penalty_terms=terms_data.get('penalty_terms'),
                force_majeure=terms_data.get('force_majeure'),
                termination_clause=terms_data.get('termination_clause'),
                dispute_terms=terms_data.get('dispute_terms'),
                others=terms_data.get('others'),
                created_by=user.username if hasattr(user, 'username') else None
            )
    
    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """Soft delete a contract"""
        contract = self.get_object()
        contract.is_deleted = True
        contract.save()
        return Response({'status': 'contract deactivated'})


class CustomerTransactionSalesQuotationGeneralViewSet(viewsets.ModelViewSet):
    """ViewSet for General Sales Quotations"""
    permission_classes = [IsAuthenticated]
    serializer_class = CustomerTransactionSalesQuotationGeneralSerializer
    
    def get_queryset(self):
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        if tenant_id:
            return CustomerTransactionSalesQuotationGeneral.objects.filter(tenant_id=tenant_id).order_by('-created_at')
        return CustomerTransactionSalesQuotationGeneral.objects.none()
    
    def perform_create(self, serializer):
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        created_by = getattr(user, 'full_name', user.username)
        serializer.save(tenant_id=tenant_id, created_by=created_by)


class CustomerTransactionSalesQuotationSpecificViewSet(viewsets.ModelViewSet):
    """ViewSet for Specific Sales Quotations"""
    permission_classes = [IsAuthenticated]
    serializer_class = CustomerTransactionSalesQuotationSpecificSerializer
    
    def get_queryset(self):
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        if tenant_id:
            return CustomerTransactionSalesQuotationSpecific.objects.filter(tenant_id=tenant_id).order_by('-created_at')
        return CustomerTransactionSalesQuotationSpecific.objects.none()
    
    def perform_create(self, serializer):
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        created_by = getattr(user, 'full_name', user.username)
        serializer.save(tenant_id=tenant_id, created_by=created_by)


class CustomerTransactionSalesOrderViewSet(viewsets.ModelViewSet):
    """ViewSet for Sales Order (with 5 tables structure)"""
    permission_classes = [IsAuthenticated]
    serializer_class = CustomerTransactionSalesOrderSerializer
    
    def get_queryset(self):
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        if tenant_id:
            return CustomerTransactionSalesOrderBasicDetails.objects.filter(tenant_id=tenant_id).order_by('-created_at')
        return CustomerTransactionSalesOrderBasicDetails.objects.none()
    
    def perform_create(self, serializer):
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        created_by = getattr(user, 'full_name', user.username)
        serializer.save(tenant_id=tenant_id, created_by=created_by)

class SalesCustomerCreateView(APIView):
    """
    Create a new Customer specifically for Sales Excel Upload.
    Creates records in multiple related tables: Master, GST, Banking, TDS, and Terms.
    """
    permission_classes = [IsAuthenticated]

    def get_tenant_id(self):
        user = self.request.user
        return getattr(user, 'tenant_id', None)

    def get_username(self):
        return getattr(self.request.user, 'username', 'system')

    def post(self, request, *args, **kwargs):
        tenant_id = self.get_tenant_id()
        username = self.get_username()
        
        c_name = request.data.get('customer_name', '').strip()
        gstin = request.data.get('gstin', '')
        if gstin:
            gstin = gstin.strip().upper()
        branch = request.data.get('branch', '').strip()
        address = request.data.get('address', '').strip()
        state = request.data.get('state', '').strip()
        
        if not c_name:
            return Response({'error': 'Customer Name is required'}, status=400)

        # Step 1: Validation
        from accounting.sales_validation_logic import validate_sales_customer_and_invoice
        val_result = validate_sales_customer_and_invoice(
            tenant_id=tenant_id,
            customer_name=c_name,
            gstin=gstin,
            branch=branch
        )

        if val_result['status'] == 'READY':
            # Already exists
            return Response({
                "status": "CREATED",
                "customer_id": val_result['customer_id'],
                "message": "Customer already exists."
            }, status=status.HTTP_200_OK)
            
        elif val_result['status'] == 'GSTIN_CONFLICT':
            return Response({
                "status": "VALIDATION_WARNING",
                "message": val_result['message'],
                "customer_id": val_result['customer_id']
            }, status=status.HTTP_400_BAD_REQUEST)

        # Step 2: Create Master Basic Detail
        from .database import (
            CustomerMasterCustomerBasicDetails,
            CustomerMasterCustomerGSTDetails,
            CustomerMasterCustomerBanking,
            CustomerMasterCustomerTDS,
            CustomerMasterCustomerTermsCondition
        )

        try:
            with transaction.atomic():
                # 1. Basic Details
                # Generate a temporary customer code
                import random
                import string
                random_suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
                cust_code = f"CUST-{random_suffix}"
                
                # Try to get or create a "Regular" category
                from .models import CustomerMasterCategory
                cat, _ = CustomerMasterCategory.objects.get_or_create(
                    tenant_id=tenant_id,
                    category="Regular",
                    defaults={'is_active': True}
                )

                customer = CustomerMasterCustomerBasicDetails.objects.create(
                    tenant_id=tenant_id,
                    customer_name=c_name,
                    customer_code=cust_code,
                    pan_number=gstin[2:12] if gstin and len(gstin) >= 15 else None,
                    contact_number=request.data.get('phone', '+910000000000'),
                    email_address=request.data.get('email', f"pending_{tenant_id}@example.com"),
                    customer_category=cat,
                    created_by=username
                )
                
                # 2. GST Details
                if gstin or branch:
                    CustomerMasterCustomerGSTDetails.objects.create(
                        tenant_id=tenant_id,
                        customer_basic_detail=customer,
                        gstin=gstin if gstin else None,
                        branch_reference_name=branch if branch else "Main Branch",
                        branch_address=address,
                        # Populate the new address columns if provided
                        address_line_1=address,
                        state=state,
                        created_by=username
                    )

                # 3. Banking Table
                CustomerMasterCustomerBanking.objects.create(
                    tenant_id=tenant_id,
                    customer_basic_detail=customer,
                    created_by=username
                )

                # 4. Statutory / TDS Table
                CustomerMasterCustomerTDS.objects.create(
                    tenant_id=tenant_id,
                    customer_basic_detail=customer,
                    created_by=username
                )

                # 5. Terms Table
                CustomerMasterCustomerTermsCondition.objects.create(
                    tenant_id=tenant_id,
                    customer_basic_detail=customer,
                    created_by=username
                )

                return Response({
                    "status": "CREATED",
                    "customer_id": customer.id,
                    "customer_name": c_name,
                    "customer_code": cust_code
                }, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
