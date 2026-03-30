import os
import django
import json

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from accounting.models import MasterLedger

ledgers = list(MasterLedger.objects.values('id', 'name', 'group', 'category', 'sub_group_1', 'sub_group_2'))
with open('tmp_ledgers.json', 'w') as f:
    json.dump(ledgers, f, indent=2)
print("done")
