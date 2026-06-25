import re
import logging
import json

logger = logging.getLogger(__name__)

def rule_parse_invoice(file_bytes: bytes, mime_type: str, pre_extracted_text: str = None) -> dict:
    """
    Zero-cost rule-based extractor for invoices. 
    Quickly extracts essential header fields from PDF/Images to prevent 504 pipeline stalls.
    """
    result = {
        "invoice": {},
        "header": {}, # Support both naming styles
        "items": [],
        "line_items": [], # Support both naming styles
        "summary_totals": {
            "Grand Total": "0.00",
            "Taxable Value": "0.00"
        },
        "_fallback": True
    }
    
    try:
        # 1. Extract Text
        text = pre_extracted_text or ""
        if not text:
            # Fallback parsing requires pre-extracted text from PaddleOCR
            logger.warning("Rule parser skipped because pre_extracted_text is empty")
            return result

        # 2. Extract Patterns
        patterns = {
            "Voucher Date":        r'\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b',
            "Supplier Invoice No": r'(?:Invoice|Bill|Inv)\s*(?:No|#)[:\s]*([A-Z0-9/-]{3,20})',
            "GSTIN":               r'\b(\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d])\b',
            "Total Invoice Value": r'(?:Grand Total|Total Amount|Net Payable|Total)[:\s₹]*(\d[\d,]+(?:\.\d+)?)',
            "Vendor Name":         r'(?:From|Seller|Vendor|Supplier)[:\s]+([A-Za-z][A-Za-z\s&.,]{3,50})',
            "Grand Total":         r'(?:Grand Total|Total Amount|Net Payable|Total)[:\s₹]*(\d[\d,]+(?:\.\d+)?)',
        }

        found_data = {}
        for field, pattern in patterns.items():
            m = re.search(pattern, text, re.I)
            if m:
                val = m.group(1).strip().replace(',', '')
                found_data[field] = val

        # Populate both 'invoice' and 'header' keys for maximum compatibility
        result["invoice"] = found_data
        result["header"] = found_data
        
        # Populate specific summary fields safely
        summary = {
            "Grand Total": "0.00",
            "Taxable Value": "0.00"
        }
        if "Total Invoice Value" in found_data:
            summary["Grand Total"] = found_data["Total Invoice Value"]
        if "Grand Total" in found_data:
            summary["Grand Total"] = found_data["Grand Total"]
            
        result["summary_totals"] = summary

        logger.info(f"Rule-Based Fallback Success: {found_data}")
        
    except Exception as e:
        logger.error(f"Rule Parser Error: {e}")
        
    return result
