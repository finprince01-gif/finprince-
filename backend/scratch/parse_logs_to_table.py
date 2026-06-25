import re
import sys
import os
import django

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

log_path = r"C:\108\AI-accounting-0.03\backend\scratch\1007697_raw_logs.txt"
record_id = "1007697"

with open(log_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

print(f"Total raw lines: {len(lines)}")

pages = {p: {} for p in range(1, 17)}

for p in range(1, 17):
    p_data = {
        "page": p,
        "task_id": "None",
        "sqs_msg_id": "None",
        "receive_count": "None",
        "permit_result": "None",
        "qwen_exec": "None",
        "saved_db": "N",
        "barrier_reg": "N",
        "assembly_elg": "N",
        "final_status": "UNKNOWN"
    }
    pages[p] = p_data

for idx, line in enumerate(lines):
    # Enqueue events
    if "[AI_TASK_ENQUEUED]" in line:
        m = re.search(r"page=(\d+) task=(\S+)", line)
        if m:
            p = int(m.group(1))
            task_id = m.group(2)
            if p in pages:
                pages[p]["task_id"] = task_id
                
                thread_match = re.search(r"extraction (\d+ \d+)", line)
                if thread_match:
                    thread_id = thread_match.group(1)
                    for j in range(idx + 1, min(idx + 15, len(lines))):
                        sub_line = lines[j]
                        if "[SQS_SERIALIZATION_PAYLOAD]" in sub_line and thread_id in sub_line:
                            m_msg = re.search(r"message_id=([a-f0-9\-]+)", sub_line)
                            if m_msg:
                                pages[p]["sqs_msg_id"] = m_msg.group(1)
                                break
                                
    # Message pickup / receive
    if "[QUEUE_MESSAGE_RECEIVED]" in line:
        m = re.search(r"page_number=(\d+)", line)
        if m:
            p = int(m.group(1))
            if p in pages:
                thread_match = re.search(r"worker_base (\d+ \d+)", line)
                if thread_match:
                    thread_id = thread_match.group(1)
                    for j in range(max(0, idx - 5), min(len(lines), idx + 5)):
                        sub_line = lines[j]
                        if "[WORKER_MESSAGE_RECEIVED]" in sub_line and thread_id in sub_line:
                            m_rc = re.search(r"retry_count=(\d+)", sub_line)
                            if m_rc:
                                pages[p]["receive_count"] = m_rc.group(1)
                                break

    # Slot acquisition
    if "[SLOT_ACQUIRED]" in line:
        m = re.search(r"page_number=(\d+)", line)
        if m:
            p = int(m.group(1))
            if p in pages:
                pages[p]["permit_result"] = "ACQUIRED"
    elif "[SLOT_ACQUIRE_FAILED]" in line:
        m = re.search(r"page_number=(\d+)", line)
        if m:
            p = int(m.group(1))
            if p in pages:
                pages[p]["permit_result"] = "DENIED"

    # Concurrency permit (ProviderSaturatedError check)
    if "ProviderSaturatedError" in line:
        thread_match = re.search(r"ai_worker (\d+ \d+)|worker_base (\d+ \d+)", line)
        if thread_match:
            thread_id = thread_match.group(1) or thread_match.group(2)
            for j in range(idx - 10, idx):
                sub_line = lines[j]
                if "[AI_PAGE_START]" in sub_line and thread_id in sub_line:
                    m_p = re.search(r"page=(\d+)", sub_line)
                    if m_p:
                        p = int(m_p.group(1))
                        if p in pages:
                            pages[p]["permit_result"] = "DENIED (ProviderSaturated)"
                            pages[p]["final_status"] = "FAILED (Saturation)"
                            break

    # Qwen execution
    if "[QWEN_REQUEST_START]" in line:
        thread_match = re.search(r"qwen_provider (\d+ \d+)", line)
        if thread_match:
            thread_id = thread_match.group(1)
            for j in range(idx - 10, idx):
                sub_line = lines[j]
                if "[AI_MODEL_SELECTED]" in sub_line and thread_id in sub_line:
                    m_p = re.search(r"page_number=(\d+)", sub_line)
                    if m_p:
                        p = int(m_p.group(1))
                        if p in pages:
                            pages[p]["qwen_exec"] = "STARTED"
                            break
                            
    if "[QWEN_REQUEST_COMPLETE]" in line or "[QWEN_DURATION]" in line:
        thread_match = re.search(r"qwen_provider (\d+ \d+)", line)
        if thread_match:
            thread_id = thread_match.group(1)
            for j in range(idx - 15, idx):
                sub_line = lines[j]
                if "[AI_MODEL_SELECTED]" in sub_line and thread_id in sub_line:
                    m_p = re.search(r"page_number=(\d+)", sub_line)
                    if m_p:
                        p = int(m_p.group(1))
                        if p in pages:
                            pages[p]["qwen_exec"] = "COMPLETE"
                            break

    if "[GPU_GUARD_ABORT]" in line or "[QWEN_API_ERROR]" in line:
        thread_match = re.search(r"qwen_provider (\d+ \d+)", line)
        if thread_match:
            thread_id = thread_match.group(1)
            for j in range(idx - 15, idx):
                sub_line = lines[j]
                if "[AI_MODEL_SELECTED]" in sub_line and thread_id in sub_line:
                    m_p = re.search(r"page_number=(\d+)", sub_line)
                    if m_p:
                        p = int(m_p.group(1))
                        if p in pages:
                            pages[p]["qwen_exec"] = "FAILED (CPU_ONLY)"
                            pages[p]["final_status"] = "FAILED (GPU Guard)"
                            break

    # DB saving
    if "[AI_TASK_COMPLETE]" in line:
        m = re.search(r"page=(\d+) .*? status=(\S+)", line)
        if m:
            p = int(m.group(1))
            status = m.group(2)
            if p in pages:
                pages[p]["saved_db"] = "Y"
                pages[p]["final_status"] = status

    # Assembly eligibility
    if "[CANONICAL_BARRIER_REACHED]" in line:
        m = re.search(r"page=(\d+)", line)
        if m:
            p = int(m.group(1))
            if p in pages:
                pages[p]["assembly_elg"] = "Y"

for p in range(1, 17):
    p_str_1 = f"page_number={p}"
    p_str_2 = f"page={p}"
    p_str_3 = f"PAGE_NUMBER={p}"
    
    for line in lines:
        if p_str_1 in line or p_str_2 in line or p_str_3 in line:
            if "SLOT_ACQUIRED" in line:
                pages[p]["permit_result"] = "ACQUIRED"
            elif "[SLOT_ACQUIRE_FAILED]" in line:
                pages[p]["permit_result"] = "DENIED"
            elif "[ZOMBIE_MESSAGE_DETECTED]" in line:
                pages[p]["final_status"] = "ZOMBIE (DLQ)"
            elif "[MESSAGE_DLQ_REDIRECT]" in line:
                pages[p]["final_status"] = "DLQ_REDIRECT"
            elif "exceeded 120s timeout" in line or "exceeded 900s timeout" in line:
                pages[p]["final_status"] = "WATCHDOG_TIMEOUT"

from ocr_pipeline.models import InvoicePageResult, PoisonDocument
for p in range(1, 17):
    if InvoicePageResult.objects.filter(record_id=record_id, page_number=p).exists():
        pages[p]["saved_db"] = "Y"
        pages[p]["barrier_reg"] = "Y"
        r = InvoicePageResult.objects.get(record_id=record_id, page_number=p)
        pages[p]["final_status"] = "SUCCESS" if not r.is_failed else "FAILED"
    
    for pd in PoisonDocument.objects.filter(record_id=record_id):
        payload = pd.payload or {}
        p_num = payload.get("page_number") or payload.get("page_index")
        if p_num and int(p_num) == p:
            pages[p]["final_status"] = "QUARANTINED (DLQ)"
            pages[p]["saved_db"] = "N"
            pages[p]["barrier_reg"] = "N"

# Print markdown table
print("\n| Page | Queue Message ID | Receive Counts | Permit Result | Qwen Exec | Saved DB? | Barrier Reg? | Assembly Eligible? | Final Status |")
print("|---|---|---|---|---|---|---|---|---|")
for p in range(1, 17):
    pd = pages[p]
    print(f"| {p} | {pd['sqs_msg_id']} | {pd['receive_count']} | {pd['permit_result']} | {pd['qwen_exec']} | {pd['saved_db']} | {pd['barrier_reg']} | {pd['assembly_elg']} | {pd['final_status']} |")
