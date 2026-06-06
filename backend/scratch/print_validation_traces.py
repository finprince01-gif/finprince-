import os

log_path = "backend/logs/debug.log"
session_id = "68e2e29f-77b5-4ade-b40d-c76ca94e3cd1"

if os.path.exists(log_path):
    print("Searching debug.log for validation events...")
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            if "INVENTORY_VAL" in line or "ITEM_EXTRACTION_RESULT" in line or "DTO_PRE_VALIDATION" in line:
                if session_id in line or "1005226" in line or "1005231" in line:
                    print(line.strip())
else:
    print(f"{log_path} does not exist!")
