"""
RBAC API Views
==============
REST API endpoints for Role-Based Access Control
"""

from rest_framework import viewsets, status  # type: ignore
from rest_framework.decorators import action  # type: ignore
from rest_framework.response import Response  # type: ignore
from rest_framework.permissions import IsAuthenticated  # type: ignore
from django.contrib.auth import get_user_model  # type: ignore

from .models import Role, UserRole
from .serializers import (
    RoleSerializer,
    UserRoleSerializer,
    UserWithRolesSerializer,
    CreateUserWithRoleSerializer,
)

User = get_user_model()


class RoleViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing roles
    
    Endpoints:
    - GET /api/rbac/roles/ - List all roles
    - POST /api/rbac/roles/ - Create a new role
    - GET /api/rbac/roles/{id}/ - Get role details
    - PUT /api/rbac/roles/{id}/ - Update role
    - DELETE /api/rbac/roles/{id}/ - Delete role
    - GET /api/rbac/roles/permissions_structure/ - Get available pages and tabs
    """
    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Filter roles by tenant"""
        user = self.request.user
        if user.branch_id:
            return Role.objects.filter(tenant_id=user.branch_id).order_by('name')
        return Role.objects.none()
    
    def perform_create(self, serializer):
        """Create role"""
        serializer.save()
    
    def perform_update(self, serializer):
        """Update role"""
        serializer.save()
    
    def perform_destroy(self, instance):
        """Delete role"""
        instance.delete()
    
    @action(detail=False, methods=['get'])
    def permissions_structure(self, request):
        """
        Get the available pages and tabs for permission configuration
        
        Returns the structure of the application for building the permission tree
        """
        structure = {
            "Dashboard": {
                "tabs": []  # No tabs, just page-level access
            },
            "Masters": {
                "tabs": ["Ledgers", "Ledger Groups", "Chart of Accounts"]
            },
            "Inventory": {
                "tabs": ["Master", "Operations", "Reports"]
            },
            "Vouchers": {
                "tabs": ["Sales", "Purchase", "Payment", "Receipt", "Contra", "Journal", "Expenses"]
            },
            "Vendor Portal": {
                "tabs": [
                    "Master", "Transaction", 
                    "Category", "PO Settings", "Vendor Creation", 
                    "Purchase Orders", "Procurement", "Payment",
                    "Create PO", "Pending PO", "Executed PO",
                    "Raw Material", "Stock-in Trade", "Consumables", "Stores & Spares", "Services"
                ]
            },
            "Customer Portal": {
                "tabs": ["Customers", "Sales Orders", "Receipts"]
            },
            "Payroll": {
                "tabs": ["Employees", "Salary", "Attendance", "Reports"]
            },
            "Service": {
                "tabs": ["Services", "Bookings", "Invoices"]
            },
            "GST": {
                "tabs": ["GSTR-1", "GSTR-3B", "GST Reports"]
            },
            "Reports": {
                "tabs": ["Trial Balance", "Profit & Loss", "Balance Sheet", "GST Reports", "Ledger Reports"]
            },
            "Settings": {
                "tabs": ["Company", "Users", "Preferences", "Integrations"]
            },
            "Users & Roles": {
                "tabs": ["Users", "Roles"]
            }
        }
        return Response(structure)


class UserRoleViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing user-role assignments
    
    Endpoints:
    - GET /api/rbac/user-roles/ - List all user-role assignments
    - POST /api/rbac/user-roles/ - Assign role to user
    - DELETE /api/rbac/user-roles/{id}/ - Remove role from user
    """
    serializer_class = UserRoleSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Filter user roles by tenant"""
        user = self.request.user
        if user.branch_id:
            return UserRole.objects.filter(
                tenant_id=user.branch_id
            ).select_related('user', 'role', 'assigned_by').order_by('-assigned_at')
        return UserRole.objects.none()


class UserManagementViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing users with RBAC
    
    Endpoints:
    - GET /api/rbac/users/ - List all users with their roles
    - POST /api/rbac/users/ - Create a new user with role assignment
    - GET /api/rbac/users/{id}/ - Get user details with roles
    - PUT /api/rbac/users/{id}/ - Update user
    - DELETE /api/rbac/users/{id}/ - Delete user (permanently remove from database)
    - GET /api/rbac/users/me/permissions/ - Get current user's permissions
    """
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Filter users by tenant"""
        user = self.request.user
        if user.branch_id:
            # Filter by tenant and exclude inactive users
            return User.objects.filter(
                tenant_id=user.branch_id,
                is_superuser=False
            ).order_by('username')
        return User.objects.none()

    def get_serializer_class(self):
        """Use different serializers for different actions"""
        if self.action == 'create':
            return CreateUserWithRoleSerializer
        return UserWithRolesSerializer

    def perform_destroy(self, instance):
        """Delete user from database"""
        instance.delete()
    
    @action(detail=False, methods=['get'])
    def me(self, request):
        """Get current user's details with roles and permissions"""
        # Handle both standard Users and Synthetic RBAC Users
        serializer = UserWithRolesSerializer(request.user)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='all-users')
    def all_users(self, request):
        """Get all distinct users from UserRole table"""
        user = request.user
        if user.branch_id:
            all_users_info = UserRole.objects.filter(
                tenant_id=user.branch_id
            ).values('username', 'phone').distinct()
            
            return Response([{
                'id': u['username'],
                'username': u['username'],
                'phone': u['phone']
            } for u in all_users_info])
        return Response([])
    
    @action(detail=False, methods=['get'], url_path='me/permissions')
    def my_permissions(self, request):
        """Get current user's combined permissions"""
        user = request.user
        
        # Superusers have all permissions
        if user.is_superuser:
            return Response({
                "is_superuser": True,
                "permissions": "all"
            })
        
        # Get user's roles and combine permissions
        user_roles = UserRole.objects.filter(
            user=user,
            tenant_id=user.branch_id,
            role__is_active=True
        ).select_related('role')
        
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
                    combined_permissions[page_name]['view'] = True
                
                # Combine tab permissions
                for tab_name, tab_access in page_perms.get('tabs', {}).items():
                    if tab_access:
                        combined_permissions[page_name]['tabs'][tab_name] = True
        
        return Response({
            "is_superuser": False,
            "permissions": combined_permissions
        })
    
    @action(detail=True, methods=['post'])
    def assign_roles(self, request, pk=None):
        """Assign multiple roles to a user"""
        user = self.get_object()
        role_ids = request.data.get('role_ids', [])
        
        # Validate role IDs
        tenant_id = request.user.branch_id
        roles = Role.objects.filter(id__in=role_ids, tenant_id=tenant_id)
        
        if len(roles) != len(role_ids):
            return Response(
                {"error": "One or more role IDs are invalid"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Remove existing roles
        UserRole.objects.filter(user=user, tenant_id=tenant_id).delete()
        
        # Assign new roles
        for role in roles:
            UserRole.objects.create(
                user=user,
                role=role,
                username=user.username,
                phone=user.phone,
                tenant_id=tenant_id,
                assigned_by=request.user
            )
        
        serializer = UserWithRolesSerializer(user)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def remove_role(self, request, pk=None):
        """Remove a specific role from a user"""
        user = self.get_object()
        role_id = request.data.get('role_id')
        
        if not role_id:
            return Response(
                {"error": "role_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Remove the role assignment
        deleted_count = UserRole.objects.filter(
            user=user,
            role_id=role_id,
            tenant_id=request.user.branch_id
        ).delete()[0]
        
        if deleted_count == 0:
            return Response(
                {"error": "Role assignment not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        serializer = UserWithRolesSerializer(user)
        return Response(serializer.data)
