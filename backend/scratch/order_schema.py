import re
import collections

file_path = r'C:\108\AI-accounting-0.03 (4)\AI-accounting-0.03\schema.sql'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Split into CREATE TABLE blocks
blocks = re.findall(r'CREATE TABLE.*?;', content, flags=re.DOTALL | re.IGNORECASE)

table_data = []
for block in blocks:
    # Extract table name
    match = re.search(r'CREATE TABLE [`"](.*?)[`"]', block, re.IGNORECASE)
    if not match:
        continue
    table_name = match.group(1)
    
    # Extract referenced tables
    # Look for: REFERENCES `table_name`
    refs = re.findall(r'REFERENCES [`"](.*?)[`"]', block, re.IGNORECASE)
    # Filter out self-references
    refs = [ref for ref in refs if ref != table_name]
    
    table_data.append({
        'name': table_name,
        'refs': list(set(refs)),
        'block': block.strip()
    })

# Topological Sort
# We want tables that are referenced to come FIRST.
# So if B references A, A comes before B.
# Dependencies: table -> [tables it depends on]
dependencies = {data['name']: data['refs'] for data in table_data}
blocks_by_name = {data['name']: data['block'] for data in table_data}

def topological_sort(deps):
    sorted_list = []
    visited = set()
    temp_visited = set()

    def visit(node):
        if node in temp_visited:
            # Circular dependency detected. We'll just break out.
            return
        if node not in visited:
            temp_visited.add(node)
            # If the node is in our schema, visit its dependencies
            if node in deps:
                for neighbor in deps[node]:
                    visit(neighbor)
            temp_visited.remove(node)
            visited.add(node)
            sorted_list.append(node)

    for node in deps:
        if node not in visited:
            visit(node)
            
    return sorted_list

sorted_table_names = topological_sort(dependencies)

# Build the final content
final_blocks = []
for name in sorted_table_names:
    if name in blocks_by_name:
        final_blocks.append(blocks_by_name[name])

# Add tables that were in the original but somehow missed (safety)
all_names = set(dependencies.keys())
handled_names = set(sorted_table_names)
missing_names = all_names - handled_names
for name in missing_names:
    final_blocks.append(blocks_by_name[name])

cleaned_content = '\n\n\n'.join(final_blocks) + '\n'

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(cleaned_content)

print(f"Successfully ordered {len(final_blocks)} table queries based on references.")
