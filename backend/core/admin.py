from django.contrib import admin
from .models import PasswordResetOTP, User, Tenant

@admin.register(PasswordResetOTP)
class PasswordResetOTPAdmin(admin.ModelAdmin):
    list_display = ('user', 'otp_hash', 'expires_at', 'attempts', 'used', 'created_at')
    list_filter = ('used', 'created_at')
    search_fields = ('user__email', 'user__username')

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('username', 'email', 'tenant_id', 'is_active', 'is_staff')
    search_fields = ('username', 'email')

@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'created_at')
    search_fields = ('id', 'name')
