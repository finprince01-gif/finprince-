# -*- coding: utf-8 -*-
"""
Phase 2: Batch Upload Orchestrator
====================================
Uploads all 22 invoices through the production API (CleanOCRStagingView).
Authenticates via JWT, polls session status until terminal, and records
per-file outcomes.

Amendment 4: Continues on failure — never stops mid-batch.
No source code modifications. Read-only observer.
"""
import os
import sys
import json
import time
import uuid
import requests
from datetime import datetime, timezone

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "reports")
os.makedirs(OUTPUT_DIR, exist_ok=True)

INVOICE_DIR = r"C:\Users\ulaganathan\Downloads\New folder (2)"
SUPPORTED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif"}

# API config
API_BASE = os.getenv("VALIDATION_API_BASE", "http://localhost:8000")
VALIDATION_USER = os.getenv("VALIDATION_USER", "admin")
VALIDATION_EMAIL = os.getenv("VALIDATION_EMAIL", "admin@budstech.com")
VALIDATION_PASS = os.getenv("VALIDATION_PASS", "Sprint3Val@2026")

# Max time to wait for a single invoice pipeline to complete
SESSION_POLL_TIMEOUT_S = 600   # 10 minutes per invoice
SESSION_POLL_INTERVAL_S = 5


def load_manifest() -> dict:
    manifest_path = os.path.join(OUTPUT_DIR, "REAL_BATCH_MANIFEST.json")
    if not os.path.isfile(manifest_path):
        print("[ERROR] REAL_BATCH_MANIFEST.json not found. Run generate_manifest.py first.")
        sys.exit(1)
    with open(manifest_path, encoding="utf-8") as f:
        return json.load(f)


def get_session_id() -> str:
    sid_path = os.path.join(OUTPUT_DIR, "SESSION_ID.txt")
    if os.path.isfile(sid_path):
        with open(sid_path) as f:
            return f.read().strip()
    return str(uuid.uuid4())


def authenticate(session: requests.Session) -> str:
    """Obtain JWT token and attach to session. Returns token string."""
    user = os.getenv("VALIDATION_USER", VALIDATION_USER)
    email = os.getenv("VALIDATION_EMAIL", VALIDATION_EMAIL)
    passwd = os.getenv("VALIDATION_PASS", VALIDATION_PASS)

    if not user or not passwd:
        raise RuntimeError(
            "Authentication credentials required.\n"
            "Set VALIDATION_USER, VALIDATION_EMAIL and VALIDATION_PASS env vars.\n"
            "Example:\n"
            "  $env:VALIDATION_USER='admin'\n"
            "  $env:VALIDATION_EMAIL='admin@budstech.com'\n"
            "  $env:VALIDATION_PASS='Sprint3Val@2026'"
        )

    # The login endpoint requires username + email + password
    login_url = f"{API_BASE}/api/auth/login/"
    payload = {"username": user, "email": email, "password": passwd}
    resp = session.post(login_url, json=payload, timeout=30)
    if resp.status_code == 429:
        raise RuntimeError(
            f"Login rate-limited (429). Wait 5 minutes and retry.\n{resp.text[:200]}"
        )
    if resp.status_code != 200:
        raise RuntimeError(f"Login failed [{resp.status_code}]: {resp.text[:300]}")

    data = resp.json()
    token = data.get("access") or data.get("token")
    if not token:
        raise RuntimeError(f"No token in login response: {list(data.keys())}")

    session.headers.update({"Authorization": f"Bearer {token}"})
    print(f"  [Auth] Authenticated as {user} ({email})")
    return token


def upload_invoice(session: requests.Session, file_entry: dict, upload_session_id: str) -> dict:
    """Upload a single invoice file and return the response dict."""
    fpath = file_entry["file_path"]
    fname = file_entry["filename"]
    mime = "application/pdf" if fname.lower().endswith(".pdf") else "image/jpeg"

    url = f"{API_BASE}/api/ocr-staging/"
    t_start = time.time()

    with open(fpath, "rb") as f:
        files = [("files", (fname, f, mime))]
        data = {
            "voucher_type": "PURCHASE",
            "upload_type": "SPRINT3_VALIDATION",
            "upload_session_id": upload_session_id,
        }
        try:
            resp = session.post(url, files=files, data=data, timeout=120)
            elapsed = round(time.time() - t_start, 2)
            if resp.status_code in (200, 201, 202):
                try:
                    result = resp.json()
                except Exception:
                    result = {"raw": resp.text[:200]}
                return {
                    "filename": fname,
                    "upload_status": "OK",
                    "http_status": resp.status_code,
                    "job_id": result.get("job_id") or result.get("id"),
                    "record_id": result.get("record_id") or result.get("id"),
                    "upload_elapsed_s": elapsed,
                    "response": result,
                }
            else:
                return {
                    "filename": fname,
                    "upload_status": "HTTP_ERROR",
                    "http_status": resp.status_code,
                    "error": resp.text[:500],
                    "upload_elapsed_s": elapsed,
                }
        except Exception as e:
            return {
                "filename": fname,
                "upload_status": "EXCEPTION",
                "error": str(e)[:300],
                "upload_elapsed_s": round(time.time() - t_start, 2),
            }


