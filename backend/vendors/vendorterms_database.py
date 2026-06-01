"""
Database layer for Vendor Master Terms & Conditions operations
"""
from django.db import connection
from typing import List, Dict, Optional, Any
from decimal import Decimal



def _sanitize_terms_data(
    credit_limit: Optional[Any] = None,
    credit_period: Optional[str] = None,
    credit_terms: Optional[str] = None,
    penalty_terms: Optional[str] = None,
    delivery_terms: Optional[str] = None,
    warranty_guarantee_details: Optional[str] = None,
    force_majeure: Optional[str] = None,
    dispute_redressal_terms: Optional[str] = None
):
    if credit_limit is not None and str(credit_limit).strip() in ("", "None", "null"):
        credit_limit = None
    if credit_limit is not None:
        try:
            credit_limit = Decimal(str(credit_limit))
        except (ValueError, TypeError, ArithmeticError):
            credit_limit = None
            
    if credit_period is not None and str(credit_period).strip() == "":
        credit_period = None
    if credit_terms is not None and str(credit_terms).strip() == "":
        credit_terms = None
    if penalty_terms is not None and str(penalty_terms).strip() == "":
        penalty_terms = None
    if delivery_terms is not None and str(delivery_terms).strip() == "":
        delivery_terms = None
    if warranty_guarantee_details is not None and str(warranty_guarantee_details).strip() == "":
        warranty_guarantee_details = None
    if force_majeure is not None and str(force_majeure).strip() == "":
        force_majeure = None
    if dispute_redressal_terms is not None and str(dispute_redressal_terms).strip() == "":
        dispute_redressal_terms = None
        
    return (
        credit_limit,
        credit_period,
        credit_terms,
        penalty_terms,
        delivery_terms,
        warranty_guarantee_details,
        force_majeure,
        dispute_redressal_terms
    )


def create_vendor_terms(
    tenant_id: str,
    vendor_basic_detail_id: int,
    credit_limit: Optional[Decimal] = None,
    credit_period: Optional[str] = None,
    credit_terms: Optional[str] = None,
    penalty_terms: Optional[str] = None,
    delivery_terms: Optional[str] = None,
    warranty_guarantee_details: Optional[str] = None,
    force_majeure: Optional[str] = None,
    dispute_redressal_terms: Optional[str] = None,
    created_by: Optional[str] = None
) -> int:
    """
    Create a new vendor terms record
    
    Returns:
        int: The ID of the created terms record
    """
    (
        credit_limit,
        credit_period,
        credit_terms,
        penalty_terms,
        delivery_terms,
        warranty_guarantee_details,
        force_majeure,
        dispute_redressal_terms
    ) = _sanitize_terms_data(
        credit_limit,
        credit_period,
        credit_terms,
        penalty_terms,
        delivery_terms,
        warranty_guarantee_details,
        force_majeure,
        dispute_redressal_terms
    )

    query = """
        INSERT INTO vendor_master_vendorcreation_terms (
            tenant_id,
            vendor_basic_detail_id,
            credit_limit,
            credit_period,
            credit_terms,
            penalty_terms,
            delivery_terms,
            warranty_guarantee_details,
            force_majeure,
            dispute_redressal_terms,
            is_active,
            created_by,
            created_at,
            updated_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
    """
    
    with connection.cursor() as cursor:
        cursor.execute(query, [
            tenant_id,
            vendor_basic_detail_id,
            credit_limit,
            credit_period,
            credit_terms,
            penalty_terms,
            delivery_terms,
            warranty_guarantee_details,
            force_majeure,
            dispute_redressal_terms,
            1,  # is_active = True
            created_by
        ])
        return cursor.lastrowid


def get_vendor_terms_by_id(terms_id: int) -> Optional[Dict[str, Any]]:
    """
    Get vendor terms by ID
    
    Returns:
        Optional[Dict]: Terms data or None if not found
    """
    query = """
        SELECT 
            id,
            tenant_id,
            vendor_basic_detail_id,
            credit_limit,
            credit_period,
            credit_terms,
            penalty_terms,
            delivery_terms,
            warranty_guarantee_details,
            force_majeure,
            dispute_redressal_terms,
            is_active,
            created_at,
            updated_at,
            created_by,
            updated_by
        FROM vendor_master_vendorcreation_terms
        WHERE id = %s
    """
    
    with connection.cursor() as cursor:
        cursor.execute(query, [terms_id])
        row = cursor.fetchone()
        
        if not row:
            return None
        
        columns = [col[0] for col in cursor.description]
        return dict(zip(columns, row))


