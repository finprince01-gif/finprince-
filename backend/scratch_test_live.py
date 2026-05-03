import requests
import json

# Fetch auth token or login
# Actually, the user's server is running on 8000
# I will just write a standalone Django script to bypass DRF auth, 
# or I can use the existing views via the Django request factory.

import os
import sys
import django

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.repository import InvoiceTempOCR
from ocr_pipeline.views import ZohoReconstructView
from django.test import RequestFactory
from rest_framework.test import force_authenticate
from django.contrib.auth import get_user_model

# 1. Setup Request
User = get_user_model()
user = User.objects.first()
if not user:
    print("No user found")
    sys.exit()

factory = RequestFactory()

# 2. Get the exact data from DB that is being sent
records = list(InvoiceTempOCR.objects.filter(status__in=["EXTRACTED", "PENDING", "VOUCHER_CREATED", "FAILED"]).order_by('-id')[:1])
r = records[0]
ext_data = r.extracted_data if isinstance(r.extracted_data, dict) else {}

# 3. Simulate invoicesForAdapter Payload
e = ext_data
payload = [{
    "invoice_number": r.supplier_invoice_no or e.get("supplier_invoice_no") or e.get("invoice_no"),
    "vendor_name": e.get("vendor_name") or e.get("sections", {}).get("supplier_details", {}).get("vendor_name"),
    "vendor_address": e.get("vendor_address") or e.get("sections", {}).get("supplier_details", {}).get("vendor_address"),
    "bill_from": e.get("sections", {}).get("supplier_details", {}).get("bill_from"),
    "gstin": r.gstin,
    "items": e.get("sections", {}).get("items", []) or e.get("line_items", []) or e.get("items", [])
}]

print(f"--- 1. PAYLOAD TO API ---")
print(f"vendor_address sent: {payload[0].get('vendor_address')}")

# 4. Make API Call
request = factory.post('/api/zoho-reconstruct/', {"invoices": payload}, format='json')
force_authenticate(request, user=user)
view = ZohoReconstructView.as_view()
response = view(request)

print(f"\n--- 2. API RESPONSE ---")
res_data = response.data.get('invoices', [])[0] if response.data.get('invoices') else {}
print(f"Bill Address From received: {res_data.get('Bill Address From')}")

# 5. Simulate Frontend Mapping
print(f"\n--- 3. FRONTEND MAPPING SIMULATION ---")
original = {"extracted_data": ext_data}
reconstructed = res_data

# Spread
final = {
    **original,
    "extracted_data": {
        **original["extracted_data"],
        "sections": {
            **original["extracted_data"].get("sections", {}),
            "items": reconstructed.get("items", [])
        },
        **reconstructed
    }
}

resData = final["extracted_data"]
flattenedHeader = {
    **resData.get("sections", {}).get("supplier_details", {}),
    **resData.get("sections", {}).get("supply_details", {}),
    **resData
}

print(f"flattenedHeader['Bill Address From']: {flattenedHeader.get('Bill Address From')}")

def getCellValue(data, col):
    if data.get(col) not in [None, ""]:
        return str(data[col])
    return ""

normalizedHeader = {}
normalizedHeader["Bill Address From"] = getCellValue(flattenedHeader, "Bill Address From")

print(f"normalizedHeader['Bill Address From']: {normalizedHeader['Bill Address From']}")
