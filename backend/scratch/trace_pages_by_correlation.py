import re
import sys

sys.stdout.reconfigure(encoding='utf-8')
log_path = r"C:\108\AI-accounting-0.03\backend\scratch\1007697_raw_logs.txt"

with open(log_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Pass 1: Find correlation IDs for each page of 1007697
# Look for lines containing "AI_TASK_ENQUEUED" or "CANONICAL_MESSAGE_EMITTED"
page_corr = {}
corr_page = {}

for idx, line in enumerate(lines):
    if "[AI_TASK_ENQUEUED]" in line:
        m_page = re.search(r"page=(\d+)", line)
        if m_page:
            p = int(m_page.group(1))
            # Find the correlation ID in surrounding lines
            # Search for CANONICAL_MESSAGE_EMITTED or WORKER_MESSAGE_RECEIVED in subsequent/previous lines
            # Let's search lines within 5 index offset
            thread_match = re.search(r"extraction (\d+ \d+)", line)
            if thread_match:
                thread_id = thread_match.group(1)
                for j in range(max(0, idx - 10), min(len(lines), idx + 10)):
                    sub_line = lines[j]
                    if "[CANONICAL_MESSAGE_EMITTED]" in sub_line and thread_id in sub_line:
                        m_corr = re.search(r"corr=([a-f0-9\-]+)", sub_line)
                        if m_corr:
                            corr = m_corr.group(1)
                            page_corr[p] = corr
                            corr_page[corr] = p
                            break

print("Discovered Page to Correlation ID mappings:")
for p, corr in sorted(page_corr.items()):
    print(f"Page {p} -> Correlation ID: {corr}")

# Now let's group all logs in raw logs by correlation ID and analyze each page's history
for p in range(1, 17):
    corr = page_corr.get(p)
    print(f"\n================================ PAGE {p} TRACE (Correlation: {corr}) ================================")
    if not corr:
        print("No correlation ID found in logs.")
        # Try to find logs by searching for "page=p" or "page_number=p"
        p_logs = [line.strip() for line in lines if f"page={p}" in line or f"page_number={p}" in line or f"PAGE_NUMBER={p}" in line]
        for line in p_logs[:15]:
            print(line)
        continue

    # Find all logs containing this correlation ID or associated task ID
    p_logs = []
    task_id = None
    for line in lines:
        if corr in line:
            p_logs.append(line.strip())
            # Extract task ID if present
            if "[AI_TASK_ENQUEUED]" in line:
                m_task = re.search(r"task=(\S+)", line)
                if m_task:
                    task_id = m_task.group(1)

    if task_id:
        # Append logs containing task ID too
        for line in lines:
            if task_id in line and line.strip() not in p_logs:
                p_logs.append(line.strip())

    # Sort logs by timestamp / line index in original file to keep chronology
    p_logs_sorted = []
    for line in lines:
        line_s = line.strip()
        if line_s in p_logs:
            p_logs_sorted.append(line_s)
            p_logs.remove(line_s)
    # Append any remaining
    p_logs_sorted.extend(p_logs)

    for line in p_logs_sorted:
        print(line)
