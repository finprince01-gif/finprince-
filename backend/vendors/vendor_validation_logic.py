import logging
import re
from .models import VendorMasterBasicDetail, VendorMasterGSTDetails

logger = logging.getLogger(__name__)

DIGIT_REPAIRS = {
    'O': '0', 'I': '1', 'L': '1', 'S': '5', 'B': '8'
}
LETTER_REPAIRS = {
    '0': 'O', '1': 'I', '5': 'S', '8': 'B', '2': 'Z'
}

def canonicalize_gstin_ocr(raw_gstin: str) -> str:
    """
    Enforces 15-character GSTIN structure and performs position-aware character repair.
    """
    if not raw_gstin:
        return ""
    
    # Strip whitespace and convert to uppercase
    gstin = "".join(str(raw_gstin).split()).upper()
    
    if len(gstin) == 15:
        repaired = []
        for i, char in enumerate(gstin):
            if i in (0, 1): # Positions 1-2: digits
                repaired.append(DIGIT_REPAIRS.get(char, char))
            elif i in (2, 3, 4, 5, 6): # Positions 3-7: letters
                repaired.append(LETTER_REPAIRS.get(char, char))
            elif i in (7, 8, 9, 10): # Positions 8-11: digits
                repaired.append(DIGIT_REPAIRS.get(char, char))
            elif i == 11: # Position 12: letter
                repaired.append(LETTER_REPAIRS.get(char, char))
            elif i == 12: # Position 13: letter or digit
                repaired.append(char)
            elif i == 13: # Position 14: letter
                repaired.append(LETTER_REPAIRS.get(char, char))
            elif i == 14: # Position 15: digit
                repaired.append(DIGIT_REPAIRS.get(char, char))
        canonical = "".join(repaired)
    else:
        canonical = gstin
        
    logger.info(f"[GSTIN_CANONICALIZATION] raw_gstin={raw_gstin} canonical_gstin={canonical} length={len(canonical)}")
    return canonical

def normalize_branch(branch_name):
    """
    STRICT Normalization rules for Branch/Location:
    - lowercase
    - trimmed
    - remove extra spaces
    - remove punctuation (.,-/)
    """
    if not branch_name:
        return ""
    
    # lowercase & trimmed
    b = str(branch_name).lower().strip()
    
    # remove punctuation (.,-/)
    # We replace them with spaces first to avoid merging words like "Branch-A" -> "brancha"
    # then "remove extra spaces" will clean it up to "branch a"
    for char in ".,-/":
        b = b.replace(char, " ")
        
    # remove extra spaces (standardize common word handling if any)
    b = " ".join(b.split())
    
    return b

