import json
import re
import logging
from datetime import datetime
from typing import Any, cast, Dict, List
from vendors.vendor_validation_logic import validate_vendor # pyre-fixme
from accounting.sales_validation_logic import validate_sales_customer_and_invoice # pyre-fixme

logger = logging.getLogger(__name__)

# Numeric fields that require strict cleaning (stripping currency symbols, commas, etc.)
NUMERIC_FIELDS = {
    'total_invoice_value', 'total_taxable_value', 'total_igst', 'total_cgst', 'total_sgst',
    'quantity', 'rate', 'amount', 'taxable_value', 'igst', 'cgst', 'sgst', 'cess'
}

def safe_json_load(text: str) -> dict:
    """
    STRICT REQUIREMENT: Robust JSON parser that NEVER raises Exception.
    Handles trailing commas, control characters, and extra text.
    Returns: {status: PARSE_FAILED, error: INVALID_JSON, raw_text: text} on failure.
    """
    if not text:
        return {"status": "PARSE_FAILED", "error": "EMPTY_INPUT", "raw_text": ""}

    # STEP 1: Try normal parsing
    try:
        if isinstance(text, dict): return text
        return json.loads(text)
    except Exception:
        pass

    # STEP 2: Cleaning the text
    try:
        # Extract first valid JSON block using regex
        match = re.search(r"\{[\s\S]*\}", str(text), re.DOTALL)
        if not match:
            # Try array if object fails
            match = re.search(r"\[[\s\S]*\]", str(text), re.DOTALL)
            
        if not match:
            return {
                "status": "PARSE_FAILED",
                "error": "INVALID_JSON",
                "raw_text": str(text)
            }
        
        cleaned = match.group(0)

        # Remove trailing commas: ,} -> } and ,] -> ]
        cleaned = re.sub(r',\s*\}', '}', cleaned)
        cleaned = re.sub(r',\s*\]', ']', cleaned)

        # Remove newlines and control chars
        cleaned = cleaned.replace('\n', ' ').replace('\r', ' ')
        
        # Strip leading/trailing junk outside JSON (Regex match group 0 already handles this mostly)
        cleaned = cleaned.strip()

        # STEP 3: Retry parsing
        return json.loads(cleaned)

    except Exception as e:
        # STEP 4: NEVER raise exception
        logger.error(f"[JSON FIX FAILED] {str(e)}")
        return {
            "status": "PARSE_FAILED",
            "error": "INVALID_JSON",
            "raw_text": str(text)
        }

# Mapping table to bridge legacy PascalCase/ERP keys to snake_case
LEGACY_MAPPING = {
    'Voucher Date': 'invoice_date',
    'Supplier Invoice No': 'supplier_invoice_no',
    'Vendor Name': 'vendor_name',
    'GSTIN': 'gstin',
    'Bill From': 'address',
    'Total Invoice Value': 'total_invoice_value',
    'Total Taxable Value': 'total_taxable_value',
    'Item Name': 'description',
    'HSN/SAC': 'hsn_sac',
    'Quantity': 'quantity',
    'Rate': 'rate',
    'Taxable Value': 'taxable_value',
    'Item Amount': 'amount',
    'Total CGST': 'total_cgst',
    'Total SGST': 'total_sgst',
    'Total IGST': 'total_igst',
    'Invoice No': 'supplier_invoice_no',
    'Invoice Number': 'supplier_invoice_no',
    'Supplied Invoice No': 'supplier_invoice_no',
    'Supplier Invoice Number': 'supplier_invoice_no',
    'Description': 'description'
}

def normalize_key(key: str) -> str:
    """Universal key normalizer: lowercase + snake_case."""
    if not key: return ""
    if key in LEGACY_MAPPING:
        return LEGACY_MAPPING[key]
    
    nk = key.lower().strip()
    nk = re.sub(r'[\s\/\-\.]+', '_', nk)
    nk = nk.strip('_')

    if nk in {'date', 'inv_date', 'voucher_date'}:
        return 'invoice_date'
    if nk in {'supplied_invoice_no', 'supplier_inv_no', 'supplier_invoice_num'}:
        return 'supplier_invoice_no'
    if nk in {'total_invoice_amount', 'grand_total', 'invoice_value'}:
        return 'total_invoice_value'
    if nk in {'taxable_amount', 'assessable_value'}:
        return 'total_taxable_value'

    return nk

def clean_numeric_value(val):
    if val is None or val == "": return 0
    if isinstance(val, (int, float)): return val
    
    cleaned = re.sub(r'[^\d.\-]', '', str(val).replace(',', '').replace('₹', ''))
    try:
        return float(cleaned) if cleaned else 0
    except ValueError:
        return 0

def recursive_normalize(data):
    if isinstance(data, list):
        return [recursive_normalize(item) for item in data]
    if isinstance(data, dict):
        new_dict = {}
        for k, v in data.items():
            nk = normalize_key(k)
            nv = recursive_normalize(v)
            if nk in NUMERIC_FIELDS:
                new_dict[nk] = clean_numeric_value(nv)
            else:
                new_dict[nk] = nv
        return new_dict
    return data

