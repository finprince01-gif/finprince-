import os
import glob

log_dir = "backend/logs"
log_files = glob.glob(os.path.join(log_dir, "*.log"))

print("All traces:")
for log_path in log_files:
    fname = os.path.basename(log_path)
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            if "ITEM_TRACE" in line or "ITEM_LOSS" in line:
                print(line.strip())
