from typing import Dict, Any, List
import logging

logger = logging.getLogger(__name__)

# Canonical keys based on user's new strict requirement
VOUCHER_MAPPING = {
    "PURCHASE": {
        "vendor_name": ["vendor_name", "vendor", "supplier", "party name", "supplier name", "party"],
        "gstin": ["gstin", "gst no", "gst_no"],
        "invoice_number": ["invoice_number", "invoice no", "inv no", "bill no", "reference_no"],
        "invoice_date": ["invoice_date", "date", "bill date"],
        "total_amount": ["total_amount", "total", "grand total", "total_invoice_value"],
        "taxable_value": ["taxable_value", "total_taxable_value"],
        "cgst": ["cgst", "total_cgst"],
        "sgst": ["sgst", "total_sgst"],
        "igst": ["igst", "total_igst"]
    }
}

def normalize_keys(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Standardizes keys by lowercasing, stripping, and removing special chars.
    """
    if not isinstance(data, dict): return {}
    normalized = {}
    for k, v in data.items():
        key = str(k).lower().strip().replace(" ", "_").replace("-", "_").replace(".", "")
        normalized[key] = v
    return normalized

def map_fields(extracted_data: Dict[str, Any], voucher_type: str) -> Dict[str, Any]:
    """
    Step 2: Map Fields.
    Prioritizes the strict keys returned by the new high-precision prompt.
    """
    voucher_type = str(voucher_type).upper()
    data = normalize_keys(extracted_data)
    
    # Get mapping config for voucher type (fallback to direct naming)
    mapping = VOUCHER_MAPPING.get(voucher_type, {})
    result = {}

    # Prioritize the AI's exact field names from prompt
    for field, aliases in mapping.items():
        value = None
        # Try direct field name first
        if field in data:
            value = data[field]
        else:
            # Fallback to aliases
            for alias in aliases:
                alias_norm = alias.replace(" ", "_").lower()
                if alias_norm in data:
                    value = data[alias_norm]
                    break
        
        result[field] = value

    # Preserve line items exactly as AI returned them
    result["line_items"] = data.get("line_items", [])
    
    # Pass through any other fields for consistency
    for key in ["currency", "place_of_supply", "ack_no", "irn"]:
        if key in data:
            result[key] = data[key]

    logger.info(f"MAPPED DATA: {result}")
    return result
