"""
PHASE 1 – CAPACITY BASELINE MEASUREMENT
Collects: DB connections, queue depths, Redis state, poison table stats,
          session finalization state, active workers.
READ-ONLY. No mutations.
"""
import os, sys, django, time, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

import boto3
from django.db import connection
from django.conf import settings

output = {}

# ─── 1. MySQL DB Metrics ───────────────────────────────────────────────
print("\n" + "="*70)
print("SECTION 1: DATABASE STATE")
print("="*70)
try:
    with connection.cursor() as c:
        c.execute("SHOW STATUS LIKE 'Threads_connected'")
        row = c.fetchone(); threads_connected = int(row[1]) if row else 0

        c.execute("SHOW STATUS LIKE 'Threads_running'")
        row = c.fetchone(); threads_running = int(row[1]) if row else 0

        c.execute("SHOW VARIABLES LIKE 'max_connections'")
        row = c.fetchone(); max_conn = int(row[1]) if row else 151

        c.execute("SHOW STATUS LIKE 'Max_used_connections'")
        row = c.fetchone(); max_used = int(row[1]) if row else 0

        c.execute("SHOW STATUS LIKE 'Connection_errors_max_connections'")
        row = c.fetchone(); conn_errors = int(row[1]) if row else 0

        c.execute("SHOW STATUS LIKE 'Innodb_row_lock_waits'")
        row = c.fetchone(); lock_waits = int(row[1]) if row else 0

        c.execute("SHOW STATUS LIKE 'Innodb_row_lock_time_avg'")
        row = c.fetchone(); lock_time_avg = int(row[1]) if row else 0

        c.execute("SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE COMMAND != 'Sleep'")
        active_queries = c.fetchone()[0]

        c.execute("SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE COMMAND = 'Sleep'")
        sleeping_conn = c.fetchone()[0]

        c.execute("SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE TIME > 10 AND COMMAND != 'Sleep'")
        long_queries = c.fetchone()[0]

    print(f"  max_connections:          {max_conn}")
    print(f"  Threads_connected:        {threads_connected}")
    print(f"  Threads_running:          {threads_running}")
    print(f"  Max_used_connections:     {max_used}")
    print(f"  Connection_errors:        {conn_errors}")
    print(f"  Active queries:           {active_queries}")
    print(f"  Sleeping connections:     {sleeping_conn}")
    print(f"  Long-running (>10s):      {long_queries}")
    print(f"  InnoDB lock_waits:        {lock_waits}")
    print(f"  InnoDB lock_time_avg_ms:  {lock_time_avg}")
    print(f"  Connection utilization:   {threads_connected/max_conn*100:.1f}%")
    output['db'] = {
        'max_connections': max_conn, 'connected': threads_connected,
        'running': threads_running, 'max_used': max_used,
        'conn_errors': conn_errors, 'active_queries': active_queries,
        'lock_waits': lock_waits, 'long_queries': long_queries,
        'utilization_pct': round(threads_connected/max_conn*100, 1)
    }
except Exception as e:
    print(f"  [ERROR] DB metrics failed: {e}")

