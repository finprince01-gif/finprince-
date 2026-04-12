from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework import serializers
from django.conf import settings

class MyTokenObtainPairSerializer(TokenObtainPairSerializer):

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Add custom claims
        token['username'] = user.username
        token['email'] = getattr(user, 'email', '')
        token['tenant_id'] = getattr(user, 'tenant_id', '')

        # 1. Identify Role
        from .models import MasterUser
        is_master = isinstance(user, MasterUser)
        role = getattr(user, 'role', 'MASTER_ADMIN' if is_master else 'BRANCH_USER')
        token['role'] = role
        token['is_master'] = is_master

        # 2. Add Branch Info (Company layer removed)
        from .models import Branch
        tenant = Branch.objects.filter(id=user.branch_id).first()
        if tenant:
            token['branch_name'] = tenant.name
            token['company_name'] = getattr(user, 'company_name', '') or tenant.name
        else:
            token['branch_name'] = None
            token['company_name'] = getattr(user, 'company_name', '')

        token['company_id'] = None  # Company layer removed
        token['is_superuser'] = getattr(user, 'is_superuser', False)

        return token

    def validate(self, attrs):
        """Custom email+username-based auth logic"""
        from rest_framework.exceptions import AuthenticationFailed
        from django.contrib.auth import get_user_model
        from .models import Branch

        email = attrs.get('email')
        username = attrs.get('username')
        password = attrs.get('password')

        if not email or not username or not password:
            raise AuthenticationFailed('Email, Username, and Password are required.')

        branch = Branch.objects.filter(email=email).first()
        if not branch:
            raise AuthenticationFailed('Invalid Branch Email.')

        User = get_user_model()
        user = User.objects.filter(username=username, tenant_id=branch.id).first()

        if not user or not user.check_password(password):
            raise AuthenticationFailed('Invalid Branch Email, Username, or Password.')

        if not user.is_active:
            raise AuthenticationFailed('Your account has been deactivated.')

        self.user = user

        refresh = self.get_token(self.user)
        data = {}
        data['refresh'] = str(refresh)
        data['access'] = str(refresh.access_token)

        # Add extra user info to the response
        data['username'] = user.username
        data['email'] = getattr(user, 'email', '')
        data['tenant_id'] = getattr(user, 'tenant_id', '')
        data['role'] = getattr(user, 'role', 'BRANCH_USER')

        branch = Branch.objects.filter(id=user.branch_id).first()
        if branch:
            data['branch_name'] = branch.name
            data['company_name'] = getattr(user, 'company_name', '') or branch.name
        else:
            data['branch_name'] = None
            data['company_name'] = getattr(user, 'company_name', '')

        data['company_id'] = None  # Company layer removed

        return data
