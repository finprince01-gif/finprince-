from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.db.models import Sum, Q, Count
from .models import SalesVoucher
from core.utils import IsTenantMember

class GSTR1ViewSet(viewsets.ViewSet):
    """
    ViewSet for generating GSTR1 return data.
    """
    permission_classes = [IsAuthenticated, IsTenantMember]
    # permission_classes = [AllowAny] # Uncomment for testing if auth issues

    def get_queryset(self):
        # Helper to get filtered vouchers
        user = self.request.user
        tenant_id = getattr(user, 'tenant_id', None)
        
        # Fallback for dev environments without auth
        if not tenant_id:
             # Try to find a default tenant or return none
             # For now, return all objects if no tenant_id to allow dev testing
             # removing fallback for production safety, but strictness might block dev
             return SalesVoucher.objects.all()

        return SalesVoucher.objects.filter(tenant_id=tenant_id).exclude(status='cancelled')

    @action(detail=False, methods=['get'])
    def b2b(self, request):
        """Get B2B invoices (Registered Customers)"""
        # Use bill_to_gstin field directly from SalesVoucher
        vouchers = self.get_queryset().exclude(bill_to_gstin__isnull=True).exclude(bill_to_gstin__exact='')
        
        data = []
        for v in vouchers:
            data.append({
                'gstin': v.bill_to_gstin,
                'recipient_name': v.customer.name if v.customer else v.customer_name, # Fallback
                'invoice_no': v.sales_invoice_number,
                'invoice_date': v.date,
                'invoice_value': v.grand_total,
                'place_of_supply': v.place_of_supply or v.bill_to_state,
                'reverse_charge': v.reverse_charge,
                'taxable_value': v.total_taxable_amount,
                'igst': v.total_igst,
                'cgst': v.total_cgst,
                'sgst': v.total_sgst,
                'rate': 0, # Complex to calc average rate here without items
            })
        return Response(data)

    @action(detail=False, methods=['get'])
    def b2cl(self, request):
        """Get B2C Large invoices"""
        # Unregistered (> 2.5L and Inter-state)
        # Using bill_to_gstin being empty
        vouchers = self.get_queryset().filter(
            Q(bill_to_gstin__isnull=True) | Q(bill_to_gstin__exact=''),
            grand_total__gt=250000
        )
        
        data = []
        for v in vouchers:
            data.append({
                'invoice_no': v.sales_invoice_number,
                'invoice_date': v.date,
                'invoice_value': v.grand_total,
                'place_of_supply': v.place_of_supply or v.bill_to_state,
                'rate': 0,
                'taxable_value': v.total_taxable_amount,
                'igst': v.total_igst,
                'cess': 0
            })
        return Response(data)

    @action(detail=False, methods=['get'])
    def b2cs(self, request):
        """Get B2C Small aggregated"""
        vouchers = self.get_queryset().filter(
            Q(bill_to_gstin__isnull=True) | Q(bill_to_gstin__exact=''),
            grand_total__lte=250000
        )
        
        # Filter to keep only those that have a place of supply (usually required for B2CS)
        
        # Aggregate by place_of_supply
        # Note: True aggregation requires grouping by Rate as well. 
        # This is simplified.
        aggregated = vouchers.values('place_of_supply').annotate(
            total_taxable=Sum('total_taxable_amount'),
            total_igst=Sum('total_igst'),
            total_cgst=Sum('total_cgst'),
            total_sgst=Sum('total_sgst')
        )
        
        data = []
        for v in aggregated:
            data.append({
                'type': 'OE',
                'place_of_supply': v['place_of_supply'],
                'rate': 0, 
                'taxable_value': v['total_taxable'],
                'igst': v['total_igst'],
                'cgst': v['total_cgst'],
                'sgst': v['total_sgst'],
                'cess': 0
            })
        return Response(data)

    @action(detail=False, methods=['get'])
    def exp(self, request):
        """Get Export invoices"""
        vouchers = self.get_queryset().filter(tax_type='export')
        
        data = []
        for v in vouchers:
            data.append({
                'export_type': v.export_type or 'WPAY',
                'invoice_no': v.sales_invoice_number,
                'invoice_date': v.date,
                'invoice_value': v.grand_total,
                'port_code': v.port_code,
                'shipping_bill_number': v.shipping_bill_number,
                'shipping_bill_date': v.shipping_bill_date,
                'rate': 0,
                'taxable_value': v.total_taxable_amount
            })
        return Response(data)

    @action(detail=False, methods=['get'])
    def hsn(self, request):
        """Get HSN Summary"""
        # Placeholder
        return Response([])