def poll_job_status(session: requests.Session, job_id: str, filename: str) -> dict:
    """Poll /api/ocr-job-status/<job_id>/ until terminal or timeout."""
    if not job_id:
        return {"final_status": "NO_JOB_ID", "terminal": True, "poll_count": 0}

    url = f"{API_BASE}/api/ocr-job-status/{job_id}/"
    deadline = time.time() + SESSION_POLL_TIMEOUT_S
    last_status = "UNKNOWN"
    poll_count = 0
    TERMINAL_STATES = {"COMPLETED", "FAILED", "ERROR", "HYDRATION_READY",
                       "VOUCHER_CREATED", "SUCCESS", "CANCELLED"}

    while time.time() < deadline:
        try:
            resp = session.get(url, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                last_status = (data.get("status") or data.get("pipeline_status",
                               data.get("state", "UNKNOWN"))).upper()
                terminal = data.get("terminal", last_status in TERMINAL_STATES)
                progress = data.get("progress", data.get("completion_pct", 0))

                if poll_count % 12 == 0:   # Print every 60s
                    print(f"    [{filename}] job={job_id[:8]}... status={last_status} "
                          f"progress={progress}% terminal={terminal}")

                if terminal or last_status in TERMINAL_STATES:
                    return {
                        "final_status": last_status,
                        "terminal": True,
                        "poll_count": poll_count,
                        "session_data": data,
                    }
            elif resp.status_code == 404:
                # Job might use record_id-based status endpoint
                return {"final_status": "JOB_NOT_FOUND", "terminal": True,
                        "poll_count": poll_count, "session_data": {}}
        except Exception as e:
            if poll_count % 12 == 0:
                print(f"    [{filename}] Poll error: {e}")

        time.sleep(SESSION_POLL_INTERVAL_S)
        poll_count += 1

    return {
        "final_status": "TIMEOUT",
        "terminal": False,
        "poll_count": poll_count,
        "session_data": {},
    }


def run_batch_upload():
    print(f"\n{'='*60}")
    print("SPRINT 3 — PHASE 2: BATCH UPLOAD")
    print(f"{'='*60}")

    manifest = load_manifest()
    batch_session_id = manifest["session_id"]
    invoice_files = manifest["files"]

    print(f"Batch session ID : {batch_session_id}")
    print(f"Total invoices   : {len(invoice_files)}")
    print(f"API Base         : {API_BASE}")
    print()

    session = requests.Session()

    # Authenticate
    print("[AUTH] Logging in ...")
    try:
        authenticate(session)
    except RuntimeError as e:
        print(f"\n[FATAL] {e}")
        sys.exit(1)
    print()

    results = []
    success_count = 0
    failure_count = 0

    for i, entry in enumerate(invoice_files, 1):
        fname = entry["filename"]
        print(f"[{i:02d}/{len(invoice_files)}] Uploading: {fname}")

        # Upload
        upload_result = upload_invoice(session, entry, batch_session_id)
        upload_status = upload_result.get("upload_status", "UNKNOWN")
        print(f"  Upload: {upload_status} (HTTP {upload_result.get('http_status', '-')}) "
              f"in {upload_result.get('upload_elapsed_s', '?')}s")

        pipeline_result = {}
        if upload_status == "OK":
            job_id = upload_result.get("job_id") or upload_result.get("record_id", "")
            print(f"  Polling job {job_id[:8] if job_id else 'N/A'}... (max {SESSION_POLL_TIMEOUT_S//60} min)")
            pipeline_result = poll_job_status(session, str(job_id), fname)
            final_status = pipeline_result.get("final_status", "UNKNOWN")
            print(f"  Pipeline: {final_status} (polls={pipeline_result.get('poll_count', 0)})")

            if final_status in {"COMPLETED", "HYDRATION_READY", "SUCCESS", "VOUCHER_CREATED"}:
                success_count += 1
            else:
                failure_count += 1
                print(f"  [WARN] Invoice did not complete successfully: {final_status}")
        else:
            failure_count += 1

        record = {
            "index": i,
            "filename": fname,
            "file_hash": entry["file_hash_sha256"],
            "page_count": entry["page_count"],
            "upload": upload_result,
            "pipeline": pipeline_result,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        results.append(record)
        print()

    # Write results
    batch_results = {
        "session_id": batch_session_id,
        "total_invoices": len(invoice_files),
        "success_count": success_count,
        "failure_count": failure_count,
        "success_rate_pct": round(success_count / len(invoice_files) * 100, 1),
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "results": results,
    }

    out_path = os.path.join(OUTPUT_DIR, "BATCH_UPLOAD_RESULTS.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(batch_results, f, indent=2, ensure_ascii=False)

    print(f"{'='*60}")
    print(f"BATCH UPLOAD COMPLETE")
    print(f"  Total    : {len(invoice_files)}")
    print(f"  Success  : {success_count}")
    print(f"  Failures : {failure_count}")
    print(f"  Rate     : {batch_results['success_rate_pct']}%")
    print(f"  Results  : {out_path}")

    return batch_results


if __name__ == "__main__":
    run_batch_upload()
