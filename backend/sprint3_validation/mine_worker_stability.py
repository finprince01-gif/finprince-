# -*- coding: utf-8 -*-
"""
Phase 3c: Worker & Queue Stability Miner
==========================================
Greps all worker log files and debug.log for:

  [WORKER_PROCESS_READY]       - Worker boot
  [WORKER_CRASH_DETECTED]      - Worker crash/restart
  [WORKER_LOCK_REFRESH]        - Lock refresh events
  [QUEUE_PUSH_SUCCESS]         - Queue push success
  [QUEUE_FORWARD_SUCCESS]      - Queue forward success
  [MESSAGE_DLQ_REDIRECT]       - DLQ routing
  [ZOMBIE_MESSAGE_DETECTED]    - Zombie message
  [SLOT_ACQUIRED]              - AI slot acquired
  [SLOT_RELEASED]              - AI slot released

Amendment 3 + 4: Captures all required worker/queue events.
No source code modifications. Read-only observer.
"""
import os
import re
import json
from datetime import datetime, timezone
from collections import defaultdict

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "reports")
os.makedirs(OUTPUT_DIR, exist_ok=True)

LOG_DIR = os.path.join(BACKEND_DIR, "logs")
WORKER_LOGS = {
    "ingestion": os.path.join(LOG_DIR, "ingestion.log"),
    "ai": os.path.join(LOG_DIR, "ai.log"),
    "assembly": os.path.join(LOG_DIR, "assembly.log"),
    "finalize": os.path.join(LOG_DIR, "finalize.log"),
    "export": os.path.join(LOG_DIR, "export.log"),
    "materialization": os.path.join(LOG_DIR, "materialization.log"),
    "worker": os.path.join(LOG_DIR, "worker.log"),
    "cluster": os.path.join(LOG_DIR, "cluster.log"),
    "debug": os.path.join(LOG_DIR, "debug.log"),
}

PATTERNS = {
    "worker_ready": re.compile(r"\[WORKER_PROCESS_READY\].*?role=(\S+).*?pid=(\d+)"),
    "worker_crash": re.compile(r"\[WORKER_CRASH_DETECTED\].*?([Ww]atchdog for\s+)?(\S+)\s+exited"),
    "worker_lock_refresh": re.compile(r"\[WORKER_LOCK_REFRESH\]"),
    "queue_push_success": re.compile(r"\[QUEUE_PUSH_SUCCESS\]\s+(?:queue=(\S+)|id=(\S+))"),
    "queue_forward_success": re.compile(r"\[QUEUE_FORWARD_SUCCESS\].*?(?:target_queue=(\S+))?"),
    "dlq_redirect": re.compile(r"\[MESSAGE_DLQ_REDIRECT\]|DLQ_REJECT|DLQ_MOVE"),
    "zombie_message": re.compile(r"\[ZOMBIE_MESSAGE_DETECTED\]"),
    "slot_acquired": re.compile(r"\[SLOT_ACQUIRED\]\s+record_id=(\S+)\s+page_number=(\d+)"),
    "slot_released": re.compile(r"\[SLOT_RELEASED\]\s+record_id=(\S+)\s+page_number=(\d+)"),
    "upload_accepted": re.compile(r"\[UPLOAD_ACCEPTED\]\s+file=(\S+)\s+job=(\S+)"),
    "record_created": re.compile(r"\[RECORD_CREATED\]\s+id=(\S+)\s+session=(\S+)"),
    "downstream_success": re.compile(r"\[DOWNSTREAM_ENQUEUE_SUCCESS\]"),
    "downstream_failed": re.compile(r"\[DOWNSTREAM_ENQUEUE_FAILED\]"),
}

TIMESTAMP_PAT = re.compile(r"^(?:INFO|DEBUG|WARNING|ERROR|CRITICAL) (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})")


