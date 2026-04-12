
import os
import django
import sys
from decimal import Decimal

# Set up Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models_voucher_payment import PaymentVoucher, PaymentVoucherItem
from accounting.models_pending_transaction import VoucherPendingTransaction
from accounting.serializers_payment import PaymentVoucherSerializer
from accounting.models import MasterLedger

def test_payment_save():
    print("\n--- Testing Payment Voucher Save ---")
    # Get arbitrary ledgers
    pay_from = MasterLedger.objects.get(id=3) # icic
    pay_to = MasterLedger.objects.get(id=17)
    
    data = {
        "voucher_number": "TEST-PAY-008",
        "date": "2026-04-12",
        "pay_from": pay_from.id,
        "source": "web",
        "narration": "Test saving",
        "items": [
            {
                "pay_to_ledger": pay_to.id,
                "amount": 500,
                "reference_type": "invoice",
                "reference_number": "INV-001",
                "pending_amount": 500,
                "balance_after": 0,
                "transaction_details": {
                    "invoice_no": "INV-001",
                    "date": "2026-04-01",
                    "amount": 1000,
                    "payment": 500,
                    "pending": 500,
                    "balance_after": 0
                }
            }
        ]
    }
    
    # We need a context with request for tenant_id usually, but let's see if it works without
    # (Serializer defaults it if not provided or gets from request)
    serializer = PaymentVoucherSerializer(data=data)
    if serializer.is_valid():
        print("Serializer is valid.")
        voucher = serializer.save(tenant_id='test-tenant')
        print(f"Created Voucher ID: {voucher.id}")
        print(f"Voucher Header -> ledger_id_val: {voucher.ledger_id_val}, party_customer_id: {voucher.party_customer_id}, party_vendor_id: {voucher.party_vendor_id}")
        items = PaymentVoucherItem.objects.filter(voucher=voucher)
        print(f"Items Created: {items.count()}")
        
        for item in items:
            print(f"Item {item.id} -> ledger_id_val: {item.ledger_id_val}, party_customer_id: {item.party_customer_id}, party_vendor_id: {item.party_vendor_id}")
            allocs = VoucherPendingTransaction.objects.filter(payment_item=item)
            print(f"Allocations for Item {item.id}: {allocs.count()}")
            for a in allocs:
                print(f"  - Alloc: {a.invoice_no}, Applied: {a.amount_applied}")
        # Check Journal Entries
        from accounting.models import JournalEntry
        entries = JournalEntry.objects.filter(voucher_type='PAYMENT', voucher_id=voucher.id)
        print(f"Journal Entries Created: {entries.count()}")
        for e in entries:
            print(f"  - Entry {e.id}: Ledger: {e.ledger_name}, Debit: {e.debit}, Credit: {e.credit}, party_customer_id: {e.party_customer_id}, party_vendor_id: {e.party_vendor_id}")
    else:
        print(f"Serializer Errors: {serializer.errors}")

def test_receipt_save():
    print("\n--- Testing Receipt Voucher Save ---")
    from accounting.serializers_receipt import ReceiptVoucherSerializer
    from accounting.models_voucher_receipt import ReceiptVoucher, ReceiptVoucherItem
    
    receive_in = MasterLedger.objects.get(id=3) # icic
    customer = MasterLedger.objects.get(id=17)
    
    data = {
        "voucher_number": "TEST-REC-008",
        "date": "2026-04-12",
        "receive_in": receive_in.id,
        "source": "web",
        "items": [
            {
                "customer": customer.id,
                "amount": 1000,
                "reference_type": "invoice",
                "received_amount": 1000,
                "pending_before": 2000,
                "balance_after": 1000,
                "pending_transaction": {
                    "invoiceNo": "SALES-001",
                    "date": "2026-04-05",
                    "amount": 2000,
                    "receivedAmount": 1000,
                    "pendingBefore": 2000,
                    "balanceAfter": 1000
                }
            }
        ]
    }
    
    serializer = ReceiptVoucherSerializer(data=data)
    if serializer.is_valid():
        print("Serializer is valid.")
        receipt = serializer.save(tenant_id='test-tenant')
        print(f"Created Receipt ID: {receipt.id}")
        print(f"Receipt Header -> ledger_id_val: {receipt.ledger_id_val}, party_customer_id: {receipt.party_customer_id}, party_vendor_id: {receipt.party_vendor_id}")
        items = ReceiptVoucherItem.objects.filter(voucher=receipt)
        print(f"Items Created: {items.count()}")
        
        for item in items:
            print(f"Item {item.id} -> ledger_id_val: {item.ledger_id_val}, party_customer_id: {item.party_customer_id}, party_vendor_id: {item.party_vendor_id}")
            allocs = VoucherPendingTransaction.objects.filter(receipt_item=item)
            print(f"Allocations for Item {item.id}: {allocs.count()}")
            for a in allocs:
                print(f"  - Alloc: {a.invoice_no}, Applied: {a.amount_applied}")
        # Check Journal Entries
        from accounting.models import JournalEntry
        entries = JournalEntry.objects.filter(voucher_type='RECEIPT', voucher_id=receipt.id)
        print(f"Journal Entries Created: {entries.count()}")
        for e in entries:
            print(f"  - Entry {e.id}: Ledger: {e.ledger_name}, Debit: {e.debit}, Credit: {e.credit}, party_customer_id: {e.party_customer_id}, party_vendor_id: {e.party_vendor_id}")
    else:
        print(f"Serializer Errors: {serializer.errors}")

if __name__ == "__main__":
    test_payment_save()
    test_receipt_save()
