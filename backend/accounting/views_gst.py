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
        
        if tenant_id:
            queryset = SalesVoucher.objects.filter(tenant_id=tenant_id).exclude(status='cancelled')
        else:
            # Fallback for dev environments without auth
            queryset = SalesVoucher.objects.all()
            
        # Date Filtering logic
        year_str = self.request.query_params.get('year')
        month_str = self.request.query_params.get('month')
        
        if year_str and month_str:
            try:
                # Format "2024-25" -> Start: 2024, End: 2025
                if '-' in year_str:
                    start_year = int(year_str.split('-')[0])
                    end_year = start_year + 1
                    
                    months_map = {
                        'April': (4, start_year), 'May': (5, start_year), 'June': (6, start_year),
                        'July': (7, start_year), 'August': (8, start_year), 'September': (9, start_year),
                        'October': (10, start_year), 'November': (11, start_year), 'December': (12, start_year),
                        'January': (1, end_year), 'February': (2, end_year), 'March': (3, end_year)
                    }
                    
                    month_num, filter_year = months_map.get(month_str, (None, None))
                    if month_num and filter_year:
                        queryset = queryset.filter(date__year=filter_year, date__month=month_num)
            except Exception:
                pass # Fail silently on invalid date params
        
        return queryset

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
            }
)
        return Response(data)

    @action(detail=False, methods=['get'])
    def cdnr(self, request):
        """
        Get CDNR - Credit/Debit Notes (Registered)
        Returns credit and debit notes issued to registered taxpayers
        
        Required fields as per GSTR1:
        1. GSTIN/UIN*
        2. Name of Recipient
        3. Note Number*
        4. Note date*
        5. Note Type* (C=Credit Note, D=Debit Note)
        6. Place of Supply*
        7. Reverse charge* (Y/N)
        8. Note Supply Type* (Regular, SEZ with payment, etc.)
        9. Note value*
        10. Applicable % of Tax Rate
        11. Rate*
        12. Taxable value*
        13. Cess Amount
        """
        # TODO: Implement actual credit/debit note model and query
        # For now, returning empty list as placeholder
        # When credit/debit note transactions are implemented, query them here
        # similar to how B2B queries SalesVoucher
        
        # Example structure for future implementation:
        # vouchers = CreditDebitNote.objects.filter(
        #     tenant_id=self.request.user.tenant_id,
        #     note_type__in=['C', 'D'],
        #     customer_gstin__isnull=False
        # ).exclude(customer_gstin__exact='')
        
        data = []
        # When implemented, populate data like:
        # for note in vouchers:
        #     data.append({
        #         'gstin': note.customer_gstin,
        #         'recipient_name': note.customer_name,
        #         'note_number': note.note_number,
        #         'note_date': note.note_date,
        #         'note_type': note.note_type,  # 'C' or 'D'
        #         'place_of_supply': note.place_of_supply,
        #         'reverse_charge': note.reverse_charge,  # 'Y' or 'N'
        #         'note_supply_type': note.supply_type,  # 'Regular', 'SEZ', etc.
        #         'note_value': note.total_amount,
        #         'applicable_tax_rate': note.applicable_tax_rate,
        #         'rate': note.tax_rate,
        #         'taxable_value': note.taxable_amount,
        #         'cess_amount': note.cess_amount or 0
        #     })
        
        return Response(data)

    @action(detail=False, methods=['get'])
    def cdnur(self, request):
        """
        Get CDNUR - Credit/Debit Notes (Unregistered)
        Returns credit and debit notes issued to unregistered taxpayers
        
        Required fields as per GSTR1:
        1. UR Type* (B2CL, EXPWP, EXPWOP)
        2. Note Number*
        3. Note date*
        4. Note Type* (C=Credit Note, D=Debit Note)
        5. Place of Supply
        6. Note value*
        7. Applicable % of Tax Rate
        8. Rate*
        9. Taxable value
        10. Cess Amount
        """
        # TODO: Implement actual credit/debit note model for unregistered customers
        # For now, returning empty list as placeholder
        # When credit/debit note transactions are implemented, query them here
        # similar to how B2CL queries SalesVoucher for unregistered customers
        
        # Example structure for future implementation:
        # vouchers = CreditDebitNote.objects.filter(
        #     tenant_id=self.request.user.tenant_id,
        #     note_type__in=['C', 'D'],
        #     customer_gstin__isnull=True  # Unregistered customers
        # ) | CreditDebitNote.objects.filter(
        #     tenant_id=self.request.user.tenant_id,
        #     note_type__in=['C', 'D'],
        #     customer_gstin__exact=''  # Unregistered customers
        # )
        
        data = []
        # When implemented, populate data like:
        # for note in vouchers:
        #     # Determine UR Type based on note characteristics
        #     ur_type = 'B2CL'  # or 'EXPWP', 'EXPWOP'
        #     if note.is_export:
        #         ur_type = 'EXPWP' if note.export_with_payment else 'EXPWOP'
        #     
        #     data.append({
        #         'ur_type': ur_type,
        #         'note_number': note.note_number,
        #         'note_date': note.note_date,
        #         'note_type': note.note_type,  # 'C' or 'D'
        #         'place_of_supply': note.place_of_supply,
        #         'note_value': note.total_amount,
        #         'applicable_tax_rate': note.applicable_tax_rate,
        #         'rate': note.tax_rate,
        #         'taxable_value': note.taxable_amount,
        #         'cess_amount': note.cess_amount or 0
        #     })
        
        return Response(data)

    @action(detail=False, methods=['get'])
    def at(self, request):
        """
        Get AT - Advance Tax
        Returns advance tax collected (TCS/TDS)
        
        Required fields as per GSTR1:
        1. Place of Supply (POS)*
        2. Rate*
        3. Gross advance received*
        4. Cess Amount
        """
        # TODO: Implement actual advance tax model and query
        # For now, returning empty list as placeholder
        # When advance tax transactions are implemented, query them here
        
        # Example structure for future implementation:
        # advance_receipts = AdvanceTax.objects.filter(
        #     tenant_id=self.request.user.tenant_id,
        #     transaction_type='advance'
        # )
        
        data = []
        # When implemented, populate data like:
        # for receipt in advance_receipts:
        #     data.append({
        #         'place_of_supply': receipt.place_of_supply,
        #         'rate': receipt.tax_rate,
        #         'gross_advance_received': receipt.advance_amount,
        #         'cess_amount': receipt.cess_amount or 0
        #     })
        
        return Response(data)

    @action(detail=False, methods=['get'])
    def atadj(self, request):
        """
        Get ATADJ - Advance Tax Adjustment
        Returns adjustment of advance tax paid
        
        Required fields as per GSTR1:
        1. Place of Supply (POS)*
        2. Rate*
        3. Gross advance received* (adjusted amount)
        4. Cess Amount
        """
        # TODO: Implement actual advance tax adjustment model and query
        # For now, returning empty list as placeholder
        # When advance tax adjustment transactions are implemented, query them here
        
        # Example structure for future implementation:
        # adjustments = AdvanceTaxAdjustment.objects.filter(
        #     tenant_id=self.request.user.tenant_id,
        #     transaction_type='adjustment'
        # )
        
        data = []
        # When implemented, populate data like:
        # for adjustment in adjustments:
        #     data.append({
        #         'place_of_supply': adjustment.place_of_supply,
        #         'rate': adjustment.tax_rate,
        #         'gross_advance_received': adjustment.adjusted_amount,
        #         'cess_amount': adjustment.cess_amount or 0
        #     })
        
        return Response(data)

    @action(detail=False, methods=['get'])
    def exemp(self, request):
        """
        Get EXEMP - Exempted Supplies
        Returns details of exempted, nil-rated and non-GST supplies
        
        Required fields as per GSTR1:
        1. Description
        2. Nil rated supplies
        3. Exempted
        4. Non GST Supplies
        """
        # TODO: Implement actual exempted supplies tracking
        # For now, returning empty list as placeholder
        # When exempted supply tracking is implemented, query them here
        
        # Example structure for future implementation:
        # This typically includes categories like:
        # - Inter-State supplies to registered persons
        # - Intra-State supplies to registered persons
        # - Inter-State supplies to unregistered persons
        # - Intra-State supplies to unregistered persons
        
        data = []
        # When implemented, populate data like:
        # exempted_categories = [
        #     'Inter-State supplies to registered persons',
        #     'Intra-State supplies to registered persons',
        #     'Inter-State supplies to unregistered persons',
        #     'Intra-State supplies to unregistered persons'
        # ]
        # for category in exempted_categories:
        #     supplies = ExemptedSupply.objects.filter(
        #         tenant_id=self.request.user.tenant_id,
        #         category=category
        #     ).aggregate(
        #         nil_rated=Sum('nil_rated_amount'),
        #         exempted=Sum('exempted_amount'),
        #         non_gst=Sum('non_gst_amount')
        #     )
        #     data.append({
        #         'description': category,
        #         'nil_rated_supplies': supplies['nil_rated'] or 0,
        #         'exempted': supplies['exempted'] or 0,
        #         'non_gst_supplies': supplies['non_gst'] or 0
        #     })
        
        return Response(data)

    @action(detail=False, methods=['get'])
    def doc(self, request):
        """
        Get DOC - Document Details
        Returns summary of documents issued during the period
        
        Required fields as per GSTR1:
        1. Nature of Document* (Invoices, Credit Notes, Debit Notes, etc.)
        2. Sr. No From*
        3. Sr. No To*
        4. Total Number*
        5. Cancelled
        """
        # TODO: Implement actual document tracking
        # For now, returning empty list as placeholder
        # When document tracking is implemented, query them here
        
        # Example structure for future implementation:
        # document_types = ['Invoices', 'Credit Notes', 'Debit Notes', 'Delivery Challan']
        # for doc_type in document_types:
        #     docs = DocumentSummary.objects.filter(
        #         tenant_id=self.request.user.tenant_id,
        #         document_type=doc_type,
        #         period=period
        #     ).aggregate(
        #         min_sr=Min('serial_number'),
        #         max_sr=Max('serial_number'),
        #         total=Count('id'),
        #         cancelled_count=Count('id', filter=Q(status='cancelled'))
        #     )
        
        data = []
        # When implemented, populate data like:
        # data.append({
        #     'nature_of_document': doc_type,
        #     'sr_no_from': docs['min_sr'],
        #     'sr_no_to': docs['max_sr'],
        #     'total_number': docs['total'],
        #     'cancelled': docs['cancelled_count']
        # })
        
        return Response(data)

    @action(detail=False, methods=['get'])
    def hsnb2b(self, request):
        """Get HSN Summary B2B"""
        # Placeholder for HSN B2B logic
        return Response([])

    @action(detail=False, methods=['get'])
    def hsnb2c(self, request):
        """Get HSN Summary B2C"""
        # Placeholder for HSN B2C logic
        return Response([])
