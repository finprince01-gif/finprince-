from rest_framework import viewsets, status # type: ignore
from rest_framework.decorators import action # type: ignore
from rest_framework.response import Response  # type: ignore
from django.db import transaction as db_transaction # type: ignore
from django.utils import timezone # type: ignore
import datetime

from .models import (
    ReceiptVoucher, ReceiptVoucherItem, Voucher, JournalEntry,
    PendingTransaction, AdvanceAllocation, Transaction, TransactionAllocation
) # type: ignore
from .serializers_receipt import ReceiptVoucherSerializer # type: ignore
from .services.sales_status_service import update_sales_invoice_payment_status
from .services.portal_mirror_service import delete_transaction_from_portal

class ReceiptVoucherViewSet(viewsets.ModelViewSet):
    """
    Unified ViewSet for Receipt Vouchers.
    Replaces VoucherReceiptSingle and VoucherReceiptBulk viewsets.
    """
    queryset = ReceiptVoucher.objects.all() # type: ignore
    serializer_class = ReceiptVoucherSerializer
    
    def get_queryset(self):
        user = self.request.user
        queryset = self.queryset
        if hasattr(user, 'tenant_id') and user.branch_id:
            queryset = queryset.filter(tenant_id=user.branch_id)

        customer_name = self.request.query_params.get('customer')
        if customer_name:
            # Filter vouchers that have at least one item matching this customer
            queryset = queryset.filter(items__customer__name__icontains=customer_name).distinct()
        
        return queryset

    def get_object(self):
        from django.http import Http404
        try:
            return super().get_object()
        except Http404:
            pk = self.kwargs.get('pk')
            from .models import Voucher
            generic_voucher = Voucher.objects.filter(id=pk).first()
            if generic_voucher and generic_voucher.reference_id:
                self.kwargs['pk'] = generic_voucher.reference_id
                return super().get_object()
            raise

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            with db_transaction.atomic():
                self.perform_create(serializer)
                
                headers = self.get_success_headers(serializer.data)
                response_data = serializer.data
                response_data['voucher_created'] = True
                    
                return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)
        except Exception as e:
            from django.db import IntegrityError
            if isinstance(e, IntegrityError):
                import traceback
                error_details = traceback.format_exc()
                print(f"!!! IntegrityError details:\n{error_details}")
                return Response({"message": f"A database conflict occurred: {str(e)}", "debug_info": str(e)}, status=status.HTTP_409_CONFLICT)
            print(f"!!! Error in create: {str(e)}")
            import traceback
            print(traceback.format_exc())
            return Response({"message": "Failed to post voucher. Check logs."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'], url_path='save-amount-only')
    def save_amount_only(self, request):
        """
        EXTRA isolated action: Save ONLY the entered amount to the vouchers table.
        Does NOT create allocations, advances, or use mapping logic.
        """
        from accounting.models import AdvanceAllocation, PendingTransaction
        data = request.data
        tenant_id = getattr(request.user, 'tenant_id', None) or request.headers.get('X-Branch-Id')
        
        entered_amount = data.get('amount')
        receive_in_id = data.get('receive_in')
        receive_from_id = data.get('receive_from')
        date_str = data.get('date') or timezone.now().date().isoformat()
        
        if not entered_amount or not receive_in_id or not receive_from_id:
            return Response({'error': 'Missing required fields: amount, receive_in, receive_from'}, status=status.HTTP_400_BAD_REQUEST)

        with db_transaction.atomic():
            from .services.ledger_service import _resolve_ledger
            receive_in_ledger = _resolve_ledger(receive_in_id, tenant_id)
            receive_from_ledger = _resolve_ledger(receive_from_id, tenant_id)
            
            # Resolve Party IDs
            def get_party_ids(ledger):
                if not ledger: return None, None, None
                l_id = ledger.id
                from vendors.models import VendorMasterBasicDetail
                from customerportal.database import CustomerMasterCustomerBasicDetails
                v = VendorMasterBasicDetail.objects.filter(ledger_id=l_id).first() # type: ignore
                c = CustomerMasterCustomerBasicDetails.objects.filter(ledger_id=l_id).first() # type: ignore
                return (l_id, c.id if c else None, v.id if v else None)

            pf_l, pf_c, pf_v = get_party_ids(receive_in_ledger)
            pt_l, pt_c, pt_v = get_party_ids(receive_from_ledger)

            # Generate Voucher Number
            from masters.models import MasterVoucherReceipts
            series = MasterVoucherReceipts.objects.filter(tenant_id=tenant_id, is_active=True).first()
            
            def _is_taken(v):
                from accounting.models import ReceiptVoucher, AdvanceAllocation, PendingTransaction
                return (
                    ReceiptVoucher.objects.filter(tenant_id=tenant_id, voucher_number=v).exists() or
                    AdvanceAllocation.objects.filter(tenant_id=tenant_id, transaction__voucher_number=v).exists() or
                    PendingTransaction.objects.filter(tenant_id=tenant_id, transaction__voucher_number=v).exists()
                )

            v_num = data.get('voucher_number')
            if v_num == 'Manual Input':
                v_num = None

            if series:
                expected_next = series.get_next_number()
                if not v_num or v_num == expected_next or _is_taken(v_num):
                    if not v_num:
                        v_num = expected_next
                    while _is_taken(v_num):
                        series.increment_number()
                        v_num = series.get_next_number()
                    series.increment_number()
            
            if not v_num:
                import uuid
                v_num = f"RCV-{uuid.uuid4().hex[:6].upper()}"
            else:
                # For manual input that is NOT 'Manual Input' text, check for collisions one last time
                from .models import Transaction
                if Transaction.objects.filter(tenant_id=tenant_id, voucher_number=v_num).exists(): # type: ignore
                    return Response({'error': f'Voucher number {v_num} is already taken.'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Calculate the next number for the frontend
            next_v_num = series.get_next_number() if series else None

            # Create Voucher (Transaction)
            instance = ReceiptVoucher.objects.create( # type: ignore
                tenant_id=tenant_id,
                voucher_number=v_num,
                transaction_type='RECEIPT',
                date=date_str,
                amount=entered_amount,
                total_amount=entered_amount,
                vouch_amount=entered_amount,
                narration=data.get('narration', ''),
                ref_no=data.get('ref_no', ''),
                posting_note=data.get('posting_note', ''),
                pay_from_ledger=receive_in_ledger,
                pay_to_ledger=receive_from_ledger,
                ledger_id_val=pt_l or pf_l,
                party_customer_id=pt_c or pf_c,
                party_vendor_id=pt_v or pf_v,
                receive_in_ledger_id_val=pf_l,
                receive_from_ledger_id_val=pt_l
            )
            
            # Create AdvanceAllocation since entire amount is unallocated
            AdvanceAllocation.objects.create(
                tenant_id=tenant_id,
                transaction=instance,
                type='receipt_single',
                reference_id='ADVANCE',
                reference_number=v_num,
                reference_type='ADVANCE',
                pay_from_ledger=receive_from_ledger,
                pay_to_ledger=receive_in_ledger,
                allocated_amount=entered_amount,
                amount=entered_amount,
                original_amount=entered_amount,
                is_advance=True,
                advance_ref_no=v_num,
                ref_no=data.get('ref_no', ''),
                posting_note=data.get('posting_note', ''),
                vouch_amount=entered_amount,
                ledger_id_val=pt_l or pf_l,
                party_customer_id=pt_c or pf_c,
                party_vendor_id=pt_v or pf_v,
                receive_from_ledger_id_val=pt_l,
                receive_from_customer_id_val=pt_c,
                receive_from_vendor_id_val=pt_v,
                receive_in_ledger_id_val=pf_l,
                receive_in_customer_id_val=pf_c,
                receive_in_vendor_id_val=pf_v
            )

            # Mirror to Customer Portal
            from .serializers_receipt import ReceiptVoucherSerializer
            try:
                ReceiptVoucherSerializer(context={'request': request})._mirror_to_customer_portal(instance)
            except Exception as e:
                print(f"!!! Failed to mirror to customer portal in save_amount_only: {e}")

            
            # Create Journal Entries
            if receive_in_ledger:
                JournalEntry.objects.create( # type: ignore
                    tenant_id=tenant_id, voucher_type='RECEIPT', voucher_id=instance.id,
                    voucher_number=v_num, transaction_date=date_str,
                    ledger=receive_in_ledger, ledger_name=receive_in_ledger.name,
                    debit=entered_amount, credit=0,
                    customer_id=pf_c, vendor_id=pf_v
                )
            if receive_from_ledger:
                JournalEntry.objects.create( # type: ignore
                    tenant_id=tenant_id, voucher_type='RECEIPT', voucher_id=instance.id,
                    voucher_number=v_num, transaction_date=date_str,
                    ledger=receive_from_ledger, ledger_name=receive_from_ledger.name,
                    debit=0, credit=entered_amount,
                    customer_id=pt_c, vendor_id=pt_v
                )



            # Create a legacy Voucher record required for DayBook visibility
            from accounting.models import Voucher
            party_name = receive_from_ledger.name if receive_from_ledger else "Unknown"
            account_name = receive_in_ledger.name if receive_in_ledger else None
            Voucher.objects.create(
                tenant_id=tenant_id,
                reference_id=instance.id,
                type='receipt',
                voucher_number=v_num,
                date=date_str,
                party=party_name,
                account=account_name,
                amount=entered_amount,
                total=entered_amount,
                narration=data.get('narration', ''),
                ref_no=data.get('ref_no', ''),
                source='manual',
                ledger_id_val=pt_l or pf_l,
                party_customer_id=pt_c or pf_c,
                party_vendor_id=pt_v or pf_v
            )

        return Response({
            'message': 'Amount saved successfully', 
            'id': instance.id, 
            'voucher_number': v_num,
            'next_voucher_number': next_v_num
        }, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        """
        Override to wrap updates in an atomic transaction and return 200.
        Fixes: 409 Conflict caused by super().update() passing constraint fields
        directly to the Voucher model's save().
        """
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        try:
            with db_transaction.atomic():
                updated_instance = serializer.save()
            return Response(self.get_serializer(updated_instance).data, status=status.HTTP_200_OK)
        except Exception as e:
            import traceback
            print(f"!!! Error in ReceiptVoucher update: {str(e)}\n{traceback.format_exc()}")
            return Response(
                {"message": f"Failed to update receipt voucher: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def perform_create(self, serializer):
        user = self.request.user
        if hasattr(user, 'tenant_id') and user.branch_id:
            serializer.save(tenant_id=user.branch_id)
        else:
            serializer.save()

    def perform_destroy(self, instance):
        tenant_id = instance.tenant_id
        items = list(instance.get_items()) # Capture before deletion
        
        # 1. Mirror deletion to portal
        try:
            delete_transaction_from_portal(instance)
        except Exception as e:
            print(f"!!! Failed to delete portal mirror: {e}")

        # 2. Delete the actual voucher
        instance.delete()
        
        # 3. Recalculate status for all affected invoices
        for it in items:
            ref_id = getattr(it, 'reference_id', None)
            if ref_id and str(ref_id).strip():
                try:
                    update_sales_invoice_payment_status(tenant_id, str(ref_id))
                except Exception as status_err:
                    print(f"!!! Status cleanup failed for invoice {ref_id}: {status_err}")

    @action(detail=False, methods=['get'], url_path='check-uniqueness')
    def check_uniqueness(self, request):
        ref_no = request.query_params.get('ref_no')
        tenant_id = self.request.user.branch_id if hasattr(self.request.user, 'tenant_id') else None
        
        if not tenant_id:
             tenant_id = request.headers.get('X-Branch-Id')

        # Check for Advance Ref or Voucher Number in the unified transaction table
        exists_voucher = Transaction.objects.filter(voucher_number=ref_no, tenant_id=tenant_id).exists() # type: ignore
        exists_advance = TransactionAllocation.objects.filter( # type: ignore
            reference_number=ref_no, 
            reference_type='ADVANCE',
            tenant_id=tenant_id
        ).exists()
        
        is_unique = not (exists_voucher or exists_advance or Voucher.objects.filter(voucher_number=ref_no, tenant_id=tenant_id).exists()) # type: ignore
        return Response({"is_unique": is_unique, "ref_no": ref_no})

# --- DEPRECATED VIEWSETS (Aliases to prevent runtime errors in urls.py) ---
VoucherReceiptSingleViewSet = ReceiptVoucherViewSet
VoucherReceiptBulkViewSet = ReceiptVoucherViewSet
