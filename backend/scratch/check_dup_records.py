import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
res = InvoiceTempOCR.objects.filter(file_hash__startswith='f7d186317b8')
print(f"Matching records count: {res.count()}")
for r in res:
    print(f"ID: {r.id}, is_primary: {r.is_primary}, session: {r.upload_session_id}, status: {r.status}, processed: {r.processed}, validation_status: {r.validation_status}")
