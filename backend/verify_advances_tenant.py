import os
import django

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models_voucher_payment import PaymentVoucherItem
from django.db.models import F

print("--- Payment Voucher Item Analysis ---")
items = PaymentVoucherItem.objects.all().select_related('voucher')
print(f"Total Items: {items.count()}")

for i in items:
    voucher = i.voucher
    tenant_id = voucher.tenant_id if voucher else "MISSING VOUCHER"
    
    # Check if the voucher has a tenant
    print(f"ID: {i.id} | Amt: {i.amount} | Type: {i.reference_type} | Ledger: {i.pay_to_ledger_id} | Voucher: {voucher.id if voucher else 'None'} | Tenant: {tenant_id}")

print("\n--- Summary of Advances ---")
advances = PaymentVoucherItem.objects.filter(reference_type='ADVANCE').select_related('voucher')
for a in advances:
    print(f"ADVANCE | ID: {a.id} | Amt: {a.amount} | Ledger: {a.pay_to_ledger_id} | Tenant: {a.voucher.tenant_id if a.voucher else 'None'}")
