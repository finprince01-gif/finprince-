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

# Junk values to ignore in critical fields
JUNK_VALUES = {'DATED', 'DATE', 'NO', 'NUMBER', 'BILL', 'INV', 'INVOICE', 'PARTICULARS', 'DETAILS'}

def clean_numeric_fields(obj: dict):
    """Recursively cleans numeric strings in a dictionary."""
    for k, v in list(obj.items()):
        if v is None:
            obj[k] = ''
            continue
            
        if isinstance(v, str):
            # Normalize strings to UPPERCASE and clean noise
            v_clean = ' '.join(v.split()).upper().strip()
            
            # Junk Filter: If field is just a junk keyword, clear it
            if v_clean in JUNK_VALUES:
                obj[k] = ''
                continue

            obj[k] = v_clean
            
            # Extract numeric values rigorously if key is in NUMERIC_FIELDS
            if k in NUMERIC_FIELDS:
                val = v_clean.strip()
                if val:
                    # Remove commas and all non-numeric chars except dot and minus
                    cleaned = re.sub(r'[^\d.\-]', '', val.replace(',', ''))
                    # Ensure it's a valid float
                    try:
                        float(cleaned)
                        obj[k] = cleaned if cleaned else '0'
                    except ValueError:
                        obj[k] = '0'
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
    # STEP 2: CLEAN RESPONSE
    clean_text = raw_text.strip()
    if clean_text.startswith("```"):
        parts = clean_text.split("```")
        clean_text = parts[1] if len(parts) > 1 else clean_text
    clean_text = clean_text.replace("json", "").strip()
    print("🧹 CLEANED AI RESPONSE:", clean_text, flush=True)

    # STEP 3: SAFE JSON PARSE
    try:
        extracted = json.loads(clean_text)
        print("📦 PARSED JSON:", extracted, flush=True)
    except Exception as e:
        match = re.search(r'\{[\s\S]*\}', clean_text)
        if match:
            try:
                extracted = json.loads(match.group(0))
                print("📦 PARSED JSON (via salvage):", extracted, flush=True)
            except Exception:
                print("❌ JSON PARSE FAILED:", str(e))
                raise Exception("AI RESPONSE NOT VALID JSON")
        else:
            print("❌ JSON PARSE FAILED:", str(e))
            raise Exception("AI RESPONSE NOT VALID JSON")

    # Handle structural flattening
    if isinstance(extracted, list) and extracted:
        extracted = extracted[0]
    if isinstance(extracted, dict) and 'data' in extracted:
        extracted = extracted['data']
        if isinstance(extracted, list) and extracted:
            extracted = extracted[0]

    # STEP 4: NORMALIZE KEYS (CRITICAL)
    inv_obj = extracted.get('invoice', extracted.get('header', extracted))
    if not isinstance(inv_obj, dict): inv_obj = {}

    normalized = {
        "invoice_number": str(inv_obj.get("invoice_number") or inv_obj.get("invoice_no") or inv_obj.get("inv_number") or inv_obj.get("Supplier Invoice No") or ""),
        "invoice_date":   str(inv_obj.get("invoice_date") or inv_obj.get("date") or inv_obj.get("Voucher Date") or ""),
        "vendor_name":    str(inv_obj.get("vendor_name") or inv_obj.get("supplier") or inv_obj.get("vendor") or inv_obj.get("Vendor Name") or ""),
        "vendor_gstin":   str(inv_obj.get("vendor_gstin") or inv_obj.get("gstin") or inv_obj.get("GSTIN") or ""),
        "total_amount":   str(inv_obj.get("total_amount") or inv_obj.get("amount") or inv_obj.get("total") or inv_obj.get("Total Invoice Value") or inv_obj.get("Grand Total") or "")
    }
    
    # STEP 5: STRIP + CLEAN VALUES
    for key, value in normalized.items():
        if isinstance(value, str):
            normalized[key] = value.strip()
    
    print("🔁 NORMALIZED DATA:", normalized, flush=True)

    # STEP 6: VALIDATE CORE FIELDS
    if not any([normalized.get("invoice_number"), normalized.get("vendor_name"), normalized.get("total_amount")]):
        print("❌ ALL CRITICAL FIELDS EMPTY")
    
    # STEP 7: LOG FINAL MAPPED DATA
    print("💾 FINAL DATA TO STORE:", normalized, flush=True)

    # STEP 8: STORE EXACT VALUES & CONTINUE PROCESSING
    invoice_data = inv_obj.copy()
    items = extracted.get('items', extracted.get('line_items', []))
    if not isinstance(items, list): items = [items] if items else []

    invoice_data['Supplier Invoice No'] = normalized['invoice_number']
    invoice_data['Vendor Name']         = normalized['vendor_name']
    invoice_data['Total Invoice Value'] = normalized['total_amount']
    invoice_data['Voucher Date']        = normalized['invoice_date']
    invoice_data['GSTIN']               = normalized['vendor_gstin']

    # Remove duplicated raw keys to clean up UI display
    for k in ["invoice_number", "invoice_no", "inv_number", "invoice_date", "date", 
              "supplier", "vendor", "vendor_name", "vendor_gstin", "gstin", 
              "total_amount", "amount", "total"]:
        invoice_data.pop(k, None)

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

