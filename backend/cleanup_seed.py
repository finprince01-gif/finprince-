import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from django.db import transaction as db_transaction
from django.contrib.auth import get_user_model
from accounting.models import MasterLedger, Voucher, VoucherReceiptSingle, JournalEntry
from customerportal.database import CustomerMasterCustomerBasicDetails, CustomerMasterCategory

def cleanup():
    User = get_user_model()
    for user in User.objects.all():
        tenant_id = user.tenant_id
        if not tenant_id: continue
        print(f"Cleaning all accounting transactions for tenant: {tenant_id}")
        with db_transaction.atomic():
            # Delete all receipts, payments, vouchers, and journal entries
            vr_del = VoucherReceiptSingle.objects.filter(tenant_id=tenant_id).delete()
            v_del = Voucher.objects.filter(tenant_id=tenant_id).delete()
            j_del = JournalEntry.objects.filter(tenant_id=tenant_id).delete()
            print(f"Deleted {vr_del[0]} Receipts, {v_del[0]} Vouchers, {j_del[0]} Journal entries")

if __name__ == '__main__':
    cleanup()
