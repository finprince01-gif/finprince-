from rest_framework import serializers
from django.contrib.auth import get_user_model
from core.exceptions import BusinessException
from django.db.models import Q

User = get_user_model()

class ProfessionalSerializerMixin:
    """
    Mixin to provide helper methods for manual uniqueness checks.
    """
    def check_uniqueness(self, model, field_name, value, error_code, error_message):
        """
        Manually check if a field value already exists, excluding current instance for updates.
        """
        instance = getattr(self, 'instance', None)
        query = {field_name: value}
        
        # If it's a multi-tenant model, we should usually add tenant_id to query
        # This assumes the serializer context has the request
        request = self.context.get('request')
        if request and hasattr(request, 'user') and hasattr(request.user, 'tenant_id'):
            query['tenant_id'] = request.user.branch_id

        qs = model.objects.filter(**query)
        if instance:
            qs = qs.exclude(pk=instance.pk)
            
        if qs.exists():
            raise BusinessException(
                detail=error_message,
                error_code=error_code,
                status_code=400,
                field=field_name
            )

class ProductionUserSerializer(serializers.ModelSerializer, ProfessionalSerializerMixin):
    """
    Example of a professional SaaS-grade serializer with explicit uniqueness validation.
    This replaces generic DRF UniqueValidator messages with field-specific SaaS errors.
    """
    class Meta:
        model = User
        fields = ['username', 'email', 'phone', 'company_name']
        # Explicitly remove default UniqueValidators to handle them manually for better control
        extra_kwargs = {
            'username': {'validators': []},
            'email': {'validators': []},
            'phone': {'validators': []},
        }

    def validate_username(self, value):
        self.check_uniqueness(
            User, 'username', value, 
            "USER_ALREADY_EXISTS", "Username is already registered."
        )
        return value

    def validate_email(self, value):
        self.check_uniqueness(
            User, 'email', value, 
            "EMAIL_ALREADY_REGISTERED", "This email address is already in use."
        )
        return value

    def validate_phone(self, value):
        self.check_uniqueness(
            User, 'phone', value, 
            "PHONE_ALREADY_REGISTERED", "This phone number is already registered."
        )
        return value

    def validate(self, data):
        """
        Example of handling multi-field unique constraints (unique_together).
        Case: Company Name must be unique within a plan (just an example).
        """
        company_name = data.get('company_name')
        # We don't have 'plan' in fields here but imagine it was there
        
        # Manual unique_together check
        instance = self.instance
        # Use request from context for multi-tenant safety if applicable
        # ... logic here ...
        
        return data

# ============================================================================
# BEST PRACTICE EXPLANATION
# ============================================================================
# 1. REMOVE DEFAULT VALIDATORS: DRF adds UniqueValidator automatically. 
#    Override them in Meta.extra_kwargs or by declaring fields explicitly.
# 2. USE FIELD-LEVEL VALIDATION: validate_<fieldname> methods are cleaner
#    and allow returning a 'field' property in the error response.
# 3. EXCLUDE INSTANCE ON UPDATE: Always check self.instance to allow
#    saving the same value on the same record.
# 4. TENANT AWARENESS: Always include tenant_id in uniqueness checks
#    to prevent cross-tenant collisions (unless global uniqueness is required).
# 5. BUSINESS EXCEPTION: Use our custom BusinessException to wrap errors
#    in a format that our global exception handler understands.
