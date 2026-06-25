import re

log_path = r"C:\108\AI-accounting-0.03\backend\scratch\1007697_raw_logs.txt"

with open(log_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

for p in [2, 3, 4, 5, 6, 7]:
    print(f"\n--- LOGS FOR PAGE {p} ---")
    p_pat = f"page={p}"
    p_pat_num = f"page_number={p}"
    p_pat_index = f"page_index={p}"
    p_pat_tel = f"PAGE_NUMBER={p}"
    
    count = 0
    for line in lines:
        if p_pat in line or p_pat_num in line or p_pat_index in line or p_pat_tel in line:
            print(line.strip())
            count += 1
            if count > 20:
                print("... truncated ...")
                break
