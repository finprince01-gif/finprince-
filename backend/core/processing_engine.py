import json
import re
import logging
from datetime import datetime
from vendors.vendor_validation_logic import validate_vendor
from accounting.sales_validation_logic import validate_sales_customer_and_invoice
from core.ocr_cache import update_staged_invoice_extracted_data

logger = logging.getLogger(__name__)

# Numeric fields that require strict extraction (stripping currency symbols, commas, etc.)
NUMERIC_FIELDS = {
    'Rate', 'Item Rate', 'Taxable Value', 'Taxable Amount',
    'Integrated Tax (IGST)', 'Central Tax (CGST)', 'State Tax (SGST)', 
    'IGST', 'CGST', 'SGST/UTGST', 'Cess', 'Item Amount', 'Amount', 
    'Disc %', 'Disc%', 'Disc Amount', 'GST %', 'GST Rate',
    'Total Taxable Value', 'Total IGST', 'Total CGST', 'Total SGST', 'Total Cess', 
    'Total State Cess', 'Total Invoice Value', 'Invoice Value',
    'TDS Income Tax', 'TDS GST', 'TDS/TCS under GST', 'TDS/TCS under Income Tax',
    'Advance Paid', 'To Pay', 'IGST Rate', 'CGST Rate', 'SGST/UTGST Rate', 
    'Cess Rate', 'Cess Rate Per Unit', 'State Cess Rate',
    'Quantity', 'Qty', 'Billed Quantity', 'Actual Quantity',
    'Advance Payment/Receipt/Refund Details - IGST Rate',
    'Advance Payment/Receipt/Refund Details - IGST Amount',
    'Advance Payment/Receipt/Refund Details - SGST Rate',
    'Advance Payment/Receipt/Refund Details - SGST Amount',
    'Advance Payment/Receipt/Refund Details - CGST Rate',
    'Advance Payment/Receipt/Refund Details - CGST Amount',
    'Tax Type Allocations - IGST Liability',
    'Tax Type Allocations - CGST Liability',
    'Tax Type Allocations - SGST/UTGST Liability',
    'GST Advance Details - GST Rate',
    'GST Advance Details - Cess Rate',
    'GST Advance Details - Advance Amount',
    'TDS - Assessable Value', 'TCS - Assessable Value',
    'Amount'
}

def clean_numeric_fields(obj: dict):
    """Recursively cleans numeric strings in a dictionary."""
    for k, v in list(obj.items()):
        if v is None:
            obj[k] = ''
            continue
            
        if isinstance(v, str):
            # Normalize strings to UPPERCASE and clean noise
            v_clean = ' '.join(v.split()).upper()
            obj[k] = v_clean
            
            # Extract numeric values rigorously if key is in NUMERIC_FIELDS
            if k in NUMERIC_FIELDS:
                val = v_clean.strip()
                if val:
                    # Remove commas and all non-numeric chars except dot and minus
                    cleaned = re.sub(r'[^\d.\-]', '', val.replace(',', ''))
                    obj[k] = cleaned if cleaned else '0'
                else:
                    obj[k] = '0'
        elif isinstance(v, (int, float)):
             if k in NUMERIC_FIELDS:
                 obj[k] = str(v)

