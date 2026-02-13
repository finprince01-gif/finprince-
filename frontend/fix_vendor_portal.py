
import os

file_path = r'C:\108\muthu\Ai_Accounting_v1\frontend\src\pages\VendorPortal\VendorPortal.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Visual verification before delete
print(f"Line 3036 content: {lines[3035]}")
print(f"Line 3280 content: {lines[3279]}")
print(f"Line 3281 content: {lines[3280]}")

# Targeted deletion: 3036 to 3280 (indices 3035 to 3280 exclusive? No, python slice is exclusive at end)
# lines[3035:3280] will remove indices 3035..3279 (Lines 3036..3280)

# Check if line 3036 resembles activeTab === 'Transaction'
if "activeTab === 'Transaction'" in lines[3035]:
    print("Found start of duplicate block.")
else:
    print("WARNING: Line 3036 does not match expected start of duplicate block.")

# Check if line 3281 resembles activeTab === 'Transaction'
if "activeTab === 'Transaction'" in lines[3280]:
    print("Found start of good block.")
else:
    print("WARNING: Line 3281 does not match expected start of good block.")

lines_to_keep = lines[:3035] + lines[3280:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines_to_keep)

print("File updated.")
