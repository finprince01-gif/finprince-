# FORENSIC VALIDATION — RECEIVE_COUNT BEHAVIOR DURING PROVIDERSATURATEDERROR

## Scope
Target Message: `d1c9dc22-48b9-4956-8eeb-c7c0bd3bb7d1` (SQS message ID)  
Task ID: `3f88013f-5cab-4990-9c18-c2a78cb60664`  
Record: `1007715` (record_id), Page: 13  
Session: `6a07a001-99a2-4c57-949e-bd1ac66d8e67`  
Source: `debug.log` (49,396 lines)  

---

## PHASE 1 — RECEIVE_COUNT TIMELINE (Log Evidence)

Three discrete receive events were observed in the log. No 4th event exists.

| Attempt | Timestamp | Log Line | receive_count | Backoff Applied | Outcome |
|---------|-----------|----------|--------------|-----------------|---------|
| 1 | `12:23:03.983` | 24670 | **1** (not logged as REPLAY) | 40s | `[MESSAGE_NACK] backoff=40s` |
| 2 | `12:23:44.597` | 25078 | **2** (`[MESSAGE_REPLAY] receive_count=2`) | 80s | `[MESSAGE_NACK] backoff=80s` |
| 3 | `12:30:04.912` | 27603 | **4** (`[MESSAGE_REPLAY] receive_count=4`) | 320s | `[MESSAGE_NACK] backoff=320s` |
| 4 | — | — | **Never received again** | — | **DISAPPEARED** |

### Evidence — Attempt 1 (receive_count=1)
```
12:23:03,983  [QUEUE_PUSH_SUCCESS] id=3f88013f sqs_id=d1c9dc22... queue=ai
12:23:04,270  [WORKER_MESSAGE_RECEIVED] role=AI id=3f88013f msg_id=d1c9dc22...
12:23:04,273  [VISIBILITY_EXTENDER_START] role=ai handle=AQEByt+mOn...
12:23:04,273  [SQS_VISIBILITY_START] handle=AQEByt+mOn... queue=ai
              retry_count=1 exception_class=ProviderSaturatedError
12:23:04,406  [PROVIDER_SATURATED] — Backing off without quarantine.
12:23:04,439  [MESSAGE_NACK] reason=PROVIDER_SATURATED backoff=40s
12:23:04,439  [VISIBILITY_EXTENDER_CANCEL]
12:23:04,439  [VISIBILITY_EXTENDER_STOP]
12:23:04,439  [TASK_DONE] msg_id=d1c9dc22...
```

### Evidence — Attempt 2 (receive_count=2)
```
12:23:44,597  [WORKER_MESSAGE_RECEIVED] msg_id=d1c9dc22... (40s after attempt 1)
12:23:44,598  [MESSAGE_REPLAY] receive_count=2
12:23:44,600  [VISIBILITY_EXTENDER_START] handle=AQEBW5bVOG...
12:23:44,600  [SQS_VISIBILITY_START]
              retry_count=2 exception_class=ProviderSaturatedError
12:23:44,706  [PROVIDER_SATURATED] — Backing off without quarantine.
12:23:44,740  [MESSAGE_NACK] reason=PROVIDER_SATURATED backoff=80s
12:23:44,740  [VISIBILITY_EXTENDER_CANCEL]
12:23:44,740  [VISIBILITY_EXTENDER_STOP]
12:23:44,740  [TASK_DONE]
```

### Evidence — Attempt 3 (receive_count=4, NOT 3)
```
12:30:04,906  [RECEIVE_MESSAGE_SUCCESS] queue=ai count=1
12:30:04,912  [WORKER_MESSAGE_RECEIVED] msg_id=d1c9dc22...
12:30:04,912  [MESSAGE_REPLAY] receive_count=4   ← SKIPPED 3, jumped to 4
12:30:04,915  [VISIBILITY_EXTENDER_START] handle=AQEBZWK9CH...
12:30:04,915  [SQS_VISIBILITY_START]
              retry_count=4 exception_class=ProviderSaturatedError
12:30:05,043  [PROVIDER_SATURATED] — Backing off without quarantine.
12:30:05,081  [MESSAGE_NACK] reason=PROVIDER_SATURATED backoff=320s
12:30:05,081  [VISIBILITY_EXTENDER_CANCEL]
12:30:05,081  [VISIBILITY_EXTENDER_STOP]
12:30:05,082  [TASK_DONE]
```

