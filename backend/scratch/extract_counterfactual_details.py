import os

log_path = "backend/logs/debug.log"

keywords = [
    "[GROUPING_INPUT]",
    "[GROUPING_DECISION]",
    "[GROUPING_GSTIN_COMPARE]",
    "[CURRENT_DECISION]",
    "[COUNTERFACTUAL_DECISION]"
]

if os.path.exists(log_path):
    print("Searching debug.log...")
    lines_to_print = []
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            if any(kw in line for kw in keywords):
                lines_to_print.append(line.strip())
                
    # Find the last sequence of grouping logs
    summary_indices = [i for i, line in enumerate(lines_to_print) if "[GROUPING_INPUT]" in line]
    if summary_indices:
        # We start from the last batch of grouping inputs
        # Let's find the last GROUPING_INPUT for page_number=1
        start_idx = len(lines_to_print) - 1
        while start_idx > 0:
            if "[GROUPING_INPUT]" in lines_to_print[start_idx] and "page_number=1 " in lines_to_print[start_idx]:
                break
            start_idx -= 1
            
        print("\n=== TARGET DETAILS (PAGE 7 and PAGE 8) ===")
        for i in range(start_idx, len(lines_to_print)):
            line = lines_to_print[i]
            if "page_number=7 " in line or "page_number=8 " in line or "page_a=7" in line or "page_b=8" in line or "page_a=8" in line:
                print(line)
    else:
        print("No grouping logs found.")
else:
    print(f"{log_path} does not exist!")
