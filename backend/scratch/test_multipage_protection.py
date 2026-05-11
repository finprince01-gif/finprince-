import logging
import sys
import os
import json

# Add the current directory to sys.path to import local modules
sys.path.append(os.getcwd())

logging.basicConfig(level=logging.INFO, format='%(message)s')
from ocr_pipeline.normalize import normalize

# Page 1: Full data
page1 = {
  "header": {
    "vendor_name": "SRI VISHNU HEAT TREATERS",
    "vendor_gstin": "33ABYFS6343M1ZC",
    "invoice_no": "4742/25-26",
    "total_amount": 73442.00
  },
  "items": [{"description": "PAGE 1 ITEM", "amount": 70000.00}]
}

# Page 2: Empty/Partial data (The Poison)
page2 = {
  "header": {
    "vendor_name": "",
    "vendor_gstin": None,
    "invoice_no": "MISSING",
    "total_amount": 0.0
  },
  "items": [{"description": "PAGE 2 ITEM", "amount": 3442.00}]
}

multipage_payload = {
    "_pages": {
        "1": page1,
        "2": page2
    }
}

print("\n=== RUNNING MULTIPAGE POISONING TEST ===")
normalized = normalize(multipage_payload)

print("\n=== FINAL NORMALIZED OUTPUT (MULTIPAGE) ===")
print(json.dumps(normalized, indent=2))

# Validation Logic
print("\n=== VALIDATION CHECK (MULTIPAGE) ===")
results = {
    "Vendor Name Preserved": normalized.get("vendor_name") == "SRI VISHNU HEAT TREATERS",
    "Invoice No Preserved": normalized.get("invoice_number") == "4742/25-26",
    "GSTIN Preserved": normalized.get("gstin") == "33ABYFS6343M1ZC",
    "Items Aggregated": len(normalized.get("sections", {}).get("items", [])) == 2
}

all_passed = True
for check, passed in results.items():
    status = "PASSED" if passed else "FAILED"
    print(f"{status}: {check}")
    if not passed: all_passed = False

if all_passed:
    print("\n[SUCCESS] MULTIPAGE PROTECTION WORKS. PAGE 2 DID NOT POISON PAGE 1.")
else:
    print("\n[FAILURE] MULTIPAGE PROTECTION FAILED.")
    sys.exit(1)
