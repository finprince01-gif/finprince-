import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import SessionFinalizationState
from django.utils import timezone

print("=" * 80)
print("STUCK RECORDS (status=UPLOADED, barrier complete, tc=False)")
print("=" * 80)

states = SessionFinalizationState.objects.filter(
    updated_at__gte=timezone.now() - timezone.timedelta(days=1)
)

stuck = []
for s in states:
    barrier_total = (s.completed_pages or 0) + (s.failed_pages or 0)
    expected = s.expected_pages or 0
    barrier_complete = (expected > 0) and (barrier_total >= expected)
    if barrier_complete and not s.terminal_consistency:
        stuck.append(s)

print(f"Stuck count: {len(stuck)}")
for s in stuck:
    print(f"\n  ID={s.id}")
    print(f"  status={s.status}")
    print(f"  expected={s.expected_pages} completed={s.completed_pages} failed={s.failed_pages}")
    print(f"  ai_complete={s.ai_complete}")
    print(f"  assembly_complete={s.assembly_complete}")
    print(f"  snapshot_complete={s.snapshot_complete}")
    print(f"  snapshot_created={s.snapshot_created}")
    print(f"  materialization_complete={s.materialization_complete}")
    print(f"  export_complete={s.export_complete}")
    print(f"  terminal_consistency={s.terminal_consistency}")
    print(f"  updated_at={s.updated_at}")

print("\n" + "=" * 80)
print("RECENTLY FINALIZED (last 24h, tc=True)")
print("=" * 80)
finalized = states.filter(terminal_consistency=True)
print(f"Total finalized: {finalized.count()}")
for s in finalized[:5]:
    print(f"  ID={s.id} status={s.status} tc={s.terminal_consistency} sc={s.snapshot_complete}")
