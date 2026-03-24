import os
import json
import logging
from core.ai_proxy import execute_with_retry, api_key_manager
from core.processing_engine import parse_and_process_ocr

logger = logging.getLogger(__name__)

def perform_ocr_extraction(file_bytes, mime_type, api_key=None, pre_extracted_text=None, hint_data=None):
    """
    STRICT REQUIREMENT: Perform OCR with a retry mechanism and COMPREHENSIVE schema.
    Returns: extracted_dict or result with status: "PARSE_FAILED"
    """
    if not api_key:
        api_key = api_key_manager.get_healthy_key()
    
    if not api_key:
        logger.error("[AI ERROR] No healthy AI keys available")
        return {"status": "PARSE_FAILED", "error": "NO_API_KEY"}

    # 1. COMPREHENSIVE GEMINI PROMPT (INCLUDING ALL UI FIELDS)
    prompt_text = """
You are a high-precision enterprise data extraction engine.
RULE: Return ONLY valid JSON. 
RULE: Do NOT include conversational text or markdown blocks (```json).
RULE: Do NOT include trailing commas.
RULE: Do NOT truncate output.
RULE: Ensure JSON is strictly valid.

EXTRACTION SCHEMA:
{
  "supplier_invoice_no": string,
  "purchase_voucher_series": string,
  "purchase_voucher_no": string,
  "invoice_date": string (YYYY-MM-DD),
  "due_date": string (YYYY-MM-DD),
  "vendor_name": string,
  "gstin": string,
  "branch": string,
  "place_of_supply": string,
  
  "bill_from_address_line_1": string,
  "bill_from_address_line_2": string,
  "bill_from_city": string,
  "bill_from_state": string,
  "bill_from_pincode": string,
  "bill_from_country": string,

  "ship_from_address_line_1": string,
  "ship_from_address_line_2": string,
  "ship_from_city": string,
  "ship_from_state": string,
  "ship_from_pincode": string,
  "ship_from_country": string,

  "total_taxable_value": number,
  "total_igst": number,
  "total_cgst": number,
  "total_sgst": number,
  "total_invoice_value": number,

  "line_items": [
    {
      "description": string,
      "hsn_sac": string,
      "quantity": number,
      "rate": number,
      "taxable_value": number,
      "amount": number
    }
  ]
}
"""

    hint = ""
    if hint_data and 'columns' in hint_data:
        hint += f"\nSTRICT VOUCHER-TYPE HEADER LIST:\n{', '.join(hint_data['columns'])}\n"

    if pre_extracted_text:
        hint += f"\nOCR RAW TEXT (FOR REFERENCE):\n{pre_extracted_text}\n"
    
    final_prompt = prompt_text + hint

    # 2. RETRY MECHANISM
    retry_count = 2
    last_raw_response = ""
    
    for attempt in range(retry_count):
        try:
            raw_text = execute_with_retry(
                [final_prompt, {'mime_type': mime_type, 'data': file_bytes}],
                {},
                api_key
            )
            last_raw_response = raw_text
            data = parse_and_process_ocr(raw_text)

            if data.get("status") != "PARSE_FAILED":
                return data

            logger.warning(f"[RETRY] Attempt {attempt+1} failed to parse JSON")
        except Exception as e:
            logger.error(f"[RETRY ERROR] Attempt {attempt+1}: {e}")

    logger.error("[PIPELINE ERROR] All retry attempts failed to parse JSON")
    return {
        "status": "PARSE_FAILED",
        "error": "RETRY_FAILED",
        "raw_text": last_raw_response[:1000]
    }
