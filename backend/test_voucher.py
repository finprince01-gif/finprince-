import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import PaymentVoucher, JournalEntry

voucher = PaymentVoucher.objects.filter(voucher_number='300173').first()
if voucher:
    print("VOUCHER:", voucher.voucher_number)
    print("  party_vendor_id:", voucher.party_vendor_id)
    print("  party_customer_id:", voucher.party_customer_id)
    print("  ledger_id_val:", voucher.ledger_id_val)
    print("  pay_from_ledger:", voucher.pay_from_ledger.name if voucher.pay_from_ledger else None)
    
    entries = JournalEntry.objects.filter(voucher_id=voucher.id)
    print("\nENTRIES:")
    for e in entries:
        print(f"  Ledger: {e.ledger.name}, Debit: {e.debit}, Credit: {e.credit}, Vendor_ID: {e.vendor_id}, Party_Vendor_ID: {e.party_vendor_id}")
else:
    print("Voucher not found")
