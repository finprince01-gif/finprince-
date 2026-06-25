import os
import sys

sys.stdout.reconfigure(encoding='utf-8')
backend_dir = r"C:\108\AI-accounting-0.03\backend"

for root, dirs, files in os.walk(backend_dir):
    for f in files:
        if f.endswith(".py") and "scratch" not in root and "venv" not in root:
            path = os.path.join(root, f)
            with open(path, "r", encoding="utf-8", errors="ignore") as file:
                for line_no, line in enumerate(file, 1):
                    if "extract_invoice(" in line:
                        print(f"{path}:{line_no}: {line.strip()}")
