from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
import logging
import traceback
from django.conf import settings
from .exceptions import UsageLimitExceeded, BusinessError, ExternalServiceError

logger = logging.getLogger(__name__)

def custom_exception_handler(exc, context):
    """
    Structured Exception Handler for a Django SaaS application.
    Returns:
    {
        "success": False,
        "error": {
            "type": "...",
            "message": "...",
            "fields": {}  // Optional
        }
    }
    """
    # Call REST framework's default exception handler first.
    response = exception_handler(exc, context)

    # Default structured error data
    error_data = {
        "success": False,
        "error": {
            "type": "SERVER_ERROR",
            "message": "An unexpected error occurred."
        }
    }

    if response is not None:
        from rest_framework import exceptions
        from django.http import Http404

        # Map DRF/Django exceptions to our structured format
        if isinstance(exc, exceptions.ValidationError):
            error_data["error"]["type"] = "VALIDATION_ERROR"
            error_data["error"]["message"] = "Invalid input data"
            error_data["error"]["fields"] = response.data
            response.status_code = status.HTTP_400_BAD_REQUEST
            
        elif isinstance(exc, exceptions.NotAuthenticated):
            error_data["error"]["type"] = "NOT_AUTHENTICATED"
            detail = response.data.get('detail') if isinstance(response.data, dict) else response.data
            error_data["error"]["message"] = str(detail)
            response.status_code = status.HTTP_401_UNAUTHORIZED

        elif isinstance(exc, exceptions.AuthenticationFailed):
            error_data["error"]["type"] = "AUTHENTICATION_FAILED"
            detail = response.data.get('detail') if isinstance(response.data, dict) else response.data
            error_data["error"]["message"] = str(detail)
            response.status_code = status.HTTP_401_UNAUTHORIZED
            
        elif isinstance(exc, exceptions.PermissionDenied):
            error_data["error"]["type"] = "PERMISSION_DENIED"
            detail = response.data.get('detail') if isinstance(response.data, dict) else response.data
            error_data["error"]["message"] = str(detail)
            response.status_code = status.HTTP_403_FORBIDDEN

        elif isinstance(exc, (exceptions.NotFound, Http404)):
            # Requirement #6: Not Found Errors
            error_data["error"]["type"] = "BUSINESS_ERROR" # Mapped to BUSINESS_ERROR as per list
            error_data["error"]["message"] = "Requested resource not found."
            response.status_code = status.HTTP_404_NOT_FOUND

        elif isinstance(exc, UsageLimitExceeded):
            error_data["error"]["type"] = "USAGE_LIMIT"
            error_data["error"]["message"] = str(exc.detail)
            response.status_code = status.HTTP_403_FORBIDDEN

        elif isinstance(exc, BusinessError):
            error_data["error"]["type"] = "BUSINESS_ERROR"
            error_data["error"]["message"] = str(exc.detail)
            response.status_code = status.HTTP_400_BAD_REQUEST

        elif isinstance(exc, ExternalServiceError):
            error_data["error"]["type"] = "EXTERNAL_SERVICE_ERROR"
            error_data["error"]["message"] = "AI service is temporarily unavailable. Please try again."
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

        elif isinstance(exc, exceptions.APIException):
            error_data["error"]["type"] = "BUSINESS_ERROR"
            detail = response.data.get('detail') if isinstance(response.data, dict) else response.data
            error_data["error"]["message"] = str(detail)
        
        response.data = error_data
        return response

    # Handle unhandled server exceptions (500)
    from django.db import DatabaseError
    
    # Log exact error and traceback internally
    logger.error(f"SERVER_ERROR: {str(exc)}\n{traceback.format_exc()}")

    if settings.DEBUG:
        # Requirement #8: Show detailed error message in DEBUG=True
        # Requirement #9: Ensure no raw SQL errors are exposed
        if isinstance(exc, DatabaseError):
            error_data["error"]["message"] = "A database error occurred. Check logs for details."
        else:
            error_data["error"]["message"] = str(exc)
    else:
        # Requirement #8: Hidden in production
        error_data["error"]["message"] = "An unexpected error occurred."

    return Response(error_data, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
