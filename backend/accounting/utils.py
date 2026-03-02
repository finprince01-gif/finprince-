"""
Utility functions for auto-generating ledger codes based on hierarchy.
"""

import logging
from django.db import connection
from django.db.models import Max
from accounting.models import MasterLedger

# Initialize logger
logger = logging.getLogger('accounting.utils')


def generate_ledger_code(ledger_data, tenant_id, hierarchy_ids=None):
    """
    Generate ledger code based on hierarchy position.
    
    Args:
        ledger_data (dict): Validated ledger data containing hierarchy fields
        tenant_id (int): Tenant ID for scoping uniqueness
        hierarchy_ids (dict): Optional explicit IDs
        
    Returns:
        str: Generated ledger code
    """
    logger.info(f"🔢 Starting code generation for tenant {tenant_id}")
    
    # -------------------------------------------------------------------------
    # Case 0: Explicit Hierarchy IDs provided (New 16-digit Rule)
    # -------------------------------------------------------------------------
    if hierarchy_ids:
        try:
            return generate_hierarchy_code(hierarchy_ids)
        except NameError:
            pass 

    # -------------------------------------------------------------------------
    # Case 1: Nested custom ledger
    # -------------------------------------------------------------------------
    if ledger_data.get('parent_ledger_id'):
        logger.info(f"📂 Nested ledger detected (parent_id: {ledger_data['parent_ledger_id']})")
        return _generate_nested_code(ledger_data, tenant_id)
    
    # -------------------------------------------------------------------------
    # Case 2: Hierarchy Lookup + Dynamic 16-digit Generation
    # -------------------------------------------------------------------------
    hierarchy_code = _lookup_exact_hierarchy_code(ledger_data)
    
    if hierarchy_code:
        # Check if matched code is 16-digit format
        if len(hierarchy_code) == 16 and hierarchy_code.isdigit():
            logger.info(f"🏛️ Matched 16-digit hierarchy stem: {hierarchy_code}")
            return _generate_next_flat_code(hierarchy_code, ledger_data, tenant_id)
            
        # Old Rule: Suffix logic
        logger.info(f"🏛️ Using EXACT hierarchy code: {hierarchy_code}")
        existing = MasterLedger.objects.filter(tenant_id=tenant_id, code=hierarchy_code).exists()
        if existing:
            return _generate_next_suffix_code(hierarchy_code, tenant_id)
        return hierarchy_code
    
    # -------------------------------------------------------------------------
    # Case 3: Fallback (9000+)
    # -------------------------------------------------------------------------
    logger.info("⚠️ No hierarchy found, using fallback range")
    return _generate_fallback_code(tenant_id)


def _generate_next_flat_code(base_code, ledger_data, tenant_id):
    """Generate next available 16-digit flat code by incrementing under the deepest parent"""
    # 1. Determine depth based on provided keys
    prefix_len = 0
    if ledger_data.get('sub_group_3'): prefix_len = 14
    elif ledger_data.get('sub_group_2'): prefix_len = 12
    elif ledger_data.get('sub_group_1'): prefix_len = 10
    elif ledger_data.get('group'): prefix_len = 8
    elif ledger_data.get('category') or ledger_data.get('major_group'): prefix_len = 6
    
    if prefix_len == 0 or prefix_len >= 16:
        # Can't determine parent or full match -> check collision logic
        if MasterLedger.objects.filter(tenant_id=tenant_id, code=base_code).exists():
             prefix = base_code[:14]
        else:
             return base_code
    else:
        prefix = base_code[:prefix_len]
    
    logger.info(f"🔍 Finding code with prefix {prefix} (Len: {len(prefix)})")

    # Reconstruct from prefix + 00s (Target 14 digits)
    target_stem = prefix.ljust(14, '0')
    
    # Now find max ledger_id (last 2 digits) for this stem
    logger.info(f"🔍 Looking for max ID in stem: {target_stem}")
    
    siblings = MasterLedger.objects.filter(
        tenant_id=tenant_id,
        code__startswith=target_stem
    ).values_list('code', flat=True)
    
    max_val = 0
    for code in siblings:
        if len(code) != 16 or not code.isdigit():
            continue
            
        try:
            val = int(code[14:])
            max_val = max(max_val, val)
        except ValueError:
            continue
            
    next_val = max_val + 1
    new_code = f"{target_stem}{next_val:02d}"
    
    logger.info(f"✅ Generated dynamic flat code: {new_code}")
    return new_code


def _generate_nested_code(ledger_data, tenant_id):
    """
    Generate code for ledger nested under another custom ledger.
    """
    try:
        parent = MasterLedger.objects.get(
            id=ledger_data['parent_ledger_id'],
            tenant_id=tenant_id
        )
        
        if not parent.code:
            logger.warning(
                f"⚠️ Parent ledger {parent.id} has no code, using fallback"
            )
            return _generate_fallback_code(tenant_id)
        
        logger.info(f"✅ Found parent ledger with code: {parent.code}")
        return _generate_next_suffix_code(parent.code, tenant_id)
        
    except MasterLedger.DoesNotExist:
        logger.error(
            f"❌ Parent ledger {ledger_data['parent_ledger_id']} not found"
        )
        return _generate_fallback_code(tenant_id)


