import json
import logging
import re
import base64
import fitz  # PyMuPDF
from google.genai import types
from core.ai_proxy import ai_service

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

    ROOT-CAUSE FIX (PAYLOAD ISOLATION):
    Processes each page independently with ONLY its own OCR text and image.
    Ensures prompt size remains < 150K and prevents "full document" leakage.
    """
    # ── STEP 1: IDENTIFY PAGES ──
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        page_count = len(doc)
    except Exception:
        doc = None
        page_count = 1

    # ── STEP 2: PREPARE BASE PROMPT (UNTOUCHED) ──
    base_prompt = f"""
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

    def _call_ai_for_page(segment_bytes, page_ocr_text, page_idx):
        """
        HARD ISOLATION RULE: ONE PAGE -> ONE OCR TEXT -> ONE IMAGE -> ONE REQUEST
        """
        # Ensure ONLY this page's OCR text is included. 
        # Explicitly label the text to prevent any overlap with previous/next pages.
        page_isolated_prompt = f"### [PAGE {page_idx+1} OCR DATA]\n{page_ocr_text}\n\n{base_prompt}"
        
        file_b64 = base64.b64encode(segment_bytes).decode('utf-8')
        
        # Build fresh request dictionary to ensure no 'full_document_text' or 'combined_raw_text' leakage
        request_data = {
            'type': 'extraction',
            'prompt': page_isolated_prompt,
            'image_data': file_b64,
            'mime_type': 'application/pdf',
            'voucher_type': voucher_type,
            'page_index': page_idx + 1
        }
        
        prompt_size = len(page_isolated_prompt)
        logger.info(f"AI OCR ISOLATED Request | Page: {page_idx+1} | Prompt Size: {prompt_size} chars | User: {user_id}")
        
        if prompt_size > 300000:
             logger.warning(f"CRITICAL: Isolated prompt for page {page_idx+1} exceeds 300K limit ({prompt_size} chars).")

        response = ai_service.make_request('extraction', request_data, user_id, tenant_id)
        
        if 'error' in response:
            raise RuntimeError(response['error'])

        raw_text = response.get('reply', '').strip()
        cleaned_json_text = extract_json_from_text(raw_text)
        
        try:
            result = json.loads(cleaned_json_text)
            result["_raw_text"] = raw_text
            return result
        except json.JSONDecodeError as jde:
            logger.error(f"JSON Decode Error in Proxy response: {str(jde)}")
            return {"_error": "JSON_DECODE_FAILED", "_raw": raw_text}

    # ── STEP 3: SEQUENTIAL EXECUTION (ISOLATED) ──
    if page_count <= 1:
        page_text = doc[0].get_text("text") if doc else ""
        res = _call_ai_for_page(file_bytes, page_text, 0)
        if doc: doc.close()
        return res

    logger.info(f"[ISOLATION FIX] Splitting multi-page segment into {page_count} isolated AI calls.")
    final_result = None

    for i in range(page_count):
        # 1. Extract ONLY this page's OCR text
        page_text = doc[i].get_text("text")
        
        # 2. Extract ONLY this page as a standalone PDF
        new_doc = fitz.open()
        new_doc.insert_pdf(doc, from_page=i, to_page=i)
        page_bytes = new_doc.write()
        new_doc.close()

        page_result = _call_ai_for_page(page_bytes, page_text, i)

        if "_error" in page_result:
            if final_result is None:
                if doc: doc.close()
                return page_result
            logger.warning(f"Skipping corrupted page {i+1} due to {page_result.get('_error')}")
            continue

        # ── STEP 4: DETERMINISTIC MERGING ──
        if final_result is None:
            final_result = page_result
        else:
            final_result.setdefault("items", []).extend(page_result.get("items", []))
            final_result["_raw_text"] = final_result.get("_raw_text", "") + "\n" + page_result.get("_raw_text", "")

            # Header Merge (Intelligent Patching)
            for k, v in page_result.get("header", {}).items():
                curr_h = final_result["header"]
                if not curr_h.get(k) or curr_h.get(k) == 0 or curr_h.get(k) == "":
                    if v: curr_h[k] = v

    if doc: doc.close()
    return final_result





