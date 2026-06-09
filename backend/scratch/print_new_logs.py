import os

log_path = "backend/logs/debug.log"

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

if os.path.exists(log_path):
    print("Searching debug.log for new logs...")
    found = False
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
        for line in lines[-3000:]:
            if any(kw in line for kw in keywords):
                print(line.strip())
                found = True
    if not found:
        print("No matching logs found in the last 3000 lines.")
else:
    print(f"{log_path} does not exist!")
