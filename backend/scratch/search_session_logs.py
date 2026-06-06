import os
import glob

log_dir = "backend/logs"
session_id = "68e2e29f-77b5-4ade-b40d-c76ca94e3cd1"
log_files = glob.glob(os.path.join(log_dir, "*.log"))

print(f"Scanning for session {session_id} and traces...")
for log_path in log_files:
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            if session_id in line or "ITEM_TRACE" in line or "ITEM_LOSS" in line:
                print(f"[{os.path.basename(log_path)}] {line.strip()}")
