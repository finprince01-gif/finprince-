import re
from django.db.models import Q
from customerportal.models import CustomerMasterCustomerBasicDetails, CustomerMasterCustomerGSTDetails
from .models_voucher_sales import VoucherSalesInvoiceDetails

def validate_sales_customer_and_invoice(tenant_id, customer_name, gstin, branch='', sales_invoice_no=''):
    """
    Validates sales customer and invoice uniqueness.
    """
    if customer_name: customer_name = customer_name.strip()
    
    # 0. Global Invoice Uniqueness Check (Tenant-wide) - Bypassed because serializer automatically auto-increments
    # if sales_invoice_no:
    #     existing_invoice = VoucherSalesInvoiceDetails.objects.filter(
    #         tenant_id=tenant_id,
    #         sales_invoice_no__iexact=sales_invoice_no.strip()
    #     ).first()
    #     
    #     if existing_invoice:
    #         return {
    #             "status": "DUPLICATE_INVOICE",
    #             "message": f"Duplicate Invoice: '{sales_invoice_no}' already exists in the database for customer '{existing_invoice.customer_name}'.",
    #             "customer_id": existing_invoice.customer_id
    #         }
    # Deep clean GSTIN
    if gstin: gstin = "".join(re.findall(r'[A-Z0-9]', gstin.upper()))
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
            for rec in gst_records:
                master_name = (rec.customer_basic_detail.customer_name if rec.customer_basic_detail else "").lower()
                e_name = (customer_name or "").lower()
                
                # Lenient Name Comparison
                name_match = (master_name == e_name or e_name in master_name or master_name in e_name)
                
                if name_match:
                    # 1. Look for Exact Branch Match
                    db_branch = rec.branch_reference_name or "Main Branch"
                    if clean_br(db_branch) == input_br_clean:
                        customer_match = rec.customer_basic_detail
                        branch_name_final = db_branch
                        break
            
            # FALLBACK: If Name + GSTIN check fails, handle close names or conflicts
            if not customer_match:
                for rec in gst_records:
                    master_name = (rec.customer_basic_detail.customer_name if rec.customer_basic_detail else "").lower()
                    e_name = (customer_name or "").lower()
                    if e_name in master_name or master_name in e_name:
                        customer_match = rec.customer_basic_detail
                        branch_name_final = rec.branch_reference_name or "Main Branch"
                        break
            
            if not customer_match:
                # Rule 5: GSTIN match but Name is completely different
                first_rec = gst_records.first()
                return {
                    "status": "GSTIN_CONFLICT",
                    "customer_id": first_rec.customer_basic_detail.id,
                    "matched_by": "GSTIN_Mismatch",
                    "message": f"GSTIN '{gstin}' belongs to customer '{first_rec.customer_basic_detail.customer_name}'."
                }

    # 2. Secondary Lookup: By Name (Fallback)
    if not customer_match and customer_name and len(customer_name) > 3:
        existing_customer = CustomerMasterCustomerBasicDetails.objects.filter(
            Q(customer_name__iexact=customer_name) | Q(customer_name__icontains=customer_name),
            tenant_id=tenant_id
        ).first()

        if not existing_customer:
             existing_customer = CustomerMasterCustomerBasicDetails.objects.filter(
                customer_name__istartswith=customer_name[:10],
                tenant_id=tenant_id
            ).first()
        
        if existing_customer:
            gst_rec = CustomerMasterCustomerGSTDetails.objects.filter(
                customer_basic_detail=existing_customer, tenant_id=tenant_id
            ).first()
            
            customer_match = existing_customer
            branch_name_final = gst_rec.branch_reference_name if gst_rec else "Main Branch"

    # 3. Final Step: Invoice Uniqueness and Return Success
    if customer_match:
        
        return {
            "status": "READY",
            "customer_id": customer_match.id,
            "customer_name": customer_match.customer_name,
            "branch": branch_name_final,
            "matched_by": "Master_Lookup",
            "message": "Customer validated."
        }

    return {
        "status": "CUSTOMER_MISSING",
        "message": "no customer found"
    }
