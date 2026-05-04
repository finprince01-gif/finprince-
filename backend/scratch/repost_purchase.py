import os
import django
import sys
from decimal import Decimal
from dotenv import load_dotenv

sys.path.append(r"d:\ledger_report0.22\AI-accounting-0.03\backend")
load_dotenv(r"d:\ledger_report0.22\AI-accounting-0.03\backend\.env")
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import VoucherPurchaseSupplierDetails, Voucher
from accounting.serializers_voucher_purchase import VoucherPurchaseSupplierDetailsSerializer

pur = VoucherPurchaseSupplierDetails.objects.filter(vendor_name__icontains='vendor3').last()
if pur:
    serializer = VoucherPurchaseSupplierDetailsSerializer()
    
    # Manually reconstruct the dictionaries from the database objects to pass to _post_journal_entries
    due_data = {}
    if hasattr(pur, 'due_details') and pur.due_details:
        due_data['tds_it'] = pur.due_details.tds_it
        due_data['to_pay'] = pur.due_details.to_pay
        due_data['advance_paid'] = pur.due_details.advance_paid
        due_data['advance_references'] = pur.due_details.advance_references
        
    supply_inr_data = {}
    if hasattr(pur, 'supply_inr_details') and pur.supply_inr_details:
        supply_inr_data['purchase_ledger'] = pur.supply_inr_details.purchase_ledger
        
    supply_foreign_data = {}
    if hasattr(pur, 'supply_foreign_details') and pur.supply_foreign_details:
        supply_foreign_data['purchase_ledger'] = pur.supply_foreign_details.purchase_ledger

    net_val = Decimal(str(due_data.get('to_pay', 0) if due_data else 0))
    adv_val = Decimal(str(due_data.get('advance_paid', 0) if due_data else 0))
    purchase_total_gross = net_val + adv_val

    voucher = Voucher.objects.filter(voucher_number=(pur.purchase_voucher_no or pur.supplier_invoice_no), type='purchase').first()
    voucher_id = voucher.id if voucher else None

    serializer._post_journal_entries(
        supplier_instance=pur,
        voucher_id=voucher_id,
        purchase_total=purchase_total_gross,
        supply_inr_data=supply_inr_data,
        supply_foreign_data=supply_foreign_data,
        due_data=due_data
    )
    print("Successfully posted journal entries for purchase voucher:", pur.purchase_voucher_no)
    
    # Check if entries exist now
    from accounting.models import MasterLedger, JournalEntry
    tcs = MasterLedger.objects.filter(name__icontains='TCS').first()
    if tcs:
        print(f'Ledger found: {tcs.name} - ID: {tcs.id}')
        entries = JournalEntry.objects.filter(ledger_id=tcs.id)
        print(f'Number of journal entries: {entries.count()}')
        for e in entries:
            print(f'Entry: voucher={e.voucher_number}, debit={e.debit}, credit={e.credit}')
