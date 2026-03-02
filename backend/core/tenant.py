"""
Tenant Module - Tenant Resolution & Validation
Centralized tenant management logic.
"""

from django.http import JsonResponse
from .authentication import CustomJWTAuthentication


def get_tenant_from_request(request):
    """
    Extract tenant_id from request.
    Checks header X-Tenant-ID first, then JWT claim 'tenant_id'.
    
    Args:
        request: Django request object
    
    Returns:
        str or None: Tenant ID if found, None otherwise
    """
    # 1. Check header override (useful for testing/Postman)
    header_tid = request.META.get('HTTP_X_TENANT_ID')
    if header_tid:
        return header_tid

    # 2. Try to get from JWT token via Authentication class
    try:
        auth = CustomJWTAuthentication()
        user_auth_tuple = auth.authenticate(request)
        if user_auth_tuple is not None:
            user = user_auth_tuple[0]
            validated_token = user_auth_tuple[1]
            tid = validated_token.get('tenant_id')
            return tid
    except Exception:
        pass

    # 3. Fallback: Parse access_token cookie directly
    # This is needed if AuthenticationMiddleware hasn't run or failed contextually
    try:
        from rest_framework_simplejwt.tokens import AccessToken
        token_str = request.COOKIES.get('access_token')
        if token_str:
            token = AccessToken(token_str)
            tid = token.get('tenant_id')
            return tid
    except Exception:
        pass

    return None


def validate_tenant_access(user, tenant_id):
    """
    Validate that user has access to the specified tenant.
    
    Args:
        user: User or TenantUser instance
        tenant_id: Tenant ID to validate
    
    Returns:
        tuple: (is_valid: bool, error_response: JsonResponse or None)
    """
    if not tenant_id:
        return False, JsonResponse({
            'detail': 'Tenant ID is required',
            'code': 'tenant_required'
        }, status=400)
    
    # Get user's tenant_id
    user_tenant_id = getattr(user, 'tenant_id', None)
    
    if not user_tenant_id:
        return False, JsonResponse({
            'detail': 'User has no associated tenant',
            'code': 'no_tenant'
        }, status=403)
    
    # Ensure tenant_id matches
    if str(user_tenant_id) != str(tenant_id):
        return False, JsonResponse({
            'detail': 'Access denied: Tenant mismatch',
            'code': 'tenant_mismatch'
        }, status=403)
    
    return True, None


def require_tenant(func):
    """
    Decorator to enforce tenant validation on view functions or methods.
    Attaches request.tenant_id for convenience.
    
    Usage:
        @require_tenant
        def my_view(request):
            tenant_id = request.tenant_id
            ...
    """
    def wrapper(request, *args, **kwargs):
        tenant_id = get_tenant_from_request(request)
        
        if not tenant_id:
            return JsonResponse({
                'detail': 'Tenant ID not found in request',
                'code': 'tenant_not_found'
            }, status=400)
        
        # Attach to request for convenience
        request.tenant_id = tenant_id
        
        # Validate user has access to this tenant
        if hasattr(request, 'user') and request.user.is_authenticated:
            is_valid, error_response = validate_tenant_access(request.user, tenant_id)
            if not is_valid:
                return error_response
        
        return func(request, *args, **kwargs)
    return wrapper


def get_user_tenant_id(user):
    """
    Get tenant_id for a user.
    
    Args:
        user: User or TenantUser instance
    
    Returns:
        str or None: Tenant ID if found, None otherwise
    """
    return getattr(user, 'tenant_id', None)
