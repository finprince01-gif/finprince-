from django.utils.deprecation import MiddlewareMixin
from core.tenant import get_tenant_from_request

class TenantMiddleware(MiddlewareMixin):
    """Attach request.tenant_id by checking header X-Tenant-ID first, then JWT claim 'tenant_id'."""

    def process_request(self, request):
        # Use centralized tenant resolution logic
        tenant_id = get_tenant_from_request(request)
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

