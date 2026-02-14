"""
Database operations for Vendor Master GST Details.
"""

from django.db import transaction
from django.core.exceptions import ObjectDoesNotExist
from .models import VendorMasterGSTDetails


class VendorGSTDetailsDatabase:
    """Database operations for Vendor Master GST Details"""
    
    @staticmethod
    def create_gst_detail(tenant_id, gst_data, created_by=None):
        """Create a new vendor GST detail entry"""
        with transaction.atomic():
            # Auto-extract state code and PAN from GSTIN
            gstin = gst_data.get('gstin', '').upper()
            if len(gstin) == 15:
                gst_data['gst_state_code'] = gstin[:2]
                gst_data['pan_linked_with_gstin'] = gstin[2:12]
            
            # Handle vendor_basic_detail - could be an object or an ID
            vendor_basic_detail = gst_data.get('vendor_basic_detail')
            if hasattr(vendor_basic_detail, 'id'):
                # It's an object, extract the ID
                vendor_basic_detail_id = vendor_basic_detail.id
            else:
                # It's already an ID
                vendor_basic_detail_id = vendor_basic_detail
            
            gst_detail = VendorMasterGSTDetails.objects.create(
                tenant_id=tenant_id,
                vendor_basic_detail_id=vendor_basic_detail_id,
                gstin=gstin,
                gst_registration_type=gst_data.get('gst_registration_type', 'regular'),
                legal_name=gst_data.get('legal_name'),
                trade_name=gst_data.get('trade_name'),
                gst_state_code=gst_data.get('gst_state_code'),
                pan_linked_with_gstin=gst_data.get('pan_linked_with_gstin'),
                reference_name=gst_data.get('reference_name'),
                branch_address=gst_data.get('branch_address'),
                branch_contact_person=gst_data.get('branch_contact_person'),
                branch_email=gst_data.get('branch_email'),
                branch_contact_no=gst_data.get('branch_contact_no'),
                created_by=created_by
            )
            
            return gst_detail
    
    @staticmethod
    def get_gst_detail_by_id(gst_id):
        """Retrieve a GST detail by ID"""
        try:
            return VendorMasterGSTDetails.objects.get(id=gst_id)
        except ObjectDoesNotExist:
            return None
    
    @staticmethod
    def get_gst_details_by_tenant(tenant_id, is_active=True, vendor_id=None):
        """Retrieve all GST details for a tenant, optionally filtered by vendor"""
        queryset = VendorMasterGSTDetails.objects.filter(tenant_id=tenant_id)
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)
        if vendor_id:
            queryset = queryset.filter(vendor_basic_detail_id=vendor_id)
        return queryset.order_by('-created_at')
    
    @staticmethod
    def update_gst_detail(gst_id, update_data, updated_by=None):
        """Update a GST detail"""
        try:
            with transaction.atomic():
                gst_detail = VendorMasterGSTDetails.objects.get(id=gst_id)
                
                for field, value in update_data.items():
                    if hasattr(gst_detail, field):
                        setattr(gst_detail, field, value)
                
                if updated_by:
                    gst_detail.updated_by = updated_by
                
                gst_detail.save()
                return gst_detail
        except ObjectDoesNotExist:
            return None
    
    @staticmethod
    def delete_gst_detail(gst_id, soft_delete=True):
        """Delete a GST detail"""
        try:
            gst_detail = VendorMasterGSTDetails.objects.get(id=gst_id)
            if soft_delete:
                gst_detail.is_active = False
                gst_detail.save()
            else:
                gst_detail.delete()
            return True
        except ObjectDoesNotExist:
            return False
    
    @staticmethod
    def check_duplicate_gstin(tenant_id, gstin, reference_name=None, exclude_id=None):
        """Check if a GSTIN already exists for a tenant, optionally with a specific reference name"""
        queryset = VendorMasterGSTDetails.objects.filter(
            tenant_id=tenant_id,
            gstin=gstin.upper()
        )
        if reference_name:
            queryset = queryset.filter(reference_name=reference_name)
        
        if exclude_id:
            queryset = queryset.exclude(id=exclude_id)
        return queryset.exists()
