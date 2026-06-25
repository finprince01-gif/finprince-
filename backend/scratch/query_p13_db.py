import os
import django
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoicePageResult, PoisonDocument, SessionFinalizationState

record_id = "1007715"

print("--- Querying InvoicePageResult ---")
results = InvoicePageResult.objects.filter(record_id=record_id).order_by('page_number')
print(f"Total page results saved: {results.count()}")
for res in results:
    print(f"Page {res.page_number} | is_failed={res.is_failed} | created_at={res.created_at}")

print("\n--- Querying PoisonDocument ---")
poison = PoisonDocument.objects.all()
print(f"Total poison documents in DB: {poison.count()}")
for p in poison:
    print(f"Record={p.record_id} | queue={p.queue_name} | retry_count={p.retry_count} | error={str(p.error_trace)[:100]} | created_at={p.created_at}")

print("\n--- Querying SessionFinalizationState ---")
states = SessionFinalizationState.objects.filter(id=record_id)
for s in states:
    print(f"Record={s.id} | expected={s.expected_pages} | completed={s.completed_pages} | failed={s.failed_pages} | status={s.status} | ai_complete={s.ai_complete}")
