"""
Sales Voucher Business Logic Layer
Handles all business logic for sales voucher operations including:
- Invoice number generation
- Date validation
- Tax type determination
- Customer address fetching
- File upload validation
"""

from django.utils import timezone
from django.core.exceptions import ValidationError
from decimal import Decimal
from typing import Dict, List, Optional, Tuple
import os


def validate_date(date_str: str) -> bool:
    """
    Validate that date is not in future.
    
    Args:
        date_str: Date string in YYYY-MM-DD format
        
    Returns:
        bool: True if valid, raises ValidationError if invalid
        
    Raises:
        ValidationError: If date is in future
    """
    from datetime import datetime
    
    try:
        date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        raise ValidationError("Invalid date format. Use YYYY-MM-DD.")
    
    today = timezone.now().date()
    
    if date_obj > today:
        raise ValidationError("Future dates are not allowed. Date must be today or a past date.")
    
    return True


def determine_tax_type(user_state: str, bill_to_state: str, bill_to_country: str) -> str:
    """
    Auto-determine tax type based on address logic.
    
    Rules:
    - Within State: User State = Bill To State
    - Other State: User State ≠ Bill To State (both in India)
    - Export: Bill To Country ≠ India
    
    Args:
        user_state: State of the user/company
        bill_to_state: State from customer's bill-to address
        bill_to_country: Country from customer's bill-to address
        
    Returns:
        str: Tax type ('within_state', 'other_state', or 'export')
    """
    # Normalize inputs
    user_state = (user_state or '').strip().lower()
    bill_to_state = (bill_to_state or '').strip().lower()
    bill_to_country = (bill_to_country or 'India').strip().lower()
    
    # Check if export
    if bill_to_country != 'india':
        return 'export'
    
    # Check if within state or other state
    if user_state == bill_to_state:
        return 'within_state'
    else:
        return 'other_state'


def validate_file_upload(file_name: str, file_size: int, max_size_mb: int = 10) -> Tuple[bool, str]:
    """
    Validate file upload for supporting documents.
    
    Rules:
    - Only JPG, JPEG, PDF allowed
    - File size limit (default 10MB)
    
    Args:
        file_name: Name of the file
        file_size: Size of file in bytes
        max_size_mb: Maximum file size in MB
        
    Returns:
        Tuple[bool, str]: (is_valid, file_type or error_message)
        
    Raises:
        ValidationError: If file is invalid
    """
    ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'pdf']
    
    # Get file extension
    file_ext = os.path.splitext(file_name)[1].lower().lstrip('.')
    
    if not file_ext:
        raise ValidationError("File has no extension.")
    
    if file_ext not in ALLOWED_EXTENSIONS:
        raise ValidationError(
            f"Invalid file type '{file_ext}'. Only {', '.join(ALLOWED_EXTENSIONS).upper()} files are allowed."
        )
    
    # Check file size
    max_size_bytes = max_size_mb * 1024 * 1024
    if file_size > max_size_bytes:
        raise ValidationError(f"File size exceeds maximum allowed size of {max_size_mb}MB.")
    
    return True, file_ext



def generate_sales_invoice_number(tenant_id: str, voucher_type_id: int) -> str:
    """
    Generate auto-sequential sales invoice number.
    
    Uses VoucherConfiguration (MasterVoucherSales) to generate chronological, sequential numbers.
    backend-driven to avoid collisions.
    """
    from masters.voucher_master_models import MasterVoucherSales as VoucherConfiguration
    from masters.voucher_master_models import MasterVoucherReceipts as ReceiptVoucherType
    from django.utils import timezone
    
    # Get voucher type name
    voucher_type_name = "Sales Invoice"
    try:
        if voucher_type_id:
            vt = ReceiptVoucherType.objects.get(id=voucher_type_id, tenant_id=tenant_id)
            voucher_type_name = vt.name
    except:
        pass
    
    # Try to find active configuration (MasterVoucherSales)
    # Note: aliased model has no 'voucher_type' field, only 'voucher_name'
    config = VoucherConfiguration.objects.filter(
        tenant_id=tenant_id,
        voucher_name=voucher_type_name,
        is_active=True
    ).first()
    
    if not config:
        # Create default configuration if none exists
        config = VoucherConfiguration.objects.create(
            tenant_id=tenant_id,
            voucher_name=voucher_type_name,
            enable_auto_numbering=True,
            prefix='SAL-',
            suffix='',
            start_from=1,
            current_number=1,
            required_digits=4,
            is_active=True
        )
    
    # Generate next number
    if not config.enable_auto_numbering:
        # If auto-numbering is disabled, we might return empty or error?
        # For now, let's assume we must return something.
        return ""
        
    padded_number = str(config.current_number).zfill(config.required_digits)
    invoice_number = f"{config.prefix or ''}{padded_number}{config.suffix or ''}"
    
    # Increment
    config.current_number += 1
    config.save()
    
    return invoice_number


