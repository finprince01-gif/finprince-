from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.exceptions import AuthenticationFailed

class CustomJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
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
        except AuthenticationFailed as e:
            # If authentication fails (e.g., user not found, invalid token),
            # return None to allow AllowAny views to work

            return None
        except Exception as e:
            # Catch any other exceptions and return None

            import traceback
            traceback.print_exc()
            return None

    def get_user(self, validated_token):
        """
        Attempts to find and return a user using the given validated token.
        Only supports User (Owner) model.
        Also attaches tenant_id from token to user object for easy access.
        """
        from rest_framework_simplejwt.settings import api_settings
        from rest_framework_simplejwt.exceptions import InvalidToken, AuthenticationFailed
        from django.contrib.auth import get_user_model

        try:
            user_id = validated_token[api_settings.USER_ID_CLAIM]
        except KeyError:
            raise InvalidToken("Token contained no recognizable user identification")

        # Determine which model to check
        user_model = get_user_model() # User (Owner)

        try:
            user = user_model.objects.get(**{api_settings.USER_ID_FIELD: user_id})
        except user_model.DoesNotExist:
            raise AuthenticationFailed("User not found", code="user_not_found")

        if not user.is_active:
            raise AuthenticationFailed("User is inactive", code="user_inactive")

        # IMPORTANT: Ensure tenant_id is set on user object from token
        # This is crucial for tenant validation in flow layers
        token_tenant_id = validated_token.get('tenant_id')
        if token_tenant_id and not hasattr(user, 'tenant_id'):
            user.tenant_id = token_tenant_id
        elif token_tenant_id and user.tenant_id != token_tenant_id:
            # Update if token has different tenant_id (shouldn't happen, but safety check)
            user.tenant_id = token_tenant_id

        return user

