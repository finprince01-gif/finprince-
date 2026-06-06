import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import SessionFinalizationState, PoisonDocument, InvoiceTempOCR
from django.utils import timezone

states = SessionFinalizationState.objects.filter(updated_at__gte=timezone.now() - timezone.timedelta(days=1))
print(f"Total states updated in last 24h: {states.count()}")
for s in states[:10]:
    print(f"ID={s.id}: expected={s.expected_pages}, completed={s.completed_pages}, failed={s.failed_pages}, status={s.status}, tc={s.terminal_consistency}, sc={s.snapshot_complete}")

poisons = PoisonDocument.objects.all()
print(f"\nTotal Poison Documents: {poisons.count()}")
for p in poisons:
    print(f"ID={p.id}: worker={p.worker_role}, error={p.error_trace[:200]}")
