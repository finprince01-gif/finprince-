# Vendor Creation Test Guide

## Overview
This guide provides instructions for testing the vendor creation functionality in the AI Accounting application.

## Prerequisites
1. Backend server running on `http://localhost:8000`
2. Frontend server running on `http://localhost:3000`
3. Valid user credentials for authentication
4. Database properly configured and migrated

## Test Methods

### Method 1: Automated Testing (Recommended)

#### Using Python Test Script

1. **Update Test Credentials**
   - Open `test_vendor_creation.py`
   - Update the `TEST_USER` dictionary with your credentials:
     ```python
     TEST_USER = {
         "username": "your_username",
         "password": "your_password"
     }
     ```

2. **Run the Test Script**
   ```bash
   python test_vendor_creation.py
   ```

3. **Review Results**
   - The script will test all vendor creation endpoints
   - Check the console output for test results
   - All tests should pass (✅ PASS)

#### What the Script Tests:
- ✅ User authentication
- ✅ Vendor basic detail creation
- ✅ Vendor GST details creation
- ✅ Vendor banking details creation
- ✅ Vendor TDS details creation
- ✅ Vendor product/service creation
- ✅ Vendor terms & conditions creation
- ✅ Vendor retrieval
- ✅ Vendor listing

### Method 2: Manual Testing via Frontend

#### Step 1: Navigate to Vendor Portal
1. Open browser and go to `http://localhost:3000`
2. Login with your credentials
3. Navigate to **Vendor Portal** from the main menu

#### Step 2: Fill Basic Details
1. Click "Create New Vendor" or similar button
2. Fill in the following fields:
   - **Vendor Name**: Test Vendor Company
   - **PAN No**: ABCDE1234F
   - **Contact Person**: John Doe
   - **Email**: test@vendor.com
   - **Contact No**: +91 9876543210
   - **Vendor Category**: Select from dropdown
   - **Is Also Customer**: No
   - **TCS Applicable**: No

#### Step 3: Add GST Details
1. Click "Add GST Details" or navigate to GST tab
2. Fill in:
   - **GSTIN**: 29ABCDE1234F1Z5
   - **GST Registration Type**: Regular
   - **Legal Name**: Test Vendor Legal Name
   - **Trade Name**: Test Vendor Trade Name
   - **Reference Name**: Main Branch
   - **Branch Address**: Complete address
   - **Branch Contact Person**: Jane Smith
   - **Branch Email**: branch@vendor.com
   - **Branch Contact No**: +91 9876543211

#### Step 4: Add Banking Details
1. Navigate to Banking tab
2. Fill in:
   - **Bank Account No**: 1234567890123456
   - **Bank Name**: HDFC Bank
   - **IFSC Code**: HDFC0001234
   - **Branch Name**: Test Branch
   - **SWIFT Code**: HDFCINBB (optional)
   - **Vendor Branch**: Main Branch
   - **Account Type**: Current

#### Step 5: Add TDS Details
1. Navigate to TDS tab
2. Fill in:
   - **PAN Number**: ABCDE1234F
   - **TAN Number**: ABCD12345E
   - **TDS Section**: 194C
   - **TDS Rate**: 2.00
   - **TDS Section Applicable**: Work Contract
   - **Enable Automatic TDS Posting**: Yes
   - **MSME Udyam No**: UDYAM-KA-12-1234567 (optional)
   - **FSSAI License No**: 12345678901234 (optional)
   - **Import Export Code**: IEC1234567890 (optional)
   - **CIN Number**: U12345KA2020PTC123456 (optional)

#### Step 6: Add Products/Services
1. Navigate to Products tab
2. Click "Add Product"
3. Fill in:
   - **HSN/SAC Code**: 1234
   - **Item Code**: ITEM001
   - **Item Name**: Test Product
   - **Supplier Item Code**: SUP001
   - **Supplier Item Name**: Supplier Test Product

#### Step 7: Add Terms & Conditions
1. Navigate to Terms tab
2. Fill in:
   - **Credit Limit**: 100000.00
   - **Credit Period**: 30 days
   - **Credit Terms**: Payment within 30 days of invoice date
   - **Penalty Terms**: 2% penalty on late payments
   - **Delivery Terms**: FOB Destination, 7-10 business days
   - **Warranty/Guarantee**: 1 year warranty on all products
   - **Force Majeure**: Standard force majeure clauses apply
   - **Dispute Redressal**: Disputes to be resolved through arbitration

#### Step 8: Submit and Verify
1. Click "Submit" or "Save" button
2. Check for success message
3. Verify vendor appears in vendor list
4. Click on the created vendor to view all details
5. Verify all entered data is correctly saved

### Method 3: Manual Testing via API (Postman/cURL)

#### 1. Authenticate
```bash
curl -X POST http://localhost:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username": "your_username", "password": "your_password"}'
```
Save the returned token.

#### 2. Create Vendor Basic Detail
```bash
curl -X POST http://localhost:8000/api/vendors/basic-details/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vendor_name": "Test Vendor",
    "pan_no": "ABCDE1234F",
    "contact_person": "John Doe",
    "email": "test@vendor.com",
    "contact_no": "+91 9876543210",
    "vendor_category": "Raw Materials"
  }'
```
Save the returned `id` as `VENDOR_ID`.

