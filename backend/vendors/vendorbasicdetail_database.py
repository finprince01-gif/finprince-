"""
Database operations for Vendor Master Basic Details.
This module handles all database interactions for vendor basic details.
"""

from django.db import transaction
from django.core.exceptions import ObjectDoesNotExist
from .models import VendorMasterBasicDetail


class VendorBasicDetailDatabase:
    """Database operations for Vendor Master Basic Details"""
    
    @staticmethod
    def generate_vendor_code(tenant_id):
        """
        Generate the next vendor code for a tenant.
        
        Args:
            tenant_id: Tenant identifier
            
        Returns:
            Generated vendor code (e.g., VEN0001)
        """
        last_vendor = VendorMasterBasicDetail.objects.filter(
            tenant_id=tenant_id
        ).exclude(vendor_code__isnull=True).exclude(vendor_code='').order_by('-id').first()
        
        if last_vendor and last_vendor.vendor_code:
            try:
                # Strip prefix and any separators to get numeric portion
                code_num = last_vendor.vendor_code.replace('VEN-', '').replace('VEN', '')
                last_number = int(code_num)
                new_number = last_number + 1
            except (ValueError, AttributeError):
                new_number = 1
        else:
            new_number = 1
        
        return f"VEN{new_number:04d}"
    
    @staticmethod
    def create_vendor_basic_detail(tenant_id, vendor_data, created_by=None):
        """
        Create a new vendor basic detail entry and auto-create a MasterLedger.

        When a vendor is created, a corresponding ledger entry under
        'Sundry Creditors' is automatically created so the vendor appears
        in the Pay To / Receive From dropdowns in Payment & Receipt vouchers.

        Args:
            tenant_id: Tenant identifier
            vendor_data: Dictionary containing vendor data
            created_by: Username of creator

        Returns:
            Created VendorMasterBasicDetail instance
        """
        import logging
        logger = logging.getLogger(__name__)

        with transaction.atomic():
            # Auto-generate vendor code if not provided
            if not vendor_data.get('vendor_code'):
                vendor_data['vendor_code'] = VendorBasicDetailDatabase.generate_vendor_code(tenant_id)

            vendor = VendorMasterBasicDetail.objects.create(
                tenant_id=tenant_id,
                vendor_code=vendor_data.get('vendor_code'),
                vendor_name=vendor_data.get('vendor_name'),
                pan_no=vendor_data.get('pan_no'),
                contact_person=vendor_data.get('contact_person'),
                email=vendor_data.get('email'),
                contact_no=vendor_data.get('contact_no'),
                vendor_category=vendor_data.get('vendor_category'),
                billing_currency=vendor_data.get('billing_currency'),
                is_also_customer=vendor_data.get('is_also_customer', False),
                tcs_applicable=vendor_data.get('tcs_applicable', False),
                created_by=created_by
            )

            # Auto-create a MasterLedger so this vendor shows in voucher dropdowns.
            try:
                from accounting.models import MasterLedger
                ledger_code = f"VEN-LED-{vendor.id}"
                ledger = MasterLedger.objects.create(
                    tenant_id=tenant_id,
                    name=vendor_data.get('vendor_name'),
                    group='Sundry Creditors',
                    category='Liability',
                    code=ledger_code,
                )
                vendor.ledger_id = ledger.id
                vendor.save(update_fields=['ledger_id'])
                logger.info(
                    f"Auto-created ledger {ledger.id} for vendor "
                    f"{vendor.id} ({vendor.vendor_name})"
                )
            except Exception as e:
                logger.warning(
                    f"Could not auto-create ledger for vendor {vendor.id}: {e}"
                )

            return vendor
    
    @staticmethod
    def get_vendor_basic_detail_by_id(vendor_id):
        """
        Retrieve a vendor basic detail by ID.
        
        Args:
            vendor_id: ID of the vendor
            
        Returns:
            VendorMasterBasicDetail instance or None
        """
        try:
            return VendorMasterBasicDetail.objects.get(id=vendor_id)
        except ObjectDoesNotExist:
            return None
    
    @staticmethod
    def get_vendor_basic_detail_by_code(tenant_id, vendor_code):
        """
        Retrieve a vendor basic detail by vendor code.
        
        Args:
            tenant_id: Tenant identifier
            vendor_code: Vendor code
            
        Returns:
            VendorMasterBasicDetail instance or None
        """
        try:
            return VendorMasterBasicDetail.objects.get(
                tenant_id=tenant_id,
                vendor_code=vendor_code
            )
        except ObjectDoesNotExist:
            return None
    
    @staticmethod
    def get_vendors_basic_detail_by_tenant(tenant_id, is_active=True):
        """
        Retrieve all vendor basic details for a tenant.
        
        Args:
            tenant_id: Tenant identifier
            is_active: Filter by active status (default True)
            
        Returns:
            QuerySet of VendorMasterBasicDetail
        """
        queryset = VendorMasterBasicDetail.objects.filter(tenant_id=tenant_id)
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)
        return queryset.order_by('-created_at')
    
    @staticmethod
    def search_vendors_basic_detail(tenant_id, search_term):
        """
        Search vendors by name, code, email, or contact number.
        
        Args:
            tenant_id: Tenant identifier
            search_term: Search term
            
        Returns:
            QuerySet of matching VendorMasterBasicDetail
        """
        from django.db.models import Q
        
        return VendorMasterBasicDetail.objects.filter(
            Q(tenant_id=tenant_id) &
            (
                Q(vendor_name__icontains=search_term) |
                Q(vendor_code__icontains=search_term) |
                Q(email__icontains=search_term) |
                Q(contact_no__icontains=search_term) |
                Q(pan_no__icontains=search_term)
            )
        ).order_by('vendor_name')
    
    @staticmethod
    def update_vendor_basic_detail(vendor_id, update_data, updated_by=None):
        """
        Update a vendor basic detail.
        
        Args:
            vendor_id: ID of the vendor to update
            update_data: Dictionary of fields to update
            updated_by: Username of updater
            
        Returns:
            Updated VendorMasterBasicDetail instance or None
        """
        try:
            with transaction.atomic():
                vendor = VendorMasterBasicDetail.objects.get(id=vendor_id)
                
                # Update fields
                for field, value in update_data.items():
                    if hasattr(vendor, field):
                        setattr(vendor, field, value)
                
                if updated_by:
                    vendor.updated_by = updated_by
                
                vendor.save()
                return vendor
        except ObjectDoesNotExist:
            return None
    
    @staticmethod
    def delete_vendor_basic_detail(vendor_id, soft_delete=True):
        """
        Delete a vendor basic detail (soft or hard delete).
        
        Args:
            vendor_id: ID of the vendor to delete
            soft_delete: If True, set is_active to False; if False, delete from DB
            
        Returns:
            True if successful, False otherwise
        """
        try:
            vendor = VendorMasterBasicDetail.objects.get(id=vendor_id)
            if soft_delete:
                vendor.is_active = False
                vendor.save()
            else:
                vendor.delete()
            return True
        except ObjectDoesNotExist:
            return False
    
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
        queryset = VendorMasterBasicDetail.objects.filter(
            tenant_id=tenant_id,
            vendor_code=vendor_code
        )
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
        queryset = VendorMasterBasicDetail.objects.filter(
            tenant_id=tenant_id,
            email=email
        )
        if exclude_id:
            queryset = queryset.exclude(id=exclude_id)
        return queryset.exists()
    
    @staticmethod
    def check_duplicate_pan(tenant_id, pan_no, exclude_id=None):
        """
        Check if a PAN number already exists for a tenant.
        
        Args:
            tenant_id: Tenant identifier
            pan_no: PAN number to check
            exclude_id: Optional ID to exclude from check (for updates)
            
        Returns:
            True if duplicate exists, False otherwise
        """
        if not pan_no:
            return False
            
        queryset = VendorMasterBasicDetail.objects.filter(
            tenant_id=tenant_id,
            pan_no=pan_no
        )
        if exclude_id:
            queryset = queryset.exclude(id=exclude_id)
        return queryset.exists()
    
    @staticmethod
    def get_vendor_statistics(tenant_id):
        """
        Get statistics for vendors in a tenant.
        
        Args:
            tenant_id: Tenant identifier
            
        Returns:
            Dictionary with statistics
        """
        total_vendors = VendorMasterBasicDetail.objects.filter(tenant_id=tenant_id).count()
        active_vendors = VendorMasterBasicDetail.objects.filter(tenant_id=tenant_id, is_active=True).count()
        also_customers = VendorMasterBasicDetail.objects.filter(tenant_id=tenant_id, is_also_customer=True).count()
        
        return {
            'total_vendors': total_vendors,
            'active_vendors': active_vendors,
            'inactive_vendors': total_vendors - active_vendors,
            'also_customers': also_customers
        }
    
    @staticmethod
    def bulk_create_vendors_basic_detail(tenant_id, vendors_data, created_by=None):
        """
        Bulk create vendor basic details.
        
        Args:
            tenant_id: Tenant identifier
            vendors_data: List of dictionaries containing vendor data
            created_by: Username of creator
            
        Returns:
            List of created VendorMasterBasicDetail instances
        """
        vendors = []
        with transaction.atomic():
            for vendor_data in vendors_data:
                if not vendor_data.get('vendor_code'):
                    vendor_data['vendor_code'] = VendorBasicDetailDatabase.generate_vendor_code(tenant_id)
                
                vendor = VendorMasterBasicDetail(
                    tenant_id=tenant_id,
                    vendor_code=vendor_data.get('vendor_code'),
                    vendor_name=vendor_data.get('vendor_name'),
                    pan_no=vendor_data.get('pan_no'),
                    contact_person=vendor_data.get('contact_person'),
                    email=vendor_data.get('email'),
                    contact_no=vendor_data.get('contact_no'),
                    vendor_category=vendor_data.get('vendor_category'),
                    billing_currency=vendor_data.get('billing_currency'),
                    is_also_customer=vendor_data.get('is_also_customer', False),
                    tcs_applicable=vendor_data.get('tcs_applicable', False),
                    created_by=created_by
                )
                vendors.append(vendor)
            
            VendorMasterBasicDetail.objects.bulk_create(vendors)
        
        return vendors
