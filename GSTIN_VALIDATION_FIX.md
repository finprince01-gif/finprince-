# GSTIN Validation Update

## Issue
**Error:** `Serializer validation failed: {'gstin': [ErrorDetail(string='Ensure this field has no more than 15 characters.', code='max_length')]}`

## Root Cause
The backend model requires the `gstin` field to be exactly 15 characters (max_length=15). The frontend logic `handleGstChange` allowed more than 15 characters, leading to a backend validation error upon submission.

## Solution

### Frontend Changes (`VendorPortal.tsx`)

1. **Input Length Restriction & Formatting**:
   Updated `handleGstChange` to:
   - Slice the input to a maximum of 15 characters.
   - Convert the input to uppercase automatically.
   
   ```typescript
   if (field === 'gstin') {
      const formattedValue = typeof value === 'string' ? value.slice(0, 15).toUpperCase() : value;
      return { ...record, [field]: formattedValue };
   }
   ```

2. **Submission Validation**:
   Updated `handleGSTDetailsSubmit` to validate that the GSTIN is EXACTLY 15 characters long before proceeding to the next tab (for non-Unregistered types).

   ```typescript
   const invalidRecord = gstRecords.find(r => 
       r.registrationType !== 'Unregistered' && 
       r.gstin && 
       r.gstin.length !== 15
   );

   if (invalidRecord) {
       showError(`Invalid GSTIN format for record ${gstRecords.indexOf(invalidRecord) + 1}. Must be exactly 15 characters.`);
       return;
   }
   ```

## Impact
- ✅ Users cannot type more than 15 characters for GSTIN.
- ✅ GSTINs are automatically capitalized.
- ✅ Users are prevented from proceeding with incomplete GSTINs (e.g., 14 characters).
- ✅ Prevents backend 400 Bad Request errors due to invalid GSTIN length.

## Status
✅ **FIXED** - GSTIN validation now enforced on frontend.

---

**Date:** 2026-02-14  
**Files Modified:** `frontend/src/pages/VendorPortal/VendorPortal.tsx`
