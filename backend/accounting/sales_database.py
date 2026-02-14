"""
Sales Voucher Database Access Layer
Handles all database operations for sales vouchers.
"""

from typing import List, Dict, Optional
from django.db.models import QuerySet


def get_voucher_types(tenant_id: str) -> QuerySet:
    """
    Fetch all active receipt voucher types for a tenant.
    
    Args:
        tenant_id: Tenant ID
        
    Returns:
        QuerySet: Active receipt voucher types
    """
    from accounting.models import ReceiptVoucherType
    
    return ReceiptVoucherType.objects.filter(
        tenant_id=tenant_id,
        is_active=True
    ).order_by('display_order', 'name')


def get_voucher_configurations(tenant_id: str, voucher_type: Optional[str] = None) -> QuerySet:
    """
    Fetch active voucher configurations.
    Used for populating voucher type dropdown based on configurations.
    
    Args:
        tenant_id: Tenant ID
        voucher_type: Optional type filter (e.g. 'sales')
        
    Returns:
        QuerySet: VoucherConfiguration objects
    """
    from accounting.models import VoucherConfiguration
    
    queryset = VoucherConfiguration.objects.filter(
        tenant_id=tenant_id,
        is_active=True
    )
    
    if voucher_type:
        queryset = queryset.filter(voucher_type=voucher_type)
        
    return queryset.order_by('voucher_name')


def get_customers(tenant_id: str) -> QuerySet:
    """
    Fetch all customer ledgers for a tenant.
    Customers are ledgers from specific groups (Sundry Debtors, etc.)
    
    Args:
        tenant_id: Tenant ID
        
    Returns:
        QuerySet: Customer ledgers
    """
    from accounting.models import MasterLedger
    
    # Filter for customer groups
    # Adjust group names based on your chart of accounts
    customer_groups = ['Sundry Debtors', 'Customers', 'Debtors']
    
    return MasterLedger.objects.filter(
        tenant_id=tenant_id,
        group__in=customer_groups
    ).order_by('name')


def get_sales_voucher(voucher_id: int, tenant_id: str) -> Optional['SalesVoucher']:
    """
    Fetch a single sales voucher with related items and documents.
    
    Args:
        voucher_id: Sales voucher ID
        tenant_id: Tenant ID
        
    Returns:
        SalesVoucher or None
    """
    from accounting.models import SalesVoucher
    
    try:
        return SalesVoucher.objects.prefetch_related('items', 'documents').get(
            id=voucher_id,
            tenant_id=tenant_id
        )
    except SalesVoucher.DoesNotExist:
        return None


def get_sales_vouchers(tenant_id: str, filters: Optional[Dict] = None, prefetch: bool = True) -> QuerySet:
    """
    Fetch all sales vouchers for a tenant with optional filters.
    
    Args:
        tenant_id: Tenant ID
        filters: Optional filters (date_from, date_to, customer_id, status)
        prefetch: Whether to prefetch related items/documents
        
    Returns:
        QuerySet: Sales vouchers
    """
    from accounting.models import SalesVoucher
    
    queryset = SalesVoucher.objects.filter(tenant_id=tenant_id)
    
    if filters:
        if filters.get('date_from'):
            queryset = queryset.filter(date__gte=filters['date_from'])
        if filters.get('date_to'):
            queryset = queryset.filter(date__lte=filters['date_to'])
        if filters.get('customer_id'):
            queryset = queryset.filter(customer_id=filters['customer_id'])
        if filters.get('status'):
            queryset = queryset.filter(status=filters['status'])
    
    if prefetch:
        queryset = queryset.prefetch_related('items', 'documents')
    
    # Always join customer and voucher_type as they are in all serializers
    queryset = queryset.select_related('customer', 'voucher_type')
        
    return queryset.order_by('-date', '-id')


def save_voucher_document(voucher_id: int, tenant_id: str, file_data: Dict) -> 'SalesVoucherDocument':
    """
    Save a supporting document for a sales voucher.
    
    Args:
        voucher_id: Sales voucher ID
        tenant_id: Tenant ID
        file_data: Dictionary with file_name, file_path, file_type, file_size
        
    Returns:
        SalesVoucherDocument: Created document instance
    """
    from accounting.models import SalesVoucher, SalesVoucherDocument
    
    voucher = SalesVoucher.objects.get(id=voucher_id, tenant_id=tenant_id)
    
    document = SalesVoucherDocument.objects.create(
        tenant_id=tenant_id,
        sales_voucher=voucher,
        file_name=file_data['file_name'],
        file_path=file_data['file_path'],
        file_type=file_data['file_type'],
        file_size=file_data['file_size']
    )
    
    return document


def update_sales_voucher_step(voucher_id: int, tenant_id: str, step: int, data: Optional[Dict] = None) -> 'SalesVoucher':
    """
    Update sales voucher current step and optional data for that step.
    
    Args:
        voucher_id: Sales voucher ID
        tenant_id: Tenant ID
        step: Current step number (1-5)
        data: Optional data to update (payment_details, dispatch_details, einvoice_details)
        
    Returns:
        SalesVoucher: Updated voucher instance
    """
    from accounting.models import SalesVoucher
    
    voucher = SalesVoucher.objects.get(id=voucher_id, tenant_id=tenant_id)
    voucher.current_step = step
    
    if data:
        if step == 3 and 'payment_details' in data:
            voucher.payment_details = data['payment_details']
        elif step == 4 and 'dispatch_details' in data:
            voucher.dispatch_details = data['dispatch_details']
        elif step == 5 and 'einvoice_details' in data:
            voucher.einvoice_details = data['einvoice_details']
    
    voucher.save()
    return voucher


def complete_sales_voucher(voucher_id: int, tenant_id: str) -> 'SalesVoucher':
    """
    Mark sales voucher as completed.
    
    Args:
        voucher_id: Sales voucher ID
        tenant_id: Tenant ID
        
    Returns:
        SalesVoucher: Updated voucher instance
    """
    from accounting.models import SalesVoucher
    
    voucher = SalesVoucher.objects.get(id=voucher_id, tenant_id=tenant_id)
    voucher.status = 'completed'
    voucher.save()
    
    return voucher


def delete_sales_voucher(voucher_id: int, tenant_id: str) -> bool:
    """
    Delete a sales voucher (soft delete by marking as cancelled).
    
    Args:
        voucher_id: Sales voucher ID
        tenant_id: Tenant ID
        
    Returns:
        bool: True if successful
    """
    from accounting.models import SalesVoucher
    
    voucher = SalesVoucher.objects.get(id=voucher_id, tenant_id=tenant_id)
    voucher.status = 'cancelled'
    voucher.save()
    
    return True
