from .models import VendorMasterBasicDetail, VendorMasterGSTDetails

def validate_vendor(tenant_id, vendor_name, gstin, branch='', address='', state=''):
    """
    Core vendor validation logic following branch-based rules.
    Rules:
    1. vendor_name, gstin, branch all match -> DUPLICATE (Stop)
    2. vendor_name matches, gstin is different -> NEW VENDOR (Allow)
    3. vendor_name, gstin match, branch is different -> NEW VENDOR (Allow)
    4. gstin matches, vendor_name is different -> WARNING (Conflict)
    """
    if vendor_name: vendor_name = vendor_name.strip()
    if gstin: gstin = gstin.strip().upper()
    if branch: branch = branch.strip()
    if not branch: branch = "Main Branch" # Default as per creation logic

    # Rule 1, 3, 4: Match primarily by GSTIN
    if gstin:
        gst_records = VendorMasterGSTDetails.objects.filter(
            tenant_id=tenant_id, gstin__iexact=gstin
        ).select_related('vendor_basic_detail')

        if gst_records.exists():
            # Check for Rule 1 (Duplicate)
            for rec in gst_records:
                master_name = rec.vendor_basic_detail.vendor_name if rec.vendor_basic_detail else ""
                db_branch = rec.reference_name or "Main Branch"
                
                name_match = (master_name.lower() == vendor_name.lower())
                branch_match = (db_branch.lower() == branch.lower())
                
                if name_match and branch_match:
                    return {
                        "status": "FOUND",
                        "matched_by": "GSTIN_Branch",
                        "message": "Duplicate Vendor: Name, GSTIN and Branch all match an existing record.",
                        "vendor_id": rec.vendor_basic_detail.id,
                        "vendor_name": master_name,
                        "gstin": gstin,
                        "branch": db_branch
                    }
            
            # Check for Rule 3 (Name/GSTIN match, different branch)
            for rec in gst_records:
                master_name = rec.vendor_basic_detail.vendor_name if rec.vendor_basic_detail else ""
                if master_name.lower() == vendor_name.lower():
                    # Name and GSTIN match, but branch is different (already checked Rule 1)
                    return {
                        "status": "NOT_FOUND",
                        "message": "New Vendor: Name and GSTIN match but Branch is different. Allowing creation."
                    }
            
            # Rule 4: GSTIN matches but Name is different
            # We look for the first valid vendor linked to this GSTIN to show in the conflict message
            for rec in gst_records:
                if rec.vendor_basic_detail:
                    return {
                        "status": "GSTIN_CONFLICT",
                        "message": f"WARNING: GSTIN '{gstin}' already exists for another vendor: '{rec.vendor_basic_detail.vendor_name}'.",
                        "vendor_id": rec.vendor_basic_detail.id,
                        "vendor_name": rec.vendor_basic_detail.vendor_name,
                        "gstin": gstin
                    }

    # Rule 2: Match by Name (only if GSTIN didn't result in duplicate/conflict)
    if vendor_name:
        existing_vendor = VendorMasterBasicDetail.objects.filter(
            tenant_id=tenant_id, vendor_name__iexact=vendor_name
        ).first()
        
        if existing_vendor:
            if not gstin:
                # The invoice lacks a GSTIN, but the name perfectly matches a master vendor.
                # Don't force them to create it again; link to the existing match.
                return {
                    "status": "FOUND",
                    "matched_by": "Name_Only",
                    "message": "Matched unconditionally by exact Vendor Name (no GSTIN on invoice).",
                    "vendor_id": existing_vendor.id,
                    "vendor_name": existing_vendor.vendor_name,
                    "gstin": "",
                    "branch": branch
                }
            else:
                # The invoice has a GSTIN, but the user's master vendor details lack that specific GSTIN record. 
                # (Or it's an unregistered vendor in the DB). Allow creating a new master/branch record.
                return {
                    "status": "NOT_FOUND",
                    "message": "Vendor name matches but GSTIN is different or missing in master. Allowing creation of new GSTIN details."
                }

    # NOT FOUND
    return {"status": "NOT_FOUND"}
