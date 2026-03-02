"""
Sales Invoice Business Flow Layer
Handles business logic and validation for sales invoices.
"""

from typing import Dict, Optional
from datetime import date, datetime
from django.core.exceptions import ValidationError
from . import invoice_database as db


def create_invoice(tenant_id: str, invoice_data: Dict) -> Dict:
    """
    Create a new sales invoice with validation.
    
    Args:
        tenant_id: Tenant ID
        invoice_data: Invoice data from API
        
    Returns:
        Dict: Created invoice data
        
    Raises:
        ValidationError: If validation fails
    """
    # Validate invoice date
    invoice_date = invoice_data.get('invoice_date')
    if isinstance(invoice_date, str):
        invoice_date = datetime.strptime(invoice_date, '%Y-%m-%d').date()
    
    if invoice_date > date.today():
        raise ValidationError({
            'invoice_date': 'Future dates are not allowed'
        })
    
    # Auto-generate invoice number
    invoice_number = db.generate_invoice_number(tenant_id)
    invoice_data['invoice_number'] = invoice_number
    
    # Auto-fetch customer details
    customer_id = invoice_data.get('customer_id')
    if customer_id:
        customer_details = db.get_customer_details(customer_id, tenant_id)
        if customer_details:
            # Auto-fill billing address if not provided
            if not invoice_data.get('bill_to_address'):
                invoice_data['bill_to_address'] = customer_details['address'] or 'Not Available'
            if not invoice_data.get('bill_to_gstin'):
                invoice_data['bill_to_gstin'] = customer_details['gstin']
            if not invoice_data.get('bill_to_state'):
                invoice_data['bill_to_state'] = customer_details['state']
            if not invoice_data.get('bill_to_contact'):
                invoice_data['bill_to_contact'] = customer_details['contact']
            
            # Auto-fill shipping address (same as billing by default)
            if not invoice_data.get('ship_to_address'):
                invoice_data['ship_to_address'] = customer_details['address'] or 'Not Available'
            if not invoice_data.get('ship_to_state'):
                invoice_data['ship_to_state'] = customer_details['state']
    
    # Auto-determine tax type
    tax_type = determine_tax_type(
        invoice_data.get('bill_to_state'),
        invoice_data.get('bill_to_country', 'India'),
        tenant_id
    )
    invoice_data['tax_type'] = tax_type
    
    # Set initial status
    invoice_data['status'] = 'draft'
    invoice_data['current_step'] = 1
    
    # Create invoice
    invoice = db.create_invoice(tenant_id, invoice_data)
    
    return {
        'id': invoice.id,
        'invoice_number': invoice.invoice_number,
        'invoice_date': str(invoice.invoice_date),
        'customer_id': invoice.customer_id,
        'customer_name': invoice.customer.name,
        'tax_type': invoice.tax_type,
        'status': invoice.status,
    }


def update_invoice(invoice_id: int, tenant_id: str, update_data: Dict) -> Dict:
    """
    Update an existing invoice.
    
    Args:
        invoice_id: Invoice ID
        tenant_id: Tenant ID
        update_data: Data to update
        
    Returns:
        Dict: Updated invoice data
        
    Raises:
        ValidationError: If validation fails
    """
    # Validate invoice exists
    invoice = db.get_invoice_by_id(invoice_id, tenant_id)
    if not invoice:
        raise ValidationError({'invoice': 'Invoice not found'})
    
    # Validate status
    if invoice.status == 'cancelled':
        raise ValidationError({'status': 'Cannot update cancelled invoice'})
    
    # Validate date if being updated
    if 'invoice_date' in update_data:
        invoice_date = update_data['invoice_date']
        if isinstance(invoice_date, str):
            invoice_date = datetime.strptime(invoice_date, '%Y-%m-%d').date()
        
        if invoice_date > date.today():
            raise ValidationError({
                'invoice_date': 'Future dates are not allowed'
            })
    
    # Re-determine tax type if addresses changed
    if 'bill_to_state' in update_data or 'bill_to_country' in update_data:
        tax_type = determine_tax_type(
            update_data.get('bill_to_state', invoice.bill_to_state),
            update_data.get('bill_to_country', invoice.bill_to_country),
            tenant_id
        )
        update_data['tax_type'] = tax_type
    
    # Update invoice
    updated_invoice = db.update_invoice(invoice_id, tenant_id, update_data)
    
    return {
        'id': updated_invoice.id,
        'invoice_number': updated_invoice.invoice_number,
        'status': updated_invoice.status,
    }


