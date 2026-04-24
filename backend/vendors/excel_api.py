import logging
import datetime
import re
from django.db import transaction
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from django.http import HttpResponse
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
import io

from .models import (
    VendorMasterBasicDetail,
    VendorMasterGSTDetails,
    VendorMasterBanking,
    VendorMasterTDS,
    VendorMasterTerms,
    VendorMasterCategory
)
from .vendorproduct_database import VendorProductServiceDatabase
from accounting.models import MasterLedger

logger = logging.getLogger(__name__)

# Column Definitions for Vendor Excel
VENDOR_COLUMNS = [
    {"label": "Vendor Name", "key": "vendor_name", "required": True},
    {"label": "Vendor Code", "key": "vendor_code", "required": False},
    {"label": "Category", "key": "category", "required": False},
    {"label": "PAN Number", "key": "pan_no", "required": False},
    {"label": "Contact Person", "key": "contact_person", "required": False},
    {"label": "Email Address", "key": "email", "required": True},
    {"label": "Contact Number", "key": "contact_no", "required": True},
    {"label": "Billing Currency", "key": "billing_currency", "required": False},
    {"label": "GSTIN", "key": "gstin", "required": False},
    {"label": "Branch Name", "key": "reference_name", "required": False},
    {"label": "Address Line 1", "key": "branch_address_line1", "required": False},
    {"label": "Address Line 2", "key": "branch_address_line2", "required": False},
    {"label": "Address Line 3", "key": "branch_address_line3", "required": False},
    {"label": "City", "key": "branch_city", "required": False},
    {"label": "State", "key": "branch_state", "required": False},
    {"label": "Pincode", "key": "branch_pincode", "required": False},
    {"label": "Country", "key": "branch_country", "required": False},
    {"label": "Branch Contact Person", "key": "branch_contact_person", "required": False},
    {"label": "Branch Email Address", "key": "branch_email", "required": False},
    {"label": "Branch Contact Number", "key": "branch_contact_no", "required": False},
    {"label": "MSME No", "key": "msme_udyam_no", "required": False},
    {"label": "FSSAI No", "key": "fssai_license_no", "required": False},
    {"label": "IEC Code", "key": "import_export_code", "required": False},
    {"label": "TDS Section", "key": "tds_section", "required": False},
    {"label": "TCS Applicable", "key": "tcs_applicable", "required": False},
    {"label": "TCS Section", "key": "tcs_section", "required": False},
    {"label": "Credit Period", "key": "credit_period", "required": False},
    {"label": "Credit Limit", "key": "credit_limit", "required": False},
    {"label": "Credit Terms", "key": "credit_terms", "required": False},
    {"label": "Penalty Terms", "key": "penalty_terms", "required": False},
    {"label": "Delivery Terms", "key": "delivery_terms", "required": False},
    {"label": "Warranty Details", "key": "warranty_guarantee_details", "required": False},
    {"label": "Force Majeure", "key": "force_majeure", "required": False},
    {"label": "Dispute Terms", "key": "dispute_redressal_terms", "required": False},
    {"label": "Bank Account No", "key": "bank_account_no", "required": False},
    {"label": "Bank Name", "key": "bank_name", "required": False},
    {"label": "IFSC Code", "key": "ifsc_code", "required": False},
    {"label": "Bank Branch", "key": "branch_name", "required": False},
    {"label": "Swift Code", "key": "swift_code", "required": False},
    {"label": "Associated Branch", "key": "vendor_branch", "required": False},
    {"label": "Item Code", "key": "item_code", "required": False},
    {"label": "Item Name", "key": "item_name", "required": False},
    {"label": "HSN/SAC Code", "key": "hsn_code", "required": False},
    {"label": "UOM", "key": "uom", "required": False},
    {"label": "Supplier Item Code", "key": "supplier_item_code", "required": False},
    {"label": "Supplier Item Name", "key": "supplier_item_name", "required": False},
    {"label": "Packing Notes", "key": "packing_notes", "required": False},
]

class VendorExcelTemplateDownloadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        wb = Workbook()
        ws = wb.active
        ws.title = "Vendor Template"
        
        # Headers
        for col_idx, col_def in enumerate(VENDOR_COLUMNS, 1):
            cell = ws.cell(row=1, column=col_idx, value=col_def["label"])
            cell.font = Font(bold=True, color="FFFFFF")
            
            bg_color = "10B981" if col_def.get("required") else "6B7280" # Emerald for vendors
            cell.fill = PatternFill(start_color=bg_color, end_color=bg_color, fill_type="solid")
            cell.alignment = Alignment(horizontal="center", vertical="center")
            
            thin = Side(border_style="thin", color="000000")
            cell.border = Border(top=thin, left=thin, right=thin, bottom=thin)
            ws.column_dimensions[cell.column_letter].width = 20

        ws.freeze_panes = "A2"
        
        response = HttpResponse(
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = 'attachment; filename="vendor_import_template.xlsx"'
        wb.save(response)
        return response

class VendorExcelExportView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        tenant_id = getattr(request.user, "tenant_id", None)
        vendors = VendorMasterBasicDetail.objects.filter(tenant_id=tenant_id, is_active=True)
        
        wb = Workbook()
        ws = wb.active
        ws.title = "Vendors"
        
        # Headers
        for col_idx, col_def in enumerate(VENDOR_COLUMNS, 1):
            cell = ws.cell(row=1, column=col_idx, value=col_def["label"])
            cell.font = Font(bold=True)
            ws.column_dimensions[cell.column_letter].width = 20

        # Data
        for row_idx, vendor in enumerate(vendors, 2):
            gst = vendor.gst_details.first()
            banking = vendor.banking_details.first()
            tds = vendor.tds_details.first()
            terms = vendor.terms_conditions.first()
            
            data = {
                "Vendor Name": vendor.vendor_name,
                "Vendor Code": vendor.vendor_code,
                "Category": vendor.vendor_category,
                "PAN Number": vendor.pan_no,
                "Contact Person": vendor.contact_person,
                "Email Address": vendor.email,
                "Contact Number": vendor.contact_no,
                "Billing Currency": vendor.billing_currency,
                "GSTIN": gst.gstin if gst else "",
                "Branch Name": gst.reference_name if gst else "",
                "Address Line 1": gst.branch_address_line1 if gst else "",
                "Address Line 2": gst.branch_address_line2 if gst else "",
                "Address Line 3": gst.branch_address_line3 if gst else "",
                "City": gst.branch_city if gst else "",
                "State": gst.branch_state if gst else "",
                "Pincode": gst.branch_pincode if gst else "",
                "Country": gst.branch_country if (gst and gst.branch_country) else "India",
                "Branch Contact Person": gst.branch_contact_person if gst else "",
                "Branch Email Address": gst.branch_email if gst else "",
                "Branch Contact Number": gst.branch_contact_no if gst else "",
                "MSME No": tds.msme_udyam_no if tds else "",
                "FSSAI No": tds.fssai_license_no if tds else "",
                "IEC Code": tds.import_export_code if tds else "",
                "TDS Section": tds.tds_section_applicable if tds else "",
                "TCS Applicable": "Yes" if vendor.tcs_applicable else "No",
                "TCS Section": tds.tcs_section_applicable if tds else "",
                "Credit Period": terms.credit_period if terms else "",
                "Credit Limit": terms.credit_limit if terms else "",
                "Credit Terms": terms.credit_terms if terms else "",
                "Penalty Terms": terms.penalty_terms if terms else "",
                "Delivery Terms": terms.delivery_terms if terms else "",
                "Warranty Details": terms.warranty_guarantee_details if terms else "",
                "Force Majeure": terms.force_majeure if terms else "",
                "Dispute Terms": terms.dispute_redressal_terms if terms else "",
                "Bank Account No": banking.bank_account_no if banking else "",
                "Bank Name": banking.bank_name if banking else "",
                "IFSC Code": banking.ifsc_code if banking else "",
                "Bank Branch": banking.branch_name if banking else "",
            }
            
            # Fetch products
            prod_data = VendorProductServiceDatabase.get_by_vendor(vendor.id)
            if prod_data and prod_data.get("items"):
                p = prod_data["items"][0]
                data.update({
                    "Item Code": p.get("item_code"),
                    "Item Name": p.get("item_name"),
                    "HSN/SAC Code": p.get("hsn_sac_code"),
                    "Supplier Item Code": p.get("supplier_item_code"),
                    "Supplier Item Name": p.get("supplier_item_name"),
                })
            
            for col_idx, col_def in enumerate(VENDOR_COLUMNS, 1):
                ws.cell(row=row_idx, column=col_idx, value=data.get(col_def["label"], ""))

        response = HttpResponse(
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = 'attachment; filename="vendors_export.xlsx"'
        wb.save(response)
        return response

class VendorExcelUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        tenant_id = getattr(request.user, "tenant_id", None)
        username = getattr(request.user, "username", "system")
        excel_file = request.FILES.get("file")
        json_data = request.data.get("data")
        dry_run = request.query_params.get("dry_run") == "true"
        
        if not excel_file and not json_data:
            return Response({"error": "No file or data provided"}, status=400)
        
        try:
            records_to_process = []
            
            if excel_file:
                wb = load_workbook(excel_file, data_only=True)
                ws = wb.active
                
                # Header mapping
                header_index = {}
                for idx, cell in enumerate(ws[1], 1):
                    if cell.value:
                        header_index[cell.value.strip()] = idx
                
                # Validate required columns
                for col in VENDOR_COLUMNS:
                    if col["required"] and col["label"] not in header_index:
                        return Response({"error": f"Missing required column: {col['label']}"}, status=400)

                for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
                    if not any(row): continue
                    row_data = {}
                    for lbl, idx in header_index.items():
                        row_data[lbl] = row[idx-1]
                    records_to_process.append({"row_data": row_data, "row_index": row_idx})
            else:
                if isinstance(json_data, str):
                    import json
                    records_to_process = json.loads(json_data)
                else:
                    records_to_process = json_data

            results = {"success": 0, "failed": 0, "errors": [], "successful_imports": []}
            
            for item in records_to_process:
                row_data = item.get("row_data")
                row_idx = item.get("row_index", "N/A")
                
                if not row_data: continue
                
                v_name = row_data.get("Vendor Name") or row_data.get("vendor_name")
                email = row_data.get("Email Address") or row_data.get("email")
                contact = row_data.get("Contact Number") or row_data.get("contact_no")
                
                def is_empty(val):
                    return not val or str(val).strip().lower() in ['n/a', 'none', 'nan', 'null', '']

                if is_empty(v_name) or is_empty(email) or is_empty(contact):
                    results["failed"] += 1
                    results["errors"].append({
                        "message": f"Row {row_idx}: Name, Email, or Contact is missing",
                        "row_data": row_data,
                        "row_index": row_idx
                    })
                    continue

                # Mandatory Category Check
                cat_name = row_data.get("Category") or row_data.get("vendor_category")
                if is_empty(cat_name):
                    results["failed"] += 1
                    results["errors"].append({
                        "message": f"Row {row_idx}: Category is mandatory. Please select a category.",
                        "row_data": row_data,
                        "row_index": row_idx
                    })
                    continue

                branch = row_data.get("Branch Name") or row_data.get("branch_name")
                if is_empty(branch):
                    results["failed"] += 1
                    results["errors"].append({
                        "message": f"Row {row_idx}: Branch Name is mandatory",
                        "row_data": row_data,
                        "row_index": row_idx
                    })
                    continue

                addr1 = row_data.get("Address Line 1") or row_data.get("address_line_1")
                if is_empty(addr1):
                    results["failed"] += 1
                    results["errors"].append({
                        "message": f"Row {row_idx}: Address Line 1 is mandatory",
                        "row_data": row_data,
                        "row_index": row_idx
                    })
                    continue

                addr2 = row_data.get("Address Line 2") or row_data.get("address_line_2")
                if is_empty(addr2):
                    results["failed"] += 1
                    results["errors"].append({
                        "message": f"Row {row_idx}: Address Line 2 is mandatory",
                        "row_data": row_data,
                        "row_index": row_idx
                    })
                    continue
                
                # Validation
                pan = row_data.get("PAN Number") or row_data.get("pan_no")
                if pan:
                    if not re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]{1}$', str(pan).strip().upper()):
                        results["failed"] += 1
                        results["errors"].append({
                            "message": f"Row {row_idx}: Invalid PAN format",
                            "row_data": row_data,
                            "row_index": row_idx
                        })
                        continue
                
                gstin = row_data.get("GSTIN") or row_data.get("gstin")
                if gstin:
                    if not re.match(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', str(gstin).strip().upper()):
                        results["failed"] += 1
                        results["errors"].append({
                            "message": f"Row {row_idx}: Invalid GSTIN format",
                            "row_data": row_data,
                            "row_index": row_idx
                        })
                        continue
                
                try:
                    # Use a nested transaction that we can rollback if dry_run
                    with transaction.atomic():
                        # 1. Basic Details
                        vendor = VendorMasterBasicDetail(
                            tenant_id=tenant_id,
                            vendor_name=v_name,
                            vendor_code=row_data.get("Vendor Code") or row_data.get("vendor_code"),
                            pan_no=pan,
                            contact_person=row_data.get("Contact Person") or row_data.get("contact_person"),
                            email=email,
                            contact_no=str(contact),
                            vendor_category=row_data.get("Category") or row_data.get("category"),
                            billing_currency=row_data.get("Billing Currency") or row_data.get("billing_currency") or "INR",
                            tcs_applicable=True if str(row_data.get("TCS Applicable") or row_data.get("tcs_applicable", "")).lower() in ['yes', 'true', '1'] else False,
                            created_by=username
                        )
                        
                        vendor.generate_vendor_code()
                        vendor.save()
                        
                        # Ledger creation
                        from accounting.utils_ledger import get_or_create_entity_ledger
                        ledger = get_or_create_entity_ledger(
                            tenant_id=tenant_id,
                            entity_name=v_name,
                            entity_type='vendor',
                            created_by=username
                        )
                        vendor.ledger = ledger
                        vendor.save(update_fields=['ledger_id'])
                        
                        # 2. GST Details
                        gstin = row_data.get("GSTIN") or row_data.get("gstin")
                        if gstin or row_data.get("Branch Name") or row_data.get("reference_name"):
                            VendorMasterGSTDetails.objects.create(
                                tenant_id=tenant_id,
                                vendor_basic_detail=vendor,
                                gstin=gstin,
                                reference_name=row_data.get("Branch Name") or row_data.get("reference_name", "Main Branch"),
                                branch_address_line1=row_data.get("Address Line 1") or row_data.get("branch_address_line1"),
                                branch_address_line2=row_data.get("Address Line 2") or row_data.get("branch_address_line2"),
                                branch_address_line3=row_data.get("Address Line 3") or row_data.get("branch_address_line3"),
                                branch_city=row_data.get("City") or row_data.get("branch_city"),
                                branch_state=row_data.get("State") or row_data.get("branch_state"),
                                branch_pincode=row_data.get("Pincode") or row_data.get("branch_pincode"),
                                branch_country=row_data.get("Country") or row_data.get("branch_country") or "India",
                                branch_contact_person=row_data.get("Branch Contact Person") or row_data.get("branch_contact_person"),
                                branch_email=row_data.get("Branch Email Address") or row_data.get("branch_email"),
                                branch_contact_no=row_data.get("Branch Contact Number") or row_data.get("branch_contact_no"),
                                created_by=username
                            )
                        
                        # 3. Banking Details
                        acc_no = row_data.get("Bank Account No") or row_data.get("bank_account_no")
                        if acc_no:
                            VendorMasterBanking.objects.create(
                                tenant_id=tenant_id,
                                vendor_basic_detail=vendor,
                                bank_account_no=str(acc_no),
                                bank_name=row_data.get("Bank Name") or row_data.get("bank_name"),
                                ifsc_code=row_data.get("IFSC Code") or row_data.get("ifsc_code"),
                                branch_name=row_data.get("Bank Branch") or row_data.get("branch_name"),
                                swift_code=row_data.get("Swift Code") or row_data.get("swift_code"),
                                vendor_branch=row_data.get("Associated Branch") or row_data.get("vendor_branch"),
                                created_by=username
                            )
                        else:
                            VendorMasterBanking.objects.create(tenant_id=tenant_id, vendor_basic_detail=vendor, created_by=username)
 
                        # 4. TDS Details
                        VendorMasterTDS.objects.create(
                            tenant_id=tenant_id,
                            vendor_basic_detail=vendor,
                            msme_udyam_no=row_data.get("MSME No") or row_data.get("msme_udyam_no"),
                            fssai_license_no=row_data.get("FSSAI No") or row_data.get("fssai_license_no"),
                            import_export_code=row_data.get("IEC Code") or row_data.get("import_export_code"),
                            tds_section_applicable=row_data.get("TDS Section") or row_data.get("tds_section"),
                            tcs_section_applicable=row_data.get("TCS Section") or row_data.get("tcs_section"),
                            created_by=username
                        )
                        
                        # 5. Terms and Conditions
                        VendorMasterTerms.objects.create(
                            tenant_id=tenant_id,
                            vendor_basic_detail=vendor,
                            credit_period=row_data.get("Credit Period") or row_data.get("credit_period"),
                            credit_limit=row_data.get("Credit Limit") or row_data.get("credit_limit"),
                            credit_terms=row_data.get("Credit Terms") or row_data.get("credit_terms"),
                            penalty_terms=row_data.get("Penalty Terms") or row_data.get("penalty_terms"),
                            delivery_terms=row_data.get("Delivery Terms") or row_data.get("delivery_terms"),
                            warranty_guarantee_details=row_data.get("Warranty Details") or row_data.get("warranty_guarantee_details"),
                            force_majeure=row_data.get("Force Majeure") or row_data.get("force_majeure"),
                            dispute_redressal_terms=row_data.get("Dispute Terms") or row_data.get("dispute_redressal_terms"),
                            created_by=username
                        )
                        
                        # 6. Products/Services
                        products_raw = row_data.get("products", [])
                        products_to_save = []
                        if products_raw:
                            for p in products_raw:
                                products_to_save.append({
                                    "item_code": p.get("Item Code") or p.get("item_code") or "",
                                    "item_name": p.get("Item Name") or p.get("item_name") or "",
                                    "hsn_sac_code": p.get("HSN/SAC Code") or p.get("HSN/SAC") or p.get("hsn_sac_code") or "",
                                    "uom": p.get("UOM") or p.get("uom") or "",
                                    "supplier_item_code": p.get("Supplier Item Code") or p.get("Supp Item Code") or p.get("supplier_item_code") or "",
                                    "supplier_item_name": p.get("Supplier Item Name") or p.get("Supp Item Name") or p.get("supplier_item_name") or "",
                                    "packing_notes": p.get("Packing Notes") or p.get("packing_notes") or "",
                                })
                        else:
                            # Try to get from flat fields
                            item_code = row_data.get("Item Code") or row_data.get("item_code")
                            if item_code:
                                products_to_save = [{
                                    "item_code": item_code,
                                    "item_name": row_data.get("Item Name") or row_data.get("item_name"),
                                    "hsn_sac_code": row_data.get("HSN/SAC Code") or row_data.get("HSN/SAC") or row_data.get("hsn_code") or row_data.get("hsn_sac_code"),
                                    "uom": row_data.get("UOM") or row_data.get("uom"),
                                    "supplier_item_code": row_data.get("Supplier Item Code") or row_data.get("Supp Item Code") or row_data.get("supplier_item_code"),
                                    "supplier_item_name": row_data.get("Supplier Item Name") or row_data.get("Supp Item Name") or row_data.get("supplier_item_name"),
                                    "packing_notes": row_data.get("Packing Notes") or row_data.get("packing_notes"),
                                }]
                        
                        if products_to_save:
                            # HSN Validation
                            for p in products_to_save:
                                hsn = p.get("hsn_sac_code")
                                if hsn and not str(hsn).replace(" ", "").isdigit():
                                    raise Exception(f"Invalid HSN/SAC Code: '{hsn}'. HSN codes must be numeric.")

                            VendorProductServiceDatabase.upsert_product_services(
                                tenant_id=tenant_id,
                                vendor_basic_detail_id=vendor.id,
                                items=products_to_save,
                                created_by=username
                            )
                        
                        results["successful_imports"].append({
                            "id": None if dry_run else vendor.id,
                            "name": vendor.vendor_name,
                            "code": vendor.vendor_code,
                            "row_data": row_data
                        })
                        results["success"] += 1

                        if dry_run:
                            # Rollback this specific row
                            raise Exception("Dry Run Rollback")
                        
                except Exception as row_err:
                    if str(row_err) == "Dry Run Rollback":
                        continue # This is expected for dry run, we already counted success
                    results["failed"] += 1
                    results["errors"].append({
                        "message": f"Row {row_idx}: {str(row_err)}",
                        "row_data": row_data,
                        "row_index": row_idx
                    })
                    logger.error(f"Error processing vendor row {row_idx}: {row_err}")

            return Response({
                "message": "Preview complete" if dry_run else f"Processing complete. Success: {results['success']}, Failed: {results['failed']}",
                "summary": results,
                "is_preview": dry_run
            }, status=200)

        except Exception as e:
            logger.error(f"Vendor Excel upload failed: {e}", exc_info=True)
            return Response({"error": f"Internal error: {str(e)}"}, status=500)