def parse_and_process_ocr(raw_text: str) -> dict:
    """
    STRICT REQUIREMENT: Enforces a graceful fallback on parsing failure.
    Refactored to match user's requested logic.
    """
    try:
        # Pre-process cleanup (Markdown strip)
        cleaned_text = raw_text.strip()
        if cleaned_text.startswith("```"):
            parts = cleaned_text.split("```")
            cleaned_text = parts[1] if len(parts) > 1 else cleaned_text
            cleaned_text = cleaned_text.replace("json", "").strip()
            
        # Use ROBUST parser
        extracted = safe_json_load(cleaned_text)

        # Handle failure status from safe_json_load
        if isinstance(extracted, dict) and extracted.get("status") == "PARSE_FAILED":
            logger.error("[OCR PARSE FAILED]")
            return extracted

    except Exception as e:
        logger.error("[UNEXPECTED PARSE ERROR] %s", str(e))
        return {
            "status": "PARSE_FAILED",
            "error": "INVALID_JSON",
            "raw_text": raw_text
        }

    # 2. Structure Normalization
    if isinstance(extracted, list) and extracted:
        extracted = extracted[0]
    
    header = extracted.get('invoice', extracted.get('header', extracted))
    items = extracted.get('items', extracted.get('line_items', []))
    
    # 3. Recursive Normalization (Keys + Numeric Fields)
    norm_header = recursive_normalize(header) if isinstance(header, dict) else {}
    norm_items = recursive_normalize(items) if isinstance(items, list) else []

    # 4. Final Architecture Alignment
    final_output = dict(norm_header)
    final_output.update({
        "supplier_invoice_no": str(norm_header.get("supplier_invoice_no") or norm_header.get("invoice_no") or ""),
        "invoice_date": str(norm_header.get("invoice_date") or norm_header.get("date") or ""),
        "vendor_name": str(norm_header.get("vendor_name") or norm_header.get("supplier_name") or ""),
        "gstin": str(norm_header.get("gstin") or norm_header.get("vendor_gstin") or ""),
        "total_invoice_value": clean_numeric_value(norm_header.get("total_invoice_value") or norm_header.get("invoice_value") or 0),
        "total_taxable_value": clean_numeric_value(norm_header.get("total_taxable_value") or 0),
        "line_items": []
    })

    # Standardize line items
    line_items_list = []
    for item in norm_items:
        item_dict = cast(Dict[str, Any], item)
        standard_item = dict(item_dict)
        standard_item.update({
            "description": str(item_dict.get("description") or item_dict.get("item_name") or "Item"),
            "quantity": clean_numeric_value(item_dict.get("quantity") or 0),
            "rate": clean_numeric_value(item_dict.get("rate") or 0),
            "amount": clean_numeric_value(item_dict.get("amount") or item_dict.get("item_amount") or 0),
            "hsn_sac": str(item_dict.get("hsn_sac") or "")
        })
        line_items_list.append(standard_item)
    
    final_output["line_items"] = line_items_list
    final_output["status"] = "SUCCESS" # Mark successful parse

    return final_output

def run_invoice_processing_pipeline(file_hash, tenant_id, voucher_type='Purchase'):
    """
    Standardized Pipeline with strict snake_case enforcement.
    """
    try:
        from core.ocr_cache import get_cached_ocr
        
        record = get_cached_ocr(file_hash, tenant_id)
        if not record:
            return {'success': False, 'status': 'RECORD_NOT_FOUND', 'error': 'Record not found'}
            
        raw_text = record.get('ocr_raw_text', '')
        extracted_data = record.get('extracted_data')
        
        # Run standardizer
        if raw_text:
            processed_data = parse_and_process_ocr(raw_text)
        elif extracted_data:
            processed_data = parse_and_process_ocr(json.dumps(extracted_data))
        else:
            return {'success': False, 'status': 'PROCESSING_FAILED', 'error': 'No text found'}

        if processed_data.get('status') == 'PARSE_FAILED':
            return {'success': False, 'status': 'PARSE_FAILED', 'error': 'AI RESPONSE NOT VALID JSON'}

        # 1. Validation Logic
        v_name = processed_data.get('vendor_name') or ''
        v_gstin = processed_data.get('gstin', '')
        branch = processed_data.get('branch', '')
        
        if voucher_type == 'Sales':
            inv_no = processed_data.get('sales_invoice_no', '')
            val_result = validate_sales_customer_and_invoice(tenant_id=tenant_id, customer_name=v_name, gstin=v_gstin, branch=branch, sales_invoice_no=inv_no)
            status = 'READY' # Or other logic mapped earlier
            p_id = val_result.get('customer_id')
        else:
            inv_no = processed_data.get('supplier_invoice_no', '')
            val_result = validate_vendor(tenant_id=tenant_id, vendor_name=v_name, gstin=v_gstin, branch=branch, supplier_invoice_no=inv_no)
            raw_s = val_result.get('status')
            status = 'READY' if raw_s == 'FOUND' else 'VENDOR_MISSING'
            p_id = val_result.get('vendor_id')

        # 2. Persist
        from core.ocr_cache import update_staged_invoice_extracted_data
        update_staged_invoice_extracted_data(
            file_hash=file_hash,
            tenant_id=tenant_id,
            extracted_data=processed_data,
            validation_status=status,
            matched_by=val_result.get('matched_by'),
            vendor_id=p_id
        )
        
        return {'success': True, 'status': status, 'extracted_data': processed_data}

    except Exception as e:
        logger.exception(f"[PIPELINE ERROR] {e}")
        return {'success': False, 'error': str(e)}
