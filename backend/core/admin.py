from django.contrib import admin
from .models import PasswordResetOTP, User, Branch

@admin.register(PasswordResetOTP)
class PasswordResetOTPAdmin(admin.ModelAdmin):
    list_display = ('user', 'otp_hash', 'expires_at', 'attempts', 'used', 'created_at')
    list_filter = ('used', 'created_at')
    search_fields = ('user__email', 'user__username')

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('username', 'email', 'tenant_id', 'role', 'is_active', 'is_staff')
    list_filter = ('role', 'is_active', 'is_staff')
    search_fields = ('username', 'email')



@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'gstin', 'pan_number', 'created_at')
    list_filter = ('is_active', 'created_at')
    search_fields = ('id', 'name', 'gstin', 'pan_number')
