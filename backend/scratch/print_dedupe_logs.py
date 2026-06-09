import os

log_path = "backend/logs/debug.log"

if os.path.exists(log_path):
    print("Searching debug.log for dedupe and cleanup events...")
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            if any(term in line for term in ["ITEM_CLEANUP_GUARD", "CONTINUATION_PAGE_REJECTED", "SUMMARY_ROW_DROPPED", "FINAL_INVENTORY_ITEMS", "FORENSIC_CANONICAL_DTO"]):
                print(line.strip())
else:
    print(f"{log_path} does not exist!")
