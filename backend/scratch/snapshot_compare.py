import django, os, sys, json, gzip
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from ocr_pipeline.models import FinalizedSnapshot
from core.storage import StorageService

sessions = {
    'Run1': 'b6daefa3-3c45-49d2-bd09-c7931bec5c73',
    'Run2': '2c9a4f99-286d-42ec-97a0-57d477ff0ef4',
    'Run3': 'e8710170-00b2-47e8-bd3b-8f8b6c753f78',
}

ss = StorageService()
for run, sid in sessions.items():
    snap = FinalizedSnapshot.objects.filter(session_id=sid).order_by('-created_at').first()
    if not snap:
        print(f'{run}: NO SNAPSHOT FOUND for session {sid}')
        continue
    raw = ss.get_file(snap.s3_key)
    data = json.loads(gzip.decompress(raw).decode('utf-8'))
    invoices = data.get('data', [])
    inv_nos = sorted([str(i.get('invoice_no', 'UNKNOWN')) for i in invoices])
    print(f"\n{run} ({sid[:8]}...) => {len(invoices)} invoices:")
    for inv in inv_nos:
        print(f"  {inv}")
