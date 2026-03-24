import os
import sys
import django
import json

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.ocr_cache import get_all_staged_invoices
tenant_id = '88fe4389-58a9-4244-9878-8a4e646898bd'

staged = get_all_staged_invoices(tenant_id)
print(f"Total Staged: {len(staged)}")
for s in staged:
    print(f"ID:{s['id']} Hash:{s['file_hash'][:8]} status:{s['status']} processed:{s['processed']}")
    print(f"  Extracted Keys: {list(s['extracted_data'].keys())}")
