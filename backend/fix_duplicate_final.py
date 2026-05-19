"""
Final cleanup: Remove the remaining duplicate supplier_invoice_no='1234567' record.
Keep reference_id=41 (voucher_id=116, total=1061.80 with GST) 
Delete reference_id=38 (voucher_id=110, total=630.60 - the stale version)
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import JournalEntry, Voucher
from accounting.models_voucher_purchase import VoucherPurchaseSupplierDetails
from django.db import transaction

print("=== Final Duplicate Cleanup ===\n")

tid = 'd79bd4c3-1349-400f-8b36-962f7dbf72e9'

# The stale records to remove
stale_supplier_id = 38
stale_voucher_id = 110

with transaction.atomic():
    # Delete journal entries for the stale voucher
    j_del, _ = JournalEntry.objects.filter(
        tenant_id=tid,
        voucher_type__in=['PURCHASE', 'PURCHASE_GST_DETAIL', 'PURCHASE_TDS_DETAIL', 'PURCHASE_TCS_DETAIL'],
        voucher_id=stale_voucher_id
    ).delete()
    print(f"Deleted {j_del} journal entries for stale voucher_id={stale_voucher_id}")
    
    # Delete the stale generic Voucher record
    v_del, _ = Voucher.objects.filter(id=stale_voucher_id).delete()
    print(f"Deleted {v_del} Voucher record (id={stale_voucher_id})")
    
    # Delete the stale VoucherPurchaseSupplierDetails (cascades to child tables)
    p_del, _ = VoucherPurchaseSupplierDetails.objects.filter(id=stale_supplier_id).delete()
    print(f"Deleted {p_del} VoucherPurchaseSupplierDetails records (id={stale_supplier_id}) + child tables")

# Verify clean state
print("\n--- Verification ---")
remaining = JournalEntry.objects.filter(
    voucher_number__icontains='seedrf000012345'
).values('voucher_id', 'voucher_type', 'debit', 'credit')
print("Remaining journal entries for seedrf000012345:")
for r in remaining:
    print(f"  voucher_id={r['voucher_id']} | type={r['voucher_type']} | dr={r['debit']} | cr={r['credit']}")

remaining_v = Voucher.objects.filter(voucher_number__icontains='seedrf000012345').values('id', 'voucher_number', 'total', 'reference_id')
print("Remaining Voucher records:")
for v in remaining_v:
    print(f"  id={v['id']} | voucher_number={v['voucher_number']} | total={v['total']} | reference_id={v['reference_id']}")

print("\nDone! Refresh the Reports page.")
