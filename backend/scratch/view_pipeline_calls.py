import sys

pipeline_path = r"C:\108\AI-accounting-0.03\backend\ocr_pipeline\pipeline.py"
sys.stdout.reconfigure(encoding='utf-8')

with open(pipeline_path, "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

print("--- CALL 1 (Line 581) ---")
for idx in range(570, 600):
    print(f"{idx+1}: {lines[idx].strip()}")

print("\n--- CALL 2 (Line 1993) ---")
for idx in range(1980, 2010):
    if idx < len(lines):
        print(f"{idx+1}: {lines[idx].strip()}")
