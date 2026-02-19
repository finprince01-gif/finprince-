from rest_framework.exceptions import APIException
from rest_framework import status

class UsageLimitExceeded(APIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_detail = 'Usage limit reached.'
    default_code = 'usage_limit'

class BusinessError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = 'A business logic error occurred.'
    default_code = 'business_error'

class ExternalServiceError(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = 'External service is temporarily unavailable.'
    default_code = 'external_service_error'
