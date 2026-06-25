import sys

log_path = r"C:\108\AI-accounting-0.03\backend\logs\debug.log"

# Search for "prompt" or "Prompt Size" or "Isolated prompt" or the prompt text
# let's look for logs containing "1007697" and "prompt"

with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if "1007697" in line and "prompt" in line.lower():
            print(line.strip())
        elif "1007700" in line and "prompt" in line.lower():
            print(line.strip())
