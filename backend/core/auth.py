"""
Authentication Module - JWT Authentication Logic
Extracted from core/authentication.py for clean separation.
"""

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.exceptions import AuthenticationFailed


class CustomJWTAuthentication(JWTAuthentication):
    """
    Custom JWT Authentication supporting both header and cookie-based tokens.
    Supports both User (Owner) and TenantUser (Staff) models.
    """
    
    def authenticate(self, request):
        """
        Authenticate request using JWT from header or cookie.
        Returns (user, validated_token) tuple or None.
        """
        try:
            # 1. Try to get token from header (standard Bearer)
            header = self.get_header(request)
            if header is not None:
                raw_token = self.get_raw_token(header)
            else:
                # 2. Try to get token from HttpOnly cookie
                raw_token = request.COOKIES.get('access_token')

            if raw_token is None:
                return None

            validated_token = self.get_validated_token(raw_token)
            return self.get_user(validated_token), validated_token
        except AuthenticationFailed:
            # If authentication fails (e.g., user not found, invalid token),
            # return None to allow AllowAny views to work
            return None
        except Exception:
            # Catch any other exceptions and return None
            return None

    def get_user(self, validated_token):
        """
        Find and return user using validated token.
        Only supports User (Owner) model.
        """
        from rest_framework_simplejwt.settings import api_settings
        from rest_framework_simplejwt.exceptions import InvalidToken, AuthenticationFailed
        from django.contrib.auth import get_user_model

        try:
            user_id = validated_token[api_settings.USER_ID_CLAIM]
        except KeyError:
            raise InvalidToken("Token contained no recognizable user identification")

        # Determine which model to check
        user_model = get_user_model()  # User (Owner)

        try:
            user = user_model.objects.get(**{api_settings.USER_ID_FIELD: user_id})
        except user_model.DoesNotExist:
            raise AuthenticationFailed("User not found", code="user_not_found")

        if not user.is_active:
            raise AuthenticationFailed("User is inactive", code="user_inactive")

        return user
