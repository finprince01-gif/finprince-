from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db import transaction as db_transaction
from .models_voucher_sales import VoucherSalesInvoiceDetails
from .serializers_voucher_sales import VoucherSalesInvoiceDetailsSerializer
from .models import Voucher, JournalEntry, MasterLedger
from .models_voucher_receipt import VoucherReceiptSingle
from core.utils import TenantQuerysetMixin
from decimal import Decimal
import datetime

class VoucherSalesViewSet(TenantQuerysetMixin, viewsets.ModelViewSet):
    queryset = VoucherSalesInvoiceDetails.objects.all().order_by('-date', '-created_at')
    serializer_class = VoucherSalesInvoiceDetailsSerializer
    def get_queryset(self):
        queryset = super().get_queryset().prefetch_related('items')
        # Filter for the current tenant
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        
        if tenant_id:
            queryset = queryset.filter(tenant_id=tenant_id)

        # Support for showing all OR filtering for Pending/Due ones
        show_all = self.request.query_params.get('show_all') == 'true'
        status_param = self.request.query_params.get('status')
        
        if not show_all and status_param != 'all':
            # EXCLUDE FULLY PAID INVOICES
            # This ensures they only disappear when status is 'received'
            queryset = queryset.exclude(status='received')

            # MANDATORY: Only show vouchers with positive outstanding payable
            queryset = queryset.filter(
                payment_details__payment_payable__isnull=False,
                payment_details__payment_payable__gt=0
            ).select_related('payment_details')
        
        # Optional: Filter by customer ID/name/branch if provided
        customer_id = self.request.query_params.get('customer_id')
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
            
        customer_name = self.request.query_params.get('customer_name')
        if customer_name:
            queryset = queryset.filter(customer_name=customer_name)
        
        branch = self.request.query_params.get('branch')
        if branch:
            queryset = queryset.filter(customer_branch__iexact=branch.strip())

        # Filter by specific invoice number (for fetching full item details)
        sales_invoice_no = self.request.query_params.get('sales_invoice_no')
        if sales_invoice_no:
            queryset = queryset.filter(sales_invoice_no=sales_invoice_no)
        
        return queryset

    def perform_create(self, serializer):
        super().perform_create(serializer)

    @action(detail=True, methods=['post'], url_path='post-receipt')
    def post_receipt(self, request, pk=None):
        invoice = self.get_object()
        tenant_id = invoice.tenant_id
        data = request.data
        
        # Required fields from request
        receipt_date = data.get('dateOfReceipt')
        method = data.get('methodOfReceipt') # 'Cash' or 'Bank'
        ledger_id = data.get('ledger_id') or data.get('bankAccount') # ID of Bank/Cash ledger
        amount = data.get('amount', 0)
        reference_no = data.get('bankReferenceNo', '')
        narration = data.get('narration') or f"Receipt against Invoice {invoice.sales_invoice_no}"

        if not receipt_date or not method:
            return Response({"error": "Missing required fields"}, status=status.HTTP_400_BAD_REQUEST)

        if method == 'Bank' and not ledger_id:
             return Response({"error": "Bank account selection is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with db_transaction.atomic():
                # 1. Resolve Ledgers
                # receive_in_ledger (Bank/Cash)
                if method == 'Cash' and not ledger_id:
                     receive_in_ledger = MasterLedger.objects.filter(
                        tenant_id=tenant_id, 
                        group__icontains='Cash',
                        category='Asset'
                    ).first()
                     if not receive_in_ledger:
                         return Response({"error": "No default Cash ledger found."}, status=status.HTTP_400_BAD_REQUEST)
                else:
                    receive_in_ledger = MasterLedger.objects.get(id=ledger_id, tenant_id=tenant_id)
                
                # receive_from_ledger (Customer)
                # We need to find the ledger associated with this customer
                # Assuming customer name matches ledger name or linked via customer_id
                if invoice.customer_id:
                    # Try to find by customer_id if we have a way, else by name
                    receive_from_ledger = MasterLedger.objects.filter(name=invoice.customer_name, tenant_id=tenant_id).first()
                else:
                    receive_from_ledger = MasterLedger.objects.filter(name=invoice.customer_name, tenant_id=tenant_id).first()

                if not receive_from_ledger:
                    return Response({"error": f"Customer ledger '{invoice.customer_name}' not found"}, status=status.HTTP_400_BAD_REQUEST)

                # 2. Create Unified Voucher
                voucher_no = f"REC-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
                voucher = Voucher.objects.create(
                    tenant_id=tenant_id,
                    type='receipt',
                    voucher_number=voucher_no,
                    date=receipt_date,
                    party=invoice.customer_name,
                    account=receive_in_ledger.name,
                    amount=amount,
                    total=amount,
                    narration=narration,
                    reference_id=invoice.id,
                    source='customer_portal'
                )

                # 3. Create VoucherReceiptSingle
                VoucherReceiptSingle.objects.create(
                    tenant_id=tenant_id,
                    date=receipt_date,
                    voucher_type='receipt',
                    voucher_number=voucher_no,
                    total_receipt=amount,
                    receive_in=receive_in_ledger,
                    receive_from=receive_from_ledger,
                    bank_reference_number=reference_no
                )

                # 4. Create Journal Entries
                # NEW: Populating denormalized columns
                
                # Debit: Bank/Cash
                JournalEntry.objects.create(
                    tenant_id=tenant_id,
                    voucher_type='receipt',
                    voucher_id=voucher.id,
                    voucher_number=voucher_no,
                    transaction_date=receipt_date,
                    narration=narration,
                    ledger=receive_in_ledger,
                    ledger_name=receive_in_ledger.name,
                    debit=amount,
                    credit=0
                )
                
                # Credit: Customer
                JournalEntry.objects.create(
                    tenant_id=tenant_id,
                    voucher_type='receipt',
                    voucher_id=voucher.id,
                    voucher_number=voucher_no,
                    transaction_date=receipt_date,
                    narration=narration,
                    ledger=receive_from_ledger,
                    ledger_name=receive_from_ledger.name,
                    debit=0,
                    credit=amount
                )


                # 5. Mark Invoice as Paid / Update Balance
                if hasattr(invoice, 'payment_details'):
                    payment_details = invoice.payment_details
                    amount_decimal = Decimal(str(amount))
                    
                    # Update received and balance
                    payment_details.payment_received = (payment_details.payment_received or 0) + amount_decimal
                    payment_details.payment_payable = max(0, (payment_details.payment_payable or 0) - amount_decimal)
                    payment_details.payment_balance = payment_details.payment_payable
                    payment_details.save()
                    
                    # Update status
                    if payment_details.payment_payable <= 0:
                        invoice.status = 'received'
                    else:
                        invoice.status = 'partially received'
                    invoice.save()
                
                return Response({"message": "Receipt posted successfully", "voucher_no": voucher_no}, status=status.HTTP_201_CREATED)

        except MasterLedger.DoesNotExist:
            return Response({"error": "Selected ledger not found"}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def create(self, request, *args, **kwargs):
        from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
        from core.utils import nested_multipart_to_nested_dict
        
        # Check if it's multipart
        content_type = request.content_type or ''
        if 'multipart/form-data' in content_type:
            # Manually expand nested keys from FormData
            data = nested_multipart_to_nested_dict(request.data)
            
            # SANITIZATION: Remove empty strings for file fields which cause validation errors
            if data.get('supporting_document') == '':
                data['supporting_document'] = None
            if isinstance(data.get('dispatch_details'), dict):
                if data['dispatch_details'].get('dispatch_document') == '':
                    data['dispatch_details']['dispatch_document'] = None

            # Re-initialize the serializer with the expanded data
            serializer = self.get_serializer(data=data)
            serializer.is_valid(raise_exception=True)
            self.perform_create(serializer)
            headers = self.get_success_headers(serializer.data)
            return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
            
        return super().create(request, *args, **kwargs)
