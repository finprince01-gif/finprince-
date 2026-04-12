import os, sys
sys.path.insert(0, r'C:\108\AI-accounting-0.03\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from accounting.models import MasterLedger
import uuid

fake_tenant = str(uuid.uuid4())

# Test 1: category=None (should fail if NOT NULL)
try:
    ldr = MasterLedger.objects.create(
        tenant_id=fake_tenant, name='TEST_NULL_CAT',
        category=None, group='Test', code='TESTCODE997'
    )
    print('TEST1: INSERT category=None SUCCEEDED id=', ldr.id)
    ldr.delete()
except Exception as e:
    print('TEST1: INSERT category=None FAILED:', type(e).__name__, str(e)[:200])

# Test 2: category='Asset' (should work)
try:
    ldr = MasterLedger.objects.create(
        tenant_id=fake_tenant, name='TEST_ASSET_CAT',
        category='Asset', group='Cash and cash equivalents', code='TESTCODE998'
    )
    print('TEST2: INSERT category=Asset SUCCEEDED id=', ldr.id)
    ldr.delete()
except Exception as e:
    print('TEST2: INSERT category=Asset FAILED:', type(e).__name__, str(e)[:200])

# Test 3: Full flow simulation
from accounting.utils import generate_ledger_code
test_data = {
    'name': 'MyCashLedger',
    'category': 'Asset',
    'group': 'Cash and cash equivalents',
    'sub_group_1': 'Cash',
    'sub_group_2': None,
    'sub_group_3': None,
    'ledger_type': None,
    'parent_ledger_id': None,
    'additional_data': None,
}
try:
    code = generate_ledger_code(test_data, fake_tenant)
    print('TEST3: Code generated:', code)
    ledger_data = {**test_data, 'code': code}
    ldr = MasterLedger.objects.create(tenant_id=fake_tenant, **ledger_data)
    print('TEST3: Ledger saved id=', ldr.id, 'code=', ldr.code)
    ldr.delete()
except Exception as e:
    import traceback
    print('TEST3: FULL FLOW FAILED:', type(e).__name__, str(e)[:300])
    traceback.print_exc()
