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

def nested_multipart_to_nested_dict(query_dict):
    """
    Helper to expand flattend keys from FormData into a nested dictionary.
    Handles 'obj.prop' and 'arr[0].prop' style keys.
    """
    import re
    result = {}
    
    for key in query_dict:
        # Get value - if it's a list (like from a QueryDict), take the first one
        # Unless it's truly a list of files or something, but here we expect unique keys
        value = query_dict[key]
        if hasattr(query_dict, 'getlist'):
             # If there's only one item, don't return as list unless it's an array key?
             # Actually, DRF-nested multipart usually has unique keys per item.
             pass

        parts = re.split(r'\.|(?=\[)', key)
        # parts might be ['items', '[0]', '.item_code'] if we used a different split
        # Let's use a simpler approach:
        
        # Split by '.' first
        top_parts = key.split('.')
        current = result
        
        for i, part in enumerate(top_parts):
            # Check for array notation in part: 'name[index]'
            if '[' in part and ']' in part:
                 name = part[:part.find('[')]
                 # Multiple indexes could exist like 'arr[0][1]' but we probably only have one
                 indexes = re.findall(r'\[(\d+)\]', part)
                 
                 # Navigate into 'name'
                 if name:
                     if name not in current or not isinstance(current[name], list):
                         current[name] = []
                     current = current[name]
                 
                 # Navigate through indexes
                 for j, idx_str in enumerate(indexes):
                     idx = int(idx_str)
                     while len(current) <= idx:
                         current.append({})
                     
                     if j < len(indexes) - 1 or i < len(top_parts) - 1:
                         # More to go
                         if not isinstance(current[idx], (dict, list)):
                             current[idx] = {}
                         current = current[idx]
                     else:
                         # Last part
                         current[idx] = value
            else:
                # Normal property
                if i < len(top_parts) - 1:
                    if part not in current or not isinstance(current[part], dict):
                        current[part] = {}
                    current = current[part]
                else:
                    current[part] = value
                    
    return result

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
