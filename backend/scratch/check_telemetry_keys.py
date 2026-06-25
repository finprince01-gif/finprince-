import json
import os

telemetry_path = r"c:\108\AI-accounting-0.03\backend\scratch\telemetry_stress.json"

if os.path.exists(telemetry_path):
    with open(telemetry_path, 'r') as f:
        # Since it is a large file, let's read the first few items
        try:
            data = json.load(f)
            print(f"Total entries: {len(data)}")
            if len(data) > 0:
                print("First entry keys:", data[0].keys())
                print("First entry:", data[0])
                print("Second entry:", data[1] if len(data) > 1 else "N/A")
        except Exception as e:
            # Maybe it is JSON Lines (JSONL) instead of a single JSON array? Let's try reading as JSONL
            print(f"Error loading as standard JSON: {e}")
            f.seek(0)
            lines = f.readlines()
            print(f"Total lines in file: {len(lines)}")
            if len(lines) > 0:
                try:
                    first = json.loads(lines[0])
                    print("First line JSON keys:", first.keys())
                    print("First line JSON:", first)
                except Exception as e2:
                    print(f"Error loading first line: {e2}")
                    print("First line text:", lines[0][:200])
else:
    print("Telemetry file not found.")
