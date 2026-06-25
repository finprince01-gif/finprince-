# -*- coding: utf-8 -*-
"""
Phase 3a: OCR Telemetry Log Miner
===================================
Greps debug.log for all OCR telemetry events and computes per-page
and aggregate statistics.

Amendment 3: Captures all required OCR log tags:
  [OCR_TELEMETRY]
  [OCR_DPI_UPGRADE]
  [OCR_RESULT]
  [LOW_CONFIDENCE_OCR_EXTRACTION]

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

# Patterns per Amendment 3
PATTERNS = {
    # Actual OCR retry/recovery events (observed in debug.log)
    "OCR_RETRY_START": re.compile(r"\[OCR_RETRY_CHAIN_START\].*?record=(\S+).*?page=(\d+).*?max_passes=(\d+)"),
    "OCR_RECOVERY_PASS": re.compile(r"\[OCR_RECOVERY_PASS\].*?pass=(\S+).*?record=(\S+).*?page=(\d+)"),
    "OCR_INPUT_PATH": re.compile(r"\[OCR_INPUT_PATH\].*?record=(\S+)"),
    # Low confidence extraction events (observed in debug.log)
    "LOW_CONFIDENCE_SCORE": re.compile(
        r"\[LOW_CONFIDENCE_SCORE_BREAKDOWN\].*?"
        r"confidence_score=(\d+).*?"
        r"vendor_score=([\d.]+).*?"
        r"invoice_no_score=([\d.]+).*?"
        r"gstin_score=([\d.]+).*?"
        r"totals_score=([\d.]+)"
    ),
    # Generic low-confidence tag catch-all
    "LOW_CONFIDENCE_ANY": re.compile(r"\[LOW_CONFIDENCE"),
    # Qwen inference perf as OCR timing proxy
    "QWEN_PERF": re.compile(
        r"\[QWEN_INFERENCE_PERF\].*?latency_s=([\d.]+).*?"
        r"prompt_tokens=(\d+).*?completion_tokens=(\d+).*?total_tokens=(\d+).*?"
        r"tokens_per_second=([\d.]+)"
    ),
    # Slot-level events give us page-level processing view
    "SLOT_ACQUIRED": re.compile(r"\[SLOT_ACQUIRED\].*?record_id=(\S+).*?page_number=(\d+)"),
    "SLOT_RELEASED": re.compile(r"\[SLOT_RELEASED\].*?record_id=(\S+).*?page_number=(\d+)"),
    # Original telemetry tags (may appear in future batch run)
    "OCR_TELEMETRY": re.compile(r"\[OCR_TELEMETRY\]"),
    "OCR_DPI_UPGRADE": re.compile(r"\[OCR_DPI_UPGRADE\]"),
    "OCR_RESULT": re.compile(r"\[OCR_RESULT\]"),
    "LOW_CONFIDENCE_OCR": re.compile(r"\[LOW_CONFIDENCE_OCR_EXTRACTION\]"),
}

TIMESTAMP_PAT = re.compile(r"^INFO (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})")


def parse_ocr_telemetry():
    print(f"\n{'='*60}")
    print("SPRINT 3 — PHASE 3a: OCR TELEMETRY MINING")
    print(f"{'='*60}")

    if not os.path.isfile(LOG_PATH):
        print(f"[WARN] Log file not found: {LOG_PATH}")
        return {}

    file_size_mb = os.path.getsize(LOG_PATH) / 1024 / 1024
    print(f"Log file : {LOG_PATH} ({file_size_mb:.1f} MB)")
    print("Scanning ...")

    # Counters for actual observed log tags
    ocr_retry_starts = []       # [OCR_RETRY_CHAIN_START]
    ocr_recovery_passes = []    # [OCR_RECOVERY_PASS]
    ocr_pages_processed = set() # unique (record, page) tuples
    low_confidence_events = []  # [LOW_CONFIDENCE_SCORE_BREAKDOWN]
    qwen_perf_records = []      # [QWEN_INFERENCE_PERF]
    slot_acquisitions = []      # [SLOT_ACQUIRED]
    low_confidence_count = 0
    # Legacy tags (may appear in fresh batch run)
    telemetry_records = []
    dpi_upgrades = []
    ocr_results = []

    with open(LOG_PATH, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()

            # ── Actual observed tags ──
            m = PATTERNS["OCR_RETRY_START"].search(line)
            if m:
                ts_m = TIMESTAMP_PAT.match(line)
                record_id = m.group(1)
                page = int(m.group(2))
                ocr_retry_starts.append({
                    "timestamp": ts_m.group(1) if ts_m else "",
                    "record_id": record_id,
                    "page": page,
                    "max_passes": int(m.group(3)),
                })
                ocr_pages_processed.add((record_id, page))
                continue

            m = PATTERNS["OCR_RECOVERY_PASS"].search(line)
            if m:
                ocr_recovery_passes.append({
                    "pass": m.group(1),
                    "record_id": m.group(2),
                    "page": int(m.group(3)),
                })
                continue

            m = PATTERNS["LOW_CONFIDENCE_SCORE"].search(line)
            if m:
                low_confidence_count += 1
                low_confidence_events.append({
                    "confidence_score": int(m.group(1)),
                    "vendor_score": float(m.group(2)),
                    "invoice_no_score": float(m.group(3)),
                    "gstin_score": float(m.group(4)),
                    "totals_score": float(m.group(5)),
                })
                continue

            if PATTERNS["LOW_CONFIDENCE_ANY"].search(line) and "[LOW_CONFIDENCE_SCORE_BREAKDOWN]" not in line:
                low_confidence_count += 1
                continue

            m = PATTERNS["QWEN_PERF"].search(line)
            if m:
                ts_m = TIMESTAMP_PAT.match(line)
                qwen_perf_records.append({
                    "timestamp": ts_m.group(1) if ts_m else "",
                    "latency_s": float(m.group(1)),
                    "prompt_tokens": int(m.group(2)),
                    "completion_tokens": int(m.group(3)),
                    "total_tokens": int(m.group(4)),
                    "tokens_per_sec": float(m.group(5)),
                })
                continue

            m = PATTERNS["SLOT_ACQUIRED"].search(line)
            if m:
                slot_acquisitions.append({
                    "record_id": m.group(1),
                    "page": int(m.group(2)),
                })
                continue

            # ── Legacy tags (no data currently, but ready for new batch run) ──
            if PATTERNS["OCR_TELEMETRY"].search(line):
                telemetry_records.append(line[:120])
                continue
            if PATTERNS["OCR_DPI_UPGRADE"].search(line):
                dpi_upgrades.append(line[:120])
                continue
            if PATTERNS["OCR_RESULT"].search(line):
                ocr_results.append(line[:120])
                continue

    # ── Statistics — using real observed counters ──
    unique_pages_processed = len(ocr_pages_processed)
    unique_records_with_ocr = len(set(r for r, p in ocr_pages_processed))
    total_retry_events = len(ocr_retry_starts)
    total_recovery_passes = len(ocr_recovery_passes)

    qwen_latencies = [r["latency_s"] for r in qwen_perf_records]
    avg_qwen_latency = round(sum(qwen_latencies) / len(qwen_latencies), 1) if qwen_latencies else 0
    max_qwen_latency = round(max(qwen_latencies), 1) if qwen_latencies else 0
    avg_prompt_tokens = round(sum(r["prompt_tokens"] for r in qwen_perf_records) / len(qwen_perf_records)) if qwen_perf_records else 0
    avg_tps = round(sum(r["tokens_per_sec"] for r in qwen_perf_records) / len(qwen_perf_records), 2) if qwen_perf_records else 0

    conf_scores = [r["confidence_score"] for r in low_confidence_events]
    avg_confidence = round(sum(conf_scores) / len(conf_scores), 1) if conf_scores else None
    vendor_scores = [r["vendor_score"] for r in low_confidence_events]
    avg_vendor_score = round(sum(vendor_scores) / len(vendor_scores), 3) if vendor_scores else None

    data = {
        "mined_at": datetime.now(timezone.utc).isoformat(),
        "log_file": LOG_PATH,
        "log_size_mb": round(file_size_mb, 2),
        "data_source_note": "Using OCR_RETRY_CHAIN_START, LOW_CONFIDENCE_SCORE_BREAKDOWN, QWEN_INFERENCE_PERF (actual log tags). Legacy OCR_TELEMETRY/OCR_RESULT not present in this log version.",
        "summary": {
            "unique_pages_with_ocr_retry": unique_pages_processed,
            "unique_records_with_ocr_retry": unique_records_with_ocr,
            "total_ocr_retry_chain_starts": total_retry_events,
            "total_ocr_recovery_passes": total_recovery_passes,
            "total_low_confidence_events": low_confidence_count,
            "avg_confidence_score": avg_confidence,
            "avg_vendor_score": avg_vendor_score,
            "total_qwen_inference_events": len(qwen_perf_records),
            "avg_qwen_latency_s": avg_qwen_latency,
            "max_qwen_latency_s": max_qwen_latency,
            "avg_prompt_tokens": int(avg_prompt_tokens),
            "avg_tokens_per_second": avg_tps,
            "total_slot_acquisitions": len(slot_acquisitions),
            # Legacy tags (will populate when fresh batch run produces them)
            "legacy_ocr_telemetry_events": len(telemetry_records),
            "legacy_dpi_upgrade_events": len(dpi_upgrades),
            "legacy_ocr_result_events": len(ocr_results),
        },
        "low_confidence_events_sample": low_confidence_events[:20],
        "qwen_perf_sample": qwen_perf_records[:20],
        "ocr_retry_sample": ocr_retry_starts[:20],
    }

    out_path = os.path.join(OUTPUT_DIR, "OCR_TELEMETRY_RAW.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"  Unique pages with OCR retry  : {unique_pages_processed}")
    print(f"  Records with OCR retry       : {unique_records_with_ocr}")
    print(f"  Total OCR retry chain starts : {total_retry_events}")
    print(f"  Total recovery passes        : {total_recovery_passes}")
    print(f"  Low confidence events        : {low_confidence_count}")
    print(f"  Avg confidence score         : {avg_confidence}")
    print(f"  Avg vendor score             : {avg_vendor_score}")
    print(f"  Qwen inference events        : {len(qwen_perf_records)}")
    print(f"  Avg Qwen latency             : {avg_qwen_latency}s")
    print(f"  Max Qwen latency             : {max_qwen_latency}s")
    print(f"  Avg tokens/sec               : {avg_tps}")
    print(f"[OK] OCR telemetry written: {out_path}")

    return data


if __name__ == "__main__":
    parse_ocr_telemetry()
