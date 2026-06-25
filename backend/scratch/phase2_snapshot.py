import os, sys, django, json, time
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
from dotenv import load_dotenv
load_dotenv()
django.setup()

print("=" * 60)
print("PHASE 2 FORENSIC SNAPSHOT")
print("=" * 60)

# ── REDIS ──
print("\n--- REDIS ---")
import redis as rlib
r = rlib.Redis(host='localhost', port=6379, db=0, decode_responses=True)
all_keys = r.keys('*')
assembly_keys = sorted([k for k in all_keys if k.startswith('assembly:')])
ai_conc_keys  = sorted([k for k in all_keys if k.startswith('ai_concurrency:')])
tenant_keys   = sorted([k for k in all_keys if k.startswith('tenant_inflight:')])
session_keys  = sorted([k for k in all_keys if k.startswith('session:')])
worker_keys   = sorted([k for k in all_keys if 'worker' in k.lower()])
print(f"total_keys={len(all_keys)}")
print(f"assembly keys ({len(assembly_keys)}):")
for k in assembly_keys[:40]:
    print(f"  {k}")
if len(assembly_keys) > 40:
    print(f"  ... +{len(assembly_keys)-40} more")
print(f"ai_concurrency keys ({len(ai_conc_keys)}):")
for k in ai_conc_keys:
    print(f"  {k} count={r.zcard(k)}")
print(f"tenant_inflight keys ({len(tenant_keys)}):")
for k in tenant_keys:
    print(f"  {k} count={r.zcard(k)}")
print(f"session keys ({len(session_keys)}):")
for k in session_keys:
    d = r.hgetall(k)
    st = d.get('status', '?')
    print(f"  {k} status={st}")
print(f"worker keys ({len(worker_keys)}): {worker_keys}")

# ── SQS ──
print("\n--- SQS ---")
import boto3
from botocore.config import Config
sqs = boto3.client('sqs',
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
    region_name=os.getenv('AWS_REGION', 'ap-south-1'),
    config=Config(max_pool_connections=10)
)
queues = {
    'ingestion':     'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-ingestion-queue-local',
    'ai':            'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-ai-queue-local',
    'assembly':      'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-assembly-queue-local',
    'finalize':      'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-finalize-queue-local',
    'materialization':'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-materialize-queue-local',
    'export':        'https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-export-queue-local',
}
sqs_snap = {}
for name, url in queues.items():
    try:
        resp = sqs.get_queue_attributes(QueueUrl=url, AttributeNames=[
            'ApproximateNumberOfMessages',
            'ApproximateNumberOfMessagesNotVisible',
            'ApproximateNumberOfMessagesDelayed'
        ])
        a = resp['Attributes']
        v = int(a.get('ApproximateNumberOfMessages', 0))
        inv = int(a.get('ApproximateNumberOfMessagesNotVisible', 0))
        d = int(a.get('ApproximateNumberOfMessagesDelayed', 0))
        sqs_snap[name] = {'visible': v, 'invisible': inv, 'delayed': d}
        print(f"  {name:<18}: visible={v:>4}  invisible={inv:>4}  delayed={d:>4}")
    except Exception as e:
        print(f"  {name}: ERROR {e}")
        sqs_snap[name] = {'error': str(e)}

# ── DATABASE ──
print("\n--- DATABASE ---")
from ocr_pipeline.models import InvoiceTempOCR, SessionFinalizationState, InvoicePageResult
from django.utils import timezone

extracting = list(InvoiceTempOCR.objects.filter(status='EXTRACTING').values(
    'id', 'upload_session_id', 'tenant_id', 'created_at', 'status'
))
print(f"InvoiceTempOCR EXTRACTING: {len(extracting)}")
for rec in extracting:
    age = (timezone.now() - rec['created_at']).total_seconds() if rec['created_at'] else -1
    print(f"  record={rec['id']} session={rec['upload_session_id']} age_s={age:.0f}")

not_fin = list(SessionFinalizationState.objects.exclude(
    status__in=['FINALIZED', 'COMPLETED']
).values('id', 'expected_pages', 'completed_pages', 'failed_pages', 'ai_complete', 'snapshot_created', 'status'))
print(f"SessionFinalizationState not-finalized: {len(not_fin)}")
for s in not_fin:
    print(f"  record={s['id']} expected={s['expected_pages']} completed={s['completed_pages']} failed={s['failed_pages']} status={s['status']}")

pr_count = InvoicePageResult.objects.count()
print(f"InvoicePageResult total rows: {pr_count}")

try:
    from vouchers.models import PoisonDocument
    pd_count = PoisonDocument.objects.count()
    print(f"PoisonDocument count: {pd_count}")
except Exception:
    print("PoisonDocument: N/A")

# Save
snap = {
    'redis': {'total_keys': len(all_keys), 'assembly_keys_count': len(assembly_keys), 'ai_conc_keys': len(ai_conc_keys), 'tenant_keys': len(tenant_keys), 'session_keys': len(session_keys)},
    'sqs': sqs_snap,
    'db': {'extracting': len(extracting), 'not_finalized': len(not_fin), 'page_results': pr_count}
}
with open('scratch/phase2_snapshot.json', 'w') as f:
    json.dump(snap, f, indent=2, default=str)
print("\nSnapshot saved: scratch/phase2_snapshot.json")
