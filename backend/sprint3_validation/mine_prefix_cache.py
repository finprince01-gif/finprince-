# -*- coding: utf-8 -*-
"""
Phase 3b: Prefix Cache Telemetry Miner
========================================
Greps debug.log for [PREFIX_CACHE_TELEMETRY] lines and validates
that all pages of each invoice share the same PREFIX_HASH.

Amendment 3: Captures [PREFIX_CACHE_TELEMETRY]

Expected behaviour:
  Page 1 -> PREFIX_HASH=A
  Page 2 -> PREFIX_HASH=A
  Page 3 -> PREFIX_HASH=A

Flags any deviation as CACHE_INVALIDATED.

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

CACHE_PAT = re.compile(
    r"\[PREFIX_CACHE_TELEMETRY\]"
    r".*?PREFIX_HASH=(?P<prefix_hash>[a-f0-9]{64})"
    r".*?PROMPT_HASH=(?P<prompt_hash>[a-f0-9]{64})"
    r".*?REQUEST_ID=(?P<request_id>\S+)"
    r".*?PAGE_NUMBER=(?P<page>\d+)"
    r".*?INVOICE_ID=(?P<invoice_id>\S+)"
)


def parse_prefix_cache():
    print(f"\n{'='*60}")
    print("SPRINT 3 — PHASE 3b: PREFIX CACHE TELEMETRY MINING")
    print(f"{'='*60}")

    if not os.path.isfile(LOG_PATH):
        print(f"[WARN] Log file not found: {LOG_PATH}")
        return {}

    print(f"Log file : {LOG_PATH}")
    print("Scanning ...")

    # Group by invoice_id
    # invoice_id -> list of {page, prefix_hash, prompt_hash, request_id}
    invoice_pages: dict = defaultdict(list)
    total_events = 0

    with open(LOG_PATH, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            m = CACHE_PAT.search(line)
            if not m:
                continue
            total_events += 1
            invoice_id = m.group("invoice_id")
            page = int(m.group("page"))
            prefix_hash = m.group("prefix_hash")
            prompt_hash = m.group("prompt_hash")
            request_id = m.group("request_id")

            invoice_pages[invoice_id].append({
                "page": page,
                "prefix_hash": prefix_hash,
                "prompt_hash": prompt_hash,
                "request_id": request_id,
            })

    # Analyse each invoice
    invoice_analysis = []
    total_invoices = len(invoice_pages)
    cache_eligible = 0         # All pages share same prefix hash
    cache_invalidated = 0      # At least one page has a different prefix hash
    single_page_invoices = 0   # Can't determine consistency for single page

    all_prefix_hashes = []

    for inv_id, pages in invoice_pages.items():
        pages_sorted = sorted(pages, key=lambda p: p["page"])
        prefix_hashes = [p["prefix_hash"] for p in pages_sorted]
        prompt_hashes = [p["prompt_hash"] for p in pages_sorted]
        unique_prefixes = set(prefix_hashes)
        page_count = len(pages_sorted)

        all_prefix_hashes.extend(prefix_hashes)

        if page_count == 1:
            single_page_invoices += 1
            verdict = "SINGLE_PAGE"
        elif len(unique_prefixes) == 1:
            cache_eligible += 1
            verdict = "CACHE_CONSISTENT"
        else:
            cache_invalidated += 1
            verdict = "CACHE_INVALIDATED"
            # Identify which pages differ
            first_hash = prefix_hashes[0]
            for p in pages_sorted:
                if p["prefix_hash"] != first_hash:
                    p["deviation"] = True

        analysis = {
            "invoice_id": inv_id,
            "page_count": page_count,
            "unique_prefix_hash_count": len(unique_prefixes),
            "unique_prompt_hash_count": len(set(prompt_hashes)),
            "verdict": verdict,
            "pages": pages_sorted,
        }
        invoice_analysis.append(analysis)

    # Global hash consistency
    global_unique_prefixes = len(set(all_prefix_hashes))
    total_prefix_events = len(all_prefix_hashes)

    # Identical prefix ratio — fraction of events sharing the modal prefix hash
    if all_prefix_hashes:
        from collections import Counter
        prefix_counter = Counter(all_prefix_hashes)
        most_common_prefix, most_common_count = prefix_counter.most_common(1)[0]
        identical_prefix_ratio = round(most_common_count / total_prefix_events * 100, 1)
    else:
        most_common_prefix = "N/A"
        most_common_count = 0
        identical_prefix_ratio = 0

    data = {
        "mined_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_prefix_cache_events": total_events,
            "total_invoices_with_cache_data": total_invoices,
            "cache_consistent_invoices": cache_eligible,
            "cache_invalidated_invoices": cache_invalidated,
            "single_page_invoices": single_page_invoices,
            "global_unique_prefix_hashes": global_unique_prefixes,
            "modal_prefix_hash": most_common_prefix[:16] + "...",
            "modal_prefix_occurrence_count": most_common_count,
            "identical_prefix_ratio_pct": identical_prefix_ratio,
        },
        "invoice_analysis": sorted(invoice_analysis,
                                   key=lambda x: x["verdict"]),
        "invalidated_invoices": [
            a for a in invoice_analysis if a["verdict"] == "CACHE_INVALIDATED"
        ],
    }

    out_path = os.path.join(OUTPUT_DIR, "PREFIX_CACHE_TELEMETRY_RAW.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"  Total cache events           : {total_events}")
    print(f"  Invoices with cache data     : {total_invoices}")
    print(f"  Cache-consistent invoices    : {cache_eligible}")
    print(f"  Cache-invalidated invoices   : {cache_invalidated}")
    print(f"  Single-page invoices         : {single_page_invoices}")
    print(f"  Identical prefix ratio       : {identical_prefix_ratio}%")
    print(f"[OK] Prefix cache data written: {out_path}")

    return data


if __name__ == "__main__":
    parse_prefix_cache()
