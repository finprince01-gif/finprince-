import os

trace_path = r"c:\108\AI-accounting-0.03\backend\scratch\page13_trace.txt"

print("Checking trace after 12:30...")
if os.path.exists(trace_path):
    with open(trace_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    found_after = []
    for line in lines:
        if "2026-06-22 12:3" in line or "2026-06-22 12:4" in line or "2026-06-22 12:5" in line or "2026-06-22 13:" in line or "2026-06-22 14:" in line:
            # check if it contains page 13 or msg ID
            if "13" in line or "d1c9dc22" in line or "3f88013f" in line or "9193c682" in line:
                found_after.append(line.strip())
                
    print(f"Lines found after 12:30: {len(found_after)}")
    for line in found_after[:50]:
        print(line)
    if len(found_after) > 50:
        print(f"... and {len(found_after) - 50} more")
else:
    print("Trace file not found.")
