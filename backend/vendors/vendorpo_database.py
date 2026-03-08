"""
Database layer for Vendor Purchase Order operations
"""
from django.db import connection, transaction
from typing import List, Dict, Optional, Any
from decimal import Decimal
from datetime import date


def generate_po_number(tenant_id: str, po_series_id: Optional[int] = None) -> str:
    """
    Generate next PO number based on series settings
    
    Returns:
        str: Generated PO number
    """
    if po_series_id:
        # Get series settings
        query = """
            SELECT prefix, current_number, required_digits, suffix
            FROM vendor_master_posettings
            WHERE id = %s AND tenant_id = %s
        """
        
        with connection.cursor() as cursor:
            cursor.execute(query, [po_series_id, tenant_id])
            row = cursor.fetchone()
            
            if row:
                prefix, current_number, required_digits, suffix = row
                next_number = current_number + 1
                
                # Update current number
                update_query = """
                    UPDATE vendor_master_posettings
                    SET current_number = %s, updated_at = NOW()
                    WHERE id = %s
                """
                cursor.execute(update_query, [next_number, po_series_id])
                
                # Format PO number
                number_str = str(next_number).zfill(required_digits)
                return f"{prefix}{number_str}{suffix}"
    
    # Fallback: generate simple sequential number
    query = """
        SELECT COALESCE(MAX(CAST(SUBSTRING(po_number, 3) AS UNSIGNED)), 0) + 1
        FROM vendor_transaction_po
        WHERE tenant_id = %s AND po_number LIKE 'PO%%'
    """
    
    with connection.cursor() as cursor:
        cursor.execute(query, [tenant_id])
        next_num = cursor.fetchone()[0]
        return f"PO{str(next_num).zfill(6)}"


def create_purchase_order(
    tenant_id: str,
    po_data: Dict[str, Any],
    items_data: List[Dict[str, Any]],
    created_by: Optional[str] = None
) -> int:
    """
    Create a new purchase order with items
    
    Returns:
        int: The ID of the created PO
    """
    with transaction.atomic():
        # Generate PO number
        po_number = generate_po_number(tenant_id, po_data.get('po_series_id'))
        
        # Calculate totals from items
        total_taxable_value = sum(Decimal(str(item.get('taxable_value', 0))) for item in items_data)
        total_tax = sum(Decimal(str(item.get('gst_amount', 0))) for item in items_data)
        total_value = sum(Decimal(str(item.get('invoice_value', 0))) for item in items_data)
        
        # Insert PO header
        po_query = """
            INSERT INTO vendor_transaction_po (
                tenant_id,
                po_number,
                po_series_id,
                vendor_basic_detail_id,
                vendor_name,
                branch,
                address_line1,
                address_line2,
                address_line3,
                city,
                state,
                country,
                pincode,
                email_address,
                contract_no,
                receive_by,
                receive_at,
                delivery_terms,
                total_taxable_value,
                total_tax,
                total_value,
                status,
                is_active,
                created_by,
                created_at,
                updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
        """
        
        with connection.cursor() as cursor:
            cursor.execute(po_query, [
                tenant_id,
                po_number,
                po_data.get('po_series_id'),
                po_data.get('vendor_id'),
                po_data.get('vendor_name'),
                po_data.get('branch'),
                po_data.get('address_line1'),
                po_data.get('address_line2'),
                po_data.get('address_line3'),
                po_data.get('city'),
                po_data.get('state'),
                po_data.get('country'),
                po_data.get('pincode'),
                po_data.get('email_address'),
                po_data.get('contract_no'),
                po_data.get('receive_by'),
                po_data.get('receive_at'),
                po_data.get('delivery_terms'),
                total_taxable_value,
                total_tax,
                total_value,
                'Draft',
                1,  # is_active
                created_by
            ])
            
            po_id = cursor.lastrowid
            
            # Insert PO items
            if items_data:
                item_query = """
                    INSERT INTO vendor_transaction_po_items (
                        tenant_id,
                        po_id,
                        item_code,
                        item_name,
                        supplier_item_code,
                        quantity,
                        uom,
                        negotiated_rate,
                        final_rate,
                        taxable_value,
                        gst_rate,
                        gst_amount,
                        invoice_value,
                        is_active,
                        created_at,
                        updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                """
                
                for item in items_data:
                    cursor.execute(item_query, [
                        tenant_id,
                        po_id,
                        item.get('item_code'),
                        item.get('item_name'),
                        item.get('supplier_item_code'),
                        item.get('quantity', 0),
                        item.get('uom'),
                        item.get('negotiated_rate', 0),
                        item.get('final_rate', 0),
                        item.get('taxable_value', 0),
                        item.get('gst_rate', 0),
                        item.get('gst_amount', 0),
                        item.get('invoice_value', 0),
                        1  # is_active
                    ])
            
            return po_id


