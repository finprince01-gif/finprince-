"""
Role-Based Access Control (RBAC) Models
========================================
This module defines the database models for implementing granular RBAC
with page-level and tab-level permissions.
"""

from django.db import models
from django.contrib.auth import get_user_model
from core.models import BaseModel

User = get_user_model()


class Role(BaseModel):
    """
    Role Model - Defines user roles with hierarchical permissions
    
    Examples: Admin, Accountant, Sales Manager, Inventory Manager
    
    Permissions are stored as JSON with the following structure:
    {
        "Inventory": {
            "view": true,
            "tabs": {
                "Master": true,
                "Operations": false,
                "Reports": true
            }
        },
        "Vouchers": {
            "view": true,
            "tabs": {
                "Sales": true,
                "Purchase": true,
                "Payment": false,
                "Receipt": false
            }
        }
    }
    """
    name = models.CharField(max_length=100, help_text="Role name (e.g., Accountant)")
    description = models.TextField(blank=True, null=True, help_text="Role description")
    permissions = models.JSONField(
        default=dict,
        help_text="Hierarchical permissions structure (page -> tabs)"
    )
    is_active = models.BooleanField(default=True, help_text="Whether this role is active")
    
    class Meta:
        db_table = 'rbac_roles'
        unique_together = [['tenant_id', 'name']]  # Unique role names per tenant
        ordering = ['name']
    
    def __str__(self):
        return f"{self.name} ({self.tenant_id})"
    
    def has_page_access(self, page_name: str) -> bool:
        """Check if role has access to a specific page"""
        return self.permissions.get(page_name, {}).get('view', False)
    
    def has_tab_access(self, page_name: str, tab_name: str) -> bool:
        """Check if role has access to a specific tab within a page"""
        page_perms = self.permissions.get(page_name, {})
        if not page_perms.get('view', False):
            return False
        return page_perms.get('tabs', {}).get(tab_name, False)
    
    def get_accessible_tabs(self, page_name: str) -> list:
        """Get list of accessible tab names for a specific page"""
        page_perms = self.permissions.get(page_name, {})
        if not page_perms.get('view', False):
            return []
        tabs = page_perms.get('tabs', {})
        return [tab_name for tab_name, has_access in tabs.items() if has_access]


class UserRole(BaseModel):
    """
    UserRole Model - Many-to-Many relationship between Users and Roles
    
    Allows users to have multiple roles (e.g., both Accountant and Sales Manager)
    Permissions are combined (union) from all assigned roles.
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='user_roles',
        help_text="User assigned to this role"
    )
    role = models.ForeignKey(
        Role,
        on_delete=models.CASCADE,
        related_name='role_users',
        help_text="Role assigned to the user"
    )
    # Denormalized fields for quick access/snapshot
    username = models.CharField(max_length=150, null=True, blank=True, help_text="Snapshot of username")
    email = models.CharField(max_length=254, null=True, blank=True, help_text="Snapshot of email")
    phone = models.CharField(max_length=15, null=True, blank=True, help_text="Snapshot of phone")
    
    assigned_at = models.DateTimeField(auto_now_add=True, help_text="When role was assigned")
    assigned_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='roles_assigned_by_user',
        help_text="Admin who assigned this role"
    )
    
    class Meta:
        db_table = 'rbac_user_roles'
        unique_together = [['user', 'role', 'tenant_id']]  # Prevent duplicate assignments
        ordering = ['-assigned_at']
    
    def __str__(self):
        return f"{self.user.username} -> {self.role.name}"
