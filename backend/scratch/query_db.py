import os
import sys
import django

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR, SessionFinalizationState, InvoicePageResult
from django.db.models import Max

print("=== LATEST 10 SESSIONS BY CREATED_AT ===")
sessions = InvoiceTempOCR.objects.values('upload_session_id').annotate(latest_created=Max('created_at')).order_by('-latest_created')[:10]
for s in sessions:
    sid = s['upload_session_id']
    records = InvoiceTempOCR.objects.filter(upload_session_id=sid)
    statuses = set(records.values_list('status', flat=True))
    val_statuses = set(records.values_list('validation_status', flat=True))
    print(f"Session: {sid}, Count: {records.count()}, Statuses: {list(statuses)}, ValStatuses: {list(val_statuses)}, LatestCreatedAt: {s['latest_created']}")

print("\n=== LATEST STUCK/PROCESSING RECORDS ===")
stuck_records = InvoiceTempOCR.objects.exclude(status__in=['FINALIZED', 'COMPLETED', 'FAILED']).order_by('-created_at')[:10]
for r in stuck_records:
    print(f"ID: {r.id}, Session: {r.upload_session_id}, Status: {r.status}, ValStatus: {r.validation_status}, CreatedAt: {r.created_at}")
