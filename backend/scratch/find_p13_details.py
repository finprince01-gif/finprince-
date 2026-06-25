import os
import re

log_path = r"c:\108\AI-accounting-0.03\backend\logs\debug.log"

if os.path.exists(log_path):
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
        
    p13_lines = []
    for line in lines:
        if "1007715" in line and ("page=13" in line or "page_number=13" in line or "page 13" in line):
            p13_lines.append(line.strip())
            
    print(f"Direct Page 13 Lines Count: {len(p13_lines)}")
    # Print direct lines first
    for line in p13_lines[:40]:
        print(line)
        
    # Get all correlation IDs of page 13
    corrs = set()
    for line in p13_lines:
        m = re.search(r"correlation_id=([a-f0-9\-]+)|corr=([a-f0-9\-]+)", line)
        if m:
            corrs.add(m.group(1) or m.group(2))
            
    print(f"\nCorrelation IDs for Page 13: {corrs}")
    
    # Trace each correlation ID
    for corr in corrs:
        print(f"\n--- TRACE FOR CORRELATION {corr} ---")
        corr_lines = []
        for line in lines:
            if corr in line:
                corr_lines.append(line.strip())
        for line in corr_lines:
            print(line)
else:
    print("Log not found.")
