from django.urls import path
from .api import (
    PlaceholderReportView, 
    DaybookExcelView, 
    TrialBalanceExcelView,
    StockSummaryExcelView,
    LedgerExcelView,
    GSTExcelView
)

urlpatterns = [
    path('placeholder/', PlaceholderReportView.as_view(), name='reports-placeholder'),
    path('daybook/excel/', DaybookExcelView.as_view(), name='daybook-excel'),
    path('trialbalance/excel/', TrialBalanceExcelView.as_view(), name='trialbalance-excel'),
    path('stocksummary/excel/', StockSummaryExcelView.as_view(), name='stocksummary-excel'),
    path('ledger/excel/', LedgerExcelView.as_view(), name='ledger-excel'),
    path('gst/excel/', GSTExcelView.as_view(), name='gst-excel'),
]
