"""
Quick Vendor Creation Test
Simple script to test vendor creation with a single vendor
"""

import requests
import json
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:8000"
API_BASE = f"{BASE_URL}/api"

print("="*70)
print("QUICK VENDOR CREATION TEST")
print("="*70)
print()

# Get credentials from user
print("Please enter your credentials:")
username = input("Username: ").strip()
password = input("Password: ").strip()

if not username or not password:
    print("\n❌ Username and password are required!")
    exit(1)

print("\n" + "="*70)
print("Step 1: Authenticating...")
print("="*70)

# Login
try:
    response = requests.post(
        f"{API_BASE}/auth/login/",
        json={"username": username, "password": password}
    )
    
    if response.status_code != 200:
        print(f"❌ Login failed: {response.status_code}")
        print(f"Response: {response.text}")
        exit(1)
    
    data = response.json()
    token = data.get('access')
    tenant_id = data.get('tenant_id')
    
    print(f"✅ Login successful!")
    print(f"   Tenant ID: {tenant_id}")
    print(f"   Company: {data.get('company_name', 'N/A')}")
    
except Exception as e:
    print(f"❌ Error during login: {e}")
    exit(1)

# Prepare headers
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

# Create vendor
print("\n" + "="*70)
print("Step 2: Creating Vendor Basic Detail...")
print("="*70)

timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
vendor_data = {
    "vendor_name": f"Test Vendor {timestamp}",
    "pan_no": f"TEST{timestamp[-6:]}",
    "contact_person": "Test Contact Person",
    "email": f"vendor.{timestamp}@test.com",
    "contact_no": "+91 9876543210",
    "vendor_category": "Test Category",
    "is_also_customer": False,
    "tcs_applicable": False
}

print(f"\nVendor Data:")
print(json.dumps(vendor_data, indent=2))

try:
    response = requests.post(
        f"{API_BASE}/vendors/basic-details/",
        headers=headers,
        json=vendor_data
    )
    
    print(f"\nResponse Status: {response.status_code}")
    
    if response.status_code == 201:
        vendor = response.json()
        vendor_id = vendor.get('id')
        vendor_code = vendor.get('vendor_code')
        
        print(f"\n✅ Vendor created successfully!")
        print(f"   Vendor ID: {vendor_id}")
        print(f"   Vendor Code: {vendor_code}")
        print(f"   Vendor Name: {vendor.get('vendor_name')}")
        
        # Add GST Details
        print("\n" + "="*70)
        print("Step 3: Adding GST Details...")
        print("="*70)
        
        gst_data = {
            "vendor_basic_detail": vendor_id,
            "gstin": f"29TEST{timestamp[-9:]}1Z5",
            "gst_registration_type": "regular",
            "legal_name": f"Test Vendor Legal {timestamp}",
            "trade_name": f"Test Vendor Trade {timestamp}",
            "reference_name": "Main Branch",
            "branch_address": "Test Address, Test City, Test State - 560001",
            "branch_contact_person": "Branch Contact",
            "branch_email": f"branch.{timestamp}@test.com",
            "branch_contact_no": "+91 9876543211"
        }
        
        response = requests.post(
            f"{API_BASE}/vendors/gst-details/",
            headers=headers,
            json=gst_data
        )
        
        if response.status_code == 201:
            gst = response.json()
            print(f"✅ GST Details added!")
            print(f"   GSTIN: {gst.get('gstin')}")
        else:
            print(f"⚠️  GST Details failed: {response.status_code}")
            print(f"   Response: {response.text}")
        
        # Add Banking Details
        print("\n" + "="*70)
        print("Step 4: Adding Banking Details...")
        print("="*70)
        
        banking_data = {
            "vendor_basic_detail": vendor_id,
            "bank_account_no": f"1234567890{timestamp[-6:]}",
            "bank_name": "Test Bank",
            "ifsc_code": "TEST0001234",
            "branch_name": "Test Branch",
            "account_type": "current"
        }
        
        response = requests.post(
            f"{API_BASE}/vendors/banking/",
            headers=headers,
            json=banking_data
        )
        
        if response.status_code == 201:
            banking = response.json()
            print(f"✅ Banking Details added!")
            print(f"   Account No: {banking.get('bank_account_no')}")
        else:
            print(f"⚠️  Banking Details failed: {response.status_code}")
            print(f"   Response: {response.text}")
        
        # Verify vendor
        print("\n" + "="*70)
        print("Step 5: Verifying Vendor...")
        print("="*70)
        
        response = requests.get(
            f"{API_BASE}/vendors/basic-details/{vendor_id}/",
            headers=headers
        )
        
        if response.status_code == 200:
            vendor_details = response.json()
            print(f"✅ Vendor verified successfully!")
            print(f"\nComplete Vendor Details:")
            print(json.dumps(vendor_details, indent=2))
        else:
            print(f"⚠️  Verification failed: {response.status_code}")
        
        print("\n" + "="*70)
        print("TEST COMPLETED SUCCESSFULLY! ✅")
        print("="*70)
        print(f"\nVendor ID: {vendor_id}")
        print(f"Vendor Code: {vendor_code}")
        print(f"Vendor Name: {vendor.get('vendor_name')}")
        print("\nYou can now check this vendor in the frontend application.")
        
    else:
        print(f"\n❌ Vendor creation failed!")
        print(f"Response: {response.text}")
        exit(1)
        
except Exception as e:
    print(f"\n❌ Error during vendor creation: {e}")
    import traceback
    traceback.print_exc()
    exit(1)
