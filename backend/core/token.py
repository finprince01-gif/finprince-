from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework import serializers
from django.conf import settings

class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    email = serializers.EmailField(required=True)
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Add custom claims
        token['username'] = user.username
        token['email'] = getattr(user, 'email', '')
        token['company_name'] = getattr(user, 'company_name', '') or ''
        token['tenant_id'] = getattr(user, 'tenant_id', '')
        token['selected_plan'] = getattr(user, 'selected_plan', 'Free')

        # RBAC REMOVED: All users have full permissions
        # Check if user is superuser (all registered users are superusers)
        is_superuser = getattr(user, 'is_superuser', False)
        token['is_superuser'] = is_superuser
        
        return token

    def validate(self, attrs):
        """Custom auth logic"""
        from django.contrib.auth import authenticate
        from rest_framework.exceptions import AuthenticationFailed

        username = attrs.get(self.username_field)
        password = attrs.get('password')
        email = attrs.get('email')

        # 1. Try standard auth (Owner) - only use username and password
        user = authenticate(username=username, password=password)
        
        # Check if Owner user is active
        if user is not None and not user.is_active:
            raise AuthenticationFailed('Your account has been deactivated. Please contact the administrator.')
        
        if user is None:
            raise AuthenticationFailed('No active account found with the given credentials')
        
        if email:
            user_email = getattr(user, 'email', '')
            if user_email != email:
                raise AuthenticationFailed('No active account found with the given credentials')

        self.user = user
        
        refresh = self.get_token(self.user)
        data = {}
        data['refresh'] = str(refresh)
        data['access'] = str(refresh.access_token)
        
        # Add extra user info to the response
        user = self.user
        data['username'] = user.username
        data['email'] = getattr(user, 'email', '')
        data['tenant_id'] = getattr(user, 'tenant_id', '')
        data['company_name'] = getattr(user, 'company_name', '')
        

        
        return data