def parse_and_process_ocr(raw_text: str):
    """
    The engine that powers 'Finpixe Scan'.
    Cleans OCR raw output, parses JSON, and normalizes fields for the ERP.
    """
    raw_text = raw_text.strip()
    
    # 1. Clean Markdown Fences
    if raw_text.startswith('```json'):
        raw_text = raw_text[7:]
    if raw_text.startswith('```'):
        raw_text = raw_text[3:]
    if raw_text.endswith('```'):
        raw_text = raw_text[:-3]
    raw_text = raw_text.strip()

    # 2. JSON Parsing with salvage logic
    try:
        extracted = json.loads(raw_text)
    except Exception:
        match = re.search(r'\{[\s\S]*\}', raw_text)
        if match:
            extracted = json.loads(match.group(0))
        else:
            raise ValueError("Failed to parse AI response as JSON.")

    # 3. Structural Normalization (Support dynamic and legacy formats)
    invoice_data = {}
    items = []

    if isinstance(extracted, dict) and 'data' in extracted:
        data_obj = extracted['data']
        if isinstance(data_obj, list) and data_obj:
            data_obj = data_obj[0]
        if isinstance(data_obj, dict):
            items = data_obj.pop('items', [])
            invoice_data = data_obj
    elif isinstance(extracted, dict) and ('invoice' in extracted or 'header' in extracted):
        invoice_data = extracted.get('invoice', extracted.get('header', {}))
        items = extracted.get('items', extracted.get('line_items', []))
    else:
        invoice_data = extracted if isinstance(extracted, dict) else {}
        items = []

    # Ensure items is a list
    if not isinstance(items, list):
        items = [items] if items else []

    # 4. Rigorous Field-Level Normalization
    clean_numeric_fields(invoice_data)
    
    total_taxable_items = 0.0
    total_tax_items = 0.0
    
    for idx, item in enumerate(items, start=1):
        if not isinstance(item, dict): continue
        item['S.No'] = str(idx)
        clean_numeric_fields(item)

        # Qty + UOM split logic
        qty_raw = str(item.get('Quantity') or item.get('Qty') or '').strip()
        uom_raw = str(item.get('UOM') or '').strip()
        if qty_raw and not uom_raw:
            m = re.match(r'^([\d.]+)\s*([A-Z]+)$', qty_raw)
            if m:
                if 'Quantity' in item: item['Quantity'] = m.group(1)
                if 'Qty' in item: item['Qty'] = m.group(1)
                item['UOM'] = m.group(2)

        # HSN normalization
        hsn = re.sub(r'[^\d]', '', str(item.get('HSN/SAC', '')))
        item['HSN/SAC'] = hsn if 4 <= len(hsn) <= 8 else ''

        # Accumulate for validation
        try:
            total_taxable_items += float(item.get('Taxable Value') or item.get('Taxable Amount') or 0)
            total_tax_items += float(item.get('IGST') or item.get('Integrated Tax (IGST)') or 0) + \
                               float(item.get('CGST') or item.get('Central Tax (CGST)') or 0) + \
                               float(item.get('SGST/UTGST') or item.get('State Tax (SGST)') or 0) + \
                               float(item.get('Cess') or 0)
        except: pass

    # 5. Cross-Check Header vs Items
    try:
        header_taxable = float(invoice_data.get('Total Taxable Value') or 0)
        if total_taxable_items > 0 and header_taxable == 0:
            invoice_data['Total Taxable Value'] = str(total_taxable_items)
            
        header_total = float(invoice_data.get('Total Invoice Value') or 0)
        total_tax_header = float(invoice_data.get('Total IGST') or 0) + \
                          float(invoice_data.get('Total CGST') or 0) + \
                          float(invoice_data.get('Total SGST') or 0)
        
        computed_total = total_taxable_items + (total_tax_header if total_tax_header > 0 else total_tax_items)
        if header_total == 0 and computed_total > 0:
            invoice_data['Total Invoice Value'] = str(computed_total)
    except: pass

    return {'invoice': invoice_data, 'items': items}

