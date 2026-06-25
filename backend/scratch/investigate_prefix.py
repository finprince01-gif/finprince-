import re

log_path = r"C:\108\AI-accounting-0.03\backend\logs\debug.log"

# We want to find the log lines around [PREFIX_CACHE_TELEMETRY] for 1007697
# especially for page 5 (hash starting with 0d4e) vs page 6 (hash starting with 9e3d)
# and for 1007700 page 5 vs page 4.

with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

print(f"Total lines in log: {len(lines)}")

# Let's search for log lines containing the telemetries
telemetries = []
for idx, line in enumerate(lines):
    if "PREFIX_CACHE_TELEMETRY" in line:
        telemetries.append((idx, line))

print(f"Found {len(telemetries)} telemetry lines.")

# Let's print the telemetry lines and some lines around them
for idx, line in telemetries:
    if "1007697" in line and ("PAGE_NUMBER=5" in line or "PAGE_NUMBER=6" in line):
        print(f"Line {idx}: {line.strip()}")
        # Let's print 10 lines before and after
        print("--- BEFORE ---")
        for i in range(max(0, idx-15), idx):
            print(f"  [{i}]: {lines[i].strip()}")
        print("--- AFTER ---")
        for i in range(idx+1, min(len(lines), idx+15)):
            print(f"  [{i}]: {lines[i].strip()}")
        print("="*80)

    if "1007700" in line and ("PAGE_NUMBER=4" in line or "PAGE_NUMBER=5" in line):
        print(f"Line {idx}: {line.strip()}")
        # Let's print 10 lines before and after
        print("--- BEFORE ---")
        for i in range(max(0, idx-15), idx):
            print(f"  [{i}]: {lines[i].strip()}")
        print("--- AFTER ---")
        for i in range(idx+1, min(len(lines), idx+15)):
            print(f"  [{i}]: {lines[i].strip()}")
        print("="*80)
