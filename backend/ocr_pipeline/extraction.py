import json
import logging
import re
from google.genai import types

logger = logging.getLogger(__name__)

def extract_json_from_text(text):
    """
    Robust JSON extraction:
    1. Look for ```json ... ``` blocks (case-insensitive).
    2. Fallback to finding the first { and its matching }.
    """
    if not text:
        return ""
        
    # 1. Markdown regex: matches ```json ... ``` or just ``` ... ```
    markdown_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL | re.IGNORECASE)
    if markdown_match:
        return markdown_match.group(1).strip()
    
    # 2. Brace-balancing fallback
    start_idx = text.find('{')
    if start_idx == -1:
        return text.strip()
        
    brace_count = 0
    end_idx = -1
    
    for i in range(start_idx, len(text)):
        if text[i] == '{':
            brace_count += 1
        elif text[i] == '}':
            brace_count -= 1
            if brace_count == 0:
                end_idx = i
                break
                
    if end_idx != -1:
        return text[start_idx : end_idx + 1].strip()
    
    return text.strip()

def extract_invoice(client, file_bytes, voucher_type='Purchase', public_ip="0.0.0.0", user_id='system', tenant_id='system'):
    """
    Extracts invoice data using the central AI Proxy service with fallbacks.
    Returns a unified JSON object matching the internal schema.
    """
    prompt_text = f"""
Extract invoice data from this {voucher_type} document into the EXACT JSON format below.
Failure to extract ANY field that is visible on the document is unacceptable.

# 🎯 SCHEMA
{{
  "header": {{
    "vendor_name": "",
    "vendor_address": "",
    "billing_address": "",
    "vendor_gstin": "",
    "vendor_state": "",
    "place_of_supply": "",
    "invoice_no": "",
    "invoice_date": "",
    "total_amount": 0,
    "taxable_value": 0,
    "cgst": 0,
    "sgst": 0,
    "igst": 0,
    "gst_taxability_type": "Taxable",
    "gst_nature_of_transaction": "",
    "sales_order_no": "",
    "irn": "",
    "ack_no": "",
    "ack_date": ""
  }},
  "items": [
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

# 🧠 EXTRACTION STRATEGY (STRICT RULES)

## 1. DATA SEPARATION & MAPPING
* **HEADER FIELDS**: Extract exactly ONCE per invoice into the "header" object.
* **LINE ITEMS**: Extract as a list of rows into the "items" array. 
* **NO MIXING**: Do NOT mix header values into item rows incorrectly. 

## 2. FINANCIAL VALIDATION
* **TOTAL INTEGRITY**: Total Invoice Value MUST equal sum(Taxable Value + Taxes).
* **ROW ACCURACY**: Row count MUST match visible table rows.
* **DO NOT GUESS**: If a field is missing, return NULL. Do NOT hallucinate.

## 4. VENDOR/SUPPLIER IDENTIFICATION
* **INVOICE NUMBER (HIGH RELIABILITY)**: 
    * **MULTI-PATTERN DETECTION**: Detect invoice numbers in ALL possible formats:
        - Standard: "Invoice No: 25-26/335"
        - Reversed: "25-26/335 Invoice No"
        - Inline: "Invoice No 089/25-26"
        - Loose OCR: "Inv No - SS/25-26/0487"
    * **CANDIDATE SELECTION (RANKING)**: If multiple candidates exist, choose based on:
        1. Proximity to "Invoice No" or "Bill No" label (Highest Priority).
        2. Location near top of document or near Date field.
        3. Presence of structured separators (slashes "/" or dashes "-").
        4. Longer structured values are preferred over simple short numbers.
    * **VALIDATION**: Must contain at least ONE digit. 3-25 chars long.
    * **REJECT**: Pure alphabetic strings (BANK, TOTAL, etc.), labels, or values < 3 chars.
    * **DO NOT GUESS**: Return NULL if no valid candidate clearly satisfies the rules.
* **VENDOR/SUPPLIER**: The entity issuing the bill.
* **BILLING ADDRESS**: Full address of the Buyer/Customer.
* **PLACE OF SUPPLY**: Look for state label or code (e.g., "33-Tamil Nadu").

## 5. LINE ITEM EXTRACTION (STRICT)
* **HSN/SAC**: Every line must have an HSN code if visible.
* **UOM**: Extract units (Nos, Pcs, Kgs, etc.).
* **LINE TOTALS**: `taxable_value` + taxes = `amount`. Ensure this math holds.

## 6. MULTI-PAGE AWARENESS
* If this document is a segment of a larger invoice, ensure you still extract the header info (GSTIN, Invoice No) from any available labels on the page.

# 🚫 RULES
* Return ONLY valid JSON.
* Ensure all numeric fields are numbers.
* NO hallway citations or placeholders.
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
            # Store raw text for regex fallbacks in normalization
            result["_raw_text"] = raw_text
            logger.info("Successfully parsed Proxy-mediated Gemini response.")
            return result
        except json.JSONDecodeError as jde:
            logger.error(f"JSON Decode Error in Proxy response: {str(jde)}")
            return {"_error": "JSON_DECODE_FAILED", "_raw": raw_text}

    except Exception as e:
        logger.error(f"Extraction failed via proxy: {str(e)}")
        raise RuntimeError(f"Extraction failed: {str(e)}")



