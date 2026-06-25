import hashlib

log_path = r"C:\108\AI-accounting-0.03\backend\logs\debug.log"

# Prompt hashes to find:
# 95a057b2b296a143466cf1e3651c53a7dfe10c70fcabf4f61dd2af44379cc46d (Page 1)
# 035a2591fccae51316f9bad07d2511ead1ffe6ba05ff7893ef839360324ea74d (Page 6)

target_hashes = {
    "95a057b2b296a143466cf1e3651c53a7dfe10c70fcabf4f61dd2af44379cc46d": "Page 1 Hash",
    "035a2591fccae51316f9bad07d2511ead1ffe6ba05ff7893ef839360324ea74d": "Page 6 Hash",
    "2249e5fcce8cee3303a090e99ad71df034c3d7b18665c958c2f6e3018dc4357d": "1007700 Page 5 Hash",
    "e56101cca9d7cbaa71f38941c708aca845b8f74b2f9795c9a546e2c8e367f87c": "1007700 Page 4 Hash"
}

# Let's search if the raw prompts are present in the log.
# Typically, prompts might be in JSON payloads or in debug logs.
# Let's find lines that might contain these hashes or parts of prompts.
# Let's read the logs line by line and check if sha256 matches.

import re
import json

with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    for line_no, line in enumerate(f, 1):
        # Check if line contains any target hash
        for h, name in target_hashes.items():
            if h in line:
                print(f"Hash {h} ({name}) found in log line {line_no}:")
                print(line.strip()[:500])
                print("-" * 50)
                
            # If the line contains "prompt" and a large chunk of text, let's hash it or check if it matches
            # Let's see if we can find where the prompt text is logged.
            # E.g. "AI Dispatch:" or "AI isolated prompt"
            if "prompt" in line.lower() and len(line) > 1000:
                # Try to extract the prompt text
                # Let's compute its sha256
                # and prefix hash
                text = line
                h_val = hashlib.sha256(text.encode('utf-8')).hexdigest()
                # print(f"Large log line {line_no} hash: {h_val}")
