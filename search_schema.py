import re

with open('d:\\inventory0.19\\AI-accounting-0.03\\schema.sql', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

m = re.search(r'CREATE TABLE \`inventory_operation_production\`(.*?)\;', text, re.DOTALL | re.IGNORECASE)
if m:
    with open('d:\\inventory0.19\\AI-accounting-0.03\\schema_table.utf8.txt', 'w', encoding='utf-8') as f2:
        f2.write('CREATE TABLE `inventory_operation_production`' + m.group(1) + ';')
