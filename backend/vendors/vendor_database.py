"""
Database operations for Vendor management.
This module handles all database interactions for vendors.
"""

from django.db import transaction
from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Q
from .models import Vendor
from inventory.models import InventoryMasterCategory


class VendorDatabase:
    """Database operations for Vendor management"""
    
    @staticmethod
    def generate_vendor_code(tenant_id, prefix="VEN"):
        """
        Generate a unique vendor code.
        
        Args:
            tenant_id: Tenant identifier
            prefix: Prefix for vendor code (default: "VEN")
            
        Returns:
            Unique vendor code string
        """
        # Get the last vendor code for this tenant
        last_vendor = Vendor.objects.filter(
            tenant_id=tenant_id,
            vendor_code__startswith=prefix
        ).order_by('-vendor_code').first()
        
        if last_vendor:
            # Extract number from last code and increment
            try:
                last_number = int(last_vendor.vendor_code.replace(prefix, ''))
                new_number = last_number + 1
            except ValueError:
                new_number = 1
        else:
            new_number = 1
        
        return f"{prefix}{new_number:05d}"  # e.g., VEN00001
    
    @staticmethod
    def create_vendor(tenant_id, vendor_data, created_by=None):
        """
        Create a new vendor.
        
        Args:
            tenant_id: Tenant identifier
            vendor_data: Dictionary containing vendor data
            created_by: Username of creator
            
        Returns:
            Created Vendor instance
        """
        with transaction.atomic():
            # Generate vendor code if not provided
            if 'vendor_code' not in vendor_data or not vendor_data['vendor_code']:
                vendor_data['vendor_code'] = VendorDatabase.generate_vendor_code(tenant_id)
            
            # Handle category
            category = None
            if 'category_id' in vendor_data and vendor_data['category_id']:
                try:
                    category = InventoryMasterCategory.objects.get(id=vendor_data['category_id'])
                except ObjectDoesNotExist:
                    raise ValueError(f"Category with id {vendor_data['category_id']} does not exist")
            
            # Remove category_id from data and add category object
            vendor_data.pop('category_id', None)
            
            vendor = Vendor.objects.create(
                tenant_id=tenant_id,
                category=category,
                created_by=created_by,
                **vendor_data
            )
            
            return vendor
    
    @staticmethod
    def get_vendor_by_id(vendor_id):
        """
        Retrieve a vendor by ID.
        
        Args:
            vendor_id: ID of the vendor
            
        Returns:
            Vendor instance or None
        """
        try:
            return Vendor.objects.select_related('category').get(id=vendor_id)
        except ObjectDoesNotExist:
            return None
    
    @staticmethod
    def get_vendor_by_code(tenant_id, vendor_code):
        """
        Retrieve a vendor by vendor code.
        
        Args:
            tenant_id: Tenant identifier
            vendor_code: Vendor code
            
        Returns:
            Vendor instance or None
        """
        try:
            return Vendor.objects.select_related('category').get(
                tenant_id=tenant_id,
                vendor_code=vendor_code
            )
        except ObjectDoesNotExist:
            return None
    
    @staticmethod
    def get_vendors_by_tenant(tenant_id, is_active=True, filters=None):
        """
        Retrieve all vendors for a tenant.
        
        Args:
            tenant_id: Tenant identifier
            is_active: Filter by active status (default True, None for all)
            filters: Additional filters dictionary
            
        Returns:
            QuerySet of Vendors
        """
        queryset = Vendor.objects.filter(tenant_id=tenant_id)
        
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)
        
        # Apply additional filters
        if filters:
            if 'vendor_type' in filters:
                queryset = queryset.filter(vendor_type=filters['vendor_type'])
            if 'category_id' in filters:
                queryset = queryset.filter(category_id=filters['category_id'])
            if 'is_verified' in filters:
                queryset = queryset.filter(is_verified=filters['is_verified'])
        
        return queryset.select_related('category').order_by('vendor_name')
    
    @staticmethod
    def search_vendors(tenant_id, search_term):
        """
        Search vendors by name, code, email, or phone.
        
        Args:
            tenant_id: Tenant identifier
            search_term: Search string
            
        Returns:
            QuerySet of matching Vendors
        """
        return Vendor.objects.filter(
            Q(tenant_id=tenant_id) &
            (
                Q(vendor_name__icontains=search_term) |
                Q(vendor_code__icontains=search_term) |
                Q(email__icontains=search_term) |
                Q(phone__icontains=search_term) |
                Q(contact_person__icontains=search_term)
            )
        ).select_related('category')
    
    @staticmethod
    def update_vendor(vendor_id, update_data, updated_by=None):
        """
        Update a vendor.
        
        Args:
            vendor_id: ID of the vendor to update
            update_data: Dictionary of fields to update
            updated_by: Username of updater
            
        Returns:
            Updated Vendor instance or None
        """
        try:
            with transaction.atomic():
                vendor = Vendor.objects.select_for_update().get(id=vendor_id)
                
                # Handle category update
                if 'category_id' in update_data:
                    category_id = update_data.pop('category_id')
                    if category_id:
                        category = InventoryMasterCategory.objects.get(id=category_id)
                        vendor.category = category
                    else:
                        vendor.category = None
                
                # Update other fields
                for field, value in update_data.items():
                    if hasattr(vendor, field) and field not in ['id', 'tenant_id', 'created_at', 'created_by']:
                        setattr(vendor, field, value)
                
                if updated_by:
                    vendor.updated_by = updated_by
                
                vendor.save()
                return vendor
        except ObjectDoesNotExist:
            return None
    
    @staticmethod
    def delete_vendor(vendor_id, soft_delete=True):
        """
        Delete a vendor (soft or hard delete).
        
        Args:
            vendor_id: ID of the vendor to delete
            soft_delete: If True, set is_active to False; if False, delete from DB
            
        Returns:
            True if successful, False otherwise
        """
        try:
            vendor = Vendor.objects.get(id=vendor_id)
            if soft_delete:
                vendor.is_active = False
                vendor.save()
            else:
                vendor.delete()
            return True
        except ObjectDoesNotExist:
            return False
    
    @staticmethod
    def update_vendor_balance(vendor_id, amount, operation='add'):
        """
        Update vendor's current balance.
        
        Args:
            vendor_id: ID of the vendor
            amount: Amount to add or subtract
            operation: 'add' or 'subtract'
            
        Returns:
            Updated Vendor instance or None
        """
        try:
            with transaction.atomic():
                vendor = Vendor.objects.select_for_update().get(id=vendor_id)
                
                if operation == 'add':
                    vendor.current_balance += amount
                elif operation == 'subtract':
                    vendor.current_balance -= amount
                else:
                    raise ValueError("Operation must be 'add' or 'subtract'")
                
                vendor.save()
                return vendor
        except ObjectDoesNotExist:
            return None
    
    @staticmethod
    def get_vendors_by_category(tenant_id, category_id):
        """
        Retrieve vendors filtered by category.
        
        Args:
            tenant_id: Tenant identifier
            category_id: Category ID to filter by
            
        Returns:
            QuerySet of Vendors
        """
        return Vendor.objects.filter(
            tenant_id=tenant_id,
            category_id=category_id,
            is_active=True
        ).select_related('category')
    
    @staticmethod
    def get_vendors_with_outstanding_balance(tenant_id, min_balance=0):
        """
        Get vendors with outstanding balance greater than specified amount.
        
        Args:
            tenant_id: Tenant identifier
            min_balance: Minimum balance threshold (default 0)
            
        Returns:
            QuerySet of Vendors
        """
        return Vendor.objects.filter(
            tenant_id=tenant_id,
            current_balance__gt=min_balance,
            is_active=True
        ).select_related('category').order_by('-current_balance')
    
    @staticmethod
    def check_duplicate_vendor_code(tenant_id, vendor_code, exclude_id=None):
        """
        Check if a vendor code already exists for a tenant.
        
        Args:
            tenant_id: Tenant identifier
            vendor_code: Vendor code to check
            exclude_id: Optional ID to exclude from check (for updates)
            
        Returns:
            True if duplicate exists, False otherwise
        """
        queryset = Vendor.objects.filter(tenant_id=tenant_id, vendor_code=vendor_code)
        if exclude_id:
            queryset = queryset.exclude(id=exclude_id)
        return queryset.exists()
    
    @staticmethod
    def check_duplicate_email(tenant_id, email, exclude_id=None):
        """
        Check if an email already exists for a tenant.
        
        Args:
            tenant_id: Tenant identifier
            email: Email to check
            exclude_id: Optional ID to exclude from check (for updates)
            
        Returns:
            True if duplicate exists, False otherwise
        """
        if not email:
            return False
        
        queryset = Vendor.objects.filter(
            tenant_id=tenant_id,
            email=email,
            is_active=True
        )
        if exclude_id:
            queryset = queryset.exclude(id=exclude_id)
        return queryset.exists()
    
    @staticmethod
    def get_vendor_statistics(tenant_id):
        """
        Get vendor statistics for a tenant.
        
        Args:
            tenant_id: Tenant identifier
            
        Returns:
            Dictionary with statistics
        """
        from django.db.models import Count, Sum, Avg
        
        vendors = Vendor.objects.filter(tenant_id=tenant_id)
        
        stats = {
            'total_vendors': vendors.count(),
            'active_vendors': vendors.filter(is_active=True).count(),
            'verified_vendors': vendors.filter(is_verified=True).count(),
            'total_outstanding': vendors.aggregate(Sum('current_balance'))['current_balance__sum'] or 0,
            'vendors_by_type': dict(vendors.values('vendor_type').annotate(count=Count('id')).values_list('vendor_type', 'count')),
        }
        
        return stats
    
    @staticmethod
    def bulk_create_vendors(tenant_id, vendors_data, created_by=None):
        """
        Create multiple vendors in bulk.
        
        Args:
            tenant_id: Tenant identifier
            vendors_data: List of dictionaries containing vendor data
            created_by: Username of creator
            
        Returns:
            List of created Vendor instances
        """
        with transaction.atomic():
            created_vendors = []
            for vendor_data in vendors_data:
                vendor = VendorDatabase.create_vendor(tenant_id, vendor_data, created_by)
                created_vendors.append(vendor)
            return created_vendors
