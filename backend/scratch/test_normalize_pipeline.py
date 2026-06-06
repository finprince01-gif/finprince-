import os, sys, django, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from ocr_pipeline.normalize import get_canonical_export_record

# Check record 1006138
record = InvoiceTempOCR.objects.get(id=1006138)
tenant_id = record.tenant_id
extracted_data = record.extracted_data

# Run get_canonical_export_record
print("Running get_canonical_export_record:")
canonical_dict = get_canonical_export_record(extracted_data, tenant_id=tenant_id)

# Print keys and values of the returned object
print("\nCanonical Invoice Schema fields:")
print(f"  invoice_no: {canonical_dict.get('invoice_no')}")
print(f"  invoice_date: {canonical_dict.get('invoice_date')}")
print(f"  vendor_name: {canonical_dict.get('vendor_name')}")
print(f"  gstin: {canonical_dict.get('gstin')}")
print(f"  raw_gstin: {canonical_dict.get('raw_gstin')}")
print(f"  canonical_gstin: {canonical_dict.get('canonical_gstin')}")
print(f"  vendor_gstin: {canonical_dict.get('vendor_gstin')}")
print(f"  buyer_gstin: {canonical_dict.get('buyer_gstin')}")
print(f"  consignee_gstin: {canonical_dict.get('consignee_gstin')}")
print(f"  ship_to_gstin: {canonical_dict.get('ship_to_gstin')}")
print(f"  bill_to_gstin: {canonical_dict.get('bill_to_gstin')}")
print(f"  raw_vendor_gstin: {canonical_dict.get('raw_vendor_gstin')}")
print(f"  raw_buyer_gstin: {canonical_dict.get('raw_buyer_gstin')}")
print(f"  raw_consignee_gstin: {canonical_dict.get('raw_consignee_gstin')}")
print(f"  canonical_vendor_gstin: {canonical_dict.get('canonical_vendor_gstin')}")
print(f"  canonical_buyer_gstin: {canonical_dict.get('canonical_buyer_gstin')}")
print(f"  canonical_consignee_gstin: {canonical_dict.get('canonical_consignee_gstin')}")
