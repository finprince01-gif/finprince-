with open(r"d:\ledger_report0.37\AI-accounting-0.03\frontend\src\pages\Vouchers\Vouchers.tsx", "r", encoding="utf-8") as f:
    for idx, line in enumerate(f):
        if "onAddVouchers" in line:
            print(f"Line {idx + 1}: {line.strip()}")
