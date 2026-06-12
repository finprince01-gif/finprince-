import os
import sys
import django

sys.path.append('d:/finpixe/Ai_Accounting_22/AI-accounting-0.03/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from masters.database import Ledger

for l in Ledger.objects.filter(id__in=[147, 149]):
    print(f"Ledger ID {l.id}: {l.name}")
