import os
import sys
import django
import json

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vouchers.models import BulkInvoiceJob, InvoiceProcessingItem
from django.forms.models import model_to_dict

job_id = 165
try:
    job = BulkInvoiceJob.objects.get(id=job_id)
    print(f"JOB: {json.dumps(model_to_dict(job), indent=2, default=str)}")
    items = job.items.all()
    for it in items:
        print(f"ITEM {it.id}: {json.dumps(model_to_dict(it), indent=2, default=str)}")
except Exception as e:
    print(e)
