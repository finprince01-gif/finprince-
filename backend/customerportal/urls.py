"""
Customer Portal URL Configuration
Defines API endpoints for customer portal
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .api import (
    CustomerMasterViewSet,
    CustomerCategoryViewSet,
    CustomerMastersSalesQuotationViewSet,
    CustomerMastersSalesOrderViewSet,
    CustomerMasterCustomerViewSet,
    CustomerTransactionViewSet,
    # CustomerSalesQuotationViewSet,
    # CustomerSalesOrderViewSet,
    CustomerMasterLongTermContractViewSet,
    CustomerTransactionSalesQuotationGeneralViewSet,
    CustomerTransactionSalesQuotationSpecificViewSet,
    CustomerTransactionSalesOrderViewSet
)

# Create router and register viewsets
router = DefaultRouter()
router.register(r'customers', CustomerMasterViewSet, basename='customer')
router.register(r'categories', CustomerCategoryViewSet, basename='customer-category')
router.register(r'sales-quotation-series', CustomerMastersSalesQuotationViewSet, basename='sales-quotation-series')
router.register(r'sales-order-series', CustomerMastersSalesOrderViewSet, basename='sales-order-series')
router.register(r'customer-master', CustomerMasterCustomerViewSet, basename='customer-master')
router.register(r'transactions', CustomerTransactionViewSet, basename='customer-transaction')
# router.register(r'quotations', CustomerSalesQuotationViewSet, basename='sales-quotation')
# router.register(r'orders', CustomerSalesOrderViewSet, basename='sales-order')
router.register(r'long-term-contracts', CustomerMasterLongTermContractViewSet, basename='long-term-contract')
router.register(r'sales-quotations-general', CustomerTransactionSalesQuotationGeneralViewSet, basename='sales-quotation-general')
router.register(r'sales-quotations-specific', CustomerTransactionSalesQuotationSpecificViewSet, basename='sales-quotation-specific')
router.register(r'sales-orders', CustomerTransactionSalesOrderViewSet, basename='sales-orders')

urlpatterns = [
    path('', include(router.urls)),
]

