import pandas as pd
from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
# REMOVED: HasSubmoduleAccess - no longer using permission tables
from rest_framework.response import Response
from django.db.models import Q
# TODO: Update reports to query new split tables
# from accounting.models import Voucher, Ledger
# from inventory.models import StockItem
from .mixins import IsBranchMember
import io
import os
import json
import datetime
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

# Configure Gemini
try:
    from google import genai
except ImportError:
    genai = None

class BaseExcelView(APIView):
    permission_classes = [IsAuthenticated, IsBranchMember]

    def get_filtered_vouchers(self, request):
        """Fetch vouchers from all split tables and combine them"""
        from accounting.models import (
            VoucherSales, VoucherPurchase, VoucherPayment,
            VoucherReceipt, VoucherContra, VoucherJournal
        )
        
        tenant_id = request.tenant_id
        start_date = request.query_params.get('startDate')
        end_date = request.query_params.get('endDate')
        
        vouchers = []
        
        # Fetch Sales vouchers
        sales_qs = VoucherSales.objects.filter(tenant_id=tenant_id)
        if start_date:
            sales_qs = sales_qs.filter(date__gte=start_date)
        if end_date:
            sales_qs = sales_qs.filter(date__lte=end_date)
        for v in sales_qs:
            vouchers.append({
                'date': v.date,
                'type': 'Sales',
                'voucher_number': v.voucher_number,
                'invoice_no': v.invoice_no or v.voucher_number,
                'party': v.party,
                'account': '',
                'total': float(v.total),
                'amount': float(v.total),
                'narration': v.narration or '',
                'id': v.id,
            })
        
        # Fetch Purchase vouchers
        purchase_qs = VoucherPurchase.objects.filter(tenant_id=tenant_id)
        if start_date:
            purchase_qs = purchase_qs.filter(date__gte=start_date)
        if end_date:
            purchase_qs = purchase_qs.filter(date__lte=end_date)
        for v in purchase_qs:
            vouchers.append({
                'date': v.date,
                'type': 'Purchase',
                'voucher_number': v.voucher_number,
                'invoice_no': v.invoice_no or v.voucher_number,
                'party': v.party,
                'account': '',
                'total': float(v.total),
                'amount': float(v.total),
                'narration': v.narration or '',
                'id': v.id,
            })
        
        # Fetch Payment vouchers
        payment_qs = VoucherPayment.objects.filter(tenant_id=tenant_id)
        if start_date:
            payment_qs = payment_qs.filter(date__gte=start_date)
        if end_date:
            payment_qs = payment_qs.filter(date__lte=end_date)
        for v in payment_qs:
            vouchers.append({
                'date': v.date,
                'type': 'Payment',
                'voucher_number': v.voucher_number,
                'invoice_no': v.voucher_number,
                'party': v.party,
                'account': v.account,
                'total': 0,
                'amount': float(v.amount),
                'narration': v.narration or '',
                'id': v.id,
            })
        
        # Fetch Receipt vouchers
        receipt_qs = VoucherReceipt.objects.filter(tenant_id=tenant_id)
        if start_date:
            receipt_qs = receipt_qs.filter(date__gte=start_date)
        if end_date:
            receipt_qs = receipt_qs.filter(date__lte=end_date)
        for v in receipt_qs:
            vouchers.append({
                'date': v.date,
                'type': 'Receipt',
                'voucher_number': v.voucher_number,
                'invoice_no': v.voucher_number,
                'party': v.party,
                'account': v.account,
                'total': 0,
                'amount': float(v.amount),
                'narration': v.narration or '',
                'id': v.id,
            })
        
        # Fetch Contra vouchers
        contra_qs = VoucherContra.objects.filter(tenant_id=tenant_id)
        if start_date:
            contra_qs = contra_qs.filter(date__gte=start_date)
        if end_date:
            contra_qs = contra_qs.filter(date__lte=end_date)
        for v in contra_qs:
            vouchers.append({
                'date': v.date,
                'type': 'Contra',
                'voucher_number': v.voucher_number,
                'invoice_no': v.voucher_number,
                'party': v.from_account,
                'account': v.to_account,
                'total': 0,
                'amount': float(v.amount),
                'narration': v.narration or '',
                'id': v.id,
            })
        
        # Fetch Journal vouchers
        journal_qs = VoucherJournal.objects.filter(tenant_id=tenant_id)
        if start_date:
            journal_qs = journal_qs.filter(date__gte=start_date)
        if end_date:
            journal_qs = journal_qs.filter(date__lte=end_date)
        for v in journal_qs:
            vouchers.append({
                'date': v.date,
                'type': 'Journal',
                'voucher_number': v.voucher_number,
                'invoice_no': v.voucher_number,
                'party': '',
                'account': '',
                'total': float(v.total_debit),
                'amount': float(v.total_debit),
                'narration': v.narration or '',
                'id': v.id,
            })
        
        # Sort by date
        vouchers.sort(key=lambda x: x['date'])
        
        return vouchers

    def export_excel(self, df, filename):
        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename={filename}'
        
        # Ensure we write bytes
        with io.BytesIO() as b:
            with pd.ExcelWriter(b, engine='openpyxl') as writer:
                df.to_excel(writer, index=False)
            response.write(b.getvalue())
            
        return response

