
import os

filepath = r'd:\ledger_report\AI-accounting-0.03\frontend\src\pages\Vouchers\PaymentVoucherSingle.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Conflict is from line 116 to 176 (1-indexed)
# In 0-indexed: lines[115] to lines[175]
# But wait, I should verify the markers.
start_idx = -1
end_idx = -1
for i, line in enumerate(lines):
    if '<<<<<<< Updated upstream' in line and i > 110 and i < 125:
        start_idx = i
    if '>>>>>>> Stashed changes' in line and i > 170 and i < 185:
        end_idx = i
        break

if start_idx != -1 and end_idx != -1:
    new_lines = lines[:start_idx] + lines[end_idx+1:]
    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print(f"Removed conflict from {start_idx+1} to {end_idx+1}")
else:
    print(f"Could not find markers at expected locations: start={start_idx}, end={end_idx}")
