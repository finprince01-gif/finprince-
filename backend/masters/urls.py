"""
Masters Module URL Configuration
"""

from django.urls import path, include
from rest_framework import routers
from .api import (
    MasterLedgerGroupViewSet,
    MasterLedgerViewSet,
    MasterVoucherConfigViewSet,
    MasterHierarchyRawViewSet,
    VoucherConfigurationViewSet,
    AmountTransactionViewSet
)
from .voucher_master_api import (
    MasterVoucherSalesViewSet,
    MasterVoucherCreditNoteViewSet,
    MasterVoucherReceiptsViewSet,
    MasterVoucherPurchasesViewSet,
    MasterVoucherDebitNoteViewSet,
    MasterVoucherPaymentsViewSet,
    MasterVoucherExpensesViewSet,
    MasterVoucherJournalViewSet,
    MasterVoucherContraViewSet
)

router = routers.DefaultRouter()

# Master endpoints
router.register('ledger-groups', MasterLedgerGroupViewSet, basename='ledger-groups')
router.register('ledgers', MasterLedgerViewSet, basename='ledgers')
router.register('voucher-configs', MasterVoucherConfigViewSet, basename='voucher-configs')
router.register('voucher-configurations', VoucherConfigurationViewSet, basename='voucher-configurations')
router.register('amount-transactions', AmountTransactionViewSet, basename='amount-transactions')

# Separate Voucher Master endpoints
router.register('master-voucher-sales', MasterVoucherSalesViewSet, basename='master-voucher-sales')
router.register('master-voucher-creditnote', MasterVoucherCreditNoteViewSet, basename='master-voucher-creditnote')
router.register('master-voucher-receipts', MasterVoucherReceiptsViewSet, basename='master-voucher-receipts')
router.register('master-voucher-purchases', MasterVoucherPurchasesViewSet, basename='master-voucher-purchases')
router.register('master-voucher-debitnote', MasterVoucherDebitNoteViewSet, basename='master-voucher-debitnote')
router.register('master-voucher-payments', MasterVoucherPaymentsViewSet, basename='master-voucher-payments')
router.register('master-voucher-expenses', MasterVoucherExpensesViewSet, basename='master-voucher-expenses')
router.register('master-voucher-journal', MasterVoucherJournalViewSet, basename='master-voucher-journal')
router.register('master-voucher-contra', MasterVoucherContraViewSet, basename='master-voucher-contra')

# Global hierarchy endpoint (no authentication required)
router.register('hierarchy', MasterHierarchyRawViewSet, basename='hierarchy')

urlpatterns = [
    path('', include(router.urls)),
]

# reload trigger
