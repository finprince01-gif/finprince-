"""
Database operations for Vendor Master Banking Information.
"""

import django.db
connection = django.db.connection
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)


def create_vendor_banking(data: Dict) -> Optional[Dict]:
    """
    Create a new vendor banking record in the database.
    """
    
    # Resolve vendor_id - handle different possible formats
    vendor_id = data.get('vendor_basic_detail_id') or data.get('vendor_basic_detail')
    if hasattr(vendor_id, 'id'):
        vendor_id = vendor_id.id
    
    tenant_id = data.get('tenant_id')
    bank_account_no = data.get('bank_account_no')
    if bank_account_no is None:
        bank_account_no = ''
    bank_name = data.get('bank_name')
    if bank_name is None:
        bank_name = ''
    ifsc_code = data.get('ifsc_code')
    if ifsc_code is None:
        ifsc_code = ''
    branch_name = data.get('branch_name', '')
    swift_code = data.get('swift_code', '')
    vendor_branch = data.get('vendor_branch', '')
    account_type = data.get('account_type', 'current')
    is_active = data.get('is_active', True)
    created_by = data.get('created_by', 'system')
    updated_by = data.get('updated_by', 'system')

    query = """
        INSERT INTO vendor_master_vendorcreation_banking (
            tenant_id, vendor_basic_detail_id, bank_account_no, bank_name,
            ifsc_code, branch_name, swift_code, vendor_branch, account_type,
            is_active, created_at, updated_at, created_by, updated_by
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), %s, %s
        )
    """
    
    params = [
        tenant_id,
        vendor_id,
        bank_account_no,
        bank_name,
        ifsc_code,
        branch_name,
        swift_code,
        vendor_branch,
        account_type,
        is_active,
        created_by,
        updated_by,
    ]
    
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            banking_id = cursor.lastrowid
            
        logger.info(f"Created vendor banking record with ID: {banking_id}")
        return get_vendor_banking_by_id(banking_id)
    except Exception as e:
        logger.error(f"Error creating vendor banking: {str(e)}")
        raise


def update_vendor_banking(banking_id: int, data: Dict) -> Optional[Dict]:
    """
    Update an existing vendor banking record.
    Supports partial updates by using COALESCE.
    """
    # Resolve vendor_id - handle different possible formats
    vendor_id = data.get('vendor_basic_detail_id') or data.get('vendor_basic_detail')
    if hasattr(vendor_id, 'id'):
        vendor_id = vendor_id.id

    query = """
        UPDATE vendor_master_vendorcreation_banking
        SET bank_account_no = COALESCE(%s, bank_account_no),
            bank_name = COALESCE(%s, bank_name),
            ifsc_code = COALESCE(%s, ifsc_code),
            branch_name = COALESCE(%s, branch_name),
            swift_code = COALESCE(%s, swift_code),
            vendor_branch = COALESCE(%s, vendor_branch),
            account_type = COALESCE(%s, account_type),
            is_active = COALESCE(%s, is_active),
            updated_at = NOW(),
            updated_by = %s,
            vendor_basic_detail_id = COALESCE(%s, vendor_basic_detail_id)
        WHERE id = %s
    """
    
    params = [
        data.get('bank_account_no'),
        data.get('bank_name'),
        data.get('ifsc_code'),
        data.get('branch_name'),
        data.get('swift_code'),
        data.get('vendor_branch'),
        data.get('account_type'),
        data.get('is_active'),
        data.get('updated_by'),
        vendor_id,
        banking_id,
    ]
    
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            
        logger.info(f"Updated vendor banking record with ID: {banking_id}")
        return get_vendor_banking_by_id(banking_id)
    except Exception as e:
        logger.error(f"Error updating vendor banking: {str(e)}")
        raise


