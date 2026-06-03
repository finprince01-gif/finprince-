import os

log_path = r"c:\108\AI-accounting-0.03\backend\logs\debug.log"
if os.path.exists(log_path):
    with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()
    
    keywords = [
        "[MULTIPAGE_ROLE_DECISION]",
        "[PAGE_ROLE_CLASSIFIED]",
        "[CONTINUATION_PAGE_ATTACHED]",
        "[NEW_INVOICE_CREATED]",
        "[DOCUMENT_GROUP_CREATED]",
        "[MERGE_DECISION]",
        "[INVOICE_BOUNDARY_DETECTED]",
        "[SAFE_MERGE_APPLIED]"
    ]
    
    # Extract only lines from the latest run (containing 10:40:11)
    latest_logs = []
    for line in lines:
        if "2026-06-03 10:40:11" in line:
            if any(kw in line for kw in keywords):
                latest_logs.append(line.strip())
                
    print(f"Total latest merge-related logs: {len(latest_logs)}")
    for log in latest_logs:
        print(log)
else:
    print("Log file not found.")
