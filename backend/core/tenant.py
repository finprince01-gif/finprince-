"""
Branch Module - Branch Resolution & Validation
Centralized tenant management logic.
"""

from django.http import JsonResponse
from .authentication import CustomJWTAuthentication


def get_tenant_from_request(request):
    """
    Extract tenant_id from request.
    Checks header X-Branch-ID first, then JWT claim 'tenant_id'.
    
    Args:
        request: Django request object
    
    Returns:
        str or None: Branch ID if found, None otherwise
    """
    # 1. Check header override (Only allowed for authenticated users)
    header_tid = request.META.get('HTTP_X_TENANT_ID')
    
    # 2. Get from user object if available (set by AuthenticationMiddleware)
    user = getattr(request, 'user', None)
    user_authenticated = user and user.is_authenticated
    user_tid = getattr(user, 'tenant_id', None)

    # 3. If header is provided, VALIDATE it against user's actual tenant
    if header_tid and user_authenticated:
        if user_tid and str(header_tid) != str(user_tid):
            # SECURITY ALERT: User trying to switch to a tenant they don't own
            # Note: We return None here so middleware can reject
            return None
        return header_tid

    # 4. Return user's native tenant_id
    if user_authenticated and user_tid:
        return user_tid

    # 5. Try to get from JWT token via Authentication class (for early middleware calls)
    try:
        auth = CustomJWTAuthentication()
        user_auth_tuple = auth.authenticate(request)
        if user_auth_tuple is not None:
            user = user_auth_tuple[0]
            validated_token = user_auth_tuple[1]
            
            # Master tokens never have a tenant
            if validated_token.get('type') == 'master':
                return None
                
            tid = validated_token.get('tenant_id')
            return tid
    except Exception:
        pass

    # 6. Final check: parse token cookie directly as last resort
    # Removed dangerous logic that returns tenant ID without user validation

    return None


def validate_tenant_access(user, tenant_id):
    """
    Validate that user has access to the specified tenant.
    Enforces RBAC-aware isolation.
    """
    from django.apps import apps
    MasterUser = apps.get_model('core', 'MasterUser')
    Branch = apps.get_model('core', 'Branch')

    # 1. Master Admins - Bypass all tenant checks
    if isinstance(user, MasterUser):
        return True, None

    if not tenant_id:
        return False, JsonResponse({
            'detail': 'Branch ID is required',
            'code': 'tenant_required'
        }, status=400)

    # 2. Identify Context
    user_tenant_id = getattr(user, 'tenant_id', None)

    # Validate Branch Status
    try:
        target_tenant = Branch.objects.get(id=tenant_id)
        if not target_tenant.is_active:
            return False, JsonResponse({
                'detail': 'This branch has been deactivated by the Master Admin.',
                'error_code': 'account_suspended',
                'code': 'account_suspended'
            }, status=403)
    except Branch.DoesNotExist:
        return False, JsonResponse({
            'detail': 'Branch not found.',
            'error_code': 'account_suspended',
            'code': 'account_suspended'
        }, status=403)

    # 3. Standard Isolation
    # Must match their assigned tenant_id identically
    if user_tenant_id and str(user_tenant_id) == str(tenant_id):
        return True, None
    
    return False, JsonResponse({
        'detail': 'Access denied: You do not have permission for this branch.',
        'code': 'access_denied'
    }, status=403)



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
                'detail': 'Branch ID not found in request',
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
        str or None: Branch ID if found, None otherwise
    """
    return getattr(user, 'tenant_id', None)