def get_invoice(invoice_id: int, tenant_id: str) -> Optional[Dict]:
    """
    Get invoice details.
    
    Args:
        invoice_id: Invoice ID
        tenant_id: Tenant ID
        
    Returns:
        Dict: Invoice data or None
    """
    invoice = db.get_invoice_by_id(invoice_id, tenant_id)
    if not invoice:
        return None
    
    return {
        'id': invoice.id,
        'invoice_number': invoice.invoice_number,
        'invoice_date': str(invoice.invoice_date),
        'customer_id': invoice.customer_id,
        'customer_name': invoice.customer.name,
        'voucher_type_id': invoice.voucher_type_id,
        'voucher_type_name': invoice.voucher_type.name,
        'bill_to_address': invoice.bill_to_address,
        'bill_to_gstin': invoice.bill_to_gstin,
        'bill_to_contact': invoice.bill_to_contact,
        'bill_to_state': invoice.bill_to_state,
        'bill_to_country': invoice.bill_to_country,
        'ship_to_address': invoice.ship_to_address,
        'ship_to_state': invoice.ship_to_state,
        'ship_to_country': invoice.ship_to_country,
        'tax_type': invoice.tax_type,
        'status': invoice.status,
        'current_step': invoice.current_step,
    }


def list_invoices(tenant_id: str, filters: Optional[Dict] = None) -> list:
    """
    List all invoices for tenant.
    
    Args:
        tenant_id: Tenant ID
        filters: Optional filters
        
    Returns:
        list: List of invoice dictionaries
    """
    invoices = db.get_invoices(tenant_id, filters)
    
    return [
        {
            'id': inv.id,
            'invoice_number': inv.invoice_number,
            'invoice_date': str(inv.invoice_date),
            'customer_name': inv.customer.name,
            'tax_type': inv.tax_type,
            'status': inv.status,
        }
        for inv in invoices
    ]


def determine_tax_type(bill_to_state: str, bill_to_country: str, tenant_id: str) -> str:
    """
    Determine tax type based on addresses.
    
    Logic:
    - Export: If country != India
    - Within State: If bill_to_state == company_state
    - Other State: If different states within India
    
    Args:
        bill_to_state: Customer state
        bill_to_country: Customer country
        tenant_id: Tenant ID
        
    Returns:
        str: Tax type ('within_state', 'other_state', 'export')
    """
    # TODO: Get company state from tenant settings
    company_state = 'Karnataka'  # This should come from tenant settings
    
    if bill_to_country and bill_to_country.lower() != 'india':
        return 'export'
    elif bill_to_state and bill_to_state.lower() == company_state.lower():
        return 'within_state'
    else:
        return 'other_state'


def cancel_invoice(invoice_id: int, tenant_id: str) -> bool:
    """
    Cancel an invoice.
    
    Args:
        invoice_id: Invoice ID
        tenant_id: Tenant ID
        
    Returns:
        bool: True if successful
        
    Raises:
        ValidationError: If validation fails
    """
    invoice = db.get_invoice_by_id(invoice_id, tenant_id)
    if not invoice:
        raise ValidationError({'invoice': 'Invoice not found'})
    
    if invoice.status == 'cancelled':
        raise ValidationError({'status': 'Invoice already cancelled'})
    
    return db.delete_invoice(invoice_id, tenant_id)
