import re

log_path = r"C:\108\AI-accounting-0.03\backend\logs\debug.log"
out_path = r"c:\108\AI-accounting-0.03\backend\sprint3_validation\reports\prompt_comparison.txt"

# Let's find one instance of each prefix hash in the logs
found_0d = False
found_9e = False

with open(log_path, "r", encoding="utf-8", errors="ignore") as f, open(out_path, "w", encoding="utf-8") as out:
    for line in f:
        if "PREFIX_CACHE_TELEMETRY" in line:
            # Check the prefix hash in the log line
            m = re.search(r"PREFIX_HASH=(\w+)", line)
            if m:
                phash = m.group(1)
                req_id = re.search(r"REQUEST_ID=(\S+)", line).group(1)
                page = re.search(r"PAGE_NUMBER=(\d+)", line).group(1)
                invoice = re.search(r"INVOICE_ID=(\S+)", line).group(1)
                
                # Now we want to search for the prompt containing this REQUEST_ID or INVOICE_ID and page
                if phash.startswith("0d4e") and not found_0d:
                    out.write(f"=== HASH: {phash} (Invoice: {invoice}, Page: {page}, Req: {req_id}) ===\n")
                    found_0d = True
                elif phash.startswith("9e3d") and not found_9e:
                    out.write(f"=== HASH: {phash} (Invoice: {invoice}, Page: {page}, Req: {req_id}) ===\n")
                    found_9e = True
                    
        # Let's find logs showing the raw prompts
        # Let's search if the prompt is printed in logs
        if "AI OCR ISOLATED Request" in line or "AI isolated prompt" in line or "Isolated prompt" in line:
            out.write(line + "\n")

print("Done comparing!")
