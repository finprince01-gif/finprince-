import os
import glob

log_dir = "backend/logs"
log_files = glob.glob(os.path.join(log_dir, "*.log"))

keywords = [
    "[GROUPING_INPUT]",
    "[GROUPING_DECISION]",
    "[GROUPING_GSTIN_COMPARE]",
    "[GROUP_RESULT]",
    "[CLEANUP_DECISION]",
    "[ITEM_LOSS_DETECTED]",
    "[CURRENT_DECISION]",
    "[COUNTERFACTUAL_DECISION]",
    "[COUNTERFACTUAL_SUMMARY]"
]

print(f"Searching in {len(log_files)} files...")
for path in log_files:
    filename = os.path.basename(path)
    if not os.path.exists(path):
        continue
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        # Since files can be large, read line by line but filter
        for line in f:
            if any(kw in line for kw in keywords):
                print(f"[{filename}] {line.strip()}")