#### 3. Create GST Details
```bash
curl -X POST http://localhost:8000/api/vendors/gst-details/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vendor_basic_detail": VENDOR_ID,
    "gstin": "29ABCDE1234F1Z5",
    "gst_registration_type": "regular",
    "legal_name": "Test Vendor Legal Name",
    "trade_name": "Test Vendor Trade Name"
  }'
```

#### 4. Create Banking Details
```bash
curl -X POST http://localhost:8000/api/vendors/banking/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vendor_basic_detail": VENDOR_ID,
    "bank_account_no": "1234567890123456",
    "bank_name": "HDFC Bank",
    "ifsc_code": "HDFC0001234",
    "account_type": "current"
  }'
```

#### 5. Verify Data
```bash
curl -X GET http://localhost:8000/api/vendors/basic-details/VENDOR_ID/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Database Verification

### Check Data in Database

1. **Connect to MySQL**
   ```bash
   mysql -u root -p
   use Finpixe_AI_Accounting;
   ```

2. **Verify Basic Details**
   ```sql
   SELECT * FROM vendor_master_basicdetail ORDER BY created_at DESC LIMIT 1;
   ```

3. **Verify GST Details**
   ```sql
   SELECT * FROM vendor_master_gstdetails ORDER BY created_at DESC LIMIT 1;
   ```

4. **Verify Banking Details**
   ```sql
   SELECT * FROM vendor_master_banking ORDER BY created_at DESC LIMIT 1;
   ```

5. **Verify TDS Details**
   ```sql
   SELECT * FROM vendor_master_tds ORDER BY created_at DESC LIMIT 1;
   ```

6. **Verify Products**
   ```sql
   SELECT * FROM vendor_master_productservices ORDER BY created_at DESC LIMIT 1;
   ```

7. **Verify Terms**
   ```sql
   SELECT * FROM vendor_master_terms ORDER BY created_at DESC LIMIT 1;
   ```

## Expected Results

### Success Criteria
- ✅ All vendor data is saved to the database
- ✅ Vendor code is auto-generated (e.g., VEN00001)
- ✅ All related tables (GST, Banking, TDS, Products, Terms) have corresponding records
- ✅ Foreign key relationships are maintained correctly
- ✅ Timestamps (created_at, updated_at) are populated
- ✅ Tenant ID is correctly associated with all records
- ✅ Vendor appears in the vendor list
- ✅ All entered data can be retrieved and displayed correctly

### Common Issues and Solutions

#### Issue 1: Authentication Failed
- **Solution**: Verify credentials, check if user exists in database
- **Check**: `SELECT * FROM users WHERE username = 'your_username';`

#### Issue 2: Vendor Code Already Exists
- **Solution**: The system should auto-generate unique codes
- **Check**: Verify `generate_vendor_code` function in `vendorbasicdetail_database.py`

#### Issue 3: GSTIN Validation Error
- **Solution**: Ensure GSTIN is exactly 15 characters
- **Format**: 2 digits (state) + 10 chars (PAN) + 3 chars (entity/Z/checksum)

#### Issue 4: Foreign Key Constraint Failed
- **Solution**: Ensure vendor basic detail is created first before adding related details
- **Check**: Verify `vendor_basic_detail_id` exists

#### Issue 5: Duplicate Email/PAN
- **Solution**: Use unique email and PAN for each vendor
- **Check**: `SELECT * FROM vendor_master_basicdetail WHERE email = 'test@vendor.com';`

## Test Data Cleanup

After testing, you may want to clean up test data:

```sql
-- Get the vendor ID first
SET @vendor_id = (SELECT id FROM vendor_master_basicdetail 
                  WHERE vendor_name LIKE 'Test Vendor%' 
                  ORDER BY created_at DESC LIMIT 1);

-- Delete related records (cascading should handle this automatically)
DELETE FROM vendor_master_gstdetails WHERE vendor_basic_detail_id = @vendor_id;
DELETE FROM vendor_master_banking WHERE vendor_basic_detail_id = @vendor_id;
DELETE FROM vendor_master_tds WHERE vendor_basic_detail_id = @vendor_id;
DELETE FROM vendor_master_productservices WHERE vendor_basic_detail_id = @vendor_id;
DELETE FROM vendor_master_terms WHERE vendor_basic_detail_id = @vendor_id;

-- Delete basic detail (this should cascade delete all related records)
DELETE FROM vendor_master_basicdetail WHERE id = @vendor_id;
```

## Additional Notes

1. **Vendor Code Generation**: The system automatically generates vendor codes in the format `VEN00001`, `VEN00002`, etc.

2. **Tenant Isolation**: All vendor data is isolated by tenant_id to ensure multi-tenancy support.

3. **Soft Delete**: Vendors are soft-deleted by default (is_active = 0) rather than hard-deleted.

4. **Validation**: The backend performs validation on:
   - GSTIN format (15 characters)
   - PAN format (10 characters)
   - Email format
   - Duplicate checks for vendor code, email, and PAN

5. **Audit Trail**: All records include created_at, updated_at, created_by, and updated_by fields for audit purposes.

## Support

If you encounter any issues during testing:
1. Check the backend logs for detailed error messages
2. Verify database schema matches the expected structure
3. Ensure all required migrations have been run
4. Check network connectivity between frontend and backend
5. Verify CORS settings if testing from different origins
