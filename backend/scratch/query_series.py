import os
import sys
import django

# Setup Django
sys.path.append(r"d:\ledger_report0.37\AI-accounting-0.03\backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from masters.models import MasterVoucherSales

try:
    configs = MasterVoucherSales.objects.all()
    print(f"Total series configurations: {configs.count()}")
    for c in configs:
        print(f"ID: {c.id}, Name: {c.voucher_name}, Prefix: {c.prefix}, Next No: {c.current_number}")
except Exception as e:
    import traceback
    traceback.print_exc()
