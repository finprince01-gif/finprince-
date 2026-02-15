"""
Comprehensive Test Script for Vendor Creation
Tests all vendor creation endpoints and data persistence
"""

import requests
import json
from datetime import datetime, date
import sys

# Configuration
BASE_URL = "http://localhost:8000"
API_BASE = f"{BASE_URL}/api"

# Test credentials (update these with your actual credentials)
TEST_USER = {
    "username": "testuser",
    "password": "testpassword"
}

class VendorCreationTester:
    def __init__(self):
        self.token = None
        self.tenant_id = None
        self.created_vendor_id = None
        self.test_results = []
        
    def log_test(self, test_name, passed, message=""):
        """Log test result"""
        status = "✅ PASS" if passed else "❌ FAIL"
        result = f"{status} - {test_name}"
        if message:
            result += f": {message}"
        print(result)
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "message": message
        })
        
    def login(self):
        """Login and get authentication token"""
        print("\n" + "="*60)
        print("STEP 1: Authentication")
        print("="*60)
        
        try:
            response = requests.post(
                f"{API_BASE}/auth/login/",
                json=TEST_USER
            )
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get('token') or data.get('access')
                self.tenant_id = data.get('tenant_id')
                self.log_test("Login", True, f"Token obtained, Tenant ID: {self.tenant_id}")
                return True
            else:
                self.log_test("Login", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("Login", False, str(e))
            return False
    
    def get_headers(self):
        """Get authorization headers"""
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_vendor_basic_detail_creation(self):
        """Test 1: Create Vendor Basic Detail"""
        print("\n" + "="*60)
        print("STEP 2: Create Vendor Basic Detail")
        print("="*60)
        
        vendor_data = {
            "vendor_name": f"Test Vendor {datetime.now().strftime('%Y%m%d%H%M%S')}",
            "pan_no": "ABCDE1234F",
            "contact_person": "John Doe",
            "email": f"test.vendor.{datetime.now().strftime('%Y%m%d%H%M%S')}@example.com",
            "contact_no": "+91 9876543210",
            "vendor_category": "Raw Materials",
            "is_also_customer": False,
            "tcs_applicable": False
        }
        
        try:
            response = requests.post(
                f"{API_BASE}/vendors/basic-details/",
                headers=self.get_headers(),
                json=vendor_data
            )
            
            print(f"Request URL: {API_BASE}/vendors/basic-details/")
            print(f"Request Data: {json.dumps(vendor_data, indent=2)}")
            print(f"Response Status: {response.status_code}")
            print(f"Response Data: {json.dumps(response.json(), indent=2)}")
            
            if response.status_code == 201:
                data = response.json()
                self.created_vendor_id = data.get('id')
                vendor_code = data.get('vendor_code')
                self.log_test("Vendor Basic Detail Creation", True, 
                             f"ID: {self.created_vendor_id}, Code: {vendor_code}")
                return data
            else:
                self.log_test("Vendor Basic Detail Creation", False, 
                             f"Status: {response.status_code}, Response: {response.text}")
                return None
        except Exception as e:
            self.log_test("Vendor Basic Detail Creation", False, str(e))
            return None
    
    def test_vendor_gst_details_creation(self, vendor_basic_detail_id):
        """Test 2: Create Vendor GST Details"""
        print("\n" + "="*60)
        print("STEP 3: Create Vendor GST Details")
        print("="*60)
        
        gst_data = {
            "vendor_basic_detail": vendor_basic_detail_id,
            "gstin": "29ABCDE1234F1Z5",
            "gst_registration_type": "regular",
            "legal_name": "Test Vendor Legal Name",
            "trade_name": "Test Vendor Trade Name",
            "reference_name": "Main Branch",
            "branch_address": "123 Test Street, Test City, Test State - 560001",
            "branch_contact_person": "Jane Smith",
            "branch_email": "branch@testvendor.com",
            "branch_contact_no": "+91 9876543211"
        }
        
        try:
            response = requests.post(
                f"{API_BASE}/vendors/gst-details/",
                headers=self.get_headers(),
                json=gst_data
            )
            
            print(f"Request URL: {API_BASE}/vendors/gst-details/")
            print(f"Request Data: {json.dumps(gst_data, indent=2)}")
            print(f"Response Status: {response.status_code}")
            print(f"Response Data: {json.dumps(response.json(), indent=2)}")
            
            if response.status_code == 201:
                data = response.json()
                self.log_test("Vendor GST Details Creation", True, 
                             f"GST ID: {data.get('id')}, GSTIN: {data.get('gstin')}")
                return data
            else:
                self.log_test("Vendor GST Details Creation", False, 
                             f"Status: {response.status_code}, Response: {response.text}")
                return None
        except Exception as e:
            self.log_test("Vendor GST Details Creation", False, str(e))
            return None
    
    def test_vendor_banking_creation(self, vendor_basic_detail_id):
        """Test 3: Create Vendor Banking Details"""
        print("\n" + "="*60)
        print("STEP 4: Create Vendor Banking Details")
        print("="*60)
        
        banking_data = {
            "vendor_basic_detail": vendor_basic_detail_id,
            "bank_account_no": "1234567890123456",
            "bank_name": "HDFC Bank",
            "ifsc_code": "HDFC0001234",
            "branch_name": "Test Branch",
            "swift_code": "HDFCINBB",
            "vendor_branch": "Main Branch",
            "account_type": "current"
        }
        
        try:
            response = requests.post(
                f"{API_BASE}/vendors/banking/",
                headers=self.get_headers(),
                json=banking_data
            )
            
            print(f"Request URL: {API_BASE}/vendors/banking/")
            print(f"Request Data: {json.dumps(banking_data, indent=2)}")
            print(f"Response Status: {response.status_code}")
            print(f"Response Data: {json.dumps(response.json(), indent=2)}")
            
            if response.status_code == 201:
                data = response.json()
                self.log_test("Vendor Banking Details Creation", True, 
                             f"Banking ID: {data.get('id')}, Account: {data.get('bank_account_no')}")
                return data
            else:
                self.log_test("Vendor Banking Details Creation", False, 
                             f"Status: {response.status_code}, Response: {response.text}")
                return None
        except Exception as e:
            self.log_test("Vendor Banking Details Creation", False, str(e))
            return None
    
    def test_vendor_tds_creation(self, vendor_basic_detail_id):
        """Test 4: Create Vendor TDS Details"""
        print("\n" + "="*60)
        print("STEP 5: Create Vendor TDS Details")
        print("="*60)
        
        tds_data = {
            "vendor_basic_detail": vendor_basic_detail_id,
            "pan_number": "ABCDE1234F",
            "tan_number": "ABCD12345E",
            "tds_section": "194C",
            "tds_rate": 2.00,
            "tds_section_applicable": "Work Contract",
            "enable_automatic_tds_posting": True,
            "msme_udyam_no": "UDYAM-KA-12-1234567",
            "fssai_license_no": "12345678901234",
            "import_export_code": "IEC1234567890",
            "eou_status": "Not Applicable",
            "cin_number": "U12345KA2020PTC123456"
        }
        
        try:
            response = requests.post(
                f"{API_BASE}/vendors/tds/",
                headers=self.get_headers(),
                json=tds_data
            )
            
            print(f"Request URL: {API_BASE}/vendors/tds/")
            print(f"Request Data: {json.dumps(tds_data, indent=2)}")
            print(f"Response Status: {response.status_code}")
            print(f"Response Data: {json.dumps(response.json(), indent=2)}")
            
            if response.status_code == 201:
                data = response.json()
                self.log_test("Vendor TDS Details Creation", True, 
                             f"TDS ID: {data.get('id')}, Section: {data.get('tds_section')}")
                return data
            else:
                self.log_test("Vendor TDS Details Creation", False, 
                             f"Status: {response.status_code}, Response: {response.text}")
                return None
        except Exception as e:
            self.log_test("Vendor TDS Details Creation", False, str(e))
            return None
    
    def test_vendor_product_creation(self, vendor_basic_detail_id):
        """Test 5: Create Vendor Product/Service"""
        print("\n" + "="*60)
        print("STEP 6: Create Vendor Product/Service")
        print("="*60)
        
        product_data = {
            "vendor_basic_detail": vendor_basic_detail_id,
            "hsn_sac_code": "1234",
            "item_code": "ITEM001",
            "item_name": "Test Product",
            "supplier_item_code": "SUP001",
            "supplier_item_name": "Supplier Test Product"
        }
        
        try:
            response = requests.post(
                f"{API_BASE}/vendors/products/",
                headers=self.get_headers(),
                json=product_data
            )
            
            print(f"Request URL: {API_BASE}/vendors/products/")
            print(f"Request Data: {json.dumps(product_data, indent=2)}")
            print(f"Response Status: {response.status_code}")
            print(f"Response Data: {json.dumps(response.json(), indent=2)}")
            
            if response.status_code == 201:
                data = response.json()
                self.log_test("Vendor Product Creation", True, 
                             f"Product ID: {data.get('id')}, Item: {data.get('item_name')}")
                return data
            else:
                self.log_test("Vendor Product Creation", False, 
                             f"Status: {response.status_code}, Response: {response.text}")
                return None
        except Exception as e:
            self.log_test("Vendor Product Creation", False, str(e))
            return None
    
    def test_vendor_terms_creation(self, vendor_basic_detail_id):
        """Test 6: Create Vendor Terms & Conditions"""
        print("\n" + "="*60)
        print("STEP 7: Create Vendor Terms & Conditions")
        print("="*60)
        
        terms_data = {
            "vendor_basic_detail": vendor_basic_detail_id,
            "credit_limit": 100000.00,
            "credit_period": "30 days",
            "credit_terms": "Payment within 30 days of invoice date",
            "penalty_terms": "2% penalty on late payments",
            "delivery_terms": "FOB Destination, 7-10 business days",
            "warranty_guarantee_details": "1 year warranty on all products",
            "force_majeure": "Standard force majeure clauses apply",
            "dispute_redressal_terms": "Disputes to be resolved through arbitration"
        }
        
        try:
            response = requests.post(
                f"{API_BASE}/vendors/terms/",
                headers=self.get_headers(),
                json=terms_data
            )
            
            print(f"Request URL: {API_BASE}/vendors/terms/")
            print(f"Request Data: {json.dumps(terms_data, indent=2)}")
            print(f"Response Status: {response.status_code}")
            print(f"Response Data: {json.dumps(response.json(), indent=2)}")
            
            if response.status_code == 201:
                data = response.json()
                self.log_test("Vendor Terms Creation", True, 
                             f"Terms ID: {data.get('id')}, Credit Limit: {data.get('credit_limit')}")
                return data
            else:
                self.log_test("Vendor Terms Creation", False, 
                             f"Status: {response.status_code}, Response: {response.text}")
                return None
        except Exception as e:
            self.log_test("Vendor Terms Creation", False, str(e))
            return None
    
    def test_vendor_retrieval(self, vendor_id):
        """Test 7: Retrieve Created Vendor"""
        print("\n" + "="*60)
        print("STEP 8: Retrieve Created Vendor")
        print("="*60)
        
        try:
            response = requests.get(
                f"{API_BASE}/vendors/basic-details/{vendor_id}/",
                headers=self.get_headers()
            )
            
            print(f"Request URL: {API_BASE}/vendors/basic-details/{vendor_id}/")
            print(f"Response Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"Response Data: {json.dumps(data, indent=2)}")
                self.log_test("Vendor Retrieval", True, 
                             f"Retrieved vendor: {data.get('vendor_name')}")
                return data
            else:
                self.log_test("Vendor Retrieval", False, 
                             f"Status: {response.status_code}, Response: {response.text}")
                return None
        except Exception as e:
            self.log_test("Vendor Retrieval", False, str(e))
            return None
    
    def test_vendor_list(self):
        """Test 8: List All Vendors"""
        print("\n" + "="*60)
        print("STEP 9: List All Vendors")
        print("="*60)
        
        try:
            response = requests.get(
                f"{API_BASE}/vendors/basic-details/",
                headers=self.get_headers()
            )
            
            print(f"Request URL: {API_BASE}/vendors/basic-details/")
            print(f"Response Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                vendor_count = len(data) if isinstance(data, list) else data.get('count', 0)
                print(f"Total vendors: {vendor_count}")
                self.log_test("Vendor List", True, f"Found {vendor_count} vendors")
                return data
            else:
                self.log_test("Vendor List", False, 
                             f"Status: {response.status_code}, Response: {response.text}")
                return None
        except Exception as e:
            self.log_test("Vendor List", False, str(e))
            return None
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("TEST SUMMARY")
        print("="*60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result['passed'])
        failed_tests = total_tests - passed_tests
        
        print(f"\nTotal Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%")
        
        if failed_tests > 0:
            print("\n❌ Failed Tests:")
            for result in self.test_results:
                if not result['passed']:
                    print(f"  - {result['test']}: {result['message']}")
        
        print("\n" + "="*60)
        
        return failed_tests == 0
    
    def run_all_tests(self):
        """Run all vendor creation tests"""
        print("\n" + "="*60)
        print("VENDOR CREATION TEST SUITE")
        print("="*60)
        print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Step 1: Login
        if not self.login():
            print("\n❌ Authentication failed. Cannot proceed with tests.")
            return False
        
        # Step 2: Create vendor basic detail
        vendor_basic = self.test_vendor_basic_detail_creation()
        if not vendor_basic:
            print("\n❌ Vendor basic detail creation failed. Cannot proceed with related tests.")
            self.print_summary()
            return False
        
        vendor_id = vendor_basic.get('id')
        
        # Step 3-7: Create related vendor details
        self.test_vendor_gst_details_creation(vendor_id)
        self.test_vendor_banking_creation(vendor_id)
        self.test_vendor_tds_creation(vendor_id)
        self.test_vendor_product_creation(vendor_id)
        self.test_vendor_terms_creation(vendor_id)
        
        # Step 8-9: Retrieve and list vendors
        self.test_vendor_retrieval(vendor_id)
        self.test_vendor_list()
        
        # Print summary
        return self.print_summary()


if __name__ == "__main__":
    print("\n" + "="*60)
    print("VENDOR CREATION COMPREHENSIVE TEST")
    print("="*60)
    print("\nThis script will test the complete vendor creation flow.")
    print("Make sure the backend server is running at:", BASE_URL)
    print("\nUpdate TEST_USER credentials in the script before running.")
    
    input("\nPress Enter to continue or Ctrl+C to cancel...")
    
    tester = VendorCreationTester()
    success = tester.run_all_tests()
    
    sys.exit(0 if success else 1)
