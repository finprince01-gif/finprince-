# -*- coding: utf-8 -*-
"""
Sprint 3 Production Validation — Master Orchestrator
======================================================
Runs all phases in sequence. Amendment 4: never stops on failure —
all invoices are processed and failures are consolidated at the end.

Usage:
  cd C:\\108\\AI-accounting-0.03\\backend
  python sprint3_validation\\run_sprint3_validation.py

Optional flags:
  --skip-upload         Skip Phase 2 (use existing BATCH_UPLOAD_RESULTS.json)
  --skip-baseline       Skip Phase 1 (use existing BASELINE_METRICS.json)
  --logs-only           Run only log mining phases (Phases 3+)
  --reports-only        Run only report generation (Phase 5+)

Validation Constraints (Amendment 5):
  - NO production code modifications
  - NO model or prompt changes
  - NO OCR preprocessing changes
  - NO database schema changes
  - NO duplicate blocking activation
  - NO concurrency increase above 4
  - NO cache logic changes
"""
import os
import sys
import json
import time
import argparse
import traceback
from datetime import datetime, timezone

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VALIDATION_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(VALIDATION_DIR, "reports")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Add backend to sys.path for Django imports
sys.path.insert(0, BACKEND_DIR)


def print_header(title: str):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}")


def print_phase(n: int, total: int, name: str):
    print(f"\n[Phase {n}/{total}] {name}")
    print("-" * 60)


def run_phase(fn, phase_name: str, continue_on_error: bool = True):
    """Execute a phase function and return its result or None on error."""
    t0 = time.time()
    try:
        result = fn()
        elapsed = round(time.time() - t0, 1)
        print(f"\n  → Phase completed in {elapsed}s")
        return result
    except SystemExit:
        raise  # Don't catch sys.exit()
    except Exception as e:
        elapsed = round(time.time() - t0, 1)
        print(f"\n  → [ERROR] {phase_name} failed after {elapsed}s: {e}")
        if not continue_on_error:
            raise
        traceback.print_exc()
        return None


def check_preconditions():
    """Verify that the invoice directory and environment are ready."""
    invoice_dir = r"C:\Users\ulaganathan\Downloads\New folder (2)"
    if not os.path.isdir(invoice_dir):
        print(f"[FATAL] Invoice directory not found: {invoice_dir}")
        sys.exit(1)

    files = [f for f in os.listdir(invoice_dir)
             if os.path.splitext(f)[1].lower() in {".pdf", ".jpg", ".jpeg", ".png", ".tiff"}]
    if not files:
        print(f"[FATAL] No invoice files found in: {invoice_dir}")
        sys.exit(1)

    print(f"[OK] Invoice directory: {len(files)} files found")

    # Check .env
    env_path = os.path.join(BACKEND_DIR, ".env")
    if os.path.isfile(env_path):
        print(f"[OK] .env file found: {env_path}")
    else:
        print(f"[WARN] .env not found at {env_path}")

    # Check Ollama / Qwen
    try:
        import requests
        resp = requests.get("http://localhost:11434/api/tags", timeout=5)
        if resp.status_code == 200:
            models = [m.get("name", "") for m in resp.json().get("models", [])]
            qwen_models = [m for m in models if "qwen" in m.lower()]
            if qwen_models:
                print(f"[OK] Ollama running | Qwen models: {qwen_models}")
            else:
                print(f"[WARN] Ollama running but no Qwen models found. Available: {models[:5]}")
        else:
            print(f"[WARN] Ollama health check returned HTTP {resp.status_code}")
    except Exception as e:
        print(f"[WARN] Ollama not reachable: {e}")

    # Check Redis
    try:
        import redis
        from dotenv import load_dotenv
        load_dotenv(env_path)
        r = redis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", "6379")),
            socket_timeout=3
        )
        r.ping()
        print("[OK] Redis is reachable")
    except Exception as e:
        print(f"[WARN] Redis not reachable: {e}")


