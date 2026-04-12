import json
import logging
from google.genai import types

logger = logging.getLogger(__name__)

def extract_invoice(client, file_bytes, voucher_type='Purchase', public_ip="0.0.0.0"):
    """
    Extracts invoice data using Gemini 2.0 Flash.
    Returns a unified JSON object matching the internal schema.
    """
    prompt = f"""
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

# 🧠 EXTRACTION STRATEGY

## 1. TAX & TOTALS
* MANDATORY: If IGST Rate, CGST Rate, or SGST Rate are present at the bottom summary of the invoice, you MUST distribute those rates (e.g. 9.0, 18.0) to every line item in the JSON. NO EXCEPTIONS.
* Even if it is handwritten symbols like "@", "9 %", or "GST", identify them as tax rates.
* Taxable Value per item should be the base amount (Rate * Qty) before any Discount. If it is NOT explicitly in the row, you MUST compute it as Qty * Rate.
* The `total_amount` in the header should be the Grand Total of the invoice.

## 2. LINE ITEM ALIGNMENT
* Extract all items in the table. 
* Ensure `description` is exactly as written.
* If `hsn_code` is present, extract it for each row.

## 3. ADDRESS EXTRACTION
* Extract the FULL multi-line address for the vendor/supplier.
* Identify the GSTIN of the vendor.

---

# 🚫 RULES
* Return ONLY valid JSON.
* Ensure all numeric fields are numbers (not strings).
* If a field is missing, use "" for strings or 0 for numbers.
* DO NOT hallucinate the invoice total into the line item amounts.
"""
    
    # Process blob directly
    try:
        logger.info(f"AI OCR Call: gemini-2.0-flash | Outbound IP: {public_ip}")
        response = client.models.generate_content(
            model="gemini-2.0-flash", 
            contents=[
                prompt,
                {"inline_data": {"mime_type": "application/pdf", "data": file_bytes}}
            ],
            config=types.GenerateContentConfig(
                http_options=types.HttpOptions(timeout=None)
            )
        )
        
        # Parse result
        text = response.text.strip()
        logger.info(f"RAW AI RESPONSE: {text}")
        
        if "```json" in text:
            text = text.split("```json")[-1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[-1].split("```")[0].strip()
            
        result = json.loads(text)
        return result
    except Exception as e:
        logger.error(f"Extraction failed: {str(e)}")
        raise RuntimeError(f"Extraction failed: {str(e)}")
