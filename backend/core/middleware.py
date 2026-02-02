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
    Log unhandled exceptions to a file for debugging.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_exception(self, request, exception):
        import traceback
        import os
        from django.conf import settings
        
        log_path = os.path.join(settings.BASE_DIR, 'traceback.log')
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(f"\\n--- Exception at {str(os.environ.get('DJANGO_SETTINGS_MODULE'))} ---\\n")
            f.write(f"Path: {request.path}\\n")
            f.write(f"User: {request.user}\\n")
            traceback.print_exc(file=f)
        
        return None # Let Django handle the 500 response

