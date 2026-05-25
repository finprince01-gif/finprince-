import re

file_path = r"d:\ledger_report0.37\AI-accounting-0.03\frontend\src\pages\Vouchers\Vouchers.tsx"

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

patterns = ["apiService.", "httpClient.", ".post", ".patch", ".put"]
for idx, line in enumerate(lines):
    if any(p in line for p in patterns) and "console." not in line:
        print(f"Line {idx + 1}: {line.strip()}")
