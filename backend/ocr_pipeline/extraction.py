import os
import json
import logging
import google.generativeai as genai
from typing import Dict, Any

logger = logging.getLogger(__name__)

# Reusing environment variable for API Key
API_KEY = os.getenv("GEMINI_API_KEY")

if API_KEY:
    genai.configure(api_key=API_KEY)

def extract_invoice(file_bytes: bytes) -> Dict[str, Any]:
    """
    Extracts structured data from invoice file bytes using Google Gemini.
    FINAL High-precision comprehensive extraction model.
    """
    if not API_KEY:
        raise ValueError("GEMINI_API_KEY not configured in environment")

    # Define the extraction model
    model = genai.GenerativeModel("models/gemini-2.5-flash")
    
    prompt = """
You are a high-precision invoice extraction engine.

Your task is to extract structured invoice data from a document into STRICT JSON format.

---

# 🎯 CORE OBJECTIVE

Extract ALL relevant invoice fields with HIGH accuracy.

DO NOT skip fields.
DO NOT rename keys.
DO NOT return partial data.

---

# 🧩 STRICT OUTPUT FORMAT (JSON ONLY)

{
  "vendor_name": "",
  "vendor_address": "",
  "vendor_city": "",
  "gstin": "",
  "invoice_number": "",
  "invoice_date": "",
  "place_of_supply": "",
  "due_date": "",
  "payment_terms": "",
  "transporter_name": "",
  "vehicle_number": "",
  "lr_number": "",
  "ack_number": "",
  "ack_date": "",
  "total_amount": 0,
  "taxable_value": 0,
  "cgst": 0,
  "sgst": 0,
  "igst": 0,
  "line_items": [
    {
      "description": "",
      "hsn_code": "",
      "quantity": 0,
      "uom": "",
      "rate": 0,
      "taxable_value": 0,
      "cgst": 0,
      "sgst": 0,
      "igst": 0,
      "amount": 0
    }
  ]
}

---

# 🧠 EXTRACTION STRATEGY (MANDATORY)

## 1. HEADER PARSING (VERY IMPORTANT)
The top section contains:
* Vendor Name (first line)
* Vendor Address (next lines)
* Vendor City (derived from address)

### RULES:
* Vendor Name = FIRST prominent line (usually uppercase)
* Vendor Address = lines immediately after vendor name (full multi-line address)
* STOP address extraction when: GSTIN appears OR Invoice number appears
* vendor_city = the city name extracted from vendor_address
  - Look for patterns: city before PIN code, or city after district
  - Examples: "Coimbatore", "Chennai", "Mumbai"
  - DO NOT guess — only extract if clearly present in address
  - If not found → return empty string ""

---

## 2. GSTIN
* Extract 15-character GSTIN
* Remove spaces
* Must be uppercase

---

## 3. INVOICE DETAILS
Extract:
* invoice_number → labels like "Invoice No", "Bill No", "Inv No"
* invoice_date → convert to YYYY-MM-DD

---

## 4. DUE DETAILS
Extract if present: due_date, payment_terms (e.g., "Net 30", "Due in 15 days")
If not present → return empty string ""

---

## 5. TRANSIT DETAILS
Extract ONLY if clearly present: transporter_name, vehicle_number, lr_number (LR/GR/Consignment No)
If not present → return empty string ""

---

## 6. ACK DETAILS
Extract: ack_number, ack_date
If not present → return empty string ""

---

## 7. AMOUNT DETAILS
Extract: total_amount (final invoice value), taxable_value, cgst, sgst, igst
Convert all to FLOAT. Remove commas.

---

## 8. LINE ITEM EXTRACTION (CRITICAL)
You MUST extract table rows correctly.
For EACH row: description, hsn_code (HSN/SAC column), quantity, uom (unit), rate, taxable_value, cgst, sgst, igst, amount

### RULES:
* Each row = one item
* DO NOT merge rows
* DO NOT skip HSN code
* DO NOT shift columns
* Maintain correct column alignment

---

# 🚫 STRICT RULES
* NO extra keys
* NO missing keys
* NO explanations
* NO text outside JSON
* DO NOT merge vendor name and address
* DO NOT hallucinate data
* If uncertain → return best guess (NOT null unless impossible)

---

# ⚠️ IMPORTANT CONSTRAINTS
* Branch is NOT part of invoice → DO NOT extract it
* vendor_city is DERIVED from vendor_address, NOT a separate OCR scan
* If a field is not present → return empty string "" (NOT null)
* vendor_city must match a real city in the address — no hallucination

---

# 🧠 FINAL GOAL
Return clean, structured, UI-ready data WITHOUT requiring mapping.
"""
    
    # Process blob directly
    try:
        response = model.generate_content([
            prompt,
            {"mime_type": "application/pdf", "data": file_bytes}
        ])
        
        # Parse result
        text = response.text.strip()
        if "```json" in text:
            text = text.split("```json")[-1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[-1].split("```")[0].strip()
            
        result = json.loads(text)
        return result
    except Exception as e:
        logger.error(f"Extraction failed: {str(e)}")
        raise RuntimeError(f"Extraction failed: {str(e)}")