class DayBookExcelView(BaseExcelView):
    def get(self, request):
        vouchers = self.get_filtered_vouchers(request)
        
        data = []
        for v in vouchers:
            # v is now a dictionary
            amount = v.get('amount', 0)

            data.append({
                'Date': v['date'],
                'Voucher Type': v['type'],
                'Voucher Number': v['voucher_number'],
                'Party': v.get('party') or v.get('account') or '',
                'Amount': amount,
                'Narration': v.get('narration', '')
            })
            
        df = pd.DataFrame(data)
        if df.empty:
             df = pd.DataFrame(columns=['Date', 'Voucher Type', 'Voucher Number', 'Party', 'Amount', 'Narration'])
             
        return self.export_excel(df, 'DayBook.xlsx')

class LedgerExcelView(BaseExcelView):
    def get(self, request):
        ledger_name = request.query_params.get('ledger')
        if not ledger_name:
            # Return empty if no ledger selected
            df = pd.DataFrame(columns=['Date', 'Particulars', 'Voucher Type', 'Voucher No', 'Debit', 'Credit', 'Balance'])
            return self.export_excel(df, f'Ledger_Report.xlsx')
            
        vouchers = self.get_filtered_vouchers(request)
        
        data = []
        balance = 0
        
        for v in vouchers:
            debit = 0
            credit = 0
            particulars = ""
            
            # Logic based on voucher type
            if v['type'] == 'Sales':
                if v['party'] == ledger_name:
                    debit = v['amount']
                    particulars = "Sales"
                else:
                    credit = v['amount']
                    particulars = v['party']

            elif v['type'] == 'Purchase':
                if v['party'] == ledger_name:
                    credit = v['amount']
                    particulars = "Purchase"
                else:
                    debit = v['amount']
                    particulars = v['party']

            elif v['type'] == 'Receipt':
                if v['party'] == ledger_name:
                    credit = v['amount']
                    particulars = v['account']
                elif v['account'] == ledger_name:
                    debit = v['amount']
                    particulars = v['party']

            elif v['type'] == 'Payment':
                if v['party'] == ledger_name:
                    debit = v['amount']
                    particulars = v['account']
                elif v['account'] == ledger_name:
                    credit = v['amount']
                    particulars = v['party']

            elif v['type'] == 'Contra':
                if v['party'] == ledger_name:
                    credit = v['amount']
                    particulars = v['account']
                elif v['account'] == ledger_name:
                    debit = v['amount']
                    particulars = v['party']

            elif v['type'] == 'Journal':
                # For journal entries, would need to check journal_entries table
                # Simplified for now
                particulars = "Journal Entry"
            
            # Only add row if this ledger was involved
            if debit > 0 or credit > 0:
                balance += (debit - credit)
                data.append({
                    'Date': v['date'],
                    'Particulars': particulars or v['type'],
                    'Voucher Type': v['type'],
                    'Voucher No': v['voucher_number'],
                    'Debit': debit,
                    'Credit': credit,
                    'Balance': balance
                })
            
        df = pd.DataFrame(data)
        if df.empty:
            df = pd.DataFrame(columns=['Date', 'Particulars', 'Voucher Type', 'Voucher No', 'Debit', 'Credit', 'Balance'])

        return self.export_excel(df, f'Ledger_{ledger_name or "Report"}.xlsx')

class TrialBalanceExcelView(BaseExcelView):
    def get(self, request):
        vouchers = self.get_filtered_vouchers(request)
        ledgers = {} 
        
        def add_amt(name, type_, amt):
            if not name: return
            if name not in ledgers: ledgers[name] = {'debit': 0.0, 'credit': 0.0}
            ledgers[name][type_] += float(amt or 0)

        for v in vouchers:
            if v['type'] == 'Sales':
                add_amt(v['party'], 'debit', v['amount'])
                add_amt('Sales', 'credit', v['amount'])
            elif v['type'] == 'Purchase':
                add_amt(v['party'], 'credit', v['amount'])
                add_amt('Purchases', 'debit', v['amount'])
            elif v['type'] == 'Receipt':
                add_amt(v['account'], 'debit', v['amount'])
                add_amt(v['party'], 'credit', v['amount'])
            elif v['type'] == 'Payment':
                add_amt(v['party'], 'debit', v['amount'])
                add_amt(v['account'], 'credit', v['amount'])
            elif v['type'] == 'Contra':
                add_amt(v['account'], 'debit', v['amount'])
                add_amt(v['party'], 'credit', v['amount'])
            elif v['type'] == 'Journal':
                # Would need to fetch journal entries
                pass
            
        data = []
        total_debit = 0
        total_credit = 0

        for name, vals in ledgers.items():
            net = vals['debit'] - vals['credit']
            debit = net if net > 0 else 0
            credit = abs(net) if net < 0 else 0
            if debit > 0.001 or credit > 0.001:
                data.append({
                    'Ledger': name,
                    'Debit': debit,
                    'Credit': credit
                })
                total_debit += debit
                total_credit += credit
                
        df = pd.DataFrame(data)
        if df.empty:
             df = pd.DataFrame(columns=['Ledger', 'Debit', 'Credit'])
             
        if not df.empty:
            total_row = pd.DataFrame([{
                'Ledger': 'Total', 
                'Debit': total_debit, 
                'Credit': total_credit
            }])
            df = pd.concat([df, total_row], ignore_index=True)

        return self.export_excel(df, 'TrialBalance.xlsx')

