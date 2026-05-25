import os
import re

src_dir = r"d:\ledger_report0.37\AI-accounting-0.03\frontend\src"

for root, dirs, files in os.walk(src_dir):
    for file in files:
        if file.endswith((".tsx", ".ts")):
            file_path = os.path.join(root, file)
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                if "<Vouchers" in content:
                    print(f"Found in {file_path}")