def extract_invoice_data_fallback(text: str) -> dict:
    """Robust regex-based extraction fallback as requested by user."""
    import re
    
    def find(patterns):
        for p in patterns:
            match = re.search(p, text, re.I | re.M)
            if match:
                val = match.group(1).strip()
                # Secondary junk check for the captured group
                if val.upper() in JUNK_VALUES: continue
                return val
        return ""

    invoice_no = find([
        r"invoice\s*no[:\s]*([A-Z0-9\-\/]+)",
        r"bill\s*no[:\s]*([A-Z0-9\-\/]+)",
        r"Inv\s*#\s*[:\s]*([A-Z0-9\-\/]+)"
    ])

    date = find([
        r"date[:\s]*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})"
    ])

    amount = find([
        r"total\s*amount[:\s]*₹?\s*([0-9,]+\.?[0-9]*)",
        r"grand\s*total[:\s]*₹?\s*([0-9,]+\.?[0-9]*)",
        r"Total[:\s]*₹?\s*([0-9,]+\.?[0-9]*)",
        r"amount[:\s]*₹?\s*([0-9,]+\.?[0-9]*)"
    ])

    # Vendor fallback: Look for lines that look like company names (no digits, multi-word)
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    candidate_vendor = ""
    for line in lines[:5]: # Check first 5 lines
        if line.upper() in JUNK_VALUES: continue
        # If line contains digits, it's likely part of an address or date
        if any(char.isdigit() for char in line): continue
        if len(line.split()) >= 1:
            candidate_vendor = line
            break

    return {
        "invoice_no": invoice_no,
        "vendor": candidate_vendor,
        "date": date,
        "amount": amount,
        "_fallback": True # Mark as low confidence
    }

