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
import logging
from accounting.models import PaymentVoucherItem
from accounting.serializers import PaymentVoucherItemSerializer

logger = logging.getLogger(__name__)


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
            return CustomerMasterCustomer.objects.select_related('customer_category').filter(tenant_id=tenant_id, is_deleted=False)
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
            queryset = CustomerMasterCustomer.objects.select_related('customer_category').filter(tenant_id=tenant_id, is_deleted=False)
            
            # Simple filtering
            pan = self.request.query_params.get('pan_number')
            name = self.request.query_params.get('customer_name')
            if pan:
                queryset = queryset.filter(pan_number=pan)
            if name:
                queryset = queryset.filter(customer_name__icontains=name)
                
            return queryset
        return CustomerMasterCustomer.objects.none()
    
    def create(self, request, *args, **kwargs):
        """Override create to add logging"""
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info("=" * 80)
        logger.info("CUSTOMER CREATE REQUEST RECEIVED")
        logger.info("=" * 80)
        logger.info(f"User: {request.user.username}")
        logger.info(f"Branch ID: {getattr(request.user, 'tenant_id', 'NOT SET')}")
        logger.info(f"Request Data Keys: {list(request.data.keys())}")
        logger.info(f"Full Request Data: {request.data}")
        
        # Check for Terms & Conditions specifically
        terms_fields = ['credit_period', 'credit_terms', 'penalty_terms', 'delivery_terms', 
                       'warranty_details', 'force_majeure', 'dispute_terms']
        terms_data = {k: request.data.get(k) for k in terms_fields if k in request.data}
        logger.info(f"Terms & Conditions Data: {terms_data}")
        
        try:
            response = super().create(request, *args, **kwargs)
            logger.info("[OK] Customer created successfully!")
            logger.info(f"Response: {response.data}")
            return response
        except Exception as e:
            logger.error(f"[ERROR] Error creating customer: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            raise
    
    def perform_create(self, serializer):
        """Set tenant_id and created_by when creating, and auto-create a MasterLedger."""
        import logging
        logger = logging.getLogger(__name__)
        
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        
        logger.info(f"perform_create called with tenant_id: {tenant_id}")
        
        if not tenant_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'error': 'User does not have a tenant_id. Please contact administrator.'})
        
        customer = serializer.save(
            tenant_id=tenant_id,
            created_by=user.username if hasattr(user, 'username') else None
        )
        
        # Auto-create a MasterLedger so this customer shows in Receive From dropdowns.
        try:
            from accounting.models import MasterLedger
            ledger_code = f"CUST-LED-{customer.id}"
            ledger = MasterLedger.objects.create(
                tenant_id=tenant_id,
                name=customer.customer_name,
                group='Sundry Debtors',
                category='Asset',
                code=ledger_code,
            )
            customer.ledger_id = ledger.id
            customer.save(update_fields=['ledger'])
            logger.info(f"Auto-created ledger {ledger.id} for customer {customer.id} ({customer.customer_name})")
        except Exception as e:
            logger.warning(f"Could not auto-create ledger for customer {customer.id}: {e}")
        
        logger.info("perform_create completed successfully")
    
    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """Soft delete a customer"""
        customer = self.get_object()
        customer.is_deleted = True
        customer.save()
        return Response({'status': 'customer deactivated'})

    def destroy(self, request, *args, **kwargs):
        """Override delete to perform soft delete"""
        customer = self.get_object()
        customer.is_deleted = True
        customer.save()
        return Response({'status': 'customer deleted successfully'}, status=status.HTTP_200_OK)


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

    def perform_update(self, serializer):
        instance = serializer.save()
        try:
            from accounting.services.portal_mirror_service import sync_portal_allocation_to_main_ledger
            sync_portal_allocation_to_main_ledger(instance)
        except Exception as e:
            logger.error(f"Failed to reverse-sync portal allocation: {e}")
    
    @action(detail=False, methods=['get'])
    def by_customer(self, request):
        """
        Get all transactions for a specific customer, enriched with due_status
        calculated from the customer's credit period (mirrors vendor portal by_vendor).
        """
        import re
        from datetime import date, timedelta, datetime
        from decimal import Decimal

        customer_id = request.query_params.get('customer_id')
        if not customer_id:
            return Response(
                {'error': 'customer_id parameter required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        tenant_id = getattr(request.user, 'tenant_id', None)
        transactions = self.get_queryset().filter(customer_id=customer_id)

        # ── Fetch customer credit period ───────────────────────────────────
        credit_period_days = 0
        try:
            from .models import CustomerMasterCustomerTermsCondition
            terms = CustomerMasterCustomerTermsCondition.objects.filter(
                customer_basic_detail_id=customer_id
            ).first()
            if terms and terms.credit_period:
                raw = str(terms.credit_period).strip()
                if raw.isdigit():
                    credit_period_days = int(raw)
                else:
                    import re
                    m = re.search(r'(\d+)', raw)
                    if m:
                        credit_period_days = int(m.group(1))
        except Exception as e:
            logger.warning(f"Could not fetch credit period for customer {customer_id}: {e}")

        def calculate_due_status(transaction_date, credit_days):
            if not transaction_date:
                return "Not Due", None
            
            # Ensure transaction_date is a date object
            if isinstance(transaction_date, str):
                try:
                    transaction_date = datetime.strptime(transaction_date[:10], '%Y-%m-%d').date()
                except:
                    return "Not Due", None
            elif isinstance(transaction_date, datetime):
                transaction_date = transaction_date.date()
                
            due_dt = transaction_date + timedelta(days=credit_days)
            # Becomes 'Due' ON the due date (e.g. after 2 days)
            status_str = "Due" if date.today() >= due_dt else "Not Due"
            return status_str, due_dt.strftime('%Y-%m-%d')

        # ── Fetch data ───────────────────────────────────────────────────
        all_transactions = CustomerTransaction.objects.filter(
            tenant_id=tenant_id, customer_id=customer_id
        ).order_by('-transaction_date', '-id')

        # Sales-specific list (used for some views)
        transactions = all_transactions.filter(transaction_type__in=['sales', 'invoice', 'debit_note'])

        # ── Enrich function ───────────────────────────────────────────────
        def enrich_item(item):
            tx_type = (item.get('transaction_type') or '').lower()
            if tx_type in ('sales', 'invoice', 'debit_note'):
                tx_date_raw = item.get('transaction_date') or item.get('date')
                total_amt = Decimal(str(item.get('total_amount') or item.get('amount') or 0))

                ref_no = item.get('reference_number') or item.get('transaction_number')
                paid_sum = Decimal('0')
                if ref_no:
                    linking_txs = CustomerTransaction.objects.filter(
                        tenant_id=tenant_id,
                        customer_id=customer_id,
                        reference_number=ref_no
                    ).exclude(id=item.get('id'))
                    for ltx in linking_txs:
                        ltype = (ltx.transaction_type or '').lower()
                        if ltype in ('receipt', 'credit_note'):
                            paid_sum += Decimal(str(ltx.total_amount or 0))
                        elif ltype in ('debit_note',):
                            paid_sum -= Decimal(str(ltx.total_amount or 0))

                item['paid_amount'] = float(paid_sum)
                item['payment_balance'] = float(total_amt - paid_sum)

                if total_amt > 0 and paid_sum >= total_amt:
                    item['payment_status'] = 'Received'
                    item['due_status'] = 'Received'
                    item['due_date'] = None
                elif paid_sum > 0 and paid_sum < total_amt:
                    due_status, due_date_str = calculate_due_status(tx_date_raw, credit_period_days)
                    if due_status == 'Due':
                        item['payment_status'] = 'Partially Received'
                        item['due_status'] = 'Partially Received'
                    else:
                        item['payment_status'] = 'Not Due'
                        item['due_status'] = 'Not Due'
                    item['due_date'] = due_date_str
                elif tx_date_raw:
                    due_status, due_date_str = calculate_due_status(tx_date_raw, credit_period_days)
                    item['payment_status'] = due_status
                    item['due_status'] = due_status
                    item['due_date'] = due_date_str
                else:
                    item['payment_status'] = 'Not Due'
                    item['due_status'] = 'Not Due'
                    item['due_date'] = None

                item['credit_period_days'] = credit_period_days
            return item

        # ── Serialize and return ───────────────────────────────────────────
        all_tx_data = self.get_serializer(all_transactions, many=True).data
        sales_tx_data = self.get_serializer(transactions, many=True).data

        enriched_all = [enrich_item(i) for i in all_tx_data]
        enriched_sales = [enrich_item(i) for i in sales_tx_data]

        customer = CustomerMasterCustomer.objects.filter(tenant_id=tenant_id, id=customer_id).first()
        c_id = customer.id if customer else customer_id
        c_name = customer.customer_name if customer else "Customer"

        return Response({
            'allTransactions': enriched_all,
            'transactions': enriched_sales,
            'customer': {
                'id': c_id,
                'name': c_name,
                'credit_period': credit_period_days
            }
        })


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
    
    def create(self, request, *args, **kwargs):
        """Override create to add logging for debugging 400 errors"""
        logger.info(f"Received Long-term Contract creation request")
        # logger.debug(f"Request data: {request.data}")
        
        try:
            serializer = self.get_serializer(data=request.data)
            if not serializer.is_valid():
                logger.warning(f"Validation errors: {serializer.errors}")
                return Response(
                    {'error': 'Invalid input data', 'details': serializer.errors},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            self.perform_create(serializer)
            headers = self.get_success_headers(serializer.data)
            logger.info("Long-term Contract created successfully")
            return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
        except Exception as e:
            logger.error(f"Error creating contract: {str(e)}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def perform_create(self, serializer):
        """Set tenant_id and created_by when creating"""
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        
        if not tenant_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'error': 'User does not have a tenant_id. Please contact administrator.'})
        
        basic_detail = serializer.save(
            tenant_id=tenant_id,
            created_by=user.username if hasattr(user, 'username') else None
        )
        self._save_related_data(basic_detail, tenant_id, user)

    def perform_update(self, serializer):
        """Set updated_by and update related data when updating"""
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        
        basic_detail = serializer.save(
            updated_by=user.username if hasattr(user, 'username') else None
        )
        self._save_related_data(basic_detail, tenant_id, user)

    def _save_related_data(self, basic_detail, tenant_id, user):
        """Helper to save products/services and terms/conditions"""
        # Save products/services
        products_data = self.request.data.get('products_services')
        if products_data is not None:
            from .models import CustomerMasterLongTermContractProductService
            # Clear existing products and recreate
            CustomerMasterLongTermContractProductService.objects.filter(contract_basic_detail=basic_detail).delete()
            
            for product in products_data:
                # Only create if at least item_code or item_name is provided
                item_code = product.get('item_code')
                item_name = product.get('item_name')
                if item_code or item_name:
                    CustomerMasterLongTermContractProductService.objects.create(
                        tenant_id=tenant_id,
                        contract_basic_detail=basic_detail,
                        item_code=item_code or '',
                        item_name=item_name or '',
                        customer_item_name=product.get('customer_item_name'),
                        qty_min=product.get('qty_min'),
                        qty_max=product.get('qty_max'),
                        price_min=product.get('price_min'),
                        price_max=product.get('price_max'),
                        acceptable_price_deviation=product.get('acceptable_price_deviation'),
                        created_by=user.username if hasattr(user, 'username') else None
                    )
        
        # Save terms & conditions
        terms_data = self.request.data.get('terms_conditions')
        if terms_data is not None:
            from .models import CustomerMasterLongTermContractTermsCondition
            CustomerMasterLongTermContractTermsCondition.objects.update_or_create(
                contract_basic_detail=basic_detail,
                defaults={
                    'tenant_id': tenant_id,
                    'payment_terms': terms_data.get('payment_terms'),
                    'penalty_terms': terms_data.get('penalty_terms'),
                    'force_majeure': terms_data.get('force_majeure'),
                    'termination_clause': terms_data.get('termination_clause'),
                    'dispute_terms': terms_data.get('dispute_terms'),
                    'others': terms_data.get('others'),
                    'created_by': user.username if hasattr(user, 'username') else None
                }
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
        if not tenant_id:
            return CustomerTransactionSalesOrderBasicDetails.objects.none()
            
        queryset = CustomerTransactionSalesOrderBasicDetails.objects.filter(tenant_id=tenant_id, is_deleted=False)
        
        # Status filtering
        status_param = self.request.query_params.get('status')
        if status_param == 'pending':
            # Returns 'pending' OR 'approved' as per requirement
            queryset = queryset.filter(status__in=['pending', 'approved'])
        elif status_param:
            queryset = queryset.filter(status=status_param)

        customer_name = self.request.query_params.get('customer_name')
        if customer_name:
            queryset = queryset.filter(customer_name=customer_name)
            
        return queryset.order_by('-created_at')
    
    def perform_create(self, serializer):
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        created_by = getattr(user, 'full_name', user.username)
        
        # Auto-increment logic
        so_series_name = self.request.data.get('so_series_name')
        if so_series_name:
            try:
                from .database import CustomerMastersSalesOrder
                series = CustomerMastersSalesOrder.objects.get(
                    tenant_id=tenant_id, 
                    series_name=so_series_name,
                    is_deleted=False
                )
                
                # Fetching again to be safe and format correctly
                next_number = series.current_number + 1
                number_str = str(next_number).zfill(series.required_digits)
                generated_so_number = f"{series.prefix}{number_str}{series.suffix}"
                
                # Use the generated number instead of what might be in serializer initial data
                serializer.save(
                    tenant_id=tenant_id, 
                    created_by=created_by,
                    so_number=generated_so_number
                )
                
                # Increment the series count
                series.current_number = next_number
                series.save()
                return
            except CustomerMastersSalesOrder.DoesNotExist:
                pass
        
        # Fallback if no series found or provided
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

                # Auto-create a MasterLedger for this customer
                try:
                    from accounting.models import MasterLedger
                    ledger_code = f"CUST-LED-{customer.id}"
                    ledger = MasterLedger.objects.create(
                        tenant_id=tenant_id,
                        name=c_name,
                        group='Sundry Debtors',
                        code=ledger_code,
                    )
                    customer.ledger_id = ledger.id
                    customer.save(update_fields=['ledger'])
                except Exception as ledger_err:
                    logger.warning(f"Could not auto-create ledger for sales customer {customer.id}: {ledger_err}")
                
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
