import os
import re

# Base prompt template with PURCHASE
voucher_type = 'PURCHASE'
base_prompt = f"""Extract {voucher_type} invoice data into this exact JSON schema:

{{"header":{{"vendor_name":"","vendor_address":"","billing_address":"","vendor_gstin":"","vendor_state":"","place_of_supply":"","invoice_no":"","invoice_date":"","total_amount":0,"taxable_value":0,"cgst":0,"sgst":0,"igst":0,"gst_taxability_type":"Taxable","gst_nature_of_transaction":"","sales_order_no":"","irn":"","ack_no":"","ack_date":""}},"items":[{{"description":"","hsn_code":"","quantity":0,"uom":"","rate":0,"discount_percent":0,"taxable_value":0,"igst_rate":0,"igst_amount":0,"cgst_rate":0,"cgst_amount":0,"sgst_rate":0,"sgst_amount":0,"cess_rate":0,"cess_amount":0,"amount":0}}]}}

RULES:
1. header: one entry per invoice; items: one row per line item.
2. vendor_address = "Consignee/Ship To" block; billing_address = "Buyer/Bill To" block only. Never mix them. Null if absent.
3. invoice_no: prefer label "Invoice No"/"Bill No", near top/date, must have ≥1 digit, 3-25 chars.
4. place_of_supply: state name or code (e.g. "33-Tamil Nadu").
5. total_amount = taxable_value + cgst + sgst + igst. item amount = taxable_value + taxes.
6. HSN/SAC and UOM per item if visible.
7. Continuation page: extract invoice_no and vendor_name from top labels; markers: "continued","amount chargeable","authorised signatory","rounded off".
8. Missing field → null. No hallucination. All numeric fields must be numbers.
Return ONLY valid JSON.
"""

with open("page1_ocr.txt", "r", encoding="utf-8") as f:
    raw_ocr = f.read()

# Clean up OCR text (as done in extraction.py line 971-972)
cleaned_ocr = re.sub(r'[ \t]+', ' ', raw_ocr).strip()
cleaned_ocr = re.sub(r'(\r\n|\r|\n){2,}', '\n\n', cleaned_ocr)

prompt_text = f"{base_prompt}\n\n### [PAGE 1 OCR DATA]\n{cleaned_ocr}"

system_prompt = "Expert Indian GST invoice OCR. Return ONLY valid JSON per the given schema. No markdown, no explanation."

# Save files
with open("REAL_SYSTEM_PROMPT.txt", "w", encoding="utf-8") as f:
    f.write(system_prompt)

with open("REAL_USER_PROMPT.txt", "w", encoding="utf-8") as f:
    f.write(prompt_text)

print(f"OCR Raw Length: {len(raw_ocr)}")
print(f"OCR Cleaned Character Count: {len(cleaned_ocr)}")
print(f"Prompt Character Count: {len(prompt_text)}")
