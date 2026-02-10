"""
Customer Portal Models
Import models from database.py for Django compatibility
"""
from .database import (
    CustomerMaster,
    CustomerMasterCategory,
    CustomerMastersSalesQuotation,
    CustomerMastersSalesOrder,
    CustomerMasterCustomer,
    CustomerMasterCustomerBasicDetails,
    CustomerMasterCustomerGSTDetails,
    CustomerMasterCustomerTDS,
    CustomerMasterCustomerBanking,
    CustomerTransaction,
    CustomerSalesQuotation,
    CustomerSalesOrder,
    CustomerMasterCustomerProductService,
    CustomerMasterCustomerTermsCondition,
    CustomerMasterLongTermContractBasicDetail,
    CustomerMasterLongTermContractProductService,
    CustomerMasterLongTermContractTermsCondition,
    CustomerTransactionSalesQuotationGeneral,
    CustomerTransactionSalesQuotationSpecific,
    CustomerTransactionSalesOrderBasicDetails,
    CustomerTransactionSalesOrderItemDetails,
    CustomerTransactionSalesOrderDeliveryTerms,
    CustomerTransactionSalesOrderPaymentAndSalesperson,
    CustomerTransactionSalesOrderQuotationDetails
)

__all__ = [
    'CustomerMaster',
    'CustomerMasterCategory',
    'CustomerMastersSalesQuotation',
    'CustomerMastersSalesOrder',
    'CustomerMasterCustomer',
    'CustomerMasterCustomerBasicDetails',
    'CustomerMasterCustomerGSTDetails',
    'CustomerMasterCustomerTDS',
    'CustomerMasterCustomerBanking',
    'CustomerTransaction',
    'CustomerSalesQuotation',
    'CustomerSalesOrder',
    'CustomerMasterCustomerProductService',
    'CustomerMasterCustomerTermsCondition',
    'CustomerMasterLongTermContractBasicDetail',
    'CustomerMasterLongTermContractProductService',
    'CustomerMasterLongTermContractTermsCondition',
    'CustomerTransactionSalesQuotationGeneral',
    'CustomerTransactionSalesQuotationSpecific',
    'CustomerTransactionSalesOrderBasicDetails',
    'CustomerTransactionSalesOrderItemDetails',
    'CustomerTransactionSalesOrderDeliveryTerms',
    'CustomerTransactionSalesOrderPaymentAndSalesperson',
    'CustomerTransactionSalesOrderQuotationDetails'
]
