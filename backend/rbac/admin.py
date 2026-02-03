from django.contrib import admin
from .models import Role, UserRole


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ['name', 'tenant_id', 'is_active', 'created_at']
    list_filter = ['is_active', 'tenant_id']
    search_fields = ['name', 'description']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    list_display = ['user', 'role', 'tenant_id', 'assigned_at', 'assigned_by']
    list_filter = ['tenant_id', 'assigned_at']
    search_fields = ['user__username', 'role__name', 'username', 'email']
    readonly_fields = ['assigned_at', 'created_at', 'updated_at']
