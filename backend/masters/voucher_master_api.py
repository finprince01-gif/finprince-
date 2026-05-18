"""
API ViewSets for Separate Voucher Master Tables
"""
from typing import Optional
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.core.exceptions import PermissionDenied
from rest_framework.decorators import action
from django.db import transaction as db_transaction
from django.db import models


from .models import (
    MasterVoucherSales,
    MasterVoucherCreditNote,
    MasterVoucherReceipts,
    MasterVoucherPurchases,
    MasterVoucherDebitNote,
    MasterVoucherPayments,
    MasterVoucherExpenses,
    MasterVoucherJournal,
    MasterVoucherContra
)
from .voucher_master_serializers import (
    MasterVoucherSalesSerializer,
    MasterVoucherCreditNoteSerializer,
    MasterVoucherReceiptsSerializer,
    MasterVoucherPurchasesSerializer,
    MasterVoucherDebitNoteSerializer,
    MasterVoucherPaymentsSerializer,
    MasterVoucherExpensesSerializer,
    MasterVoucherJournalSerializer,
    MasterVoucherContraSerializer
)


class BaseVoucherMasterViewSet(viewsets.ModelViewSet):
    """Base ViewSet for Voucher Master tables"""
    permission_classes = [IsAuthenticated]
    
    def get_tenant_id(self, request):
        """Extract tenant_id from the authenticated user"""
        user = request.user
        if hasattr(user, 'tenant_id'):
            return str(user.branch_id)
        raise PermissionDenied("User has no associated tenant")
    
    def get_queryset(self):
        """Filter by tenant_id"""
        try:
            tenant_id = self.get_tenant_id(self.request)
            qs = getattr(self, 'queryset', None)
            if qs is None:
                return models.QuerySet().none()
                
            queryset = qs.filter(tenant_id=tenant_id)
            if self.action == 'list':
                return queryset.filter(is_active=True)
            return queryset
        except:
            return models.QuerySet().none()
    
    def perform_create(self, serializer):
        """Set tenant_id and created_by on create"""
        tenant_id = self.get_tenant_id(self.request)
        created_by = self.request.user.username if hasattr(self.request.user, 'username') else None
        serializer.save(tenant_id=tenant_id, created_by=created_by)
    
    def perform_update(self, serializer):
        """Set updated_by on update"""
        updated_by = self.request.user.username if hasattr(self.request.user, 'username') else None
        serializer.save(updated_by=updated_by)



    def _format_invoice_number(self, config) -> str:
        # If current_number is not set, use start_from
        num = config.current_number
        if num is None:
            num = config.start_from or 1
            
        digits = config.required_digits or 4
        prefix = config.prefix or ''
        suffix = config.suffix or ''

        return f"{prefix}{str(num).zfill(digits)}{suffix}"

    def _get_db_max_number(self, series) -> Optional[int]:
        """
        Heuristic to find the maximum sequential number used in the database for this series.
        Helps recover from counter jumps or out-of-sync master tables.
        """
        from django.apps import apps
        from django.db.models import Max
        import re
        
        # Mapping from Master model to Transaction model
        model_map = {
            'MasterVoucherSales': ('accounting.VoucherSalesInvoiceDetails', 'sales_invoice_no'),
            'MasterVoucherCreditNote': ('accounting.VoucherCreditNoteSupplierDetails', 'credit_note_no'),
            'MasterVoucherPurchases': ('accounting.VoucherPurchaseDetails', 'purchase_invoice_no'),
            'MasterVoucherDebitNote': ('accounting.VoucherDebitNoteSupplierDetails', 'debit_note_no'),
            'MasterVoucherReceipts': ('accounting.Transaction', 'voucher_number'),
            'MasterVoucherPayments': ('accounting.Transaction', 'voucher_number'),
            'MasterVoucherExpenses': ('accounting.VoucherExpense', 'voucher_number'),
            'MasterVoucherJournal': ('accounting.VoucherJournal', 'voucher_number'),
            'MasterVoucherContra': ('accounting.VoucherContra', 'voucher_number'),
        }
        
        type_name = series.__class__.__name__
        if type_name not in model_map:
            return None
            
        model_path, field_name = model_map[type_name]
        
        try:
            Model = apps.get_model(model_path)
            v_name_clean = series.voucher_name.strip()
            prefix = series.prefix or ''
            suffix = series.suffix or ''
            
            # Phase 1: Direct DB Max (Efficient for large tables)
            query = Model.objects.filter(tenant_id=series.tenant_id)
            
            # Special handling for unified Transaction model
            if model_path == 'accounting.Transaction':
                v_type = 'PAYMENT' if type_name == 'MasterVoucherPayments' else 'RECEIPT'
                query = query.filter(transaction_type=v_type)
            else:
                if hasattr(Model, 'voucher_name'):
                    query = query.filter(voucher_name__iexact=v_name_clean)

            # CRITICAL: Filter by prefix/suffix so different series don't contaminate each other.
            # e.g. PAY000326-27 must NOT affect max calculation for CN*20 series.
            if prefix:
                query = query.filter(**{f'{field_name}__startswith': prefix})
            if suffix:
                query = query.filter(**{f'{field_name}__endswith': suffix})

            db_res = query.aggregate(max_val=Max(field_name))
            
            max_val = db_res.get('max_val')
            required_digits = series.required_digits or 4
            
            if max_val:
                clean_no = str(max_val)
                if prefix and clean_no.startswith(prefix):
                    clean_no = clean_no[len(prefix):]
                if suffix and clean_no.endswith(suffix):
                    clean_no = clean_no[:-len(suffix)]
                
                match = re.search(r'(\d+)', clean_no)
                if match:
                    try:
                        num_str = match.group(1)
                        num = int(num_str)
                        if len(num_str) <= required_digits + 2:
                            return num
                    except: pass

            # Phase 2: Fallback Scan (Scan last 500 records)
            query_fb = Model.objects.filter(tenant_id=series.tenant_id)
            if model_path == 'accounting.Transaction':
                v_type = 'PAYMENT' if type_name == 'MasterVoucherPayments' else 'RECEIPT'
                query_fb = query_fb.filter(transaction_type=v_type)
            elif hasattr(Model, 'voucher_name'):
                query_fb = query_fb.filter(voucher_name__iexact=v_name_clean)

            # Apply prefix/suffix filter here too
            if prefix:
                query_fb = query_fb.filter(**{f'{field_name}__startswith': prefix})
            if suffix:
                query_fb = query_fb.filter(**{f'{field_name}__endswith': suffix})

            records = query_fb.order_by('-id')[:500].values_list(field_name, flat=True)
            
            max_num = 0
            for no in records:
                if not no: continue
                clean_no = str(no)
                if series.prefix and clean_no.startswith(series.prefix):
                    clean_no = clean_no[len(series.prefix):]
                if series.suffix and clean_no.endswith(series.suffix):
                    clean_no = clean_no[:-len(series.suffix)]
                
                match = re.search(r'(\d+)', clean_no)
                if match:
                    try:
                        num_str = match.group(1)
                        num = int(num_str)
                        if len(num_str) <= required_digits + 2:
                            if num > max_num:
                                max_num = num
                    except: pass
            
            return max_num if max_num > 0 else None
        except Exception as e:
            print(f"[VoucherMaster] Failed to fetch DB max for {type_name}: {e}")
            return None

    @action(detail=True, methods=['get'], url_path='next-number')
    def next_number(self, request, pk=None):
        series = self.get_object()
        
        # SMART SYNC: Align counter with actual database state
        db_max = self._get_db_max_number(series)
        expected_next = (series.current_number or series.start_from or 1)
        
        needs_save = False
        if db_max is not None:
            # Only move counter FORWARD if it's behind the actual DB state.
            # Never pull it backward automatically, as users might have intentionally skipped numbers.
            if db_max >= expected_next:
                series.current_number = db_max + 1
                needs_save = True
        
        if needs_save:
            series.save(update_fields=['current_number', 'updated_at'])
            print(f"[VoucherMaster] Corrected series '{series.voucher_name}' to {series.current_number} (DB Max was {db_max})")
        
        invoice_number = self._format_invoice_number(series)
        return Response({
            'invoice_number': invoice_number,
            'current_number': series.current_number,
            'series_name': series.voucher_name,
        })

    @action(detail=True, methods=['post'], url_path='increment-number')
    def increment_number(self, request, pk=None):
        with db_transaction.atomic():
            qs = getattr(self, 'queryset', None)
            model = qs.model if qs is not None else None
            if not model:
                return Response({"error": "Model not found"}, status=400)
                
            series = model.objects.select_for_update().get(pk=pk)
            assigned_number = self._format_invoice_number(series)
            series.current_number = (series.current_number or series.start_from or 1) + 1
            series.save(update_fields=['current_number', 'updated_at'])

        next_invoice_number = self._format_invoice_number(series)
        return Response({
            'assigned_number': assigned_number,
            'next_invoice_number': next_invoice_number,
            'new_current_number': series.current_number,
            'series_name': series.voucher_name,
        })