def fetch_customer_address(customer_id: int, tenant_id: str) -> Dict:
    """
    Fetch customer address details from Customer Module.
    """
    from accounting.models import MasterLedger
    
    try:
        customer = MasterLedger.objects.get(id=customer_id, tenant_id=tenant_id)
    except MasterLedger.DoesNotExist:
        raise ValidationError("Customer not found.")
    
    # Extract address from extended_data or construct from available fields
    extended_data = customer.extended_data or {}
    
    # Build bill-to address
    bill_to_parts = []
    if extended_data.get('address_line1'):
        bill_to_parts.append(extended_data['address_line1'])
    if extended_data.get('address_line2'):
        bill_to_parts.append(extended_data['address_line2'])
    if extended_data.get('city'):
        bill_to_parts.append(extended_data['city'])
    if customer.state:
        bill_to_parts.append(customer.state)
    if extended_data.get('pincode'):
        bill_to_parts.append(extended_data['pincode'])
    
    bill_to_address = ', '.join(filter(None, bill_to_parts)) or 'Address not available'
    
    # Ship-to address (same as bill-to by default, but can be edited)
    ship_to_address = extended_data.get('shipping_address', bill_to_address)
    
    return {
        'customer_name': customer.name,
        'bill_to_address': bill_to_address,
        'bill_to_gstin': customer.gstin or '',
        'bill_to_contact': extended_data.get('phone') or extended_data.get('mobile') or '',
        'bill_to_state': customer.state or '',
        'bill_to_country': extended_data.get('country', 'India'),
        'ship_to_address': ship_to_address,
        'ship_to_state': customer.state or '',
        'ship_to_country': extended_data.get('country', 'India'),
    }


def calculate_item_totals(items: List[Dict], tax_type: str) -> Dict:
    """
    Calculate totals for all items based on tax type.
    
    Args:
        items: List of item dictionaries with quantity, rate, gst_rate
        tax_type: Tax type ('within_state', 'other_state', 'export')
        
    Returns:
        Dict: Calculated totals including taxable amount, CGST, SGST, IGST, grand total
    """
    total_taxable = Decimal('0')
    total_cgst = Decimal('0')
    total_sgst = Decimal('0')
    total_igst = Decimal('0')
    
    for item in items:
        qty = Decimal(str(item.get('quantity', 0)))
        rate = Decimal(str(item.get('rate', 0)))
        gst_rate = Decimal(str(item.get('gst_rate', 0)))
        
        taxable_amount = qty * rate
        tax_amount = taxable_amount * (gst_rate / Decimal('100'))
        
        total_taxable += taxable_amount
        
        if tax_type == 'within_state':
            # Split into CGST and SGST
            cgst = tax_amount / Decimal('2')
            sgst = tax_amount / Decimal('2')
            total_cgst += cgst
            total_sgst += sgst
        elif tax_type == 'other_state':
            # IGST only
            total_igst += tax_amount
        # For export, no tax
    
    grand_total = total_taxable + total_cgst + total_sgst + total_igst
    
    return {
        'total_taxable_amount': float(total_taxable),
        'total_cgst': float(total_cgst),
        'total_sgst': float(total_sgst),
        'total_igst': float(total_igst),
        'grand_total': float(grand_total),
    }



