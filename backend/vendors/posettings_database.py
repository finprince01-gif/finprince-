"""
Database operations for Vendor Master PO Settings.
This module handles all database interactions for PO settings.
"""

from django.db import transaction
from django.core.exceptions import ObjectDoesNotExist
from .models import VendorMasterPOSettings, VendorMasterCategory


class POSettingsDatabase:
    """Database operations for Vendor Master PO Settings"""
    
    @staticmethod
    def create_po_setting(tenant_id, name, category_id=None, prefix=None, 
                         suffix=None, digits=4, auto_year=False):
        """
        Create a new PO setting entry.
        
        Args:
            tenant_id: Tenant identifier
            name: Name of the PO series
            category_id: Optional category ID
            prefix: Optional prefix for PO number
            suffix: Optional suffix for PO number
            digits: Number of digits (default 4)
            auto_year: Whether to auto-include year (default False)
            
        Returns:
            Created VendorMasterPOSettings instance
        """
        with transaction.atomic():
            category = None
            if category_id:
                try:
                    category = VendorMasterCategory.objects.get(id=category_id)
                except ObjectDoesNotExist:
                    raise ValueError(f"Category with id {category_id} does not exist")
            
            po_setting = VendorMasterPOSettings.objects.create(
                tenant_id=tenant_id,
                name=name,
                category=category,
                prefix=prefix,
                suffix=suffix,
                digits=digits,
                auto_year=auto_year,
                current_number=1
            )
            
            return po_setting
    
    @staticmethod
    def get_po_setting_by_id(po_setting_id):
        """
        Retrieve a PO setting by ID.
        
        Args:
            po_setting_id: ID of the PO setting
            
        Returns:
            VendorMasterPOSettings instance or None
        """
        try:
            return VendorMasterPOSettings.objects.get(id=po_setting_id)
        except ObjectDoesNotExist:
            return None
    
    @staticmethod
    def get_po_settings_by_tenant(tenant_id, is_active=True):
        """
        Retrieve all PO settings for a tenant.
        
        Args:
            tenant_id: Tenant identifier
            is_active: Filter by active status (default True)
            
        Returns:
            QuerySet of VendorMasterPOSettings
        """
        queryset = VendorMasterPOSettings.objects.filter(tenant_id=tenant_id)
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)
        return queryset.select_related('category').order_by('-created_at')
    
    @staticmethod
    def update_po_setting(po_setting_id, **kwargs):
        """
        Update a PO setting.
        
        Args:
            po_setting_id: ID of the PO setting to update
            **kwargs: Fields to update
            
        Returns:
            Updated VendorMasterPOSettings instance or None
        """
        try:
            with transaction.atomic():
                po_setting = VendorMasterPOSettings.objects.get(id=po_setting_id)
                
                # Handle category update
                if 'category_id' in kwargs:
                    category_id = kwargs.pop('category_id')
                    if category_id:
                        category = VendorMasterCategory.objects.get(id=category_id)
                        po_setting.category = category
                    else:
                        po_setting.category = None
                
                # Update other fields
                for field, value in kwargs.items():
                    if hasattr(po_setting, field):
                        setattr(po_setting, field, value)
                
                po_setting.save()
                return po_setting
        except ObjectDoesNotExist:
            return None
    
    @staticmethod
    def delete_po_setting(po_setting_id, soft_delete=True):
        """
        Delete a PO setting (soft or hard delete).
        
        Args:
            po_setting_id: ID of the PO setting to delete
            soft_delete: If True, set is_active to False; if False, delete from DB
            
        Returns:
            True if successful, False otherwise
        """
        try:
            po_setting = VendorMasterPOSettings.objects.get(id=po_setting_id)
            if soft_delete:
                po_setting.is_active = False
                po_setting.save()
            else:
                po_setting.delete()
            return True
        except ObjectDoesNotExist:
            return False
    
    @staticmethod
    def increment_po_number(po_setting_id):
        """
        Increment the current PO number for a setting.
        
        Args:
            po_setting_id: ID of the PO setting
            
        Returns:
            The generated PO number string
        """
        with transaction.atomic():
            po_setting = VendorMasterPOSettings.objects.select_for_update().get(
                id=po_setting_id
            )
            po_number = po_setting.generate_po_number()
            po_setting.current_number += 1
            po_setting.save()
            return po_number
    
    @staticmethod
    def get_po_settings_by_category(tenant_id, category_id):
        """
        Retrieve PO settings filtered by category.
        
        Args:
            tenant_id: Tenant identifier
            category_id: Category ID to filter by
            
        Returns:
            QuerySet of VendorMasterPOSettings
        """
        return VendorMasterPOSettings.objects.filter(
            tenant_id=tenant_id,
            category_id=category_id,
            is_active=True
        ).select_related('category')
    
    @staticmethod
    def check_duplicate_name(tenant_id, name, exclude_id=None):
        """
        Check if a PO setting name already exists for a tenant.
        
        Args:
            tenant_id: Tenant identifier
            name: Name to check
            exclude_id: Optional ID to exclude from check (for updates)
            
        Returns:
            True if duplicate exists, False otherwise
        """
        queryset = VendorMasterPOSettings.objects.filter(
            tenant_id=tenant_id,
            name=name,
            is_active=True
        )
        if exclude_id:
            queryset = queryset.exclude(id=exclude_id)
        return queryset.exists()
