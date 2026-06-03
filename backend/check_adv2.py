import sys
from accounting.views_payment import get_advances_by_ledger
from accounting.services.advance_service import get_allocated_amount
from decimal import Decimal

with open('adv_output.txt', 'w') as f:
    advances = list(get_advances_by_ledger(688))
    f.write(f'Advances for 688: {len(advances)}\n')
    for adv in advances:
        source_type = getattr(adv, '_source', 'payment')
        total_amt = Decimal(str(getattr(adv, 'amount', 0) or getattr(adv, 'received_amount', 0) or 0))
        ref_no = getattr(adv, 'advance_ref_no', None) or getattr(adv, 'reference_number', None)
        allocated = get_allocated_amount(adv.id, source_type, adv.tenant_id, ref_no=ref_no)
        f.write(f'ID: {adv.id}, Total: {total_amt}, Allocated: {allocated}, Remaining: {total_amt - allocated}\n')
