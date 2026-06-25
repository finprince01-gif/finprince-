# FORENSIC REPORT — NON-TERMINAL PAGE STATE & SAFE RETRY DESIGN
## Read-Only Investigation — Source Code Evidence Only

**Date:** 2026-06-22  
**Scope:** Non-terminal pipeline states, SQS message lifecycle, and safe retry design patterns.  
**Constraint:** NO CODE CHANGES. Evidence from source files only.

---

## PHASE 1 — NON-TERMINAL STATE AUDIT

An investigation of the codebase was conducted to identify if states like `RETRYING`, `SATURATED`, `PENDING`, `IN_PROGRESS`, or `TRANSIENT_FAILURE` are defined or used in the core components:

1. **`InvoicePageResult`**:
   * Contains only `is_failed` (Boolean) and `counted_in_barrier` (Boolean) fields.
   * Does **not** contain any string state fields orChoices for `RETRYING`, `SATURATED`, `PENDING`, `IN_PROGRESS`, or `TRANSIENT_FAILURE`.

2. **`SessionFinalizationState`**:
   * Tracks batch/session finalization states using `status` (choices include: `UPLOADED`, `PROCESSING`, `FINALIZING`, `FINALIZED`, `COMPLETED`, `FAILED`).
   * Does **not** track page-level states or contain choices for `RETRYING`, `SATURATED`, `PENDING`, `IN_PROGRESS`, or `TRANSIENT_FAILURE`.

3. **Coordinator (`vouchers/coordinator.py`)**:
   * Works strictly with numerical counters (`completed_pages`, `failed_pages`, `ai_completed_pages`) and the session-level `ai_complete` flag.
   * Contains **no** page-level state constants or tracking variables for transient states.

