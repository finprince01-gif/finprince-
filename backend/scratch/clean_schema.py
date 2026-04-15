import re
import os

file_path = r'C:\108\AI-accounting-0.03 (4)\AI-accounting-0.03\schema.sql'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove comments starting with --
content = re.sub(r'^--.*$', '', content, flags=re.MULTILINE)

# 2. Remove block comments like /*!... */
content = re.sub(r'/\*.*?\*/;?', '', content, flags=re.DOTALL)

# 3. Remove DROP TABLE lines
content = re.sub(r'^DROP TABLE IF EXISTS.*?;$', '', content, flags=re.MULTILINE | re.IGNORECASE)

# 4. Extract CREATE TABLE blocks
# We search for CREATE TABLE ... ;
# This pattern handles multi-line CREATE TABLE statements
create_table_blocks = re.findall(r'CREATE TABLE.*?;', content, flags=re.DOTALL | re.IGNORECASE)

# 5. Join blocks with 2 empty lines (3 newlines)
cleaned_content = '\n\n\n'.join(block.strip() for block in create_table_blocks)

# Final cleanup: remove excessive empty lines and ensure single trailing newline
cleaned_content = cleaned_content.strip() + '\n'

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(cleaned_content)

print(f"Successfully processed {len(create_table_blocks)} table queries.")
