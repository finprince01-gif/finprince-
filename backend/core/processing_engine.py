import json
import re
import logging
from datetime import datetime
from vendors.vendor_validation_logic import validate_vendor
from accounting.sales_validation_logic import validate_sales_customer_and_invoice
from core.ocr_cache import update_staged_invoice_extracted_data

logger = logging.getLogger(__name__)

# Numeric fields that require strict cleaning (stripping currency symbols, commas, etc.)
NUMERIC_FIELDS = {
    'total_invoice_value', 'total_taxable_value', 'total_igst', 'total_cgst', 'total_sgst',
    'quantity', 'rate', 'amount', 'taxable_value', 'igst', 'cgst', 'sgst', 'cess'
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
    # 1. Custom mapping for known ERP/PascalCase matches
    if key in LEGACY_MAPPING:
        return LEGACY_MAPPING[key]
    
    # 2. General logic: remove spaces, slashes, hyphens -> underscore
    # Lowercase first
    nk = key.lower().strip()
    # Replace special chars with underscore
    nk = re.sub(r'[\s\/\-\.]+', '_', nk)
    # Remove leading/trailing underscores
    nk = nk.strip('_')

    # 3. Manual Aliases for OCR inconsistencies ('Supplied' vs 'Supplier' etc)
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
    """Rigorous numeric cleaner: remove ₹, commas, etc."""
    if val is None or val == "": return 0
    if isinstance(val, (int, float)): return val
    
    # Remove currency symbols (₹, $), commas, and spaces
    cleaned = re.sub(r'[^\d.\-]', '', str(val).replace(',', ''))
    try:
        return float(cleaned) if cleaned else 0
    except ValueError:
        return 0

def recursive_normalize(data):
    """Recursively normalize keys and values in nested structures."""
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
    Enforces a STRICT, system-wide snake_case output.
    Output structure is standardized to the required single format.
    """
    # 1. Extraction from raw AI string
    clean_text = raw_text.strip()
    if clean_text.startswith("```"):
        parts = clean_text.split("```")
        clean_text = parts[1] if len(parts) > 1 else clean_text
    clean_text = clean_text.replace("json", "").strip()

    try:
        extracted = json.loads(clean_text)
    except Exception:
        match = re.search(r'\{[\s\S]*\}', clean_text)
        if match:
            try:
                extracted = json.loads(match.group(0))
            except Exception:
                raise Exception("AI RESPONSE NOT VALID JSON")
        else:
            raise Exception("AI RESPONSE NOT VALID JSON")

    # 2. Structure Normalization (handle common nested variants)
    if isinstance(extracted, list) and extracted:
        extracted = extracted[0]
    
    # Support: {invoice: {}, items: []} or {header: {}, line_items: []}
    header = extracted.get('invoice', extracted.get('header', extracted))
    items = extracted.get('items', extracted.get('line_items', []))
    
    # 3. Recursive Normalization (Keys + Numeric Fields)
    norm_header = recursive_normalize(header) if isinstance(header, dict) else {}
    norm_items = recursive_normalize(items) if isinstance(items, list) else []

    # 4. Final Architecture Alignment (Enforce SINGLE Structure)
    # Target: { supplier_invoice_no, invoice_date, vendor_name, gstin, total_invoice_value, line_items: [] }
    final_output = dict(norm_header)
    final_output.update({
        "supplier_invoice_no": str(norm_header.get("supplier_invoice_no") or norm_header.get("invoice_no") or ""),
        "invoice_date": str(norm_header.get("invoice_date") or norm_header.get("date") or ""),
        "due_date": str(norm_header.get("due_date") or ""),
        "vendor_name": str(norm_header.get("vendor_name") or norm_header.get("supplier_name") or ""),
        "gstin": str(norm_header.get("gstin") or norm_header.get("vendor_gstin") or ""),
        "total_invoice_value": clean_numeric_value(norm_header.get("total_invoice_value") or norm_header.get("invoice_value") or 0),
        "total_taxable_value": clean_numeric_value(norm_header.get("total_taxable_value") or 0),
        "total_cgst": clean_numeric_value(norm_header.get("total_cgst") or 0),
        "total_sgst": clean_numeric_value(norm_header.get("total_sgst") or 0),
        "total_igst": clean_numeric_value(norm_header.get("total_igst") or 0),
        "line_items": []
    })

    # Standardize line items
    for item in norm_items:
        # Start with all normalized fields (preserves extra AI fields)
        standard_item = dict(item)
        
        # Enforce/Correct core architecture fields
        standard_item.update({
            "description": str(item.get("description") or item.get("item_name") or item.get("name") or "Item"),
            "quantity": clean_numeric_value(item.get("quantity") or 0),
            "rate": clean_numeric_value(item.get("rate") or 0),
            "amount": clean_numeric_value(item.get("amount") or item.get("item_amount") or 0),
            "hsn_sac": str(item.get("hsn_sac") or item.get("hsn") or "")
        })
        
        # Verify amount if 0
        if standard_item["amount"] == 0 and standard_item["quantity"] > 0 and standard_item["rate"] > 0:
            standard_item["amount"] = standard_item["quantity"] * standard_item["rate"]
            
        final_output["line_items"].append(standard_item)

    # Cross-calculate totals if missing
    if final_output["total_invoice_value"] == 0 and final_output["line_items"]:
        final_output["total_invoice_value"] = sum(item["amount"] for item in final_output["line_items"])

    print("✅ ARCHITECTURE ENFORCED (SNAKE_CASE):", list(final_output.keys()), flush=True)
    return final_output

def run_invoice_processing_pipeline(file_hash, tenant_id, voucher_type='Purchase'):
    """
    Standardized Pipeline with strict snake_case enforcement.
    """
    from core.ocr_cache import get_cached_ocr, update_staged_invoice_extracted_data
    
    record = get_cached_ocr(file_hash, tenant_id)
    if not record:
        logger.error(f"Pipeline failure: Record matching {file_hash} not found")
        return {'success': False, 'status': 'RECORD_NOT_FOUND', 'error': 'Record not found'}
        
    raw_text = record.get('ocr_raw_text', '')
    extracted_data = record.get('extracted_data')
    
    try:
        # Run standardizer (it's idempotent, safe to run on already extracted results)
        if raw_text:
            processed_data = parse_and_process_ocr(raw_text)
        elif extracted_data:
            # Re-normalize existing dict to ensure it matches the 2024 architecture rules
            processed_data = parse_and_process_ocr(json.dumps(extracted_data))
        else:
            return {'success': False, 'status': 'PROCESSING_FAILED', 'error': 'No text or data found'}

        # 1. Validation Logic
        v_name = processed_data.get('vendor_name') or processed_data.get('customer_name') or ''
        v_gstin = processed_data.get('gstin', '')
        branch = processed_data.get('branch', '')
        
        # Route to correct validation logic
        if voucher_type == 'Sales':
            inv_no = processed_data.get('sales_invoice_no', '')
            val_result = validate_sales_customer_and_invoice(
                tenant_id=tenant_id,
                customer_name=v_name,
                gstin=v_gstin,
                branch=branch,
                sales_invoice_no=inv_no
            )
            # Re-map status keys to standardized UI statuses
            if raw_s == 'DUPLICATE_INVOICE': 
                status = 'READY' # Allow duplicates as per user request
            elif raw_s == 'GSTIN_CONFLICT': status = 'GSTIN_CONFLICT'
            elif raw_s == 'READY': status = 'READY'
            else: status = 'VENDOR_MISSING' # UI uses VENDOR_MISSING generic 'Not Found'
            
            p_id = val_result.get('customer_id')
        else:
            # Default to Purchase
            inv_no = processed_data.get('supplier_invoice_no', '')
            val_result = validate_vendor(
                tenant_id=tenant_id,
                vendor_name=v_name,
                gstin=v_gstin,
                branch=branch,
                supplier_invoice_no=inv_no
            )
            raw_s = val_result.get('status')
            if raw_s == 'DUPLICATE_INVOICE': 
                status = 'DUPLICATE'
            elif raw_s == 'GSTIN_CONFLICT': status = 'GSTIN_CONFLICT'
            elif raw_s == 'FOUND': status = 'READY'
            else: status = 'VENDOR_MISSING'

            p_id = val_result.get('vendor_id')

        # 2. Persist standardized snake_case data
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
        logger.exception(f"Pipeline failure: {e}")
        return {'success': False, 'error': str(e)}
