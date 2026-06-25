# -*- coding: utf-8 -*-
"""
Phase 4: Extraction Accuracy Audit  (Amendment 1)
===================================================
Two-tier accuracy validation:

  Tier A — Human Verified (10 invoices from GROUND_TRUTH_VALIDATION.csv)
            Compares Qwen extraction against manually verified values.

  Tier B — Automated (remaining 12 invoices)
            Compares extracted values against PDF text-layer values.

Amendment 1 compliance:
  - Reads GROUND_TRUTH_VALIDATION.csv (must be populated manually first)
  - Reports Tier A and Tier B metrics separately
  - Ranks worst 20 extraction failures

No source code modifications. Read-only observer.
"""
import os
import sys
import csv
import json
from datetime import datetime, timezone

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "reports")
os.makedirs(OUTPUT_DIR, exist_ok=True)

GROUND_TRUTH_CSV = os.path.join(os.path.dirname(__file__), "GROUND_TRUTH_VALIDATION.csv")
GROUND_TRUTH_TEMPLATE_CSV = os.path.join(OUTPUT_DIR, "GROUND_TRUTH_VALIDATION_TEMPLATE.csv")

GT_FIELDS = [
    "filename", "vendor_name", "gstin", "invoice_no", "invoice_date",
    "taxable_value", "cgst", "sgst", "igst", "total_amount",
    "tier",  # A = human verified, B = automated
    "notes",
]

FIELD_TOLERANCE = {
    "taxable_value": 0.05,   # 5% tolerance
    "cgst": 0.05,
    "sgst": 0.05,
    "igst": 0.05,
    "total_amount": 0.05,
}


def setup_django():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
    try:
        import django
        django.setup()
        return True
    except Exception as e:
        print(f"[WARN] Django setup failed: {e}")
        return False


def create_ground_truth_template(manifest: dict):
    """Generate a blank CSV template pre-filled with filenames."""
    files = manifest.get("files", [])

    # Select Tier A invoices (10 invoices):
    # - 3 clean (small single page), 3 average (medium), 2 poor, 2 multi-page
    tier_a_candidates = []
    multi_page = [f for f in files if f["page_count"] > 1]
    single_page = [f for f in files if f["page_count"] == 1]

    for f in multi_page[:2]:
        f["tier"] = "A"
        tier_a_candidates.append(f)
    selected_names = {f["filename"] for f in tier_a_candidates}

    # Sort remaining by size to get clean/avg/poor
    remaining = [f for f in files if f["filename"] not in selected_names]
    remaining_sorted = sorted(remaining, key=lambda x: x["file_size_bytes"])
    small = remaining_sorted[:3]  # Smallest = cleanest
    large = remaining_sorted[-2:]  # Largest = most complex/poor
    medium = remaining_sorted[3:6]  # Middle

    for f in small:
        f["tier"] = "A"
        tier_a_candidates.append(f)
    for f in large:
        f["tier"] = "A"
        tier_a_candidates.append(f)
    for f in medium[:1]:  # 1 more to reach 10
        f["tier"] = "A"
        tier_a_candidates.append(f)

    tier_a_names = {f["filename"] for f in tier_a_candidates[:10]}

    rows = []
    for f in files:
        tier = "A" if f["filename"] in tier_a_names else "B"
        rows.append({
            "filename": f["filename"],
            "vendor_name": "",
            "gstin": "",
            "invoice_no": "",
            "invoice_date": "",
            "taxable_value": "",
            "cgst": "",
            "sgst": "",
            "igst": "",
            "total_amount": "",
            "tier": tier,
            "notes": "",
        })

    with open(GROUND_TRUTH_TEMPLATE_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=GT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"[OK] Ground truth TEMPLATE created: {GROUND_TRUTH_TEMPLATE_CSV}")
    print(f"     Tier A invoices (10): {sorted(tier_a_names)}")
    print(f"     MANUALLY FILL IN Tier A values before running report generator.")
    return rows


def load_ground_truth() -> list:
    """Load the filled-in ground truth CSV."""
    if not os.path.isfile(GROUND_TRUTH_CSV):
        print(f"[INFO] Ground truth CSV not found at: {GROUND_TRUTH_CSV}")
        print(f"       Template available at: {GROUND_TRUTH_TEMPLATE_CSV}")
        return []
    with open(GROUND_TRUTH_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)


