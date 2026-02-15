
import requests
import json

BASE_URL = "http://localhost:8000"
API_BASE = f"{BASE_URL}/api"

def test_banking_save():
    # 1. Login
    login_resp = requests.post(f"{API_BASE}/auth/login/", json={"username": "admin", "password": "admin123"})
    if login_resp.status_code != 200:
        print(f"Login failed: {login_resp.text}")
        return
    
    token = login_resp.json()['access']
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # 2. Get a vendor ID (let's use the one from previous turn if it exists or find one)
    vendors_resp = requests.get(f"{API_BASE}/vendors/basic-details/", headers=headers)
    vendors = vendors_resp.json()
    if not vendors:
        print("No vendors found")
        return
    
    vendor_id = vendors[0]['id']
    print(f"Testing for vendor ID: {vendor_id}")
    
    # 3. Create a banking record
    banking_data = {
        "vendor_basic_detail": vendor_id,
        "bank_account_no": "TEST_ACCT_123",
        "bank_name": "Test Bank",
        "ifsc_code": "TEST0123456",
        "branch_name": "Test Branch",
        "swift_code": "TESTSWIFT",
        "vendor_branch": "Main",
        "account_type": "savings",
        "is_active": True
    }
    
    print("Creating banking record...")
    create_resp = requests.post(f"{API_BASE}/vendors/banking-details/", headers=headers, json=banking_data)
    print(f"Create status: {create_resp.status_code}")
    print(f"Create response: {create_resp.text}")
    
    if create_resp.status_code == 201:
        banking_id = create_resp.json()['id']
        print(f"Created banking record ID: {banking_id}")
        
        # 4. Patch the same record
        print("\nPatching banking record...")
        banking_data["bank_name"] = "Updated Test Bank"
        patch_resp = requests.patch(f"{API_BASE}/vendors/banking-details/{banking_id}/", headers=headers, json=banking_data)
        print(f"Patch status: {patch_resp.status_code}")
        print(f"Patch response: {patch_resp.text}")

if __name__ == "__main__":
    test_banking_save()
