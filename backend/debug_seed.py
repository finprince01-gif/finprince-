import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from accounting.models import MasterLedger
from customerportal.database import CustomerMasterCategory, CustomerMasterCustomerBasicDetails
from accounting.models import Voucher, VoucherReceiptSingle
from decimal import Decimal
from datetime import date

tenant_id = '88fe4389-58a9-4244-6ecf-460c-8aef-c5a77edb5968'

def test():
    print(f"Testing tenant_id length: {len(tenant_id)}")
    try:
        obj, created = MasterLedger.objects.get_or_create(
            name='Test Cash Account', 
            tenant_id=tenant_id, 
            defaults={'group': 'Cash-in-hand', 'category': 'Assets'}
        )
        print("MasterLedger Save OK")
    except Exception as e:
        print(f"MasterLedger Save FAILED: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    test()
