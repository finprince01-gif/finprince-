import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import PoisonDocument
from django.utils import timezone

recent_poisons = PoisonDocument.objects.filter(created_at__gte=timezone.now() - timezone.timedelta(days=2))
print(f"Total recent poisons: {recent_poisons.count()}")
for p in recent_poisons[:10]:
    print(f"ID={p.id}: worker={p.worker_role}, error={p.error_trace[:150]}, created_at={p.created_at}")
