"""
Service models for the Services Management module.
Handles service listings with SAC codes, GST rates, and service groups.
"""

from django.db import models
from django.contrib.auth import get_user_model
from core.models import BaseModel

User = get_user_model()


class ServiceGroup(BaseModel):
    """
    Service Group Model
    Stores the service category hierarchy (Category -> Group -> Subgroup)
    Similar to InventoryMasterCategory but for Services.
    """
    category = models.CharField(
        max_length=100, 
        help_text="Top-level category"
    )
    group = models.CharField(
        max_length=100,
        default='',
        blank=True,
        help_text="Group under category (optional)"
    )
    subgroup = models.CharField(
        max_length=100,
        default='',
        blank=True,
        help_text="Subgroup under group (optional)"
    )
    is_active = models.BooleanField(default=True)
    
    class Meta:

        db_table = 'service_group'
        unique_together = ('tenant_id', 'category', 'group', 'subgroup')
        ordering = ['category', 'group', 'subgroup']
        indexes = [
            models.Index(fields=['tenant_id', 'is_active']),
            models.Index(fields=['category']),
        ]
    
    def __str__(self):
        parts = [self.category]
        if self.group:
            parts.append(self.group)
        if self.subgroup:
            parts.append(self.subgroup)
        return " > ".join(parts)
    
    @property
    def full_path(self):
        return str(self)


class Service(models.Model):
    """
    Service model storing service details including SAC code, GST rate, and UOM.
    Aligned with service_list table structure.
    """
    
    # Tenant field for multi-tenancy
    tenant_id = models.CharField(
        max_length=36,
        db_index=True,
        help_text="Tenant ID for multi-tenancy"
    )
    
    # Required fields
    service_code = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        help_text="Unique service code identifier"
    )
    service_name = models.CharField(
        max_length=255,
        help_text="Service name"
    )
    service_group = models.CharField(
        max_length=100,
        db_index=True,
        help_text="Service group/category"
    )
    sac_code = models.CharField(
        max_length=20,
        help_text="SAC (Services Accounting Code)"
    )
    gst_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=18,
        help_text="GST rate percentage"
    )
    expense_ledger = models.CharField(
        max_length=255,
        help_text="Expense ledger account"
    )
    
    # Optional fields
    uom = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="Unit of Measurement"
    )
    description = models.TextField(
        blank=True,
        null=True,
        help_text="Service description"
    )
    
    # Status and audit fields
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Active status of the service"
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        help_text="Record creation timestamp"
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="Record last update timestamp"
    )
    
    class Meta:

        db_table = 'service_list'
        verbose_name = 'Service'
        verbose_name_plural = 'Services'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['service_code']),
            models.Index(fields=['service_group']),
            models.Index(fields=['is_active']),
            models.Index(fields=['created_at']),
        ]
    
    def __str__(self):
        return f"{self.service_code} - {self.service_name}"
    
    def save(self, *args, **kwargs):
        """Override save to ensure service_code is always uppercase"""
        if self.service_code:
            self.service_code = self.service_code.upper()
        super().save(*args, **kwargs)