4. **AI Worker (`vouchers/ai_worker.py`)**:
   * Modifies `OCRTask.status` (which utilizes: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`).
   * Logs transient occurrences (e.g. `[PAGE_STATUS] ... status=RETRYABLE_INVALID` or `[PAGE_FAILED_RETRYABLE]`) as log messages but **does not persist** them as distinct DB models/records representing retry or saturation states.

5. **Assembly Worker (`vouchers/assembly_worker.py`)**:
   * Queries page results directly via:
     ```python
     results = list(InvoicePageResult.objects.filter(record_id=rec_id).values('page_number', 'is_failed'))
     ```
   * Bypasses all transient states. It is completely unaware of `RETRYING`, `SATURATED`, `PENDING`, `IN_PROGRESS`, or `TRANSIENT_FAILURE`.

---

## PHASE 2 — BARRIER REQUIREMENTS

### 2.1 Can a page exist without `counted_in_barrier=True`?
**Yes.**  
In `vouchers/coordinator.py` (lines 227–236), `InvoicePageResult.objects.get_or_create()` initializes the record with:
* `counted_in_barrier = False` (default value).
The field is only set to `True` (line 269) after the parent `SessionFinalizationState` counters have been successfully updated.

### 2.2 Can assembly see: Page Exists but Page Not Terminal?
**Yes, and this is a critical structural vulnerability.**  
* The assembly worker checks readiness using `get_db_barrier_state()` in [assembly_worker.py](file:///c:/108/AI-accounting-0.03/backend/vouchers/assembly_worker.py#L54-L66):
  ```python
  tot = len(results)
  ready = tot >= expected if expected > 0 else False
  ```
  Where `results` is the list of all rows in `InvoicePageResult` for that record.
* If a page record exists in `InvoicePageResult` (even if `counted_in_barrier=False` or `is_failed=False` but incomplete), it counts towards `tot = len(results)`.
* If `tot >= expected_pages`, then `ready` becomes `True`, and the assembly worker will attempt to assemble the multi-page invoice.
* **Vulnerability:** Writing any provisional or non-terminal placeholder record to `InvoicePageResult` before processing is truly completed will cause `tot >= expected` to evaluate to `True`, triggering early assembly of incomplete/placeholder data and causing data corruption.

---

## PHASE 3 — PAGE TRACKING AUDIT

How to track a page in `ProviderSaturatedError` -> `Backoff` -> `Retry Pending` without updating `SessionFinalizationState` counters (`completed_pages` and `failed_pages`):

1. **DB Barrier counters must not change:** Mutating `completed_pages` or `failed_pages` alters the convergence barrier (`completed_pages + failed_pages >= expected_pages`), which must remain unchanged during transient errors.
2. **`InvoicePageResult` must not be written:** As proven in Phase 2, writing any record to `InvoicePageResult` prematurely triggers the assembly worker's readiness check.
3. **Safe Tracking Mechanisms:**
   * **Volatile Message Payload Tracking:** Storing retry metadata (e.g., `_saturated_retry_count`) directly inside the SQS message dictionary. The payload travels with the message across retries without DB table changes.
   * **Redis State Tracking:** Updating a page's status in Redis using `set_page_state()` (e.g., to a non-terminal status like `"PROCESSING"` or `"SATURATED"` under the key `assembly:{record_id}:page_states`), which does not affect the DB barrier.

---

## PHASE 4 — SAFE DESIGN

To meet all safety requirements, the following design is identified as the smallest and safest mechanism:

### SQS Message Cycling (ACK-and-Delayed-Re-enqueue)
Instead of modifying the database or updating message visibility timeout in-place (which increments the SQS native `ReceiveCount` leading to automatic DLQ routing after 4 attempts), the worker can cycle the message as a new SQS task:

1. Catch `ProviderSaturatedError`.
2. Read the custom retry counter in the payload (e.g. `_saturated_retry_count`). If it does not exist, initialize it to 0.
3. **Threshold Check:**
   * If `_saturated_retry_count >= 10`:
     * Treat as terminal: Call `quarantine()` and write a terminal failed result to `InvoicePageResult(is_failed=True)` to close the barrier.
   * Else:
     * Increment the counter: `task['_saturated_retry_count'] += 1`.
     * Calculate backoff: `backoff_seconds = min(900, (2 ** task['_saturated_retry_count']) * 20)`.
     * **Re-enqueue:** Push a copy of the updated message back to the SQS queue with `DelaySeconds = backoff_seconds` using `queue_service.push()`.
     * **ACK:** Delete the current message from SQS using `queue_service.delete()` so it is removed from its current poll location.

### Why this satisfies all safety requirements:
* **No page disappears:** Creating a new SQS message resets the native AWS `ReceiveCount` to 1. The message will never hit the AWS native DLQ limit (4) and can loop safely.
* **No early assembly:** No row is written to `InvoicePageResult` during transient retries, so `len(results)` remains `< expected`, preventing the assembly worker from starting early.
* **No failed page written for transient errors:** `is_failed=True` is only written when `_saturated_retry_count` reaches 10 (exceeded limit).
* **Successful retries remain possible:** The message is re-entered into the queue and will eventually process normally when capacity permits.
* **Barrier accounting remains correct:** No counters are incremented in `SessionFinalizationState` during transient retries.

---

## PHASE 5 — IMPLEMENTATION PLAN

### 5.1 Proposed Changes Location
1. **Exact File:** [worker_base.py](file:///c:/108/AI-accounting-0.03/backend/vouchers/worker_base.py)
2. **Exact Function:** `_safe_handle_task()` (lines 725–770)
3. **Exact Code Path:** The exception handler for `ProviderSaturatedError`:
   ```python
   if exc_class == 'ProviderSaturatedError':
       # Implement ACK-and-Delayed-Re-enqueue logic here
   ```

### 5.2 Safety Verification
* **Why it is safe:** The SQS client API calls (`send_message` and `delete_message`) are thread-safe and verified. The payload modification does not interact with any shared local variables.
* **Why it cannot discard successful retries:** Because `InvoicePageResult` and the DB barrier are not updated during the transient phase, the system has no record of failure when a retry eventually succeeds. The success path will execute `terminalize_page_state(is_failed=False)` and save the successful payload normally.

---

## MOST IMPORTANT QUESTION ANSWER
**How do we prevent `ProviderSaturatedError` pages from disappearing WITHOUT permanently marking them failed?**

We **ACK (delete) the current message** and **enqueue a new, delayed copy** of the message to SQS. This resets AWS's native SQS `ReceiveCount` (avoiding the automatic DLQ route after 4 attempts) and delays execution (implementing backoff) without creating any placeholder rows in `InvoicePageResult`, preserving barrier convergence integrity.
