import os
import django
import sys
from pathlib import Path

# Initialize Django
current_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(current_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, FinalizedSnapshot, InvoicePageResult

tenant_id = 'parity-test-tenant'

if '--delete' in sys.argv:
    print(f"Deleting all records for tenant: {tenant_id}")
    InvoiceTempOCR.objects.filter(tenant_id=tenant_id).delete()
    InvoicePageResult.objects.filter(session_id__contains='parity').delete()
    print("Done.")
    sys.exit(0)

records = InvoiceTempOCR.objects.filter(tenant_id=tenant_id).order_by('-id')

print(f"Audit for tenant: {tenant_id}")
print("-" * 50)
for r in records:
    print(f"ID: {r.id} | File: {r.file_path} | Status: {r.status}")
    snapshots = FinalizedSnapshot.objects.filter(snapshot_json__metadata__original_record_id=r.id)
    print(f"  Snapshots: {snapshots.count()}")
    pages = InvoicePageResult.objects.filter(record_id=r.id)
    print(f"  Pages in DB: {pages.count()}")
    if r.extracted_data:
        print(f"  Extracted Keys: {list(r.extracted_data.keys())[:5]}...")
    print("-" * 20)
