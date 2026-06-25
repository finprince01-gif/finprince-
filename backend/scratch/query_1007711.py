import os
import sys
import django

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, InvoicePageResult, PoisonDocument, SessionFinalizationState

rec_id = "1007711"
print(f"=== DATABASE TRACE FOR RECORD {rec_id} ===")
temp_rec = InvoiceTempOCR.objects.filter(id=rec_id).first()
if temp_rec:
    print(f"InvoiceTempOCR ID: {temp_rec.id}")
    print(f"  Status: {temp_rec.status}")
    print(f"  Processed: {temp_rec.processed}")
    print(f"  Voucher Type: {temp_rec.voucher_type}")
    print(f"  Upload Session ID: {temp_rec.upload_session_id}")
    print(f"  File Path: {temp_rec.file_path}")
    print(f"  Invoice Number: {temp_rec.supplier_invoice_no}")

sfs = SessionFinalizationState.objects.filter(id=rec_id).first()
if sfs:
    print("\nSessionFinalizationState:")
    print(f"  Expected Pages: {sfs.expected_pages}")
    print(f"  Completed Pages: {sfs.completed_pages}")
    print(f"  Failed Pages: {sfs.failed_pages}")
    print(f"  Ingestion Complete: {sfs.ingestion_complete}")
    print(f"  AI Complete: {sfs.ai_complete}")
    print(f"  Export Complete: {sfs.export_complete}")
    print(f"  Materialization Complete: {sfs.materialization_complete}")

page_results = InvoicePageResult.objects.filter(record_id=rec_id).order_by('page_number')
print(f"\nInvoicePageResult count: {page_results.count()}")
for pr in page_results:
    print(f"  Page {pr.page_number} | Failed: {pr.is_failed} | Session: {pr.session_id} | Created: {pr.created_at}")
    print(f"    Payload Keys: {list(pr.canonical_payload.keys()) if pr.canonical_payload else 'None'}")
    if pr.canonical_payload and 'error' in pr.canonical_payload:
        print(f"    Error: {pr.canonical_payload.get('error')}")

poisons = PoisonDocument.objects.filter(record_id=rec_id)
print(f"\nPoisonDocument count: {poisons.count()}")
for pd in poisons:
    print(f"  Poison ID: {pd.id} | Queue: {pd.queue_name} | Retry: {pd.retry_count} | Error: {pd.error_trace}")
