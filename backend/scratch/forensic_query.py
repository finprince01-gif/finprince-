import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
from dotenv import load_dotenv
load_dotenv()
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, SessionFinalizationState
from django.utils import timezone

print('=== EXTRACTING RECORDS (InvoiceTempOCR) ===')
extracting = InvoiceTempOCR.objects.filter(status='EXTRACTING').values(
    'id', 'upload_session_id', 'file_hash', 'tenant_id', 'created_at', 'status', 'supplier_invoice_no'
)
for r in extracting:
    age_s = (timezone.now() - r['created_at']).total_seconds() if r['created_at'] else -1
    print(f"  record_id={r['id']} session={r['upload_session_id']} tenant={r['tenant_id']} age_s={age_s:.0f} invoice={r['supplier_invoice_no']}")
print(f"  TOTAL EXTRACTING: {extracting.count()}")

print()
print('=== ALL NON-TERMINAL RECORDS ===')
non_term = InvoiceTempOCR.objects.exclude(status__in=['FINALIZED','VOUCHER_CREATED','COMPLETED','FAILED','ERROR']).values(
    'id', 'status', 'upload_session_id', 'created_at', 'supplier_invoice_no', 'tenant_id'
).order_by('-created_at')[:20]
for r in non_term:
    age_s = (timezone.now() - r['created_at']).total_seconds() if r['created_at'] else -1
    print(f"  record_id={r['id']} status={r['status']} session={r['upload_session_id']} age_s={age_s:.0f}")
non_term_count = InvoiceTempOCR.objects.exclude(status__in=['FINALIZED','VOUCHER_CREATED','COMPLETED','FAILED','ERROR']).count()
print(f"  NON-TERMINAL COUNT: {non_term_count}")

print()
print('=== SESSION FINALIZATION STATES ===')
states = SessionFinalizationState.objects.all().values(
    'id', 'expected_pages', 'completed_pages', 'failed_pages', 'ai_complete', 'snapshot_created', 'status', 'updated_at'
).order_by('-updated_at')[:10]
for s in states:
    print(f"  record={s['id']} expected={s['expected_pages']} completed={s['completed_pages']} failed={s['failed_pages']} ai_complete={s['ai_complete']} snapshot={s['snapshot_created']} status={s['status']}")

print()
print('=== REDIS STATE ===')
try:
    import redis
    r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

    all_keys = r.keys('*')
    print(f"Total Redis keys: {len(all_keys)}")

    # Global AI concurrency
    global_key = 'ai_concurrency:global'
    members = r.zrange(global_key, 0, -1, withscores=True)
    print(f"ai_concurrency:global count={len(members)}")
    import time
    now_ts = time.time()
    for m, score in members[:10]:
        remaining = score - now_ts
        print(f"  permit={m} expires_in={remaining:.0f}s (expired={'YES' if remaining < 0 else 'NO'})")

    # Assembly keys
    assembly_keys = sorted([k for k in all_keys if k.startswith('assembly:')])
    print(f"Assembly keys: {len(assembly_keys)}")
    for ak in assembly_keys[:20]:
        print(f"  {ak}")

    # Worker heartbeats
    hb_keys = [k for k in all_keys if 'worker_hb' in k or 'heartbeat' in k.lower()]
    print(f"Worker heartbeat keys ({len(hb_keys)}): {hb_keys}")

    # Session keys
    session_keys = [k for k in all_keys if k.startswith('session:')]
    print(f"Session keys ({len(session_keys)}): {session_keys[:10]}")

    # AI rate limit
    rate_limit_key = 'ai_rate_limit:global'
    rl = r.zcard(rate_limit_key)
    print(f"ai_rate_limit:global count={rl}")

    # tenant inflight keys
    tenant_keys = [k for k in all_keys if 'tenant_inflight' in k or 'ai_concurrency:tenant' in k]
    print(f"Tenant inflight keys: {tenant_keys}")

except Exception as e:
    print(f"Redis error: {e}")
    import traceback
    traceback.print_exc()
