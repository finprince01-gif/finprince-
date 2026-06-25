"""
PHASE 2 EXTENDED — Full dump of all PendingPurchase rows + their InvoiceTempOCR origins.
Also check if the same invoice_number appears across DIFFERENT statuses.
"""
import django, os, sys, json
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
django.setup()

from pending_purchases.models import PendingPurchase
from ocr_pipeline.models import InvoiceTempOCR

SEP = "=" * 80

print(SEP)
print("ALL PendingPurchase ROWS — Full Dump")
print(SEP)

all_pps = list(PendingPurchase.objects.all().order_by('invoice_number', 'id'))
print(f"Total rows: {len(all_pps)}")
print()

# Group by invoice_number for display
by_invoice = {}
for pp in all_pps:
    key = str(pp.invoice_number or '').strip().upper()
    by_invoice.setdefault(key, []).append(pp)

for inv_no, pps in sorted(by_invoice.items()):
    if len(pps) > 1:
        marker = "*** DUPLICATE ***"
    else:
        marker = ""
    print(f"invoice_number='{inv_no}' rows={len(pps)} {marker}")
    for pp in pps:
        print(f"  PP id={pp.id}")
        print(f"    source_scan_row_id: {pp.source_scan_row_id}")
        print(f"    source_document_hash: {pp.source_document_hash}")
        print(f"    scan_session_id: {pp.scan_session_id}")
        print(f"    vendor_gstin: {pp.vendor_gstin}")
        print(f"    vendor_status: {pp.vendor_status}")
        print(f"    item_status: {pp.item_status}")
        print(f"    voucher_status: {pp.voucher_status}")
        print(f"    pending_purchase_status: {pp.pending_purchase_status}")
        print(f"    created_at: {pp.created_at}")
        print(f"    updated_at: {pp.updated_at}")
        # Join to InvoiceTempOCR
        try:
            ocr = InvoiceTempOCR.objects.get(id=pp.source_scan_row_id)
            ext = ocr.extracted_data or {}
            print(f"    InvoiceTempOCR id={ocr.id}:")
            print(f"      file_hash: {ocr.file_hash}")
            print(f"      upload_session_id: {ocr.upload_session_id}")
            print(f"      created_at: {ocr.created_at}")
            print(f"      validation_status: {ocr.validation_status}")
            print(f"      status: {ocr.status}")
            print(f"      processed: {ocr.processed}")
            # Check if there are OTHER InvoiceTempOCR records with the same file_hash
            same_hash = InvoiceTempOCR.objects.filter(file_hash=ocr.file_hash).exclude(id=ocr.id)
            print(f"      OTHER staging records with same file_hash: {same_hash.count()}")
            for sh in same_hash:
                pp2 = PendingPurchase.objects.filter(source_scan_row_id=sh.id).first()
                print(f"        InvoiceTempOCR id={sh.id} session={sh.upload_session_id} vs={sh.validation_status} -> PP={pp2.id if pp2 else 'NONE'}")
        except InvoiceTempOCR.DoesNotExist:
            print(f"    InvoiceTempOCR id={pp.source_scan_row_id}: NOT FOUND IN DB")
    print()

print(SEP)
print("CHECKING: Any invoice_number in PendingPurchase that ALSO has a VOUCHER_CREATED staging record?")
print("(This would indicate a duplicate is still showing in the queue)")
print(SEP)

for pp in all_pps:
    if not pp.invoice_number:
        continue
    # Check if there is a staging record for this invoice that already has a voucher
    voucher_exists = InvoiceTempOCR.objects.filter(
        supplier_invoice_no__iexact=pp.invoice_number,
        validation_status__in=['VOUCHER_CREATED', 'DUPLICATE', 'DUPLICATE_INVOICE', 'DUPLICATE_IN_BATCH']
    ).exclude(id=pp.source_scan_row_id).first()
    if voucher_exists:
        print(f"  PP id={pp.id} invoice='{pp.invoice_number}' pp_status={pp.pending_purchase_status}")
        print(f"    -> InvoiceTempOCR id={voucher_exists.id} validation_status={voucher_exists.validation_status} (ALREADY PROCESSED ELSEWHERE)")

print()

print(SEP)
print("CHECKING: PendingPurchase rows linked to staging records in status PENDING/EXTRACTING (stale)")
print(SEP)
stale_count = 0
for pp in all_pps:
    try:
        ocr = InvoiceTempOCR.objects.get(id=pp.source_scan_row_id)
        if ocr.validation_status in ('PENDING', 'EXTRACTING', 'PROCESSING'):
            stale_count += 1
            print(f"  PP id={pp.id} invoice='{pp.invoice_number}' pp_status={pp.pending_purchase_status}")
            print(f"    -> InvoiceTempOCR id={ocr.id} validation_status={ocr.validation_status} status={ocr.status}")
    except InvoiceTempOCR.DoesNotExist:
        print(f"  PP id={pp.id} -> staging record {pp.source_scan_row_id} GONE (orphan)")
        stale_count += 1

print(f"\n  Stale/orphan PP rows: {stale_count}")

print(SEP)
print("CHECK: PendingPurchases.tsx API — what does /api/pending-purchases/ return for duplicates?")
print("Looking for how duplicates get into the Pending Purchases LIST view")
print(SEP)
# Find any RESOLVED PendingPurchase rows that have the same invoice as an active one
print("RESOLVED rows:")
for pp in PendingPurchase.objects.filter(pending_purchase_status='RESOLVED'):
    active = PendingPurchase.objects.filter(
        invoice_number__iexact=pp.invoice_number,
        vendor_gstin__iexact=pp.vendor_gstin,
        pending_purchase_status='PENDING'
    ).first()
    print(f"  PP id={pp.id} invoice='{pp.invoice_number}' gstin='{pp.vendor_gstin}'")
    print(f"    active row for same invoice: {active.id if active else 'NONE'}")

print("\nDone.")
