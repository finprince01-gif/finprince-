import os
import django
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import PoisonDocument

record_id = "1007715"

print("--- Querying PoisonDocument for record 1007715 ---")
poison = PoisonDocument.objects.filter(record_id=record_id)
print(f"Count: {poison.count()}")
for p in poison:
    print(f"Record={p.record_id} | queue={p.queue_name} | retry_count={p.retry_count} | error={p.error_trace} | created_at={p.created_at}")
