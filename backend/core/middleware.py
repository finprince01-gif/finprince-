import uuid
import threading
from django.utils.deprecation import MiddlewareMixin
from core.tenant import get_tenant_from_request

_thread_locals = threading.local()

def get_correlation_id():
    """Fetches the current request's correlation ID for logs and downstream SQS tasks."""
    return getattr(_thread_locals, 'correlation_id', None)

class CorrelationIDMiddleware:
    """
    PHASE 14: OBSERVABILITY & TRACING.
    Ensures every request has a unique ID that propagates through SQS to Workers.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        correlation_id = request.headers.get('X-Correlation-ID') or \
                         request.headers.get('x-correlation-id') or \
                         str(uuid.uuid4())
        _thread_locals.correlation_id = correlation_id
        response = self.get_response(request)
        response['X-Correlation-ID'] = correlation_id
        return response

class TenantMiddleware(MiddlewareMixin):
    def process_request(self, request):
        tenant_id = get_tenant_from_request(request)
        if hasattr(request, 'user') and request.user.is_authenticated:
            from core.tenant import validate_tenant_access
            is_valid, error_response = validate_tenant_access(request.user, tenant_id)
            if not is_valid:
                return error_response
        request.tenant_id = tenant_id

class ExceptionLoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_exception(self, request, exception):
        import traceback
        import logging
        logger = logging.getLogger('django.request')
        user_id = getattr(request.user, 'id', 'Anonymous')
        tenant_id = getattr(request, 'tenant_id', 'None')
        method = request.method
        path = request.get_full_path()
        logger.error(
            f"EXCEPTION: Method={method} Path={path} UserID={user_id} TenantID={tenant_id} CID={get_correlation_id()}\n"
            f"Traceback:\n{traceback.format_exc()}"
        )
        return None