def get_purchase_order_by_id(po_id: int) -> Optional[Dict[str, Any]]:
    """
    Get purchase order by ID with items
    
    Returns:
        Optional[Dict]: PO data with items or None if not found
    """
    query = """
        SELECT 
            id, tenant_id, po_number, po_series_id, vendor_basic_detail_id,
            vendor_name, branch, address_line1, address_line2, address_line3,
            city, state, country, pincode, email_address, contract_no,
            receive_by, receive_at, delivery_terms,
            total_taxable_value, total_tax, total_value,
            status, is_active, created_at, updated_at, created_by, updated_by
        FROM vendor_transaction_po
        WHERE id = %s
    """
    
    with connection.cursor() as cursor:
        cursor.execute(query, [po_id])
        row = cursor.fetchone()
        
        if not row:
            return None
        
        columns = [col[0] for col in cursor.description]
        po_data = dict(zip(columns, row))
        
        # Get items
        items_query = """
            SELECT 
                id, item_code, item_name, supplier_item_code,
                quantity, uom, negotiated_rate, final_rate,
                taxable_value, gst_rate, gst_amount, invoice_value
            FROM vendor_transaction_po_items
            WHERE po_id = %s AND is_active = 1
            ORDER BY id
        """
        
        cursor.execute(items_query, [po_id])
        item_columns = [col[0] for col in cursor.description]
        po_data['items'] = [dict(zip(item_columns, item_row)) for item_row in cursor.fetchall()]
        
        return po_data


def get_all_purchase_orders(tenant_id: str, status: Optional[str] = None, vendor_name: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Get all purchase orders for a tenant
    
    Returns:
        List[Dict]: List of PO records
    """
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[db.get_all_purchase_orders] tenant_id={tenant_id}, status={status}, vendor_name={vendor_name}")

    query = """
        SELECT 
            po.id, po.po_number, po.vendor_name, po.receive_by,
            po.total_value, po.status, po.created_at,
            COUNT(items.id) as item_count
        FROM vendor_transaction_po po
        LEFT JOIN vendor_transaction_po_items items ON po.id = items.po_id AND items.is_active = 1
        WHERE po.tenant_id = %s AND po.is_active = 1
    """
    
    params = [tenant_id]
    
    if status and status != 'All':
        query += " AND po.status = %s"
        params.append(status)
        
    if vendor_name:
        # Use case-insensitive matching and allow for slight whitespace variations
        query += " AND LOWER(TRIM(po.vendor_name)) = LOWER(TRIM(%s))"
        params.append(vendor_name)
    
    # Group by id and po_number to handle non-unique ids
    query += " GROUP BY po.id, po.po_number ORDER BY po.created_at DESC"
    
    with connection.cursor() as cursor:
        cursor.execute(query, params)
        columns = [col[0] for col in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        logger.info(f"[db.get_all_purchase_orders] Returning {len(results)} results")
        return results


def update_po_status(po_id: int, status: str, updated_by: Optional[str] = None) -> bool:
    """
    Update PO status
    
    Returns:
        bool: True if updated successfully
    """
    query = """
        UPDATE vendor_transaction_po
        SET status = %s, updated_by = %s, updated_at = NOW()
        WHERE id = %s
    """
    
    with connection.cursor() as cursor:
        cursor.execute(query, [status, updated_by, po_id])
        return cursor.rowcount > 0
