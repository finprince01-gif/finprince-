import os

log_path = r"logs/debug.log"
record_id = "1007709"

print(f"=== SEARCHING SUCCESSFULLY COMPLETED PAGE LOGS FOR RECORD {record_id} ===")
matches = []
with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if record_id in line and ("PAGE_NUMBER" in line or "PREFIX_HASH" in line or "QWEN" in line or "ocr:text" in line or "OCR_CACHE" in line):
            matches.append(line.strip())
            
print(f"Found {len(matches)} matches.")
print("\nLast 50 matches:")
for m in matches[-50:]:
    print(m)
