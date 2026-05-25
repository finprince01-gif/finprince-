import sys
sys.stdout.reconfigure(encoding='utf-8')

sales_voucher_path = r"d:\ledger_report0.37\AI-accounting-0.03\frontend\src\pages\Vouchers\SalesVoucher.tsx"

with open(sales_voucher_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

for idx in range(1819, 1860):
    if idx < len(lines):
        print(f"{idx+1}: {lines[idx]}", end="")
