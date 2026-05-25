with open(r"d:\ledger_report0.37\AI-accounting-0.03\frontend\src\app\App.tsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

start = 775
end = min(len(lines), 850)
for i in range(start, end):
    print(f"{i+1}: {lines[i].strip()}")
