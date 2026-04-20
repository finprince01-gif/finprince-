import json
import logging
import re
from google.genai import types

logger = logging.getLogger(__name__)

def extract_json_from_text(text):
    """
    Robust JSON extraction:
    1. Look for ```json ... ``` blocks (case-insensitive).
    2. Fallback to finding the first { and last } markers.
    """
    if not text:
        return ""
        
    # 1. Markdown regex: matches ```json ... ``` or just ``` ... ```
    # Using re.DOTALL to match across newlines
    markdown_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL | re.IGNORECASE)
    if markdown_match:
        return markdown_match.group(1).strip()
    
    # 2. Block fallback: Find first '{' and last '}'
    start_idx = text.find('{')
    end_idx = text.rfind('}')
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        return text[start_idx : end_idx + 1].strip()
    
    return text.strip()

def extract_invoice(client, file_bytes, voucher_type='Purchase', public_ip="0.0.0.0", user_id='system', tenant_id='system'):
    """
    Extracts invoice data using the central AI Proxy service with fallbacks.
    Returns a unified JSON object matching the internal schema.
    """
    prompt_text = f"""
Extract invoice data from this {voucher_type} document into the EXACT JSON format below.

# 🎯 SCHEMA
{{
  "vendor_name": "",
  "vendor_address": "",
  "vendor_gstin": "",
  "vendor_state": "",
  "invoice_no": "",
  "invoice_date": "",
  "total_amount": 0,
  "taxable_value": 0,
  "cgst": 0,
  "sgst": 0,
  "igst": 0,
  "gst_taxability_type": "Taxable",
  "gst_nature_of_transaction": "",
  "line_items": [
    {{
      "description": "",
      "hsn_code": "",
      "quantity": 0,
      "uom": "",
      "rate": 0,
      "discount_percent": 0,
      "taxable_value": 0,
      "igst_rate": 0,
      "igst_amount": 0,
      "cgst_rate": 0,
      "cgst_amount": 0,
      "sgst_rate": 0,
      "sgst_amount": 0,
      "cess_rate": 0,
      "cess_amount": 0,
      "amount": 0
    }}
  ]
}}

---

---

# 🧠 EXTRACTION STRATEGY

## 1. VENDOR/SUPPLIER IDENTIFICATION (CRITICAL)
* The **VENDOR/SUPPLIER** is the entity issuing the bill (Letterhead/Top).
* The **BUYER/CUSTOMER** (Bill To/Ship To/Consignee) is NOT the vendor.
* **STRICT RULE**: Extract the entity charging money. Ignoring the Buyer is mandatory.
* Use the GSTIN associated with the Letterhead name.

## 2. LINE ITEM EXTRACTION (MANDATORY)
* **EXTRACT EVERY SINGLE LINE ITEM**. Do not summarize or skip.
* Every row in the document must have a corresponding entry in `line_items`.
* Merge multi-line descriptions into a single string.

## 3. TAX & TOTALS
* Distribute header/footer tax rates (CGST/SGST/IGST) to all line items.
* Total Amount must be the Grand Total of the invoice.

## 4. ADDRESS & GSTIN
* Extract the full address of the Supplier/Vendor from the Letterhead.
* Do not extract the Buyer's GSTIN.

---

# 🚫 RULES
* Return ONLY valid JSON.
* Ensure all numeric fields are numbers.
* NEVER hallucinate Buyer info as Vendor info.
* NEVER truncate the items list.
"""
    
    import base64
    from core.ai_proxy import ai_service
    
    # Process via central proxy to benefit from key rotation and model fallback
    try:
        # Encode file for proxy
        file_b64 = base64.b64encode(file_bytes).decode('utf-8')
        
        request_data = {
            'prompt': prompt_text,
            'image_data': file_b64,
            'mime_type': 'application/pdf',
            'voucher_type': voucher_type
        }
        
        logger.info(f"AI OCR Request dispatched to proxy (Type: extraction, User: {user_id})")
        response = ai_service.make_request('extraction', request_data, user_id, tenant_id)
        
        if 'error' in response:
            raise RuntimeError(response['error'])

        raw_text = response.get('reply', '').strip()
        cleaned_json_text = extract_json_from_text(raw_text)
        
        try:
            result = json.loads(cleaned_json_text)
            logger.info("Successfully parsed Proxy-mediated Gemini response.")
            return result
        except json.JSONDecodeError as jde:
            logger.error(f"JSON Decode Error in Proxy response: {str(jde)}")
            return {"_error": "JSON_DECODE_FAILED", "_raw": raw_text}

    except Exception as e:
        logger.error(f"Extraction failed via proxy: {str(e)}")
        raise RuntimeError(f"Extraction failed: {str(e)}")

def extract_bank_statement(file_bytes, user_id='system', tenant_id='system'):
    """
    Extracts bank transactions from PDF statement using AI.
    """
    prompt_text = """
Extract EVERY single transaction from this bank statement into the EXACT JSON format below.
# 🎯 SCHEMA
{
  "transactions": [
    {
      "date": "DD/MM/YYYY",
      "narration": "",
      "reference_number": "",
      "cheque_number": "",
      "debit_amount": 0,
      "credit_amount": 0,
      "running_balance": 0
    }
  ]
}

---
# 🧠 EXTRACTION STRATEGY
1. **MULTI-PAGE DETECTION**: Review all pages of the document. Continue extraction until the very last transaction on the final page.
2. **ROW-BY-ROW**: Every row in the transaction table MUST be an entry in the JSON.
3. **VALIDATION**: If the statement provides a summary (e.g., "Dr Count" or "Cr Count"), ensure your extracted list matches those counts exactly.
4. **NARRATION**: Capture the full narration, even if it spans multiple lines.

# 🚫 RULES
* DO NOT summarize.
* DO NOT skip any entries at the end of pages or near the footer.
* DO NOT stop until you reach the closing balance of the statement.
* Return ONLY valid JSON.
"""
    
    import base64
    from core.ai_proxy import ai_service
    
    try:
        file_b64 = base64.b64encode(file_bytes).decode('utf-8')
        request_data = {
            'prompt': prompt_text,
            'image_data': file_b64,
            'mime_type': 'application/pdf',
            'voucher_type': 'Bank Statement'
        }
        
        response = ai_service.make_request('extraction', request_data, user_id, tenant_id)
        if 'error' in response:
            raise RuntimeError(response['error'])

        raw_text = response.get('reply', '').strip()
        cleaned_json_text = extract_json_from_text(raw_text)
        
        result = json.loads(cleaned_json_text)
        return result
    except Exception as e:
        logger.error(f"Bank extraction failed: {str(e)}")
        raise RuntimeError(f"Bank extraction failed: {str(e)}")


