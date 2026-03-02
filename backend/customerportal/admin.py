"""
Customer Portal Admin Configuration
Register models in Django admin interface
"""
from django.contrib import admin
from .models import (
    CustomerMaster,
    CustomerMasterCategory,
    CustomerMastersSalesQuotation,
    CustomerMasterCustomer,
    CustomerTransaction,
    # CustomerSalesQuotation,
    # CustomerSalesOrder
)


@admin.register(CustomerMaster)
class CustomerMasterAdmin(admin.ModelAdmin):
    list_display = ['customer_code', 'customer_name', 'email', 'phone', 'current_balance', 'is_active']
    list_filter = ['is_active', 'is_deleted', 'created_at']
    search_fields = ['customer_code', 'customer_name', 'email', 'phone']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(CustomerMasterCategory)
class CustomerMasterCategoryAdmin(admin.ModelAdmin):
    list_display = ['category', 'group', 'subgroup', 'is_active', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['category', 'group', 'subgroup']


@admin.register(CustomerMastersSalesQuotation)
class CustomerMastersSalesQuotationAdmin(admin.ModelAdmin):
    list_display = ['series_name', 'customer_category', 'prefix', 'suffix', 'current_number', 'required_digits', 'is_active']
    list_filter = ['is_active', 'is_deleted', 'customer_category', 'created_at']
    search_fields = ['series_name', 'customer_category']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(CustomerMasterCustomer)
class CustomerMasterCustomerAdmin(admin.ModelAdmin):
    list_display = ['customer_code', 'customer_name', 'customer_category', 'email_address', 'contact_number', 'is_active']
    list_filter = ['is_active', 'is_deleted', 'customer_category', 'created_at']
    search_fields = ['customer_code', 'customer_name', 'email_address', 'pan_number']
    readonly_fields = ['created_at', 'updated_at', 'created_by']


@admin.register(CustomerTransaction)
class CustomerTransactionAdmin(admin.ModelAdmin):
    list_display = ['transaction_number', 'transaction_type', 'customer_id', 'total_amount', 'payment_status', 'transaction_date']
    list_filter = ['transaction_type', 'payment_status', 'transaction_date']
    search_fields = ['transaction_number', 'reference_number']
    readonly_fields = ['created_at', 'updated_at']


# @admin.register(CustomerSalesQuotation)
# class CustomerSalesQuotationAdmin(admin.ModelAdmin):
#     list_display = ['quotation_number', 'customer_id', 'quotation_date', 'total_amount', 'status']
#     list_filter = ['status', 'quotation_date']
#     search_fields = ['quotation_number']
#     readonly_fields = ['created_at', 'updated_at']
# 
# 
# @admin.register(CustomerSalesOrder)
# class CustomerSalesOrderAdmin(admin.ModelAdmin):
#     list_display = ['order_number', 'customer_id', 'order_date', 'total_amount', 'status']
#     list_filter = ['status', 'order_date']
#     search_fields = ['order_number', 'po_number', 'quotation_reference']
#     readonly_fields = ['created_at', 'updated_at']
