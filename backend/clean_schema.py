import re

input_path = r'c:\108\AI-accounting-0.03 (2)\schema.sql'
output_path = r'c:\108\AI-accounting-0.03 (2)\schema_clean.sql'

# We need to handle potential UTF-16LE encoding if it was redirected in PS
def read_file(path):
    for enc in ['utf-8', 'utf-16', 'latin-1']:
        try:
            with open(path, 'r', encoding=enc) as f:
                return f.read(), enc
        except:
            continue
    raise ValueError("Could not determine encoding")

content, encoding = read_file(input_path)
lines = content.splitlines()

cleaned_lines = []
for line in lines:
    stripped = line.strip()
    # Remove lines starting with --
    if stripped.startswith('--'):
        continue
    # Remove lines starting with DROP TABLE
    if stripped.upper().startswith('DROP TABLE'):
        continue
    # Keep the rest
    cleaned_lines.append(line)

with open(output_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(cleaned_lines))

print(f"Cleaned {len(lines)} lines down to {len(cleaned_lines)} lines.")
