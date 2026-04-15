"""
Database operations for Vendor Master Products and Services.
New design: ONE row per vendor, items stored as a JSON array column.
"""

import json
import logging
from django.db import connection

logger = logging.getLogger(__name__)


class VendorProductServiceDatabase:
    """
    Handles all DB operations for vendor_master_vendorcreation_productservices.
    One row per vendor; UPSERT pattern (INSERT or UPDATE if vendor already has a row).
    """

    @staticmethod
    def upsert_product_services(tenant_id, vendor_basic_detail_id, items, created_by=None):
        """
        Insert or update the JSON items array for the given vendor.
        - If no row exists for this vendor → INSERT.
        - If a row already exists → UPDATE items (merge / replace).
        
        Args:
            tenant_id (str): The tenant ID.
            vendor_basic_detail_id (int): The vendor's basic detail ID.
            items (list): List of item dicts [{hsn_sac_code, item_code, item_name, ...}].
            created_by (str): Username of creator/updater.

        Returns:
            dict: The saved record as a plain dict.
        """
        username = created_by or 'system'

        logger.info(
            f"Upserting product services: tenant={tenant_id}, "
            f"vendor_id={vendor_basic_detail_id}, items_count={len(items)}"
        )

        # 1. Delete existing items for this vendor
        delete_query = """
            DELETE FROM vendor_master_vendorcreation_productservices_items
            WHERE vendor_basic_detail_id = %s
        """
        
        # 2. Insert new items
        insert_query = """
            INSERT INTO vendor_master_vendorcreation_productservices_items
                (tenant_id, vendor_basic_detail_id, hsn_sac_code, item_code, item_name, 
                 supplier_item_code, supplier_item_name, is_active, created_at, updated_at, created_by, updated_by)
            VALUES
                (%s, %s, %s, %s, %s, %s, %s, 1, NOW(6), NOW(6), %s, %s)
        """

        try:
            with connection.cursor() as cursor:
                cursor.execute(delete_query, [vendor_basic_detail_id])
                
                if items:
                    params_list = [
                        (
                            tenant_id, 
                            vendor_basic_detail_id,
                            item.get('hsn_sac_code', ''),
                            item.get('item_code', ''),
                            item.get('item_name', ''),
                            item.get('supplier_item_code', ''),
                            item.get('supplier_item_name', ''),
                            username,
                            username
                        )
                        for item in items
                    ]
                    cursor.executemany(insert_query, params_list)

            logger.info(f"Product services upserted for vendor {vendor_basic_detail_id}")
            return VendorProductServiceDatabase.get_by_vendor(vendor_basic_detail_id)

        except Exception as e:
            logger.error(
                f"Error upserting product services for vendor {vendor_basic_detail_id}: {e}",
                exc_info=True
            )
            raise

    @staticmethod
    def get_by_vendor(vendor_basic_detail_id):
        """
        Fetch the product services record for a specific vendor.

        Returns:
            dict | None
        """
        query = """
            SELECT tenant_id, hsn_sac_code, item_code, item_name, 
                   supplier_item_code, supplier_item_name, is_active,
                   created_at, updated_at, created_by, updated_by
            FROM vendor_master_vendorcreation_productservices_items
            WHERE vendor_basic_detail_id = %s
        """
        try:
            with connection.cursor() as cursor:
                cursor.execute(query, [vendor_basic_detail_id])
                rows = cursor.fetchall()

            if not rows:
                return None

            # Base metadata from first row
            first_row = rows[0]
            result = {
                'tenant_id': first_row[0],
                'vendor_basic_detail': vendor_basic_detail_id,
                'items': [],
                'is_active': bool(first_row[6]),
                'created_at': str(first_row[7]) if first_row[7] else None,
                'updated_at': str(first_row[8]) if first_row[8] else None,
                'created_by': first_row[9],
                'updated_by': first_row[10],
            }

            for row in rows:
                result['items'].append({
                    'hsn_sac_code': row[1] or '',
                    'item_code': row[2] or '',
                    'item_name': row[3] or '',
                    'supplier_item_code': row[4] or '',
                    'supplier_item_name': row[5] or ''
                })

            return result

        except Exception as e:
            logger.error(f"Error fetching product services for vendor {vendor_basic_detail_id}: {e}")
            raise

    @staticmethod
    def get_by_tenant(tenant_id):
        """
        List all product service records for a tenant.

        Returns:
            list[dict]
        """
        query = """
            SELECT vendor_basic_detail_id, tenant_id, hsn_sac_code, item_code, item_name, 
                   supplier_item_code, supplier_item_name, is_active,
                   created_at, updated_at, created_by, updated_by
            FROM vendor_master_vendorcreation_productservices_items
            WHERE tenant_id = %s AND is_active = 1
            ORDER BY vendor_basic_detail_id, updated_at DESC
        """
        try:
            with connection.cursor() as cursor:
                cursor.execute(query, [tenant_id])
                rows = cursor.fetchall()

            grouped = {}
            for row in rows:
                vendor_id = row[0]
                if vendor_id not in grouped:
                    grouped[vendor_id] = {
                        'tenant_id': row[1],
                        'vendor_basic_detail': vendor_id,
                        'items': [],
                        'is_active': bool(row[7]),
                        'created_at': str(row[8]) if row[8] else None,
                        'updated_at': str(row[9]) if row[9] else None,
                        'created_by': row[10],
                        'updated_by': row[11],
                    }
                grouped[vendor_id]['items'].append({
                    'hsn_sac_code': row[2] or '',
                    'item_code': row[3] or '',
                    'item_name': row[4] or '',
                    'supplier_item_code': row[5] or '',
                    'supplier_item_name': row[6] or ''
                })

            return list(grouped.values())

        except Exception as e:
            logger.error(f"Error listing product services for tenant {tenant_id}: {e}")
            raise

    @staticmethod
    def delete_by_vendor(vendor_basic_detail_id, soft=True):
        """Soft- or hard-delete the record for a vendor."""
        if soft:
            query = """
                UPDATE vendor_master_vendorcreation_productservices_items
                SET is_active = 0, updated_at = NOW(6)
                WHERE vendor_basic_detail_id = %s
            """
        else:
            query = """
                DELETE FROM vendor_master_vendorcreation_productservices_items
                WHERE vendor_basic_detail_id = %s
            """
        try:
            with connection.cursor() as cursor:
                cursor.execute(query, [vendor_basic_detail_id])
            logger.info(f"Deleted product services for vendor {vendor_basic_detail_id}")
            return True
        except Exception as e:
            logger.error(f"Error deleting product services: {e}")
            raise
