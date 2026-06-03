import os

log_path = r"c:\108\AI-accounting-0.03\backend\logs\debug.log"
if os.path.exists(log_path):
    with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()
    
    print(f"Total lines: {len(lines)}")
    # Print the last 30 classification decisions
    classifications = [line.strip() for line in lines if "[PAGE_ROLE_CLASSIFIED]" in line]
    print(f"Total classification log entries: {len(classifications)}")
    for c in classifications[-15:]:
        print(c)
else:
    print("Log file not found.")
