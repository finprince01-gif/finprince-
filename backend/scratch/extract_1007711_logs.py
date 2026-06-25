import os

log_path = r"c:\108\AI-accounting-0.03\backend\logs\debug.log"
out_path = r"c:\108\AI-accounting-0.03\backend\scratch\1007711_raw_logs.txt"
session_id = "fdce9a70-4459-4f99-85bb-e7fe14ab95e1"
record_id = "1007711"

print(f"Extracting logs for record {record_id} / session {session_id}...")
count = 0
with open(log_path, "r", encoding="utf-8", errors="ignore") as infile:
    with open(out_path, "w", encoding="utf-8") as outfile:
        for line in infile:
            if record_id in line or session_id in line:
                outfile.write(line)
                count += 1

print(f"[OK] Extracted {count} lines to {out_path}")
