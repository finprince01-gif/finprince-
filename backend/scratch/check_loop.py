import os, sys, time, django
import sys
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, InvoicePageResult, SessionFinalizationState
import redis as rlib
import boto3

r = rlib.Redis(host='localhost', port=6379, db=0, decode_responses=True)
sqs = boto3.client('sqs', region_name='ap-south-1')

def get_sqs_depth(queue_name):
    url = f"https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-{queue_name}-queue-local"
    try:
        a = sqs.get_queue_attributes(QueueUrl=url, AttributeNames=['ApproximateNumberOfMessages','ApproximateNumberOfMessagesNotVisible'])['Attributes']
        return int(a.get('ApproximateNumberOfMessages',0)), int(a.get('ApproximateNumberOfMessagesNotVisible',0))
    except:
        return -1, -1

RECORD_ID = 1007715

print("=== STARTING STRESS TEST LIVE CHECK LOOP ===")
start_time = time.time()
while True:
    try:
        rec = InvoiceTempOCR.objects.get(id=RECORD_ID)
        pages = list(InvoicePageResult.objects.filter(record_id=RECORD_ID).order_by('page_number'))
        page_nums = [p.page_number for p in pages]
        failed_pages = [p.page_number for p in pages if p.is_failed]
        
        sfs = SessionFinalizationState.objects.filter(id=str(RECORD_ID)).first()
        sfs_status = sfs.status if sfs else "NONE"
        sfs_expected = sfs.expected_pages if sfs else "?"
        sfs_completed = sfs.completed_pages if sfs else "?"
        sfs_failed = sfs.failed_pages if sfs else "?"
        
        ai_conc = r.zcard('ai_concurrency:global')
        active_slots = r.zcard(f"assembly:{RECORD_ID}:active_slots") or 0
        
        ai_vis, ai_inv = get_sqs_depth('ai')
        asm_vis, asm_inv = get_sqs_depth('assembly')
        fin_vis, fin_inv = get_sqs_depth('finalize')
        
        print(f"[{time.time()-start_time:.1f}s] Status={rec.status} | Completed Pages ({len(pages)}/15): {page_nums} (Failed: {failed_pages})")
        print(f"  Barrier: status={sfs_status} expected={sfs_expected} completed={sfs_completed} failed={sfs_failed}")
        print(f"  Redis: global_ai_concurrency={ai_conc} | active_slots={active_slots}")
        print(f"  SQS: AI (vis={ai_vis}/inv={ai_inv}) | Assembly (vis={asm_vis}/inv={asm_inv}) | Finalize (vis={fin_vis}/inv={fin_inv})")
        
        if rec.status in ('FINALIZED', 'COMPLETED', 'FAILED', 'ERROR'):
            print("Terminal status reached in DB!")
            break
            
    except Exception as e:
        print(f"Error checking: {e}")
        
    time.sleep(10)