class StockSummaryExcelView(BaseExcelView):
     def get(self, request):
        # Placeholder for stock summary
        df = pd.DataFrame(columns=['Item Name', 'Opening', 'Inward', 'Outward', 'Closing'])
        return self.export_excel(df, 'StockSummary.xlsx')

class GSTReportExcelView(BaseExcelView):
    def get(self, request):
        # Placeholder for GST
        df = pd.DataFrame(columns=['GSTIN', 'Party Name', 'Invoice No', 'Date', 'Value', 'Tax'])
        return self.export_excel(df, 'GSTReport.xlsx')

@method_decorator(csrf_exempt, name='dispatch')
class AIReportExcelView(BaseExcelView):
    def post(self, request):
        query = request.data.get('query')
        if not query:
            return Response({'error': 'Query is required'}, status=400)
            
        if not genai:
             return Response({'error': 'AI service not available'}, status=503)

        try:
            from .ai_proxy import execute_with_retry, api_key_manager
            
            # Get healthy key from manager
            api_key = api_key_manager.get_healthy_key()
            if not api_key:
                 return Response({'error': 'AI service busy (No healthy keys)'}, status=503)

            # 1. Ask AI to interpret the query into parameters
            current_date = datetime.date.today().isoformat()
            prompt = f"""
            You are a smart accounting assistant. The user wants to download an Excel report.
            Current Date: {current_date}
            User Query: "{query}"
            
            Extract the following parameters in JSON format:
            - report_type: One of ['sales', 'purchase', 'payment', 'receipt', 'ledger', 'daybook'] (default 'daybook')
            - start_date: YYYY-MM-DD (calculate if user says 'last month', 'this week', etc. Default to first day of current month if unspecified)
            - end_date: YYYY-MM-DD (calculate if necessary. Default to today if unspecified)
            - party_name: Name of specific customer/vendor/ledger if mentioned (or null)
            
            Return ONLY the JSON.
            """
            
            text = execute_with_retry(prompt, {}, api_key)
            text = text.replace('```json', '').replace('```', '').strip()
            params = json.loads(text)
            
            # 2. Map params to request query params
            # We mock the request parameters for re-using `get_filtered_vouchers` or custom logic
            request.GET._mutable = True
            request.query_params._mutable = True
            
            if params.get('start_date'):
                request.query_params['startDate'] = params['start_date']
            if params.get('end_date'):
                request.query_params['endDate'] = params['end_date']
            
            report_type = params.get('report_type', 'daybook').lower()
            party_name = params.get('party_name')
            
            # 3. Fetch Data
            # Note: get_filtered_vouchers returns a list of dictionaries
            vouchers = self.get_filtered_vouchers(request)
            
            # 4. Filter by type/party if needed (since get_filtered_vouchers gets EVERYTHING by default)
            filtered_vouchers = []
            
            for v in vouchers:
                # Type Filter
                if report_type == 'sales' and v['type'] != 'Sales': continue
                if report_type == 'purchase' and v['type'] != 'Purchase': continue
                if report_type == 'payment' and v['type'] != 'Payment': continue
                if report_type == 'receipt' and v['type'] != 'Receipt': continue
                
                # Party Filter (fuzzy match or exact?) 
                # Simple exact match or "in" string for now needed? 
                # AI extracted 'party_name', let's filter if it matches somewhat
                if party_name:
                    p = (v.get('party') or '').lower()
                    a = (v.get('account') or '').lower()
                    pn = party_name.lower()
                    if pn not in p and pn not in a:
                        continue
                        
                filtered_vouchers.append(v)
            
            # 5. Convert to Pandas DataFrame suitable for Excel
            data = []
            for v in filtered_vouchers:
                row = {
                    'Date': v['date'],
                    'Type': v['type'],
                    'Voucher No': v['voucher_number'],
                    'Party': v.get('party') or v.get('account'),
                    'Amount': v.get('amount') or v.get('total'),
                    'Narration': v.get('narration', '')
                }
                data.append(row)
                
            df = pd.DataFrame(data)
            if df.empty:
                # Return empty with headers
                df = pd.DataFrame(columns=['Date', 'Type', 'Voucher No', 'Party', 'Amount', 'Narration'])
            
            # 6. Return Excel
            filename = f"AI_{report_type.title()}_Report_{current_date}.xlsx"
            return self.export_excel(df, filename)

        except Exception as e:
            # Fallback text response if critical failure, or plain error
            # But user wants Excel. If error, maybe return a Text file or JSON error?
            # Standard DRF error is better
            return Response({'error': str(e)}, status=500)