class MasterVoucherSalesViewSet(BaseVoucherMasterViewSet):
    """ViewSet for Sales Voucher Master"""
    queryset = MasterVoucherSales.objects.all() # type: ignore
    serializer_class = MasterVoucherSalesSerializer




class MasterVoucherCreditNoteViewSet(BaseVoucherMasterViewSet):
    """ViewSet for Credit Note Voucher Master"""
    queryset = MasterVoucherCreditNote.objects.all() # type: ignore
    serializer_class = MasterVoucherCreditNoteSerializer


class MasterVoucherReceiptsViewSet(BaseVoucherMasterViewSet):
    """ViewSet for Receipts Voucher Master"""
    queryset = MasterVoucherReceipts.objects.all() # type: ignore
    serializer_class = MasterVoucherReceiptsSerializer


class MasterVoucherPurchasesViewSet(BaseVoucherMasterViewSet):
    """ViewSet for Purchases Voucher Master"""
    queryset = MasterVoucherPurchases.objects.all() # type: ignore
    serializer_class = MasterVoucherPurchasesSerializer


class MasterVoucherDebitNoteViewSet(BaseVoucherMasterViewSet):
    """ViewSet for Debit Note Voucher Master"""
    queryset = MasterVoucherDebitNote.objects.all() # type: ignore
    serializer_class = MasterVoucherDebitNoteSerializer


class MasterVoucherPaymentsViewSet(BaseVoucherMasterViewSet):
    """ViewSet for Payments Voucher Master"""
    queryset = MasterVoucherPayments.objects.all() # type: ignore
    serializer_class = MasterVoucherPaymentsSerializer


class MasterVoucherExpensesViewSet(BaseVoucherMasterViewSet):
    """ViewSet for Expenses Voucher Master"""
    queryset = MasterVoucherExpenses.objects.all() # type: ignore
    serializer_class = MasterVoucherExpensesSerializer


class MasterVoucherJournalViewSet(BaseVoucherMasterViewSet):
    """ViewSet for Journal Voucher Master"""
    queryset = MasterVoucherJournal.objects.all() # type: ignore
    serializer_class = MasterVoucherJournalSerializer


class MasterVoucherContraViewSet(BaseVoucherMasterViewSet):
    """ViewSet for Contra Voucher Master"""
    queryset = MasterVoucherContra.objects.all() # type: ignore
    serializer_class = MasterVoucherContraSerializer
