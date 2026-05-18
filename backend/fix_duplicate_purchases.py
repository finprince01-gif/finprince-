"""
Fix duplicate Purchase Voucher records:
- Same supplier_invoice_no was saved multiple times creating duplicate Voucher + JournalEntry records
- Keep only the latest (highest ID) VoucherPurchaseSupplierDetails per invoice_no + tenant
- Delete all older duplicate Voucher and JournalEntry records

Run this ONCE to clean up existing bad data. Future edits will use update() correctly.
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import JournalEntry, Voucher
from accounting.models_voucher_purchase import VoucherPurchaseSupplierDetails
from django.db.models import Count, Max
from django.db import transaction

print("=== Fixing Duplicate Purchase Voucher Records ===\n")

# Find supplier_invoice_no + tenant_id combinations that have multiple records
duplicates = (
    VoucherPurchaseSupplierDetails.objects
    .values('tenant_id', 'supplier_invoice_no')
    .annotate(cnt=Count('id'), latest_id=Max('id'))
    .filter(cnt__gt=1)
)

total_vouchers_deleted = 0
total_journal_deleted = 0
total_purchase_records_deleted = 0

for dup in duplicates:
    tid = dup['tenant_id']
    inv_no = dup['supplier_invoice_no']
    latest_id = dup['latest_id']
    cnt = dup['cnt']
    
    print(f"\nProcessing: tenant={tid} | invoice_no='{inv_no}' | {cnt} records (keeping latest id={latest_id})")
    
    # Get all supplier details IDs for this duplicate group (excluding the latest)
    old_supplier_ids = list(
        VoucherPurchaseSupplierDetails.objects
        .filter(tenant_id=tid, supplier_invoice_no=inv_no)
        .exclude(id=latest_id)
        .values_list('id', flat=True)
    )
    print(f"  Old supplier detail IDs to remove: {old_supplier_ids}")
    
    with transaction.atomic():
        # Find Voucher records that reference the old supplier detail IDs
        old_vouchers = Voucher.objects.filter(
            tenant_id=tid,
            type='purchase',
            reference_id__in=old_supplier_ids
        )
        old_voucher_ids = list(old_vouchers.values_list('id', flat=True))
        print(f"  Old Voucher IDs: {old_voucher_ids}")
        
        # Delete journal entries for old voucher IDs
        if old_voucher_ids:
            j_del, _ = JournalEntry.objects.filter(
                tenant_id=tid,
                voucher_type__in=['PURCHASE', 'PURCHASE_GST_DETAIL', 'PURCHASE_TDS_DETAIL', 'PURCHASE_TCS_DETAIL'],
                voucher_id__in=old_voucher_ids
            ).delete()
            total_journal_deleted += j_del
            print(f"  Deleted {j_del} journal entries for old voucher IDs")
        
        # Delete old Voucher records
        v_del, _ = old_vouchers.delete()
        total_vouchers_deleted += v_del
        print(f"  Deleted {v_del} Voucher records")
        
        # Now delete old VoucherPurchaseSupplierDetails (cascades to child tables)
        p_del, _ = VoucherPurchaseSupplierDetails.objects.filter(
            tenant_id=tid,
            supplier_invoice_no=inv_no,
            id__in=old_supplier_ids
        ).delete()
        total_purchase_records_deleted += p_del
        print(f"  Deleted {p_del} VoucherPurchaseSupplierDetails records (+ child tables)")
    
    # Verify the Voucher for the latest record is properly linked
    latest = VoucherPurchaseSupplierDetails.objects.get(id=latest_id)
    v = Voucher.objects.filter(tenant_id=tid, type='purchase', reference_id=latest_id).first()
    if v:
        print(f"  Kept: supplier_id={latest_id} -> Voucher id={v.id} | voucher_number={v.voucher_number} | total={v.total}")
    else:
        print(f"  WARNING: No Voucher record found for supplier_id={latest_id} — will be created on next edit")

print(f"\n{'='*50}")
print(f"Summary:")
print(f"  Purchase records deleted:  {total_purchase_records_deleted}")
print(f"  Voucher records deleted:   {total_vouchers_deleted}")
print(f"  Journal entries deleted:   {total_journal_deleted}")
print(f"\nRefresh the reports page to see clean data.")
