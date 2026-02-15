"""
Automated Vendor Creation Test (No User Input Required)
This script uses default test credentials - update them before running
"""

import requests
import json
from datetime import datetime
import sys

# ⚠️ UPDATE THESE CREDENTIALS BEFORE RUNNING ⚠️
DEFAULT_USERNAME = "admin"  # Change this to your username
DEFAULT_PASSWORD = "admin123"  # Change this to your password

# Configuration
BASE_URL = "http://localhost:8000"
API_BASE = f"{BASE_URL}/api"

class AutomatedVendorTest:
    def __init__(self, username, password):
        self.username = username
        self.password = password
        self.token = None
        self.tenant_id = None
        self.vendor_id = None
        self.tests_passed = 0
        self.tests_failed = 0
        
    def print_header(self, text):
        print("\n" + "="*70)
        print(text)
        print("="*70)
        
    def print_success(self, message):
        print(f"✅ {message}")
        self.tests_passed += 1
        
    def print_error(self, message):
        print(f"❌ {message}")
        self.tests_failed += 1
        
    def print_info(self, message):
        print(f"ℹ️  {message}")
        
    def authenticate(self):
        """Step 1: Authenticate"""
        self.print_header("STEP 1: Authentication")
        
        try:
            response = requests.post(
                f"{API_BASE}/auth/login/",
                json={"username": self.username, "password": self.password},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get('access')
                self.tenant_id = data.get('tenant_id')
                
                self.print_success(f"Authentication successful")
                self.print_info(f"Tenant ID: {self.tenant_id}")
                self.print_info(f"Company: {data.get('company_name', 'N/A')}")
                return True
            else:
                self.print_error(f"Authentication failed: {response.status_code}")
                self.print_info(f"Response: {response.text}")
                return False
                
        except requests.exceptions.ConnectionError:
            self.print_error("Cannot connect to backend server")
            self.print_info("Make sure the backend is running on http://localhost:8000")
            return False
        except Exception as e:
            self.print_error(f"Authentication error: {e}")
            return False
    
    def get_headers(self):
        """Get authorization headers"""
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def create_vendor_basic(self):
        """Step 2: Create vendor basic details"""
        self.print_header("STEP 2: Create Vendor Basic Details")
        
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        vendor_data = {
            "vendor_name": f"Automated Test Vendor {timestamp}",
            "pan_no": f"AUTO{timestamp[-6:]}",
            "contact_person": "Automated Test Contact",
            "email": f"auto.vendor.{timestamp}@test.com",
            "contact_no": "+91 9876543210",
            "vendor_category": "Automated Test Category",
            "is_also_customer": False,
            "tcs_applicable": False
        }
        
        self.print_info("Creating vendor with data:")
        print(json.dumps(vendor_data, indent=2))
        
        try:
            response = requests.post(
                f"{API_BASE}/vendors/basic-details/",
                headers=self.get_headers(),
                json=vendor_data,
                timeout=10
            )
            
            if response.status_code == 201:
                vendor = response.json()
                self.vendor_id = vendor.get('id')
                vendor_code = vendor.get('vendor_code')
                
                self.print_success("Vendor basic details created")
                self.print_info(f"Vendor ID: {self.vendor_id}")
                self.print_info(f"Vendor Code: {vendor_code}")
                self.print_info(f"Vendor Name: {vendor.get('vendor_name')}")
                return True
            else:
                self.print_error(f"Vendor creation failed: {response.status_code}")
                self.print_info(f"Response: {response.text}")
                return False
                
        except Exception as e:
            self.print_error(f"Vendor creation error: {e}")
            return False
    
    def create_gst_details(self):
        """Step 3: Create GST details"""
        self.print_header("STEP 3: Create GST Details")
        
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        gst_data = {
            "vendor_basic_detail": self.vendor_id,
            "gstin": f"29AUTO{timestamp[-9:]}1Z5",
            "gst_registration_type": "regular",
            "legal_name": f"Automated Test Vendor Legal {timestamp}",
            "trade_name": f"Automated Test Vendor Trade {timestamp}",
            "reference_name": "Automated Main Branch",
            "branch_address": "Automated Test Address, Test City, Test State - 560001",
            "branch_contact_person": "Automated Branch Contact",
            "branch_email": f"auto.branch.{timestamp}@test.com",
            "branch_contact_no": "+91 9876543211"
        }
        
        try:
            response = requests.post(
                f"{API_BASE}/vendors/gst-details/",
                headers=self.get_headers(),
                json=gst_data,
                timeout=10
            )
            
            if response.status_code == 201:
                gst = response.json()
                self.print_success("GST details created")
                self.print_info(f"GSTIN: {gst.get('gstin')}")
                return True
            else:
                self.print_error(f"GST creation failed: {response.status_code}")
                self.print_info(f"Response: {response.text}")
                return False
                
        except Exception as e:
            self.print_error(f"GST creation error: {e}")
            return False
    
    def create_banking_details(self):
        """Step 4: Create banking details"""
        self.print_header("STEP 4: Create Banking Details")
        
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        banking_data = {
            "vendor_basic_detail": self.vendor_id,
            "bank_account_no": f"AUTO1234{timestamp[-10:]}",
            "bank_name": "Automated Test Bank",
            "ifsc_code": "AUTO0001234",
            "branch_name": "Automated Test Branch",
            "account_type": "current"
        }
        
        try:
            response = requests.post(
                f"{API_BASE}/vendors/banking/",
                headers=self.get_headers(),
                json=banking_data,
                timeout=10
            )
            
            if response.status_code == 201:
                banking = response.json()
                self.print_success("Banking details created")
                self.print_info(f"Account No: {banking.get('bank_account_no')}")
                return True
            else:
                self.print_error(f"Banking creation failed: {response.status_code}")
                self.print_info(f"Response: {response.text}")
                return False
                
        except Exception as e:
            self.print_error(f"Banking creation error: {e}")
            return False
    
    def verify_vendor(self):
        """Step 5: Verify vendor"""
        self.print_header("STEP 5: Verify Vendor")
        
        try:
            response = requests.get(
                f"{API_BASE}/vendors/basic-details/{self.vendor_id}/",
                headers=self.get_headers(),
                timeout=10
            )
            
            if response.status_code == 200:
                vendor = response.json()
                self.print_success("Vendor retrieved successfully")
                self.print_info(f"Vendor Name: {vendor.get('vendor_name')}")
                self.print_info(f"Vendor Code: {vendor.get('vendor_code')}")
                self.print_info(f"Email: {vendor.get('email')}")
                return True
            else:
                self.print_error(f"Vendor retrieval failed: {response.status_code}")
                return False
                
        except Exception as e:
            self.print_error(f"Vendor retrieval error: {e}")
            return False
    
    def list_vendors(self):
        """Step 6: List all vendors"""
        self.print_header("STEP 6: List All Vendors")
        
        try:
            response = requests.get(
                f"{API_BASE}/vendors/basic-details/",
                headers=self.get_headers(),
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                vendor_count = len(data) if isinstance(data, list) else data.get('count', 0)
                self.print_success(f"Vendor list retrieved")
                self.print_info(f"Total vendors: {vendor_count}")
                return True
            else:
                self.print_error(f"Vendor list retrieval failed: {response.status_code}")
                return False
                
        except Exception as e:
            self.print_error(f"Vendor list retrieval error: {e}")
            return False
    
    def print_summary(self):
        """Print test summary"""
        self.print_header("TEST SUMMARY")
        
        total_tests = self.tests_passed + self.tests_failed
        success_rate = (self.tests_passed / total_tests * 100) if total_tests > 0 else 0
        
        print(f"\nTotal Tests: {total_tests}")
        print(f"Passed: {self.tests_passed} ✅")
        print(f"Failed: {self.tests_failed} ❌")
        print(f"Success Rate: {success_rate:.1f}%")
        
        if self.vendor_id:
            print(f"\nCreated Vendor ID: {self.vendor_id}")
            print("You can view this vendor in the frontend application.")
        
        print("\n" + "="*70)
        
        return self.tests_failed == 0
    
    def run(self):
        """Run all tests"""
        self.print_header("AUTOMATED VENDOR CREATION TEST")
        print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Backend URL: {BASE_URL}")
        print(f"Username: {self.username}")
        
        # Run tests in sequence
        if not self.authenticate():
            self.print_summary()
            return False
        
        if not self.create_vendor_basic():
            self.print_summary()
            return False
        
        # Continue with other tests even if some fail
        self.create_gst_details()
        self.create_banking_details()
        self.verify_vendor()
        self.list_vendors()
        
        # Print summary
        return self.print_summary()


if __name__ == "__main__":
    print("\n" + "="*70)
    print("AUTOMATED VENDOR CREATION TEST")
    print("="*70)
    print("\n⚠️  IMPORTANT: Update DEFAULT_USERNAME and DEFAULT_PASSWORD")
    print("in this script before running!\n")
    
    if DEFAULT_USERNAME == "admin" and DEFAULT_PASSWORD == "admin123":
        print("⚠️  WARNING: Using default credentials!")
        print("These may not work. Please update the script with your credentials.\n")
    
    # Run the test
    tester = AutomatedVendorTest(DEFAULT_USERNAME, DEFAULT_PASSWORD)
    success = tester.run()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)
