import re

log_path = r"C:\108\AI-accounting-0.03\backend\logs\debug.log"
out_path = r"c:\108\AI-accounting-0.03\backend\sprint3_validation\reports\prefix_analysis.txt"

with open(log_path, "r", encoding="utf-8", errors="ignore") as f, open(out_path, "w", encoding="utf-8") as out:
    for line in f:
        if "[PREFIX_CACHE_TELEMETRY]" in line:
            out.write(line)
print("Extracted prefix telemetry!")
