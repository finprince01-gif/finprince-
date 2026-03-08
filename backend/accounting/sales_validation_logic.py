from customerportal.models import CustomerMasterCustomerBasicDetails, CustomerMasterCustomerGSTDetails
from .models_voucher_sales import VoucherSalesInvoiceDetails

def validate_sales_customer_and_invoice(tenant_id, customer_name, gstin, branch='', sales_invoice_no=''):
    """
    Validates sales customer and invoice uniqueness.
    
    Rule 1: customer_name, gstin, branch match AND sales_invoice_number exists -> DUPLICATE_INVOICE (Block)
    Rule 2: customer_name, gstin, branch match AND sales_invoice_number is new -> READY (Allow)
    Rule 3: customer_name matches, gstin is different -> CUSTOMER_MISSING (Allow creation of new customer)
    Rule 4: customer_name, gstin match, branch is different -> CUSTOMER_MISSING (Allow creation of new branch)
    Rule 5: gstin matches, customer_name is different -> GSTIN_CONFLICT (Warning)
    """
    if customer_name: customer_name = customer_name.strip()
    if gstin: gstin = gstin.strip().upper()
    if branch: branch = branch.strip()
    
    # Normalizing inputs
    def clean_br(s):
        if not s: return ""
        return s.lower().replace(" branch", "").strip()

    input_br_clean = clean_br(branch)
    
    customer_match = None
    branch_name_final = branch or "Main Branch"

    # 1. Primary Lookup: By GSTIN
    if gstin:
        gst_records = CustomerMasterCustomerGSTDetails.objects.filter(
            tenant_id=tenant_id, gstin__iexact=gstin
        ).select_related('customer_basic_detail')
        
        if gst_records.exists():
            # Check for name match first
            matching_name_recs = [r for r in gst_records if r.customer_basic_detail and r.customer_basic_detail.customer_name.lower() == customer_name.lower()]
            
            if matching_name_recs:
                # Try to find exact branch match
                for rec in matching_name_recs:
                    db_branch = rec.branch_reference_name or "Main Branch"
                    if clean_br(db_branch) == input_br_clean:
                        customer_match = rec.customer_basic_detail
                        branch_name_final = db_branch
                        break
                
                # FALLBACK: If only ONE branch exists for this GSTIN/Customer, allow it regardless of name
                if not customer_match and len(matching_name_recs) == 1:
                    rec = matching_name_recs[0]
                    customer_match = rec.customer_basic_detail
                    branch_name_final = rec.branch_reference_name or "Main Branch"
            
            if not customer_match and matching_name_recs:
                # Rule 4: Name/GSTIN match, but branch name is definitely different and there are multiple options
                others = [r.branch_reference_name or "Main Branch" for r in matching_name_recs]
                return {
                    "status": "CUSTOMER_MISSING",
                    "customer_id": matching_name_recs[0].customer_basic_detail.id,
                    "matched_by": "GSTIN_Name",
                    "message": "no customer created"
                }
            
            if not customer_match:
                # Rule 5: GSTIN match but Name is different
                first_rec = gst_records.first()
                return {
                    "status": "GSTIN_CONFLICT",
                    "customer_id": first_rec.customer_basic_detail.id,
                    "matched_by": "GSTIN_Mismatch",
                    "message": f"GSTIN '{gstin}' belongs to customer '{first_rec.customer_basic_detail.customer_name}' in master records, not '{customer_name}'."
                }

    # 2. Secondary Lookup: By Name (Fallback if GSTIN missing or didn't match)
    if not customer_match:
        existing_customer = CustomerMasterCustomerBasicDetails.objects.filter(
            tenant_id=tenant_id, customer_name__iexact=customer_name
        ).first()
        
        if existing_customer:
            gst_recs = CustomerMasterCustomerGSTDetails.objects.filter(
                customer_basic_detail=existing_customer, tenant_id=tenant_id
            )
            
            # Try exact branch match
            for gr in gst_recs:
                db_br = gr.branch_reference_name or "Main Branch"
                if clean_br(db_br) == input_br_clean:
                    customer_match = existing_customer
                    branch_name_final = db_br
                    break
            
            # FALLBACK: If only ONE branch exists, allow it
            if not customer_match and gst_recs.count() == 1:
                rec = gst_recs.first()
                customer_match = existing_customer
                branch_name_final = rec.branch_reference_name or "Main Branch"
            
            # If still no match and multiple branches exist
            if not customer_match:
                if not gst_recs.exists():
                    # Default to Main Branch for new customers without any branch records
                    if input_br_clean == "main" or not branch:
                        customer_match = existing_customer
                        branch_name_final = "Main Branch"
                    else:
                        return {
                            "status": "CUSTOMER_MISSING",
                            "customer_id": existing_customer.id,
                            "matched_by": "Name_Only",
                            "message": "no customer created"
                        }
                else:
                    others = [r.branch_reference_name or "Main Branch" for r in gst_recs]
                    return {
                        "status": "CUSTOMER_MISSING",
                        "customer_id": existing_customer.id,
                        "matched_by": "Name_Only",
                        "message": "no customer created"
                    }

    # 3. Final Step: Invoice Uniqueness and Return Success
    if customer_match:
        if sales_invoice_no:
            exists = VoucherSalesInvoiceDetails.objects.filter(
                tenant_id=tenant_id,
                customer_id=customer_match.id,
                sales_invoice_no__iexact=sales_invoice_no.strip()
            ).exists()
            
            if exists:
                return {
                    "status": "DUPLICATE_INVOICE",
                    "message": f"Duplicate Invoice: Invoice number '{sales_invoice_no}' already exists for customer '{customer_match.customer_name}'.",
                    "customer_id": customer_match.id
                }
        
        return {
            "status": "READY",
            "customer_id": customer_match.id,
            "customer_name": customer_match.customer_name,
            "branch": branch_name_final,
            "matched_by": "Master_Lookup",
            "message": f"Customer validated for branch '{branch_name_final}'."
        }

    # 4. Default: Not found at all
    return {
        "status": "CUSTOMER_MISSING",
        "message": "no customer created"
    }
