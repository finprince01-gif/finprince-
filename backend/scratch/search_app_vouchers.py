with open(r"d:\ledger_report0.37\AI-accounting-0.03\frontend\src\app\App.tsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if "onAddVouchers" in line or "addVoucher" in line:
        # print 5 lines before and after
        start = max(0, idx - 5)
        end = min(len(lines), idx + 6)
        print(f"--- Occurrence at line {idx+1} ---")
        for i in range(start, end):
            print(f"{i+1}: {lines[i].strip()}")
