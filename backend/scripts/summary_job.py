import os
import sys
import django

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vouchers.models import BulkInvoiceJob, InvoiceProcessingItem

job_id = 165
try:
    job = BulkInvoiceJob.objects.get(id=job_id)
    masters = job.items.filter(parent_item_id=None)
    success = masters.filter(status__in=['success', 'partial']).count()
    pending = masters.filter(status__in=['pending', 'processing']).count()
    print(f"J:{job.status} T:{job.total_files} m:{masters.count()} s:{success} p:{pending}")
    for it in masters:
        print(f"  I:{it.id} S:{it.status} PID:{it.parent_item_id}")
except Exception as e:
    print(e)
