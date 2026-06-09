import os

log_path = "backend/logs/debug.log"
if os.path.exists(log_path):
    print("Searching debug.log...")
    count = 0
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        # Read last 3MB of log
        f.seek(0, os.SEEK_END)
        size = f.tell()
        f.seek(max(0, size - 3*1024*1024))
        for line in f:
            if "INVALID_PREASSEMBLY" in line or "SUMMARY_ONLY" in line or "DTO_SEMANTIC_REJECTED" in line:
                print(line.strip())
                count += 1
                if count > 50:
                    break
else:
    print(f"{log_path} does not exist!")
