import os
import sys
import django

# Add current directory to path
sys.path.append(os.getcwd())

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vouchers.models import BulkInvoiceJob, InvoiceProcessingItem
from vouchers.pipeline.direct_processor import process_bulk_job

job_id = 161
try:
    print(f"Manually triggering job {job_id}")
    process_bulk_job(job_id)
    print("Manual trigger finished")
except Exception as e:
    import traceback
    print(f"Manual trigger CRASHED: {e}")
    print(traceback.format_exc())
