import gzip, json
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from ocr_pipeline.models import InvoiceTempOCR, FinalizedSnapshot
from pending_purchases.models import PendingPurchase

r = InvoiceTempOCR.objects.last()
User = get_user_model()
user = User.objects.filter(tenant_id=r.tenant_id).first() or User.objects.first()
client = APIClient()
client.force_authenticate(user=user)

TEST_VENDOR = 'BRANCH TEST VENDOR'
TEST_BRANCH = 'TEST-BRANCH-CBE'
TEST_GSTIN = '33ABYFS6343M1ZC'
TEST_INV = r.supplier_invoice_no or '4742/25-26'

payload = {
    'extracted_data': {
        'vendor_name': TEST_VENDOR,
        'invoice_no': TEST_INV,
        'branch': TEST_BRANCH,
        'gstin': TEST_GSTIN,
        'sections': {
            'supplier_details': {
                'vendor_name': TEST_VENDOR,
                'supplier_invoice_no': TEST_INV,
                'branch': TEST_BRANCH,
                'gstin': TEST_GSTIN,
            }
        }
    }
}

print("PATCH ->", client.patch('/api/ocr-staging/' + r.file_hash + '/', data=payload, format='json').status_code)

r.refresh_from_db()
ed = r.extracted_data or {}
print("\n--- InvoiceTempOCR after PATCH ---")
print("  vendor_name  :", ed.get('vendor_name'))
print("  branch       :", ed.get('branch'))
print("  gstin        :", ed.get('gstin'))
print("  sections.supplier_details.branch:", ed.get('sections', {}).get('supplier_details', {}).get('branch'))

pp = PendingPurchase.objects.filter(source_scan_row_id=r.id).first()
if pp:
    ext = pp.extraction_payload or {}
    rev = pp.review_payload or {}
    print("\n--- PendingPurchase after PATCH ---")
    print("  vendor_name      :", pp.vendor_name)
    print("  vendor_gstin     :", pp.vendor_gstin)
    print("  invoice_number   :", pp.invoice_number)
    print("  extraction_payload.branch:", ext.get('branch'))
    print("  extraction_payload.sections.supplier_details.branch:", ext.get('sections', {}).get('supplier_details', {}).get('branch'))
    print("  review_payload.branch:", rev.get('branch'))
else:
    print("NO PendingPurchase found for this record")
