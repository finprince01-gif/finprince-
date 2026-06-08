import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

import logging
logging.basicConfig(level=logging.INFO)
# Make all loggers output to console
for logger_name in ['', 'ocr_pipeline', 'vouchers', 'vouchers.assembly_worker']:
    l = logging.getLogger(logger_name)
    l.setLevel(logging.DEBUG)

from ocr_pipeline.models import InvoiceTempOCR, SessionFinalizationState
from ocr_pipeline.pipeline import assemble_multi_page_record
from core.redis_orchestrator import orchestrator

rid = 1006819
record = InvoiceTempOCR.objects.get(id=rid)

# Clear locks
tenant_id = record.tenant_id
session_id = record.upload_session_id
merge_lock_name = f"merge:{tenant_id}:{session_id}:{record.id}"
finalization_lock_name = f"finalization:{tenant_id}:{session_id}:{record.id}"

from ocr_pipeline.pipeline import release_redis_lock
release_redis_lock(merge_lock_name)
release_redis_lock(finalization_lock_name)

# Reset SessionFinalizationState snapshot_created/status/flags
SessionFinalizationState.objects.filter(id=str(rid)).update(
    snapshot_created=False, 
    status='PENDING',
    export_complete=False,
    materialization_complete=False,
    snapshot_complete=False
)

# Call assembly
print("\n>>> STARTING REPLAY ASSEMBLY <<<")
try:
    res = assemble_multi_page_record(record, force=True)
    print("\n>>> ASSEMBLY RESULT <<<")
    print(res)
except Exception as e:
    print("\n>>> ASSEMBLY CRASHED <<<")
    import traceback
    traceback.print_exc()

