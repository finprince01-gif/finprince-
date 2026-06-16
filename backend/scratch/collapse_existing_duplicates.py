import os
import sys
import django

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from pending_purchases.models import PendingPurchase
from django.db.models import Count
from django.db import transaction

def collapse_duplicates():
    # Find active business keys with duplicates
    duplicates = (
        PendingPurchase.objects.filter(pending_purchase_status='PENDING')
        .values('invoice_number', 'vendor_gstin', 'company_id', 'branch_id')
        .annotate(cnt=Count('id'))
        .filter(cnt__gt=1)
    )

    print(f"Found {len(duplicates)} duplicate business key combinations in PENDING state.")

    total_deleted = 0

    for dup in duplicates:
        inv_no = dup['invoice_number']
        gstin = dup['vendor_gstin']
        company = dup['company_id']
        branch = dup['branch_id']

        # Get all matching active records sorted by created_at descending (latest first)
        records = list(
            PendingPurchase.objects.filter(
                invoice_number=inv_no,
                vendor_gstin=gstin,
                company_id=company,
                branch_id=branch,
                pending_purchase_status='PENDING'
            ).order_by('-created_at')
        )

        # Keep the latest one, delete the rest
        keep = records[0]
        to_delete = records[1:]

        print(f"Invoice '{inv_no}' for GSTIN '{gstin}' (tenant: {company}): keeping ID {keep.id}, deleting {len(to_delete)} duplicates: {[r.id for r in to_delete]}")

        with transaction.atomic():
            for r in to_delete:
                r.delete()
                total_deleted += 1

    print(f"Cleanup complete. Total duplicate rows deleted: {total_deleted}")

if __name__ == '__main__':
    collapse_duplicates()
