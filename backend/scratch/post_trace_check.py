"""Post-trace DB state — verify who still shows NOT CHECKED."""
import django, os, sys
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
django.setup()

from pending_purchases.models import PendingPurchase
from ocr_pipeline.models import InvoiceTempOCR

print("PENDING PURCHASES — audit trail presence check")
print("=" * 70)

for pp in PendingPurchase.objects.filter(pending_purchase_status='PENDING').order_by('-id')[:15]:
    pp_ext = pp.extraction_payload or {}
    pp_audit = pp_ext.get('gst_audit_trail') is not None

    staging = InvoiceTempOCR.objects.filter(id=pp.source_scan_row_id).first()
    staging_audit = None
    if staging:
        s_ext = staging.extracted_data or {}
        staging_audit = s_ext.get('gst_audit_trail') is not None

    print(f"PP={pp.id:5} | vendor={pp.vendor_status[:20]:20} | item={pp.item_status[:20]:20} | pp_audit={str(pp_audit):5} | staging_audit={staging_audit}")

print()
print("pp_audit=True  => PendingPurchase.extraction_payload HAS gst_audit_trail (UI shows GST VALID/MISMATCH)")
print("pp_audit=False => PendingPurchase.extraction_payload MISSING gst_audit_trail (UI shows NOT CHECKED)")
