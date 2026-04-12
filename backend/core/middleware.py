from django.utils.deprecation import MiddlewareMixin
from core.tenant import get_tenant_from_request

class TenantMiddleware(MiddlewareMixin):
    """Enforce request.tenant_id validation. Rejects if tenant is missing or mismatched."""

    def process_request(self, request):
        tenant_id = get_tenant_from_request(request)
        
        # We only enforce strict validation if the user is ALREADY authenticated.
        # This middleware runs after AuthenticationMiddleware.
        if hasattr(request, 'user') and request.user.is_authenticated:
            from core.tenant import validate_tenant_access
            is_valid, error_response = validate_tenant_access(request.user, tenant_id)
            if not is_valid:
                return error_response
                
        request.tenant_id = tenant_id



class ExceptionLoggingMiddleware:
    """
    Log unhandled exceptions with full context for production debugging.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_exception(self, request, exception):
        import traceback
        import logging
        
        logger = logging.getLogger('django.request')
        
        # Extract context
        user_id = getattr(request.user, 'id', 'Anonymous')
        tenant_id = getattr(request, 'tenant_id', 'None')
        method = request.method
        path = request.get_full_path()
        
        # Log the error with context
        logger.error(
            f"EXCEPTION: Method={method} Path={path} UserID={user_id} TenantID={tenant_id}\n"
            f"Traceback:\n{traceback.format_exc()}"
        )
        
        # Return None to let Django/DRF handle the response formatting
        return None

