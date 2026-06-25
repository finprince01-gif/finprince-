"""
FINAL PROBE: Simulate the FULL pipeline path for a DUPLICATE record.
Check: After revalidate() resets status, does pipeline EXIT early at L2893?
L2893: if is_pending: return {"status": "PENDING_PURCHASE"}
L2896: if is_duplicate: return {"status": "DUPLICATE"}  <- exits BEFORE persisting gst_audit_trail?

Wait — gst_audit_trail is written at L2742 (before evaluate_pending_purchase).
So the question is: does the early return at L2896 prevent the gst_audit_trail from
being written?

No — record.save(update_fields=['extracted_data']) at L2742 writes it to DB.
Then evaluate_pending_purchase at L2881 copies record.extracted_data to PendingPurchase.

Let's verify: for a DUPLICATE record, does evaluate_pending_purchase update extraction_payload?

Check: services.py L111
    exists_in_queue = PendingPurchase.objects.filter(source_scan_row_id=record.id).exists()
    if not is_pending and not exists_in_queue:
        return False

For DUPLICATE: is_pending=False, exists_in_queue=True (already in queue)
So it CONTINUES and does the update at L162/194 with record.extracted_data.

The real question: for the 8 DUPLICATE records without gst_audit_trail,
IS there actually a PendingPurchase linked? Or did those records never go through
evaluate_pending_purchase after the current GST engine was added to the codebase?
"""
import django, os, sys
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from pending_purchases.models import PendingPurchase

SEP = "=" * 70

print(SEP)
print("CHECKING: For DUPLICATE records without gst_audit_trail,")
print("          is there a PendingPurchase.extraction_payload linked?")
print(SEP)

missing_and_duplicate = []
for rec in InvoiceTempOCR.objects.filter(is_primary=True).order_by('-id')[:200]:
    ext = rec.extracted_data or {}
    if ext.get('gst_audit_trail') is None:
        missing_and_duplicate.append(rec)

print(f"Records without gst_audit_trail: {len(missing_and_duplicate)}")
print()

for rec in missing_and_duplicate:
    pp = PendingPurchase.objects.filter(source_scan_row_id=rec.id).first()
    ext = rec.extracted_data or {}
    print(f"InvoiceTempOCR id={rec.id} validation_status={rec.validation_status} status={rec.status}")
    print(f"  items count : {len(ext.get('items', []))}")
    print(f"  assembled_exports present : {'assembled_exports' in ext}")
    if 'assembled_exports' in ext and ext['assembled_exports']:
        ae0 = ext['assembled_exports'][0]
        items_in_ae = ae0.get('items', [])
        print(f"  assembled_exports[0] items count : {len(items_in_ae)}")
    print(f"  PendingPurchase linked : {pp is not None}")
    if pp:
        pp_ext = pp.extraction_payload or {}
        print(f"  PP.vendor_status : {pp.vendor_status}")
        print(f"  PP.voucher_status : {pp.voucher_status}")
        print(f"  PP.extraction_payload has gst_audit_trail : {pp_ext.get('gst_audit_trail') is not None}")
    print()

print(SEP)
print("ROOT CAUSE DETERMINATION")
print(SEP)

print("""
The pipeline execution order for a DUPLICATE record after revalidate() reset:

  L2481  → is_duplicate = True  (set but no return)
  L2489  → Inventory validation runs
  L2543  → record.extracted_data updated with item_status
  L2550  → items = inv_val["items"]      <- items is populated here
  L2558  → GST engine try block begins
  L2591  → for item in items: ...        <- iterates if items present
  L2716  → record.extracted_data['gst_audit_trail'] = {...}
  L2742  → record.save(update_fields=['extracted_data'])  <- WRITES to DB
  L2881  → evaluate_pending_purchase(record, ...)         <- COPIES to PendingPurchase

Question: WHY is gst_audit_trail absent if all these steps should run?

Hypothesis 1: The 8 records were processed BEFORE the GST engine code was added
              (legacy records, gst_audit_trail never existed for them).
              They would need a fresh revalidate() to get it.

Hypothesis 2: The 8 records have empty items, so the GST engine loop produces
              all-zero values, but gst_audit_trail IS still written (all zeros).
              But it shows 'gst_audit_trail: None' in our probe -> it's absent.
              So either the GST engine silently threw an exception OR items was empty
              and the save at L2742 was never called.

Hypothesis 3: The 8 records are not linked to any PendingPurchase, and the UI
              showing NOT CHECKED is from SmartInvoiceUploadModal reading
              InvoiceTempOCR.extracted_data directly (no gst_audit_trail = NOT CHECKED).
""")

# Check if these records are actually viewable in Purchase Scan / Pending Purchases
for rec in missing_and_duplicate:
    pp = PendingPurchase.objects.filter(source_scan_row_id=rec.id).first()
    ext = rec.extracted_data or {}
    items = ext.get('items', [])
    ae_items = []
    if 'assembled_exports' in ext and ext['assembled_exports']:
        ae_items = ext['assembled_exports'][0].get('items', [])
    actual_items = items or ae_items
    print(f"id={rec.id} val_status={rec.validation_status} "
          f"items={len(actual_items)} pp_linked={pp is not None} "
          f"gst_audit={ext.get('gst_audit_trail') is not None}")
