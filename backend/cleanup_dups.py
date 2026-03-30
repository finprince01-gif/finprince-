from accounting.models_voucher_payment import PaymentVoucher
from accounting.models_voucher_receipt import ReceiptVoucher
from accounting.models import Voucher
from django.db import transaction

@transaction.atomic
def cleanup_duplicates():
    # 1. PaymentVoucher
    v_nums = PaymentVoucher.objects.values_list('voucher_number', flat=True).distinct()
    for v_num in v_nums:
        items = PaymentVoucher.objects.filter(voucher_number=v_num).order_by('id')
        if items.count() > 1:
            for i, item in enumerate(items[1:], 1):
                new_num = f"{v_num}-{i}"
                print(f"Renaming PaymentVoucher {item.id}: {v_num} -> {new_num}")
                item.voucher_number = new_num
                item.save()
                # Update corresponding global voucher if exists
                Voucher.objects.filter(type='payment', reference_id=item.id).update(voucher_number=new_num)

    # 2. ReceiptVoucher
    v_nums = ReceiptVoucher.objects.values_list('voucher_number', flat=True).distinct()
    for v_num in v_nums:
        items = ReceiptVoucher.objects.filter(voucher_number=v_num).order_by('id')
        if items.count() > 1:
            for i, item in enumerate(items[1:], 1):
                new_num = f"{v_num}-{i}"
                print(f"Renaming ReceiptVoucher {item.id}: {v_num} -> {new_num}")
                item.voucher_number = new_num
                item.save()
                Voucher.objects.filter(type='receipt', reference_id=item.id).update(voucher_number=new_num)

    # 3. Global Voucher (anything missed)
    v_nums = Voucher.objects.values('tenant_id', 'type', 'voucher_number').distinct()
    # (Actually it's better to just check for duplicates in the global one too)
    from django.db.models import Count
    dups = Voucher.objects.values('tenant_id', 'type', 'voucher_number').annotate(count=Count('id')).filter(count__gt=1)
    for d in dups:
        items = Voucher.objects.filter(tenant_id=d['tenant_id'], type=d['type'], voucher_number=d['voucher_number']).order_by('id')
        for i, item in enumerate(items[1:], 1):
            new_num = f"{d['voucher_number']}-{i}"
            print(f"Renaming Global Voucher {item.id}: {item.voucher_number} -> {new_num}")
            item.voucher_number = new_num
            item.save()

cleanup_duplicates()
print("Cleanup complete.")