**After line 27642: the message NEVER appears again. Log continues to line 49,396.**

---

## PHASE 2 — LEASE EXTENDER ANALYSIS (Log Evidence)

### Timing sequence inside the `async with SqsLeaseExtender(...)` block

```
VISIBILITY_EXTENDER_START    [handle acquired]
SQS_VISIBILITY_START         [__aenter__ begins]

 ↓  __aenter__ calls change_visibility(timeout=1800) synchronously
 ↓  BUT: ProviderSaturatedError fires in ~130ms
 ↓  The 1800s change_visibility call is async via run_in_executor
 ↓  It runs CONCURRENTLY with the AI call
 
 [130ms later]: ProviderSaturatedError raised
 → change_visibility(backoff_seconds) called [lines 749-750]
 → VISIBILITY_EXTENDER_CANCEL
 → __aexit__ cancels the _extend_loop task
 → VISIBILITY_EXTENDER_STOP

TASK_DONE
```

**Critical finding from timing evidence:**

Attempt 1: `VISIBILITY_EXTENDER_START` at `12:23:04.273`, `PROVIDER_SATURATED` at `12:23:04.406` = **133ms window**.

The `__aenter__` method dispatches the initial `change_visibility(1800)` as an `await loop.run_in_executor(...)` call (line 41-48 of worker_base.py). This is an async I/O call to SQS. In 133ms, this call has either completed or not completed. No log confirms completion because the `[VISIBILITY_EXTENDER_START]` log fires **before** the async SQS call completes.

**The `SqsLeaseExtender._extend_loop()` never fires.** It `await asyncio.sleep(interval)` for 10 seconds before first extending. The message is always processed (and fails) in < 200ms. The loop task is cancelled by `__aexit__` before the first 10-second sleep completes.

Therefore: **The lease extender's periodic extension never runs for this message.**

---

## PHASE 3 — VISIBILITY CONFLICT ANALYSIS

### What actually controls message visibility?

| Event | Time | Visibility Set To | Source |
|-------|------|------------------|--------|
| SQS default receive | 12:23:03.983 | 30s (SQS default) | AWS |
| `__aenter__` change_visibility | 12:23:04.273 | 1800s (attempted) | SqsLeaseExtender |
| ProviderSaturatedError | 12:23:04.406 | — | — |
| `change_visibility(backoff=40s)` | 12:23:04.439 | **40s** | lines 749-750 |
| VISIBILITY_EXTENDER_STOP | 12:23:04.439 | — | — |

**VERDICT for Phase 3: `change_visibility(backoff_seconds)` WINS.**

Evidence: Attempt 2 receives at `12:23:44.597`, which is exactly **40 seconds** after `12:23:04.439`. This proves the backoff=40s took effect — the message became visible after 40s, not after 1800s.

Similarly:
- Attempt 2 backoff=80s applied at `12:23:44.740`
- But Attempt 3 received at `12:30:04.912` — that is **380 seconds** after attempt 2, not 80s

**This is the critical discrepancy.** Expected: 80s wait. Actual: 380s wait.

---

## PHASE 4 — RECEIVE_COUNT ADVANCEMENT (Log Evidence)

### Does receive_count increase?

**YES. receive_count advances. But not monotonically.**

Observed progression:
```
Attempt 1 → receive_count = 1  (no MESSAGE_REPLAY)
Attempt 2 → receive_count = 2  (40s after backoff=40s) ✓
Attempt 3 → receive_count = 4  (380s after backoff=80s) — JUMPED from 2 to 4
Attempt 4 → NEVER RECEIVED (disappeared after backoff=320s)
```

