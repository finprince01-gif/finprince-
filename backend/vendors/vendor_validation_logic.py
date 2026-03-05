from .models import VendorMasterBasicDetail, VendorMasterGSTDetails

def validate_vendor(tenant_id, vendor_name, gstin, branch='', address='', state=''):
    """
    Core vendor validation logic shared between API and Bulk Scan.
    Matches specifically against Vendor Master Basic Detail and GST Details.
    """
    if vendor_name: vendor_name = vendor_name.strip()
    if gstin: gstin = gstin.strip().upper()
    if branch: branch = branch.strip()
    if state: state = state.strip()
    if address: address = address.strip()

    # Helper: Check if found record is consistent with provided info
    def check_consistency(record, prov_name, prov_gstin, prov_branch, prov_state):
        vendor = record.vendor_basic_detail
        conflicts = []
        
        if prov_name and vendor.vendor_name.lower() != prov_name.lower() and record.legal_name.lower() != prov_name.lower():
             conflicts.append(f"Name mismatch: Master '{vendor.vendor_name}' vs Invoice '{prov_name}'")
        
        if prov_gstin and record.gstin.upper() != prov_gstin.upper():
             conflicts.append(f"GSTIN mismatch: Master '{record.gstin}' vs Invoice '{prov_gstin}'")
             
        if prov_branch and record.reference_name and record.reference_name.lower() != prov_branch.lower():
             conflicts.append(f"Branch mismatch: Master '{record.reference_name}' vs Invoice '{prov_branch}'")

        if prov_state and record.gst_state and record.gst_state.lower() != prov_state.lower():
             conflicts.append(f"State mismatch: Master '{record.gst_state}' vs Invoice '{prov_state}'")
             
        return conflicts

    # Step 1: Match by GSTIN (STRICT ORDER)
    if gstin:
        gst_record = None
        # Try GSTIN + Branch
        if branch:
            gst_record = VendorMasterGSTDetails.objects.filter(
                tenant_id=tenant_id, gstin__iexact=gstin, reference_name__iexact=branch
            ).select_related('vendor_basic_detail').first()
        
        # Then try GSTIN + Address
        if not gst_record and address:
            gst_record = VendorMasterGSTDetails.objects.filter(
                tenant_id=tenant_id, gstin__iexact=gstin, branch_address__icontains=address
            ).select_related('vendor_basic_detail').first()
        
        # Fallback to GSTIN only
        if not gst_record:
            gst_record = VendorMasterGSTDetails.objects.filter(
                tenant_id=tenant_id, gstin__iexact=gstin
            ).select_related('vendor_basic_detail').first()
        
        if gst_record and gst_record.vendor_basic_detail:
            conflicts = check_consistency(gst_record, vendor_name, gstin, branch, state)
            if conflicts:
                return {
                    "status": "GSTIN_CONFLICT",
                    "message": "Found by GSTIN but details differ: " + " | ".join(conflicts),
                    "vendor_id": gst_record.vendor_basic_detail.id,
                    "vendor_name": gst_record.vendor_basic_detail.vendor_name,
                    "gstin": gstin
                }
            
            return {
                "status": "FOUND",
                "matched_by": "GSTIN",
                "vendor_id": gst_record.vendor_basic_detail.id,
                "vendor_name": gst_record.vendor_basic_detail.vendor_name,
                "branch": gst_record.reference_name,
                "gstin": gstin
            }

    # Step 2: Match by exact vendor name
    if vendor_name:
        # Try Name + Branch
        if branch:
            gst_record = VendorMasterGSTDetails.objects.filter(
                tenant_id=tenant_id,
                vendor_basic_detail__vendor_name__iexact=vendor_name,
                reference_name__iexact=branch
            ).select_related('vendor_basic_detail').first()
            if gst_record:
                conflicts = check_consistency(gst_record, vendor_name, gstin, branch, state)
                if conflicts:
                    return {
                        "status": "GSTIN_CONFLICT",
                        "message": "Found by Name & Branch but details differ: " + " | ".join(conflicts),
                        "vendor_id": gst_record.vendor_basic_detail.id,
                        "vendor_name": gst_record.vendor_basic_detail.vendor_name,
                        "gstin": gstin
                    }
                return {
                    "status": "FOUND",
                    "matched_by": "Name_Branch",
                    "vendor_id": gst_record.vendor_basic_detail.id,
                    "vendor_name": gst_record.vendor_basic_detail.vendor_name,
                    "branch": gst_record.reference_name,
                    "gstin": gst_record.gstin
                }

        # Try Name + Address
        if address:
            gst_record = VendorMasterGSTDetails.objects.filter(
                tenant_id=tenant_id,
                vendor_basic_detail__vendor_name__iexact=vendor_name,
                branch_address__icontains=address
            ).select_related('vendor_basic_detail').first()
            if gst_record:
                conflicts = check_consistency(gst_record, vendor_name, gstin, branch, state)
                if conflicts:
                    return {
                        "status": "GSTIN_CONFLICT",
                        "message": "Found by Name & Address but details differ: " + " | ".join(conflicts),
                        "vendor_id": gst_record.vendor_basic_detail.id,
                        "vendor_name": gst_record.vendor_basic_detail.vendor_name,
                        "branch": gst_record.reference_name,
                        "gstin": gst_record.gstin
                    }
                return {
                    "status": "FOUND",
                    "matched_by": "Name_Address",
                    "vendor_id": gst_record.vendor_basic_detail.id,
                    "vendor_name": gst_record.vendor_basic_detail.vendor_name,
                    "branch": gst_record.reference_name,
                    "gstin": gst_record.gstin
                }

        # Last fallback: Name match only
        vendor = VendorMasterBasicDetail.objects.filter(
            tenant_id=tenant_id,
            vendor_name__iexact=vendor_name
        ).first()
        
        if vendor:
            # If we found it by name but a GSTIN or Branch was provided, check if ANY of their registrations match
            if gstin or branch:
                q = VendorMasterGSTDetails.objects.filter(vendor_basic_detail=vendor)
                if gstin: q = q.filter(gstin__iexact=gstin)
                if branch: q = q.filter(reference_name__iexact=branch)
                
                specific_gst = q.first()
                if not specific_gst:
                    # It's a conflict because they exist but this specific GSTIN/Branch combination doesn't
                    return {
                        "status": "GSTIN_CONFLICT",
                        "message": f"Vendor '{vendor.vendor_name}' exists, but the provided GSTIN/Branch info does not match any registered location.",
                        "vendor_id": vendor.id,
                        "vendor_name": vendor.vendor_name,
                        "gstin": gstin
                    }
                
                # Check consistency of the one we found
                conflicts = check_consistency(specific_gst, vendor_name, gstin, branch, state)
                if conflicts:
                    return {
                        "status": "GSTIN_CONFLICT",
                        "message": "Found by Name but details differ: " + " | ".join(conflicts),
                        "vendor_id": vendor.id,
                        "vendor_name": vendor.vendor_name,
                        "gstin": gstin
                    }

            return {
                "status": "FOUND",
                "matched_by": "Name",
                "vendor_id": vendor.id,
                "vendor_name": vendor.vendor_name,
                "gstin": None
            }
            
    # NOT FOUND
    return {"status": "NOT_FOUND"}
