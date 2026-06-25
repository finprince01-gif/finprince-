"""Compute exact before/after prompt size metrics after rule removal."""
import hashlib

schema = (
    '{"header":{"vendor_name":"","vendor_address":"","billing_address":"",'
    '"vendor_gstin":"","vendor_state":"","place_of_supply":"","invoice_no":"",'
    '"invoice_date":"","total_amount":0,"taxable_value":0,"cgst":0,"sgst":0,'
    '"igst":0,"gst_taxability_type":"Taxable","gst_nature_of_transaction":"",'
    '"sales_order_no":"","irn":"","ack_no":"","ack_date":""},'
    '"items":[{"description":"","hsn_code":"","quantity":0,"uom":"","rate":0,'
    '"discount_percent":0,"taxable_value":0,"igst_rate":0,"igst_amount":0,'
    '"cgst_rate":0,"cgst_amount":0,"sgst_rate":0,"sgst_amount":0,'
    '"cess_rate":0,"cess_amount":0,"amount":0}]}'
)

BEFORE = (
    "Extract PURCHASE invoice data into this exact JSON schema:\n\n"
    + schema + "\n\n"
    "RULES:\n"
    "1. header: one entry per invoice; items: one row per line item.\n"
    '2. vendor_address = "Consignee/Ship To" block; billing_address = "Buyer/Bill To" block only. Never mix them. Null if absent.\n'
    '3. invoice_no: prefer label "Invoice No"/"Bill No", near top/date, must have \u22651 digit, 3-25 chars.\n'
    '4. place_of_supply: state name or code (e.g. "33-Tamil Nadu").\n'
    "5. total_amount = taxable_value + cgst + sgst + igst. item amount = taxable_value + taxes.\n"
    "6. HSN/SAC and UOM per item if visible.\n"
    '7. Continuation page: extract invoice_no and vendor_name from top labels; markers: "continued","amount chargeable","authorised signatory","rounded off".\n'
    "8. Missing field \u2192 null. No hallucination. All numeric fields must be numbers.\n"
    "Return ONLY valid JSON."
)

AFTER = (
    "Extract PURCHASE invoice data into this exact JSON schema:\n\n"
    + schema + "\n\n"
    "RULES:\n"
    '1. vendor_address = "Consignee/Ship To" block; billing_address = "Buyer/Bill To" block only. Never mix them. Null if absent.\n'
    '2. invoice_no: prefer label "Invoice No"/"Bill No", near top/date, must have \u22651 digit, 3-25 chars.\n'
    "3. total_amount = taxable_value + cgst + sgst + igst. item amount = taxable_value + taxes.\n"
    "4. HSN/SAC and UOM per item if visible.\n"
    '5. Continuation page: extract invoice_no and vendor_name from top labels; markers: "continued","amount chargeable","authorised signatory","rounded off".\n'
    "6. Missing field \u2192 null. No hallucination. All numeric fields must be numbers.\n"
    "Return ONLY valid JSON."
)

rule1_text = "1. header: one entry per invoice; items: one row per line item.\n"
rule4_text = '4. place_of_supply: state name or code (e.g. "33-Tamil Nadu").\n'
removed_chars = len(rule1_text) + len(rule4_text)

h_before = hashlib.sha256(BEFORE.encode("utf-8")).hexdigest()
h_after  = hashlib.sha256(AFTER.encode("utf-8")).hexdigest()

print(f"Rule 1 chars removed : {len(rule1_text)}")
print(f"Rule 4 chars removed : {len(rule4_text)}")
print(f"Total removed        : {removed_chars}")
print()
print(f"BEFORE chars : {len(BEFORE)}")
print(f"AFTER  chars : {len(AFTER)}")
print(f"Delta        : -{len(BEFORE)-len(AFTER)} chars")
print(f"Reduction    : {((len(BEFORE)-len(AFTER))/len(BEFORE))*100:.1f}%")
print()
print(f"BEFORE tokens (est @4c/tok) : {len(BEFORE)//4}")
print(f"AFTER  tokens (est @4c/tok) : {len(AFTER)//4}")
print(f"Tokens saved per call        : {(len(BEFORE)-len(AFTER))//4}")
print()
print(f"BEFORE prefix hash : {h_before}")
print(f"AFTER  prefix hash : {h_after}")
print(f"Hash changed       : {h_before != h_after}")