def get_vendor_banking_by_id(banking_id: int) -> Optional[Dict]:
    """
    Get vendor banking record by ID.
    
    Args:
        banking_id: ID of the banking record
        
    Returns:
        Dictionary with banking record details or None
    """
    query = """
        SELECT id, tenant_id, vendor_basic_detail_id, bank_account_no, bank_name,
               ifsc_code, branch_name, swift_code, vendor_branch, account_type,
               is_active, created_at, updated_at, created_by, updated_by
        FROM vendor_master_vendorcreation_banking
        WHERE id = %s
    """
    
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, [banking_id])
            row = cursor.fetchone()
            
            if row:
                return {
                    'id': row[0],
                    'tenant_id': row[1],
                    'vendor_basic_detail': row[2],
                    'bank_account_no': row[3],
                    'bank_name': row[4],
                    'ifsc_code': row[5],
                    'branch_name': row[6],
                    'swift_code': row[7],
                    'vendor_branch': row[8],
                    'account_type': row[9],
                    'is_active': bool(row[10]),
                    'created_at': row[11],
                    'updated_at': row[12],
                    'created_by': row[13],
                    'updated_by': row[14],
                }
            return None
    except Exception as e:
        logger.error(f"Error getting vendor banking by ID: {str(e)}")
        raise


def get_vendor_banking_by_vendor(vendor_basic_detail_id: int) -> List[Dict]:
    """
    Get all banking records for a vendor.
    
    Args:
        vendor_basic_detail_id: ID of the vendor basic detail
        
    Returns:
        List of dictionaries with banking record details
    """
    query = """
        SELECT id, tenant_id, vendor_basic_detail_id, bank_account_no, bank_name,
               ifsc_code, branch_name, swift_code, vendor_branch, account_type,
               is_active, created_at, updated_at, created_by, updated_by
        FROM vendor_master_vendorcreation_banking
        WHERE vendor_basic_detail_id = %s AND is_active = 1
        ORDER BY created_at DESC
    """
    
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, [vendor_basic_detail_id])
            rows = cursor.fetchall()
            
            results = []
            for row in rows:
                results.append({
                    'id': row[0],
                    'tenant_id': row[1],
                    'vendor_basic_detail': row[2],
                    'bank_account_no': row[3],
                    'bank_name': row[4],
                    'ifsc_code': row[5],
                    'branch_name': row[6],
                    'swift_code': row[7],
                    'vendor_branch': row[8],
                    'account_type': row[9],
                    'is_active': bool(row[10]),
                    'created_at': row[11],
                    'updated_at': row[12],
                    'created_by': row[13],
                    'updated_by': row[14],
                })
            
            return results
    except Exception as e:
        logger.error(f"Error getting vendor banking by vendor: {str(e)}")
        raise


def list_vendor_banking_by_tenant(tenant_id: str) -> List[Dict]:
    """
    List all vendor banking records for a tenant.
    
    Args:
        tenant_id: Branch ID
        
    Returns:
        List of dictionaries with banking record details
    """
    query = """
        SELECT id, tenant_id, vendor_basic_detail_id, bank_account_no, bank_name,
               ifsc_code, branch_name, swift_code, vendor_branch, account_type,
               is_active, created_at, updated_at, created_by, updated_by
        FROM vendor_master_vendorcreation_banking
        WHERE tenant_id = %s
        ORDER BY created_at DESC
    """
    
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, [tenant_id])
            rows = cursor.fetchall()
            
            results = []
            for row in rows:
                results.append({
                    'id': row[0],
                    'tenant_id': row[1],
                    'vendor_basic_detail': row[2],
                    'bank_account_no': row[3],
                    'bank_name': row[4],
                    'ifsc_code': row[5],
                    'branch_name': row[6],
                    'swift_code': row[7],
                    'vendor_branch': row[8],
                    'account_type': row[9],
                    'is_active': bool(row[10]),
                    'created_at': row[11],
                    'updated_at': row[12],
                    'created_by': row[13],
                    'updated_by': row[14],
                })
            
            return results
    except Exception as e:
        logger.error(f"Error listing vendor banking by tenant: {str(e)}")
        raise


def delete_vendor_banking(banking_id: int) -> bool:
    """
    Soft delete a vendor banking record.
    
    Args:
        banking_id: ID of the banking record to delete
        
    Returns:
        True if successful
    """
    query = """
        UPDATE vendor_master_vendorcreation_banking
        SET is_active = 0, updated_at = NOW()
        WHERE id = %s
    """
    
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, [banking_id])
            
        logger.info(f"Deleted vendor banking record with ID: {banking_id}")
        return True
    except Exception as e:
        logger.error(f"Error deleting vendor banking: {str(e)}")
        raise
