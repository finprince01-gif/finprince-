import os
import django
import uuid
from decimal import Decimal
from datetime import date, timedelta

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from accounting.models import MasterLedger, Voucher, VoucherReceiptSingle
from customerportal.database import CustomerMasterCustomerBasicDetails, CustomerMasterCategory

def seed():
    User = get_user_model()
    user = User.objects.first()
    if not user:
        print("No user found to get tenant_id")
        return
    tenant_id = user.tenant_id
    print(f"Seeding for tenant: {tenant_id}")
    
    # 1. Create basic ledgers
    ledgers = [
        {'name': 'Cash Account', 'group': 'Cash-in-hand', 'category': 'Assets'},
        {'name': 'HDFC Bank', 'group': 'Bank Accounts', 'category': 'Assets'},
        {'name': 'Sales Account', 'group': 'Sales Accounts', 'category': 'Income'},
    ]
    
    ledger_objects = {}
    for l in ledgers:
        obj, created = MasterLedger.objects.get_or_create(
            name=l['name'],
            tenant_id=tenant_id,
            defaults={'group': l['group'], 'category': l['category']}
        )
        ledger_objects[l['name']] = obj
        if created: print(f"Created ledger: {l['name']}")

    # 2. Create customer category
    cat, created = CustomerMasterCategory.objects.get_or_create(
        category='Standard',
        tenant_id=tenant_id
    )
    if created: print("Created customer category: Standard")

    # 3. Create customers
    customers = [
        {'name': 'Global Solutions', 'code': 'CUST001'},
        {'name': 'Precision Tech', 'code': 'CUST002'},
    ]
    
    customer_objects = []
    for c in customers:
        # Create ledger for customer
        cust_ledger, created = MasterLedger.objects.get_or_create(
            name=c['name'],
            tenant_id=tenant_id,
            defaults={'group': 'Sundry Debtors', 'category': 'Assets'}
        )
        
        obj, created = CustomerMasterCustomerBasicDetails.objects.get_or_create(
            customer_name=c['name'],
            tenant_id=tenant_id,
            defaults={
                'customer_code': c['code'],
                'customer_category': cat,
                'ledger': cust_ledger
            }
        )
        customer_objects.append(obj)
        if created: print(f"Created customer: {c['name']}")

    # 4. Create Receipts
    receipt_data = [
        {'date': date.today(), 'no': 'RCT001', 'amount': 50000.00, 'customer': customer_objects[0]},
        {'date': date.today() - timedelta(days=2), 'no': 'RCT002', 'amount': 75000.00, 'customer': customer_objects[1]},
    ]
    
    for r in receipt_data:
        # Create Unified Voucher first
        v_obj, created = Voucher.objects.get_or_create(
            voucher_number=r['no'],
            tenant_id=tenant_id,
            type='receipt',
            defaults={
                'date': r['date'],
                'party': r['customer'].customer_name,
                'account': 'HDFC Bank',
                'total': Decimal(str(r['amount']))
            }
        )
        
        # Create Receipt Voucher
        receipt, created = VoucherReceiptSingle.objects.get_or_create(
            voucher_number=r['no'],
            tenant_id=tenant_id,
            defaults={
                'date': r['date'],
                'receive_in': ledger_objects['HDFC Bank'],
                'receive_from': r['customer'].ledger,
                'total_receipt': Decimal(str(r['amount'])),
                'source': 'manual'
            }
        )
        if created: print(f"Created receipt: {r['no']}")

if __name__ == '__main__':
    seed()
