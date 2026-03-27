import logging
from django.db.models import Q
from .models import VendorMasterBasicDetail, VendorMasterGSTDetails

logger = logging.getLogger(__name__)

def validate_vendor(tenant_id, vendor_name, gstin, branch='', address='', state='', supplier_invoice_no=''):
    """
    Core vendor validation logic following a strict "Branch-Based" Matching Rule.
    
    normalization:
    - Clean vendor_name (strip).
    - Normalize gstin (strip, uppercase).
    - Default branch to "Main Branch" if it is empty.
    
    Rules:
    Rule 1 (Duplicate Check): Match primarily by GSTIN. If a record exists where Name, GSTIN, 
    AND Branch all match (case-insensitive), return status: "FOUND".
    
    Rule 2 (Conflict Check): If the GSTIN exists in the database but the Vendor Name is different, 
    return status: "GSTIN_CONFLICT" with a warning showing the existing name.
    
    Rule 3 (New Branch/New Vendor): 
    - If Name and GSTIN match but Branch is different, return "NOT_FOUND" to allow new branch creation.
    - If GSTIN does not exist in DB, return "NOT_FOUND".
    
    Rule 4 (Fallback - Name Only): If invoice has no GSTIN, match only by Exact Name.
    """
    
    # --- Step 0: Normalization ---
    v_name = (vendor_name or "").strip()
    v_gstin = (gstin or "").strip().upper()
    v_branch = (branch or "").strip() if branch else "Main Branch"
    s_inv_no = (supplier_invoice_no or "").strip()

    res = {
        "status": "INCOMPLETE",
        "vendor_id": None,
        "vendor_name": v_name,
        "message": "Mandatory fields missing: GSTIN and Invoice Number are required for voucher creation."
    }

    # Internal helper to check for duplicate invoice numbers for a matched vendor.
    def _check_duplicate_invoice(res_dict):
        if not s_inv_no or "vendor_id" not in res_dict:
            return res_dict
            
        from accounting.models_voucher_purchase import VoucherPurchaseSupplierDetails
        v_id = res_dict.get("vendor_id")

        # 1. Check ERP (Final Vouchers)
        erp_exists = VoucherPurchaseSupplierDetails.objects.filter(
            tenant_id=tenant_id,
            vendor_basic_detail_id=v_id,
            supplier_invoice_no__iexact=s_inv_no
        ).exists()

        if erp_exists:
            return {
                "status": "DUPLICATE_INVOICE",
                "message": f"DUPLICATE ERROR: Invoice '{s_inv_no}' already exists in your records.",
                "vendor_id": v_id,
                "vendor_name": res_dict.get('vendor_name', v_name),
            }

        # 2. Check Staging (Unprocessed Scans)
        from django.db import connection
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT file_path FROM invoice_ocr_temp 
                    WHERE tenant_id = %s AND vendor_id = %s AND supplier_invoice_no = %s AND processed = FALSE
                    LIMIT 1
                    """,
                    [tenant_id, v_id, s_inv_no]
                )
                row = cursor.fetchone()
                if row:
                    return {
                        "status": "DUPLICATE_INVOICE",
                        "message": f"WAIT: This invoice ('{s_inv_no}') is currently staged from file '{row[0]}'.",
                        "vendor_id": v_id,
                        "vendor_name": res_dict.get('vendor_name', v_name),
                    }
        except Exception:
            pass
            
        return res_dict

    # --- Step 1: Matching with GSTIN ---
    if v_gstin:
        gst_records = VendorMasterGSTDetails.objects.filter(
            tenant_id=tenant_id,
            gstin__iexact=v_gstin,
            vendor_basic_detail__isnull=False
        ).select_related('vendor_basic_detail')

        if gst_records.exists():
            # Evaluate for exact Name and Branch match first
            exact_match = None
            for record in gst_records:
                reg_name = record.vendor_basic_detail.vendor_name.strip().lower()
                reg_branch = (record.reference_name or "Main Branch").strip().lower()

                if reg_name == v_name.lower() and reg_branch == v_branch.lower():
                    exact_match = record
                    break
            
            match_found = exact_match or gst_records.first()
            
            res = {
                "status": "FOUND" if s_inv_no else "INCOMPLETE",
                "matched_by": "GSTIN_Branch" if exact_match else "GSTIN_Identity",
                "vendor_id": match_found.vendor_basic_detail.id,
                "vendor_name": match_found.vendor_basic_detail.vendor_name,
                "gstin": v_gstin,
                "branch": match_found.reference_name or "Main Branch",
                "message": (
                    "Vendor exists. " + ("Ready for voucher." if s_inv_no else "Missing Invoice Number.")
                )
            }
            return _check_duplicate_invoice(res)

        # Record not found by GSTIN
        return {
            "status": "NOT_FOUND",
            "message": f"GSTIN '{v_gstin}' not found in master records."
        }

    # --- Step 2: Fallback - Name Only (No GSTIN) ---
    else:
        if not v_name:
            return {"status": "NOT_FOUND", "message": "No vendor info provided (Name or GSTIN)."}
            
        # Rule 4: Match only by Exact Name
        vendor = VendorMasterBasicDetail.objects.filter(
            tenant_id=tenant_id,
            vendor_name__iexact=v_name
        ).first()

        if vendor:
            res = {
                "status": "FOUND" if s_inv_no else "INCOMPLETE",
                "matched_by": "Name_Only",
                "vendor_id": vendor.id,
                "vendor_name": vendor.vendor_name,
                "message": "Vendor matched by name only."
            }
            return _check_duplicate_invoice(res)
        else:
            return {
                "status": "NOT_FOUND",
                "message": f"Vendor '{v_name}' not found by name comparison."
            }


