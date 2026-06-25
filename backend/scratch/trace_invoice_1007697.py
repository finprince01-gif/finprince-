import re
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')
log_path = r"C:\108\AI-accounting-0.03\backend\logs\debug.log"
record_id = "1007697"

with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

print(f"Total log lines: {len(lines)}")

# We want to search for occurrences of 1007697 and examine what events happened for pages 1 to 16.
# Let's group lines by page number
page_logs = {p: [] for p in range(1, 17)}
general_logs = []

for line in lines:
    if record_id in line:
        # Check if page is mentioned
        m_page = re.search(r"page_number=(\d+)|page=(\d+)|PAGE_NUMBER=(\d+)", line)
        if m_page:
            p_num = int(m_page.group(1) or m_page.group(2) or m_page.group(3))
            if p_num in page_logs:
                page_logs[p_num].append(line.strip())
        else:
            general_logs.append(line.strip())

# Print summary of logs per page
for p in range(1, 17):
    print(f"\n================ PAGE {p} (Total logs: {len(page_logs[p])}) ================")
    # Print first few and last few logs, or search for key events
    for line in page_logs[p]:
        # Filter for keys like MESSAGE_RECEIVED, SLOT_ACQUIRED, QWEN_REQUEST, TASK_COMPLETE, message_id, etc.
        if any(k in line for k in ["MESSAGE", "SLOT", "QWEN", "TASK", "BARRIER", "DLQ", "ZOMBIE", "NACK", "ProviderSaturatedError", "WINDOW"]):
            print(line)
