
import os
import sys
import json
import django

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.test import RequestFactory
from ocr_pipeline.views import StagingDataView, ZohoReconstructView
from ocr_pipeline.models import InvoiceTempOCR
from accounts.models import User

# Create a mock request
factory = RequestFactory()

# Mock user for authentication
user = User.objects.first()
if not user:
    print("No user found")
    sys.exit(1)

# 1. Test GET /api/staging/
request = factory.get('/api/staging/')
request.user = user

view = StagingDataView.as_view()
response = view(request)
response.render()

data = json.loads(response.content)
print("\n=== /api/staging/ RESPONSE ===")
if data.get('data'):
    first_record = data['data'][0]
    ext_data = first_record.get('extracted_data', {})
    print(f"Top-level vendor_address in API: {ext_data.get('vendor_address')}")
    print(f"Section vendor_address in API: {ext_data.get('sections', {}).get('supplier_details', {}).get('vendor_address')}")
else:
    print("No staging data found")

# 2. Test POST /api/zoho-reconstruct/
# Using the payload the frontend builds:
invoicesForAdapter = []
for r in data.get('data', [])[:1]: # test with 1
    ext = r.get('extracted_data', {})
    invoicesForAdapter.append({
        "invoice_number": r.get('invoice_number') or ext.get('supplier_invoice_no') or ext.get('invoice_no'),
        "invoice_date": ext.get('invoice_date'),
        "vendor_name": ext.get('vendor_name') or ext.get('sections', {}).get('supplier_details', {}).get('vendor_name'),
        "gstin": r.get('gstin'),
        "total_taxable_value": ext.get('total_taxable_value') or ext.get('sections', {}).get('supply_details', {}).get('total_taxable_value'),
        "total_invoice_value": ext.get('total_invoice_value') or ext.get('sections', {}).get('supply_details', {}).get('total_invoice_value'),
        "items": ext.get('sections', {}).get('items', []) or ext.get('line_items', []) or ext.get('items', [])
    })

post_req = factory.post('/api/zoho-reconstruct/', data={"invoices": invoicesForAdapter}, content_type='application/json')
post_req.user = user
view2 = ZohoReconstructView.as_view()
res2 = view2(post_req)
res2.render()

reconstruct_data = json.loads(res2.content)
print("\n=== /api/zoho-reconstruct/ RESPONSE ===")
if reconstruct_data.get('invoices'):
    first_recon = reconstruct_data['invoices'][0]
    print(f"Top-level vendor_address in Reconstruct API: {first_recon.get('vendor_address')}")
    print(f"Bill Address From in Reconstruct API: {first_recon.get('Bill Address From')}")
    print(f"Keys returned by Reconstruct API: {list(first_recon.keys())}")
else:
    print("No reconstruct data")