def _lookup_exact_hierarchy_code(ledger_data):
    """
    Look up the EXACT code from master_hierarchy_raw table.
    """
    
    # Build WHERE clause based on available hierarchy fields
    conditions = []
    params = []
    
    # Map ledger_data fields to database columns
    field_mapping = {
        'category': 'major_group_1',
        'group': 'group_1',
        'sub_group_1': 'sub_group_1_1',
        'sub_group_2': 'sub_group_2_1',
        'sub_group_3': 'sub_group_3_1',
        'ledger_type': 'ledger_1'
    }
    
    # Collect all non-empty hierarchy fields
    hierarchy_fields = []
    for field, db_column in field_mapping.items():
        value = ledger_data.get(field)
        if value and value.strip():
            hierarchy_fields.append((field, db_column, value.strip()))
    
    if not hierarchy_fields:
        logger.debug("No hierarchy fields provided")
        return None
    
    # Try to find exact match with all provided fields
    logger.debug(f"🔍 Looking up exact code with {len(hierarchy_fields)} hierarchy fields")
    
    for field, db_column, value in hierarchy_fields:
        conditions.append(f"{db_column} = %s")
        params.append(value)
    
    query = f"""
        SELECT code 
        FROM master_hierarchy_raw 
        WHERE {' AND '.join(conditions)}
          AND code IS NOT NULL
          AND code != ''
        LIMIT 1
    """
    
    logger.debug(f"Query: {query}")
    logger.debug(f"Params: {params}")
    
    with connection.cursor() as cursor:
        cursor.execute(query, params)
        row = cursor.fetchone()
        
        if row and row[0]:
            exact_code = row[0].strip()
            logger.info(
                f"✅ Found EXACT hierarchy code: {exact_code} "
                f"(matched {len(hierarchy_fields)} fields)"
            )
            return exact_code
    
    # If no exact match, try progressively less specific matches
    logger.debug("No exact match found, trying less specific matches...")
    
    # Try removing fields from the end one by one
    for i in range(len(hierarchy_fields) - 1, 0, -1):
        conditions = []
        params = []
        
        for field, db_column, value in hierarchy_fields[:i]:
            conditions.append(f"{db_column} = %s")
            params.append(value)
        
        query = f"""
            SELECT code 
            FROM master_hierarchy_raw 
            WHERE {' AND '.join(conditions)}
              AND code IS NOT NULL
              AND code != ''
            LIMIT 1
        """
        
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            row = cursor.fetchone()
            
            if row and row[0]:
                exact_code = row[0].strip()
                logger.info(
                    f"✅ Found hierarchy code: {exact_code} "
                    f"(matched {i} fields)"
                )
                return exact_code
    
    logger.warning("⚠️ No hierarchy code found for any combination")
    return None


def _generate_next_suffix_code(base_code, tenant_id):
    """
    Generate next available code with format: {base_code}.{sequence}
    """
    query_prefix = f"{base_code}."
    
    logger.debug(f"🔍 Finding siblings with prefix: {query_prefix}")
    
    # Find all direct children (codes starting with base_code.)
    siblings = MasterLedger.objects.filter(
        tenant_id=tenant_id,
        code__startswith=query_prefix
    ).values_list('code', flat=True)
    
    logger.debug(f"Found {len(siblings)} existing siblings")
    
    max_suffix = 0
    for code in siblings:
        if code.startswith(query_prefix):
            # Extract the immediate suffix after base_code
            remainder = code[len(query_prefix):]
            # Only consider direct children (no additional dots in first segment)
            parts = remainder.split('.')
            if parts and parts[0].isdigit():
                try:
                    suffix_num = int(parts[0])
                    max_suffix = max(max_suffix, suffix_num)
                    logger.debug(f"  - Found suffix: {suffix_num} in code: {code}")
                except ValueError:
                    logger.warning(f"  - Invalid suffix in code: {code}")
                    continue
    
    next_code = f"{base_code}.{max_suffix + 1:03d}"
    logger.info(
        f"✅ Generated suffix code: {next_code} "
        f"(max existing suffix: {max_suffix})"
    )
    return next_code


def _generate_fallback_code(tenant_id):
    """
    Generate fallback code in 9000+ range for unclassified ledgers.
    """
    logger.debug("🔍 Finding max code in fallback range (9000-9999)")
    
    # Find max code in custom range (9000-9999, flat codes only)
    max_ledger = MasterLedger.objects.filter(
        tenant_id=tenant_id,
        code__regex=r'^9\d{3}$'  # Match 9000-9999 only (no dots)
    ).aggregate(Max('code'))
    
    max_code_value = max_ledger.get('code__max')
    
    if max_code_value:
        try:
            next_code = str(int(max_code_value) + 1)
            logger.info(
                f"✅ Generated fallback code: {next_code} "
                f"(previous max: {max_code_value})"
            )
            return next_code
        except ValueError:
            logger.error(f"❌ Invalid max code value: {max_code_value}")
    
    logger.info("✅ Using default fallback code: 9001")
    return "9001"


# ============================================================================
# NEW: Hierarchical Code Generation Utilities (16-Digit System)
# ============================================================================

def generate_hierarchy_code(levels: dict) -> str:
    """
    Generate a 16-digit hierarchical code.
    Each level is represented by 2 digits (zero-padded).
    """
    return (
        f"{levels.get('type_of_business', 0):02d}"
        f"{levels.get('financial_reporting', 0):02d}"
        f"{levels.get('major_group', 0):02d}"
        f"{levels.get('group', 0):02d}"
        f"{levels.get('sub_group1', 0):02d}"
        f"{levels.get('sub_group2', 0):02d}"
        f"{levels.get('sub_group3', 0):02d}"
        f"{levels.get('ledger_id', 0):02d}"
    )


def add_new_hierarchy_node(levels: dict, level_name: str, new_value: int) -> str:
    """
    Add a new node at ANY level by updating its value and returning the new code.
    """
    updated = levels.copy()
    updated[level_name] = new_value
    return generate_hierarchy_code(updated)
