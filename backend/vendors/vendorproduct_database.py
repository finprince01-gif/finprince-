
import logging
from django.db import transaction, IntegrityError
from django.core.exceptions import ObjectDoesNotExist
from .models import VendorMasterProductService
from django.utils import timezone

logger = logging.getLogger(__name__)

class VendorProductServiceDatabase:
    """
    Database operations for Vendor Master Products and Services.
    Handles all interactions with the vendor_master_productservices table.
    """
    
    @staticmethod
    def create_product_service(tenant_id, data, created_by=None):
        """
        Create a new product/service record.
        """
        try:
            logger.info(f"Creating product/service for tenant: {tenant_id}")
            
            product = VendorMasterProductService.objects.create(
                tenant_id=tenant_id,
                vendor_basic_detail=data.get('vendor_basic_detail'),
                hsn_sac_code=data.get('hsn_sac_code'),
                item_code=data.get('item_code'),
                item_name=data.get('item_name'),
                supplier_item_code=data.get('supplier_item_code'),
                supplier_item_name=data.get('supplier_item_name'),
                created_by=created_by,
                updated_by=created_by
            )
            return product
        except IntegrityError as e:
            logger.error(f"IntegrityError creating product service: {e}")
            raise ValueError("Database integrity error")
        except Exception as e:
            logger.error(f"Error creating product service: {e}")
            raise
    
    @staticmethod
    def get_products_by_vendor(tenant_id, vendor_id):
        """
        Get all products/services for a specific vendor.
        """
        return VendorMasterProductService.objects.filter(
            tenant_id=tenant_id, 
            vendor_basic_detail_id=vendor_id,
            is_active=True
        ).order_by('-created_at')

    @staticmethod
    def update_product_service(product_id, data, updated_by=None):
        """
        Update an existing product/service record.
        """
        try:
            product = VendorMasterProductService.objects.get(id=product_id)
            
            for key, value in data.items():
                if hasattr(product, key):
                    setattr(product, key, value)
            
            if updated_by:
                product.updated_by = updated_by
                
            product.save()
            return product
        except VendorMasterProductService.DoesNotExist:
            logger.error(f"Product service with ID {product_id} not found")
            return None
            
    @staticmethod
    def delete_product_service(product_id, soft_delete=True):
        """
        Delete a product/service record.
        """
        try:
            product = VendorMasterProductService.objects.get(id=product_id)
            if soft_delete:
                product.is_active = False
                product.save()
            else:
                product.delete()
            return True
        except VendorMasterProductService.DoesNotExist:
            return False
