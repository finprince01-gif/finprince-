import json

transcript_path = r"C:\Users\ulaganathan\.gemini\antigravity-ide\brain\1340428a-ba8d-4087-a78a-a469f102466f\\.system_generated\\logs\\transcript.jsonl"
import os
# Since double backslashes or single backslashes can be tricky, let's fix path:
transcript_path = os.path.normpath(r"C:\Users\ulaganathan\.gemini\antigravity-ide\brain\1340428a-ba8d-4087-a78a-a469f102466f\.system_generated\logs\transcript.jsonl")

out_path = r"c:\108\AI-accounting-0.03\backend\sprint3_validation\reports\all_user_requests.txt"

with open(transcript_path, "r", encoding="utf-8") as f, open(out_path, "w", encoding="utf-8") as out:
    for line in f:
        data = json.loads(line)
        if data.get("type") == "USER_INPUT":
            step = data.get("step_index")
            content = data.get("content", "")
            out.write(f"--- STEP {step} ---\n{content}\n\n")
print("Done extracting requests!")
