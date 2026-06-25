import os
import json

transcript_path = r"C:\Users\ulaganathan\.gemini\antigravity-ide\brain\1340428a-ba8d-4087-a78a-a469f102466f\.system_generated\logs\transcript.jsonl"
out_path = r"scratch/first_message.txt"

if os.path.exists(transcript_path):
    with open(transcript_path, "r", encoding="utf-8") as f:
        for line in f:
            try:
                data = json.loads(line)
                if data.get("type") == "USER_INPUT":
                    content = data.get("content", "")
                    if "forensic" in content.lower():
                        with open(out_path, "w", encoding="utf-8") as out:
                            out.write(content)
                        print(f"Successfully wrote first message to {out_path}")
                        break
            except Exception as e:
                pass
else:
    print("Transcript not found.")
