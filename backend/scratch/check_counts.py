import os
import django
import sys

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.hierarchy_service import build_ledger_hierarchy_tree

def count_nodes(nodes):
    total = len(nodes)
    for node in nodes:
        if 'children' in node:
            total += count_nodes(node['children'])
    return total

tree = build_ledger_hierarchy_tree()
print(f"Total Roots: {len(tree)}")
print(f"Total Nodes: {count_nodes(tree)}")
for root in tree:
    print(f"- {root['name']}")