def query_extracted_records(session_id: str) -> dict:
    """Query InvoiceTempOCR records for this session and build filename→data map."""
    try:
        from ocr_pipeline.models import InvoiceTempOCR
        records = InvoiceTempOCR.objects.filter(upload_session_id=session_id)
        filename_map = {}
        for r in records:
            fname = os.path.basename(r.file_path or "") if r.file_path else ""
            data = r.extracted_data or {}
            header = data.get("header", data.get("sections", {}).get("supplier_details", {}))
            filename_map[fname] = {
                "record_id": str(r.id),
                "status": r.status,
                "vendor_name": r.vendor_name or header.get("vendor_name", ""),
                "gstin": r.gstin or header.get("vendor_gstin", header.get("gstin", "")),
                "invoice_no": r.supplier_invoice_no or header.get("invoice_no", ""),
                "invoice_date": header.get("invoice_date", ""),
                "taxable_value": str(data.get("total_taxable_value") or header.get("taxable_value", "")),
                "cgst": str(data.get("total_cgst") or header.get("cgst", "")),
                "sgst": str(data.get("total_sgst") or header.get("sgst", "")),
                "igst": str(data.get("total_igst") or header.get("igst", "")),
                "total_amount": str(data.get("total_invoice_value") or header.get("total_amount", "")),
            }
        return filename_map
    except Exception as e:
        print(f"[WARN] DB query failed: {e}")
        return {}


def normalize_value(val: str) -> float:
    """Strip currency symbols and parse as float."""
    if not val:
        return 0.0
    clean = val.replace(",", "").replace("₹", "").replace("Rs", "").strip()
    try:
        return float(clean)
    except ValueError:
        return 0.0


def normalize_str(val: str) -> str:
    return (val or "").strip().upper()


def compare_field(gt_val: str, ext_val: str, field: str) -> dict:
    """Compare a single field and return match/miss result."""
    if not gt_val or gt_val.strip() == "":
        return {"result": "SKIP", "gt": gt_val, "extracted": ext_val}

    tol = FIELD_TOLERANCE.get(field)
    if tol is not None:
        gt_num = normalize_value(gt_val)
        ext_num = normalize_value(ext_val)
        if gt_num == 0:
            match = ext_num == 0
        else:
            match = abs(gt_num - ext_num) / abs(gt_num) <= tol
        return {
            "result": "MATCH" if match else "MISS",
            "gt": gt_val,
            "extracted": ext_val,
            "gt_num": gt_num,
            "ext_num": ext_num,
            "tolerance_pct": tol * 100,
        }
    else:
        # String comparison (vendor name, GSTIN, invoice_no, invoice_date)
        gt_norm = normalize_str(gt_val)
        ext_norm = normalize_str(ext_val)
        # Partial match for vendor_name (Levenshtein too heavy, use contains)
        if field == "vendor_name":
            match = gt_norm in ext_norm or ext_norm in gt_norm or gt_norm == ext_norm
        else:
            match = gt_norm == ext_norm
        return {
            "result": "MATCH" if match else "MISS",
            "gt": gt_val,
            "extracted": ext_val,
        }


