# Banking Details Validation Fix

## Issue
**Error:** `Error creating vendor banking: {'bank_name': [ErrorDetail(string='This field may not be blank.', code='blank')], 'ifsc_code': [ErrorDetail(string='This field may not be blank.', code='blank')]}`

## Root Cause
The `VendorMasterBanking` model defines `bank_name` and `ifsc_code` as **required** fields (no `blank=True, null=True` in the model definition). However, when users don't fill in banking details in the frontend, empty strings are sent to the backend, causing validation errors.

### Model Definition (models.py lines 530-532):
```python
bank_account_no = models.CharField(max_length=50, help_text="Bank Account Number")
bank_name = models.CharField(max_length=200, help_text="Bank Name")  # Required!
ifsc_code = models.CharField(max_length=11, help_text="IFSC Code")  # Required!
```

## Solution
Updated the `VendorMasterBankingSerializer` to make `bank_name` and `ifsc_code` **optional** fields by explicitly declaring them with `required=False` and `allow_blank=True`.

### File Changed
**`backend/vendors/vendorbanking_serializers.py`**

### Changes Made:

#### 1. Added Field Overrides (Lines 10-11):
```python
# Override fields to make them optional
bank_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
ifsc_code = serializers.CharField(max_length=11, required=False, allow_blank=True)
```

#### 2. Updated Validation Methods:
```python
def validate_ifsc_code(self, value):
    """Validate IFSC code format"""
    # Only validate if value is provided and not blank
    if value and value.strip() and len(value) != 11:
        raise serializers.ValidationError("IFSC code must be exactly 11 characters")
    return value.upper() if value and value.strip() else value

def validate_swift_code(self, value):
    """Validate SWIFT code format"""
    # Only validate if value is provided and not blank
    if value and value.strip() and (len(value) < 8 or len(value) > 11):
        raise serializers.ValidationError("SWIFT code must be 8 or 11 characters")
    return value.upper() if value and value.strip() else value
```

## Impact
- ✅ Banking details can now be saved with empty `bank_name` and `ifsc_code`
- ✅ Users can skip banking details during vendor creation
- ✅ Validation still works when values are provided
- ✅ IFSC and SWIFT codes are validated only when non-empty
- ✅ Bank account number remains required (as it should be)

## Behavior

### Before Fix:
```
❌ Error: bank_name and ifsc_code cannot be blank
❌ Vendor creation fails if banking details are empty
```

### After Fix:
```
✅ Banking details with empty bank_name/ifsc_code are accepted
✅ Vendor creation succeeds even without complete banking info
✅ Validation applies only when fields have values
```

## Testing

### Test Case 1: Empty Banking Details
**Input:**
```json
{
  "bank_account_no": "1234567890",
  "bank_name": "",
  "ifsc_code": "",
  "branch_name": "",
  "account_type": "current"
}
```
**Expected:** ✅ Accepted (bank_account_no is provided)

### Test Case 2: Partial Banking Details
**Input:**
```json
{
  "bank_account_no": "1234567890",
  "bank_name": "HDFC Bank",
  "ifsc_code": "",
  "branch_name": "Main Branch"
}
```
**Expected:** ✅ Accepted

### Test Case 3: Complete Banking Details
**Input:**
```json
{
  "bank_account_no": "1234567890",
  "bank_name": "HDFC Bank",
  "ifsc_code": "HDFC0001234",
  "branch_name": "Main Branch",
  "swift_code": "HDFCINBB"
}
```
**Expected:** ✅ Accepted and validated

### Test Case 4: Invalid IFSC Code
**Input:**
```json
{
  "bank_account_no": "1234567890",
  "bank_name": "HDFC Bank",
  "ifsc_code": "HDFC123",  // Only 7 characters
}
```
**Expected:** ❌ Validation error: "IFSC code must be exactly 11 characters"

## Additional Notes

### Why Not Change the Model?
We kept the model definition as-is because:
1. **Database consistency**: Changing the model would require a migration
2. **Business logic**: Bank name and IFSC are important for banking operations
3. **Flexibility**: Serializer-level validation allows us to accept empty values during creation but enforce them later if needed

### Future Improvements
Consider adding frontend validation to:
1. Show warnings when banking details are incomplete
2. Validate IFSC code format (11 characters) before submission
3. Provide auto-complete for bank names and IFSC codes

## Status
✅ **FIXED** - Banking details validation now allows empty bank_name and ifsc_code

---

**Date:** 2026-02-14  
**Files Modified:** `backend/vendors/vendorbanking_serializers.py`
