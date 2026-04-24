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

from .database import (
    CustomerMasterCustomerBasicDetails,
    CustomerMasterCustomerGSTDetails,
    CustomerMasterCustomerBanking,
    CustomerMasterCustomerTDS,
    CustomerMasterCustomerTermsCondition,
    CustomerMasterCategory
)
from accounting.models import MasterLedger

logger = logging.getLogger(__name__)

# Column Definitions for Customer Excel
CUSTOMER_COLUMNS = [
    {"label": "Customer Name", "key": "customer_name", "required": True},
    {"label": "Customer Code", "key": "customer_code", "required": False},
    {"label": "Is Also Vendor", "key": "is_also_vendor", "required": False},
    {"label": "Category", "key": "category", "required": False},
    {"label": "PAN Number", "key": "pan_number", "required": False},
    {"label": "Contact Person", "key": "contact_person", "required": False},
    {"label": "Email Address", "key": "email_address", "required": False},
    {"label": "Contact Number", "key": "contact_number", "required": False},
    {"label": "Billing Currency", "key": "billing_currency", "required": False},
    {"label": "GSTIN", "key": "gstin", "required": False},
    {"label": "GST TDS Applicable", "key": "gst_tds_applicable", "required": False},
    {"label": "Branch Name", "key": "branch_name", "required": False},
    {"label": "Address Line 1", "key": "address_line_1", "required": False},
    {"label": "Address Line 2", "key": "address_line_2", "required": False},
    {"label": "Address Line 3", "key": "address_line_3", "required": False},
    {"label": "City", "key": "city", "required": False},
    {"label": "State", "key": "state", "required": False},
    {"label": "Pincode", "key": "pincode", "required": False},
    {"label": "Country", "key": "country", "required": False},
    {"label": "MSME No", "key": "msme_no", "required": False},
    {"label": "FSSAI No", "key": "fssai_no", "required": False},
    {"label": "IEC Code", "key": "iec_code", "required": False},
    {"label": "TDS Section", "key": "tds_section", "required": False},
    {"label": "TCS Enabled", "key": "tcs_enabled", "required": False},
    {"label": "TCS Section", "key": "tcs_section", "required": False},
    {"label": "Credit Period", "key": "credit_period", "required": False},
    {"label": "Credit Terms", "key": "credit_terms", "required": False},
    {"label": "Penalty Terms", "key": "penalty_terms", "required": False},
    {"label": "Delivery Terms", "key": "delivery_terms", "required": False},
    {"label": "Warranty Details", "key": "warranty_details", "required": False},
    {"label": "Force Majeure", "key": "force_majeure", "required": False},
    {"label": "Dispute Terms", "key": "dispute_terms", "required": False},
    {"label": "Bank Account No", "key": "bank_account_no", "required": False},
    {"label": "Bank Name", "key": "bank_name", "required": False},
    {"label": "IFSC Code", "key": "ifsc_code", "required": False},
    {"label": "Bank Branch", "key": "bank_branch", "required": False},
]

class CustomerExcelTemplateDownloadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        wb = Workbook()
        ws = wb.active
        ws.title = "Customer Template"
        
        # Headers
        for col_idx, col_def in enumerate(CUSTOMER_COLUMNS, 1):
            cell = ws.cell(row=1, column=col_idx, value=col_def["label"])
            cell.font = Font(bold=True, color="FFFFFF")
            
            bg_color = "3B82F6" if col_def.get("required") else "6B7280"
            cell.fill = PatternFill(start_color=bg_color, end_color=bg_color, fill_type="solid")
            cell.alignment = Alignment(horizontal="center", vertical="center")
            
            thin = Side(border_style="thin", color="000000")
            cell.border = Border(top=thin, left=thin, right=thin, bottom=thin)
            ws.column_dimensions[cell.column_letter].width = 20

        ws.freeze_panes = "A2"
        
        response = HttpResponse(
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = 'attachment; filename="customer_import_template.xlsx"'
        wb.save(response)
        return response

class CustomerExcelExportView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        tenant_id = getattr(request.user, "tenant_id", None)
        customers = CustomerMasterCustomerBasicDetails.objects.filter(tenant_id=tenant_id, is_deleted=False)
        
        wb = Workbook()
        ws = wb.active
        ws.title = "Customers"
        
        # Headers
        for col_idx, col_def in enumerate(CUSTOMER_COLUMNS, 1):
            cell = ws.cell(row=1, column=col_idx, value=col_def["label"])
            cell.font = Font(bold=True)
            ws.column_dimensions[cell.column_letter].width = 20

        # Data
        for row_idx, customer in enumerate(customers, 2):
            gst = customer.gst_details.first()
            banking = customer.banking_details.first()
            tds = getattr(customer, 'tds_details', None)
            terms = getattr(customer, 'terms_conditions', None)
            
            data = {
                "Customer Name": customer.customer_name,
                "Customer Code": customer.customer_code,
                "Is Also Vendor": "Yes" if customer.is_also_vendor else "No",
                "Category": str(customer.customer_category) if customer.customer_category else "",
                "PAN Number": customer.pan_number,
                "Contact Person": customer.contact_person,
                "Email Address": customer.email_address,
                "Contact Number": customer.contact_number,
                "Billing Currency": customer.billing_currency,
                "GSTIN": gst.gstin if gst else "",
                "GST TDS Applicable": "Yes" if customer.gst_tds_applicable else "No",
                "Branch Name": gst.branch_reference_name if gst else "",
                "Address Line 1": gst.address_line_1 if gst else "",
                "Address Line 2": gst.address_line_2 if gst else "",
                "Address Line 3": gst.address_line_3 if gst else "",
                "City": gst.city if gst else "",
                "State": gst.state if gst else "",
                "Pincode": gst.pincode if gst else "",
                "Country": gst.country if gst else "",
                "MSME No": tds.msme_no if tds else "",
                "FSSAI No": tds.fssai_no if tds else "",
                "IEC Code": tds.iec_code if tds else "",
                "TDS Section": tds.tds_section if tds else "",
                "TCS Enabled": "Yes" if (tds and tds.tcs_enabled) else "No",
                "TCS Section": tds.tcs_section if tds else "",
                "Credit Period": terms.credit_period if terms else "",
                "Credit Terms": terms.credit_terms if terms else "",
                "Penalty Terms": terms.penalty_terms if terms else "",
                "Delivery Terms": terms.delivery_terms if terms else "",
                "Warranty Details": terms.warranty_details if terms else "",
                "Force Majeure": terms.force_majeure if terms else "",
                "Dispute Terms": terms.dispute_terms if terms else "",
                "Bank Account No": banking.account_number if banking else "",
                "Bank Name": banking.bank_name if banking else "",
                "IFSC Code": banking.ifsc_code if banking else "",
                "Bank Branch": banking.branch_name if banking else "",
            }
            
            for col_idx, col_def in enumerate(CUSTOMER_COLUMNS, 1):
                ws.cell(row=row_idx, column=col_idx, value=data.get(col_def["label"], ""))

        response = HttpResponse(
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = 'attachment; filename="customers_export.xlsx"'
        wb.save(response)
        return response

class CustomerExcelUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        tenant_id = getattr(request.user, "tenant_id", None)
        username = getattr(request.user, "username", "system")
        excel_file = request.FILES.get("file")
        json_data = request.data.get("data") # Support for sending fixed records as JSON
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
                for col in CUSTOMER_COLUMNS:
                    if col["required"] and col["label"] not in header_index:
                        return Response({"error": f"Missing required column: {col['label']}"}, status=400)

                for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
                    if not any(row): continue
                    row_data = {}
                    for lbl, idx in header_index.items():
                        row_data[lbl] = row[idx-1]
                    records_to_process.append({"row_data": row_data, "row_index": row_idx})
            else:
                # Use data from request body (for fixed records)
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
                
                c_name = row_data.get("Customer Name") or row_data.get("customer_name")
                if not c_name:
                    results["failed"] += 1
                    results["errors"].append({
                        "message": f"Row {row_idx}: Customer Name is missing",
                        "row_data": row_data,
                        "row_index": row_idx
                    })
                    continue
                
                # Mandatory Category Check
                cat_name = row_data.get("Category") or row_data.get("category")
                if not cat_name:
                    results["failed"] += 1
                    results["errors"].append({
                        "message": f"Row {row_idx}: Category is mandatory. Please select a category.",
                        "row_data": row_data,
                        "row_index": row_idx
                    })
                    continue
                
                # Validation
                pan = row_data.get("PAN Number") or row_data.get("pan_number")
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
                        import random, string
                        cust_code = row_data.get("Customer Code") or f"CUST-{''.join(random.choices(string.ascii_uppercase + string.digits, k=6))}"
                        
                        cat_name = row_data.get("Category", "Regular")
                        cat, _ = CustomerMasterCategory.objects.get_or_create(
                            tenant_id=tenant_id,
                            category=cat_name,
                            defaults={'is_active': True}
                        )
                        
                        customer = CustomerMasterCustomerBasicDetails.objects.create(
                            tenant_id=tenant_id,
                            customer_name=c_name,
                            customer_code=cust_code,
                            pan_number=row_data.get("PAN Number"),
                            contact_person=row_data.get("Contact Person"),
                            email_address=row_data.get("Email Address"),
                            contact_number=row_data.get("Contact Number"),
                            billing_currency=row_data.get("Billing Currency", "INR"),
                            is_also_vendor=True if str(row_data.get("Is Also Vendor", "")).lower() in ['yes', 'true', '1'] else False,
                            gst_tds_applicable=True if str(row_data.get("GST TDS Applicable", "")).lower() in ['yes', 'true', '1'] else False,
                            customer_category=cat,
                            created_by=username
                        )
                        
                        # Ledger creation
                        ledger_code = f"CUST-LED-{customer.id}"
                        ledger = MasterLedger.objects.create(
                            tenant_id=tenant_id,
                            name=c_name,
                            group='Sundry Debtors',
                            code=ledger_code,
                        )
                        customer.ledger_id = ledger.id
                        customer.save(update_fields=['ledger_id'])
                        
                        # 2. GST Details
                        gstin = row_data.get("GSTIN")
                        if gstin or row_data.get("Branch Name"):
                            CustomerMasterCustomerGSTDetails.objects.create(
                                tenant_id=tenant_id,
                                customer_basic_detail=customer,
                                gstin=gstin,
                                branch_reference_name=row_data.get("Branch Name", "Main Branch"),
                                address_line_1=row_data.get("Address Line 1"),
                                address_line_2=row_data.get("Address Line 2"),
                                address_line_3=row_data.get("Address Line 3"),
                                city=row_data.get("City"),
                                state=row_data.get("State"),
                                pincode=row_data.get("Pincode"),
                                country=row_data.get("Country", "India"),
                                created_by=username
                            )
                        else:
                            CustomerMasterCustomerGSTDetails.objects.create(
                                tenant_id=tenant_id,
                                customer_basic_detail=customer,
                                is_unregistered=True,
                                created_by=username
                            )
                            
                        # 3. Banking Details
                        acc_no = row_data.get("Bank Account No")
                        if acc_no:
                            CustomerMasterCustomerBanking.objects.create(
                                tenant_id=tenant_id,
                                customer_basic_detail=customer,
                                account_number=acc_no,
                                bank_name=row_data.get("Bank Name"),
                                ifsc_code=row_data.get("IFSC Code"),
                                branch_name=row_data.get("Bank Branch"),
                                created_by=username
                            )
                        else:
                            CustomerMasterCustomerBanking.objects.create(tenant_id=tenant_id, customer_basic_detail=customer, created_by=username)
 
                        # 4. TDS Details
                        CustomerMasterCustomerTDS.objects.create(
                            tenant_id=tenant_id,
                            customer_basic_detail=customer,
                            msme_no=row_data.get("MSME No"),
                            fssai_no=row_data.get("FSSAI No"),
                            iec_code=row_data.get("IEC Code"),
                            tds_section=row_data.get("TDS Section"),
                            tcs_section=row_data.get("TCS Section"),
                            tcs_enabled=True if str(row_data.get("TCS Enabled", "")).lower() in ['yes', 'true', '1'] else False,
                            created_by=username
                        )
                        
                        # Update terms & conditions
                        CustomerMasterCustomerTermsCondition.objects.create(
                            tenant_id=tenant_id,
                            customer_basic_detail=customer,
                            credit_period=row_data.get("Credit Period"),
                            credit_terms=row_data.get("Credit Terms"),
                            penalty_terms=row_data.get("Penalty Terms"),
                            delivery_terms=row_data.get("Delivery Terms"),
                            warranty_details=row_data.get("Warranty Details"),
                            force_majeure=row_data.get("Force Majeure"),
                            dispute_terms=row_data.get("Dispute Terms"),
                            created_by=username
                        )
                        
                        results["successful_imports"].append({
                            "id": None if dry_run else customer.id,
                            "name": customer.customer_name,
                            "code": customer.customer_code,
                            "row_data": row_data # Include row data for preview editing
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
                    logger.error(f"Error processing customer row {row_idx}: {row_err}")

            return Response({
                "message": "Preview complete" if dry_run else f"Processing complete. Success: {results['success']}, Failed: {results['failed']}",
                "summary": results,
                "is_preview": dry_run
            }, status=200)

        except Exception as e:
            logger.error(f"Customer Excel upload failed: {e}", exc_info=True)
            return Response({"error": f"Internal error: {str(e)}"}, status=500)
