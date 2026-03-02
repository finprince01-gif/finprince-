"""
Sales Invoice Database Access Layer
Handles all database operations for sales invoices.
"""

from typing import List, Dict, Optional
from django.db.models import QuerySet
from datetime import date


def get_invoice_by_id(invoice_id: int, tenant_id: str) -> Optional['SalesInvoice']:
    """
    Fetch a single invoice by ID.
    
    Args:
        invoice_id: Invoice ID
        tenant_id: Tenant ID
        
    Returns:
        SalesInvoice or None
    """
    from accounting.models import SalesInvoice
    
    try:
        return SalesInvoice.objects.get(
            id=invoice_id,
            tenant_id=tenant_id
        )
    except SalesInvoice.DoesNotExist:
        return None


def get_invoices(tenant_id: str, filters: Optional[Dict] = None) -> QuerySet:
    """
    Fetch all invoices for a tenant with optional filters.
    
    Args:
        tenant_id: Tenant ID
        filters: Optional filters (date_from, date_to, customer_id, status)
        
    Returns:
        QuerySet: Sales invoices
    """
    from accounting.models import SalesInvoice
    
    queryset = SalesInvoice.objects.filter(tenant_id=tenant_id)
    
    if filters:
        if filters.get('date_from'):
            queryset = queryset.filter(invoice_date__gte=filters['date_from'])
        if filters.get('date_to'):
            queryset = queryset.filter(invoice_date__lte=filters['date_to'])
        if filters.get('customer_id'):
            queryset = queryset.filter(customer_id=filters['customer_id'])
        if filters.get('status'):
            queryset = queryset.filter(status=filters['status'])
    
    return queryset.select_related('customer', 'voucher_type').order_by('-invoice_date', '-created_at')


def create_invoice(tenant_id: str, invoice_data: Dict) -> 'SalesInvoice':
    """
    Create a new sales invoice.
    
    Args:
        tenant_id: Tenant ID
        invoice_data: Invoice data dictionary
        
    Returns:
        SalesInvoice: Created invoice instance
    """
    from accounting.models import SalesInvoice
    
    invoice = SalesInvoice.objects.create(
        tenant_id=tenant_id,
        **invoice_data
    )
    
    return invoice


def update_invoice(invoice_id: int, tenant_id: str, update_data: Dict) -> 'SalesInvoice':
    """
    Update an existing invoice.
    
    Args:
        invoice_id: Invoice ID
        tenant_id: Tenant ID
        update_data: Data to update
        
    Returns:
        SalesInvoice: Updated invoice instance
    """
    from accounting.models import SalesInvoice
    
    invoice = SalesInvoice.objects.get(id=invoice_id, tenant_id=tenant_id)
    
    for key, value in update_data.items():
        setattr(invoice, key, value)
    
    invoice.save()
    return invoice


def delete_invoice(invoice_id: int, tenant_id: str) -> bool:
    """
    Delete (cancel) an invoice.
    
    Args:
        invoice_id: Invoice ID
        tenant_id: Tenant ID
        
    Returns:
        bool: True if successful
    """
    from accounting.models import SalesInvoice
    
    invoice = SalesInvoice.objects.get(id=invoice_id, tenant_id=tenant_id)
    invoice.status = 'cancelled'
    invoice.save()
    
    return True


def generate_invoice_number(tenant_id: str) -> str:
    """
    Generate next invoice number for tenant.
    
    Args:
        tenant_id: Tenant ID
        
    Returns:
        str: Generated invoice number
    """
    from accounting.models import SalesInvoice
    
    last_invoice = SalesInvoice.objects.filter(
        tenant_id=tenant_id
    ).order_by('-id').first()
    
    if last_invoice:
        # Extract number and increment
        try:
            last_num = int(last_invoice.invoice_number.split('-')[-1])
            new_num = last_num + 1
        except (ValueError, IndexError):
            new_num = 1
    else:
        new_num = 1
    
    return f"SI-{tenant_id[:8]}-{new_num:04d}"


def get_customer_details(customer_id: int, tenant_id: str) -> Optional[Dict]:
    """
    Fetch customer details for auto-filling address.
    
    Args:
        customer_id: Customer ledger ID
        tenant_id: Tenant ID
        
    Returns:
        Dict: Customer details or None
    """
    from accounting.models import MasterLedger
    
    try:
        customer = MasterLedger.objects.get(
            id=customer_id,
            tenant_id=tenant_id
        )
        
        # Extract address from extended_data or additional_data
        address_data = customer.extended_data or customer.additional_data or {}
        
        return {
            'name': customer.name,
            'gstin': customer.gstin,
            'state': customer.state,
            'address': address_data.get('address', ''),
            'contact': address_data.get('contact', ''),
        }
    except MasterLedger.DoesNotExist:
        return None
