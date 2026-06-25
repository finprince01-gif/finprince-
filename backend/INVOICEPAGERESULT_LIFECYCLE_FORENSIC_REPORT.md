# FORENSIC VALIDATION REPORT — INVOICEPAGERESULT LIFECYCLE & BARRIER SAFETY
## Read-Only Investigation — Source Code Evidence Only

**Date:** 2026-06-22  
**Scope:** InvoicePageResult persistence lifecycle, terminalize_page_state mechanics, and DB barrier convergence safety.  
**Constraint:** NO CODE CHANGES. Evidence from source files only.

---

## OBJECTIVE
Prove whether writing `terminalize_page_state(is_failed=True)` during `ProviderSaturatedError` is safe, and verify if a temporarily saturated page can be marked failed without corrupting the session finalization barrier accounting.

---

## PHASE 1 — COMPLETE INVOICEPAGERESULT AUDIT

Every code location interacting with `InvoicePageResult` creation, modification, deletion, or calling `terminalize_page_state` is detailed below.

### 1.1 Creation and Updates of `InvoicePageResult`

| File | Function | Line Number(s) | Operation / Purpose |
|------|----------|----------------|---------------------|
| [worker_base.py](file:///c:/108/AI-accounting-0.03/backend/vouchers/worker_base.py) | `_handle_task` (zombie check) | 601–606 | **Create (get_or_create):** Writes a failed fallback page result when SQS `receive_count >= 10` is detected, ensuring the barrier is unblocked. |
| [worker.py](file:///c:/108/AI-accounting-0.03/backend/vouchers/worker.py) | `process_task` (FinalizationWorker) | 415–418 | **Create / Update (update_or_create):** Persists canonical extraction payload for a page in the legacy/compatibility pipeline. |
| [coordinator.py](file:///c:/108/AI-accounting-0.03/backend/vouchers/coordinator.py) | `terminalize_page_state` | 227–236 | **Create (get_or_create):** Inserts a default `InvoicePageResult` for the given `record_id` and `page_number` with `counted_in_barrier=False`. |
| [coordinator.py](file:///c:/108/AI-accounting-0.03/backend/vouchers/coordinator.py) | `terminalize_page_state` | 239–243 | **Update (save):** Overwrites the page result fields (`is_failed`, `canonical_payload`, `session_id`) **only if** the page has not yet been counted in the barrier (`not res_obj.counted_in_barrier`). |
| [coordinator.py](file:///c:/108/AI-accounting-0.03/backend/vouchers/coordinator.py) | `terminalize_page_state` | 269–270 | **Update (save):** Marks `res_obj.counted_in_barrier = True` once the barrier database counters are successfully incremented. |

### 1.2 Deletions of `InvoicePageResult`
* **None.** There are no SQL or Django ORM deletion operations (`.delete()`) targeting `InvoicePageResult` anywhere in the codebase. Once a page result is created, it persists permanently.

### 1.3 Calls to `terminalize_page_state()`

| File | Function | Line Number(s) | Context / Purpose |
|------|----------|----------------|-------------------|
| [ai_worker.py](file:///c:/108/AI-accounting-0.03/backend/vouchers/ai_worker.py) | `_handle_task_inner` | 192–204 | **Idempotency Skip:** Called with `is_failed=False` and the existing payload when skipping a page that was already successfully processed. |
| [ai_worker.py](file:///c:/108/AI-accounting-0.03/backend/vouchers/ai_worker.py) | `_handle_task_inner` | 276–288 | **OCR Cache Hit Fast-Path:** Called with `is_failed=False` to record a cache-restored page extraction and progress the barrier. |
| [ai_worker.py](file:///c:/108/AI-accounting-0.03/backend/vouchers/ai_worker.py) | `_handle_task_inner` | 500–512 | **Unhandled Exception Recovery:** Called with `is_failed=True` to fail-safe the page and prevent pipeline deadlocks when processing crashes. |
| [ai_worker.py](file:///c:/108/AI-accounting-0.03/backend/vouchers/ai_worker.py) | `_process_result` (`_persist` inner helper) | 665–677 | **Normal Processing Outcome:** Called with `is_failed=is_failed` to persist the final page extraction outcome (either success DTO or validation/DTO failure). |
| [pipeline.py](file:///c:/108/AI-accounting-0.03/backend/ocr_pipeline/pipeline.py) | `run_ocr_pipeline` (sliding window check) | 2041–2049 | **Enqueue Failure Recovery:** Called with `is_failed=True` when SQS enqueue fails, resolving partial page counts. |

---

## PHASE 2 — SUCCESS PAGE LIFECYCLE

Below is the execution flow trace for a successful page:

```
AI Worker (ai_worker.py)
   ↓ [Calls _process_result and validates DTO]
Extraction (normalize.py)
   ↓ [get_canonical_export_record produces canonical payload]
DB Write (coordinator.py)
   ↓ [get_or_create InvoicePageResult record_id & page_number]
Barrier Update (coordinator.py)
   ↓ [select_for_update updates SessionFinalizationState counter + 1]
Assembly Trigger (coordinator.py)
   ↓ [Spawns check_and_trigger_assembly thread outside transaction]
```

### Step 1: AI Worker Complete
* **File:** [ai_worker.py](file:///c:/108/AI-accounting-0.03/backend/vouchers/ai_worker.py)
* **Function:** `_handle_task_inner` (line 137) and `_process_result` (line 532)
* **Execution details:** `_handle_task_inner` calls `_process_result(final_task, final_result)` on line 481, passing the task payload and the raw Qwen-VL response.

### Step 2: Extraction & Canonical DTO Construction
* **File:** [ai_worker.py](file:///c:/108/AI-accounting-0.03/backend/vouchers/ai_worker.py)
* **Function:** `_process_result` (lines 600–603)
* **Execution details:** Invokes `get_canonical_export_record(parsed, tenant_id=tenant_id)` from [normalize.py](file:///c:/108/AI-accounting-0.03/backend/ocr_pipeline/normalize.py).
* **Variables passed:** `parsed` (repaired dictionary from Qwen response) and `tenant_id` (string).
* **Outcome:** Generates the structured `canonical_payload` Success DTO.

### Step 3: DB Write (`InvoicePageResult`)
* **File:** [coordinator.py](file:///c:/108/AI-accounting-0.03/backend/vouchers/coordinator.py)
* **Function:** `terminalize_page_state` (lines 227–236)
* **ORM/SQL Operation:** 
  ```python
  res_obj, created = InvoicePageResult.objects.get_or_create(
      record_id=record_id,
      page_number=page_number,
      defaults={
          'session_id': session_id,
          'is_failed': is_failed,
          'canonical_payload': canonical_payload,
          'counted_in_barrier': False
      }
  )
  ```
* **Variables passed:** `record_id`, `page_number`, default dictionary including `is_failed=False`, `canonical_payload`.
* **SQL:**
  ```sql
  SELECT ... FROM invoice_page_results WHERE record_id = %s AND page_number = %s;
  -- If not found:
  INSERT INTO invoice_page_results (record_id, page_number, session_id, canonical_payload, counted_in_barrier, is_failed, ...) VALUES (...);
  ```

### Step 4: Barrier Update (`SessionFinalizationState`)
* **File:** [coordinator.py](file:///c:/108/AI-accounting-0.03/backend/vouchers/coordinator.py)
* **Function:** `terminalize_page_state` (lines 224, 261–270)
* **ORM/SQL Operation:** 
  * Locks session state:
    ```python
    barrier = SessionFinalizationState.objects.select_for_update().get(id=str(record_id))
    ```
  * Updates counter:
    ```python
    barrier.completed_pages = models.F('completed_pages') + 1
    barrier.ai_completed_pages = models.F('ai_completed_pages') + 1
    barrier.save(update_fields=['failed_pages', 'completed_pages', 'ai_completed_pages'])
    ```
  * Sets counted in barrier:
    ```python
    res_obj.counted_in_barrier = True
    res_obj.save(update_fields=['counted_in_barrier'])
    ```
* **Variables passed:** `record_id` (string), update fields lists.
* **SQL:**
  ```sql
  SELECT ... FROM session_finalization_states WHERE id = %s FOR UPDATE;
  UPDATE session_finalization_states SET completed_pages = completed_pages + 1, ai_completed_pages = ai_completed_pages + 1 WHERE id = %s;
  UPDATE invoice_page_results SET counted_in_barrier = 1 WHERE id = %s;
  ```

### Step 5: Assembly Evaluation & Trigger
* **File:** [coordinator.py](file:///c:/108/AI-accounting-0.03/backend/vouchers/coordinator.py)
* **Function:** `terminalize_page_state` (lines 295–357)
* **ORM/SQL Operation:** 
  * Post-transaction read of counts (line 315–318):
    ```python
    _barrier = _SFS.objects.filter(id=str(record_id)).values('expected_pages', 'completed_pages', 'failed_pages', 'ai_complete').first()
    ```
    * **SQL:** `SELECT expected_pages, completed_pages, failed_pages, ai_complete FROM session_finalization_states WHERE id = %s;`
  * Spawns worker thread invoking `check_and_trigger_assembly(...)` if `_expected > 0 and _barrier_total >= _expected and not _ai_complete`.
  * Within `check_and_trigger_assembly` (lines 55–104):
    ```python
    with transaction.atomic():
        barrier = SessionFinalizationState.objects.select_for_update().get(id=str(record_id))
        ...
        barrier.ai_complete = True
        barrier.save(update_fields=['ai_complete'])
    ```
    * **SQL:** 
      ```sql
      SELECT ... FROM session_finalization_states WHERE id = %s FOR UPDATE;
      UPDATE session_finalization_states SET ai_complete = 1 WHERE id = %s;
      ```
    * Enqueues `ASSEMBLY` message using SQS queue service.

---

## PHASE 3 — BARRIER SAFETY & CONVERGENCE

If a page fails temporarily (e.g., writes `terminalize_page_state(is_failed=True)` during a `ProviderSaturatedError` retry) but is subsequently processed successfully on retry, the system behaves as follows:

### 3.1 Does the second write raise an exception?
**No.**  
* In the database, `InvoicePageResult` has a unique constraint: `unique_together = ('record_id', 'page_number')`.
* On the second call, `InvoicePageResult.objects.get_or_create()` on line 227 executes a SELECT first. Because the row already exists, Django retrieves the existing object and returns `created=False` instead of attempting to INSERT a duplicate row.
* Because the row was marked `counted_in_barrier=True` and committed in the first call, the conditions `if not created and not res_obj.counted_in_barrier` (line 239) and `if not res_obj.counted_in_barrier` (line 245) evaluate to `False`.
* The execution skips all validation checks, database updates, and F-expression increments, avoiding a `ConvergenceCorruptionError`.

### 3.2 Does the second write overwrite the `is_failed=True` record?
**No.**  
* The update block is explicitly guarded by `if not created and not res_obj.counted_in_barrier:` (line 239).
* Since `counted_in_barrier` is `True`, the condition is `False`, and the successful payload and `is_failed=False` status are **ignored**.
* The database row remains `is_failed=True` with the initial error payload. The successful retry DTO is discarded.

### 3.3 How are `completed_pages` and `failed_pages` in `SessionFinalizationState` updated?
* **Call 1 (Failure Path):** `res_obj.counted_in_barrier` is `False`. Since `is_failed` is `True`, the engine increments `failed_pages`:
  `barrier.failed_pages = models.F('failed_pages') + 1` (line 262).
* **Call 2 (Success Path):** `res_obj.counted_in_barrier` is `True`. The counter update block (lines 245–270) is entirely bypassed.
* **Final DB State:** `failed_pages` is incremented by 1, and `completed_pages` remains unmodified.

### 3.4 Does the barrier counter (`completed_pages + failed_pages`) get double-incremented?
**No.**  
* The gating condition `if not res_obj.counted_in_barrier:` (line 245) ensures that the counter increment logic is skipped on all subsequent calls for that page. The page is counted in the barrier exactly once.

### 3.5 Prove if a race condition is possible if the failure path and success path execute concurrently.
**No race condition is possible.**
* Both paths execute inside `transaction.atomic()` and acquire an exclusive row-level lock on the parent `SessionFinalizationState` via `select_for_update()` (line 224).
* This forces database serializability for the entire duration of the transaction.
* Whichever path acquires the lock first runs to completion, inserts the `InvoicePageResult` row, increments the barrier counters, sets `counted_in_barrier = True`, and commits.
* The slower path blocks at line 224. Once the lock is released, it executes, retrieves the now-existing `InvoicePageResult` with `counted_in_barrier = True`, and exits without modifying any data.

> [!WARNING]
> **Conclusion:** While it is perfectly safe from an exception and database corruption standpoint to call `terminalize_page_state(is_failed=True)` early, **any subsequent successful retry of that page will be silently ignored**. The page will remain permanently recorded as `is_failed=True`, and the successful OCR extraction data will never be assembled. The assembled document will be missing this page's structured output.

---

## PHASE 4 — CONCURRENCY & REDIS LOCKS

### 4.1 What Redis lock key is used in `terminalize_page_state`?
**None.**  
* `terminalize_page_state()` does not use Redis locks. It relies exclusively on SQL database transactions and database-level row locks.

### 4.2 How is the lock acquired?
* It is acquired by the PostgreSQL/MySQL database engine using Django ORM's `select_for_update()` query:
  ```python
  barrier = SessionFinalizationState.objects.select_for_update().get(id=str(record_id))
  ```
  This is executed inside Django's `with transaction.atomic():` context manager.

### 4.3 What is the lock timeout?
* N/A for Redis. The database row lock is held for the duration of the SQL transaction and released when the `transaction.atomic()` block commits or rolls back. The timeout for acquiring the lock depends on the database engine's default lock wait timeout configuration.

### 4.4 What happens if the lock cannot be acquired?
* If the transaction cannot acquire the row lock within the database engine's lock timeout, Django raises a `django.db.utils.OperationalError` (specifically lock timeout / deadlock detected), rolling back the transaction.

### 4.5 Does the lock protect against double-incrementing the barrier?
**Yes.**  
* By locking the parent `SessionFinalizationState` record, only one thread can evaluate and write to `InvoicePageResult` and update the barrier counters for a given invoice at any single moment. This prevents a race condition where two threads concurrently see `counted_in_barrier = False` and increment the counters simultaneously.

---
*Forensic validation complete. Evidence sourced from coordinator.py, models.py, and ai_worker.py.*
