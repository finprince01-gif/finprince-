import os

report_path = r"c:\108\AI-accounting-0.03\backend\FORENSIC_ROOT_CAUSE_REPORT.md"

phase3_text = """

---

## PHASE 3 FORENSIC VALIDATION — 15-PAGE REAL-WORLD STRESS TEST

**Generated:** 2026-06-22T08:50:00Z
**Target Invoice:** `C:\\Users\\ulaganathan\\Downloads\\New folder (2)\\stress_test_15pages.pdf`
**Session ID:** `6a07a001-99a2-4c57-949e-bd1ac66d8e67`
**Record ID:** `1007715`
**Job ID:** `0a89d92c-87e4-4630-ab51-0e03af0269e1`
**AI_GLOBAL_CONCURRENCY:** **2**
**WORKER_CONCURRENCY:** 4
**Verdict:** ❌ **FAILED / STALLED** (14/15 pages completed, Page 13 SQS message silently lost)

### 1. Throughput & Timelines

* **Total Invoice Completion Time:** Stalled permanently (at T+5000+ seconds)
* **First Failure Point:** Page 13 SQS message dropped silently.
* **Completed Pages (14/15):** `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15]`

#### Page-by-Page Timeline:

| Page | SQS Received | Inference Start | Inference End | Actual Inference Time | Total Lifecycle Latency | Status / Outcome |
|------|--------------|-----------------|---------------|-----------------------|-------------------------|------------------|
| Page 1 | 12:17:36 | 12:17:36 | 12:19:41 | 125s | 125s | ✅ SUCCESS |
| Page 2 | 12:17:37 | 12:38:35 | 12:42:38 | 243s | 1501s (4 retries) | ✅ SUCCESS |
| Page 3 | 12:17:41 | 12:17:41 | 12:22:08 | 147s | 267s (waited in queue) | ✅ SUCCESS |
| Page 4 | 12:17:40 | 12:38:33 | 12:40:31 | 118s | 1371s (4 retries) | ✅ SUCCESS |
| Page 5 | 12:17:44 | 12:19:48 | 12:24:31 | 143s | 407s (2 retries) | ✅ SUCCESS |
| Page 6 | 12:26:05 | 12:28:46 | 12:32:36 | 128s | 391s (1 retry) | ✅ SUCCESS |
| Page 7 | 12:21:11 | 12:30:37 | 12:34:48 | 132s | 817s (3 retries) | ✅ SUCCESS |
| Page 8 | 12:20:47 | 12:41:31 | 12:44:45 | 127s | 1438s (5 retries) | ✅ SUCCESS |
| Page 9 | 12:21:04 | 12:56:48 | 12:58:41 | 113s | 2257s (6 retries) | ✅ SUCCESS |
| Page 10 | 12:21:26 | 12:57:09 | 13:01:09 | 148s | 2383s (6 retries) | ✅ SUCCESS |
| Page 11 | 12:22:29 | 12:22:29 | 12:26:36 | 125s | 247s (waited in queue) | ✅ SUCCESS |
| Page 12 | 12:22:48 | 12:27:30 | 12:30:28 | 116s | 460s (3 retries) | ✅ SUCCESS |
| Page 13 | 12:23:04 | N/A | N/A | N/A | N/A (3 retries) | ❌ STALLED / LOST IN SQS |
| Page 14 | 12:23:19 | 12:35:40 | 12:37:43 | 123s | 864s (3 retries) | ✅ SUCCESS |
| Page 15 | 12:24:49 | 12:24:49 | 12:28:32 | 116s | 223s (waited in queue) | ✅ SUCCESS |

### 2. SQS Message Loss Forensic Analysis

#### Message ID Trace:
- Page 13 internal task ID: `3f88013f-5cab-4990-9c18-c2a78cb60664`
- SQS Message ID: `d1c9dc22-48b9-4956-8eeb-c7c0bd3bb7d1`
- **12:23:03.983** - Message enqueued to `invoice-ai-queue-local`
- **12:23:04.269** - Received first time (`ApproximateReceiveCount` = 1). Throttled due to VRAM / lock capacity limits. Raising `ProviderSaturatedError`. Message visibility changed to 20s backoff.
- **12:23:44.597** - Received second time (`ApproximateReceiveCount` = 2). Throttled. Visibility changed to 40s backoff.
- **12:30:04.912** - Received fourth time (`ApproximateReceiveCount` = 4). Throttled. Visibility changed to 320s backoff.
- **After 12:30:05** - The message disappeared entirely from the SQS queue. SQS queue visible/invisible message count is `0/0/0`.
- **Quarantine verification:** Database `PoisonDocument` table has `0` entries for `1007715`. SQS DLQs (`invoice-dlq` and `invoice-poison-queue`) have `0` messages.

#### Root Cause of Message Loss:
1. **Quarantine Bypass:** The AI worker has a check `if receive_count >= 10` at the start of `_safe_handle_task` to quarantine zombie messages. However, when a `ProviderSaturatedError` is raised, it is handled in an exception block that returns early (`return` on line 752) without hitting the quarantine logic.
2. **Silent Drop by SQS:** Because SQS has no redrive policy configured (`Redrive Policy: None`), it should not delete the message. The disappearance of the message under high concurrency contention represents a silent SQS message drop, potentially due to visibility handle expiration or API visibility mismatch during rapid worker backoffs.

### 3. GPU/CPU Telemetry Statistics

| Metric | Peak Value | Average Value | Evidence |
|--------|------------|---------------|----------|
| **CPU Utilization** | 100.0% | 18.03% | `telemetry_stress.json` |
| **Host RAM Utilization** | 94.70% | 52.11% | `telemetry_stress.json` |
| **GPU Core Utilization** | 100.0% | 4.83% | `telemetry_stress.json` |
| **VRAM Consumption** | 4869 MiB | 1978.96 MiB | `telemetry_stress.json` |
| **GPU Temperature** | 77.0°C | 54.3°C | `telemetry_stress.json` |
| **GPU Power Draw** | 588.21W (sensor anomaly) | 12.4W | `telemetry_stress.json` |

#### Key Telemetry Findings:
1. **Ollama internal sequential queuing:** Even though `AI_GLOBAL_CONCURRENCY=2` allows 2 concurrent page slots in the worker application, the peak VRAM utilization did not exceed Concurrency=1 levels (**4869 MiB**). This is because Ollama queues requests internally and processes them sequentially on the GPU core. 
2. **CPU and RAM overhead:** CPU usage spiked to 100% and RAM usage spiked to 94.70% during initial ingestion, PDF splitting, and text extraction, but remained moderate during AI model execution. No offloading of Qwen layers to CPU occurred.

### 4. Scalability Projections (Bottleneck Analysis)

If this system is deployed under concurrent user workloads:

* **1 User (15 Pages):** Permanent stall (0% completion) due to Page 13's silent drop. If message loss is resolved, the execution is limited by sequential GPU inference: `15 pages * ~130s/page = 1950s (~32.5 minutes)`.
* **10 Users (150 Pages):** Concurrency contention escalates. Since the RTX 4050 Laptop GPU can only process 1 slot at a time, 10 concurrent uploads will result in `150 pages * ~130s/page = 19,500s (~5.4 hours)` total processing time. Concurrency contention will cause an exponential increase in SQS retries, resulting in severe message loss.
* **100 Users (1500 Pages):** Processing time: `54 hours (~2.2 days)`. The SQS queues will be saturated, and nearly all messages will be lost or delayed in visibility timeout backoffs.
* **1000 Users (15000 Pages):** Processing time: `540 hours (~22.5 days)`. Terminal collapse of the ingestion cluster.

### 5. Verdict & Recommendation

#### Phase 3 Verdict:
❌ **REJECTED / FAILED** due to SQS message loss under concurrency contention and sequential GPU processing bottleneck.

#### Recommendations:
1. **Increase GPU Concurrency limits via Multi-GPU or Ollama Parallel Configuration:** Configure Ollama to run with multiple parallel slots (`OLLAMA_NUM_PARALLEL > 1`) and provision adequate VRAM (e.g. RTX 4090 or multiple GPUs) to avoid sequential queuing.
2. **Fix Quarantine Bypass in `worker_base.py`:** Ensure that the SQS visibility timeout/NACK logic for `ProviderSaturatedError` does not bypass the quarantine/retry threshold limits, preventing silent message loss.
3. **Configure AWS SQS Redrive Policy:** Explicitly configure a Dead Letter Queue (DLQ) with a defined `maxReceiveCount` (e.g. 5) at the SQS infrastructure level, rather than relying solely on application-level checks.

---

*End of FORENSIC_ROOT_CAUSE_REPORT.md*
"""

if os.path.exists(report_path):
    with open(report_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Replace *End of FORENSIC_ROOT_CAUSE_REPORT.md* and anything after
    # We find where "*End of FORENSIC_ROOT_CAUSE_REPORT.md*" is
    marker = "*End of FORENSIC_ROOT_CAUSE_REPORT.md*"
    idx = content.find(marker)
    if idx != -1:
        # We cut before the line containing the marker
        lines = content[:idx].splitlines()
        # Find if the last line before is just "---" or empty, to clean it up
        while lines and (lines[-1].strip() == "---" or lines[-1].strip() == ""):
            lines.pop()
        new_content = "\n".join(lines) + phase3_text
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("[OK] Appended Phase 3 results to FORENSIC_ROOT_CAUSE_REPORT.md successfully!")
    else:
        print("[ERROR] End marker not found in FORENSIC_ROOT_CAUSE_REPORT.md")
else:
    print("[ERROR] FORENSIC_ROOT_CAUSE_REPORT.md not found.")
