
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, F, Q # Added Q
from django.db.models.functions import TruncMonth
from django.utils import timezone
from collections import defaultdict
import datetime

from .models import MasterLedger
from .models_voucher_sales import VoucherSalesInvoiceDetails as SalesVoucher
from .models_voucher_purchase import VoucherPurchaseSupplierDetails
from .models_voucher_expense import VoucherExpense
from .models_voucher_payment import PaymentVoucher
from .models_voucher_receipt import VoucherReceiptSingle, VoucherReceiptBulk

class DashboardAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant_id = getattr(request.user, 'tenant_id', None)
        if not tenant_id:
            # Fallback for dev/test if tenant middleware not active
            tenant_id = 1 

        today = timezone.now().date()
        six_months_ago = today - datetime.timedelta(days=180)

        # 1. Revenue Trend (Sales Vouchers — VoucherSalesInvoiceDetails)
        # Uses the related payment_details (VoucherSalesPaymentDetails) for invoice totals
        revenue_qs = SalesVoucher.objects.filter(
            tenant_id=tenant_id,
            date__gte=six_months_ago
        ).annotate(
            month=TruncMonth('date'),
            grand_total=F('payment_details__payment_invoice_value')
        ).values('month').annotate(
            total_revenue=Sum('grand_total')
        ).order_by('month')

        revenue_trend = []
        revenue_map = {}
        for entry in revenue_qs:
            month_str = entry['month'].strftime('%b %y')
            revenue_map[month_str] = float(entry['total_revenue'] or 0)
            revenue_trend.append({"period": month_str, "revenue": revenue_map[month_str], "expense": 0}) # Expense filled later

        # 2. Expense/Purchase Data for Trends & Breakdown
        # Expenses (VoucherExpense)
        # Since VoucherExpense stores rows in JSON, we fetch and iterate. 
        # For trend, we use voucher date.
        expenses_qs = VoucherExpense.objects.filter(
            tenant_id=tenant_id,
            date__gte=six_months_ago
        ).values('date', 'expense_rows')

        expense_trend_map = defaultdict(float)
        expense_category_map = defaultdict(float)

        for voucher in expenses_qs:
            month_str = voucher['date'].strftime('%b %y')
            rows = voucher['expense_rows'] or []
            if isinstance(rows, str): continue # Should be list/json
            for row in rows:
                 amount = float(row.get('totalAmount', 0) or 0)
                 expense_trend_map[month_str] += amount
                 # Breakdown by Expense Ledger Name (or infer category)
                 category = row.get('expense', 'Uncategorized')
                 expense_category_map[category] += amount

        # Purchases (VoucherPurchase) - Treated as COGS/Expense
        # We need total amount. access due_details for totals.
        purchases_qs = VoucherPurchaseSupplierDetails.objects.filter(
            tenant_id=tenant_id,
            date__gte=six_months_ago
        ).select_related('due_details').values('date', 'due_details__to_pay', 'due_details__advance_paid')

        purchase_trend_map = defaultdict(float)
        for p in purchases_qs:
             month_str = p['date'].strftime('%b %y')
             total = float(p['due_details__to_pay'] or 0) + float(p['due_details__advance_paid'] or 0)
             purchase_trend_map[month_str] += total

        # Merge Revenue, Expense, Purchase for Profit & Trend
        # Combine Expense + Purchase for total outflow/cost
        combined_trend = []
        all_months = sorted(list(set(list(revenue_map.keys()) + list(expense_trend_map.keys()) + list(purchase_trend_map.keys()))), key=lambda x: datetime.datetime.strptime(x, '%b %y'))
        
        # Revenue Map filled from QS, ensure we capture all
        for m in all_months:
             rev = revenue_map.get(m, 0)
             exp = expense_trend_map.get(m, 0)
             purch = purchase_trend_map.get(m, 0)
             total_cost = exp + purch
             
             # Net Profit
             net_profit = rev - total_cost
             
             # Margin
             margin = (net_profit / rev * 100) if rev > 0 else 0
             
             combined_trend.append({
                 "period": m,
                 "revenue": rev,
                 "expense": total_cost,
                 "netProfit": net_profit, 
                 "margin": round(margin, 1)
             })

        # 3. Cash Flow (Receipts vs Payments)
        # Receipts
        receipts_qs_single = VoucherReceiptSingle.objects.filter(tenant_id=tenant_id, date__gte=six_months_ago).values('date', 'total_receipt')
        receipts_qs_bulk = VoucherReceiptBulk.objects.filter(tenant_id=tenant_id, date__gte=six_months_ago).values('date', 'receipt_rows', 'advance_amount')
        
        cash_in_map = defaultdict(float)
        for r in receipts_qs_single:
            cash_in_map[r['date'].strftime('%b %y')] += float(r['total_receipt'] or 0)
        for r in receipts_qs_bulk:
            m = r['date'].strftime('%b %y')
            total = float(r['advance_amount'] or 0)
            rows = r['receipt_rows'] or []
            for row in rows:
                total += float(row.get('amount', 0) or 0)
            cash_in_map[m] += total
            
        # Payments (Unified PaymentVoucher)
        payments_qs = PaymentVoucher.objects.filter(
            tenant_id=tenant_id, 
            date__gte=six_months_ago
        ).prefetch_related('items')
        
        cash_out_map = defaultdict(float)
        for p in payments_qs:
            m = p.date.strftime('%b %y')
            # In unified model, advances are just items with reference_type='ADVANCE'
            # but for cash flow, we just want the total amount spent.
            cash_out_map[m] += float(p.total_amount or 0)

        cash_flow = []
        for m in all_months:
            cin = cash_in_map.get(m, 0)
            cout = cash_out_map.get(m, 0)
            cash_flow.append({
                "period": m,
                "inflow": cin,
                "outflow": cout,
                "net": cin - cout
            })

        # 4. Expense Breakdown (Donut)
        # Use expense_category_map calculated above
        # Limit to top 5 + Others
        sorted_expenses = sorted(expense_category_map.items(), key=lambda x: x[1], reverse=True)
        top_5 = sorted_expenses[:5]
        others_val = sum(x[1] for x in sorted_expenses[5:])
        expense_breakdown = [{"name": k, "value": v} for k, v in top_5]
        if others_val > 0:
            expense_breakdown.append({"name": "Others", "value": others_val})

        # 5. AR Aging (Outstanding Receivables)
        # Fetch All Sales Vouchers (not just recent)
        # Join with payment_details for grand total
        all_sales = SalesVoucher.objects.filter(
            tenant_id=tenant_id
        ).select_related('payment_details').values(
            'sales_invoice_no',
            'date',
            'payment_details__payment_invoice_value',
            'payment_details__advance_references'
        )
        
        # Calculate outstanding for each
        ar_buckets = {"0-30": 0, "31-60": 0, "61-90": 0, "90+": 0}
        
        for sale in all_sales:
             total = float(sale['payment_details__payment_invoice_value'] or 0)
             
             # Calculate paid amount from advance_references (JSON)
             paid = 0
             try:
                 import json
                 p_details = sale['payment_details__advance_references']
                 if p_details:
                     if isinstance(p_details, str):
                         p_details = json.loads(p_details)
                     
                     if isinstance(p_details, list):
                         for p in p_details:
                             paid += float(p.get('amount', 0) or 0)
             except Exception:
                 pass
             
             outstanding = total - paid
             if outstanding > 1: # Ignore dust
                 days = (today - sale['date']).days
                 if days <= 30: ar_buckets["0-30"] += outstanding
                 elif days <= 60: ar_buckets["31-60"] += outstanding
                 elif days <= 90: ar_buckets["61-90"] += outstanding
                 else: ar_buckets["90+"] += outstanding

        ar_aging = [
            {"range": "0-30 Days", "amount": ar_buckets["0-30"]},
            {"range": "31-60 Days", "amount": ar_buckets["31-60"]},
            {"range": "61-90 Days", "amount": ar_buckets["61-90"]},
            {"range": "90+ Days", "amount": ar_buckets["90+"]},
        ]

        # 6. AP Aging (Outstanding Payables)
        # Same logic for Purchases
        all_purchases = VoucherPurchaseSupplierDetails.objects.filter(tenant_id=tenant_id).select_related('due_details').values('date', 'due_details__to_pay', 'due_details__advance_paid', 'due_details__advance_references')
        
        ap_buckets = {"0-30": 0, "31-60": 0, "61-90": 0, "90+": 0}
        
        for purch in all_purchases:
             # Logic: VoucherPurchaseDueDetails.to_pay IS the outstanding amount?
             # Name "to_pay" suggests it. 
             # Let's assume to_pay is the current outstanding balance logic handled by purchase module.
             outstanding = float(purch['due_details__to_pay'] or 0)
             
             if outstanding > 1:
                 days = (today - purch['date']).days
                 if days <= 30: ap_buckets["0-30"] += outstanding
                 elif days <= 60: ap_buckets["31-60"] += outstanding
                 elif days <= 90: ap_buckets["61-90"] += outstanding
                 else: ap_buckets["90+"] += outstanding

        ap_aging = [
            {"range": "0-30 Days", "amount": ap_buckets["0-30"]},
            {"range": "31-60 Days", "amount": ap_buckets["31-60"]},
            {"range": "61-90 Days", "amount": ap_buckets["61-90"]},
            {"range": "90+ Days", "amount": ap_buckets["90+"]},
        ]
        
        # 7. Budget vs Actual
        # Mock Budget vs Actual as no Budget model exists
        # We define budget as 10% less than actual expenses for demo
        budget_vs_actual = []
        for d in combined_trend:
             budget_vs_actual.append({
                 "period": d['period'],
                 "actual": d['expense'],
                 "budget": d['expense'] * 0.9, # Mock budget
                 "variance": d['expense'] - (d['expense'] * 0.9)
             })

        # 8. Profit Margin (Trend)
        # Already calculated in combined_trend['margin']
        profit_margin_trend = [{"period": d['period'], "margin": d['margin']} for d in combined_trend]

        return Response({
            "chartData": combined_trend, # Revenue, Expense, NetProfit, Margin
            "expenseBreakdown": expense_breakdown,
            "cashFlow": cash_flow,
            "budgetVsActual": budget_vs_actual,
            "profitMargin": profit_margin_trend,
            "arAging": ar_aging,
            "apAging": ap_aging,
            
            # KPI Totals
            "totalSales": sum(revenue_map.values()),
            "totalPurchases": sum(expense_trend_map.values()) + sum(purchase_trend_map.values()),
            "totalReceivables": sum(ar_buckets.values()),
            "totalPayables": sum(ap_buckets.values())
        })