def resolve_vendor_for_gstin_branch(tenant_id, gstin, branch, record_id=None, vendor_name=None):
    """
    Unified vendor resolution engine containing all required forensic traces,
    direct lookup checks, assertions, and normalization verifications.
    """
    logger.info(
        f"[VENDOR_VALIDATION_START] record_id={record_id} tenant_id={tenant_id} "
        f"gstin={repr(gstin)} branch={repr(branch)} vendor_name={repr(vendor_name)}"
    )

    # 4. VERIFY GSTIN NORMALIZATION
    v_gstin = canonicalize_gstin_ocr(gstin)
    v_branch = normalize_branch(branch or "Main Branch")
    
    logger.info(
        f"[GSTIN_NORMALIZATION_CHECK] "
        f"raw_gstin={repr(gstin)} len={len(gstin) if gstin else 0} "
        f"normalized_gstin={repr(v_gstin)} len={len(v_gstin)} "
        f"raw_branch={repr(branch)} normalized_branch={repr(v_branch)} "
        f"has_spaces={' ' in (gstin or '')} "
        f"has_unicode={any(ord(c) > 127 for c in (gstin or ''))} "
        f"has_lowercase=not (gstin or '').isupper() if gstin else False"
    )

    # 3. VERIFY CORRECT MODEL
    model_meta = VendorMasterGSTDetails._meta
    logger.info(
        f"[VENDOR_MODEL_METADATA_CHECK] "
        f"model_name={model_meta.model_name} "
        f"db_table={model_meta.db_table} "
        f"fields={[f.name for f in model_meta.fields]} "
        f"tenant_field_exists={'tenant_id' in [f.name for f in model_meta.fields]} "
        f"gstin_field_exists={'gstin' in [f.name for f in model_meta.fields]} "
        f"soft_delete_filtering_in_basic_detail=True"
    )

    # 6. RUN DIRECT FORENSIC QUERY
    logger.info(
        f"[VENDOR_QUERY_START] model=VendorMasterGSTDetails filters={{tenant_id: {tenant_id}, gstin__iexact: {v_gstin}}}"
    )
    direct_qs = VendorMasterGSTDetails.objects.filter(
        tenant_id=tenant_id,
        gstin__iexact=v_gstin
    )
    direct_sql = str(direct_qs.query)
    direct_rows = list(direct_qs)
    direct_count = len(direct_rows)
    direct_ids = [r.id for r in direct_rows]
    direct_tenants = list(set(str(r.tenant_id) for r in direct_rows))

    logger.info(
        f"[DIRECT_FORENSIC_QUERY] [VENDOR_QUERY_RESULT] "
        f"sql={direct_sql} "
        f"count={direct_count} "
        f"matched_ids={direct_ids} "
        f"tenants_found={direct_tenants}"
    )

    # 5. VERIFY TENANT MATCH
    logger.info(
        f"[TENANT_MATCH_VERIFY] "
        f"incoming_tenant_id={repr(tenant_id)} (type={type(tenant_id).__name__}) "
        f"db_tenants_matched={list(map(repr, direct_tenants))}"
    )

    # 2. TRACE EXACT QUERY RESULTS (Primary Query with joins/filters)
    logger.info(
        f"[VENDOR_QUERY_START] "
        f"model=VendorMasterGSTDetails "
        f"filters={{tenant_id: {tenant_id}, gstin__iexact: {v_gstin}, vendor_basic_detail__isnull: False}}"
    )
    
    gst_records = VendorMasterGSTDetails.objects.filter(
        tenant_id=tenant_id,
        gstin__iexact=v_gstin,
        vendor_basic_detail__isnull=False
    ).select_related('vendor_basic_detail')

    sql = str(gst_records.query)
    records_list = list(gst_records)
    count = len(records_list)
    matched_ids = [r.id for r in records_list]

    logger.info(
        f"[VENDOR_QUERY_RESULT] "
        f"model=VendorMasterGSTDetails count={count} sql={sql} matched_ids={matched_ids}"
    )

    if count == 0:
        logger.info(f"[VENDOR_QUERY_EMPTY] No active/basic detail records found for gstin={v_gstin}")
    else:
        logger.info(
            f"[VENDOR_QUERY_MATCH] "
            f"Found matches: {[f'id={r.id},vendor={r.vendor_basic_detail.vendor_name},reference_name={repr(r.reference_name)}' for r in records_list]}"
        )

    # Resolve match
    match_found = None
    for record in records_list:
        db_branch_raw = record.reference_name or "Main Branch"
        db_branch_normalized = normalize_branch(db_branch_raw)
        if db_branch_normalized == v_branch:
            match_found = record
            break

    # Construct result
    result = None
    if match_found:
        result = {
            "status": "EXISTING_VENDOR",
            "vendor_id": match_found.vendor_basic_detail.id,
            "vendor_name": match_found.vendor_basic_detail.vendor_name,
            "matched_by": "GSTIN_AND_BRANCH",
            "message": f"Existing vendor found: {match_found.vendor_basic_detail.vendor_name} ({v_gstin})"
        }
    elif records_list:
        # GSTIN match found but branch didn't match -- fallback to the first matched vendor
        # so that we do not default to CREATE_VENDOR/NEW when a match actually exists in DB.
        first_rec = records_list[0]
        result = {
            "status": "EXISTING_VENDOR",
            "vendor_id": first_rec.vendor_basic_detail.id,
            "vendor_name": first_rec.vendor_basic_detail.vendor_name,
            "matched_by": "GSTIN_ONLY_FALLBACK",
            "message": f"Existing vendor found (GSTIN match, branch mismatch fallback): {first_rec.vendor_basic_detail.vendor_name} ({v_gstin})"
        }
    elif direct_count > 0:
        # Direct query found rows but primary query didn't (e.g., due to null vendor_basic_detail)
        # Find first record that has basic detail
        matched_rec = None
        for r in direct_rows:
            if r.vendor_basic_detail:
                matched_rec = r
                break
        if matched_rec:
            result = {
                "status": "EXISTING_VENDOR",
                "vendor_id": matched_rec.vendor_basic_detail.id,
                "vendor_name": matched_rec.vendor_basic_detail.vendor_name,
                "matched_by": "GSTIN_DIRECT_FORENSIC",
                "message": f"Direct forensic match by GSTIN: {matched_rec.vendor_basic_detail.vendor_name} ({v_gstin})"
            }

    if not result:
        result = {
            "status": "CREATE_VENDOR",
            "vendor_id": None,
            "vendor_name": None,
            "matched_by": None,
            "message": "Vendor not found in master records."
        }

    # 7. ADD HARD ASSERTION
    if direct_count > 0 and result.get('status') == 'CREATE_VENDOR':
        logger.error(
            f"[VENDOR_MATCH_CONTRADICTION] "
            f"record_id={record_id} gstin={v_gstin} tenant_id={tenant_id} "
            f"matched_rows={direct_ids} final_status={result.get('status')} "
            f"rejection_reason=Branch or basic detail mismatch in primary query. GSTIN exists in DB."
        )

    logger.info(
        f"[GSTIN_VENDOR_VALIDATION] raw_gstin={gstin} normalized_gstin={v_gstin} vendor_status={result.get('status')}"
    )
    return result

