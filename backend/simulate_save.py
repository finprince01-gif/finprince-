
import os
import django
import sys

# Set up Django environment
sys.path.append(r'c:\108\muthu\AI-accounting-0.03\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vendors.vendorbanking_database import create_vendor_banking
from vendors.models import VendorMasterBasicDetail

def simulate_frontend_save():
    try:
        # 1. Get a vendor
        vendor = VendorMasterBasicDetail.objects.first()
        if not vendor:
            print("No vendor found to link to")
            return
        
        print(f"Linking to vendor: {vendor.vendor_name} (ID: {vendor.id})")
        
        # 2. Mimic the payload from VendorPortal.tsx
        # bankPayload = {
        #     vendor_basic_detail: newId,
        #     bank_account_no: bank.accountNumber,
        #     bank_name: bank.bankName || '',
        #     ifsc_code: bank.ifscCode || '',
        #     branch_name: bank.branchName || '',
        #     swift_code: bank.swiftCode || '',
        #     vendor_branch: Array.isArray(bank.vendorBranch) ? bank.vendorBranch.join(',') : (bank.vendorBranch || ''),
        #     account_type: bank.accountType ? bank.accountType.toLowerCase().replace(' ', '_') : 'savings',
        #     is_active: true
        # };
        
        data = {
            'tenant_id': 'ef152566-f471-4854-aa36-000000000000', # Sample tenant
            'vendor_basic_detail': vendor.id,
            'bank_account_no': f'REAL_TEST_{vendor.id}',
            'bank_name': 'Real Test Bank',
            'ifsc_code': 'SBIN0001234',
            'branch_name': 'Test Branch',
            'swift_code': '',
            'vendor_branch': 'Main,Branch1',
            'account_type': 'savings',
            'is_active': True,
            'created_by': 'admin_test',
            'updated_by': 'admin_test'
        }
        
        print("Calling create_vendor_banking...")
        result = create_vendor_banking(data)
        print(f"Result: {result}")
        
    except Exception as e:
        print(f"Error during simulation: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    simulate_frontend_save()