def scan_log_file(log_path: str, log_name: str) -> dict:
    """Scan a single log file and return event counts."""
    events = defaultdict(int)
    crashes = []
    dlq_events = []
    push_by_queue = defaultdict(int)

    if not os.path.isfile(log_path):
        return {"file": log_path, "status": "NOT_FOUND", "events": {}}

    file_size = os.path.getsize(log_path)
    if file_size == 0:
        return {"file": log_path, "status": "EMPTY", "events": {}, "size_bytes": 0}

    with open(log_path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line_s = line.strip()

            if PATTERNS["worker_ready"].search(line_s):
                events["worker_ready"] += 1

            m_crash = PATTERNS["worker_crash"].search(line_s)
            if m_crash:
                events["worker_crash"] += 1
                ts_m = TIMESTAMP_PAT.match(line_s)
                crashes.append({
                    "timestamp": ts_m.group(1) if ts_m else "",
                    "raw": line_s[:200],
                })

            if PATTERNS["worker_lock_refresh"].search(line_s):
                events["worker_lock_refresh"] += 1

            m_push = PATTERNS["queue_push_success"].search(line_s)
            if m_push:
                events["queue_push_success"] += 1
                push_by_queue[m_push.group(1)] += 1

            m_fwd = PATTERNS["queue_forward_success"].search(line_s)
            if m_fwd:
                events["queue_forward_success"] += 1

            m_dlq = PATTERNS["dlq_redirect"].search(line_s)
            if m_dlq:
                events["dlq_redirect"] += 1
                ts_m = TIMESTAMP_PAT.match(line_s)
                dlq_events.append({
                    "timestamp": ts_m.group(1) if ts_m else "",
                    "raw": line_s[:300],
                })

            if PATTERNS["zombie_message"].search(line_s):
                events["zombie_message"] += 1

            if PATTERNS["slot_acquired"].search(line_s):
                events["slot_acquired"] += 1

            if PATTERNS["slot_released"].search(line_s):
                events["slot_released"] += 1

            if PATTERNS["upload_accepted"].search(line_s):
                events["upload_accepted"] += 1

            if PATTERNS["record_created"].search(line_s):
                events["record_created"] += 1

            if PATTERNS["downstream_success"].search(line_s):
                events["downstream_enqueue_success"] += 1

            if PATTERNS["downstream_failed"].search(line_s):
                events["downstream_enqueue_failed"] += 1

    return {
        "log": log_name,
        "file": log_path,
        "status": "OK",
        "size_bytes": file_size,
        "events": dict(events),
        "crashes": crashes[:20],
        "dlq_events": dlq_events[:20],
        "push_by_queue": dict(push_by_queue),
    }


def parse_worker_stability():
    print(f"\n{'='*60}")
    print("SPRINT 3 — PHASE 3c: WORKER & QUEUE STABILITY MINING")
    print(f"{'='*60}")

    log_results = {}
    for name, path in WORKER_LOGS.items():
        print(f"  Scanning {name}.log ...", end=" ", flush=True)
        result = scan_log_file(path, name)
        log_results[name] = result
        status = result.get("status", "?")
        events = result.get("events", {})
        size_kb = result.get("size_bytes", 0) / 1024
        print(f"{status} ({size_kb:.0f} KB) | "
              f"pushes={events.get('queue_push_success',0)} "
              f"crashes={events.get('worker_crash',0)} "
              f"dlq={events.get('dlq_redirect',0)}")

    # Aggregate across all logs
    agg = defaultdict(int)
    all_crashes = []
    all_dlq = []
    for r in log_results.values():
        for k, v in r.get("events", {}).items():
            agg[k] += v
        all_crashes.extend(r.get("crashes", []))
        all_dlq.extend(r.get("dlq_events", []))

    data = {
        "mined_at": datetime.now(timezone.utc).isoformat(),
        "aggregate_events": dict(agg),
        "log_results": log_results,
        "all_crashes": all_crashes[:30],
        "all_dlq_events": all_dlq[:30],
        "summary": {
            "total_worker_starts": agg["worker_ready"],
            "total_worker_crashes": agg["worker_crash"],
            "total_queue_pushes": agg["queue_push_success"],
            "total_dlq_events": agg["dlq_redirect"],
            "total_zombie_messages": agg["zombie_message"],
            "total_lock_refreshes": agg["worker_lock_refresh"],
            "total_upload_accepted": agg["upload_accepted"],
            "total_records_created": agg["record_created"],
            "total_downstream_success": agg["downstream_enqueue_success"],
            "total_downstream_failed": agg["downstream_enqueue_failed"],
            "total_slots_acquired": agg["slot_acquired"],
            "total_slots_released": agg["slot_released"],
        }
    }

    out_path = os.path.join(OUTPUT_DIR, "WORKER_STABILITY_RAW.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print()
    print(f"  Aggregate summary:")
    for k, v in data["summary"].items():
        print(f"    {k:40s}: {v}")
    print(f"[OK] Worker stability data written: {out_path}")

    return data


if __name__ == "__main__":
    parse_worker_stability()
