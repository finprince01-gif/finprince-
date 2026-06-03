import os
import sys
import django

# Add project root directory to path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import SessionFinalizationState, InvoicePageResult, InvoiceTempOCR

record_id = "1004965"
barrier = SessionFinalizationState.objects.filter(id=record_id).first()
if barrier:
    print(f"SessionFinalizationState ({record_id}):")
    print(f"  expected_pages: {barrier.expected_pages}")
    print(f"  completed_pages: {barrier.completed_pages}")
    print(f"  failed_pages: {barrier.failed_pages}")
    print(f"  ai_completed_pages: {barrier.ai_completed_pages}")
    print(f"  status: {barrier.status}")
    print(f"  snapshot_created: {barrier.snapshot_created}")
    
    pages = InvoicePageResult.objects.filter(record_id=record_id)
    if pages.exists():
        session_id = pages.first().session_id
        print(f"  session_id: {session_id}")
        
        temp_records = InvoiceTempOCR.objects.filter(upload_session_id=session_id)
        print(f"\nTotal InvoiceTempOCR records found for session {session_id}: {temp_records.count()}")
        for rec in temp_records:
            ext_data = rec.extracted_data or {}
            print(f"  ID: {rec.id} | supplier_invoice_no: {rec.supplier_invoice_no} | vendor: {ext_data.get('vendor_name')} | status: {rec.status} | val_status: {rec.validation_status} | vendor_status: {rec.vendor_status} | items_count: {len(ext_data.get('items', [])) if ext_data.get('items') else 0}")
    else:
        print("No pages found for this record.")
else:
    print("Barrier not found.")
