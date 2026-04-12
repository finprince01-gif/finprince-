from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
import logging
import traceback
from django.conf import settings
from django.db import IntegrityError
from .exceptions import BusinessException, ExternalServiceError

logger = logging.getLogger(__name__)

def custom_exception_handler(exc, context):
    """
    Centralized production-grade exception handler for Django REST Framework.
    """
    # Call DRF's default exception handler first to get the standard error response.
    response = exception_handler(exc, context)

    # 1. Handle DRF Exceptions (already handled by default handler)
    if response is not None:
        from rest_framework import exceptions
        from django.http import Http404

        error_payload = {
            "success": False,
            "error_code": "API_ERROR",
            "message": "An error occurred.",
            "details": {},
            "field": None
        }

        # Determine Error Code and Message
        if isinstance(exc, exceptions.ValidationError):
            error_payload["error_code"] = "VALIDATION_ERROR"
            error_payload["message"] = "Invalid input data."
            
            # DRF validation errors can be a list, a dict, or a single value.
            # We want to normalize this.
            details = response.data
            
            # If everything is bundled under non_field_errors, and it's a uniqueness message,
            # we try to make it feel less "generic".
            if isinstance(details, dict):
                # Check for "non_field_errors" or "detail" (standard DRF keys)
                non_field = details.get('non_field_errors') or details.get('detail')
                if non_field:
                    if isinstance(non_field, list):
                        msg = str(non_field[0])
                    else:
                        msg = str(non_field)
                    
                    # Convert generic "A record with this information already exists" to something better
                    if "already exists" in msg.lower():
                        error_payload["error_code"] = "DUPLICATE_ENTRY"
                        error_payload["message"] = "A record with this unique combination already exists."
                    else:
                        error_payload["message"] = msg
                
                # If there is exactly one field error, set the 'field' property for the frontend
                # Exclude non_field_errors from being the "field"
                field_errors = {k: v for k, v in details.items() if k not in ['non_field_errors', 'detail']}
                if len(field_errors) == 1:
                    error_payload["field"] = list(field_errors.keys())[0]
                    # If it's a list, use the first message as the primary message
                    val = field_errors[error_payload["field"]]
                    if isinstance(val, list) and len(val) > 0:
                        error_payload["message"] = str(val[0])
                    elif isinstance(val, str):
                        error_payload["message"] = val
            
            error_payload["details"] = details
            response.status_code = status.HTTP_400_BAD_REQUEST

        elif isinstance(exc, (exceptions.AuthenticationFailed, exceptions.NotAuthenticated)):
            # Distinguish between generic failure and specific deactivations
            auth_code = getattr(exc, 'get_codes', lambda: None)()
            if isinstance(auth_code, dict):
                auth_code = auth_code.get('detail')
            
            error_payload["error_code"] = auth_code or "AUTHENTICATION_FAILED"
            error_payload["message"] = str(exc.detail) if hasattr(exc, 'detail') else "Authentication credentials were not provided or are invalid."
            response.status_code = status.HTTP_401_UNAUTHORIZED

        elif isinstance(exc, exceptions.PermissionDenied):
            perm_code = getattr(exc, 'get_codes', lambda: None)()
            if isinstance(perm_code, dict):
                perm_code = perm_code.get('detail')
            
            error_payload["error_code"] = perm_code or "PERMISSION_DENIED"
            error_payload["message"] = str(exc.detail) if hasattr(exc, 'detail') else "You do not have permission to perform this action."
            response.status_code = status.HTTP_403_FORBIDDEN

        elif isinstance(exc, (exceptions.NotFound, Http404)):
            error_payload["error_code"] = "RESOURCE_NOT_FOUND"
            error_payload["message"] = "The requested resource was not found."
            response.status_code = status.HTTP_404_NOT_FOUND

        elif isinstance(exc, BusinessException):
            error_payload["error_code"] = exc.default_code
            error_payload["message"] = str(exc.detail)
            error_payload["field"] = getattr(exc, 'field', None)
            response.status_code = exc.status_code

        elif isinstance(exc, exceptions.APIException):
            api_code = getattr(exc, 'get_codes', lambda: None)()
            if isinstance(api_code, dict):
                api_code = api_code.get('detail')
            
            error_payload["error_code"] = api_code or getattr(exc, 'default_code', 'API_ERROR').upper()
            detail = response.data.get('detail') if isinstance(response.data, dict) else response.data
            error_payload["message"] = str(detail)

        response.data = error_payload
        return response

    # 2. Handle Non-DRF Exceptions (500 errors or integrity errors)
    
    # Handle Database Integrity Errors (e.g. duplicate keys)
    if isinstance(exc, IntegrityError):
        error_code = "DATABASE_CONFLICT"
        message = "A database conflict occurred."
        
        # Try to extract the field name from the error string if possible (MySQL/Postgres formats)
        exc_str = str(exc).lower()
        field = None
        
        if 'duplicate entry' in exc_str:
            error_code = "DUPLICATE_ENTRY"
            message = "A record with this information already exists."
            # Attempt simple field extraction for common patterns like "Duplicate entry '...' for key 'tenant_id_username_unique'"
            if 'for key' in exc_str:
                key_name = exc_str.split('for key')[-1].strip().replace("'", "").replace("`", "")
                # If key name contains a field name we recognize, we can populate 'field'
                for f in ['username', 'email', 'phone', 'name', 'code']:
                    if f in key_name:
                        field = f
                        message = f"{f.capitalize()} is already in use."
                        break
            
        return Response({
            "success": False,
            "error_code": error_code,
            "message": message,
            "details": {},
            "field": field
        }, status=status.HTTP_409_CONFLICT)

    # Handle all other unhandled exceptions as 500
    logger.error(f"UNHANDLED_EXCEPTION: {str(exc)}\n{traceback.format_exc()}")

    message = "An internal server error occurred."
    if settings.DEBUG:
        message = f"DEBUG: {str(exc)}"

    return Response({
        "success": False,
        "error_code": "INTERNAL_SERVER_ERROR",
        "message": message,
        "details": {},
        "field": None
    }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
