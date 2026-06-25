import os
import django
import sys
import re
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, InvoicePageResult, PoisonDocument

log_path = r"C:\108\AI-accounting-0.03\backend\logs\debug.log"
record_id = "1007697"

# We want to extract details for pages 1 to 16
pages_data = {}
for p in range(1, 17):
    pages_data[p] = {
        "page_number": p,
        "msg_ids": [],
        "receive_counts": [],
        "permits": [],
        "qwen_exec": [],
        "saved_db": "N",
        "barrier_reg": "N",
        "assembly_elg": "N",
        "final_status": "UNKNOWN"
    }

# Check database first
print("--- DATABASE CHECK ---")
db_results = InvoicePageResult.objects.filter(record_id=record_id)
print(f"Found {db_results.count()} page results in DB for {record_id}.")
for r in db_results:
    p = r.page_number
    if p in pages_data:
        pages_data[p]["saved_db"] = "Y"
        pages_data[p]["final_status"] = "SUCCESS" if not r.is_failed else "FAILED"

# Check PoisonDocument table (DLQ)
poison_docs = PoisonDocument.objects.filter(record_id=record_id)
print(f"Found {poison_docs.count()} poison documents in DB for {record_id}.")
for pd in poison_docs:
    # payload is JSON dict
    payload = pd.payload or {}
    p = payload.get("page_number") or payload.get("page_index")
    if p and int(p) in pages_data:
        pages_data[int(p)]["final_status"] = f"QUARANTINED (DLQ)"

# Scan logs for specific details
print("--- SCANNING LOGS ---")
with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    for line_no, line in enumerate(f, 1):
        if record_id in line:
            # Check if this line is about a specific page
            m_page = re.search(r"page_number=(\d+)|page=(\d+)|PAGE_NUMBER=(\d+)", line)
            if m_page:
                p = int(m_page.group(1) or m_page.group(2) or m_page.group(3))
                if p in pages_data:
                    # Message ID extraction
                    # e.g., msg_id=... or message_id=... or id=...
                    m_msg = re.search(r"message_id=([a-f0-9\-]+)|msg_id=([a-f0-9\-]+)|id=([a-f0-9\-]+)", line)
                    if m_msg:
                        msg_id = m_msg.group(1) or m_msg.group(2) or m_msg.group(3)
                        # Filter out non-UUID message ids if they are not matching SQS format
                        if len(msg_id) > 10 and "-" in msg_id and msg_id not in pages_data[p]["msg_ids"]:
                            pages_data[p]["msg_ids"].append(msg_id)

                    # Receive count
                    m_rc = re.search(r"retry_count=(\d+)|receive_count=(\d+)", line)
                    if m_rc:
                        rc = int(m_rc.group(1) or m_rc.group(2))
                        if rc not in pages_data[p]["receive_counts"]:
                            pages_data[p]["receive_counts"].append(rc)

                    # Permit acquisition
                    if "SLOT_ACQUIRED" in line or "slot acquisition granted" in line.lower():
                        pages_data[p]["permits"].append("ACQUIRED")
                    elif "SLOT_ACQUIRE_FAILED" in line or "slot acquisition denied" in line.lower() or "ProviderSaturatedError" in line:
                        pages_data[p]["permits"].append("DENIED")

                    # Qwen execution
                    if "QWEN_REQUEST_START" in line:
                        pages_data[p]["qwen_exec"].append("STARTED")
                    elif "QWEN_REQUEST_COMPLETE" in line or "QWEN_DURATION" in line:
                        pages_data[p]["qwen_exec"].append("COMPLETE")
                    elif "QWEN_API_ERROR" in line or "GPU_GUARD_ABORT" in line:
                        pages_data[p]["qwen_exec"].append("FAILED")

                    # Barrier registration
                    if "PAGE_STATE_TRANSITION" in line or "BARRIER_TERMINAL_PROGRESS" in line:
                        pages_data[p]["barrier_reg"] = "Y"

                    # Assembly eligibility
                    if "CANONICAL_BARRIER_REACHED" in line or "BARRIER_READY" in line:
                        pages_data[p]["assembly_elg"] = "Y"

# Print final page trace table in markdown format
print("\n| Page | Queue Message ID | Receive Counts | Permit Result | Qwen Exec | Saved DB? | Barrier Reg? | Assembly Eligible? | Final Status |")
print("|---|---|---|---|---|---|---|---|---|")
for p in range(1, 17):
    pd = pages_data[p]
    msg_id_str = ", ".join(pd["msg_ids"][:2]) if pd["msg_ids"] else "None"
    rc_str = ", ".join(map(str, sorted(pd["receive_counts"]))) if pd["receive_counts"] else "None"
    permit_str = "/".join(pd["permits"]) if pd["permits"] else "None"
    qwen_str = "/".join(pd["qwen_exec"]) if pd["qwen_exec"] else "None"
    
    # If final status is success or quarantined in DB
    status = pd["final_status"]
    
    print(f"| {p} | {msg_id_str} | {rc_str} | {permit_str} | {qwen_str} | {pd['saved_db']} | {pd['barrier_reg']} | {pd['assembly_elg']} | {status} |")
