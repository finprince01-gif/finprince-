import logging
import sys
import os
import json

# Add the current directory to sys.path to import local modules
sys.path.append(os.getcwd())

logging.basicConfig(level=logging.INFO, format='%(message)s')
from ocr_pipeline.normalize import normalize

# The payload as it ACTUALLY comes from the AI (with "reply" wrapper)
raw_ai_payload = {
  "reply": json.dumps({
    "header": {
      "vendor_name": "SRI VISHNU HEAT TREATERS",
      "vendor_gstin": "33ABYFS6343M1ZC",
      "invoice_no": "4742/25-26",
      "invoice_date": "13-Sep-2025",
      "total_amount": 73442.00
    },
    "items": [
      {
        "description": "HEAT TREATMENT CHARGES",
        "amount": 73442.00
      }
    ]
  }),
  "record_id": "TEST_RECORD_001"
}

print("\n=== RUNNING CRITICAL ROOT-CAUSE VALIDATION ===")
print(f"Input Keys: {list(raw_ai_payload.keys())}")

normalized = normalize(raw_ai_payload)

print("\n=== FINAL NORMALIZED OUTPUT ===")
print(json.dumps(normalized, indent=2))

# Validation Logic
print("\n=== VALIDATION CHECK ===")
results = {
    "REPLY Wrapper Parsed": "header" in normalized.get("_pages", {}) or "sections" in normalized,
    "Invoice Number Extracted": normalized.get("invoice_number") == "4742/25-26",
    "Vendor Name Extracted": normalized.get("vendor_name") == "SRI VISHNU HEAT TREATERS",
    "Items Extracted": len(normalized.get("sections", {}).get("items", [])) > 0,
    "Record ID Preserved": normalized.get("record_id") == "TEST_RECORD_001"
}

all_passed = True
for check, passed in results.items():
    status = "PASSED" if passed else "FAILED"
    print(f"{status}: {check}")
    if not passed: all_passed = False

if all_passed:
    print("\n[SUCCESS] CRITICAL ROOT-CAUSE RESOLVED. REPLY WRAPPER HANDLED.")
else:
    print("\n[FAILURE] FIX FAILED.")
    sys.exit(1)
