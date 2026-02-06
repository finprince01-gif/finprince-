from rest_framework import viewsets, status
import pandas as pd
import io
import json
from django.http import HttpResponse, FileResponse
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.db.models import Sum, Q, Count, Min, Max
from accounting.models_voucher_sales import VoucherSalesInvoiceDetails, VoucherSalesItems
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
            # queryset = VoucherSalesInvoiceDetails.objects.filter(tenant_id=tenant_id)
            queryset = VoucherSalesInvoiceDetails.objects.all() # Temporary Bypass for local dev
        else:
            # Fallback
            queryset = VoucherSalesInvoiceDetails.objects.all()
            
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
        vouchers = self.get_queryset().exclude(gstin__isnull=True).exclude(gstin__exact='')
        
        data = []
        for v in vouchers:
            pay = getattr(v, 'payment_details', None)
            val = pay.payment_invoice_value if pay else 0
            taxable = pay.payment_taxable_value if pay else 0
            igst = pay.payment_igst if pay else 0
            cgst = pay.payment_cgst if pay else 0
            sgst = pay.payment_sgst if pay else 0

            # Determine POS
            pos = ''
            if v.gstin and len(v.gstin) >= 2:
                pos = v.gstin[:2]
            elif v.state_type == 'within': pos = '29' 
            elif v.state_type == 'other': pos = '27'

            data.append({
                'gstin': v.gstin,
                'recipient_name': v.customer_name,
                'invoice_no': v.sales_invoice_no,
                'invoice_date': v.date,
                'invoice_value': val,
                'place_of_supply': pos,
                'reverse_charge': 'N',
                'taxable_value': taxable,
                'igst': igst,
                'cgst': cgst,
                'sgst': sgst,
                'rate': 0, 
            })
        return Response(data)

    @action(detail=False, methods=['get'])
    def b2cl(self, request):
        """Get B2C Large invoices"""
        # Logic: Filter conceptually first, but since grand_total is in related table, iterate
        all_vouchers = self.get_queryset().filter(Q(gstin__isnull=True) | Q(gstin__exact=''))
        
        data = []
        for v in all_vouchers:
            pay = getattr(v, 'payment_details', None)
            val = pay.payment_invoice_value if pay else 0
            if val <= 250000: continue # Skip if not large
            if v.state_type != 'other': continue # Skip if not interstate

            taxable = pay.payment_taxable_value if pay else 0
            igst = pay.payment_igst if pay else 0
            
            # POS
            pos = '27' # Default Interstate

            data.append({
                'invoice_no': v.sales_invoice_no,
                'invoice_date': v.date,
                'invoice_value': val,
                'place_of_supply': pos,
                'rate': 0,
                'taxable_value': taxable,
                'igst': igst,
                'cess': 0
            })
        return Response(data)

    @action(detail=False, methods=['get'])
    def b2cs(self, request):
        """Get B2C Small aggregated"""
        all_vouchers = self.get_queryset().filter(Q(gstin__isnull=True) | Q(gstin__exact=''))
        
        # Manually aggregate
        agg_map = {} # POS -> {taxable, igst...}

        for v in all_vouchers:
            pay = getattr(v, 'payment_details', None)
            val = pay.payment_invoice_value if pay else 0
            
            # Filter condition: Small (<2.5L) OR Intra-state
            is_large_inter = (val > 250000 and v.state_type == 'other')
            if is_large_inter: continue 
            
            taxable = pay.payment_taxable_value if pay else 0
            igst = pay.payment_igst if pay else 0
            cgst = pay.payment_cgst if pay else 0
            sgst = pay.payment_sgst if pay else 0

            # POS
            pos = '29' if v.state_type == 'within' else '27'
            
            if pos not in agg_map:
                agg_map[pos] = {'taxable': 0, 'igst': 0, 'cgst': 0, 'sgst': 0}
            
            agg_map[pos]['taxable'] += float(taxable)
            agg_map[pos]['igst'] += float(igst)
            agg_map[pos]['cgst'] += float(cgst)
            agg_map[pos]['sgst'] += float(sgst)

        data = []
        for pos, vals in agg_map.items():
            data.append({
                'type': 'OE',
                'place_of_supply': pos,
                'rate': 0, 
                'taxable_value': vals['taxable'],
                'igst': vals['igst'],
                'cgst': vals['cgst'],
                'sgst': vals['sgst'],
                'cess': 0
            })
        return Response(data)

    @action(detail=False, methods=['get'])
    def exp(self, request):
        """Get Export invoices"""
        # tax_type for export might be 'export'
        vouchers = self.get_queryset().filter(state_type='export')
        
        data = []
        for v in vouchers:
            pay = getattr(v, 'payment_details', None)
            val = pay.payment_invoice_value if pay else 0
            taxable = pay.payment_taxable_value if pay else 0

            data.append({
                'export_type': v.export_type or 'WPAY',
                'invoice_no': v.sales_invoice_no,
                'invoice_date': v.date,
                'invoice_value': val,
                'port_code': '',
                'shipping_bill_number': '',
                'shipping_bill_date': '',
                'rate': 0,
                'taxable_value': taxable
            })
        return Response(data)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Returns counts for each GSTR1 category for the selected period"""
        queryset = self.get_queryset()
        
        # B2B
        b2b_count = queryset.exclude(gstin__isnull=True).exclude(gstin__exact='').count()
        
        # Unregistered (conceptually B2C)
        unreg = queryset.filter(Q(gstin__isnull=True) | Q(gstin__exact=''))
        
        # We need to iterate or use complex annotation because grand_total is in related table
        b2cl_count = 0
        b2cs_count = 0
        for v in unreg:
            val = getattr(v.payment_details, 'payment_invoice_value', 0) if hasattr(v, 'payment_details') else 0
            if val > 250000 and v.state_type == 'other':
                b2cl_count += 1
            else:
                b2cs_count += 1
        
        exp_count = queryset.filter(state_type='export').count()

        return Response({
            'B2B': b2b_count,
            'B2CL': b2cl_count,
            'B2CS': b2cs_count,
            'EXP': exp_count,
            # Placeholder for others
            'CDNR': 0,
            'CDNUR': 0,
            'AT': 0,
            'ATADJ': 0,
            'HSN': 0,
            'DOC': 0
        })

    @action(detail=False, methods=['get'])
    def cdnr(self, request):
        """Get CDNR - Credit/Debit Notes (Registered)"""
        # TODO: Implement actual credit/debit note model and query
        return Response([])

    @action(detail=False, methods=['get'])
    def cdnur(self, request):
        """Get CDNUR - Credit/Debit Notes (Unregistered)"""
        # TODO: Implement actual credit/debit note model for unregistered customers
        return Response([])

    @action(detail=False, methods=['get'])
    def at(self, request):
        """Get AT - Advance Tax"""
        # Not fully implemented in SalesVoucherPaymentDetails independently as a transaction
        # But we can check for booking advance? 
        # For now placeholder, as Advance Receipt is usually a separate voucher type in other systems
        return Response([])

    @action(detail=False, methods=['get'])
    def atadj(self, request):
        """
        Get ATADJ - Advance Tax Adjustment
        Query vouchers where advance was used/adjusted.
        """
        queryset = self.get_queryset()
        data = []
        
        for v in queryset:
            pay = getattr(v, 'payment_details', None)
            if pay and pay.payment_advance > 0: # Adjusted advance
                # Determine POS
                pos = ''
                if v.gstin and len(v.gstin) >= 2:
                    pos = v.gstin[:2]
                elif v.state_type == 'within': pos = '29' 
                elif v.state_type == 'other': pos = '27'
                
                # Assuming rate is 0 for composite, or derived from items. 
                # Ideally need weighted average rate or separate rows. 
                # Simplifying: Rate 0 or need logic.
                
                data.append({
                    'place_of_supply': pos,
                    'rate': 0, # Placeholder, needs item level logic
                    'gross_advance_received': pay.payment_advance, # Adjusted amount
                    'cess_amount': 0
                })
        
        return Response(data)

    @action(detail=False, methods=['get'])
    def exemp(self, request):
        """Get EXEMP - Exempted Supplies"""
        return Response([])

    @action(detail=False, methods=['get'])
    def doc(self, request):
        """
        Get DOC - Document Details
        From VoucherSalesInvoiceDetails
        """
        queryset = self.get_queryset()
        
        # Invoices
        inv_count = queryset.count()
        min_no = queryset.aggregate(Min('sales_invoice_no'))['sales_invoice_no__min']
        max_no = queryset.aggregate(Max('sales_invoice_no'))['sales_invoice_no__max']
        
        data = []
        if inv_count > 0:
            data.append({
                'nature_of_document': 'Invoices for outward supply',
                'sr_no_from': min_no,
                'sr_no_to': max_no,
                'total_number': inv_count,
                'cancelled': 0 # TODO: Add status check
            })
            
        return Response(data)

    def _get_hsn_pandas(self, queryset, is_b2b):
        """
        Helper to calculate HSN summary using Pandas.
        Avoids Django ORM aggregation errors.
        """
        # Fetch items with invoice__gstin
        items_qs = VoucherSalesItems.objects.filter(invoice__in=queryset).values(
            'hsn_sac', 'uom', 'item_rate', 'qty', 'invoice_value', 
            'taxable_value', 'igst', 'cgst', 'cess', 'invoice__gstin'
        )
        
        if not items_qs.exists():
            return []
            
        df = pd.DataFrame(items_qs)
        
        # Ensure numeric types
        numeric_cols = ['qty', 'invoice_value', 'taxable_value', 'igst', 'cgst', 'cess']
        for col in numeric_cols:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
            
        # Determine B2B/B2C
        df['is_b2b'] = df['invoice__gstin'].apply(lambda x: True if (x and str(x).strip()) else False)
        
        if is_b2b:
            df_filtered = df[df['is_b2b']]
        else:
            df_filtered = df[~df['is_b2b']]
            
        if df_filtered.empty:
            return []

        # Aggregate
        # Group by HSN, UOM, Rate
        grouped = df_filtered.groupby(['hsn_sac', 'uom', 'item_rate'], as_index=False).sum()
        
        data = []
        for _, row in grouped.iterrows():
            data.append({
                'hsn': row['hsn_sac'],
                'description': '', # Optional
                'uqc': row['uom'],
                'total_quantity': row['qty'],
                'total_value': row['invoice_value'],
                'rate': row['item_rate'],
                'taxable_value': row['taxable_value'],
                'integrated_tax_amount': row['igst'],
                'central_tax_amount': row['cgst'],
                'state_ut_tax_amount': row['cgst'], # Assumption
                'cess_amount': row['cess']
            })
        return data

    @action(detail=False, methods=['get'])
    def hsnb2b(self, request):
        """Get HSN Summary B2B"""
        # Registered Invoices logic is handled by _get_hsn_pandas(is_b2b=True)
        # Note: 'queryset' passed to helper must be the base filtered vouchers 
        # (date filtered), filtering for GSTIN happens inside helper.
        data = self._get_hsn_pandas(self.get_queryset(), is_b2b=True)
        return Response(data)

    @action(detail=False, methods=['get'])
    def hsnb2c(self, request):
        """Get HSN Summary B2C"""
        data = self._get_hsn_pandas(self.get_queryset(), is_b2b=False)
        return Response(data)

    @action(detail=False, methods=['get'])
    def download_excel(self, request):
        try:
            queryset = self.get_queryset()
            # 1. Fetch Data using existing Views to ensure 100% alignment with Frontend
            
            # Helper to extract data
            def get_data(method):
                response = method(request)
                if hasattr(response, 'data'):
                    return response.data
                return []

            # B2B
            b2b_rows = get_data(self.b2b)
            b2b_data = pd.DataFrame(b2b_rows)
            if not b2b_data.empty:
                b2b_data = b2b_data.rename(columns={
                    'gstin': 'GSTIN',
                    'recipient_name': 'Recipient Name',
                    'invoice_no': 'Invoice No',
                    'invoice_date': 'Invoice Date',
                    'invoice_value': 'Invoice Value',
                    'place_of_supply': 'Place of Supply',
                    'reverse_charge': 'Rev. Charge',
                    'taxable_value': 'Taxable Value',
                    'igst': 'IGST', 
                    'cgst': 'CGST', 
                    'sgst': 'SGST'
                })

            # B2CL
            b2cl_rows = get_data(self.b2cl)
            b2cl_data = pd.DataFrame(b2cl_rows)
            if not b2cl_data.empty:
                b2cl_data = b2cl_data.rename(columns={
                    'invoice_no': 'Invoice No',
                    'invoice_date': 'Invoice Date',
                    'invoice_value': 'Invoice Value',
                    'place_of_supply': 'Place of Supply',
                    'rate': 'Rate',
                    'taxable_value': 'Taxable Value',
                    'igst': 'IGST'
                })

            # B2CS
            b2cs_rows = get_data(self.b2cs)
            b2cs_data = pd.DataFrame(b2cs_rows)
            if not b2cs_data.empty:
                b2cs_data = b2cs_data.rename(columns={
                    'type': 'Type', # Note: Frontend view might use lowercase keys
                    'Type': 'Type', # Just in case
                    'place_of_supply': 'Place of Supply',
                    'Place of Supply': 'Place of Supply',
                    'rate': 'Rate',
                    'taxable_value': 'Taxable Value',
                    'igst': 'IGST',
                    'cgst': 'CGST',
                    'sgst': 'SGST'
                })

            # EXP
            exp_rows = get_data(self.exp)
            exp_data = pd.DataFrame(exp_rows)
            if not exp_data.empty:
                exp_data = exp_data.rename(columns={
                    'export_type': 'Export Type',
                    'invoice_no': 'Invoice No',
                    'invoice_date': 'Invoice Date',
                    'invoice_value': 'Invoice Value',
                    'port_code': 'Port Code',
                    'shipping_bill_number': 'SB No',
                    'shipping_bill_date': 'SB Date',
                    'item_rate': 'Rate',
                    'taxable_value': 'Taxable Value'
                })

            # ATADJ
            atadj_rows = get_data(self.atadj)
            atadj_data = pd.DataFrame(atadj_rows)
            if not atadj_data.empty:
                atadj_data = atadj_data.rename(columns={
                    'place_of_supply': 'Place of Supply(POS)*',
                    'rate': 'Rate*',
                    'gross_advance_received': 'Gross advance received*',
                    'cess': 'Cess Amount'
                })

            # DOC
            doc_rows = get_data(self.doc)
            doc_data = pd.DataFrame(doc_rows)
            if not doc_data.empty:
                doc_data = doc_data.rename(columns={
                    'nature_of_document': 'Nature of Document*',
                    'sr_no_from': 'Sr. No From*',
                    'sr_no_to': 'Sr. No To*',
                    'total_number': 'Total Number*',
                    'cancelled': 'Cancelled'
                })

            # HSN Logic (Direct Pandas Implementation to avoid ORM errors)
            # Fetch invoice__gstin to split B2B/B2C
            items_qs = VoucherSalesItems.objects.filter(invoice__in=queryset).values(
                'hsn_sac', 'uom', 'item_rate', 'qty', 'invoice_value', 
                'taxable_value', 'igst', 'cgst', 'cess', 'invoice__gstin'
            )
            
            hsn_b2b_rows = []
            hsn_b2c_rows = []
            
            hsn_b2b_data = pd.DataFrame()
            hsn_b2c_data = pd.DataFrame()

            if items_qs.exists():
                df_hsn = pd.DataFrame(items_qs)
                # Ensure numeric types
                numeric_cols = ['qty', 'invoice_value', 'taxable_value', 'igst', 'cgst', 'cess']
                for col in numeric_cols:
                    df_hsn[col] = pd.to_numeric(df_hsn[col], errors='coerce').fillna(0)
                
                # Split B2B (Has GSTIN) vs B2C (No GSTIN)
                # Check for None or Empty String
                df_hsn['is_b2b'] = df_hsn['invoice__gstin'].apply(lambda x: True if (x and str(x).strip()) else False)
                
                df_b2b = df_hsn[df_hsn['is_b2b']]
                df_b2c = df_hsn[~df_hsn['is_b2b']]
                
                # GroupBy Helper
                def aggregate_hsn(df, target_list):
                    if df.empty: return
                    grouped = df.groupby(['hsn_sac', 'uom', 'item_rate'], as_index=False).sum()
                    for _, row in grouped.iterrows():
                        target_list.append({
                            'HSN*': row['hsn_sac'],
                            'Description': '',
                            'UQC*': row['uom'],
                            'Total Quantity*': row['qty'],
                            'Total Value': row['invoice_value'],
                            'Rate': row['item_rate'],
                            'Taxable Value*': row['taxable_value'],
                            'Integrated Tax Amount': row['igst'],
                            'Central Tax Amount': row['cgst'],
                            'State/UT Tax Amount': row['cgst'], # Assumption
                            'Cess Amount': row['cess']
                        })

                aggregate_hsn(df_b2b, hsn_b2b_rows)
                aggregate_hsn(df_b2c, hsn_b2c_rows)
            
            hsn_b2b_data = pd.DataFrame(hsn_b2b_rows)
            hsn_b2c_data = pd.DataFrame(hsn_b2c_rows)

            
            # Validation for columns
            cols_b2b = ['GSTIN', 'Recipient Name', 'Invoice No', 'Invoice Date', 'Invoice Value', 'Place of Supply', 'Rev. Charge', 'Taxable Value', 'IGST', 'CGST', 'SGST']
            cols_b2cl = ['Invoice No', 'Invoice Date', 'Invoice Value', 'Place of Supply', 'Rate', 'Taxable Value', 'IGST']
            cols_b2cs = ['Type', 'Place of Supply', 'Rate', 'Taxable Value', 'IGST', 'CGST', 'SGST']
            cols_exp = ['Export Type', 'Invoice No', 'Invoice Date', 'Invoice Value', 'Port Code', 'SB No', 'SB Date', 'Rate', 'Taxable Value']
            cols_cdnr = ['GSTIN/UIN*', 'Name of Recipient', 'Note Number*', 'Note date*', 'Note Type*', 'Place of Supply*', 'Reverse charge*', 'Note Supply Type*', 'Note value*', 'Applicable % of Tax Rate', 'Rate*', 'Taxable value*', 'Cess Amount']
            cols_cdnur = ['UR Type*', 'Note Number*', 'Note date*', 'Note Type*', 'Place of Supply', 'Note value*', 'Applicable % of Tax Rate', 'Rate*', 'Taxable value', 'Cess Amount']
            cols_at = ['Place of Supply(POS)*', 'Rate*', 'Gross advance received*', 'Cess Amount']
            cols_atadj = ['Place of Supply(POS)*', 'Rate*', 'Gross advance received*', 'Cess Amount']
            cols_exemp = ['Description', 'Nil rated supplies', 'Exempted', 'Non GST Supplies']
            cols_doc = ['Nature of Document*', 'Sr. No From*', 'Sr. No To*', 'Total Number*', 'Cancelled']
            cols_hsn = ['HSN*', 'Description', 'UQC*', 'Total Quantity*', 'Total Value', 'Rate', 'Taxable Value*', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount']
            
            # Amendment & ECO Cols (Empty)
            cols_b2ba = ['GSTIN/UIN of Recipient*', 'Name of Recipient', 'Original Invoice number*', 'Original Invoice Date*', 'Revised Invoice number*', 'Revised Invoice Date*', 'Invoice value*', 'Place of Supply(POS)*', 'Reverse Charge*', 'Applicable % of Tax Rate', 'Invoice Type*', 'E-Commerce GSTIN*', 'Rate*', 'Taxable Value*', 'Cess Amount']
            cols_b2cla = ['Original Invoice number', 'Original Invoice Date', 'Revised Invoice number*', 'Revised Invoice Date', 'Invoice value*', 'Original Place of Supply(POS)', 'Applicable % of Tax Rate', 'Rate*', 'Taxable Value*', 'Cess Amount', 'E-Commerce GSTIN']
            cols_b2csa = ['Type*', 'Financial Year', 'Original Month', 'Original Place of Supply(POS)', 'Revised Place of Supply(POS)', 'Applicable % of Tax Rate', 'Original Rate*', 'Taxable Value*', 'Cess Amount', 'E-Commerce GSTIN']
            cols_expa = ['Export Type*', 'Original Invoice number*', 'Original Invoice Date*', 'Revised Invoice number*', 'Revised Invoice Date*', 'Invoice value*', 'Port Code', 'Shipping Bill Number', 'Shipping Bill Date', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value']
            cols_cdnra = ['GSTIN/UIN*', 'Name of Recipient', 'Original Note Number*', 'Original Note date*', 'Revised Note Number*', 'Revised Note date*', 'Note Type*', 'Place of Supply*', 'Reverse charge*', 'Note Supply Type*', 'Note value*', 'Applicable % of Tax Rate', 'Rate*', 'Taxable value*', 'Cess Amount']
            cols_ata = ['Place of Supply(POS)*', 'Rate*', 'Gross advance received*', 'Cess Amount']
            cols_atadja = ['Financial Year', 'Original Month*', 'Original Place of Supply(POS)*', 'Applicable % of Tax Rate', 'Rate*', 'Gross advance adjusted*', 'Cess Amount']
            
            cols_eco = ['Nature of Supply*', 'Place of Supply(POS)/ GSTIN*', 'E-Commerce Operator Name', 'Net value of supplies*', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount']
            cols_ecoa = ['Nature of Supply*', 'Original Month*', 'E-Commerce Operator GSTIN*', 'E-Commerce Operator Name', 'Net value of supplies*', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount', 'Financial Year']
            cols_ecob2b = ['GSTIN/UIN of Supplier', 'GSTIN/UIN of Recipient', 'Recipient Name', 'Invoice Number', 'Document date', 'Value of supplies made', 'Place of Supply*', 'Supply Type*', 'Document type', 'Rate*', 'Taxable value*', 'Cess Amount']
            cols_ecourp2b = ['GSTIN/UIN of Recipient', 'Recipient Name', 'Document Number', 'Document Date', 'Value of Supplies Made', 'Place of Supply', 'Document Type', 'Rate*', 'Taxable Value*', 'Cess Amount']
            cols_ecob2c = ['GSTIN/UIN of Supplier', 'Supplier Name', 'Place of Supply*', 'Rate*', 'Taxable Value*', 'Cess Amount']
            cols_ecourp2c = ['Place of Supply*', 'Rate*', 'Taxable Value*', 'Cess Amount']
            cols_ecoab2b = ['GSTIN/UIN of Supplier', 'Supplier Name', 'GSTIN/UIN of Recipient', 'Recipient Name', 'Original Document Number', 'Original Document Date', 'Revised Document Number', 'Revised Document Date', 'Value of Supplies Made', 'Place of Supply', 'Document Type', 'Rate*', 'Taxable Value*', 'Cess Amount']
            cols_ecoab2c = ['Financial Year*', 'Original Month*', 'GSTIN/UIN of Supplier', 'Supplier Name', 'Place of Supply*', 'Rate*', 'Taxable Value*', 'Cess Amount']
            cols_ecoaurp2b = ['GSTIN/UIN of Recipient', 'Recipient Name', 'Original Document Number', 'Original Document Date', 'Revised Document Number', 'Revised Document Date', 'Value of Supplies Made', 'Place of Supply', 'Document Type', 'Rate*', 'Taxable Value*', 'Cess Amount']
            cols_ecoaurp2c = ['Financial Year*', 'Original Month*', 'Place Of Supply', 'Rate*', 'Taxable Value*', 'Cess Amount']

            def get_df(rows, cols):
                # Helper: if rows is list of dict, convert. If rows is DataFrame, use it.
                if isinstance(rows, pd.DataFrame):
                    df = rows
                elif rows:
                    df = pd.DataFrame(rows)
                else:
                    return pd.DataFrame(columns=cols)
                
                for c in cols:
                    if c not in df.columns:
                        df[c] = ''
                return df[cols]

            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                get_df(b2b_data if not b2b_data.empty else [], cols_b2b).to_excel(writer, sheet_name='B2B', index=False)
                get_df(b2cl_data if not b2cl_data.empty else [], cols_b2cl).to_excel(writer, sheet_name='B2CL', index=False)
                get_df(b2cs_data if not b2cs_data.empty else [], cols_b2cs).to_excel(writer, sheet_name='B2CS', index=False)
                get_df(exp_data if not exp_data.empty else [], cols_exp).to_excel(writer, sheet_name='EXP', index=False)
                get_df([], cols_cdnr).to_excel(writer, sheet_name='CDNR', index=False)
                get_df([], cols_cdnur).to_excel(writer, sheet_name='CDNUR', index=False)
                get_df([], cols_at).to_excel(writer, sheet_name='AT', index=False)
                get_df(atadj_data if not atadj_data.empty else [], cols_atadj).to_excel(writer, sheet_name='ATADJ', index=False)
                get_df([], cols_exemp).to_excel(writer, sheet_name='EXEMP', index=False)
                
                # Split HSN Sheets
                get_df(hsn_b2b_data if not hsn_b2b_data.empty else [], cols_hsn).to_excel(writer, sheet_name='HSNB2B', index=False)
                get_df(hsn_b2c_data if not hsn_b2c_data.empty else [], cols_hsn).to_excel(writer, sheet_name='HSNB2C', index=False)

                get_df(doc_data if not doc_data.empty else [], cols_doc).to_excel(writer, sheet_name='DOC', index=False)
                
                # Amendment Shells
                get_df([], cols_b2ba).to_excel(writer, sheet_name='B2BA', index=False)
                get_df([], cols_b2cla).to_excel(writer, sheet_name='B2CLA', index=False)
                get_df([], cols_b2csa).to_excel(writer, sheet_name='B2CSA', index=False)
                get_df([], cols_expa).to_excel(writer, sheet_name='EXPA', index=False)
                get_df([], cols_cdnra).to_excel(writer, sheet_name='CDNRA', index=False)
                get_df([], cols_ata).to_excel(writer, sheet_name='ATA', index=False)
                get_df([], cols_atadja).to_excel(writer, sheet_name='ATADJA', index=False)
                
                # ECO Shells
                get_df([], cols_eco).to_excel(writer, sheet_name='ECO', index=False)
                get_df([], cols_ecoa).to_excel(writer, sheet_name='ECOA', index=False)
                get_df([], cols_ecob2b).to_excel(writer, sheet_name='ECOB2B', index=False)
                get_df([], cols_ecourp2b).to_excel(writer, sheet_name='ECOURP2B', index=False)
                get_df([], cols_ecob2c).to_excel(writer, sheet_name='ECOB2C', index=False)
                get_df([], cols_ecourp2c).to_excel(writer, sheet_name='ECOURP2C', index=False)
                get_df([], cols_ecoab2b).to_excel(writer, sheet_name='ECOAB2B', index=False)
                get_df([], cols_ecoab2c).to_excel(writer, sheet_name='ECOAB2C', index=False)
                get_df([], cols_ecoaurp2b).to_excel(writer, sheet_name='ECOAURP2B', index=False)
                get_df([], cols_ecoaurp2c).to_excel(writer, sheet_name='ECOAURP2C', index=False)

            output.seek(0)
            year = request.query_params.get('year', '2024-25')
            month = request.query_params.get('month', 'All')
            filename = f"GSTR1_{year}_{month}.xlsx"
            return FileResponse(output, as_attachment=True, filename=filename, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

        except Exception as e:
            print(f"ERROR in download_excel: {e}")
            import traceback
            traceback.print_exc()
            return Response({'error': str(e)}, status=500)

    @action(detail=False, methods=['get'])
    def download_json(self, request):
        queryset = self.get_queryset()
        
        year_str = request.query_params.get('year', '2024-25')
        month_name = request.query_params.get('month', 'January') 
        
        # Numeric month mapping
        months_map = {
            'January': '01', 'February': '02', 'March': '03', 'April': '04',
            'May': '05', 'June': '06', 'July': '07', 'August': '08',
            'September': '09', 'October': '10', 'November': '11', 'December': '12'
        }
        month_num = months_map.get(month_name, '01')
        
        # Year logic for FY: 2024-25 -> Jan is 2025
        # (Assuming the queryset is already filtered correctly by get_queryset)
        actual_year = year_str.split('-')[0]
        if month_name in ['January', 'February', 'March']:
            try:
                actual_year = str(int(actual_year) + 1)
            except: pass
            
        data = {
            "gstin": "UNAVAILABLE", 
            "fp": f"{month_num}{actual_year}",
            "b2b": [],
            "b2cl": []
        }
        
        for v in queryset:
             # Access related payment details
             pay = getattr(v, 'payment_details', None)
             
             # Default values
             val = pay.payment_invoice_value if pay else 0
             taxable = pay.payment_taxable_value if pay else 0
             igst = pay.payment_igst if pay else 0
             cgst = pay.payment_cgst if pay else 0
             sgst = pay.payment_sgst if pay else 0
             
             has_gstin = v.gstin and v.gstin.strip()
             is_large = val > 250000
             is_inter = v.state_type == 'other'
             
             # Determine POS
             pos = ''
             if has_gstin and len(v.gstin) >= 2:
                 pos = v.gstin[:2]
             elif v.state_type == 'within':
                 pos = '29' 
             elif v.state_type == 'other':
                 pos = '27'

             item = {
                 "inum": v.sales_invoice_no,
                 "idt": str(v.date),
                 "val": float(val),
                 "pos": pos,
                 "rchrg": "N",
                 "inv_typ": "R",
                 "itms": [
                     {
                         "num": 1,
                         "itm_det": {
                             "txval": float(taxable),
                             "rt": 0,
                             "iamt": float(igst),
                             "camt": float(cgst),
                             "samt": float(sgst),
                             "csamt": 0
                         }
                     }
                 ]
             }
             
             if has_gstin:
                 ctin = v.gstin
                 found = False
                 for entry in data['b2b']:
                     if entry['ctin'] == ctin:
                         entry['inv'].append(item)
                         found = True
                         break
                 if not found:
                     data['b2b'].append({"ctin": ctin, "inv": [item]})

             elif (not has_gstin) and is_large and is_inter:
                 found = False
                 for entry in data['b2cl']:
                     if entry['pos'] == pos:
                         entry['inv'].append(item)
                         found = True
                         break
                 if not found:
                     data['b2cl'].append({
                        "pos": v.place_of_supply,
                        "inv": [item]
                     })

        filename = f"GSTR1_{year}_{month}.json"
        response = HttpResponse(json.dumps(data, default=str), content_type='application/json')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
