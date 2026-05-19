import logging
import sys
import os

# Add the current directory to sys.path to import local modules
sys.path.append(os.getcwd())

# Mock logging to capture forensic traces
logging.basicConfig(level=logging.INFO, format='%(message)s')
from ocr_pipeline.normalize import normalize

# The exact payload from the user's request
raw_payload = {
  "header": {
    "vendor_name": "SRI VISHNU HEAT TREATERS",
    "vendor_gstin": "33ABYFS6343M1ZC",
    "invoice_no": "4742/25-26",
    "invoice_date": "13-Sep-2025",
    "total_amount": 73442.00,
    "taxable_value": 65573.28,
    "cgst": 3934.39,
    "sgst": 3934.39
  },
  "items": [
    {
      "description": "HEAT TREATMENT CHARGES",
      "taxable_value": 65573.28,
      "cgst": 3934.39,
      "sgst": 3934.39,
      "total_amount": 73442.00
    }
  ]
}

print("\n=== RUNNING MANDATORY VALIDATION TEST ===")
normalized = normalize(raw_payload)

print("\n=== FINAL NORMALIZED OUTPUT ===")
import json
print(json.dumps(normalized, indent=2))

# Validation Logic
print("\n=== VALIDATION CHECK ===")
results = {
    "invoice_number == 4742/25-26": normalized.get("invoice_number") == "4742/25-26",
    "vendor_name == SRI VISHNU HEAT TREATERS": normalized.get("vendor_name") == "SRI VISHNU HEAT TREATERS",
    "gstin == 33ABYFS6343M1ZC": normalized.get("gstin") == "33ABYFS6343M1ZC",
    "total_invoice_value == 73442.0": normalized.get("total_invoice_value") == 73442.0,
    "items_count > 0": len(normalized.get("sections", {}).get("items", [])) > 0
}

all_passed = True
for check, passed in results.items():
    status = "PASSED" if passed else "FAILED"
    print(f"{status}: {check}")
    if not passed: all_passed = False

if all_passed:
    print("\n[SUCCESS] ALL VALIDATION TESTS PASSED.")
else:
    print("\n[FAILURE] SOME VALIDATION TESTS FAILED.")
    sys.exit(1)
