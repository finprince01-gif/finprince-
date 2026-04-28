import os
import django
import sys

sys.path.append('d:/ledger_report0.22/AI-accounting-0.03/backend')
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from accounting.models import JournalEntry

print("TOTAL ENTRIES:", JournalEntry.objects.count())
