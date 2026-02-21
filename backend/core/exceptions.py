from rest_framework.exceptions import APIException
from rest_framework import status

class BusinessException(APIException):
    """
    Base class for all business logic violations.
    Usage:
        raise BusinessException(
            detail="Usage limit exceeded",
            error_code="USAGE_LIMIT_EXCEEDED",
            status_code=403,
            field="usage"
        )
    """
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = 'A business logic error occurred.'
    default_code = 'BUSINESS_ERROR'

    def __init__(self, detail=None, error_code=None, status_code=None, field=None):
        if status_code is not None:
            self.status_code = status_code
        if error_code is not None:
            self.default_code = error_code
        if field is not None:
            self.field = field
        else:
            self.field = None
        super().__init__(detail, error_code)

class UsageLimitExceeded(BusinessException):
    status_code = status.HTTP_403_FORBIDDEN
    default_detail = 'Usage limit reached.'
    default_code = 'USAGE_LIMIT_EXCEEDED'

class TenantAccessDenied(BusinessException):
    status_code = status.HTTP_403_FORBIDDEN
    default_detail = 'Access denied for this tenant.'
    default_code = 'TENANT_ACCESS_DENIED'

class ExternalServiceError(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = 'External service is temporarily unavailable.'
    default_code = 'EXTERNAL_SERVICE_ERROR'
