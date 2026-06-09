"""
STUCK SESSION RECOVERY SCRIPT
===============================
Recovers sessions where ASSEMBLY crashed before emitting FINALIZE,
leaving SessionFinalizationState stuck in UPLOADED with tc=False.

ROOT CAUSE: assembly_worker called record.save() on a record already
marked FAILED in DB → immutability guard raised RuntimeError → FINALIZE
message never enqueued → terminal_consistency never set.

RECOVERY APPROACH: Since InvoiceTempOCR is already FAILED in DB,
directly set SessionFinalizationState terminal flags via SQL update
(no reprocessing). This is idempotent and safe.

DO NOT RUN WITHOUT APPROVAL IN PRODUCTION.
"""
import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import SessionFinalizationState, InvoiceTempOCR, PipelineStatus
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')

# Identify stuck records: barrier complete, ai_complete=True, tc=False
states = SessionFinalizationState.objects.filter(
    updated_at__gte=timezone.now() - timezone.timedelta(days=2),
    ai_complete=True,
    terminal_consistency=False,
)

stuck = []
for s in states:
    barrier_total = (s.completed_pages or 0) + (s.failed_pages or 0)
    expected = s.expected_pages or 0
    if expected > 0 and barrier_total >= expected:
        stuck.append(s)

print(f"\n{'='*70}")
print(f"STUCK SESSION RECOVERY — Found {len(stuck)} stuck records")
print(f"{'='*70}")

DRY_RUN = False  # Set to True to preview without writing

recovered = 0
for s in stuck:
    record_id = s.id
    print(f"\n[RECOVER] record={record_id}")
    print(f"  current: status={s.status} tc={s.terminal_consistency} sc={s.snapshot_complete}")
    print(f"  barrier: expected={s.expected_pages} completed={s.completed_pages} failed={s.failed_pages}")

    # Determine target status from InvoiceTempOCR
    ocr_record = InvoiceTempOCR.objects.filter(id=record_id).values('status', 'upload_session_id').first()
    if ocr_record:
        ocr_status = ocr_record.get('status')
        session_id = ocr_record.get('upload_session_id')
        print(f"  ocr_status={ocr_status}  session_id={session_id}")
    else:
        ocr_status = 'FAILED'
        session_id = None
        print(f"  [WARN] InvoiceTempOCR not found, defaulting to FAILED")

    # Target terminal status
    target_status = ocr_status if ocr_status in ('FINALIZED', 'FAILED', 'COMPLETED') else 'FAILED'

    if DRY_RUN:
        print(f"  [DRY_RUN] Would set: status={target_status}, terminal_consistency=True, "
              f"snapshot_complete=True, materialization_complete=True, "
              f"export_complete=True, validation_complete=True, assembly_complete=True")
        continue

    # Use QuerySet.update() to bypass SessionFinalizationState.save() guard
    updated = SessionFinalizationState.objects.filter(id=str(record_id)).update(
        status=target_status,
        terminal_consistency=True,
        snapshot_complete=True,
        materialization_complete=True,
        export_complete=True,
        validation_complete=True,
        assembly_complete=True,
        updated_at=timezone.now(),
    )

    if updated:
        print(f"  [OK] Recovered -> status={target_status}, terminal_consistency=True")
        recovered += 1
    else:
        print(f"  [WARN] No rows updated for record={record_id}")

print(f"\n{'='*70}")
print(f"RECOVERY COMPLETE — Recovered {recovered}/{len(stuck)} records")
print(f"{'='*70}")

# Verify
print("\nPost-recovery verification:")
for s in stuck:
    s.refresh_from_db()
    print(f"  ID={s.id}: status={s.status} tc={s.terminal_consistency} sc={s.snapshot_complete}")
