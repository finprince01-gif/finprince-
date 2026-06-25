import os
import re

log_path = r"c:\108\AI-accounting-0.03\backend\logs\debug.log"
output_path = r"c:\108\AI-accounting-0.03\backend\scratch\page13_trace.txt"

print("Parsing debug.log for Page 13 events...")
if os.path.exists(log_path):
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        log_content = f.read()
        
    lines = log_content.splitlines()
    relevant_lines = []
    
    p13_msgs = set()
    p13_corrs = set()
    
    for line in lines:
        if "1007715" in line:
            if re.search(r"\b13\b", line) or "page=13" in line or "page_number=13" in line:
                relevant_lines.append(line)
                m_msg = re.search(r"message_id=([a-f0-9\-]+)|msg_id=([a-f0-9\-]+)|id=([a-f0-9\-]+)", line)
                if m_msg:
                    p13_msgs.add(m_msg.group(1) or m_msg.group(2) or m_msg.group(3))
                m_corr = re.search(r"correlation_id=([a-f0-9\-]+)|corr=([a-f0-9\-]+)", line)
                if m_corr:
                    p13_corrs.add(m_corr.group(1) or m_corr.group(2))
                    
    print(f"Direct page 13 references found: {len(relevant_lines)}")
    print("Found Page 13 Message IDs:", p13_msgs)
    print("Found Page 13 Correlation IDs:", p13_corrs)
    
    indirect_lines = []
    for line in lines:
        matched = False
        for msg_id in p13_msgs:
            if msg_id and msg_id in line:
                matched = True
                break
        if not matched:
            for corr_id in p13_corrs:
                if corr_id and corr_id in line:
                    matched = True
                    break
        if matched:
            indirect_lines.append(line)
            
    print(f"Indirect references found: {len(indirect_lines)}")
    
    all_lines = list(set(relevant_lines + indirect_lines))
    
    def extract_time(line):
        time_match = re.search(r"(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2},\d{3})|(\d{2}:\d{2}:\d{2},\d{3})", line)
        return time_match.group(0) if time_match else ""
        
    all_lines.sort(key=extract_time)
    
    with open(output_path, "w", encoding="utf-8") as out:
        out.write(f"Direct references: {len(relevant_lines)}\n")
        out.write(f"Indirect references: {len(indirect_lines)}\n")
        out.write(f"Unique message IDs: {p13_msgs}\n")
        out.write(f"Unique correlation IDs: {p13_corrs}\n\n")
        for line in all_lines:
            # We don't want to dump all the empty poll lines if they aren't directly related, 
            # but let's write all matched lines to the trace file
            out.write(line + "\n")
            
    print(f"[OK] Wrote {len(all_lines)} lines to {output_path}")
else:
    print("Log file not found.")
