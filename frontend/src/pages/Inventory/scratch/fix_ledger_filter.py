import os

file_path = r'd:\finpixe\Ai_Accounting-30\AI-accounting-0.03\frontend\src\pages\Inventory\Inventory.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Look for the specific area around 6450
target_idx = -1
for i, line in enumerate(lines):
    if "return isMatch && !l.name.toLowerCase().includes('purchase');" in line:
        if i + 2 < len(lines) and "}).map(l => (" in lines[i+2]:
            target_idx = i + 2
            break

if target_idx != -1:
    old_line = lines[target_idx]
    indent = old_line[:old_line.find('}')]
    new_content = [
        f"{indent}  }})\n",
        f"{indent}  .filter((l, index, self) => index === self.findIndex((t) => t.name === l.name))\n",
        f"{indent}  .sort((a, b) => a.name.localeCompare(b.name))\n",
        f"{indent}  .map(l => (\n"
    ]
    lines[target_idx:target_idx+1] = new_content
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print("Successfully updated the file.")
else:
    print("Could not find the target lines.")
