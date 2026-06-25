import os
import sys
import time
import django

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, InvoicePageResult

RECORD_ID = 1007715

print("=== WAITING FOR RECORD TO FINALIZE ===")
rec = InvoiceTempOCR.objects.get(id=RECORD_ID)
while rec.status not in ('FINALIZED', 'COMPLETED', 'FAILED', 'ERROR'):
    pages = sorted(list(InvoicePageResult.objects.filter(record_id=RECORD_ID).values_list('page_number', flat=True)))
    print(f"[{time.strftime('%X')}] Status: {rec.status} | Completed Pages ({len(pages)}/15): {pages}")
    time.sleep(15)
    rec.refresh_from_db()

pages = sorted(list(InvoicePageResult.objects.filter(record_id=RECORD_ID).values_list('page_number', flat=True)))
print(f"[{time.strftime('%X')}] Terminal state reached! Status: {rec.status} | Completed Pages ({len(pages)}/15): {pages}")
