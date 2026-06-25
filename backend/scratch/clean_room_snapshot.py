import os
import sys
import django

# Add backend to path for Django
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.sqs import queue_service
from core.redis_orchestrator import orchestrator
from ocr_pipeline.models import SessionFinalizationState, InvoicePageResult
import redis

def check_ocr_task_model():
    # Dynamic check if OCRTask exists in DB
    try:
        from vouchers.models import OCRTask
        return OCRTask
    except ImportError:
        try:
            from ocr_pipeline.models import OCRTask
            return OCRTask
        except ImportError:
            return None

def main():
    print("==================================================")
    print("STEP 5 — QUEUE SNAPSHOT")
    print("==================================================")
    queues = ['ingestion', 'ai', 'assembly', 'finalize', 'export', 'materialization']
    for q in queues:
        try:
            visible, invisible = queue_service.get_queue_stats(q)
            print(f"Queue '{q}': visible={visible} | invisible={invisible}")
        except Exception as e:
            print(f"Queue '{q}': Error fetching stats: {e}")

    print("\n==================================================")
    print("STEP 6 — REDIS SNAPSHOT")
    print("==================================================")
    r = redis.Redis(host=os.getenv('REDIS_HOST', 'localhost'), port=int(os.getenv('REDIS_PORT', '6379')), db=int(os.getenv('REDIS_DB', '0')), decode_responses=True)
    
    # Active permits
    permits = r.zrange("ai_concurrency:global", 0, -1, withscores=True)
    print(f"Active global concurrency permits: {len(permits)}")
    for p, score in permits:
        print(f"  Permit ID: {p} | Expiration: {score}")
        
    # Active locks
    locks = list(r.scan_iter("worker_lock_*"))
    print(f"Active worker locks: {len(locks)}")
    for lock in locks:
        val = r.get(lock)
        print(f"  Lock: {lock} | PID: {val}")
        
    # Active page states
    page_states_keys = list(r.scan_iter("assembly:*:page_states"))
    print(f"Active page states keys in Redis: {len(page_states_keys)}")
    for pk in page_states_keys[:5]: # Show first 5
        states = r.hgetall(pk)
        print(f"  Key: {pk} | States: {states}")
    if len(page_states_keys) > 5:
        print(f"  ... and {len(page_states_keys) - 5} more keys.")
        
    # Active sessions
    active_slots_keys = list(r.scan_iter("assembly:*:active_slots"))
    print(f"Active session slots keys in Redis: {len(active_slots_keys)}")
    for ask in active_slots_keys[:5]:
        slots = r.zrange(ask, 0, -1, withscores=True)
        print(f"  Key: {ask} | Slots: {slots}")
    if len(active_slots_keys) > 5:
        print(f"  ... and {len(active_slots_keys) - 5} more keys.")

    print("\n==================================================")
    print("STEP 7 — DATABASE SNAPSHOT")
    print("==================================================")
    record_id = "1007716" # The current test record
    print(f"Querying database records for current test record: {record_id}")
    
    sfs = SessionFinalizationState.objects.filter(id=record_id).first()
    if sfs:
        print(f"SessionFinalizationState (ID={record_id}):")
        print(f"  expected_pages: {sfs.expected_pages}")
        print(f"  completed_pages: {sfs.completed_pages}")
        print(f"  failed_pages: {sfs.failed_pages}")
        print(f"  ingestion_complete: {sfs.ingestion_complete}")
        print(f"  ai_complete: {sfs.ai_complete}")
        print(f"  assembly_complete: {sfs.assembly_complete}")
    else:
        print(f"No SessionFinalizationState found for ID={record_id}")
        
    pages = InvoicePageResult.objects.filter(record_id=record_id).order_by('page_number')
    print(f"InvoicePageResult: Found {pages.count()} pages for record_id={record_id}:")
    for p in pages:
        print(f"  Page {p.page_number} | Failed: {p.is_failed} | Created: {p.created_at}")

    ocr_task_model = check_ocr_task_model()
    if ocr_task_model:
        job_id = "19bdb718-58cd-43d9-b033-ce6fd5c4a800"
        tasks = ocr_task_model.objects.filter(job_id=job_id)
        print(f"OCRTask: Found {tasks.count()} tasks for job_id={job_id}:")
        for t in tasks:
            print(f"  Task ID: {t.id} | File: {t.file_name} | Status: {t.status}")
    else:
        print("OCRTask model not found or check failed.")

if __name__ == '__main__':
    main()
