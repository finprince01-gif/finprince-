import os
import sys
import json
import gzip
import copy
from pathlib import Path

# Initialize Django
current_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(current_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, InvoicePageResult, FinalizedSnapshot, SessionFinalizationState
from ocr_pipeline.pipeline import assemble_multi_page_record
from core.storage import StorageService

def reassemble_all():
    sample_files = ["sample_1.pdf", "sample_2.pdf", "IMG_20260406_0006.pdf"]
    
    for s in sample_files:
        print(f"\n==================================================")
        print(f"REASSEMBLING RECORD FOR: {s}")
        print(f"==================================================")
        
        # Find records matching file name
        records = InvoiceTempOCR.objects.filter(file_path__icontains=s).order_by("-id")
        target_record = None
        for r in records:
            page_count = InvoicePageResult.objects.filter(record_id=r.id).count()
            if page_count > 0:
                target_record = r
                break
                
        if not target_record:
            print(f"No records with page results found for {s}")
            continue
            
        page_count = InvoicePageResult.objects.filter(record_id=target_record.id).count()
        print(f"Found record ID: {target_record.id} path: {target_record.file_path} with {page_count} pages.")
        
        # Reset SessionFinalizationState so assembly is NOT bypassed as idempotent
        barrier_id = str(target_record.id)
        session_lock, created = SessionFinalizationState.objects.get_or_create(
            id=barrier_id,
            defaults={
                "expected_pages": page_count,
                "completed_pages": page_count,
                "status": "PROCESSING",
                "snapshot_created": False
            }
        )
        if not created:
            session_lock.snapshot_created = False
            session_lock.expected_pages = page_count
            session_lock.completed_pages = page_count
            session_lock.save()
            print(f"Reset snapshot_created = False for SessionFinalizationState ID: {barrier_id}")
            
        # Reset record status to PROCESSING to allow execution
        target_record.status = 'PROCESSING'
        target_record.save()
        
        # We can also trace by importing and calling the merge logic directly to see what it does
        from ocr_pipeline.forensic_merger import get_forensic_merger
        pages = list(InvoicePageResult.objects.filter(record_id=target_record.id).order_by("page_number"))
        pages_dicts = [copy.deepcopy(p.canonical_payload) for p in pages]
        # Hydrate _page_no
        for idx, p_dict in enumerate(pages_dicts):
            p_dict["_page_no"] = pages[idx].page_number
            p_dict["_physical_page_no"] = pages[idx].page_number
            p_dict["_copy_type"] = "original" if idx == 0 else "continuation"
            
        merger = get_forensic_merger()
        print(f"\n--- DIRECT TRACE FOR {s} ---")
        for idx, p_dict in enumerate(pages_dicts):
            print(f"  Page {p_dict.get('_page_no')} raw total_taxable_value: {p_dict.get('total_taxable_value')}")
        merged = merger.merge_group(pages_dicts)
        print(f"Direct merged total_taxable_value: {merged.get('total_taxable_value')}")
        print(f"Direct merged items count: {len(merged.get('items', []))}")
        print(f"Direct merged items sum: {sum(float(i.get('taxable_value') or 0) for i in merged.get('items', []))}")
        print(f"Direct merged source pages: {merged.get('_source_pages')}")
        
        # Run assembly
        res = assemble_multi_page_record(target_record)
        print(f"Assembly Result status: {res.get('status')}")
        
        # Get the new snapshot
        snapshot = FinalizedSnapshot.objects.filter(session_id=target_record.upload_session_id).order_by("-id").first()
        if snapshot:
            print(f"OK: FinalizedSnapshot ID: {snapshot.id} Session: {snapshot.session_id}")
            compressed_bytes = StorageService().get_file(snapshot.s3_key)
            decompressed = gzip.decompress(compressed_bytes)
            payload = json.loads(decompressed)
            
            invoices = payload.get("data", [])
            print(f"Total Invoices in Snapshot: {len(invoices)}")
            for inv in invoices:
                print(f"Invoice Number: {inv.get('invoice_no')}")
                print(f"  Header Taxable Value: {inv.get('total_taxable_value')}")
                items = inv.get("items", [])
                items_taxable_sum = sum(float(item.get("taxable_value") or 0.0) for item in items)
                print(f"  Items Sum Taxable: {items_taxable_sum}")
                print(f"  Difference: {float(inv.get('total_taxable_value') or 0.0) - items_taxable_sum}")
                print(f"  Item Count: {len(items)}")
        else:
            print("FAIL: No snapshot found.")

if __name__ == "__main__":
    reassemble_all()
