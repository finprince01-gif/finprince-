import os, sys, django, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoicePageResult, InvoiceTempOCR, SessionFinalizationState, FinalizedSnapshot

rid = 1006819
print("=== InvoiceTempOCR ===")
r = InvoiceTempOCR.objects.filter(id=rid).first()
if r:
    for f in r._meta.fields:
        print(f"{f.name}: {getattr(r, f.name)}")
else:
    print("Record not found")

print("\n=== SessionFinalizationState ===")
s = SessionFinalizationState.objects.filter(id=str(rid)).first()
if s:
    for f in s._meta.fields:
        print(f"{f.name}: {getattr(s, f.name)}")
else:
    print("SessionFinalizationState not found")

print("\n=== InvoicePageResult ===")
pages = InvoicePageResult.objects.filter(record_id=rid)
print(f"Total pages in DB: {pages.count()}")
for p in pages:
    print(f"Page {p.page_number}: is_failed={p.is_failed}, session_id={p.session_id}")
    payload = p.canonical_payload or {}
    print(f"  status: {payload.get('status')}")
    print(f"  invoice_no: {payload.get('invoice_no')}")
    print(f"  vendor_name: {payload.get('vendor_name')}")
    print(f"  gstin: {payload.get('gstin')}")
    print(f"  has _integrity_blocked: {'_integrity_blocked' in payload}")
    if '_integrity_blocked' in payload:
        print(f"  integrity block reason: {payload.get('_integrity_blocked')}")

if r:
    print("\n=== FinalizedSnapshot ===")
    snaps = FinalizedSnapshot.objects.filter(session_id=r.upload_session_id)
    print(f"Total snapshots in DB: {snaps.count()}")
    for snap in snaps:
        print(f"  ID: {snap.id}, S3 Key: {snap.s3_key}, Invoice Count: {snap.invoice_count}, Finalized At: {snap.finalized_at}")
