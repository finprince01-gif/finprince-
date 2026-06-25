"""
PHASE 6 FORENSIC MONITOR — Live pipeline trace for session 2e284fad-c2ae-4be0-81c6-134203d0c313
Polls DB + Redis + SQS every 30s and records page-level evidence.
"""
import os, sys, time, json
from datetime import datetime, timezone

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
from dotenv import load_dotenv
load_dotenv()

import django
django.setup()

SESSION_ID = "2e284fad-c2ae-4be0-81c6-134203d0c313"
JOB_ID = "687e56d0-3b71-4552-92d3-5c191583612f"
T0_TS = 1750565536.320300  # from phase5_context
TENANT_ID = "2eda0ac6-6af2-493e-8792-bc973fe946b7"
MAX_WAIT_SECONDS = 600  # 10 minutes max
POLL_INTERVAL = 15

import redis as rlib
import boto3
from botocore.config import Config
from dotenv import load_dotenv
from ocr_pipeline.models import InvoiceTempOCR, SessionFinalizationState, InvoicePageResult
from django.utils import timezone as dtz

r = rlib.Redis(host='localhost', port=6379, db=0, decode_responses=True)
sqs = boto3.client('sqs',
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
    region_name='ap-south-1',
    config=Config(max_pool_connections=10)
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

trace_events = []

def snapshot(t_elapsed):
    now = datetime.now(timezone.utc).isoformat()
    ev = {'time': now, 'elapsed_s': round(t_elapsed)}

    # DB: find the InvoiceTempOCR record for this session
    try:
        records = list(InvoiceTempOCR.objects.filter(upload_session_id=SESSION_ID).values(
            'id', 'status', 'supplier_invoice_no', 'created_at'
        ))
        ev['db_records'] = [{'id': str(r['id']), 'status': r['status'], 'invoice': r['supplier_invoice_no']} for r in records]
    except Exception as e:
        ev['db_records'] = [{'error': str(e)}]

    # DB: SessionFinalizationState
    try:
        states = list(SessionFinalizationState.objects.filter(id__in=[str(r['id']) for r in records] if records else []).values(
            'id', 'expected_pages', 'completed_pages', 'failed_pages', 'ai_complete', 'snapshot_created', 'status'
        ))
        ev['finalization_states'] = [dict(s) for s in states]
    except Exception as e:
        ev['finalization_states'] = [{'error': str(e)}]

    # DB: InvoicePageResult
    try:
        if records:
            rec_ids = [str(r['id']) for r in records]
            pages = list(InvoicePageResult.objects.filter(record_id__in=rec_ids).values(
                'id', 'record_id', 'page_number', 'is_failed', 'created_at'
            ).order_by('page_number'))
            ev['page_results'] = [{'id': str(p['id']), 'page': p['page_number'], 'failed': p['is_failed']} for p in pages]
        else:
            ev['page_results'] = []
    except Exception as e:
        ev['page_results'] = [{'error': str(e)}]

    # Redis: concurrency + assembly keys for this session
    try:
        all_keys = r.keys('*')
        session_keys = [k for k in all_keys if SESSION_ID[:8] in k]
        ai_conc = r.zcard('ai_concurrency:global')
        rec_ids_from_records = [str(rec['id']) for rec in ev.get('db_records', []) if 'id' in rec]
        assembly_counts = {}
        for rid in rec_ids_from_records:
            ak = [k for k in all_keys if f'assembly:{rid}' in k]
            assembly_counts[rid] = len(ak)
        ev['redis'] = {
            'ai_concurrency_global': ai_conc,
            'session_keys': session_keys,
            'assembly_key_counts': assembly_counts,
        }
    except Exception as e:
        ev['redis'] = {'error': str(e)}

    # SQS depths
    try:
        ev['sqs'] = {}
        for q in ['ingestion', 'ai', 'assembly', 'finalize', 'materialization', 'export']:
            v, inv = get_sqs_depth(q)
            ev['sqs'][q] = {'visible': v, 'invisible': inv}
    except Exception as e:
        ev['sqs'] = {'error': str(e)}

    return ev

def is_terminal(events):
    if not events:
        return False
    last = events[-1]
    records = last.get('db_records', [])
    if not records:
        return False
    for rec in records:
        s = rec.get('status', '')
        if s in ('EXTRACTING', 'UPLOADED', 'PENDING', ''):
            return False
    return True

print(f"[PHASE 6] Starting forensic trace for session={SESSION_ID}")
print(f"[PHASE 6] T0={datetime.fromtimestamp(T0_TS, tz=timezone.utc).isoformat()}")
print(f"[PHASE 6] Polling every {POLL_INTERVAL}s, max {MAX_WAIT_SECONDS}s")
print()

t_start = time.time()
poll_num = 0

while time.time() - t_start < MAX_WAIT_SECONDS:
    elapsed = time.time() - t_start
    poll_num += 1
    ev = snapshot(elapsed)
    trace_events.append(ev)

    records = ev.get('db_records', [])
    states  = ev.get('finalization_states', [])
    pages   = ev.get('page_results', [])
    sqs_d   = ev.get('sqs', {})
    redis_d = ev.get('redis', {})

    print(f"[T+{elapsed:.0f}s] Poll#{poll_num}")
    if records:
        for rec in records:
            print(f"  DB record={rec.get('id')} status={rec.get('status')} invoice={rec.get('invoice')}")
    else:
        print(f"  DB: no records yet for session={SESSION_ID}")

    for st in states:
        print(f"  Barrier: expected={st.get('expected_pages')} completed={st.get('completed_pages')} failed={st.get('failed_pages')} ai_complete={st.get('ai_complete')} snapshot={st.get('snapshot_created')} status={st.get('status')}")

    if pages:
        success_pages = [p for p in pages if not p.get('failed')]
        fail_pages = [p for p in pages if p.get('failed')]
        print(f"  Pages saved: total={len(pages)} success={len(success_pages)} failed={len(fail_pages)}")
        for p in pages:
            print(f"    page={p.get('page')} failed={p.get('failed')}")

    print(f"  Redis ai_concurrency:global={redis_d.get('ai_concurrency_global','?')}")
    print(f"  SQS ai=vis:{sqs_d.get('ai',{}).get('visible','?')}/inv:{sqs_d.get('ai',{}).get('invisible','?')}  assembly=vis:{sqs_d.get('assembly',{}).get('visible','?')}/inv:{sqs_d.get('assembly',{}).get('invisible','?')}")
    print()

    # Check for terminal states
    all_statuses = [rec.get('status','') for rec in records]
    terminal_statuses = {'FINALIZED', 'VOUCHER_CREATED', 'COMPLETED', 'FAILED', 'ERROR'}
    if records and all(s in terminal_statuses for s in all_statuses):
        print(f"[PHASE 6] TERMINAL STATE REACHED at T+{elapsed:.0f}s")
        break

    # Also stop if snapshot is True
    for st in states:
        if st.get('snapshot_created') and st.get('ai_complete'):
            print(f"[PHASE 6] AI complete + snapshot created at T+{elapsed:.0f}s — pipeline succeeded!")
            break

    time.sleep(POLL_INTERVAL)

# Save full trace
with open('scratch/phase6_trace.json', 'w') as f:
    json.dump(trace_events, f, indent=2, default=str)
print(f"\n[PHASE 6] Trace saved: scratch/phase6_trace.json ({len(trace_events)} polls)")
print("[PHASE 6] Done. Proceed to Phase 7/8 log analysis.")
