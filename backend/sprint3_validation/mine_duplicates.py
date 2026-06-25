# -*- coding: utf-8 -*-
"""
Phase 3f: Duplicate Shadow Validation Miner
=============================================
Greps debug.log for [DUPLICATE_SHADOW_CHECK] and [DUPLICATE_FOUND]
events and classifies results.

Amendment 3: Captures both duplicate log tags.
Amendment 5: Shadow mode only — NO blocking activation.

Expected: IMG_20260406_0006.pdf and IMG_20260406_0006_TEST.pdf
          should trigger a shadow match.

No source code modifications. Read-only observer.
"""
import os
import re
import json
from datetime import datetime, timezone

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "reports")
os.makedirs(OUTPUT_DIR, exist_ok=True)

LOG_PATH = os.path.join(BACKEND_DIR, "logs", "debug.log")

SHADOW_PAT = re.compile(
    r"\[DUPLICATE_SHADOW_CHECK\]"
    r".*?(?:file=(?P<file>\S+))?"
    r".*?(?:hash=(?P<hash>[a-f0-9]{10,}))?",
    re.IGNORECASE
)
DUPLICATE_FOUND_PAT = re.compile(
    r"\[DUPLICATE_FOUND\].*?(?:file=(?P<file>\S+))?"
    r".*?(?:hash=(?P<hash>[a-f0-9]{64}))?",
    re.IGNORECASE
)
SHADOW_OLD_RESULT_PAT = re.compile(r"old_result[=:](\S+)", re.IGNORECASE)
SHADOW_NEW_RESULT_PAT = re.compile(r"normalized_result[=:](\S+)", re.IGNORECASE)
SHADOW_MATCH_PAT = re.compile(r"shadow_match[=:](\S+)", re.IGNORECASE)
TIMESTAMP_PAT = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})")


def parse_duplicate_shadow():
    print(f"\n{'='*60}")
    print("SPRINT 3 — PHASE 3f: DUPLICATE SHADOW VALIDATION MINING")
    print(f"{'='*60}")

    if not os.path.isfile(LOG_PATH):
        print(f"[WARN] Log file not found: {LOG_PATH}")
        return {}

    print(f"Log file : {LOG_PATH}")
    print("Scanning ...")

    shadow_events = []
    duplicate_found_events = []

    with open(LOG_PATH, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line_s = line.strip()
            ts_m = TIMESTAMP_PAT.match(line_s)
            ts = ts_m.group(1) if ts_m else ""

            if "[DUPLICATE_SHADOW_CHECK]" in line_s:
                m = SHADOW_PAT.search(line_s)
                old_m = SHADOW_OLD_RESULT_PAT.search(line_s)
                new_m = SHADOW_NEW_RESULT_PAT.search(line_s)
                match_m = SHADOW_MATCH_PAT.search(line_s)
                shadow_events.append({
                    "timestamp": ts,
                    "file": m.group("file") if m and m.group("file") else "unknown",
                    "hash": m.group("hash") if m and m.group("hash") else "unknown",
                    "old_result": old_m.group(1) if old_m else "unknown",
                    "normalized_result": new_m.group(1) if new_m else "unknown",
                    "shadow_match": match_m.group(1) if match_m else "unknown",
                    "raw": line_s[:300],
                })

            if "[DUPLICATE_FOUND]" in line_s:
                m = DUPLICATE_FOUND_PAT.search(line_s)
                duplicate_found_events.append({
                    "timestamp": ts,
                    "file": m.group("file") if m and m.group("file") else "unknown",
                    "hash": m.group("hash") if m and m.group("hash") else "unknown",
                    "raw": line_s[:300],
                })

    # Classify shadow events
    shadow_matches = [e for e in shadow_events
                      if e["shadow_match"].lower() in ("true", "match", "1")]
    shadow_mismatches = [e for e in shadow_events
                         if e["shadow_match"].lower() in ("false", "mismatch", "0")]

    # Check if the expected duplicate pair was detected
    EXPECTED_DUPLICATE_PAIR = ("IMG_20260406_0006", "IMG_20260406_0006_TEST")
    pair_detected = any(
        any(p in e["file"] for p in EXPECTED_DUPLICATE_PAIR)
        for e in duplicate_found_events + shadow_events
    )

    data = {
        "mined_at": datetime.now(timezone.utc).isoformat(),
        "shadow_mode_active": True,
        "blocking_activated": False,  # Amendment 5 — NEVER activate blocking
        "summary": {
            "total_shadow_check_events": len(shadow_events),
            "shadow_matches": len(shadow_matches),
            "shadow_mismatches": len(shadow_mismatches),
            "total_duplicate_found_events": len(duplicate_found_events),
            "expected_pair_0006_detected": pair_detected,
        },
        "shadow_events": shadow_events[:30],
        "shadow_matches_detail": shadow_matches[:20],
        "duplicate_found_events": duplicate_found_events[:30],
        "expected_duplicate_pair": {
            "files": list(EXPECTED_DUPLICATE_PAIR),
            "expected_behavior": "Shadow match logged, NO blocking applied",
            "detected": pair_detected,
        },
    }

    out_path = os.path.join(OUTPUT_DIR, "DUPLICATE_SHADOW_RAW.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"  Total shadow check events    : {len(shadow_events)}")
    print(f"  Shadow matches               : {len(shadow_matches)}")
    print(f"  Shadow mismatches            : {len(shadow_mismatches)}")
    print(f"  Duplicate found events       : {len(duplicate_found_events)}")
    print(f"  Expected pair (0006) detected: {pair_detected}")
    print(f"  Blocking activated           : FALSE (Shadow mode only)")
    print(f"[OK] Duplicate shadow data written: {out_path}")

    return data


if __name__ == "__main__":
    parse_duplicate_shadow()
