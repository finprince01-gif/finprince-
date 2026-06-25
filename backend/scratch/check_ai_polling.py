import os
import re

log_path = r"c:\108\AI-accounting-0.03\backend\logs\debug.log"

print("Checking AI polling after 12:30...")
if os.path.exists(log_path):
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
        
    ai_lines = []
    for line in lines:
        if "2026-06-22 12:3" in line or "2026-06-22 12:4" in line or "2026-06-22 12:5" in line or "2026-06-22 13:" in line or "2026-06-22 14:" in line:
            if "queue=ai" in line or "role=AI" in line or "ai_worker" in line:
                if any(x in line for x in ["RECEIVED", "SUCCESS", "POLLING", "PICKUP"]):
                    # filter out the repetitive check loop prints unless important
                    ai_lines.append(line.strip())
                    
    print(f"Total AI polling/received lines: {len(ai_lines)}")
    for line in ai_lines[:100]:
        print(line)
    if len(ai_lines) > 100:
        print(f"... and {len(ai_lines) - 100} more lines")
else:
    print("Log not found.")
