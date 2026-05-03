import re
import collections

def sort_sql_tables(sql_content):
    # Regex to find CREATE TABLE blocks
    # Note: This is a bit simplified but should work for mysqldump output
    table_pattern = re.compile(
        r'(CREATE TABLE `([^`]+)` \((.*?)\) ENGINE=InnoDB.*?;)', 
        re.DOTALL
    )
    
    tables = {} # name -> content
    dependencies = collections.defaultdict(set)
    
    matches = table_pattern.findall(sql_content)
    for full_block, table_name, body in matches:
        tables[table_name] = full_block
        
        # Find REFERENCES `table_name`
        ref_matches = re.findall(r'REFERENCES `([^`]+)`', body)
        for ref in ref_matches:
            if ref != table_name: # Ignore self-references
                dependencies[table_name].add(ref)
    
    # Topological Sort
    sorted_tables = []
    visited = set()
    visiting = set()
    
    def visit(name):
        if name in visiting:
            # Cycle detected. In a real schema we'd need to break this with ALTER TABLE,
            # but for now we just skip the dependency check for the cycle part.
            return
        if name not in visited:
            visiting.add(name)
            for dep in dependencies.get(name, []):
                if dep in tables: # Only visit if we have the definition
                    visit(dep)
            visiting.remove(name)
            visited.add(name)
            sorted_tables.append(name)
            
    all_table_names = sorted(tables.keys())
    for name in all_table_names:
        visit(name)
        
    return [tables[name] for name in sorted_tables]

input_path = r'c:\108\AI-accounting-0.03 (2)\schema.sql'
output_path = r'c:\108\AI-accounting-0.03 (2)\schema_ordered.sql'

with open(input_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Preserve the header (the SET statements at the top)
header_end = content.find('CREATE TABLE')
if header_end == -1:
    print("No CREATE TABLE statements found.")
    exit(1)
header = content[:header_end]

# Extract the rest (footer might be mixed in, but we'll try to find it)
# Actually, let's just find all table blocks and then put the footer at the end.
footer_start = content.rfind('ENGINE=InnoDB')
# A better way: find the last semicolon of the last CREATE TABLE
last_table_match = list(re.finditer(r'CREATE TABLE.*?ENGINE=InnoDB.*?;', content, re.DOTALL))[-1]
footer = content[last_table_match.end():]

ordered_blocks = sort_sql_tables(content)

with open(output_path, 'w', encoding='utf-8') as f:
    f.write(header)
    f.write('\n\n'.join(ordered_blocks))
    f.write('\n\n')
    f.write(footer)

print(f"Ordered {len(ordered_blocks)} tables.")
