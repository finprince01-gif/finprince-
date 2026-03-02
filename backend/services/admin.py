"""
Admin configuration for Services app.
"""

from django.contrib import admin
from .models import Service


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    """
    Admin interface for Service model.
    """
    list_display = ('service_code', 'service_name', 'service_group', 'gst_rate', 'is_active', 'created_at')
    list_filter = ('is_active', 'service_group', 'gst_rate')
    search_fields = ('service_code', 'service_name', 'service_group', 'sac_code')
    readonly_fields = ('created_at', 'updated_at')
    ordering = ('-created_at',)
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('service_code', 'service_name', 'service_group')
        }),
        ('Tax & Accounting', {
            'fields': ('sac_code', 'gst_rate', 'expense_ledger')
        }),
        ('Additional Details', {
            'fields': ('uom', 'description')
        }),
        ('Status', {
            'fields': ('is_active',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
