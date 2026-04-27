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
            # Re-raise explicit authentication failures (e.g. inactive users)
            raise e
        except Exception as e:
            # For other errors (like invalid crypto tokens), return None to allow standard permissions to handle it
            if raw_token:
                print(f"DEBUG: JWT Auth failed for token: {str(e)}")
            return None

    def get_user(self, validated_token):
        """
        Attempts to find and return a user using the given validated token.
        Supports both MasterUser and standard User (Owner) models.
        """
        from rest_framework_simplejwt.settings import api_settings
        from rest_framework_simplejwt.exceptions import InvalidToken, AuthenticationFailed
        from django.contrib.auth import get_user_model
        from .models import MasterUser

        # Check token type
        token_type = validated_token.get('type')

        if token_type == 'master':
            master_id = validated_token.get('master_id')
            if not master_id:
                raise InvalidToken("Master token contained no recognizable ID")
            try:
                master = MasterUser.objects.get(id=master_id, is_active=True)
                return master
            except MasterUser.DoesNotExist:
                raise AuthenticationFailed("Master User not found", code="user_not_found")

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
        if token_tenant_id:
            # Always set/override from token if present, as the token is the ground truth for this session
            user.tenant_id = token_tenant_id

        return user

