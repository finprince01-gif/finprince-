"""
RBAC Serializers
================
Serializers for Role-Based Access Control API endpoints
"""

from rest_framework import serializers  # type: ignore
from django.contrib.auth import get_user_model  # type: ignore
from .rbac_models import Role, UserRole # type: ignore

User = get_user_model()


class RoleSerializer(serializers.ModelSerializer):
    """Serializer for Role model"""
    
    class Meta:
        model = Role
        fields = [
            'id', 'name', 'description', 'permissions', 
            'is_active', 'tenant_id', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']
    
    def validate_permissions(self, value):
        """Validate permissions structure"""
        if not isinstance(value, dict):
            raise serializers.ValidationError("Permissions must be a JSON object")
        
        # Validate structure: each page should have 'view' and optional 'tabs'
        for page_name, page_perms in value.items():
            if not isinstance(page_perms, dict):
                raise serializers.ValidationError(
                    f"Permissions for '{page_name}' must be an object"
                )
            if 'view' not in page_perms:
                raise serializers.ValidationError(
                    f"Permissions for '{page_name}' must have a 'view' field"
                )
            if not isinstance(page_perms.get('view'), bool):
                raise serializers.ValidationError(
                    f"'view' field for '{page_name}' must be a boolean"
                )
            
            # Validate tabs if present
            if 'tabs' in page_perms:
                if not isinstance(page_perms['tabs'], dict):
                    raise serializers.ValidationError(
                        f"'tabs' for '{page_name}' must be an object"
                    )
                for tab_name, tab_access in page_perms['tabs'].items():
                    if not isinstance(tab_access, bool):
                        raise serializers.ValidationError(
                            f"Tab '{tab_name}' access must be a boolean"
                        )
        
        return value
    
    def create(self, validated_data):
        """Create role with tenant_id from request"""
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['tenant_id'] = request.user.branch_id
        return super().create(validated_data)


class UserRoleSerializer(serializers.ModelSerializer):
    """Serializer for UserRole model"""
    role_name = serializers.CharField(source='role.name', read_only=True)
    role_description = serializers.CharField(source='role.description', read_only=True)
    user_username = serializers.CharField(source='user.username', read_only=True)
    
    class Meta:
        model = UserRole
        fields = [
            'id', 'user', 'role', 'role_name', 'role_description',
            'user_username', 'username', 'email', 'phone', 
            'assigned_at', 'assigned_by', 'tenant_id'
        ]
        read_only_fields = ['id', 'assigned_at', 'assigned_by', 'tenant_id', 'username', 'email', 'phone']
    
    def validate(self, data):
        """Validate that user and role belong to the same tenant"""
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            return data
            
        tenant_id = request.user.branch_id
        user = data.get('user')
        role = data.get('role')
        
        if user and hasattr(user, 'tenant_id') and user.branch_id != tenant_id:
            raise serializers.ValidationError("Cannot assign role to a user from another organization")
            
        if role and role.tenant_id != tenant_id:
            raise serializers.ValidationError("Cannot assign a role belonging to another organization")
            
        return data

    def create(self, validated_data):
        """Create user role assignment with tenant_id, assigned_by and denormalized fields"""
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            user = validated_data['user']
            validated_data['tenant_id'] = request.user.branch_id
            validated_data['assigned_by'] = request.user
            # Populate denormalized fields for quick access
            validated_data['username'] = user.username
            validated_data['email'] = getattr(user, 'email', '')
            validated_data['phone'] = getattr(user, 'phone', '')
        return super().create(validated_data)


class UserWithRolesSerializer(serializers.ModelSerializer):
    """Serializer for User with their assigned roles"""
    roles = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'company_name', 'phone',
            'is_active', 'tenant_id', 'roles', 'permissions',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']
    
    def get_roles(self, obj):
        """Get all roles assigned to this user"""
        user_roles = UserRole.objects.filter(
            user=obj,
            tenant_id=obj.tenant_id,
            role__is_active=True
        ).select_related('role')
        return [
            {
                'id': ur.role.id,
                'name': ur.role.name,
                'description': ur.role.description,
                'assigned_at': ur.assigned_at
            }
            for ur in user_roles
        ]
    
    def get_permissions(self, obj):
        """Get combined permissions from all assigned roles"""
        user_roles = UserRole.objects.filter(
            user=obj,
            tenant_id=obj.tenant_id,
            role__is_active=True
        ).select_related('role')
        
        # Combine permissions from all roles (union)
        combined_permissions = {}
        for ur in user_roles:
            role_perms = ur.role.permissions
            for page_name, page_perms in role_perms.items():
                if page_name not in combined_permissions:
                    combined_permissions[page_name] = {
                        'view': False,
                        'tabs': {}
                    }
                
                # Union: if any role grants access, user has access
                if page_perms.get('view', False):
                    combined_permissions[page_name]['view'] = True  # type: ignore
                
                # Combine tab permissions
                for tab_name, tab_access in page_perms.get('tabs', {}).items():
                    if tab_access:
                        combined_permissions[page_name]['tabs'][tab_name] = True  # type: ignore
        
        return combined_permissions


class CreateUserWithRoleSerializer(serializers.Serializer):
    """Serializer for creating a new user with role assignment"""
    username = serializers.CharField(max_length=100)
    email = serializers.EmailField(required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, min_length=6)
    phone = serializers.CharField(max_length=15, required=False, allow_blank=True)
    role_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
        help_text="List of role IDs to assign to the user"
    )
    
    def validate_username(self, value):
        """Username validation - duplicate usernames are allowed"""
        # No uniqueness check - usernames can be duplicated
        return value
    
    def validate_email(self, value):
        """Email is optional in Users & Roles onboarding."""
        if value and value.strip():
            return value.strip()
        return None
    
    def validate_role_ids(self, value):
        """Validate that all role IDs exist and belong to the same tenant"""
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            return value
        
        tenant_id = request.user.branch_id
        for role_id in value:
            if not Role.objects.filter(id=role_id, tenant_id=tenant_id).exists():
                raise serializers.ValidationError(
                    f"Role with ID {role_id} does not exist or does not belong to your tenant"
                )
        return value
    
    def create(self, validated_data):
        """Create user and assign roles"""
        import logging
        logger = logging.getLogger('core.rbac')
        
        role_ids = validated_data.pop('role_ids', [])
        request = self.context.get('request')
        
        tenant_id = None
        company_name = None
        
        if request and hasattr(request, 'user'):
            tenant_id = getattr(request.user, 'tenant_id', None)
            company_name = getattr(request.user, 'company_name', None)
            
        if not tenant_id:
            logger.error(f"Cannot create user: Branch ID missing from request context. User: {request.user if request else 'No Request'}")
            raise serializers.ValidationError({"detail": "Cannot determine organization (Branch ID) from your session. Please re-login."})

        try:
            # Email in User model is globally unique. To avoid blocking seat creation
            # when same email is reused, fall back to NULL (not empty string).
            requested_email = (validated_data.get('email') or '').strip()
            email_for_user = requested_email or None
            if requested_email and User.objects.filter(email=requested_email).exists():
                logger.warning(
                    "RBAC user create: email '%s' already exists. Creating user without email.",
                    requested_email
                )
                email_for_user = None

            # Create user with tenant_id from request
            user = User.objects.create_user(
                username=validated_data['username'],
                email=email_for_user,
                password=validated_data['password'],
                phone=validated_data.get('phone', ''),
                tenant_id=tenant_id,
                company_name=company_name,
                is_superuser=False,  # Regular users are not superusers
                is_staff=False
            )
            
            # Assign roles
            for role_id in role_ids:
                try:
                    role = Role.objects.get(id=role_id, tenant_id=tenant_id)
                    UserRole.objects.create(
                        user=user,
                        role=role,
                        username=user.username,
                        email=requested_email or user.email,
                        phone=user.phone,
                        tenant_id=tenant_id,
                        assigned_by=request.user
                    )
                except Role.DoesNotExist:
                    logger.warning(f"Role ID {role_id} not found for tenant {tenant_id} when assigning to user {user.username}")
                    continue
            
            return user
            
        except Exception as e:
            logger.error(f"Failed to create user {validated_data.get('username')}: {str(e)}")
            raise serializers.ValidationError({"detail": f"Failed to create user: {str(e)}"})


# class PermissionLogSerializer(serializers.ModelSerializer):
#     """Serializer for PermissionLog model"""
#     # role_name = serializers.CharField(source='role.name', read_only=True)
#     # changed_by_username = serializers.CharField(source='changed_by.username', read_only=True)
#     
#     # class Meta:
#     #     model = PermissionLog
#     #     fields = [
#     #         'id', 'role', 'role_name', 'changed_by', 'changed_by_username',
#     #         'action', 'old_permissions', 'new_permissions', 'change_summary',
#     #         'created_at', 'tenant_id'
#     #     ]
#     #     read_only_fields = ['id', 'created_at', 'tenant_id']
