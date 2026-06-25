import json
import os
import re

# Paths
telemetry_path = r"c:\108\AI-accounting-0.03\backend\scratch\telemetry_stress.json"
log_path = r"c:\108\AI-accounting-0.03\backend\logs\debug.log"

print("Parsing Telemetry...")
if os.path.exists(telemetry_path):
    with open(telemetry_path, 'r') as f:
        data = json.load(f)
    
    cpus = []
    rams_pct = []
    gpus_util = []
    vrams_used = []
    gpu_temps = []
    gpu_powers = []
    
    for entry in data:
        try:
            cpus.append(float(entry.get('cpu_util_pct', 0)))
            rams_pct.append(float(entry.get('ram_util_pct', 0)))
            
            gpu_data = entry.get('gpu', {})
            if gpu_data:
                gpus_util.append(float(gpu_data.get('gpu_util_pct', 0)))
                vrams_used.append(float(gpu_data.get('vram_used_mib', 0)))
                gpu_temps.append(float(gpu_data.get('temp_c', 0)))
                gpu_powers.append(float(gpu_data.get('power_w', 0)))
        except (ValueError, TypeError) as e:
            continue
            
    if cpus:
        print(f"Total entries: {len(data)}")
        print(f"Peak CPU Util: {max(cpus):.2f}%")
        print(f"Avg CPU Util: {sum(cpus)/len(cpus):.2f}%")
        print(f"Peak RAM Util: {max(rams_pct):.2f}%")
        print(f"Avg RAM Util: {sum(rams_pct)/len(rams_pct):.2f}%")
        print(f"Peak GPU Util: {max(gpus_util):.2f}%")
        print(f"Avg GPU Util: {sum(gpus_util)/len(gpus_util):.2f}%")
        print(f"Peak VRAM Used: {max(vrams_used):.2f} MiB")
        print(f"Avg VRAM Used: {sum(vrams_used)/len(vrams_used):.2f} MiB")
        print(f"Peak GPU Temp: {max(gpu_temps):.2f} C")
        print(f"Peak GPU Power Draw: {max(gpu_powers):.2f} W")
    else:
        print("No valid numeric entries found in telemetry.")
else:
    print("Telemetry file not found.")

print("\nParsing debug.log for Record 1007715...")
if os.path.exists(log_path):
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        log_content = f.read()
        
    lines = log_content.splitlines()
    print(f"Total log lines: {len(lines)}")
    
    # Filter lines for record/session/job
    relevant_lines = []
    for line in lines:
        if "1007715" in line or "6a07a001-99a2-4c57-949e-bd1ac66d8e67" in line or "0a89d92c-87e4-4630-ab51-0e03af0269e1" in line:
            relevant_lines.append(line)
            
    print(f"Relevant log lines: {len(relevant_lines)}")
    
    # Analyze page transitions
    page_starts = {}
    page_completes = {}
    page_failures = []
    
    for line in relevant_lines:
        time_match = re.search(r"(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2},\d{3})|(\d{2}:\d{2}:\d{2},\d{3})", line)
        t_str = time_match.group(0) if time_match else ""
        
        # Look for events related to page start/completion/failure
        # Examples: [AI_PAGE_START], [AI_PAGE_SUCCESS], [WORKER_MESSAGE_RECEIVED]
        if "AI_PAGE_START" in line or "AI_START" in line:
            m = re.search(r"page=(\d+)", line)
            if m:
                p = int(m.group(1))
                page_starts.setdefault(p, []).append(t_str)
        elif "AI_PAGE_SUCCESS" in line or "AI_SUCCESS" in line or "AI_COMPLETE" in line:
            m = re.search(r"page=(\d+)", line)
            if m:
                p = int(m.group(1))
                page_completes.setdefault(p, []).append(t_str)
        elif "ProviderSaturatedError" in line:
            # Let's see if we can find page number
            m = re.search(r"page=(\d+)", line)
            p = int(m.group(1)) if m else None
            # If no page= in line, search surrounding text or log line
            if not p:
                m2 = re.search(r"page_number=(\d+)", line)
                p = int(m2.group(1)) if m2 else None
            page_failures.append((t_str, p, "ProviderSaturatedError"))
        elif "zombie" in line or "PoisonDocument" in line:
            page_failures.append((t_str, None, "Zombie / Poison"))
            
    print("\n--- Page Starts ---")
    for p in sorted(page_starts.keys()):
        print(f"Page {p}: Starts={page_starts[p]}")
        
    print("\n--- Page Completes ---")
    for p in sorted(page_completes.keys()):
        print(f"Page {p}: Completes={page_completes[p]}")
        
    print("\n--- Failures ---")
    for t_str, p, err in page_failures[:20]:
        print(f"Time={t_str} | Page={p} | Err={err}")
    if len(page_failures) > 20:
        print(f"... and {len(page_failures) - 20} more failures")

else:
    print("Log file not found.")
