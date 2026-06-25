# -*- coding: utf-8 -*-
"""
Phase 3d: Pipeline Timing Log Miner  (Amendment 2)
=====================================================
Greps debug.log for all pipeline stage timestamps and computes
per-invoice per-stage duration breakdowns.

Log events mined (Amendment 2 + 3):
  [SYNC_INGESTION_START]
  [OCR_RESULT]                      → OCR end
  [QWEN_REQUEST_START]              → AI start  (actual log tag from qwen_provider.py)
  [QWEN_REQUEST_COMPLETE]           → AI end
  [ASSEMBLY_START]
  [ASSEMBLY_COMPLETE]
  [FINALIZE_START]
  [FINALIZE_COMPLETE]

Output: PIPELINE_TIMING_RAW.json
No source code modifications. Read-only observer.
"""
import os
import re
import json
import statistics
from datetime import datetime, timezone
from collections import defaultdict

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "reports")
os.makedirs(OUTPUT_DIR, exist_ok=True)

LOG_PATH = os.path.join(BACKEND_DIR, "logs", "debug.log")

TS_PAT = re.compile(r"^(?:INFO|DEBUG|WARNING|ERROR|CRITICAL) (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3})")

STAGE_PATTERNS = {
    "ingestion_start": re.compile(r"\[SYNC_INGESTION_START\].*?record[_\-]id[=:](\S+)"),
    "ocr_complete": re.compile(r"\[OCR_RESULT\]\s+page=(\d+).*?duration_ms=(\d+)"),
    "ai_start": re.compile(r"\[QWEN_REQUEST_START\].*?(?:record[_\-]id[=:](\S+))?"),
    "ai_complete": re.compile(r"\[QWEN_REQUEST_COMPLETE\].*?latency=(?P<lat>[\d.]+)s"),
    "assembly_start": re.compile(r"\[ASSEMBLY_START\].*?record[_\-]id[=:](\S+)"),
    "assembly_complete": re.compile(r"\[ASSEMBLY_COMPLETE\].*?record[_\-]id[=:](\S+)"),
    "finalize_start": re.compile(r"\[FINALIZE_START\].*?record[_\-]id[=:](\S+)"),
    "finalize_complete": re.compile(r"\[FINALIZE_COMPLETE\].*?record[_\-]id[=:](\S+)"),
    # Alternative / pipeline-level tags
    "ingestion_start_alt": re.compile(r"\[UPLOAD_ACCEPTED\].*?file=(\S+)"),
    "barrier_complete": re.compile(r"\[BARRIER_COMPLETE\]\s+record=(\S+)"),
    "ai_duration_direct": re.compile(r"\[QWEN_INFERENCE_PERF\].*?latency_s=(?P<lat>[\d.]+).*?total_tokens=(?P<tok>\d+)"),
}


def ts_to_epoch(ts_str: str) -> float:
    """Convert 'YYYY-MM-DD HH:MM:SS,mmm' to epoch float."""
    try:
        dt = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S,%f")
        return dt.timestamp()
    except ValueError:
        try:
            dt = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
            return dt.timestamp()
        except ValueError:
            return 0.0


