import re
from django.db.models import Q
from .models import VendorMasterBasicDetail, VendorMasterGSTDetails

def validate_vendor(tenant_id, vendor_name, gstin, branch='', address='', state='', supplier_invoice_no=''):
    """
    Core vendor validation logic following branch-based rules.
    Rules:
    1. vendor_name, gstin, branch all match -> DUPLICATE (Stop)
    2. vendor_name matches, gstin is different -> NEW VENDOR (Allow)
    3. vendor_name, gstin match, branch is different -> NEW VENDOR (Allow)
    4. gstin matches, vendor_name is different -> WARNING (Conflict)
    """
    # Aggressive Name Cleaning for Robust Matching
    def _clean_name(name):
        if not name: return ""
        # Remove dots, commas, hyphens and collapse multiple spaces
        n = re.sub(r'[\.\,\-]', ' ', name.upper())
        # Strip common trailing artifacts (like OCR ellipses)
        n = re.sub(r'[\.\s]+$', '', n)
        return " ".join(n.split())

    c_vendor_name = _clean_name(vendor_name)
    # Deep clean GSTIN: remove spaces, hyphens and make uppercase
    if gstin: gstin = "".join(re.findall(r'[A-Z0-9]', gstin.upper()))
    if branch: branch = branch.strip()
    if not branch: branch = "Main Branch" # Default as per creation logic

    def _check_duplicate_invoice(res_dict):
        if supplier_invoice_no:
            from accounting.models_voucher_purchase import VoucherPurchaseSupplierDetails
            
            v_id = res_dict.get("vendor_id")
            s_inv_no = supplier_invoice_no.strip()

            # 1. Check ERP (Final Vouchers)
            query = VoucherPurchaseSupplierDetails.objects.filter(
                tenant_id=tenant_id,
                vendor_basic_detail_id=v_id,
                supplier_invoice_no__iexact=s_inv_no
            )
            
            # Refine with GSTIN if available
            mapped_gstin = res_dict.get("gstin") or gstin
            if mapped_gstin:
                query = query.filter(gstin__iexact=mapped_gstin.strip())

            if query.exists():
                return {
                    "status": "DUPLICATE_INVOICE",
                    "message": f"DUPLICATE ERROR: Invoice number '{s_inv_no}' already exists in your ERP records.",
                    "vendor_id": v_id,
                    "vendor_name": res_dict.get('vendor_name', vendor_name),
                }

            # 2. Check Staging (Unsent Scans)
            from django.db import connection
            try:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT file_path 
                        FROM   invoice_ocr_temp 
                        WHERE  tenant_id = %s 
                          AND  vendor_id = %s 
                          AND  supplier_invoice_no = %s
                          AND  processed = FALSE
                        LIMIT 1
                        """,
                        [tenant_id, v_id, s_inv_no]
                    )
                    staged_row = cursor.fetchone()
                    if staged_row:
                        return {
                            "status": "DUPLICATE_INVOICE",
                            "message": f"DUPLICATE WARNING: This invoice ('{s_inv_no}') is already being processed/staged from file '{staged_row[0]}'.",
                            "vendor_id": v_id,
                            "vendor_name": res_dict.get('vendor_name', vendor_name),
                        }
            except Exception as e:
                pass # Fallback to no staging check on DB error

        return res_dict

    # Rule 1 & 4 (GSTIN-led Validation)
    if gstin:
        gst_records = VendorMasterGSTDetails.objects.filter(
            tenant_id=tenant_id, gstin__iexact=gstin
        ).select_related('vendor_basic_detail')

        if gst_records.exists():
            for rec in gst_records:
                master_name_raw = rec.vendor_basic_detail.vendor_name if rec.vendor_basic_detail else ""
                master_name_clean = _clean_name(master_name_raw)
                
                # Lenient Name Comparison: Match if one is a substring of the other or exact
                name_match = (master_name_clean == c_vendor_name or c_vendor_name in master_name_clean or master_name_clean in c_vendor_name)
                
                if name_match:
                    # 1. Look for Exact Branch Match
                    db_branch = rec.reference_name or "Main Branch"
                    if db_branch.lower() == branch.lower():
                        res = {
                            "status": "FOUND",
                            "matched_by": "GSTIN_Branch_Exact",
                            "vendor_id": rec.vendor_basic_detail.id,
                            "vendor_name": rec.vendor_basic_detail.vendor_name,
                            "gstin": gstin,
                            "branch": db_branch
                        }
                        return _check_duplicate_invoice(res)
                
            # 2. FALLBACK 1: If we found a GSTIN record and the name is "Close Enough" (substring),
            # use the first one found instead of failing or conflicting.
            for rec in gst_records:
                master_name_raw = rec.vendor_basic_detail.vendor_name if rec.vendor_basic_detail else ""
                master_name_clean = _clean_name(master_name_raw)
                if c_vendor_name in master_name_clean or master_name_clean in c_vendor_name:
                    res = {
                        "status": "FOUND",
                        "matched_by": "GSTIN_Name_Lenient",
                        "vendor_id": rec.vendor_basic_detail.id,
                        "vendor_name": rec.vendor_basic_detail.vendor_name,
                        "gstin": gstin,
                        "branch": rec.reference_name or "Main Branch"
                    }
                    return _check_duplicate_invoice(res)
            
            # Rule 4: GSTIN matches but Name is completely different (Conflict)
            first_rec = gst_records.first()
            return {
                "status": "GSTIN_CONFLICT",
                "message": f"WARNING: GSTIN '{gstin}' belongs to '{first_rec.vendor_basic_detail.vendor_name}', not '{vendor_name}'.",
                "vendor_id": first_rec.vendor_basic_detail.id,
                "vendor_name": first_rec.vendor_basic_detail.vendor_name,
                "gstin": gstin
            }

    # Rule 2: Match by Name (Fallback) — use icontains for robustness
    if c_vendor_name and len(c_vendor_name) > 3:
        # 1. First try direct match (exact or icontains)
        existing_vendor = VendorMasterBasicDetail.objects.filter(
            Q(vendor_name__iexact=c_vendor_name) | Q(vendor_name__icontains=c_vendor_name),
            tenant_id=tenant_id
        ).first()

        # 2. Try matching the START of the name only (robust to "Pvt Ltd" omission)
        if not existing_vendor:
            existing_vendor = VendorMasterBasicDetail.objects.filter(
                vendor_name__istartswith=c_vendor_name[:10], # Match first 10 chars
                tenant_id=tenant_id
            ).first()
        
        if existing_vendor:
            # Look for ANY branch for this vendor
            gst_rec = VendorMasterGSTDetails.objects.filter(
                vendor_basic_detail=existing_vendor, tenant_id=tenant_id
            ).first()
            
            res = {
                "status": "FOUND",
                "matched_by": "Name_Fuzzy",
                "vendor_id": existing_vendor.id,
                "vendor_name": existing_vendor.vendor_name,
                "gstin": gst_rec.gstin if gst_rec else "",
                "branch": gst_rec.reference_name if gst_rec else "Main Branch",
                "message": f"Found vendor by name match: {existing_vendor.vendor_name}"
            }
            return _check_duplicate_invoice(res)

    return {
        "status": "NOT_FOUND",
        "message": "Vendor not found in master records."
    }