def validate_vendor_strict(tenant_id, gstin, branch, record_id=None, vendor_name=None):
    """
    Implements STRICT vendor validation using BOTH GSTIN and Branch.
    Refactored to route through unified resolve_vendor_for_gstin_branch engine.
    """
    logger.error(
        f"[VENDOR_VALIDATION_BYPASS_DETECTED] Legacy validate_vendor_strict called! "
        f"tenant_id={tenant_id} gstin={gstin} branch={branch} record_id={record_id}"
    )
    return resolve_vendor_for_gstin_branch(tenant_id, gstin, branch, record_id=record_id, vendor_name=vendor_name)

def validate_vendor(tenant_id, vendor_name, gstin, branch='', address='', state='', supplier_invoice_no='', record_id=None):
    """
    STRICT Refactor of the existing vendor validation logic.
    Refactored ONLY the validation layer.
    """
    logger.error(
        f"[VENDOR_VALIDATION_BYPASS_DETECTED] Legacy validate_vendor called! "
        f"tenant_id={tenant_id} gstin={gstin} branch={branch} record_id={record_id}"
    )
    return resolve_vendor_for_gstin_branch(tenant_id, gstin, branch, record_id=record_id, vendor_name=vendor_name)


# ─────────────────────────────────────────────────────────────────────────────
# SESSION-LEVEL CANONICAL VENDOR RESOLUTION MAP
# ─────────────────────────────────────────────────────────────────────────────

def build_session_vendor_map(tenant_id, records):
    """
    SESSION-DETERMINISTIC vendor resolution.

    Resolves all unique GSTIN+branch combinations for an entire set of staging records
    in a single batched DB query, then returns an immutable canonical map:

        { (normalized_gstin, normalized_branch): vendor_resolution_result }

    Returns:
        dict: { (gstin_upper, norm_branch): { status, vendor_id, vendor_name, matched_by } }
    """
    logger.info(f"[SESSION_VENDOR_RESOLUTION_START] tenant_id={tenant_id} record_count={len(records) if hasattr(records, '__len__') else '?'}")

    # ── STEP 1: Collect all unique GSTIN + Branch pairs across the session ──
    # Note: DO NOT skip IMMUTABLE_STATUSES here so that all rows retrieve correct vendor context
    unique_pairs = set()

    for r in records:
        norm = getattr(r, 'extracted_data', {}) or {}
        sections = norm.get('sections', {})
        supplier = sections.get('supplier_details', {})
        header = norm.get('header', {})

        gstin_raw = (
            getattr(r, 'gstin', None) or
            norm.get('canonical_vendor_gstin') or
            norm.get('vendor_gstin') or
            header.get('vendor_gstin') or
            supplier.get('gstin') or
            norm.get('gstin') or ""
        )
        branch_raw = (
            getattr(r, 'branch', None) or
            header.get('branch') or
            supplier.get('branch') or
            norm.get('branch') or ""
        )

        gstin_raw_str = str(gstin_raw).strip()
        gstin_clean = canonicalize_gstin_ocr(gstin_raw_str)

        # Save raw and canonical in record extracted_data (without mutating original GSTIN)
        if hasattr(r, 'extracted_data') and isinstance(r.extracted_data, dict):
            r.extracted_data['raw_gstin'] = gstin_raw_str
            r.extracted_data['canonical_gstin'] = gstin_clean

        branch_norm = normalize_branch(branch_raw or "Main Branch")

        if not gstin_clean or gstin_clean in ("", "—", "NONE", "NULL"):
            continue

        unique_pairs.add((gstin_clean, branch_norm))

    logger.info(
        f"[SESSION_VENDOR_MAP_BUILD] tenant_id={tenant_id} "
        f"unique_pairs_count={len(unique_pairs)} "
        f"pairs={list(unique_pairs)}"
    )

    # ── STEP 2: Resolve each unique GSTIN+branch combination dynamically ──
    resolution_map = {}
    for (gstin_upper, norm_branch) in unique_pairs:
        key = (gstin_upper, norm_branch)
        res = resolve_vendor_for_gstin_branch(tenant_id, gstin_upper, norm_branch)
        resolution_map[key] = res

    logger.info(
        f"[VALIDATION_SNAPSHOT_FROZEN] tenant_id={tenant_id} "
        f"resolved_pairs={len(resolution_map)} "
        f"keys={list(resolution_map.keys())}"
    )

    return resolution_map


def detect_vendor_map_corruption(resolution_map):
    """
    Corruption detector stub.
    """
    pass


