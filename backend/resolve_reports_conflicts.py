
import os
import re

filepath = r'd:\ledger_report\AI-accounting-0.03\frontend\src\pages\Reports\Reports.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to find all conflict blocks
# Prefer 'Stashed changes' (the part after =======)
def resolve_conflict(match):
    upstream = match.group(1)
    stashed = match.group(2)
    # Rationale: The stashed changes contain the new ledger drill-down logic
    # which is what we want to keep.
    return stashed

# Regexp for git conflicts
pattern = re.compile(r'<<<<<<< Updated upstream\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> Stashed changes', re.MULTILINE)

new_content = pattern.sub(resolve_conflict, content)

# Also fix the component signature and props if they didn't have conflict markers but are needed
# (Actually, they should have had conflict markers if they changed)
# Let's check line 87 again in the new_content
if 'entries?: any[]' not in new_content:
    new_content = new_content.replace(
        'interface ReportsPageProps {',
        'interface ReportsPageProps {\n  vouchers: Voucher[];\n  entries?: any[];'
    )
    new_content = new_content.replace(
        'vouchers: Voucher[];',
        '' # Remove duplicate
    )
    # Fix destructuring
    new_content = new_content.replace(
        'const ReportsPage: React.FC<ReportsPageProps> = ({ vouchers = [], ledgers = [], ledgerGroups = [], stockItems = [] }) => {',
        'const ReportsPage: React.FC<ReportsPageProps> = ({ vouchers = [], entries = [], ledgers = [], ledgerGroups = [], stockItems = [] }) => {'
    )

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Resolved conflicts in Reports.tsx (Preferred Stashed Changes)")
