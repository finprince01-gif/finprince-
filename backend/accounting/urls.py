from django.urls import path, include # pyre-fixme
from rest_framework import routers # pyre-fixme
from .views import ( # pyre-fixme
    MasterLedgerGroupViewSet, MasterLedgerViewSet,
    MasterHierarchyRawViewSet, VoucherViewSet, JournalEntryViewSet,
    PayFromLedgerView, PayToLedgerView
)
from .views_questions import LedgerQuestionsView, LedgerCreateWithQuestionsView # pyre-fixme
from .views_question import QuestionViewSet # pyre-fixme
from .sales_api import ( # pyre-fixme
    ReceiptVoucherTypeViewSet,
    SalesVoucherViewSet,
    CustomerAddressAPIView,
    TaxTypeDeterminationAPIView,
    SalesDocumentUploadAPIView,
    CustomerListAPIView
)
from .sales_excel_api import ( # pyre-fixme
    SalesVoucherColumnSchemaView,
    SalesExcelTemplateDownloadView,
    SalesExcelUploadView,
    SalesExcelErrorReportView,
)
from .invoice_api import SalesInvoiceViewSet # pyre-fixme
from .views_voucher_sales import VoucherSalesViewSet # pyre-fixme


from .views_payment import (
    PaymentVoucherViewSet, 
    VoucherPaymentSingleViewSet, 
    VoucherPaymentBulkViewSet,
    AdvancePaymentViewSet
) # pyre-fixme
from .views_receipt import VoucherReceiptSingleViewSet, VoucherReceiptBulkViewSet, ReceiptVoucherViewSet # pyre-fixme
from .views_expense import VoucherExpenseViewSet # pyre-fixme
from .views_contra_journal import VoucherContraViewSet, VoucherJournalViewSet # pyre-fixme
from .views_voucher_purchase import VoucherPurchaseViewSet # pyre-fixme
from .views_gst import GSTR1ViewSet # pyre-fixme
from .views_bank_reconciliation import BankReconciliationViewSet # pyre-fixme

router = routers.DefaultRouter()

# Master endpoints
router.register('masters/ledger-groups', MasterLedgerGroupViewSet, basename='master-ledger-groups')
router.register('masters/ledgers', MasterLedgerViewSet, basename='master-ledgers')
# OLD ENDPOINT - DEPRECATED: Use /api/masters/voucher-configurations/ instead
# router.register('masters/voucher-config', MasterVoucherConfigViewSet, basename='master-voucher-config')

# Global hierarchy endpoint (no authentication required)
router.register('hierarchy', MasterHierarchyRawViewSet, basename='hierarchy')

# Sales Voucher endpoints (Must register BEFORE generic 'vouchers')
router.register('vouchers/receipt-types', ReceiptVoucherTypeViewSet, basename='receipt-voucher-types')
router.register('vouchers/sales', SalesVoucherViewSet, basename='sales-vouchers')
router.register('vouchers/purchase', VoucherPurchaseViewSet, basename='purchase-vouchers')

# --- Unified endpoint (use this for all new code) ---
router.register('vouchers/payment', PaymentVoucherViewSet, basename='payment-voucher')
router.register('vouchers/advances', AdvancePaymentViewSet, basename='advance-payment')
router.register('advances', AdvancePaymentViewSet, basename='advances')
# --- Deprecated endpoints (backward compat — will be removed after migration) ---
router.register('vouchers/payment-single', VoucherPaymentSingleViewSet, basename='payment-voucher-single')
router.register('vouchers/payment-bulk', VoucherPaymentBulkViewSet, basename='payment-voucher-bulk')
router.register('vouchers/receipts', ReceiptVoucherViewSet, basename='receipt-voucher-unified')
router.register('vouchers/receipt-single', ReceiptVoucherViewSet, basename='receipt-voucher-single')
router.register('vouchers/receipt-bulk', ReceiptVoucherViewSet, basename='receipt-voucher-bulk')
router.register('vouchers/expenses', VoucherExpenseViewSet, basename='expense-vouchers')
router.register('vouchers/contra', VoucherContraViewSet, basename='contra-vouchers')
router.register('vouchers/journal', VoucherJournalViewSet, basename='journal-vouchers')
router.register('bank-reconciliation', BankReconciliationViewSet, basename='bank-reconciliation')

# Sales Invoice endpoints (NEW)
router.register('invoices', SalesInvoiceViewSet, basename='invoices')
router.register('voucher-sales-new', VoucherSalesViewSet, basename='voucher-sales-new')

# Journal entries
router.register('journal-entries', JournalEntryViewSet, basename='journal-entries')

# Questions endpoint
router.register('questions', QuestionViewSet, basename='questions')


# GST Endpoints
router.register('gst/gstr1', GSTR1ViewSet, basename='gstr1')

# Unified voucher endpoint - filter by type using query params
# e.g., /api/accounting/vouchers/?type=sales
# MOVED TO END to prevent masking specific paths
router.register('vouchers', VoucherViewSet, basename='vouchers')

from .views_dashboard import DashboardAnalyticsView # pyre-fixme
from .views_subscription import SubscriptionUsageView, SubscriptionUpdateView # pyre-fixme

urlpatterns = [
    # Dashboard Analytics
    path('dashboard/analytics/', DashboardAnalyticsView.as_view(), name='dashboard-analytics'),

    # Questions System endpoints
    path('ledgers/questions/', LedgerQuestionsView.as_view(), name='ledger-questions'),
    path('ledgers/create-with-questions/', LedgerCreateWithQuestionsView.as_view(), name='ledger-create-with-questions'),
    path('ledgers/pay-from/', PayFromLedgerView.as_view(), name='ledgers-pay-from'),
    path('ledgers/pay-to/', PayToLedgerView.as_view(), name='ledgers-pay-to'),
    
    # Sales Voucher custom endpoints
    path('vouchers/sales/customer-address/<int:customer_id>/', CustomerAddressAPIView.as_view(), name='customer-address'),
    path('vouchers/sales/determine-tax-type/', TaxTypeDeterminationAPIView.as_view(), name='determine-tax-type'),
    path('vouchers/sales/upload-document/', SalesDocumentUploadAPIView.as_view(), name='upload-sales-document'),
    path('vouchers/sales/customers/', CustomerListAPIView.as_view(), name='sales-customers'),

    # Sales Excel Template – Download, Upload & Schema
    path('vouchers/sales/schema/',         SalesVoucherColumnSchemaView.as_view(),      name='sales-voucher-schema'),
    path('vouchers/sales/excel-template/', SalesExcelTemplateDownloadView.as_view(),   name='sales-excel-template-download'),
    path('vouchers/sales/upload-excel/',   SalesExcelUploadView.as_view(),             name='sales-excel-upload'),
    path('vouchers/sales/excel-error-report/', SalesExcelErrorReportView.as_view(),    name='sales-excel-error-report'),
    
    # Subscription Usage
    path('subscription/usage/', SubscriptionUsageView.as_view(), name='subscription-usage'),
    path('subscription/update/', SubscriptionUpdateView.as_view(), name='subscription-update'),

    
    # Router URLs (Moved to end to allow manual paths to take precedence)
    path('', include(router.urls)),
]
