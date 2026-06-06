import os
import re

log_path = "backend/logs/debug.log"

if os.path.exists(log_path):
    decisions = []
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            if "[COUNTERFACTUAL_DECISION]" in line:
                decisions.append(line.strip())
                
    # Find the last sequence of grouping decisions
    # Each run has multiple COUNTERFACTUAL_DECISION logs followed by a COUNTERFACTUAL_SUMMARY.
    # Let's count backwards from the end of the file.
    last_summary = None
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
        for line in reversed(lines):
            if "[COUNTERFACTUAL_SUMMARY]" in line:
                last_summary = line.strip()
                break
                
    print(f"Latest summary: {last_summary}")
    
    # Let's find the start of the latest run
    run_decisions = []
    found_summary = False
    for line in reversed(lines):
        if "[COUNTERFACTUAL_SUMMARY]" in line:
            if found_summary:
                break
            found_summary = True
        elif found_summary and "[COUNTERFACTUAL_DECISION]" in line:
            run_decisions.append(line.strip())
            
    run_decisions.reverse()
    
    print(f"Decisions count in latest run: {len(run_decisions)}")
    
    blocked_by_counts = {
        "PAGE_ROLE_PRIMARY": 0,
        "invoice mismatch": 0,
        "GSTIN mismatch": 0,
        "other": 0
    }
    
    resolved_counts = {
        "role_only": 0,
        "gstin_only": 0,
        "invoice_only": 0,
        "combined": 0
    }
    
    for d in run_decisions:
        # Extract first_blocking
        m_blocking = re.search(r"first_blocking='([^']+)'", d)
        if m_blocking:
            blocked_by_counts[m_blocking.group(1)] += 1
            
        # Extract resolutions
        if "would_group_role_only=True" in d:
            resolved_counts["role_only"] += 1
        if "would_group_gstin_only=True" in d:
            resolved_counts["gstin_only"] += 1
        if "would_group_invoice_only=True" in d:
            resolved_counts["invoice_only"] += 1
        if "would_group=True" in d:
            resolved_counts["combined"] += 1
            
    print("\nBlocked by first condition counts:")
    for k, v in blocked_by_counts.items():
        print(f"  {k}: {v}")
        
    print("\nResolved counts:")
    for k, v in resolved_counts.items():
        print(f"  {k}: {v}")
        
else:
    print(f"{log_path} does not exist!")
