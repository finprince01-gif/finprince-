import os

trace_path = r"c:\108\AI-accounting-0.03\backend\scratch\page13_trace.txt"

print("Filtering Page 13 trace file...")
if os.path.exists(trace_path):
    with open(trace_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    p13_lines = []
    for line in lines:
        # Filter out generic polling lines that matched because of thread ID '17268' or similar
        # only keep lines that are about page 13, its message IDs, or correlation IDs.
        # Direct IDs: '6150ef78-6b6b-450b-9af0-f5a134dc91cc', '9193c682-cdfc-4028-8b3d-0a69540e49dc'
        if any(x in line for x in ["page=13", "page_number=13", "page 13", "6150ef78-6b6b-450b-9af0-f5a134dc91cc", "9193c682-cdfc-4028-8b3d-0a69540e49dc"]):
            p13_lines.append(line.strip())
            
    print(f"Total direct page 13 lines: {len(p13_lines)}")
    for line in p13_lines:
        print(line)
else:
    print("Trace file not found.")
