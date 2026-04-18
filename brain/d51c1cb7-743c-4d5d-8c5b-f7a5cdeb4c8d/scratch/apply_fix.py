import sys

file_path = 'c:/108/AI-accounting-0.03/frontend/src/components/SmartInvoiceUploadModal.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Line numbers are 1-indexed. Line 2157 is index 2156.
target_line = '<div className="flex items-center justify-center gap-1">'
replacement = '<div className={`flex items-center justify-center gap-1 ${["PENDING", "processing", "SCANNING", "EXTRACTING"].includes(row.validationStatus) ? "opacity-30 pointer-events-none" : ""}`}>\n'

found = False
for i in range(len(lines)):
    if target_line in lines[i] and 'justify-center gap-1' in lines[i]:
        # Keep original indentation
        indent = lines[i].split('<div')[0]
        lines[i] = indent + replacement
        found = True
        break

if found:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print("Successfully updated line.")
else:
    print("Could not find target line.")
