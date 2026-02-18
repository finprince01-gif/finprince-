from django.urls import path, include
from rest_framework import routers
from .views import (
    MasterLedgerGroupViewSet, MasterLedgerViewSet,
    MasterHierarchyRawViewSet, VoucherViewSet, JournalEntryViewSet
)
from .views_questions import LedgerQuestionsView, LedgerCreateWithQuestionsView
from .views_question import QuestionViewSet
from .sales_api import (
    ReceiptVoucherTypeViewSet,
    SalesVoucherViewSet,
    CustomerAddressAPIView,
    TaxTypeDeterminationAPIView,
    SalesDocumentUploadAPIView,
    CustomerListAPIView
)
from .invoice_api import SalesInvoiceViewSet
from .views_voucher_sales import VoucherSalesViewSet


from .views_payment import VoucherPaymentSingleViewSet, VoucherPaymentBulkViewSet
from .views_receipt import VoucherReceiptSingleViewSet, VoucherReceiptBulkViewSet
from .views_expense import VoucherExpenseViewSet
from .views_contra_journal import VoucherContraViewSet, VoucherJournalViewSet
from .views_voucher_purchase import VoucherPurchaseViewSet
from .views_gst import GSTR1ViewSet

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

router.register('vouchers/payment-single', VoucherPaymentSingleViewSet, basename='payment-voucher-single')
router.register('vouchers/payment-bulk', VoucherPaymentBulkViewSet, basename='payment-voucher-bulk')
router.register('vouchers/receipt-single', VoucherReceiptSingleViewSet, basename='receipt-voucher-single')
router.register('vouchers/receipt-bulk', VoucherReceiptBulkViewSet, basename='receipt-voucher-bulk')
router.register('vouchers/expenses', VoucherExpenseViewSet, basename='expense-vouchers')
router.register('vouchers/contra', VoucherContraViewSet, basename='contra-vouchers')
router.register('vouchers/journal', VoucherJournalViewSet, basename='journal-vouchers')

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

from .views_dashboard import DashboardAnalyticsView
from .views_subscription import SubscriptionUsageView, SubscriptionUpdateView

urlpatterns = [
    # Dashboard Analytics
    path('dashboard/analytics/', DashboardAnalyticsView.as_view(), name='dashboard-analytics'),

    # Questions System endpoints
    path('ledgers/questions/', LedgerQuestionsView.as_view(), name='ledger-questions'),
    path('ledgers/create-with-questions/', LedgerCreateWithQuestionsView.as_view(), name='ledger-create-with-questions'),
    
    # Sales Voucher custom endpoints
    path('vouchers/sales/customer-address/<int:customer_id>/', CustomerAddressAPIView.as_view(), name='customer-address'),
    path('vouchers/sales/determine-tax-type/', TaxTypeDeterminationAPIView.as_view(), name='determine-tax-type'),
    path('vouchers/sales/upload-document/', SalesDocumentUploadAPIView.as_view(), name='upload-sales-document'),
    path('vouchers/sales/customers/', CustomerListAPIView.as_view(), name='sales-customers'),
    
    # Subscription Usage
    path('subscription/usage/', SubscriptionUsageView.as_view(), name='subscription-usage'),
    path('subscription/update/', SubscriptionUpdateView.as_view(), name='subscription-update'),

    
    # Router URLs (Moved to end to allow manual paths to take precedence)
    path('', include(router.urls)),
]
