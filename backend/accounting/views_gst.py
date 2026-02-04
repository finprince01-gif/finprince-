from rest_framework import viewsets, status
import pandas as pd
import io
import json
from django.http import HttpResponse, FileResponse
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.db.models import Sum, Q, Count
from accounting.models_voucher_sales import VoucherSalesInvoiceDetails
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
            queryset = VoucherSalesInvoiceDetails.objects.filter(tenant_id=tenant_id)
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

    @action(detail=False, methods=['get'])
    def download_excel(self, request):
        print("DEBUG: download_excel triggered")
        try:
            queryset = self.get_queryset()
            
            b2b_rows = []
            b2cl_rows = []
            b2cs_rows = []
            exp_rows = []
            
            # Column Definitions for consistency
            cols_b2b = ['GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice Date', 'Invoice Value', 'Place Of Supply', 'Reverse Charge', 'Invoice Type', 'E-Commerce GSTIN', 'Rate', 'Taxable Value', 'Cess Amount']
            cols_b2cl = ['Invoice Number', 'Invoice Date', 'Invoice Value', 'Place Of Supply', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN']
            cols_b2cs = ['Type', 'Place Of Supply', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN']
            cols_exp = ['Export Type', 'Invoice Number', 'Invoice Date', 'Invoice Value', 'Port Code', 'Shipping Bill No', 'Shipping Bill Date', 'Rate', 'Taxable Value']
            cols_cdnr = ['GSTIN/UIN of Recipient', 'Name of Recipient', 'Invoice/Advance Receipt Number', 'Invoice/Advance Receipt Date', 'Note/Refund Voucher Number', 'Note/Refund Voucher Date', 'Document Type', 'Reason For Issuing Note', 'Place Of Supply', 'Note/Refund Voucher Value', 'Rate', 'Taxable Value', 'Cess Amount', 'Pre GST']
            cols_cdnur = ['UR Type', 'Note/Refund Voucher Number', 'Note/Refund Voucher Date', 'Document Type', 'Reason For Issuing Note', 'Place Of Supply', 'Note/Refund Voucher Value', 'Rate', 'Taxable Value', 'Cess Amount', 'Pre GST']
            
            for v in queryset:
                # Access related payment details (OneToOne/Foreign Key)
                # Using getattr to be safe if relation missing
                pay = getattr(v, 'payment_details', None)
                
                # Default values if pay is missing
                val = pay.payment_invoice_value if pay else 0
                taxable = pay.payment_taxable_value if pay else 0
                igst = pay.payment_igst if pay else 0
                cgst = pay.payment_cgst if pay else 0
                sgst = pay.payment_sgst if pay else 0
                cess = pay.payment_cess if pay else 0

                has_gstin = v.gstin and v.gstin.strip()
                
                # Determine POS (Place of Supply)
                pos = ''
                if has_gstin and len(v.gstin) >= 2:
                    pos = v.gstin[:2]
                elif v.state_type == 'within':
                   pos = '29' # Default to Karnataka for now or infer
                elif v.state_type == 'other':
                   pos = '27' # Default/Placeholder

                row_common = {
                    'Invoice Number': v.sales_invoice_no,
                    'Invoice Date': v.date,
                    'Invoice Value': val,
                    'Place Of Supply': pos,
                    'Rate': 0, 
                    'Taxable Value': taxable,
                    'Cess Amount': cess
                }
                
                # Check tables
                if has_gstin:
                    r = row_common.copy()
                    r['GSTIN/UIN of Recipient'] = v.gstin
                    r['Receiver Name'] = v.customer_name
                    r['Reverse Charge'] = 'N' # Not in model, default N
                    r['Invoice Type'] = 'Regular'
                    r['E-Commerce GSTIN'] = ''
                    b2b_rows.append(r)
                
                elif v.tax_type == 'export':
                    r = row_common.copy()
                    r['Export Type'] = v.export_type or 'WPAY'
                    r['Port Code'] = ''
                    r['Shipping Bill No'] = ''
                    r['Shipping Bill Date'] = ''
                    # Try to fetch from dispatch if exists? 
                    # dispatch = getattr(v, 'dispatch_details', None)
                    # if dispatch: ...
                    exp_rows.append(r)
                    
                elif val > 250000 and v.state_type == 'other':
                    r = {k: v for k, v in row_common.items() if k in cols_b2cl}
                    r['E-Commerce GSTIN'] = ''
                    b2cl_rows.append(r)
                
                else:
                    r = {
                        'Type': 'OE',
                        'Place Of Supply': pos,
                        'Rate': 0,
                        'Taxable Value': taxable,
                        'Cess Amount': cess,
                        'E-Commerce GSTIN': ''
                    }
                    b2cs_rows.append(r)

            # Helpers
            def get_df(rows, cols):
                if rows:
                    df = pd.DataFrame(rows)
                    # Add missing cols
                    for c in cols:
                        if c not in df.columns:
                            df[c] = ''
                    return df[cols] # Reorder
                return pd.DataFrame(columns=cols)

            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                get_df(b2b_rows, cols_b2b).to_excel(writer, sheet_name='B2B', index=False)
                get_df(b2cl_rows, cols_b2cl).to_excel(writer, sheet_name='B2CL', index=False)
                get_df(b2cs_rows, cols_b2cs).to_excel(writer, sheet_name='B2CS', index=False)
                get_df(exp_rows, cols_exp).to_excel(writer, sheet_name='EXP', index=False)
                get_df([], cols_cdnr).to_excel(writer, sheet_name='CDNR', index=False)
                get_df([], cols_cdnur).to_excel(writer, sheet_name='CDNUR', index=False)
                
                # Empty Sheets for others
                pd.DataFrame(columns=['Place Of Supply', 'Rate', 'Gross Advance Received', 'Cess Amount']).to_excel(writer, sheet_name='AT', index=False)
                pd.DataFrame(columns=['Place Of Supply', 'Rate', 'Gross Advance Adjusted', 'Cess Amount']).to_excel(writer, sheet_name='ATADJ', index=False)
                pd.DataFrame(columns=['Description', 'Nil Rated Supplies', 'Exempted (Other than Nil rated/non-GST supply)', 'Non-GST Supplies']).to_excel(writer, sheet_name='EXEMP', index=False)
                pd.DataFrame(columns=['HSN/SAC', 'Description', 'UQC', 'Total Quantity', 'Total Value', 'Rate', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount']).to_excel(writer, sheet_name='HSN', index=False)
                pd.DataFrame(columns=['Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled']).to_excel(writer, sheet_name='DOC', index=False)
                # Amendment Sheets
                get_df([], cols_b2b).to_excel(writer, sheet_name='B2BA', index=False)
                get_df([], cols_b2cl).to_excel(writer, sheet_name='B2CLA', index=False)
                get_df([], cols_b2cs).to_excel(writer, sheet_name='B2CSA', index=False)
                get_df([], cols_exp).to_excel(writer, sheet_name='EXPA', index=False)
                get_df([], cols_cdnr).to_excel(writer, sheet_name='CDNRA', index=False)
                
            output.seek(0)
            
            year = request.query_params.get('year', '2024-25')
            month = request.query_params.get('month', 'All')
            filename = f"GSTR1_{year}_{month}.xlsx"
            
            return FileResponse(output, as_attachment=True, filename=filename)
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