def get_vendor_terms_by_vendor(vendor_basic_detail_id: int) -> List[Dict[str, Any]]:
    """
    Get all terms for a specific vendor
    
    Returns:
        List[Dict]: List of terms records
    """
    query = """
        SELECT 
            id,
            tenant_id,
            vendor_basic_detail_id,
            credit_limit,
            credit_period,
            credit_terms,
            penalty_terms,
            delivery_terms,
            warranty_guarantee_details,
            force_majeure,
            dispute_redressal_terms,
            is_active,
            created_at,
            updated_at,
            created_by,
            updated_by
        FROM vendor_master_vendorcreation_terms
        WHERE vendor_basic_detail_id = %s
        ORDER BY created_at DESC
    """
    
    with connection.cursor() as cursor:
        cursor.execute(query, [vendor_basic_detail_id])
        columns = [col[0] for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


def update_vendor_terms(
    terms_id: int,
    credit_limit: Optional[Decimal] = None,
    credit_period: Optional[str] = None,
    credit_terms: Optional[str] = None,
    penalty_terms: Optional[str] = None,
    delivery_terms: Optional[str] = None,
    warranty_guarantee_details: Optional[str] = None,
    force_majeure: Optional[str] = None,
    dispute_redressal_terms: Optional[str] = None,
    updated_by: Optional[str] = None
) -> bool:
    """
    Update vendor terms
    
    Returns:
        bool: True if updated successfully
    """
    (
        credit_limit,
        credit_period,
        credit_terms,
        penalty_terms,
        delivery_terms,
        warranty_guarantee_details,
        force_majeure,
        dispute_redressal_terms
    ) = _sanitize_terms_data(
        credit_limit,
        credit_period,
        credit_terms,
        penalty_terms,
        delivery_terms,
        warranty_guarantee_details,
        force_majeure,
        dispute_redressal_terms
    )

    query = """
        UPDATE vendor_master_vendorcreation_terms
        SET
            credit_limit = %s,
            credit_period = %s,
            credit_terms = %s,
            penalty_terms = %s,
            delivery_terms = %s,
            warranty_guarantee_details = %s,
            force_majeure = %s,
            dispute_redressal_terms = %s,
            updated_by = %s,
            updated_at = NOW()
        WHERE id = %s
    """
    
    with connection.cursor() as cursor:
        cursor.execute(query, [
            credit_limit,
            credit_period,
            credit_terms,
            penalty_terms,
            delivery_terms,
            warranty_guarantee_details,
            force_majeure,
            dispute_redressal_terms,
            updated_by,
            terms_id
        ])
        return cursor.rowcount > 0


def delete_vendor_terms(terms_id: int) -> bool:
    """
    Delete vendor terms (soft delete by setting is_active to False)
    
    Returns:
        bool: True if deleted successfully
    """
    query = """
        UPDATE vendor_master_vendorcreation_terms
        SET is_active = 0, updated_at = NOW()
        WHERE id = %s
    """
    
    with connection.cursor() as cursor:
        cursor.execute(query, [terms_id])
        return cursor.rowcount > 0


def get_all_vendor_terms(tenant_id: str) -> List[Dict[str, Any]]:
    """
    Get all vendor terms for a tenant
    
    Returns:
        List[Dict]: List of all terms records
    """
    query = """
        SELECT 
            vt.id,
            vt.tenant_id,
            vt.vendor_basic_detail_id,
            vbd.vendor_name,
            vbd.vendor_code,
            vt.credit_limit,
            vt.credit_period,
            vt.credit_terms,
            vt.penalty_terms,
            vt.delivery_terms,
            vt.warranty_guarantee_details,
            vt.force_majeure,
            vt.dispute_redressal_terms,
            vt.is_active,
            vt.created_at,
            vt.updated_at
        FROM vendor_master_vendorcreation_terms vt
        LEFT JOIN vendor_master_vendorcreation_basicdetail vbd ON vt.vendor_basic_detail_id = vbd.id
        WHERE vt.tenant_id = %s AND vt.is_active = 1
        ORDER BY vt.created_at DESC
    """
    
    with connection.cursor() as cursor:
        cursor.execute(query, [tenant_id])
        columns = [col[0] for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
