import re

schema_path = r'c:\108\AI-accounting-0.03 (2)\schema.sql'

with open(schema_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Split into individual CREATE TABLE blocks
# Blocks end with );\n\n (as formatted by previous script)
blocks = re.split(r';\n\n', content)
# Add back the semicolon to each block except the last one if it was split
blocks = [b + ';' if not b.strip().endswith(';') else b for b in blocks if b.strip()]

priority_tables = [
    'tenants',
    'users',
    'master_ledger_groups',
    'master_ledgers',
    'transactions',
    'vouchers',
    'vendor_master',
    'customer_master',
    'master_chart_of_accounts',
    'rbac_roles'
]

ordered_blocks = []
remaining_blocks = blocks[:]

# Extract priority blocks in order
for table_name in priority_tables:
    for i, block in enumerate(remaining_blocks):
        if f'CREATE TABLE `{table_name}`' in block:
            ordered_blocks.append(block)
            remaining_blocks.pop(i)
            break

# Add the rest
ordered_blocks.extend(remaining_blocks)

# Wrap with Foreign Key check disablement
header = "SET FOREIGN_KEY_CHECKS=0;\n\n"
footer = "\n\nSET FOREIGN_KEY_CHECKS=1;"

with open(schema_path, 'w', encoding='utf-8') as f:
    f.write(header)
    f.write('\n\n'.join(ordered_blocks).strip())
    f.write(footer)

print("Schema reordered and foreign key checks added.")