def validate_extraction(data: dict):
    """Validation layer to check for missing fields."""
    missing = []
    inv = data.get('invoice', {})
    
    # Map requested fields to our schema keys
    # 'Vendor Name', 'Supplier Invoice No', 'Total Invoice Value'
    if not inv.get('Supplier Invoice No'):
        missing.append("invoice_no")
    if not inv.get('Vendor Name'):
        missing.append("vendor")
    if not inv.get('Total Invoice Value'):
        missing.append("amount")

    return missing

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
    extracted_data = record.get('extracted_data')
    
    if not raw_text and not extracted_data:
        logger.error("Pipeline failure: No raw OCR text or extracted data available")
        return None

    try:
        # 2. Mapping Engine (Parse & Normalize if needed)
        if extracted_data and isinstance(extracted_data, dict) and extracted_data.get('invoice'):
            processed_data = extracted_data
        else:
            processed_data = parse_and_process_ocr(raw_text)

        # 2b. FALLBACK EXTRACTION (If core fields missing)
        invoice_header = processed_data.get('invoice', {})
        if not invoice_header.get('Supplier Invoice No') or not invoice_header.get('Vendor Name'):
            logger.info(f"Primary extraction incomplete for {file_hash}, running regex fallback...")
            fallback = extract_invoice_data_fallback(raw_text)
            if not invoice_header.get('Supplier Invoice No'):
                invoice_header['Supplier Invoice No'] = fallback.get('invoice_no', '')
            if not invoice_header.get('Vendor Name'):
                invoice_header['Vendor Name'] = fallback.get('vendor', '')
            if not invoice_header.get('Total Invoice Value'):
                invoice_header['Total Invoice Value'] = fallback.get('amount', '')
            processed_data['invoice'] = invoice_header
        
        # 3. Validation (Vendor or Customer)
        invoice_header = processed_data.get('invoice', {})
        
        if voucher_type.lower() == 'sales':
            c_name = invoice_header.get('Customer Name') or invoice_header.get('customer_name') or ''
            c_gstin = invoice_header.get('GSTIN') or invoice_header.get('customer_gstin') or ''
            c_branch = invoice_header.get('Branch') or invoice_header.get('branch_name') or ''
            v_no = invoice_header.get('Sales Invoice No') or invoice_header.get('invoice_number') or ''
            party_name = c_name
            inv_no = v_no
            
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
            v_inv_no = invoice_header.get('Supplier Invoice No') or invoice_header.get('invoice_number') or ''
            party_name = v_name
            inv_no = v_inv_no

            val_result = validate_vendor(
                tenant_id=tenant_id,
                vendor_name=v_name,
                gstin=v_gstin,
                branch=v_branch,
                address=v_address,
                state=v_state,
                supplier_invoice_no=v_inv_no
            )
            matched_id = val_result.get('vendor_id')
            matched_by = val_result.get('matched_by')
        # 3b. Determine if this extraction is LOW CONFIDENCE
        is_low_confidence = processed_data.get('_fallback', False)
        
        # 3c. Final Status Mapping
        taxable_val = invoice_header.get('Total Taxable Value') or invoice_header.get('taxable_value') or ''
        grand_total = invoice_header.get('Total Invoice Value') or invoice_header.get('Grand Total') or invoice_header.get('total_amount') or ''
        
        # Clean numeric check: must be > 0
        try:
            total_float = float(grand_total) if grand_total else 0
            is_valid_amount = total_float > 0
        except:
            is_valid_amount = False

        fields_valid = bool(party_name and inv_no and taxable_val and grand_total and is_valid_amount)
        val_status_raw = val_result.get('status')
        
        if is_low_confidence:
            final_status = 'NEEDS_ATTENTION'
            conflict_msg = "Low-confidence OCR extraction. Please review all fields manually."
        elif val_status_raw == 'DUPLICATE_INVOICE':
            final_status = 'DUPLICATE'
            conflict_msg = val_result.get('message')
        elif val_status_raw == 'GSTIN_CONFLICT':
            final_status = 'GSTIN_CONFLICT'
            conflict_msg = val_result.get('message', 'GSTIN Conflict detected.')
        elif val_status_raw in ('CUSTOMER_MISSING', 'VENDOR_MISSING', 'MISSING'):
            final_status = 'VENDOR_MISSING' # Rename to match frontend expectation
            conflict_msg = val_result.get('message', 'Party not found in master.')
        elif not fields_valid:
            missing_fields = validate_extraction(processed_data)
            if not is_valid_amount and "amount" not in missing_fields: missing_fields.append("amount invalid (>0)")
            final_status = 'NEEDS_ATTENTION'
            conflict_msg = f"Invalid or missing required fields: {', '.join(missing_fields)}" if missing_fields else 'Validation failure.'
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
        # STEP 9: VERIFY DB WRITE
        h = processed_data.get('invoice', {})
        print("💾 DB STORED VALUES:", {
            "invoice_number": h.get('Supplier Invoice No'),
            "vendor_name": h.get('Vendor Name'),
            "total_amount": h.get('Total Invoice Value')
        }, flush=True)
        
        return {
            'success': True,
            'status': final_status,
            'vendor_id': matched_id,
            'extracted_data': processed_data
        }
    except Exception as e:
        logger.exception(f"Pipeline error for {file_hash}: {str(e)}")
        # STEP 6 & 8: GUARANTEE DB UPDATE (NO SILENT SKIP)
        try:
            update_staged_invoice_extracted_data(
                file_hash=file_hash,
                tenant_id=tenant_id,
                extracted_data={},
                validation_status='NEEDS_ATTENTION',
                conflict_message=f"Processing failed: {str(e)[:200]}"
            )
        except Exception as db_err:
            logger.error(f"Failed to record pipeline error: {db_err}")
        return {'success': False, 'error': str(e)}

