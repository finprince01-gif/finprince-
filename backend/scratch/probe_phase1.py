"""Phase 1-4 forensic probe: SQS config + DB state audit."""
import boto3, json, os, sys

# ── Phase 1: SQS queue attributes ──────────────────────────────────────────
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

sqs = boto3.client(
    'sqs', region_name=os.getenv('AWS_DEFAULT_REGION', 'ap-south-1'),
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
)

ai_url  = os.getenv('SQS_AI_QUEUE_URL',  'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-ai-queue-local')
dlq_url = os.getenv('SQS_DLQ_QUEUE_URL', 'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-dlq')

print("=" * 60)
print("PHASE 1: AI QUEUE — ALL ATTRIBUTES")
print("=" * 60)
resp = sqs.get_queue_attributes(QueueUrl=ai_url, AttributeNames=['All'])
ai_attrs = resp['Attributes']
print(json.dumps(ai_attrs, indent=2))

print()
print("=" * 60)
print("PHASE 1: DLQ — ALL ATTRIBUTES")
print("=" * 60)
resp2 = sqs.get_queue_attributes(QueueUrl=dlq_url, AttributeNames=['All'])
dlq_attrs = resp2['Attributes']
print(json.dumps(dlq_attrs, indent=2))

print()
print("=" * 60)
print("PHASE 3: DLQ — PEEK MESSAGES (not deleting)")
print("=" * 60)
try:
    msgs = sqs.receive_message(
        QueueUrl=dlq_url,
        MaxNumberOfMessages=10,
        WaitTimeSeconds=1,
        AttributeNames=['All'],
        MessageAttributeNames=['All'],
        VisibilityTimeout=10,
    )
    messages = msgs.get('Messages', [])
    if not messages:
        print("  DLQ is EMPTY — no messages present")
    for m in messages:
        mid = m.get('MessageId', '?')
        rc  = m.get('Attributes', {}).get('ApproximateReceiveCount', '?')
        body_preview = m.get('Body', '')[:300]
        print(f"  MessageId: {mid}")
        print(f"  ReceiveCount: {rc}")
        print(f"  Body: {body_preview}")
        print()
except Exception as e:
    print(f"  DLQ peek error: {e}")

# ── Phase 4: DB state ───────────────────────────────────────────────────────
print()
print("=" * 60)
print("PHASE 4: DB STATE — InvoicePageResult and Barrier")
print("=" * 60)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from ocr_pipeline.models import InvoicePageResult, SessionFinalizationState

record_id = '1007715'
print(f"\n--- InvoicePageResult for record_id={record_id} ---")
pages = InvoicePageResult.objects.filter(record_id=record_id).order_by('page_number').values(
    'page_number', 'is_failed', 'counted_in_barrier', 'session_id', 'created_at'
)
for p in pages:
    pnum   = p['page_number']
    failed = p['is_failed']
    counted = p['counted_in_barrier']
    ts     = p['created_at']
    print(f"  Page {pnum:2d}: is_failed={failed}  counted_in_barrier={counted}  created={ts}")

total = pages.count()
print(f"Total InvoicePageResult rows: {total}")

print(f"\n--- SessionFinalizationState for record_id={record_id} ---")
try:
    barrier = SessionFinalizationState.objects.get(id=str(record_id))
    print(f"  expected_pages:       {barrier.expected_pages}")
    print(f"  completed_pages:      {barrier.completed_pages}")
    print(f"  failed_pages:         {barrier.failed_pages}")
    print(f"  ai_complete:          {barrier.ai_complete}")
    total_counted = (barrier.completed_pages or 0) + (barrier.failed_pages or 0)
    missing = (barrier.expected_pages or 0) - total_counted
    print(f"  barrier_total:        {total_counted}")
    print(f"  MISSING pages:        {missing}")
except SessionFinalizationState.DoesNotExist:
    print("  NOT FOUND in DB")
