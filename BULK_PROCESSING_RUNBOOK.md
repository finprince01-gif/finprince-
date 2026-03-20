# 🚀 BULK INVOICE PIPELINE – PRODUCTION RUNBOOK

## Architecture Overview

```
User Upload (HTTP)
  ↓
BulkUploadAPIView (Django)
  ├── Idempotency check (file fingerprint)
  ├── Backpressure check (max 5 active jobs/tenant)
  └── Creates DB records → dispatches to Redis
         ↓
  Redis Queue (Celery Broker)
         ↓
 ┌──────────────────────────────┐
 │  Celery Workers (scalable)   │
 │                              │
 │  invoice_files  queue        │
 │  → segment_and_enqueue()     │
 │    (split PDF into pages)    │
 │                              │
 │  invoice_pages  queue        │
 │  → process_invoice_page()    │
 │    (AI extraction, 1-page)   │
 │                              │
 │  invoice_merge  queue        │
 │  → check_and_merge_invoice() │
 │    (combine pages → result)  │
 └──────────────────────────────┘
         ↓
  MySQL DB (Final Results)
         ↓
  Frontend polls /api/bulk-status/<job_id>/ every 2-5s
```

---

## Prerequisites

1. **Redis** must be running:
   ```powershell
   # Install Redis on Windows (using WSL or redis-windows)
   # or use cloud Redis (e.g., Redis Cloud, AWS ElastiCache)
   redis-server
   ```

2. Set `.env` variables:
   ```env
   REDIS_URL=redis://localhost:6379/0
   CELERY_BROKER_URL=redis://localhost:6379/0
   CELERY_RESULT_BACKEND=redis://localhost:6379/1
   BULK_MAX_ACTIVE_JOBS=5
   BULK_MAX_RETRIES=3
   BULK_AI_SLOTS=10
   BULK_AI_CALL_GAP=0.5
   ```

---

## Starting Services

### 1. Django API Server (as always)
```powershell
cd c:\108\muthu\AI-accounting-0.03\backend
python manage.py runserver
```

### 2. Celery Worker (NEW – required for bulk processing)
```powershell
cd c:\108\muthu\AI-accounting-0.03\backend

# Standard single-server start (5 concurrent workers)
celery -A backend worker `
  -Q invoice_pages,invoice_files,invoice_merge `
  --concurrency=5 `
  -l info

# Or with separate queue concurrency control:
celery -A backend worker -Q invoice_pages --concurrency=5 -l info &
celery -A backend worker -Q invoice_files,invoice_merge --concurrency=2 -l info &
```

### 3. Celery Beat (self-healing periodic tasks)
```powershell
celery -A backend beat -l info
```

### 4. Monitor (optional but recommended)
```powershell
# Install Flower: pip install flower
celery -A backend flower --port=5555
# Open http://localhost:5555
```

---

## Scaling Guide

| Users     | Workers | Redis  | Notes                        |
|-----------|---------|--------|------------------------------|
| < 100     | 5       | local  | Current single-server setup  |
| 100–1,000 | 20      | local  | Multiple Celery worker procs |
| 1K–50K    | 50+     | cloud  | Add dedicated Redis server   |
| 50K–500K  | 100+    | cluster| Redis Cluster + multi-host   |

To scale horizontally, simply run the Celery worker command on MORE servers
pointing to the SAME Redis URL. No code changes needed.

---

## Queue Priority

Tasks are routed to queues:
- `invoice_pages` — AI extraction (1-page, parallel, **highest volume**)
- `invoice_files` — Segmentation + self-healing (low freq)
- `invoice_merge` — Merge results after all pages done

Page-level Celery task priorities:
- Priority 1 → 1-page invoices (processed FIRST)
- Priority 2 → 2-page invoices
- Priority 3 → 3+ page invoices

---

## Self-Healing

The `recover_stuck_items` task runs every **5 minutes** via Celery Beat.

It finds tasks stuck in `PROCESSING` for > 5 min (crash/timeout),
resets them to `PENDING`, and re-queues them in Celery.

**Maximum re-queued at once is bounded by DB query (not a loop explosion).**

---

## Idempotency & Duplication Protection

| Protection Layer       | Where                    | How                             |
|------------------------|--------------------------|---------------------------------|
| Job fingerprint        | `BulkUploadAPIView`      | SHA-256 of file names + sizes   |
| Worker atomic claim    | `process_invoice_page`   | `UPDATE WHERE status='pending'` |
| Task uniqueness        | Celery + Redis           | `task_id` prevents dup delivery |
| Segmentation flag      | `segment_and_enqueue`    | `segmentation_done` flag in DB  |

---

## Monitoring Checklist

```
✅ redis-cli ping → PONG
✅ celery inspect active → no stale tasks
✅ flower dashboard → queue sizes decreasing
✅ DB: SELECT status, COUNT(*) FROM invoice_processing_items GROUP BY status
✅ Server logs: [SUCCESS]/[FAILED] ratios
```

---

## Failure Recovery

If Redis goes down:
- Upload API returns 503 (broker unavailable)
- Pending tasks in DB remain `pending`
- When Redis comes back, run:
  ```
  celery -A backend call vouchers.tasks.recover_stuck_items
  ```

If a Celery worker crashes mid-task:
- `acks_late=True` ensures task is re-delivered to another worker automatically
- No manual intervention needed

---

## Production Notes

- `CELERY_TASK_ACKS_LATE=True` → tasks survive worker crashes
- `CELERY_WORKER_PREFETCH_MULTIPLIER=1` → fair distribution, no task hoarding
- `time_limit=300, soft_time_limit=240` → AI timeouts kill stuck tasks cleanly
- `max_retries=3` with exponential backoff (5s, 10s, 60s cap)
