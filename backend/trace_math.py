import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.serializers_receipt import ReceiptVoucherViewSet
from decimal import Decimal

def _safe_decimal(val):
    if not val:
        return Decimal('0')
    try:
        return Decimal(str(val).replace(',', ''))
    except Exception:
        return Decimal('0')

validated_data = {
    'items': [{'amount': 45450, 'received_amount': 45450}],
    'total_amount': 45450
}

items_data = validated_data.pop('items', [])
v_total_provided = validated_data.pop('total_amount', None)

final_total = _safe_decimal(v_total_provided) if v_total_provided is not None else Decimal('0')
print(f"final_total: {final_total}")

sum_items = sum(_safe_decimal(i.get('received_amount', i.get('amount', 0))) for i in items_data)
print(f"sum_items: {sum_items}")

remainder_adv = Decimal('0.00')
if not items_data:
    remainder_adv = final_total
else:
    remainder_adv = max(Decimal('0.00'), final_total - sum_items)
    
print(f"remainder_adv: {remainder_adv}")
print(f"remainder_adv > 0: {remainder_adv > 0}")