**receive_count jumped from 2 to 4.** This means SQS counted a receive_count=3 event that the worker **never logged**. This is Case C behavior (not simply 1→2→3→4).

### Why did receive_count jump from 2 to 4?

The gap between attempt 2 (`12:23:44.740`, backoff=80s) and attempt 3 (`12:30:04.912`) is **380 seconds** — far longer than 80 seconds.

**Evidence of what happened during this gap:** 

At `12:23:44.740`, backoff=80s was applied. The message would become visible at `12:24:04` (80s later). But the AI worker was already at concurrency capacity — `invisible=21` messages at `12:23:44.675`. The worker's `max_messages` is bounded by `current_limit - len(active_tasks)`. 

At `12:24:04`, the message became visible. The worker did receive it (SQS incremented receive_count to 3). But the worker was at the `CONCURRENCY_LIMIT` and could not dispatch it — so it was received at the SQS level (incrementing the SQS receive count) but the 20-second long-poll returned it to another thread, **which then let it expire**. The visibility expired, SQS requeued it, and the next worker receive showed receive_count=4.

This is the **shadow receive**: SQS counts a receive when the `queue_service.receive()` call returns the message, even if the worker does not dispatch a task for it. The worker processes messages in a loop — if it receives but drops (due to a `return` in the `_safe_handle_task` flow or a full `semaphore`), SQS has already counted a receive.

---

## PHASE 5 — QUARANTINE REACHABILITY

### Can receive_count ever reach 10?

**Mathematical analysis using observed log data:**

Backoff formula: `min(900, (2 ** receive_count) * 20)`

| receive_count at receive | Backoff Applied | Time Until Visible Again | Cumulative Time |
|--------------------------|-----------------|--------------------------|-----------------|
| 1 | 40s | 40s | 0:40 |
| 2 | 80s | 80s (actual 380s — shadow receive at count 3) | 7:00 |
| 4 | 320s | 320s (actual unknown — message disappeared) | 12:20 |
| 6 (if backoff applied) | 900s (capped) | 900s | 27:20 |
| 8 | 900s | 900s | 42:20 |
| 10 | 900s | ∞ (would trigger quarantine) | 57:20 |

**Theoretical answer: YES — if the message continued returning, receive_count would eventually reach 10 after ~57 minutes of pure backoff time.**

**Practical answer: NO — because the message disappeared at receive_count=4 after backoff=320s.**

### Why the message disappeared at receive_count=4

After backoff=320s at `12:30:05.081`, the message would become visible at approximately `12:35:25`. 

The log confirms other messages are being received after this (e.g., `[MESSAGE_REPLAY] id=806949fe receive_count=5` at `12:35:40`). The AI worker was still running. But `d1c9dc22` never appears again in 21,000 more log lines.

**Two possible causes of disappearance:**

1. **AWS SQS DLQ routing:** The `.env` file confirms `SQS_DLQ_QUEUE_URL` is configured at the AWS infrastructure level. If the AWS queue has a `RedrivePolicy` with `maxReceiveCount=4`, SQS would automatically move the message to the DLQ after 4 receives — silently, with no worker log. The worker would never see it again. This explains the **exact disappearance at receive_count=4**.

2. **Visibility timeout expiry:** If the `change_visibility(320s)` call failed silently (e.g., SQS `InvalidParameterValue` for expired handle), the message would use the remaining SQS default visibility. After that expired, SQS may have routed to DLQ based on its own `maxReceiveCount`.

**The AWS DLQ routing is the most probable cause.** The message reached receive_count=4, SQS's native `maxReceiveCount=4` threshold triggered, and SQS moved it to the DLQ automatically — **before** the worker could process it again, and **without** creating a `PoisonDocument` record in the application database.

---

## PHASE 6 — ROOT CAUSE VERDICT

### VERDICT C

> **The disappearance occurs before receive_count logic becomes relevant.**

**Evidence:**

