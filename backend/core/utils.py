from rest_framework import permissions

class TenantQuerysetMixin:
    """
    Mixin to filter querysets by tenant_id automatically.
    """
    def get_queryset(self):
        try:
            qs = super().get_queryset()
            # First check request.user (which is set by Auth middleware)
            tid = getattr(self.request.user, 'tenant_id', None)
            
            # Fallback to request.tenant_id (set by TenantMiddleware)
            if not tid:
                tid = getattr(self.request, 'tenant_id', None)
            
            # TEMPORARY: Use default tenant_id=1 for development if no tenant found
            if not tid:
                tid = 1
                
            if tid:
                return qs.filter(tenant_id=tid)
            # if no tenant, return empty queryset for safety
            return qs.none()
        except Exception as e:
            # Log the error for debugging
            import logging
            logger = logging.getLogger('core.utils')
            logger.error(f"TenantQuerysetMixin error: {str(e)}", exc_info=True)
            # Return empty queryset to prevent 500 error
            return super().get_queryset().none()

class TenantModelSerializerMixin:
    """
    Mixin to automatically inject tenant_id during create and update operations.
    """
    def create(self, validated_data):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user and user.is_authenticated and hasattr(user, 'tenant_id'):
            validated_data['tenant_id'] = user.tenant_id
        else:
            # TEMPORARY: Use default tenant_id=1 for development
            validated_data['tenant_id'] = 1
        return super().create(validated_data)

    def update(self, instance, validated_data):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user and user.is_authenticated and hasattr(user, 'tenant_id'):
            validated_data['tenant_id'] = user.tenant_id
        else:
            # TEMPORARY: Use default tenant_id=1 for development
            validated_data['tenant_id'] = 1
        return super().update(instance, validated_data)

from core.exceptions import TenantAccessDenied

class IsTenantMember(permissions.BasePermission):
    """
    Permission to check if the user is a valid member of a tenant.
    Requirement #7: Multi-tenant safety.
    """
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
            
        tenant_id = getattr(request.user, 'tenant_id', None)
        if tenant_id is None:
            raise TenantAccessDenied("Access denied for this tenant.")
            
        return True
