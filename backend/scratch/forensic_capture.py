import os
import sys
import django

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, SessionFinalizationState, InvoicePageResult

# Let's target the latest session: 6134f53a-a037-46b3-9b6b-9f6608c0ee38
session_id = '6134f53a-a037-46b3-9b6b-9f6608c0ee38'

print(f"=== FORENSIC DATABASE DUMP FOR SESSION: {session_id} ===")

print("\n--- InvoiceTempOCR Records ---")
ocr_records = InvoiceTempOCR.objects.filter(upload_session_id=session_id).order_by('id')
for r in ocr_records:
    has_extracted = r.extracted_data is not None
    print(f"ID: {r.id}")
    print(f"  upload_session_id: {r.upload_session_id}")
    print(f"  status: {r.status}")
    print(f"  validation_status: {r.validation_status}")
    print(f"  extracted_data present?: {has_extracted}")
    if has_extracted:
        print(f"  extracted_data keys: {list(r.extracted_data.keys())}")
    print(f"  updated_at: {r.created_at}") # Wait, does InvoiceTempOCR have updated_at or only created_at?
    # Let's check other fields:
    print(f"  file_path: {r.file_path}")
    print(f"  file_hash: {r.file_hash}")
    print(f"  is_primary: {r.is_primary}")

print("\n--- SessionFinalizationState Records ---")
# Wait, SessionFinalizationState uses record.id as primary key (as string)
for r in ocr_records:
    state_rec = SessionFinalizationState.objects.filter(id=str(r.id)).first()
    if state_rec:
        print(f"For Record ID: {r.id}")
        print(f"  completed_pages: {state_rec.completed_pages}")
        print(f"  expected_pages/total_pages: {state_rec.expected_pages}")
        print(f"  status: {state_rec.status}")
        print(f"  ai_complete: {state_rec.ai_complete}")
        # Does SessionFinalizationState have terminal_consistency?
        # Let's check model fields:
        fields = [f.name for f in state_rec._meta.fields]
        print(f"  Fields: {fields}")
        if 'terminal_consistency' in fields:
            print(f"  terminal_consistency: {state_rec.terminal_consistency}")
        else:
            print("  terminal_consistency field not in model")

print("\n--- InvoicePageResult Records ---")
for r in ocr_records:
    page_results = InvoicePageResult.objects.filter(record_id=r.id).order_by('page_number')
    print(f"For Record ID: {r.id} ({page_results.count()} results):")
    for pr in page_results:
        # Check fields of InvoicePageResult:
        fields = [f.name for f in pr._meta.fields]
        counted = getattr(pr, 'counted_in_barrier', 'N/A') if 'counted_in_barrier' in fields else 'N/A'
        print(f"  page_number: {pr.page_number}")
        print(f"    counted_in_barrier: {counted}")
        print(f"    is_failed: {pr.is_failed}")
