input_path = r'c:\108\AI-accounting-0.03 (2)\schema.sql'
output_path = r'c:\108\AI-accounting-0.03 (2)\schema_clean_v2.sql'

with open(input_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

cleaned = []
for line in lines:
    stripped = line.strip()
    if not stripped:
        cleaned.append(line)
        continue
    # Skip MySQL executable comments
    if stripped.startswith('/*!') or stripped.startswith('/*'):
        continue
    # Skip any line that looks like a standard SQL comment if any remained
    if stripped.startswith('--'):
        continue
    cleaned.append(line)

with open(output_path, 'w', encoding='utf-8') as f:
    f.writelines(cleaned)
