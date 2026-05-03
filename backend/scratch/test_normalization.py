
import logging
import sys
import os

# Mock the environment to allow importing from the workspace
sys.path.append(os.getcwd())

from ocr_pipeline.normalize import normalize

# Sample AI Output (as seen in user logs)
ai_output = {
    "header": {
        "vendor_name": "RAJHANS STEEL INDIA",
        "vendor_gstin": "33AAECR0000A1Z1",
        "vendor_address": "NO. 123, COIMBATORE, TAMIL NADU - 641001",
        "invoice_no": "INV/001",
        "invoice_date": "2024-05-01"
    },
    "items": [
        {
            "description": "STEEL ROD",
            "quantity": 10,
            "rate": 100,
            "taxable_value": 1000
        }
    ]
}

print("--- STARTING TEST ---")
result = normalize(ai_output)

print("\n--- NORMALIZATION RESULT (TOP LEVEL) ---")
print(f"vendor_name: {result.get('vendor_name')}")
print(f"vendor_address: {result.get('vendor_address')}")
print(f"gstin: {result.get('gstin')}")

print("\n--- NORMALIZATION RESULT (SECTIONS) ---")
supplier = result.get("sections", {}).get("supplier_details", {})
print(f"supplier.vendor_name: {supplier.get('vendor_name')}")
print(f"supplier.vendor_address: {supplier.get('vendor_address')}")
print(f"supplier.bill_from: {supplier.get('bill_from')}")
print(f"supplier.branch: {supplier.get('branch')}")

print("\n--- TEST FINISHED ---")
