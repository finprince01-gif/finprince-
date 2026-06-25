import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
backend_dir = r"C:\108\AI-accounting-0.03\backend"

for root, dirs, files in os.walk(backend_dir):
    for f in files:
        if f.endswith(".py") and "scratch" not in root and "venv" not in root:
            path = os.path.join(root, f)
            with open(path, "r", encoding="utf-8", errors="ignore") as file:
                content = file.read()
                if "### [" in content or "PROMPT" in content or "prefix_hash" in content:
                    if "def " in content and ("prompt" in content.lower() or "extract" in content.lower()):
                        print(f"File: {path}")
                        file.seek(0)
                        for line_no, line in enumerate(file, 1):
                            if "### [" in line or "prompt_text" in line or "generate_prompt" in line:
                                print(f"  {line_no}: {line.strip()}")
