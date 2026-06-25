# -*- coding: utf-8 -*-
"""
Phase 3e: Redis Forensics Miner
=================================
Captures real-time Redis latency, command stats, key counts,
lock contention, and barrier timing data.

Amendment 3: Extends log mining with barrier and lock metrics.
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

LOG_PATH = os.path.join(BACKEND_DIR, "logs", "debug.log")

PATTERNS = {
    "barrier_update": re.compile(r"\[BARRIER_UPDATE\].*?record=(\S+).*?latency_ms=([\d.]+)"),
    "barrier_ready": re.compile(r"\[BARRIER_READY\]\s+record=(\S+)"),
    "barrier_timeout": re.compile(r"\[BARRIER_TIMEOUT\]\s+record=(\S+).*?missing_pages=(\[.*?\])"),
    "lock_acquired": re.compile(r"\[FINALIZE_OWNER_GRANTED\]\s+record=(\S+)"),
    "lock_rejected": re.compile(r"\[FINALIZE_OWNER_REJECTED\]\s+record=(\S+)"),
    "slot_acquired": re.compile(r"\[SLOT_ACQUIRED\].*?record_id=(\S+).*?current_window_count=(\d+)"),
    "slot_released": re.compile(r"\[SLOT_RELEASED\].*?record_id=(\S+)"),
    "fair_share_throttle": re.compile(r"\[FAIR_SHARE_THROTTLE\]\s+tenant=(\S+)"),
    "redis_op_err": re.compile(r"\[REDIS_OP_ERR\]"),
    "redis_disconnected": re.compile(r"\[REDIS_DISCONNECTED\]"),
    "redis_recovered": re.compile(r"\[REDIS_RECOVERED\]"),
    "barrier_corrupt": re.compile(r"\[BARRIER_CORRUPTION_DETECTED\]"),
    "redis_latency": re.compile(r"\[REDIS_STATE_MUTATION_ENTER\].*?record=(\S+)"),
    "backward_transition": re.compile(r"\[BACKWARD_TRANSITION_REJECTED\].*?record=(\S+)"),
    "lifecycle_rejected": re.compile(r"\[LIFECYCLE_TRANSITION_REJECTED\].*?record=(\S+).*?requested_state=(\S+)"),
    "orphan_found": re.compile(r"\[ORPHAN_FOUND\]\s+task=(\S+)"),
    "window_leak": re.compile(r"\[WINDOW_LEAK_DETECTED\]\s+record=(\S+)\s+page=(\d+)"),
}


def capture_live_redis_latency() -> dict:
    """Query Redis LATENCY LATEST and INFO commandstats in real-time."""
    try:
        import redis as redis_lib
        from dotenv import load_dotenv
        load_dotenv(os.path.join(BACKEND_DIR, ".env"))
        host = os.getenv("REDIS_HOST", "localhost")
        port = int(os.getenv("REDIS_PORT", "6379"))
        password = os.getenv("REDIS_PASSWORD") or None
        db = int(os.getenv("REDIS_DB", "0"))

        r = redis_lib.Redis(host=host, port=port, password=password,
                            db=db, decode_responses=True, socket_timeout=5)

        # LATENCY LATEST
        try:
            latency_latest = r.execute_command("LATENCY", "LATEST")
        except Exception:
            latency_latest = []

        # LATENCY HISTORY for 'command'
        try:
            latency_history = r.execute_command("LATENCY", "HISTORY", "command")
        except Exception:
            latency_history = []

        # INFO commandstats
        cmd_stats = r.info("commandstats")
        # Top 10 by call count
        top_cmds = sorted(
            [(k.replace("cmdstat_", ""), v) for k, v in cmd_stats.items()],
            key=lambda x: x[1].get("calls", 0), reverse=True
        )[:10]

        # Slow log
        try:
            slow_log = r.slowlog_get(10)
            slow_log_data = [
                {"id": s["id"], "duration_us": s["duration"],
                 "command": " ".join(s["command"][:3]) if isinstance(s.get("command"), list) else str(s.get("command", ""))[:60]}
                for s in slow_log
            ]
        except Exception:
            slow_log_data = []

        return {
            "status": "OK",
            "latency_latest": str(latency_latest)[:500],
            "top_commands_by_calls": [
                {"command": cmd, "calls": v.get("calls", 0),
                 "usec_per_call": round(v.get("usec_per_call", 0), 2)}
                for cmd, v in top_cmds
            ],
            "slow_log": slow_log_data,
        }
    except Exception as e:
        return {"status": "ERROR", "error": str(e)}


def parse_redis_forensics():
    print(f"\n{'='*60}")
    print("SPRINT 3 — PHASE 3e: REDIS FORENSICS MINING")
    print(f"{'='*60}")

    # Live Redis capture first
    print("  Capturing live Redis metrics ...")
    live_metrics = capture_live_redis_latency()

    print(f"  Scanning debug.log ...")

    events = defaultdict(int)
    barrier_latencies = []
    barrier_timeouts = []
    lock_contention = []
    window_leaks = []
    lifecycle_rejections = []

    if os.path.isfile(LOG_PATH):
        with open(LOG_PATH, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line_s = line.strip()

                m = PATTERNS["barrier_update"].search(line_s)
                if m:
                    events["barrier_updates"] += 1
                    try:
                        barrier_latencies.append(float(m.group(2)))
                    except ValueError:
                        pass
                    continue

                if PATTERNS["barrier_ready"].search(line_s):
                    events["barrier_ready"] += 1
                    continue

                m = PATTERNS["barrier_timeout"].search(line_s)
                if m:
                    events["barrier_timeout"] += 1
                    barrier_timeouts.append({
                        "record": m.group(1),
                        "missing_pages": m.group(2)[:100],
                    })
                    continue

                if PATTERNS["lock_acquired"].search(line_s):
                    events["lock_acquired"] += 1
                    continue

                if PATTERNS["lock_rejected"].search(line_s):
                    events["lock_rejected"] += 1
                    lock_contention.append(line_s[:150])
                    continue

                if PATTERNS["fair_share_throttle"].search(line_s):
                    events["fair_share_throttle"] += 1
                    continue

                if PATTERNS["redis_op_err"].search(line_s):
                    events["redis_op_errors"] += 1
                    continue

                if PATTERNS["redis_disconnected"].search(line_s):
                    events["redis_disconnected"] += 1
                    continue

                if PATTERNS["redis_recovered"].search(line_s):
                    events["redis_recovered"] += 1
                    continue

                if PATTERNS["barrier_corrupt"].search(line_s):
                    events["barrier_corruption"] += 1
                    continue

                if PATTERNS["backward_transition"].search(line_s):
                    events["backward_transitions"] += 1
                    continue

                m = PATTERNS["lifecycle_rejected"].search(line_s)
                if m:
                    events["lifecycle_rejections"] += 1
                    lifecycle_rejections.append({
                        "record": m.group(1),
                        "requested_state": m.group(2),
                        "raw": line_s[:200],
                    })
                    continue

                m = PATTERNS["window_leak"].search(line_s)
                if m:
                    events["window_leaks"] += 1
                    window_leaks.append({
                        "record": m.group(1),
                        "page": m.group(2),
                    })
                    continue

                if PATTERNS["orphan_found"].search(line_s):
                    events["orphaned_tasks"] += 1
                    continue

    # Latency stats
    def latency_stats(vals):
        if not vals:
            return {"count": 0, "avg": 0, "p50": 0, "p95": 0, "p99": 0, "max": 0}
        import statistics
        s = sorted(vals)
        n = len(s)
        return {
            "count": n,
            "avg": round(sum(s) / n, 2),
            "p50": round(statistics.median(s), 2),
            "p95": round(s[min(int(n * 0.95), n - 1)], 2),
            "p99": round(s[min(int(n * 0.99), n - 1)], 2),
            "max": round(max(s), 2),
        }

    data = {
        "mined_at": datetime.now(timezone.utc).isoformat(),
        "live_redis_metrics": live_metrics,
        "log_events": dict(events),
        "barrier_latency_ms": latency_stats(barrier_latencies),
        "barrier_timeouts": barrier_timeouts[:10],
        "lock_contention_events": lock_contention[:10],
        "lifecycle_rejections": lifecycle_rejections[:20],
        "window_leak_events": window_leaks[:20],
        "summary": {
            "total_barrier_updates": events.get("barrier_updates", 0),
            "total_barrier_timeouts": events.get("barrier_timeout", 0),
            "total_lock_acquisitions": events.get("lock_acquired", 0),
            "total_lock_rejections": events.get("lock_rejected", 0),
            "total_fair_share_throttles": events.get("fair_share_throttle", 0),
            "total_redis_errors": events.get("redis_op_errors", 0),
            "total_disconnects": events.get("redis_disconnected", 0),
            "total_reconnects": events.get("redis_recovered", 0),
            "total_backward_transitions": events.get("backward_transitions", 0),
            "total_lifecycle_rejections": events.get("lifecycle_rejections", 0),
            "total_window_leaks": events.get("window_leaks", 0),
            "total_orphaned_tasks": events.get("orphaned_tasks", 0),
            "barrier_corruption_events": events.get("barrier_corruption", 0),
        }
    }

    out_path = os.path.join(OUTPUT_DIR, "REDIS_FORENSICS_RAW.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"  Barrier latency p50={data['barrier_latency_ms']['p50']} ms  "
          f"p99={data['barrier_latency_ms']['p99']} ms  "
          f"count={data['barrier_latency_ms']['count']}")
    for k, v in data["summary"].items():
        if v > 0:
            print(f"  {k:40s}: {v}")
    print(f"[OK] Redis forensics written: {out_path}")

    return data


if __name__ == "__main__":
    parse_redis_forensics()
