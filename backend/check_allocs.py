import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import ReceiptVoucher, AdvanceAllocation
v = ReceiptVoucher.objects.get(voucher_number='REC002726-27')
allocs = AdvanceAllocation.objects.filter(transaction_id=v.id)
print(f"Allocations for REC002726-27: {[(a.id, a.reference_number, a.amount, getattr(a, 'pay_from_ledger_id', None), getattr(a, 'pay_to_ledger_id', None)) for a in allocs]}")
