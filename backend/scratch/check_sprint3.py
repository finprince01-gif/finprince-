import os
import sys
import django

# Add backend to path for Django
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, InvoicePageResult, PoisonDocument, SessionFinalizationState

def main():
    print("=== DATABASE SNAPSHOT ===")
    
    # 1. Check Temp OCR Records
    temp_recs = InvoiceTempOCR.objects.filter(id=1007716)
    print(f"Showing Record 1007716:")
    for temp in temp_recs:
        print(f"  ID: {temp.id} | Status: {temp.status} | Processed: {temp.processed} | Session: {temp.upload_session_id}")
        
        # Check SessionFinalizationState
        sfs = SessionFinalizationState.objects.filter(id=str(temp.id)).first()
        if sfs:
            print(f"    [SFS] expected={sfs.expected_pages} completed={sfs.completed_pages} failed={sfs.failed_pages} ingestion_complete={sfs.ingestion_complete} ai_complete={sfs.ai_complete}")
        else:
            print(f"    [SFS] No SessionFinalizationState found for {temp.id}")
            
        # Check Page Results
        results = InvoicePageResult.objects.filter(record_id=str(temp.id)).order_by('page_number')
        print(f"    [Page Results] Found {results.count()} pages:")
        for pr in results:
            print(f"      Page {pr.page_number} | Failed: {pr.is_failed} | Created: {pr.created_at}")
            
        # Check Poison
        poisons = PoisonDocument.objects.filter(record_id=str(temp.id))
        if poisons.exists():
            print(f"    [Poison] Found {poisons.count()} poisons:")
            for p in poisons:
                print(f"      Poison ID: {p.id} | Queue: {p.queue_name} | Retry: {p.retry_count} | Error: {p.error_trace[:80]}")
        else:
            print(f"    [Poison] No poison documents.")

if __name__ == '__main__':
    main()
