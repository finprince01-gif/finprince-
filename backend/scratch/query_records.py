import os
import django
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, InvoicePageResult, PoisonDocument

print(f"Total InvoiceTempOCR rows: {InvoiceTempOCR.objects.count()}")
for r in InvoiceTempOCR.objects.all():
    print(f"  OCR Record ID: {r.id} (type: {type(r.id)}), session_id='{r.upload_session_id}', status='{r.status}'")

print(f"\nTotal InvoicePageResult rows: {InvoicePageResult.objects.count()}")
for pr in InvoicePageResult.objects.all()[:20]:
    print(f"  PageResult: record_id='{pr.record_id}' (type: {type(pr.record_id)}), page_number={pr.page_number}, is_failed={pr.is_failed}, session_id='{pr.session_id}'")

print(f"\nTotal PoisonDocument rows: {PoisonDocument.objects.count()}")
for pd in PoisonDocument.objects.all()[:10]:
    print(f"  PoisonDoc: record_id='{pd.record_id}' (type: {type(pd.record_id)}), session_id='{pd.session_id}', queue='{pd.queue_name}'")
