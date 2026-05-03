import re
import os

schema_path = r'c:\108\AI-accounting-0.03 (2)\schema.sql'

with open(schema_path, 'r', encoding='utf-8-sig') as f:
    content = f.read()

# Remove comments (starting with --)
content = re.sub(r'^\s*--.*$', '', content, flags=re.MULTILINE)

# Remove DROP TABLE queries
content = re.sub(r'^\s*DROP TABLE IF EXISTS.*?;', '', content, flags=re.MULTILINE | re.IGNORECASE)

# Remove MySQL-specific comments (/*...*/)
content = re.sub(r'/\*!.*?\*/', '', content, flags=re.DOTALL)

# Add newline after each statement ending in ;
content = re.sub(r';', ';\n', content)

# Cleanup: remove lines that are just whitespace and ensure double newlines between statements
lines = content.splitlines()
cleaned_lines = []
for line in lines:
    if line.strip():
        cleaned_lines.append(line)
        if line.strip().endswith(';'):
            cleaned_lines.append('')

with open(schema_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(cleaned_lines).strip() + '\n')

print("Schema cleaned and formatted.")