def parse_pipeline_timing():
    print(f"\n{'='*60}")
    print("SPRINT 3 — PHASE 3d: PIPELINE TIMING MINING (Amendment 2)")
    print(f"{'='*60}")

    if not os.path.isfile(LOG_PATH):
        print(f"[WARN] Log file not found: {LOG_PATH}")
        return {}

    print(f"Log file : {LOG_PATH} ({os.path.getsize(LOG_PATH)/1024/1024:.1f} MB)")
    print("Scanning (this may take 1-2 min for large logs) ...")

    # Per-record event timestamps
    record_events: dict = defaultdict(lambda: defaultdict(list))
    ai_durations = []      # Direct [QWEN_INFERENCE_PERF] durations
    ocr_durations = []     # Direct [OCR_RESULT] durations

    with open(LOG_PATH, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line_s = line.strip()
            ts_m = TS_PAT.match(line_s)
            ts_epoch = ts_to_epoch(ts_m.group(1)) if ts_m else 0.0

            # Ingestion start
            m = STAGE_PATTERNS["ingestion_start"].search(line_s)
            if m:
                record_id = m.group(1).rstrip(",")
                record_events[record_id]["ingestion_start"].append(ts_epoch)
                continue

            # Upload accepted (alt ingestion start)
            m = STAGE_PATTERNS["ingestion_start_alt"].search(line_s)
            if m and "UPLOAD_ACCEPTED" in line_s:
                # We don't have record_id here, just count it
                record_events["_upload"]["ingestion_start"].append(ts_epoch)
                continue

            # OCR result
            m = STAGE_PATTERNS["ocr_complete"].search(line_s)
            if m:
                duration_ms = int(m.group(2))
                ocr_durations.append(duration_ms)
                continue

            # AI inference perf (direct duration)
            m = STAGE_PATTERNS["ai_duration_direct"].search(line_s)
            if m:
                lat_s = float(m.group("lat"))
                ai_durations.append(lat_s * 1000)  # Convert to ms
                continue

            # AI complete
            m = STAGE_PATTERNS["ai_complete"].search(line_s)
            if m:
                lat = float(m.group("lat"))
                record_events["_ai"]["ai_complete"].append({"ts": ts_epoch, "latency_s": lat})
                continue

            # Assembly start
            m = STAGE_PATTERNS["assembly_start"].search(line_s)
            if m:
                record_id = m.group(1).rstrip(",")
                record_events[record_id]["assembly_start"].append(ts_epoch)
                continue

            # Assembly complete
            m = STAGE_PATTERNS["assembly_complete"].search(line_s)
            if m:
                record_id = m.group(1).rstrip(",")
                record_events[record_id]["assembly_complete"].append(ts_epoch)
                continue

            # Finalize start
            m = STAGE_PATTERNS["finalize_start"].search(line_s)
            if m:
                record_id = m.group(1).rstrip(",")
                record_events[record_id]["finalize_start"].append(ts_epoch)
                continue

            # Finalize complete
            m = STAGE_PATTERNS["finalize_complete"].search(line_s)
            if m:
                record_id = m.group(1).rstrip(",")
                record_events[record_id]["finalize_complete"].append(ts_epoch)
                continue

            # Barrier complete (approximate pipeline end)
            m = STAGE_PATTERNS["barrier_complete"].search(line_s)
            if m:
                record_id = m.group(1).rstrip(",")
                record_events[record_id]["barrier_complete"].append(ts_epoch)
                continue

    # Per-record stage durations
    record_timings = []
    for record_id, stages in record_events.items():
        if record_id.startswith("_"):
            continue
        entry = {"record_id": record_id}
        # Assembly duration
        if stages.get("assembly_start") and stages.get("assembly_complete"):
            a_start = min(stages["assembly_start"])
            a_end = max(stages["assembly_complete"])
            entry["assembly_duration_ms"] = round((a_end - a_start) * 1000)
        # Finalize duration
        if stages.get("finalize_start") and stages.get("finalize_complete"):
            f_start = min(stages["finalize_start"])
            f_end = max(stages["finalize_complete"])
            entry["finalize_duration_ms"] = round((f_end - f_start) * 1000)
        # Total pipeline (ingestion to finalize_complete)
        if stages.get("ingestion_start") and stages.get("finalize_complete"):
            p_start = min(stages["ingestion_start"])
            p_end = max(stages["finalize_complete"])
            entry["total_pipeline_duration_ms"] = round((p_end - p_start) * 1000)
        record_timings.append(entry)

    def stats_for(values: list) -> dict:
        if not values:
            return {"count": 0, "avg": 0, "median": 0, "p95": 0, "p99": 0, "max": 0, "min": 0}
        s = sorted(values)
        n = len(s)
        p95_idx = int(n * 0.95)
        p99_idx = int(n * 0.99)
        return {
            "count": n,
            "avg": round(sum(s) / n, 1),
            "median": round(statistics.median(s), 1),
            "p95": round(s[min(p95_idx, n-1)], 1),
            "p99": round(s[min(p99_idx, n-1)], 1),
            "max": round(max(s), 1),
            "min": round(min(s), 1),
        }

    assembly_durations = [
        r["assembly_duration_ms"] for r in record_timings if "assembly_duration_ms" in r
    ]
    finalize_durations = [
        r["finalize_duration_ms"] for r in record_timings if "finalize_duration_ms" in r
    ]
    total_durations = [
        r["total_pipeline_duration_ms"] for r in record_timings if "total_pipeline_duration_ms" in r
    ]

    # Compute cumulative time per stage for bottleneck ranking
    total_ocr_ms = sum(ocr_durations)
    total_ai_ms = sum(ai_durations)
    total_assembly_ms = sum(assembly_durations)
    total_finalize_ms = sum(finalize_durations)
    grand_total_ms = total_ocr_ms + total_ai_ms + total_assembly_ms + total_finalize_ms

    def pct(v): return round(v / grand_total_ms * 100, 1) if grand_total_ms > 0 else 0

    bottleneck_ranking = sorted([
        {"stage": "OCR", "total_ms": round(total_ocr_ms), "pct": pct(total_ocr_ms)},
        {"stage": "AI Extraction (Qwen)", "total_ms": round(total_ai_ms), "pct": pct(total_ai_ms)},
        {"stage": "Assembly", "total_ms": round(total_assembly_ms), "pct": pct(total_assembly_ms)},
        {"stage": "Finalization", "total_ms": round(total_finalize_ms), "pct": pct(total_finalize_ms)},
    ], key=lambda x: x["total_ms"], reverse=True)

    data = {
        "mined_at": datetime.now(timezone.utc).isoformat(),
        "stage_statistics": {
            "ocr_ms": stats_for(ocr_durations),
            "ai_ms": stats_for(ai_durations),
            "assembly_ms": stats_for(assembly_durations),
            "finalize_ms": stats_for(finalize_durations),
            "total_pipeline_ms": stats_for(total_durations),
        },
        "bottleneck_ranking": bottleneck_ranking,
        "record_timings": record_timings[:50],
        "raw_counts": {
            "ocr_events": len(ocr_durations),
            "ai_events": len(ai_durations),
            "assembly_record_count": len(assembly_durations),
            "finalize_record_count": len(finalize_durations),
        }
    }

    out_path = os.path.join(OUTPUT_DIR, "PIPELINE_TIMING_RAW.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\n  Stage Statistics:")
    for stage, s in data["stage_statistics"].items():
        if s["count"] > 0:
            print(f"    {stage:30s}: avg={s['avg']} ms  p95={s['p95']} ms  max={s['max']} ms  (n={s['count']})")

    print(f"\n  Bottleneck Ranking:")
    for i, b in enumerate(bottleneck_ranking, 1):
        print(f"    {i}. {b['stage']:25s}: {b['pct']}% of cumulative time")

    print(f"\n[OK] Pipeline timing data written: {out_path}")
    return data


if __name__ == "__main__":
    parse_pipeline_timing()
