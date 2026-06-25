import os
import json

transcript_path = r"C:\Users\ulaganathan\.gemini\antigravity-ide\brain\1340428a-ba8d-4087-a78a-a469f102466f\.system_generated\logs\transcript.jsonl"

print("=== SEARCHING TRANSCRIPT FOR 20 QUESTIONS ===")
if os.path.exists(transcript_path):
    with open(transcript_path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            try:
                data = json.loads(line)
                content = str(data.get("content", ""))
                # Search for Q1 to Q20 pattern or "20 questions"
                if "20 specific" in content.lower() or "twenty" in content.lower() or "q1." in content.lower() or "q20" in content.lower() or "forensic questions" in content.lower():
                    print(f"Step {data.get('step_index')}, Source: {data.get('source')}, Type: {data.get('type')}")
                    # Print first 500 characters
                    print(content[:1500])
                    print("=" * 80)
            except Exception as e:
                pass
else:
    print(f"Transcript not found at {transcript_path}")