def main():
    parser = argparse.ArgumentParser(
        description="Sprint 3 Production Validation Master Orchestrator"
    )
    parser.add_argument("--skip-upload", action="store_true",
                        help="Skip Phase 2 batch upload (use existing results)")
    parser.add_argument("--skip-baseline", action="store_true",
                        help="Skip Phase 1 baseline capture")
    parser.add_argument("--logs-only", action="store_true",
                        help="Run only log mining + reports (skip manifest + upload)")
    parser.add_argument("--reports-only", action="store_true",
                        help="Run only report generation and sign-off")
    parser.add_argument("--session-id", type=str, default=None,
                        help="Override session ID (for --logs-only / --reports-only)")
    args = parser.parse_args()

    print_header("SPRINT 3 PRODUCTION VALIDATION — MASTER ORCHESTRATOR")
    print(f"Start time : {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"Output dir : {OUTPUT_DIR}")
    print()
    print("Constraints (Amendment 5):")
    print("  ✗ No production code modifications")
    print("  ✗ No model/prompt changes")
    print("  ✗ No OCR preprocessing changes")
    print("  ✗ No DB schema changes")
    print("  ✗ No duplicate blocking activation")
    print("  ✗ No concurrency above WORKER_CONCURRENCY=4")
    print("  ✗ No cache logic changes")
    print()

    timeline = []
    t_total_start = time.time()

    skip_manifest = args.logs_only or args.reports_only
    skip_baseline = args.skip_baseline or args.logs_only or args.reports_only
    skip_upload = args.skip_upload or args.logs_only or args.reports_only
    skip_mining = args.reports_only

    TOTAL_PHASES = 9

    # ─────────────────────────────────────────────────────────────────────────
    # PRE-FLIGHT CHECK
    # ─────────────────────────────────────────────────────────────────────────
    print_phase(0, TOTAL_PHASES, "Pre-Flight Checks")
    check_preconditions()
    timeline.append({"phase": "Pre-flight", "status": "OK"})

    # ─────────────────────────────────────────────────────────────────────────
    # PHASE 0: MANIFEST
    # ─────────────────────────────────────────────────────────────────────────
    if not skip_manifest:
        print_phase(1, TOTAL_PHASES, "Manifest Generation")
        from sprint3_validation.generate_manifest import generate_manifest
        manifest = run_phase(generate_manifest, "Manifest Generation")
        timeline.append({"phase": "Manifest", "status": "OK" if manifest else "ERROR"})
    else:
        print_phase(1, TOTAL_PHASES, "Manifest Generation [SKIPPED]")
        manifest = {}
        timeline.append({"phase": "Manifest", "status": "SKIPPED"})

    # ─────────────────────────────────────────────────────────────────────────
    # PHASE 1: PRE-BATCH BASELINE
    # ─────────────────────────────────────────────────────────────────────────
    if not skip_baseline:
        print_phase(2, TOTAL_PHASES, "Pre-Batch Baseline Capture")
        from sprint3_validation.capture_baseline import capture_baseline
        run_phase(lambda: capture_baseline("PRE_BATCH"), "Baseline Capture")
        timeline.append({"phase": "Baseline", "status": "OK"})
    else:
        print_phase(2, TOTAL_PHASES, "Pre-Batch Baseline [SKIPPED]")
        timeline.append({"phase": "Baseline", "status": "SKIPPED"})

    # ─────────────────────────────────────────────────────────────────────────
    # PHASE 2: BATCH UPLOAD
    # ─────────────────────────────────────────────────────────────────────────
    if not skip_upload:
        print_phase(3, TOTAL_PHASES, "Batch Upload (22 Invoices)")
        print("  Amendment 4: Continues on failure — all 22 invoices will be attempted.")
        from sprint3_validation.batch_upload import run_batch_upload
        batch_result = run_phase(run_batch_upload, "Batch Upload")
        timeline.append({"phase": "Upload", "status": "OK" if batch_result else "ERROR"})
    else:
        print_phase(3, TOTAL_PHASES, "Batch Upload [SKIPPED]")
        timeline.append({"phase": "Upload", "status": "SKIPPED"})

    # ─────────────────────────────────────────────────────────────────────────
    # POST-BATCH BASELINE (compare to pre-batch)
    # ─────────────────────────────────────────────────────────────────────────
    if not skip_baseline:
        print_phase(4, TOTAL_PHASES, "Post-Batch Baseline Capture")
        from sprint3_validation.capture_baseline import capture_baseline
        run_phase(lambda: capture_baseline("POST_BATCH"), "Post-Batch Baseline")
        timeline.append({"phase": "Post-Baseline", "status": "OK"})

    # ─────────────────────────────────────────────────────────────────────────
    # PHASE 3: LOG MINING
    # ─────────────────────────────────────────────────────────────────────────
    if not skip_mining:
        print_phase(5, TOTAL_PHASES, "Log Mining — OCR Telemetry")
        from sprint3_validation.mine_ocr_telemetry import parse_ocr_telemetry
        run_phase(parse_ocr_telemetry, "OCR Telemetry Mining")

        print_phase(5, TOTAL_PHASES, "Log Mining — Prefix Cache")
        from sprint3_validation.mine_prefix_cache import parse_prefix_cache
        run_phase(parse_prefix_cache, "Prefix Cache Mining")

        print_phase(5, TOTAL_PHASES, "Log Mining — Worker Stability")
        from sprint3_validation.mine_worker_stability import parse_worker_stability
        run_phase(parse_worker_stability, "Worker Stability Mining")

        print_phase(5, TOTAL_PHASES, "Log Mining — Pipeline Timing")
        from sprint3_validation.mine_pipeline_timing import parse_pipeline_timing
        run_phase(parse_pipeline_timing, "Pipeline Timing Mining")

        print_phase(5, TOTAL_PHASES, "Log Mining — Redis Forensics")
        from sprint3_validation.mine_redis_forensics import parse_redis_forensics
        run_phase(parse_redis_forensics, "Redis Forensics Mining")

        print_phase(5, TOTAL_PHASES, "Log Mining — Duplicate Shadow")
        from sprint3_validation.mine_duplicates import parse_duplicate_shadow
        run_phase(parse_duplicate_shadow, "Duplicate Shadow Mining")

        timeline.append({"phase": "Log Mining", "status": "OK"})
    else:
        print_phase(5, TOTAL_PHASES, "Log Mining [SKIPPED]")
        timeline.append({"phase": "Log Mining", "status": "SKIPPED"})

    # ─────────────────────────────────────────────────────────────────────────
    # PHASE 4: EXTRACTION ACCURACY AUDIT
    # ─────────────────────────────────────────────────────────────────────────
    print_phase(6, TOTAL_PHASES, "Extraction Accuracy Audit (Amendment 1)")

    # Get session_id from manifest
    session_id = args.session_id
    if not session_id:
        manifest_path = os.path.join(OUTPUT_DIR, "REAL_BATCH_MANIFEST.json")
        if os.path.isfile(manifest_path):
            with open(manifest_path) as f:
                session_id = json.load(f).get("session_id", "")

    from sprint3_validation.audit_extraction_accuracy import run_extraction_accuracy_audit
    run_phase(lambda: run_extraction_accuracy_audit(session_id), "Extraction Accuracy Audit")
    timeline.append({"phase": "Extraction Audit", "status": "OK"})

    # ─────────────────────────────────────────────────────────────────────────
    # PHASE 5: REPORT GENERATION
    # ─────────────────────────────────────────────────────────────────────────
    print_phase(7, TOTAL_PHASES, "Report Generation (8 Reports)")
    from sprint3_validation.generate_reports import generate_all_reports
    run_phase(generate_all_reports, "Report Generation")
    timeline.append({"phase": "Reports", "status": "OK"})

    # ─────────────────────────────────────────────────────────────────────────
    # PHASE 6: SIGN-OFF
    # ─────────────────────────────────────────────────────────────────────────
    print_phase(8, TOTAL_PHASES, "Final Sign-Off (Amendment 6)")
    from sprint3_validation.generate_signoff import generate_signoff
    signoff = run_phase(generate_signoff, "Sign-Off Generation")
    timeline.append({"phase": "Sign-off", "status": "OK"})

    # ─────────────────────────────────────────────────────────────────────────
    # SUMMARY
    # ─────────────────────────────────────────────────────────────────────────
    elapsed_total = round(time.time() - t_total_start, 1)

    print_header("VALIDATION COMPLETE")
    print(f"Total time  : {elapsed_total}s ({elapsed_total/60:.1f} min)")
    print(f"Output dir  : {OUTPUT_DIR}")
    print()
    print("Phase Timeline:")
    for t in timeline:
        status_icon = {"OK": "✅", "ERROR": "❌", "SKIPPED": "⏭"}.get(t["status"], "?")
        print(f"  {status_icon} {t['phase']:20s} → {t['status']}")

    if signoff:
        verdict = signoff.get("final_verdict", "UNKNOWN")
        verdict_icon = {"APPROVED": "✅", "APPROVED WITH CONDITIONS": "⚠️", "REJECTED": "❌"}.get(verdict, "?")
        print()
        print(f"FINAL VERDICT: {verdict_icon} {verdict}")
        print()
        print("Reports written:")
    else:
        print("\n[WARN] Sign-off generation failed.")

    report_files = [
        "REAL_BATCH_MANIFEST.json",
        "BASELINE_METRICS_PRE_BATCH.json",
        "BASELINE_METRICS_POST_BATCH.json",
        "BATCH_UPLOAD_RESULTS.json",
        "OCR_BATCH_VALIDATION_REPORT.md",
        "PREFIX_CACHE_EFFECTIVENESS_REPORT.md",
        "EXTRACTION_ACCURACY_REPORT.md",
        "WORKER_STABILITY_REPORT.md",
        "REDIS_FORENSIC_REPORT.md",
        "DUPLICATE_SHADOW_ANALYSIS_REPORT.md",
        "FAILED_INVOICE_RCA_REPORT.md",
        "PIPELINE_PERFORMANCE_BREAKDOWN_REPORT.md",
        "PRODUCTION_VALIDATION_SIGNOFF.md",
    ]
    for fname in report_files:
        path = os.path.join(OUTPUT_DIR, fname)
        exists = "✅" if os.path.isfile(path) else "❌ MISSING"
        size = f"({os.path.getsize(path)/1024:.1f} KB)" if os.path.isfile(path) else ""
        print(f"  {exists} {fname} {size}")

    print()
    if not os.path.isfile(os.path.join(VALIDATION_DIR, "GROUND_TRUTH_VALIDATION.csv")):
        print("⚠️  ACTION REQUIRED: Fill in GROUND_TRUTH_VALIDATION.csv")
        print(f"   Template: {OUTPUT_DIR}\\GROUND_TRUTH_VALIDATION_TEMPLATE.csv")
        print(f"   Then re-run: python sprint3_validation\\run_sprint3_validation.py --reports-only")


if __name__ == "__main__":
    main()
