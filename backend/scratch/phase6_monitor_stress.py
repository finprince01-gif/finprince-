import os, sys, time, json
from datetime import datetime, timezone

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, SessionFinalizationState, InvoicePageResult

# Find the latest InvoiceTempOCR record
latest_record = InvoiceTempOCR.objects.order_by('-id').first()
if not latest_record:
    print("No records found in database!")
    sys.exit(1)

RECORD_ID = latest_record.id
SESSION_ID = latest_record.upload_session_id
print(f"Monitoring latest record: ID={RECORD_ID}, Session={SESSION_ID}, Initial Status={latest_record.status}")

import redis as rlib
import boto3
from botocore.config import Config

r = rlib.Redis(host='localhost', port=6379, db=0, decode_responses=True)
sqs = boto3.client('sqs',
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
    region_name='ap-south-1'
)

def get_sqs_depth(queue_name):
    url = f"https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-{queue_name}-queue-local"
    try:
        a = sqs.get_queue_attributes(QueueUrl=url, AttributeNames=[
            'ApproximateNumberOfMessages','ApproximateNumberOfMessagesNotVisible','ApproximateNumberOfMessagesDelayed'
        ])['Attributes']
        return int(a.get('ApproximateNumberOfMessages',0)), int(a.get('ApproximateNumberOfMessagesNotVisible',0))
    except:
        return -1, -1

t_start = time.time()
while time.time() - t_start < 600:
    elapsed = time.time() - t_start
    
    # Reload record
    rec = InvoiceTempOCR.objects.get(id=RECORD_ID)
    print(f"\n[T+{elapsed:.1f}s] Record ID: {RECORD_ID} | Status: {rec.status} | Session ID: {SESSION_ID}")
    
    # Check page results
    pages = InvoicePageResult.objects.filter(record_id=RECORD_ID).order_by('page_number')
    print(f"  Pages Completed in DB: {pages.count()} / 15")
    for p in pages:
         print(f"    Page {p.page_number} (is_failed={p.is_failed}) created_at: {p.created_at}")
         
    # Check SFS
    sfs = SessionFinalizationState.objects.filter(id=str(RECORD_ID)).first()
    if sfs:
         print(f"  Finalization State: expected={sfs.expected_pages} completed={sfs.completed_pages} failed={sfs.failed_pages} ai_complete={sfs.ai_complete} status={sfs.status}")
    else:
         print("  Finalization State: NOT CREATED YET")
         
    # SQS Depths
    sqs_d = {}
    for q in ['ingestion', 'ai', 'assembly', 'finalize', 'materialize', 'export']:
        v, inv = get_sqs_depth(q)
        sqs_d[q] = f"vis:{v}/inv:{inv}"
    print(f"  SQS: Ingestion={sqs_d['ingestion']} | AI={sqs_d['ai']} | Assembly={sqs_d['assembly']} | Finalize={sqs_d['finalize']} | Materialize={sqs_d['materialize']}")
    
    # Redis Concurrency
    ai_conc = r.zcard('ai_concurrency:global')
    active_slots = r.zcard(f"assembly:{RECORD_ID}:active_slots") or 0
    page_states = r.hgetall(f"assembly:{RECORD_ID}:page_states") or {}
    print(f"  Redis: global_ai_concurrency={ai_conc} | active_slots={active_slots} | page_states={len(page_states)}")
    
    if rec.status in ('FINALIZED', 'COMPLETED', 'FAILED', 'ERROR'):
         print("Terminal state reached!")
         break
         
    time.sleep(15)
