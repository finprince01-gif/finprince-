
from accounting.models_voucher_payment import PaymentVoucherItem
from accounting.models_voucher_receipt import ReceiptVoucherItem
from django.db.models import Q

def search():
    print("Searching Payments...")
    qs1 = PaymentVoucherItem.objects.filter(Q(advance_ref_no__icontains='dsds') | Q(reference_id__icontains='dsds'))
    for i in qs1:
        print(f"PMT: id={i.id}, amount={i.amount}, ref={i.advance_ref_no}")

    print("Searching Receipts...")
    qs2 = ReceiptVoucherItem.objects.filter(Q(advance_ref_no__icontains='dsds') | Q(reference_id__icontains='dsds') | Q(is_advance=True))
    for i in qs2:
        meta = getattr(i, 'transaction_details', {}) or {}
        ref = getattr(i, 'advance_ref_no', '') or meta.get('reference_no', '')
        amt = getattr(i, 'amount', 0) or getattr(i, 'received_amount', 0)
        if 'dsds' in str(ref).lower():
            print(f"RCT: id={i.id}, amount={amt}, ref={ref}")

if __name__ == "__main__":
    import django
    import os
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    django.setup()
    search()
