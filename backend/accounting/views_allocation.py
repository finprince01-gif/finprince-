from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Q
from django.db import transaction
from .models import (
    MasterLedger, JournalEntry, Voucher, PendingTransaction,
    AdvanceAllocation, VoucherAllocation
)
import datetime

class VoucherAllocationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = PendingTransaction.objects.filter(reference_type='invoice')

    def get_queryset(self):
        tenant_id = getattr(self.request.user, 'tenant_id', None)
        if not tenant_id:
             tenant_id = self.request.headers.get('X-Branch-Id')
        return self.queryset.filter(tenant_id=tenant_id)

    def _get_tenant_id(self, request):
        tenant_id = getattr(request.user, 'tenant_id', None)
        if not tenant_id:
             tenant_id = request.headers.get('X-Branch-Id')
        return tenant_id

    @action(detail=False, methods=['get'], url_path='ledger/(?P<ledger_id>[^/.]+)/entries')
    def ledger_entries(self, request, ledger_id=None):
        """
        GET /ledger/{ledger_id}/entries
        Return all ledger transactions with running balance
        """
        tenant_id = self._get_tenant_id(request)
        
        # Get opening balance from MasterLedger if available
        ledger = MasterLedger.objects.filter(id=ledger_id, tenant_id=tenant_id).first()
        if not ledger:
            return Response({"error": "Ledger not found"}, status=404)
            
        opening_balance = 0
        if ledger.additional_data and isinstance(ledger.additional_data, dict):
            opening_balance = float(ledger.additional_data.get('opening_balance', 0))

        entries = JournalEntry.objects.filter(
            tenant_id=tenant_id,
            ledger_id=ledger_id
        ).order_by('transaction_date', 'created_at')

        is_debtor = (ledger.group == 'Sundry Debtors')
        is_creditor = (ledger.group == 'Sundry Creditors')
        
        results = []
        running_balance = opening_balance
        
        # Add opening balance row
        results.append({
            'id': 0,
            'date': None,
            'voucher_type': 'Opening Balance',
            'voucher_id': None,
            'voucher_number': '',
            'narration': 'Opening Balance',
            'debit': 0,
            'credit': 0,
            'balance': float(running_balance)
        })

        for entry in entries:
            if is_debtor:
                change = float(entry.debit) - float(entry.credit)
            elif is_creditor:
                change = float(entry.credit) - float(entry.debit)
            else:
                change = float(entry.debit) - float(entry.credit)
            
            running_balance += change
            
            results.append({
                'id': entry.id,
                'date': entry.transaction_date,
                'voucher_type': entry.voucher_type,
                'voucher_id': entry.voucher_id,
                'voucher_number': entry.voucher_number,
                'narration': entry.narration,
                'debit': float(entry.debit),
                'credit': float(entry.credit),
                'balance': float(running_balance)
            })
        
        # Return newest first
        return Response(results[::-1])

    @action(detail=False, methods=['get'], url_path='voucher/(?P<voucher_id>[^/.]+)/allocations')
    def voucher_allocations_detail(self, request, voucher_id=None):
        """
        GET /voucher/{voucher_id}/allocations?type=...
        """
        tenant_id = self._get_tenant_id(request)
        v_type = request.query_params.get('type') # PAYMENT, RECEIPT, SALES, PURCHASE
        
        if not v_type:
            return Response({"error": "Type is required"}, status=400)

        # Map frontend type to backend Voucher type
        type_map = {
            'PAYMENT': 'payment',
            'RECEIPT': 'receipt',
            'SALES': 'sales',
            'PURCHASE': 'purchase'
        }
        
        v = Voucher.objects.filter(id=voucher_id, type=type_map.get(v_type), tenant_id=tenant_id).first()
        if not v:
             # Try reference_id
             v = Voucher.objects.filter(reference_id=voucher_id, type=type_map.get(v_type), tenant_id=tenant_id).first()
        
        if not v:
            return Response({"error": "Voucher not found"}, status=404)

        v_id_for_query = v.id # Use the ID from the Voucher table for generic mapping
        v_amount = float(v.total if v.total and v.total > 0 else (v.amount if v.amount else 0))
        if v_amount == 0:
             v_amount = float(v.total_debit if v.total_debit > 0 else v.total_credit)

        # Fetch Allocations from multiple tables
        from accounting.models import VoucherAdvanceAdjustment
        if v_type in ['PAYMENT', 'RECEIPT']:
            # For Payment/Receipt, these are sources of advances
            # History is where these advances were used
            allocs = PendingTransaction.objects.filter(tenant_id=tenant_id, transaction_id=v_id_for_query)
            adjs = VoucherAdvanceAdjustment.objects.filter(tenant_id=tenant_id, advance_voucher=v)
            
            total_allocated = (allocs.aggregate(Sum('allocated_amount'))['allocated_amount__sum'] or 0) + \
                              (adjs.aggregate(Sum('amount'))['amount__sum'] or 0)
            
            history = [{
                'target_id': a.reference_number,
                'target_number': a.reference_number,
                'type': a.reference_type,
                'amount': float(a.allocated_amount),
                'date': a.created_at
            } for a in allocs] + [{
                'target_id': adj.target_voucher.id,
                'target_number': adj.target_voucher.voucher_number,
                'type': 'ADJUSTMENT',
                'amount': float(adj.amount),
                'date': adj.adjustment_date
            } for adj in adjs]
        else: # SALES, PURCHASE (Targets)
            # Find where these invoices were paid from
            allocs = PendingTransaction.objects.filter(tenant_id=tenant_id, reference_number=v.voucher_number)
            adjs = VoucherAdvanceAdjustment.objects.filter(tenant_id=tenant_id, target_voucher=v)
            
            total_allocated = (allocs.aggregate(Sum('allocated_amount'))['allocated_amount__sum'] or 0) + \
                              (adjs.aggregate(Sum('amount'))['amount__sum'] or 0)
            
            history = [{
                'source_id': a.transaction_id,
                'source_number': a.transaction.voucher_number if a.transaction else None,
                'type': a.type,
                'amount': float(a.allocated_amount),
                'date': a.created_at
            } for a in allocs] + [{
                'source_id': adj.advance_voucher.id,
                'source_number': adj.advance_voucher.voucher_number,
                'type': 'ADVANCE_ADJ',
                'amount': float(adj.amount),
                'date': adj.adjustment_date
            } for adj in adjs]

        return Response({
            'voucher_id': v_id_for_query,
            'type': v_type,
            'total_amount': v_amount,
            'total_allocated': float(total_allocated),
            'balance': float(v_amount - float(total_allocated)),
            'allocation_history': history
        })

    @action(detail=False, methods=['post'], url_path='allocate')
    def allocate(self, request):
        """
        POST /allocations/allocate
        """
        tenant_id = self._get_tenant_id(request)
        data = request.data
        ledger_id = data.get('ledger_id')
        source_id = data.get('source_voucher_id')
        target_id = data.get('target_voucher_id')
        amount = float(data.get('amount', 0))
        source_type = data.get('source_type')
        target_type = data.get('target_type')

        if not all([ledger_id, source_id, target_id, amount, source_type, target_type]):
            return Response({"error": "Missing fields"}, status=400)

        with transaction.atomic():
            # Validate Invoice Balance
            target_v = Voucher.objects.get(id=target_id, tenant_id=tenant_id)
            target_total = float(target_v.total or target_v.amount or 0)
            target_allocated = PendingTransaction.objects.filter(
                reference_number=target_v.voucher_number, tenant_id=tenant_id
            ).aggregate(total=Sum('allocated_amount'))['total'] or 0
            
            if amount > (target_total - float(target_allocated)) + 0.01:
                 return Response({"error": "Amount exceeds invoice balance"}, status=400)

            alloc = PendingTransaction.objects.create(
                tenant_id=tenant_id,
                pay_to_ledger_id=ledger_id,
                transaction_id=source_id,
                type=source_type,
                reference_number=target_v.voucher_number,
                reference_type='invoice',
                amount_applied=amount,
                status='paid'
            )
            return Response({"status": "success", "id": alloc.id})

    @action(detail=False, methods=['get'], url_path='ledger/(?P<ledger_id>[^/.]+)/allocation-candidates')
    def allocation_candidates(self, request, ledger_id=None):
        tenant_id = self._get_tenant_id(request)
        portal_type = request.query_params.get('portal') # customer or vendor

        if portal_type == 'customer':
            source_type = 'RECEIPT'
            target_type = 'SALES'
        else:
            source_type = 'PAYMENT'
            target_type = 'PURCHASE'

        # Fetch all vouchers for this ledger
        v_ids = JournalEntry.objects.filter(
            tenant_id=tenant_id, ledger_id=ledger_id
        ).values_list('voucher_id', flat=True).distinct()
        
        vouchers = Voucher.objects.filter(id__in=v_ids, tenant_id=tenant_id)

        sources = vouchers.filter(type=source_type.lower())
        targets = vouchers.filter(type=target_type.lower())

        open_invoices = []
        for t in targets:
            total = float(t.total or t.amount or 0)
            allocated = PendingTransaction.objects.filter(
                reference_number=t.voucher_number, 
                reference_type__iexact='invoice', 
                tenant_id=tenant_id
            ).aggregate(total=Sum('allocated_amount'))['total'] or 0
            balance = total - float(allocated)
            if balance > 0.01:
                open_invoices.append({
                    'id': t.id,
                    'date': t.date,
                    'number': t.voucher_number,
                    'total': total,
                    'balance': balance
                })

        available_advances = []
        from accounting.services.advance_service import get_allocated_amount
        for s in sources:
            total = float(s.total or s.amount or 0)
            # Use centralized service to sum VoucherAdvanceAdjustment, PendingTransaction, etc.
            allocated = get_allocated_amount(s.id, s.type, tenant_id, ref_no=s.voucher_number)
            
            balance = total - float(allocated)
            if balance > 0.01:
                available_advances.append({
                    'id': s.id,
                    'date': s.date,
                    'number': s.voucher_number,
                    'total': total,
                    'balance': balance
                })

        return Response({
            "open_invoices": open_invoices,
            "available_advances": available_advances
        })
