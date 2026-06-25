import re

log_path = r"C:\108\AI-accounting-0.03\backend\logs\debug.log"
out_path = r"c:\108\AI-accounting-0.03\backend\sprint3_validation\reports\prompt_diff.txt"

prompt_5 = None
prompt_6 = None

with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        # Check if this line logs the prompt text in qwen_provider
        # Let's search for PREFIX_CACHE_TELEMETRY logs and also retrieve the prompt
        # Wait, the prompt is logged in qwen_provider.py call_single. Let's find logs there.
        # Let's write a script that scans debug.log for Qwen request payload or logs showing call_single.
        # Actually, let's search if the prompt is printed.
        pass

# Let's search debug.log for the exact lines that contain the prompt.
# Let's find lines with "ai_1007697_5" or "ai_1007697_6" and dump the surrounding lines.
with open(log_path, "r", encoding="utf-8", errors="ignore") as f, open(out_path, "w", encoding="utf-8") as out:
    lines = f.readlines()
    for idx, line in enumerate(lines):
        if "ai_1007697_5_" in line or "ai_1007697_6_" in line:
            out.write(f"--- MATCHING LINE {idx} ---\n{line}\n")
            # Dump 10 lines before and after
            start_idx = max(0, idx - 15)
            end_idx = min(len(lines), idx + 15)
            for j in range(start_idx, end_idx):
                out.write(f"[{j}]: {lines[j]}")
            out.write("\n\n")

print("Done diffing!")