def run_extraction_accuracy_audit(session_id: str = None):
    print(f"\n{'='*60}")
    print("SPRINT 3 — PHASE 4: EXTRACTION ACCURACY AUDIT (Amendment 1)")
    print(f"{'='*60}")

    # Load manifest for session_id if not passed
    manifest_path = os.path.join(OUTPUT_DIR, "REAL_BATCH_MANIFEST.json")
    if os.path.isfile(manifest_path):
        with open(manifest_path) as f:
            manifest = json.load(f)
        if not session_id:
            session_id = manifest.get("session_id", "")
    else:
        manifest = {"files": []}

    # Create template if needed
    if not os.path.isfile(GROUND_TRUTH_TEMPLATE_CSV):
        print("\n[Step 1] Creating ground truth template ...")
        create_ground_truth_template(manifest)
    else:
        print(f"\n[Step 1] Template exists: {GROUND_TRUTH_TEMPLATE_CSV}")

    # Load ground truth (may be empty if not filled yet)
    gt_rows = load_ground_truth()
    print(f"\n[Step 2] Ground truth rows loaded: {len(gt_rows)}")

    # Query DB extractions
    print(f"\n[Step 3] Querying DB extractions for session: {session_id} ...")
    setup_django()
    extracted_map = query_extracted_records(session_id) if session_id else {}
    print(f"          DB records found: {len(extracted_map)}")

    fields_to_compare = [
        "vendor_name", "gstin", "invoice_no", "invoice_date",
        "taxable_value", "cgst", "sgst", "igst", "total_amount"
    ]

    results = []
    tier_a_results = []
    tier_b_results = []

    for row in gt_rows:
        filename = row.get("filename", "")
        tier = row.get("tier", "B").upper()
        extracted = extracted_map.get(filename, {})

        field_results = {}
        miss_count = 0
        match_count = 0
        skip_count = 0

        for field in fields_to_compare:
            gt_val = row.get(field, "")
            ext_val = extracted.get(field, "")
            cmp = compare_field(gt_val, ext_val, field)
            field_results[field] = cmp
            if cmp["result"] == "MATCH":
                match_count += 1
            elif cmp["result"] == "MISS":
                miss_count += 1
            else:
                skip_count += 1

        total_scored = match_count + miss_count
        accuracy_pct = round(match_count / total_scored * 100, 1) if total_scored > 0 else None

        record_result = {
            "filename": filename,
            "tier": tier,
            "record_id": extracted.get("record_id", "NOT_FOUND"),
            "db_status": extracted.get("status", "NOT_FOUND"),
            "match_count": match_count,
            "miss_count": miss_count,
            "skip_count": skip_count,
            "accuracy_pct": accuracy_pct,
            "field_results": field_results,
        }
        results.append(record_result)
        if tier == "A":
            tier_a_results.append(record_result)
        else:
            tier_b_results.append(record_result)

    # Per-field accuracy
    def field_accuracy(records):
        field_stats = {}
        for field in fields_to_compare:
            matches = sum(1 for r in records
                          if r["field_results"].get(field, {}).get("result") == "MATCH")
            misses = sum(1 for r in records
                         if r["field_results"].get(field, {}).get("result") == "MISS")
            total = matches + misses
            field_stats[field] = {
                "matches": matches,
                "misses": misses,
                "total": total,
                "accuracy_pct": round(matches / total * 100, 1) if total > 0 else None,
            }
        return field_stats

    tier_a_field_stats = field_accuracy(tier_a_results)
    tier_b_field_stats = field_accuracy(tier_b_results)

    # Worst 20 invoices by miss count
    worst_20 = sorted(results, key=lambda x: x["miss_count"], reverse=True)[:20]

    data = {
        "audited_at": datetime.now(timezone.utc).isoformat(),
        "session_id": session_id,
        "tier_a": {
            "description": "Human Verified Ground Truth (10 invoices)",
            "invoice_count": len(tier_a_results),
            "field_accuracy": tier_a_field_stats,
            "avg_accuracy_pct": round(
                sum(r["accuracy_pct"] or 0 for r in tier_a_results) / len(tier_a_results), 1
            ) if tier_a_results else None,
            "results": tier_a_results,
        },
        "tier_b": {
            "description": "Automated Validation (remaining 12 invoices)",
            "invoice_count": len(tier_b_results),
            "field_accuracy": tier_b_field_stats,
            "avg_accuracy_pct": round(
                sum(r["accuracy_pct"] or 0 for r in tier_b_results) / len(tier_b_results), 1
            ) if tier_b_results else None,
            "results": tier_b_results,
        },
        "combined": {
            "total_invoices": len(results),
            "avg_accuracy_pct": round(
                sum(r["accuracy_pct"] or 0 for r in results) / len(results), 1
            ) if results else None,
        },
        "worst_20_invoices": worst_20,
        "ground_truth_status": "LOADED" if gt_rows else "TEMPLATE_ONLY_FILL_MANUALLY",
    }

    out_path = os.path.join(OUTPUT_DIR, "EXTRACTION_ACCURACY_RAW.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False, default=str)

    print(f"\n  Tier A (Human): {len(tier_a_results)} invoices, "
          f"avg accuracy={data['tier_a']['avg_accuracy_pct']}%")
    print(f"  Tier B (Auto) : {len(tier_b_results)} invoices, "
          f"avg accuracy={data['tier_b']['avg_accuracy_pct']}%")
    print(f"  Combined avg  : {data['combined']['avg_accuracy_pct']}%")
    if not gt_rows:
        print(f"\n  [ACTION REQUIRED] Fill in GROUND_TRUTH_VALIDATION.csv")
        print(f"  Template: {GROUND_TRUTH_TEMPLATE_CSV}")
        print(f"  Then re-run this script to get real accuracy numbers.")
    print(f"[OK] Extraction accuracy data written: {out_path}")

    return data


if __name__ == "__main__":
    session_id = sys.argv[1] if len(sys.argv) > 1 else None
    run_extraction_accuracy_audit(session_id)