def create_sales_voucher(data: Dict, tenant_id: str, user_state: str) -> 'SalesVoucher':
    """
    Create sales voucher with all validations.
    Supports resolving voucher type from VoucherConfiguration.
    """
    from accounting.models import (
        SalesVoucher, SalesVoucherItem, MasterLedger
    )
    from masters.voucher_master_models import MasterVoucherSales as VoucherConfiguration
    from masters.voucher_master_models import MasterVoucherReceipts as ReceiptVoucherType
    from django.db import transaction
    
    # Validate date
    validate_date(data['date'])
    
    # Fetch customer address & name
    customer_info = fetch_customer_address(data['customer_id'], tenant_id)
    
    # Determine tax type
    tax_type = determine_tax_type(
        user_state,
        customer_info['bill_to_state'],
        customer_info['bill_to_country']
    )
    
    # Resolve Voucher Type
    voucher_name = "Sales Invoice"
    try:
        vt = ReceiptVoucherType.objects.get(id=data['voucher_type_id'], tenant_id=tenant_id)
        voucher_name = vt.name
    except:
        pass

    # Generate invoice number
    # Pass 0 or None as ID if not strictly needed, or pass the input ID
    invoice_number = generate_sales_invoice_number(tenant_id, data.get('voucher_type_id', 0))
    
    # Calculate totals (Useful for logic, even if not saved to Header)
    totals = calculate_item_totals(data.get('items', []), tax_type)
    
    # Create voucher with transaction
    with transaction.atomic():
        # Create sales voucher (Mapped to VoucherSalesInvoiceDetails)
        # We only save fields that exist in the table `voucher_sales_invoicedetails`
        
        voucher = SalesVoucher.objects.create(
            tenant_id=tenant_id,
            date=data['date'],
            voucher_name=voucher_name,
            sales_invoice_no=invoice_number,
            customer_name=customer_info['customer_name'],
            
            bill_to=customer_info['bill_to_address'], 
            # Note: gstin, contact exist in table
            gstin=customer_info['bill_to_gstin'],
            contact=customer_info['bill_to_contact'],
            
            ship_to=data.get('ship_to_address', customer_info['ship_to_address']),
            
            tax_type=tax_type,
            
            # Additional fields supported by schema
            place_of_supply=data.get('place_of_supply'),
            reverse_charge=data.get('reverse_charge', 'N'),
            invoice_type=data.get('invoice_type', 'Regular'),
            
            # Fields NOT in schema header:
            # - status, current_step, totals...
        )
        
        # Create items if provided
        for idx, item_data in enumerate(data.get('items', []), start=1):
            qty = Decimal(str(item_data['quantity']))
            rate = Decimal(str(item_data['rate']))
            gst_rate = Decimal(str(item_data.get('gst_rate', 0)))
            
            taxable_amount = qty * rate
            tax_amount = taxable_amount * (gst_rate / Decimal('100'))
            
            if tax_type == 'within_state':
                cgst_amount = tax_amount / Decimal('2')
                sgst_amount = tax_amount / Decimal('2')
                igst_amount = Decimal('0')
            elif tax_type == 'other_state':
                cgst_amount = Decimal('0')
                sgst_amount = Decimal('0')
                igst_amount = tax_amount
            else:  # export
                cgst_amount = Decimal('0')
                sgst_amount = Decimal('0')
                igst_amount = Decimal('0')
            
            total_invoice_value = taxable_amount + cgst_amount + sgst_amount + igst_amount
            
            SalesVoucherItem.objects.create(
                tenant_id=tenant_id,
                invoice=voucher, # Field name is 'invoice' (FK)
                item_name=item_data['item_name'],
                hsn_sac=item_data.get('hsn_code', ''),
                qty=qty,
                uom=item_data.get('unit', ''),
                item_rate=rate,
                taxable_value=taxable_amount,
                cgst=cgst_amount,
                sgst=sgst_amount,
                igst=igst_amount,
                cess=Decimal('0'),
                invoice_value=total_invoice_value
            )
    
    return voucher
