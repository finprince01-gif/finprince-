import uuid
from django.core.files.storage import default_storage
from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import CompanyFullInfo, Tenant, User

# User model imported inside Meta or methods to avoid AppRegistryNotReady

from .exceptions import BusinessException

class UserSignupSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    company_name = serializers.CharField(required=True)
    selected_plan = serializers.CharField(required=True) # Matched to frontend
    phone = serializers.CharField(required=True, max_length=15)  # Added phone field
    logo = serializers.ImageField(required=False, write_only=True) # Handle file upload

    class Meta:
        model = 'core.User'
        fields = ['username', 'email', 'password', 'company_name', 'phone', 'selected_plan', 'logo']
        extra_kwargs = {
            'username': {'validators': []},
            'email': {'validators': []},
        }

    def validate_username(self, value):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        if User.objects.filter(username=value).exists():
            raise BusinessException(
                detail="Username is already registered.",
                error_code="USER_ALREADY_EXISTS",
                status_code=400,
                field="username"
            )
        return value

    def validate_email(self, value):
        if not value:
            return value
        from django.contrib.auth import get_user_model
        User = get_user_model()
        if User.objects.filter(email=value).exists():
            raise BusinessException(
                detail="Email is already registered.",
                error_code="EMAIL_ALREADY_REGISTERED",
                status_code=400,
                field="email"
            )
        return value

    def validate_company_name(self, value):
        if Tenant.objects.filter(name=value).exists():
            raise BusinessException(
                detail="Company name already registered.",
                error_code="COMPANY_ALREADY_REGISTERED",
                status_code=400,
                field="company_name"
            )
        return value
    
    def validate_phone(self, value):
        import re
        from django.contrib.auth import get_user_model
        User = get_user_model()
        # Basic phone validation
        if not re.match(r'^\+?[1-9]\d{1,14}$', value):
            raise serializers.ValidationError("Invalid phone number format. Use international format (e.g., +1234567890)")
        
        if User.objects.filter(phone=value).exists():
            raise BusinessException(
                detail="This phone number is already registered.",
                error_code="PHONE_ALREADY_REGISTERED",
                status_code=400,
                field="phone"
            )
        return value

    def create(self, validated_data):
        company_name = validated_data.pop('company_name')
        plan_name = validated_data.pop('selected_plan')
        phone = validated_data.pop('phone')
        logo_file = validated_data.pop('logo', None)
        username = validated_data['username']

        tenant_uuid = str(uuid.uuid4())
        Tenant.objects.create(id=tenant_uuid, name=company_name)

        logo_path_str = None
        if logo_file:
            file_path = default_storage.save(f"logos/{tenant_uuid}_{logo_file.name}", logo_file)
            logo_path_str = default_storage.url(file_path)

        user = User.objects.create_user(
            username=username,
            email=validated_data.get('email'),
            password=validated_data['password'],
            company_name=company_name,
            phone=phone,
            phone_verified=False,
            selected_plan=plan_name,
            tenant_id=tenant_uuid,
            logo_path=logo_path_str
        )
        return user

class CompanySettingsSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='company_name', allow_blank=True, allow_null=True, required=False)
    address = serializers.CharField(source='address_line1', allow_blank=True, allow_null=True, required=False)
    logo = serializers.CharField(source='logo_path', read_only=True)
    
    class Meta:
        model = CompanyFullInfo
        fields = [
            'id', 'name', 'address', 'gstin', 'state', 'pincode', 'country', 
            'email', 'phone', 'website', 'pan', 'cin', 'tan', 'logo', 
            'voucher_numbering', 'tenant_id'
        ]
        read_only_fields = ['id', 'tenant_id']

    def update(self, instance, validated_data):
        return super().update(instance, validated_data)

# Registration Flow Serializers

class RegisterInitiateSerializer(serializers.Serializer):
    """Serializer for initiating registration and sending OTP via phone"""
    username = serializers.CharField(max_length=100)
    email = serializers.EmailField(required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, min_length=6)
    company_name = serializers.CharField(max_length=255)
    phone = serializers.CharField(max_length=15, required=True)
    selected_plan = serializers.CharField(max_length=50)
    logo = serializers.ImageField(required=False, allow_null=True)
    
    def validate_username(self, value):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        if User.objects.filter(username=value).exists():
            raise BusinessException(
                detail="Username is already registered.",
                error_code="USER_ALREADY_EXISTS",
                status_code=400,
                field="username"
            )
        return value
    
    def validate_phone(self, value):
        import re
        from django.contrib.auth import get_user_model
        User = get_user_model()
        if not re.match(r'^\+?[1-9]\d{1,14}$', value):
            raise serializers.ValidationError("Invalid phone number format")
            
        if User.objects.filter(phone=value).exists():
            raise BusinessException(
                detail="This phone number is already registered.",
                error_code="PHONE_ALREADY_REGISTERED",
                status_code=400,
                field="phone"
            )
        return value
    
    def validate_company_name(self, value):
        if Tenant.objects.filter(name=value).exists():
            raise BusinessException(
                detail="Company name already registered.",
                error_code="COMPANY_ALREADY_REGISTERED",
                status_code=400,
                field="company_name"
            )
        return value


class CreateUserSerializer(serializers.Serializer):
    """Serializer for creating user account from pending registration"""
    phone = serializers.CharField(max_length=15)