# ─── 2. Key Table Sizes ────────────────────────────────────────────────
print("\n" + "="*70)
print("SECTION 2: TABLE SIZES & INDEXES")
print("="*70)
try:
    with connection.cursor() as c:
        c.execute("""
            SELECT table_name, table_rows,
                   ROUND(data_length/1024/1024, 2) AS data_mb,
                   ROUND(index_length/1024/1024, 2) AS index_mb
            FROM information_schema.TABLES
            WHERE table_schema = DATABASE()
              AND table_name IN (
                'invoice_ocr_temp', 'poison_documents', 'pipeline_events',
                'session_finalization_states', 'finalized_snapshots',
                'invoice_page_results', 'ocr_jobs', 'ocr_tasks'
              )
            ORDER BY data_length DESC
        """)
        rows = c.fetchall()
        print(f"  {'Table':<35} {'Rows':>10} {'Data MB':>10} {'Index MB':>10}")
        print(f"  {'-'*68}")
        for r in rows:
            print(f"  {r[0]:<35} {r[1]:>10,} {r[2]:>10} {r[3]:>10}")

        # Check for missing indexes
        c.execute("""
            SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE table_schema = DATABASE()
              AND table_name = 'poison_documents'
              AND column_name = 'created_at'
        """)
        pd_created_at_idx = c.fetchone()[0]
        print(f"\n  poison_documents.created_at index exists: {'YES' if pd_created_at_idx else 'NO ← MISSING'}")

        c.execute("""
            SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE table_schema = DATABASE()
              AND table_name = 'invoice_ocr_temp'
              AND column_name IN ('upload_session_id', 'status')
        """)
        ocr_temp_idx = c.fetchone()[0]
        print(f"  invoice_ocr_temp.(upload_session_id/status) index count: {ocr_temp_idx}")

        output['tables'] = {'rows': {r[0]: r[1] for r in rows}, 'pd_created_at_idx': bool(pd_created_at_idx)}
except Exception as e:
    print(f"  [ERROR] Table sizes failed: {e}")

# ─── 3. PoisonDocument Analysis ────────────────────────────────────────
print("\n" + "="*70)
print("SECTION 3: POISON DOCUMENT TABLE")
print("="*70)
try:
    from ocr_pipeline.models import PoisonDocument
    from django.utils import timezone

    total_pd = PoisonDocument.objects.count()
    recent_24h = PoisonDocument.objects.filter(created_at__gte=timezone.now()-timezone.timedelta(hours=24)).count()
    recent_7d = PoisonDocument.objects.filter(created_at__gte=timezone.now()-timezone.timedelta(days=7)).count()
    stale = total_pd - recent_7d

    by_role = list(PoisonDocument.objects.values('worker_role').annotate(
        cnt=django.db.models.Count('id')
    ).order_by('-cnt')[:10])

    print(f"  Total poison documents:   {total_pd:,}")
    print(f"  Last 24h:                 {recent_24h:,}")
    print(f"  Last 7 days:              {recent_7d:,}")
    print(f"  Stale (>7 days):          {stale:,} ← safe to purge")
    print(f"\n  By worker role:")
    for r in by_role:
        print(f"    {r['worker_role']:<20} {r['cnt']:>8,}")
    output['poison'] = {'total': total_pd, 'recent_24h': recent_24h, 'stale': stale}
except Exception as e:
    print(f"  [ERROR] PoisonDocument: {e}")
    import django.db.models

# ─── 4. Session State Analysis ─────────────────────────────────────────
print("\n" + "="*70)
print("SECTION 4: SESSION FINALIZATION STATE")
print("="*70)
try:
    from ocr_pipeline.models import SessionFinalizationState
    import django.db.models as djm

    by_status = list(SessionFinalizationState.objects.values('status').annotate(
        cnt=djm.Count('id')
    ).order_by('-cnt'))
    total_sfs = SessionFinalizationState.objects.count()
    tc_false = SessionFinalizationState.objects.filter(terminal_consistency=False).count()
    tc_true = SessionFinalizationState.objects.filter(terminal_consistency=True).count()

    print(f"  Total sessions:           {total_sfs:,}")
    print(f"  terminal_consistency=True:  {tc_true:,}")
    print(f"  terminal_consistency=False: {tc_false:,} ← potentially stuck")
    print(f"\n  By status:")
    for s in by_status:
        print(f"    {s['status']:<20} {s['cnt']:>8,}")
    output['sessions'] = {'total': total_sfs, 'stuck': tc_false, 'by_status': {s['status']: s['cnt'] for s in by_status}}
except Exception as e:
    print(f"  [ERROR] SessionFinalizationState: {e}")

