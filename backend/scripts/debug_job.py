import os
import sys
import django

# Add current directory to path
sys.path.append(os.getcwd())

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vouchers.models import BulkInvoiceJob, InvoiceProcessingItem

job_id = 161
try:
    job = BulkInvoiceJob.objects.get(id=job_id)
    print(f"JOB {job_id} | Status: {job.status} | Total: {job.total_files}")
    items = job.items.all()
    print(f"Found {items.count()} items")
    for it in items:
        print(f"  Item {it.id} | Status: {it.status} | File: {it.file_path}")
except Exception as e:
    print(f"Error: {e}")
