
import sys
import os
from typing import Dict, Any

# Mock the environment
sys.path.append(os.getcwd())

from ocr_pipeline.zoho_adapter import ZohoAdapter

# Sample Normalized Data (output from test_normalization.py)
normalized_inv = {
    "sections": {
        "supplier_details": {
            "vendor_name": "RAJHANS STEEL INDIA",
            "vendor_address": "NO. 123, COIMBATORE, TAMIL NADU - 641001",
            "bill_from": "NO. 123, COIMBATORE, TAMIL NADU - 641001",
            "gstin": "33AAECR0000A1Z1"
        },
        "supply_details": {
            "total_invoice_value": 1180,
            "total_taxable_value": 1000
        },
        "items": [
            {
                "description": "STEEL ROD",
                "quantity": 10,
                "rate": 100,
                "taxable_value": 1000,
                "cgst_amount": 90,
                "sgst_amount": 90,
                "amount": 1180
            }
        ]
    },
    "vendor_name": "RAJHANS STEEL INDIA",
    "vendor_address": "NO. 123, COIMBATORE, TAMIL NADU - 641001",
    "gstin": "33AAECR0000A1Z1"
}

adapter = ZohoAdapter()
print("--- TESTING RECONSTRUCT_INVOICES ---")
data = {"invoices": [normalized_inv]}
results = adapter.reconstruct_invoices(data)

if results:
    inv = results[0]
    print(f"Result Top-level vendor_address: {inv.get('vendor_address')}")
    print(f"Result Section vendor_address: {inv.get('sections', {}).get('supplier_details', {}).get('vendor_address')}")
    print(f"Result Section bill_from: {inv.get('sections', {}).get('supplier_details', {}).get('bill_from')}")

print("\n--- TESTING RESOLVE_ZOHO_ROW ---")
row = adapter.resolve_zoho_row(normalized_inv, normalized_inv["sections"]["items"][0])
print(f"Row 'Bill Address From': {row.get('Bill Address From')}")
print(f"Row 'Bill Address To': {row.get('Bill Address To')}")

print("\n--- TEST FINISHED ---")
