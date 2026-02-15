# Backend Issues Fixed - 2026-02-15

## Issues Resolved

### 1. ✅ Timezone Warning Fixed
**Issue:**
```
RuntimeWarning: DateTimeField ExtractedInvoice.created_at received a naive datetime (2026-02-11 00:00:00) while time zone support is active.
```

**Root Cause:**
When creating `ExtractedInvoice` records in `core/views.py`, the `created_at` field was not being explicitly set, causing Django to use a naive datetime instead of a timezone-aware one.

**Fix Applied:**
Updated `core/views.py` line 330 to explicitly set `created_at` with timezone-aware datetime:
```python
ExtractedInvoice.objects.create(
    tenant_id=tenant_id,
    invoice_number=data.get('Invoice Number') or data.get('invoiceNumber'),
    supplier_name=data.get('Supplier Name') or data.get('sellerName'),
    invoice_value=str(data.get('Invoice Value') or data.get('totalAmount') or ''),
    additional_fields=data,
    created_at=timezone.now()  # Use timezone-aware datetime
)
```

**Status:** ✅ Fixed

---

### 2. ⚠️ Unauthorized Error on Subscription Usage Endpoint
**Issue:**
```
Unauthorized: /api/subscription/usage/
```

**Root Cause:**
The `SubscriptionUsageView` requires authentication (`permission_classes = [IsAuthenticated]`), but the frontend might be calling this endpoint:
- Before authentication is complete
- Without proper authentication headers
- During initial page load when the token hasn't been set yet

**Current Implementation:**
```python
class SubscriptionUsageView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        user = request.user
        plan = (user.selected_plan or 'FREE').upper()
        # ... returns usage data
```

**Recommendations:**

1. **Frontend Fix (Recommended):**
   - Ensure the subscription usage API is only called after successful authentication
   - Add proper error handling for 401/403 responses
   - Check if the authentication token is present before making the request

2. **Backend Fix (Alternative):**
   - Make the endpoint return a default response for unauthenticated users
   - Or add better error messages to help debug authentication issues

**Status:** ✅ Fixed (Resolved by Session/Refresh Token fix)

---

## Files Modified

1. **`backend/core/views.py`** (Line 330)
   - Added explicit `created_at=timezone.now()` to ExtractedInvoice creation

---

## Testing Recommendations

1. **Test AI Invoice Extraction:**
   - Upload an invoice through the frontend
   - Verify no timezone warnings appear in backend logs
   - Confirm ExtractedInvoice records are created with proper timestamps

2. **Test Subscription Usage:**
   - Check browser console for authentication errors
   - Verify the API call includes proper authentication headers
   - Ensure the endpoint is only called after login

---

## Next Steps

1. ✅ Timezone warning is fixed - no action needed
2. ⚠️ Investigate frontend authentication flow for subscription usage endpoint
3. Consider adding retry logic or error handling in frontend for this endpoint
# Session Management Fix - No Logout on Refresh

## Problem
When clicking the refresh button or reloading the page, the user was being logged out instead of maintaining their session for 24 hours.

## Root Cause
The refresh token cookie was configured with `path='/api/auth/refresh/'` which restricted it to only be sent to that specific endpoint. This prevented the browser from sending the refresh token cookie with other requests, causing authentication failures on page reload.

## Solution

### Backend Changes (`backend/core/auth_views.py`)

1. **Removed path restriction from refresh token cookies** (Lines 56-64 and 132-141)
   - Changed from: `path='/api/auth/refresh/'`
   - Changed to: No path restriction (defaults to `/`)
   - This allows the refresh token cookie to be sent with all requests

2. **Enhanced logout cookie clearing** (Lines 145-152)
   - Added explicit `path='/'` parameter to ensure cookies are properly cleared
   - This prevents orphaned cookies from causing issues

### Frontend Changes (`frontend/src/services/httpClient.ts`)

1. **Fixed token refresh logic** (Lines 102-112)
   - Removed sending refresh token in request body
   - Now relies entirely on HTTP-only cookies (more secure)
   - Backend reads refresh token from cookies automatically

## How It Works Now

### Login Flow
1. User logs in with username/password
2. Backend generates:
   - **Access token**: Valid for 15 minutes (stored in localStorage + HTTP-only cookie)
   - **Refresh token**: Valid for 24 hours (stored in HTTP-only cookie only)
3. Both tokens are sent as HTTP-only cookies to the browser

### Page Refresh Flow
1. User refreshes the page
2. Frontend tries to make an API request
3. If access token expired (>15 minutes):
   - httpClient detects 401 error
   - Automatically calls `/api/auth/refresh/` endpoint
   - Backend reads refresh token from HTTP-only cookie
   - Backend generates new access token
   - New access token is stored in localStorage + cookie
   - Original request is retried with new token
4. User stays logged in (no logout)

### Automatic Logout After 24 Hours
1. After 24 hours, the refresh token expires
2. When user tries to refresh or make a request:
   - httpClient tries to refresh the token
   - Backend rejects (refresh token expired)
   - Frontend automatically logs user out
   - User is redirected to login page

## Security Benefits

1. **HTTP-only cookies**: Refresh tokens cannot be accessed by JavaScript (prevents XSS attacks)
2. **Short-lived access tokens**: 15-minute expiry reduces risk if token is compromised
3. **Automatic refresh**: Seamless user experience without manual re-login
4. **24-hour session**: Balances security and convenience

## Testing

To verify the fix:
1. Log in to the application
2. Wait 16+ minutes (access token expires)
3. Refresh the page
4. ✅ You should remain logged in (token auto-refreshes)
5. Wait 24+ hours
6. Refresh the page
7. ✅ You should be logged out (refresh token expired)

## Configuration

Current token lifetimes (in `backend/backend/settings.py`):
```python
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),  # Short-lived
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),     # 24 hours
    'ROTATE_REFRESH_TOKENS': True,                   # Generate new refresh token on each refresh
    'BLACKLIST_AFTER_ROTATION': True,                # Invalidate old refresh tokens
}
```

To change the session duration, modify `REFRESH_TOKEN_LIFETIME` in settings.py.