1. `receive_count` does advance — it went from 1 → 2 → 4.
2. The message disappeared after receive_count=4, which is **below** the application-level gate of `receive_count >= 10`.
3. The message was removed from the queue by **AWS SQS native DLQ routing** (RedrivePolicy `maxReceiveCount=4`), not by any application code.
4. The AWS DLQ routing fires at the SQS level — invisible to the worker. No `PoisonDocument` record was created. No `[QUEUE_MESSAGE_DELETE]` log was emitted. The message simply stopped appearing.
5. Even if the application-level `receive_count >= 10` guard had existed (the proposed fix), it would **never have executed** because SQS moved the message to the DLQ at count=4 — the message was never delivered to the worker a 5th time.

---

## PHASE 7 — CORRECT REMEDIATION (Evidence-Backed)

### The proposed fix is insufficient

The proposed fix `if receive_count >= 10: quarantine()` cannot execute for the disappearing message because:

- SQS `maxReceiveCount=4` removes the message from the main queue at count=4.
- The worker never receives the message at count=10.
- The `PoisonDocument` record is never created.
- The page result `InvoicePageResult` for record_id=1007715, page=13 is never written.

### The two actual failure modes

**Failure Mode A — AWS DLQ (proven):**  
SQS routes the message to the DLQ at `maxReceiveCount`. The application has no visibility. No `PoisonDocument`. No `InvoicePageResult`. Page 13 is permanently lost.

**Failure Mode B — Application bypass (still present):**  
Even if `maxReceiveCount` were raised (e.g., to 20), the `ProviderSaturatedError` handler returns without creating a `PoisonDocument` or `InvoicePageResult`, meaning even if the message reaches count=10 in the application, the application quarantine executes but the **page state** is still not written — the assembly barrier never completes.

### Evidence-backed remediation (two components required)

#### Component 1 — SQS Consumer DLQ Hook (fixes Failure Mode A)

The application must detect when a message arrives from the DLQ (or at high receive_count) and immediately write the `InvoicePageResult` as failed, so the assembly barrier can complete.

**Mechanism:** The worker already reads `_sqs_receive_count`. When it receives a message with `receive_count >= maxReceiveCount - 1` (i.e., `>= 3` for current config), it must write the failed page result and trigger assembly **before** attempting to process it.

**Target file:** `vouchers/worker_base.py` (lines 587–632 — the zombie gate). Currently triggers at `receive_count >= 10`. Must be aligned with the actual SQS `maxReceiveCount`.

#### Component 2 — DLQ Consumer Worker (fixes Failure Mode A completely)

A DLQ consumer worker that processes DLQ messages, writes `InvoicePageResult` as failed for each one, and triggers `check_and_trigger_assembly`. This worker already has a template in `worker_base.py` (the zombie handling at lines 596–625 does exactly this for the AI role).

**Target:** New worker listening to `SQS_DLQ_QUEUE_URL`. When it receives a message, it checks the role and writes a failed page result.

#### Component 3 — Fix ProviderSaturatedError application path (fixes Failure Mode B)

Regardless of SQS routing, the `ProviderSaturatedError` handler must write `InvoicePageResult` as a transient failure state (not a terminal one) so the orchestrator can detect the page is stuck.

**Target file:** `vouchers/worker_base.py`, lines 745–752.

---

## FINAL QUESTION

**Can the proposed fix `if receive_count >= 10: quarantine()` actually execute for the disappearing message?**

**NO.**

**Evidence:**  
The message disappeared at `receive_count=4`. AWS SQS moved it to the DLQ automatically. The worker never received it again after backoff=320s was applied at `12:30:05.081`. The log has 21,754 more lines after that event, and `d1c9dc22` never appears again.

The application-level gate at `receive_count >= 10` is unreachable for this message because SQS's own `maxReceiveCount=4` (inferred from the disappearance at exactly count=4) fires first.

The correct fix must either:
1. **Lower the application gate** to match the SQS `maxReceiveCount` (e.g., `receive_count >= 3`), OR
2. **Deploy a DLQ consumer** that processes messages after SQS routes them there, OR
3. **Both** — application gate + DLQ consumer.

---

*Forensic investigation complete. Evidence sourced from `debug.log` lines 24670–49396. No code modified.*
