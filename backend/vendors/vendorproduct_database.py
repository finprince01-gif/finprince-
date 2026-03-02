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
        items_json = json.dumps(items)

        logger.info(
            f"Upserting product services: tenant={tenant_id}, "
            f"vendor_id={vendor_basic_detail_id}, items_count={len(items)}"
        )

        # MySQL ON DUPLICATE KEY UPDATE – works with the UNIQUE KEY on vendor_basic_detail_id
        query = """
            INSERT INTO vendor_master_vendorcreation_productservices
                (tenant_id, vendor_basic_detail_id, items, is_active, created_at, updated_at, created_by, updated_by)
            VALUES
                (%s, %s, %s, 1, NOW(6), NOW(6), %s, %s)
            ON DUPLICATE KEY UPDATE
                items      = VALUES(items),
                is_active  = 1,
                updated_at = NOW(6),
                updated_by = VALUES(updated_by)
        """

        params = [tenant_id, vendor_basic_detail_id, items_json, username, username]

        try:
            with connection.cursor() as cursor:
                cursor.execute(query, params)

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
            SELECT id, tenant_id, vendor_basic_detail_id, items, is_active,
                   created_at, updated_at, created_by, updated_by
            FROM vendor_master_vendorcreation_productservices
            WHERE vendor_basic_detail_id = %s
        """
        try:
            with connection.cursor() as cursor:
                cursor.execute(query, [vendor_basic_detail_id])
                row = cursor.fetchone()

            if not row:
                return None

            raw_items = row[3]
            if isinstance(raw_items, str):
                raw_items = json.loads(raw_items)

            return {
                'id': row[0],
                'tenant_id': row[1],
                'vendor_basic_detail': row[2],
                'items': raw_items,
                'is_active': bool(row[4]),
                'created_at': str(row[5]) if row[5] else None,
                'updated_at': str(row[6]) if row[6] else None,
                'created_by': row[7],
                'updated_by': row[8],
            }

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
            SELECT id, tenant_id, vendor_basic_detail_id, items, is_active,
                   created_at, updated_at, created_by, updated_by
            FROM vendor_master_vendorcreation_productservices
            WHERE tenant_id = %s AND is_active = 1
            ORDER BY updated_at DESC
        """
        try:
            with connection.cursor() as cursor:
                cursor.execute(query, [tenant_id])
                rows = cursor.fetchall()

            results = []
            for row in rows:
                raw_items = row[3]
                if isinstance(raw_items, str):
                    raw_items = json.loads(raw_items)
                results.append({
                    'id': row[0],
                    'tenant_id': row[1],
                    'vendor_basic_detail': row[2],
                    'items': raw_items,
                    'is_active': bool(row[4]),
                    'created_at': str(row[5]) if row[5] else None,
                    'updated_at': str(row[6]) if row[6] else None,
                    'created_by': row[7],
                    'updated_by': row[8],
                })
            return results

        except Exception as e:
            logger.error(f"Error listing product services for tenant {tenant_id}: {e}")
            raise

    @staticmethod
    def delete_by_vendor(vendor_basic_detail_id, soft=True):
        """Soft- or hard-delete the record for a vendor."""
        if soft:
            query = """
                UPDATE vendor_master_vendorcreation_productservices
                SET is_active = 0, updated_at = NOW(6)
                WHERE vendor_basic_detail_id = %s
            """
        else:
            query = """
                DELETE FROM vendor_master_vendorcreation_productservices
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