def run_invoice_processing_pipeline(file_hash, tenant_id, voucher_type='Purchase'):
    """
    The full pipeline: Parse -> Normalize -> Validate (Vendor/Customer) -> Update Staging.
    Returns the updated record info.
    """
    from core.ocr_cache import get_cached_ocr
    
    # 1. Fetch existing record
    record = get_cached_ocr(file_hash, tenant_id)
    if not record:
        logger.error(f"Pipeline failure: Record not found for {file_hash}")
        return None
        
    raw_text = record.get('ocr_raw_text', '')
    if not raw_text:
        logger.error("Pipeline failure: No raw OCR text available")
        return None

    try:
        # 2. Mapping Engine (Parse & Normalize)
        processed_data = parse_and_process_ocr(raw_text)
        
        # 3. Validation (Vendor or Customer)
        invoice_header = processed_data.get('invoice', {})
        
        if voucher_type.lower() == 'sales':
            c_name = invoice_header.get('Customer Name') or invoice_header.get('customer_name') or ''
            c_gstin = invoice_header.get('GSTIN') or invoice_header.get('customer_gstin') or ''
            c_branch = invoice_header.get('Branch') or invoice_header.get('branch_name') or ''
            v_no = invoice_header.get('Sales Invoice No') or invoice_header.get('invoice_number') or ''
            
            val_result = validate_sales_customer_and_invoice(
                tenant_id=tenant_id,
                customer_name=c_name,
                gstin=c_gstin,
                branch=c_branch,
                sales_invoice_no=v_no
            )
            matched_id = val_result.get('customer_id')
            matched_by = val_result.get('matched_by') # Might need to add this to sales_validation_logic
        else:
            v_name = invoice_header.get('Vendor Name') or invoice_header.get('vendor_name') or ''
            v_gstin = invoice_header.get('GSTIN') or invoice_header.get('vendor_gstin') or ''
            v_branch = invoice_header.get('Branch') or invoice_header.get('branch_name') or ''
            v_address = invoice_header.get('Bill From - Address Line 1') or invoice_header.get('vendor_address') or ''
            v_state = invoice_header.get('Bill From - State') or ''

            val_result = validate_vendor(
                tenant_id=tenant_id,
                vendor_name=v_name,
                gstin=v_gstin,
                branch=v_branch,
                address=v_address,
                state=v_state
            )
            matched_id = val_result.get('vendor_id')
            matched_by = val_result.get('matched_by')

        # Field validation
        if voucher_type.lower() == 'sales':
            inv_no = invoice_header.get('Sales Invoice No') or invoice_header.get('invoice_number') or ''
            party_name = c_name
        else:
            inv_no = invoice_header.get('Supplier Invoice No') or invoice_header.get('invoice_number') or ''
            party_name = v_name
            
        taxable_val = invoice_header.get('Total Taxable Value') or invoice_header.get('taxable_value') or ''
        grand_total = invoice_header.get('Total Invoice Value') or invoice_header.get('Grand Total') or invoice_header.get('total_amount') or ''
        
        fields_valid = bool(party_name and inv_no and taxable_val and grand_total)
        val_status_raw = val_result.get('status')
        
        if val_status_raw == 'DUPLICATE_INVOICE':
            final_status = 'DUPLICATE'
            conflict_msg = val_result.get('message')
        elif val_status_raw == 'GSTIN_CONFLICT':
            final_status = 'CONFLICT'
            conflict_msg = val_result.get('message')
        elif val_status_raw == 'CUSTOMER_MISSING' or val_status_raw == 'VENDOR_MISSING' or val_status_raw == 'MISSING':
            final_status = 'PARTY_MISSING'
            conflict_msg = val_result.get('message', 'Party not found in master.')
        elif not fields_valid:
            final_status = 'VALIDATION_FAILED'
            conflict_msg = 'Missing required fields (Party, GSTIN, Invoice No, Taxable Value, or Grand Total).'
        else:
            final_status = 'READY'
            conflict_msg = None

        # 4. Update Staging Table
        update_staged_invoice_extracted_data(
            file_hash=file_hash,
            tenant_id=tenant_id,
            extracted_data=processed_data,
            validation_status=final_status,
            matched_by=matched_by,
            conflict_message=conflict_msg,
            vendor_id=matched_id # We reuse vendor_id column for customer_id in sales context or we could rename it in DB but for now reused
        )
        
        return {
            'success': True,
            'status': final_status,
            'vendor_id': matched_id,
            'extracted_data': processed_data
        }
    except Exception as e:
        logger.exception(f"Pipeline error for {file_hash}: {str(e)}")
        return None
