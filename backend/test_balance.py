import os
import sys
import django
import logging

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import MasterLedger, JournalEntry, AmountTransaction, TransactionFile
from django.db.models import Sum

def test_balance():
    # Find cash3 ledger
    ledgers = MasterLedger.objects.filter(name='cash3')
    for obj in ledgers:
        print(f"Testing balance for {obj.name} (ID: {obj.id}, Tenant: {obj.tenant_id})")
        
        # 1. AmountTransaction
        latest_txn = AmountTransaction.objects.filter(
            tenant_id=obj.tenant_id,
            ledger=obj
        ).order_by('-transaction_date', '-created_at').first()
        if latest_txn:
            print(f"AmountTransaction balance: {latest_txn.balance}")
        else:
            print("No AmountTransaction found.")
            
        # 2. TransactionFile
        tf = TransactionFile.objects.filter(
            tenant_id=obj.tenant_id,
            ledger_name=obj.name
        ).first()
        if tf and tf.transactions:
            print(f"TransactionFile balance: {tf.transactions.get('balance', 0)}")
        else:
            print("No TransactionFile balance.")
            
        # 3. JournalEntry
        entries = JournalEntry.objects.filter(
            tenant_id=obj.tenant_id,
            ledger=obj
        )
        total_debit = entries.aggregate(Sum('debit'))['debit__sum'] or 0
        total_credit = entries.aggregate(Sum('credit'))['credit__sum'] or 0
        
        ob = float(obj.opening_balance or 0)
        ob_type = str(obj.opening_balance_type or 'Dr').strip()
        is_debit = ob_type.lower() in ('debit', 'dr')

        if obj.category in ['Asset', 'Expenditure', 'Expense']:
            balance = float(total_debit) - float(total_credit)
            balance += ob if is_debit else -ob
        else:  # Liability, Income, Capital
            balance = float(total_credit) - float(total_debit)
            balance += ob if not is_debit else -ob
            
        print(f"JournalEntry computed balance: {balance} (Debit: {total_debit}, Credit: {total_credit}, OB: {ob} {ob_type})")
        print("-" * 50)

if __name__ == '__main__':
    test_balance()
