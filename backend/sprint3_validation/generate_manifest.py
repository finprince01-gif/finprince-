# -*- coding: utf-8 -*-
"""
Phase 0: Manifest Generator
===========================
Scans C:\\Users\\ulaganathan\\Downloads\\New folder (2) and builds
REAL_BATCH_MANIFEST.json with per-file metadata.

No source code modifications. Read-only observer.
"""
import os
import sys
import json
import hashlib
import uuid
import time
from datetime import datetime, timezone

INVOICE_DIR = r"C:\Users\ulaganathan\Downloads\New folder (2)"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "reports")
os.makedirs(OUTPUT_DIR, exist_ok=True)

SESSION_ID = str(uuid.uuid4())
SUPPORTED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif"}


def detect_invoice_type(file_path: str) -> str:
    """
    Heuristic: open PDF and check if it has embedded selectable text.
    If char count > 200 → digital; else → scanned.
    Falls back to 'SCANNED' for image formats.
    """
    ext = os.path.splitext(file_path)[1].lower()
    if ext != ".pdf":
        return "SCANNED_IMAGE"
    try:
        import pypdfium2 as pdfium
        doc = pdfium.PdfDocument(file_path)
        total_chars = 0
        for i in range(min(3, len(doc))):
            page = doc[i]
            text_page = page.get_textpage()
            total_chars += len(text_page.get_text_range())
            text_page.close()
            page.close()
        doc.close()
        return "DIGITAL_PDF" if total_chars > 200 else "SCANNED_PDF"
    except Exception as e:
        return f"UNKNOWN (error: {str(e)[:60]})"


def get_page_count(file_path: str) -> int:
    """Returns number of pages for PDF, 1 for images."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext != ".pdf":
        return 1
    try:
        import pypdfium2 as pdfium
        doc = pdfium.PdfDocument(file_path)
        count = len(doc)
        doc.close()
        return count
    except Exception:
        return -1


def compute_sha256(file_path: str) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def generate_manifest() -> dict:
    print(f"\n{'='*60}")
    print("SPRINT 3 — PHASE 0: MANIFEST GENERATION")
    print(f"{'='*60}")
    print(f"Invoice Directory : {INVOICE_DIR}")
    print(f"Session ID        : {SESSION_ID}")
    print()

    if not os.path.isdir(INVOICE_DIR):
        print(f"[ERROR] Invoice directory not found: {INVOICE_DIR}")
        sys.exit(1)

    entries = []
    all_files = sorted(os.listdir(INVOICE_DIR))
    invoice_files = [
        f for f in all_files
        if os.path.splitext(f)[1].lower() in SUPPORTED_EXTENSIONS
    ]

    print(f"Found {len(invoice_files)} invoice files.")
    print()

    for fname in invoice_files:
        fpath = os.path.join(INVOICE_DIR, fname)
        size_bytes = os.path.getsize(fpath)
        print(f"  Processing: {fname} ({size_bytes/1024/1024:.2f} MB) ...", end=" ", flush=True)

        page_count = get_page_count(fpath)
        invoice_type = detect_invoice_type(fpath)
        file_hash = compute_sha256(fpath)
        upload_ts = datetime.now(timezone.utc).isoformat()

        entry = {
            "filename": fname,
            "file_path": fpath,
            "page_count": page_count,
            "file_size_bytes": size_bytes,
            "file_size_mb": round(size_bytes / 1024 / 1024, 3),
            "invoice_type_detected": invoice_type,
            "file_hash_sha256": file_hash,
            "upload_timestamp": upload_ts,
            "processing_session_id": SESSION_ID,
            "status": "PENDING",
        }
        entries.append(entry)
        print(f"pages={page_count} type={invoice_type}")

    manifest = {
        "manifest_version": "3.0",
        "session_id": SESSION_ID,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "invoice_directory": INVOICE_DIR,
        "total_files": len(entries),
        "total_size_mb": round(sum(e["file_size_mb"] for e in entries), 2),
        "total_pages": sum(e["page_count"] for e in entries if e["page_count"] > 0),
        "invoice_type_breakdown": {
            "DIGITAL_PDF": sum(1 for e in entries if e["invoice_type_detected"] == "DIGITAL_PDF"),
            "SCANNED_PDF": sum(1 for e in entries if e["invoice_type_detected"] == "SCANNED_PDF"),
            "SCANNED_IMAGE": sum(1 for e in entries if e["invoice_type_detected"] == "SCANNED_IMAGE"),
        },
        "files": entries,
    }

    out_path = os.path.join(OUTPUT_DIR, "REAL_BATCH_MANIFEST.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    # Also save session_id for downstream scripts
    session_path = os.path.join(OUTPUT_DIR, "SESSION_ID.txt")
    with open(session_path, "w") as f:
        f.write(SESSION_ID)

    print()
    print(f"[OK] Manifest written: {out_path}")
    print(f"[OK] Session ID saved: {session_path}")
    print(f"\nSummary:")
    print(f"  Total files : {manifest['total_files']}")
    print(f"  Total pages : {manifest['total_pages']}")
    print(f"  Total size  : {manifest['total_size_mb']} MB")
    print(f"  Digital PDFs: {manifest['invoice_type_breakdown']['DIGITAL_PDF']}")
    print(f"  Scanned PDFs: {manifest['invoice_type_breakdown']['SCANNED_PDF']}")

    return manifest


if __name__ == "__main__":
    generate_manifest()
