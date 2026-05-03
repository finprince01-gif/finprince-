import os
import sys
import django
import json

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.repository import InvoiceTempOCR

# Get the EXACT records that the frontend is fetching (most recent 5)
records = list(InvoiceTempOCR.objects.filter(
    status__in=["EXTRACTED", "PENDING", "VOUCHER_CREATED", "FAILED"]
).order_by('-id')[:5])

print(f"=== CHECKING {len(records)} MOST RECENT RECORDS ===\n")

for r in records:
    ext_data = r.extracted_data if isinstance(r.extracted_data, dict) else {}
    
    # Direct top-level
    va_toplevel = ext_data.get('vendor_address', 'MISSING')
    
    # Inside sections.supplier_details
    sections = ext_data.get('sections', {})
    supplier = sections.get('supplier_details', {}) if isinstance(sections, dict) else {}
    va_supplier = supplier.get('vendor_address', 'MISSING')
    
    print(f"--- Record ID: {r.id} | Invoice: {r.supplier_invoice_no} ---")
    print(f"  extracted_data.vendor_address = '{va_toplevel}'")
    print(f"  extracted_data.sections.supplier_details.vendor_address = '{va_supplier}'")
    print(f"  gstin = {r.gstin}")
    print()

print("\n=== CHECKING FIRST RECORD FULL KEYS ===")
r = records[0]
ext_data = r.extracted_data if isinstance(r.extracted_data, dict) else {}
print("Top-level keys:", list(ext_data.keys()))
print("sections.supplier_details keys:", list(ext_data.get('sections', {}).get('supplier_details', {}).keys()))
