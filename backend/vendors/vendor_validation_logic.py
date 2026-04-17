import logging
import re
from .models import VendorMasterBasicDetail, VendorMasterGSTDetails

logger = logging.getLogger(__name__)

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

def validate_vendor_strict(tenant_id, gstin, branch):
    """
    Implements STRICT vendor validation using BOTH GSTIN and Branch.
    Query condition:
    WHERE vendor.gstin = input.gstin
    AND normalized(vendor.branch) = normalized(input.branch)
    """
    v_gstin = (gstin or "").strip().upper()
    v_branch = normalize_branch(branch or "Main Branch")
    
    # Logging for debugging
    logger.info(f"Vendor Strict Match - Normalized GSTIN: {v_gstin}")
    logger.info(f"Vendor Strict Match - Normalized Branch: {v_branch}")
    
    # Match primarily by GSTIN
    gst_records = VendorMasterGSTDetails.objects.filter(
        tenant_id=tenant_id,
        gstin__iexact=v_gstin,
        vendor_basic_detail__isnull=False
    ).select_related('vendor_basic_detail')
    
    match_found = None
    for record in gst_records:
        # Standardize empty branch to "Main Branch" in DB matching
        db_branch_raw = record.reference_name or "Main Branch"
        if normalize_branch(db_branch_raw) == v_branch:
            match_found = record
            break
            
    if match_found:
        logger.info("Match result: EXISTING_VENDOR")
        return {
            "status": "EXISTING_VENDOR",
            "vendor_id": match_found.vendor_basic_detail.id
        }
    
    logger.info("Match result: CREATE_VENDOR")
    return {
        "status": "CREATE_VENDOR"
    }

def validate_vendor(tenant_id, vendor_name, gstin, branch='', address='', state='', supplier_invoice_no=''):
    """
    STRICT Refactor of the existing vendor validation logic.
    Refactored ONLY the validation layer.
    Return structure kept compatible but statuses updated to EXISTING_VENDOR/CREATE_VENDOR.
    """
    return validate_vendor_strict(tenant_id, gstin, branch)



