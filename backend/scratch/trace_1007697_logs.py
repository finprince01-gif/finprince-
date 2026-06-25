import os
import sys

sys.stdout.reconfigure(encoding='utf-8')
log_path = r"C:\108\AI-accounting-0.03\backend\logs\debug.log"
out_path = r"C:\108\AI-accounting-0.03\backend\scratch\1007697_raw_logs.txt"
record_id = "1007697"

with open(log_path, "r", encoding="utf-8", errors="ignore") as f, open(out_path, "w", encoding="utf-8") as out:
    for line in f:
        if record_id in line:
            out.write(line)

print(f"Extracted matching logs to {out_path}")