# ─── 5. AWS SQS Queue Depths ──────────────────────────────────────────
print("\n" + "="*70)
print("SECTION 5: SQS QUEUE DEPTHS")
print("="*70)
try:
    sqs = boto3.client(
        'sqs',
        region_name=os.getenv('AWS_REGION', 'ap-south-1'),
        aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
    )
    queues = {
        'ingestion': os.getenv('SQS_INGESTION_QUEUE_URL'),
        'ai':        os.getenv('SQS_AI_QUEUE_URL'),
        'assembly':  os.getenv('SQS_ASSEMBLY_QUEUE_URL'),
        'finalize':  os.getenv('SQS_FINALIZE_QUEUE_URL'),
        'export':    os.getenv('SQS_EXPORT_QUEUE_URL'),
        'materialize': os.getenv('SQS_MATERIALIZATION_QUEUE_URL'),
    }
    sqs_depths = {}
    print(f"  {'Queue':<15} {'Visible':>10} {'In-Flight':>12} {'NotVisible':>12}")
    print(f"  {'-'*52}")
    for name, url in queues.items():
        if not url:
            print(f"  {name:<15} {'N/A':>10}")
            continue
        try:
            resp = sqs.get_queue_attributes(
                QueueUrl=url,
                AttributeNames=[
                    'ApproximateNumberOfMessages',
                    'ApproximateNumberOfMessagesNotVisible',
                    'ApproximateNumberOfMessagesDelayed'
                ]
            )
            attrs = resp['Attributes']
            visible = int(attrs.get('ApproximateNumberOfMessages', 0))
            inflight = int(attrs.get('ApproximateNumberOfMessagesNotVisible', 0))
            delayed = int(attrs.get('ApproximateNumberOfMessagesDelayed', 0))
            sqs_depths[name] = {'visible': visible, 'inflight': inflight, 'delayed': delayed}
            flag = ' ← BACKLOG' if visible > 100 else ''
            print(f"  {name:<15} {visible:>10,} {inflight:>12,} {delayed:>12,}{flag}")
        except Exception as qe:
            print(f"  {name:<15} ERROR: {qe}")
    output['sqs'] = sqs_depths
except Exception as e:
    print(f"  [ERROR] SQS: {e}")

# ─── 6. Redis State ────────────────────────────────────────────────────
print("\n" + "="*70)
print("SECTION 6: REDIS STATE")
print("="*70)
try:
    import redis as redis_lib
    r = redis_lib.Redis(
        host=os.getenv('REDIS_HOST', 'localhost'),
        port=int(os.getenv('REDIS_PORT', 6379)),
        db=int(os.getenv('REDIS_DB', 0)),
        decode_responses=True
    )
    info = r.info()
    keyspace = r.info('keyspace')
    db0 = keyspace.get('db0', {})
    total_keys = db0.get('keys', 0) if isinstance(db0, dict) else 0

    worker_hb = r.hgetall('worker_heartbeats') or {}
    worker_locks = {}
    for role in ['AI', 'INGESTION', 'ASSEMBLY', 'FINALIZE', 'EXPORT', 'materialization']:
        key = f"worker_lock_{role}_local"
        val = r.get(key)
        if val:
            worker_locks[role] = val

    ai_conc_key = "ai_concurrency:global"
    ai_slots_used = 0
    try:
        now = time.time()
        members = r.zrangebyscore(ai_conc_key, now, '+inf', withscores=True)
        ai_slots_used = len(members)
    except Exception:
        pass

    print(f"  Redis version:            {info.get('redis_version')}")
    print(f"  Connected clients:        {info.get('connected_clients')}")
    print(f"  Used memory:              {info.get('used_memory_human')}")
    print(f"  Total keys (db0):         {total_keys:,}")
    print(f"  Total commands/sec:       {info.get('instantaneous_ops_per_sec')}")
    print(f"\n  Active AI concurrency slots: {ai_slots_used}/{os.getenv('AI_GLOBAL_CONCURRENCY', 50)}")
    print(f"\n  Worker heartbeats (active roles):")
    if worker_hb:
        for role, ts in worker_hb.items():
            age = time.time() - float(ts)
            status = 'ALIVE' if age < 120 else 'STALE'
            print(f"    {role:<25} age={age:.0f}s  [{status}]")
    else:
        print("    [none registered]")
    print(f"\n  Worker singleton locks held:")
    if worker_locks:
        for role, pid in worker_locks.items():
            print(f"    {role:<20} PID={pid}")
    else:
        print("    [none]")
    output['redis'] = {
        'version': info.get('redis_version'), 'clients': info.get('connected_clients'),
        'memory': info.get('used_memory_human'), 'keys': total_keys,
        'ai_slots_used': ai_slots_used, 'worker_heartbeats': len(worker_hb)
    }
