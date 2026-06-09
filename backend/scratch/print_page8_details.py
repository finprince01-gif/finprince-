import os

log_path = "backend/logs/debug.log"
record_id = "1005235"

if os.path.exists(log_path):
    print(f"Extracting logs for record {record_id} involving page 8...")
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            if record_id in line and ("page_number=8" in line or "page_no=8" in line or "page=8" in line or "page_number=7" in line or "page_no=7" in line or "page=7" in line):
                print(line.strip())
else:
    print("No log file found.")
