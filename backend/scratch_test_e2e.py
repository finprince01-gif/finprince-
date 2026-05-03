
import os
import sys
import json
import django

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.repository import InvoiceTempOCR
from ocr_pipeline.zoho_adapter import get_zoho_adapter

# 1. Fetch real DB data
records = list(InvoiceTempOCR.objects.filter(status__in=["EXTRACTED", "PENDING", "VOUCHER_CREATED", "FAILED"]).order_by('-id')[:1])
if not records:
    print("No DB records")
    sys.exit()

r = records[0]
print(f"--- DB Record ID: {r.id} ---")
ext_data = r.extracted_data if isinstance(r.extracted_data, dict) else {}
print(f"DB vendor_address: {ext_data.get('vendor_address')}")

# 2. Simulate Frontend /api/staging/ processing
staged_results = [{
    "supplier_invoice_no": r.supplier_invoice_no,
    "gstin": r.gstin,
    "extracted_data": ext_data
}]

# 3. Simulate invoicesForAdapter payload builder in frontend
invoicesForAdapter = []
for sr in staged_results:
    e = sr.get("extracted_data", {})
    invoicesForAdapter.append({
        "invoice_number": sr.get("supplier_invoice_no") or e.get("supplier_invoice_no") or e.get("invoice_no"),
        "vendor_name": e.get("vendor_name") or e.get("sections", {}).get("supplier_details", {}).get("vendor_name"),
        "vendor_address": e.get("vendor_address") or e.get("sections", {}).get("supplier_details", {}).get("vendor_address"),
        "bill_from": e.get("sections", {}).get("supplier_details", {}).get("bill_from"),
        "gstin": sr.get("gstin"),
        "items": e.get("sections", {}).get("items", []) or e.get("line_items", []) or e.get("items", [])
    })

print(f"\n--- invoicesForAdapter Payload Sent to /api/zoho-reconstruct/ ---")
print(json.dumps(invoicesForAdapter, indent=2))

# 4. Simulate Backend /api/zoho-reconstruct/
adapter = get_zoho_adapter()
processed_invoices = adapter.reconstruct_invoices({"invoices": invoicesForAdapter})

print(f"\n--- API Response from /api/zoho-reconstruct/ ---")
if processed_invoices:
    recon = processed_invoices[0]
    print(f"vendor_address in response: {recon.get('vendor_address')}")
    print(f"Bill Address From in response: {recon.get('Bill Address From')}")
else:
    print("Empty response")