except Exception as e:
    print(f"  [ERROR] Redis: {e}")

# ─── 7. OCR Job Throughput (last 24h) ─────────────────────────────────
print("\n" + "="*70)
print("SECTION 7: OCR JOB THROUGHPUT (LAST 24H)")
print("="*70)
try:
    from ocr_pipeline.models import OCRJob, OCRTask
    from django.utils import timezone

    since = timezone.now() - timezone.timedelta(hours=24)
    jobs = OCRJob.objects.filter(created_at__gte=since)
    total_jobs = jobs.count()
    completed = jobs.filter(status='COMPLETED').count()
    failed = jobs.filter(status='FAILED').count()
    partial = jobs.filter(status='PARTIAL').count()
    processing = jobs.filter(status='PROCESSING').count()

    tasks_since = OCRTask.objects.filter(created_at__gte=since)
    total_tasks = tasks_since.count()
    completed_tasks = tasks_since.filter(status='COMPLETED').count()
    failed_tasks = tasks_since.filter(status='FAILED').count()

    print(f"  Jobs last 24h:            {total_jobs}")
    print(f"    COMPLETED:              {completed}")
    print(f"    PARTIAL:                {partial}")
    print(f"    FAILED:                 {failed}")
    print(f"    PROCESSING (stuck?):    {processing}")
    print(f"\n  Pages (OCRTasks) 24h:     {total_tasks}")
    print(f"    COMPLETED pages:        {completed_tasks}")
    print(f"    FAILED pages:           {failed_tasks}")
    if total_tasks > 0:
        print(f"    Page success rate:      {completed_tasks/total_tasks*100:.1f}%")
        print(f"    Effective throughput:   ~{completed_tasks} pages / 24h = {completed_tasks//24} pages/hour")
    output['throughput'] = {
        'jobs_24h': total_jobs, 'completed_jobs': completed,
        'pages_24h': total_tasks, 'completed_pages': completed_tasks,
        'pages_per_hour': completed_tasks // 24 if total_tasks > 0 else 0
    }
except Exception as e:
    print(f"  [ERROR] Throughput: {e}")

# ─── 8. Current .env Config Summary ───────────────────────────────────
print("\n" + "="*70)
print("SECTION 8: CURRENT CAPACITY CONFIG")
print("="*70)
config_keys = [
    'AI_GLOBAL_CONCURRENCY', 'WORKER_CONCURRENCY', 'AI_MAX_RPS',
    'MAX_PAGES_PER_JOB', 'GEMINI_MODEL', 'REDIS_HOST', 'CLUSTER_ENV', 'DJANGO_DEBUG'
]
gemini_keys = len([k for k in os.getenv('GEMINI_API_KEY', '').split(',') if k.strip()])
print(f"  GEMINI_API_KEY count:     {gemini_keys}")
for k in config_keys:
    print(f"  {k:<30} {os.getenv(k, '[not set]')}")

print("\n" + "="*70)
print("BASELINE COMPLETE")
print("="*70)
print(json.dumps(output, indent=2, default=str))
