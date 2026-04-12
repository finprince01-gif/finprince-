from rest_framework import permissions
from .models import MasterUser

class IsMaster(permissions.BasePermission):
    """
    Allows access only to Master users.
    Ensures that the authenticated user is a MasterUser and is active.
    """
    def has_permission(self, request, view):
        # We check both the user object class and the type claim in the token if available
        # However, DRF's authentication should have already populated request.user with MasterUser
        return bool(request.user and isinstance(request.user, MasterUser) and request.user.is_active)
