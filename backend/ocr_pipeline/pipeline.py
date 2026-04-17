import logging
from django.db import transaction
from django.utils import timezone
from google import genai
from core.ai_proxy import api_key_manager
from .extraction import extract_invoice
from .normalize import normalize
from .repository import InvoiceTempOCR
from vendors.models import VendorMasterBasicDetail, VendorMasterGSTDetails
from accounting.models_voucher_purchase import (
    VoucherPurchaseSupplierDetails,
    VoucherPurchaseSupplyINRDetails,
    VoucherPurchaseDueDetails
)
from accounting.models import Voucher, MasterLedger
from core.models import Branch

logger = logging.getLogger(__name__)

def run_ocr_pipeline(file_bytes: bytes, record: InvoiceTempOCR) -> dict:
    """
    SINGLE ENTRY POINT for OCR extraction and immediate validation.
    """
    print("NEW OCR PIPELINE ACTIVE")
    print("PIPELINE EXECUTED")
    logger.info(f"NEW OCR PIPELINE ACTIVE - Start processing record {record.id}...")
    
    try:
        # Get API key
        api_key = api_key_manager.get_healthy_key()
        if not api_key:
            raise RuntimeError("No healthy Gemini API keys available")

        # Initialize Gemini Client
        from google.genai import types
        client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=None)
        )

        # Phase 1: High-Precision Extraction (Gemini)
        extracted = extract_invoice(client, file_bytes, voucher_type=record.voucher_type or 'Purchase')
        
        # Phase 2: Hierarchical Normalization
        normalized = normalize(extracted)
        
        # STEP 1: Save extracted data immediately
        record.extracted_data = normalized
        record.status = 'EXTRACTED'
        record.save()
        
        # STEP 2: IMMEDIATELY call validation and processing
        logger.info(f"PIPELINE: Extraction complete for record {record.id}. Starting immediate validation...")
        res = validate_and_process(record)
        
        return {
            "data": normalized,
            "validation": res
        }
    except Exception as e:
        logger.error(f"PIPELINE CRITICAL FAILURE for record {record.id}: {str(e)}")
        record.status = 'FAILED'
        record.validation_status = 'ERROR'
        record.validation_message = f"Extraction Error: {str(e)}"
        record.save()
        return {
            "data": {},
            "validation": {"status": "ERROR", "error": str(e)}
        }

def validate_and_process(record: InvoiceTempOCR):
    """
    CORE VALIDATION FUNCTION: 
    Checks for Vendor, Duplicates, and Auto-Creates Voucher if possible.
    """
    print("VALIDATION START:", record.id)
    
    try:
        data = record.extracted_data or {}
        sections = data.get("sections", {})
        supplier = sections.get("supplier_details", {})
        supply = sections.get("supply_details", {})
        due = sections.get("due_details", {})
        items = sections.get("items", [])

        gstin = (supplier.get("gstin") or "").strip().upper()
        invoice_no = (supplier.get("supplier_invoice_no") or "").strip()
        vendor_name = (supplier.get("vendor_name") or "").strip()
        tenant_id = str(record.tenant_id)

        print("GSTIN:", gstin)
        print("INVOICE:", invoice_no)

        if not gstin or not invoice_no:
            record.validation_status = "ERROR"
            record.validation_message = "Missing GSTIN or Invoice Number"
            record.save()
            print("FINAL STATUS: ERROR (Missing headers)")
            return {"status": "ERROR"}

        # 🔹 FAST PATH: If vendor was already matched (vendor_id stored from PATCH re-validation)
        # and the status confirms it, skip the full GSTIN+branch lookup to avoid false NEED_VENDOR
        branch_name = supplier.get("branch") or record.branch or ""

        if record.vendor_id and record.validation_status in ['FOUND', 'READY', 'RESOLVED', 'MATCHED_VENDOR', 'EXISTING_VENDOR']:
            try:
                vendor = VendorMasterBasicDetail.objects.get(id=record.vendor_id, tenant_id=tenant_id)
                print(f"FAST PATH: Using stored vendor_id={record.vendor_id} for {vendor.vendor_name}")
            except VendorMasterBasicDetail.DoesNotExist:
                vendor = None
        else:
            # 🔹 STRICT VENDOR VALIDATION (GSTIN + BRANCH)
            from vendors.vendor_validation_logic import validate_vendor
            val_res = validate_vendor(tenant_id, vendor_name, gstin, branch=branch_name)
            
            if val_res['status'] == 'EXISTING_VENDOR':
                vendor = VendorMasterBasicDetail.objects.filter(id=val_res['vendor_id'], tenant_id=tenant_id).first()
                if vendor:
                    record.vendor_id = vendor.id
                    record.validation_status = 'FOUND' # Maintain compatibility with existing UI
                    record.save()
                print(f"STRICT MATCH FOUND: {vendor.vendor_name if vendor else 'Unknown'}")
            else:
                vendor = None

        if not vendor:
            record.validation_status = "NEED_VENDOR"
            record.save()
            print("FINAL STATUS: NEED_VENDOR (Strict matching failed)")
            return {"status": "NEED_VENDOR"}


        # Sync vendor name from master if it differs
        vendor_name = vendor.vendor_name

        # 🔹 PURCHASE DUPLICATE VALIDATION (Invoice No + GSTIN + Branch)
        is_duplicate = VoucherPurchaseSupplierDetails.objects.filter(
            supplier_invoice_no__iexact=invoice_no,
            gstin__iexact=gstin,
            branch__iexact=branch_name, # Strict branch matching for duplicates
            tenant_id=tenant_id
        ).exists()
        print("DUPLICATE:", is_duplicate)

        if is_duplicate:
            record.validation_status = "DUPLICATE"
            record.save()
            print("FINAL STATUS: DUPLICATE")
            return {"status": "DUPLICATE"}

        # 🔹 CREATE PURCHASE VOUCHER (AUTO-SAVE)
        # Using the Pipeline 2 logic refined earlier
        with transaction.atomic():
            branch_record = Branch.objects.filter(id=tenant_id).first()
            company_gstin = branch_record.gstin if branch_record else None
            is_interstate = gstin[:2] != company_gstin[:2] if company_gstin and len(gstin)>=2 and len(company_gstin)>=2 else False
            
            invoice_date = supplier.get('invoice_date')
            branch = supplier.get('branch') or 'Main Branch'
            address = supplier.get('vendor_address') or ''

            voucher_main = VoucherPurchaseSupplierDetails.objects.create(
                tenant_id=tenant_id,
                date=invoice_date or timezone.now().date(),
                supplier_invoice_no=invoice_no,
                supplier_invoice_date=invoice_date,
                vendor_name=vendor_name,
                vendor_basic_detail=vendor,
                gstin=gstin,
                branch=branch,
                bill_from=address,
                input_type='Interstate' if is_interstate else 'Intrastate'
            )

            # Map items
            mapped_items = []
            for item in items:
                mapped_items.append({
                    "itemCode": "",
                    "itemName": item.get('description') or "—",
                    "hsnSac": item.get('hsn_sac') or "",
                    "qty": item.get('quantity', 0),
                    "uom": item.get('uom') or "",
                    "rate": item.get('rate', 0),
                    "taxableValue": item.get('taxable_value', 0),
                    "cgst": item.get('cgst', 0),
                    "sgst": item.get('sgst', 0),
                    "igst": item.get('igst', 0),
                    "invoiceValue": item.get('amount', 0)
                })

            # Create INR supply details (without items field which doesn't exist on this model)
            VoucherPurchaseSupplyINRDetails.objects.create(
                tenant_id=tenant_id,
                supplier_details=voucher_main,
                description=f"Auto-validated via OCR Pipeline: {record.file_path}"
            )

            # Create line items in the correct table
            from accounting.models_voucher_purchase import VoucherPurchaseItem
            for item in items:
                VoucherPurchaseItem.objects.create(
                    tenant_id=tenant_id,
                    supplier_details=voucher_main,
                    item_name=item.get('description') or "—",
                    hsn_sac=item.get('hsn_sac') or "",
                    quantity=item.get('quantity', 0),
                    uom=item.get('uom') or "",
                    rate=item.get('rate', 0),
                    taxable_value=item.get('taxable_value', 0),
                    cgst_amount=item.get('cgst_amount', 0),
                    sgst_amount=item.get('sgst_amount', 0),
                    igst_amount=item.get('igst_amount', 0),
                    invoice_value=item.get('amount', 0),
                    item_code="" # To be matched later if needed
                )

            VoucherPurchaseDueDetails.objects.create(
                tenant_id=tenant_id,
                supplier_details=voucher_main,
                to_pay=supply.get('total_invoice_value', 0),
                terms=due.get('payment_terms', '')
            )

            # Unified Voucher
            v_num = invoice_no
            # Check for existing voucher with same ID and party to decide on series suffix
            if Voucher.objects.filter(voucher_number=v_num, party=vendor_name, tenant_id=tenant_id, type='purchase').exists():
                 v_num = f"{v_num}-{voucher_main.id}"
            
            Voucher.objects.create(
                tenant_id=tenant_id,
                type='purchase',
                date=voucher_main.date,
                voucher_number=v_num,
                invoice_no=invoice_no,
                party=vendor_name,
                total=supply.get('total_invoice_value', 0),
                source='ocr_pipeline',
                reference_id=voucher_main.id,
                total_taxable_amount=supply.get('total_taxable_value', 0),
                total_cgst=supply.get('total_cgst', 0),
                total_sgst=supply.get('total_sgst', 0),
                total_igst=supply.get('total_igst', 0),
                items_data=mapped_items
            )

            # 🔹 FINAL STATUS UPDATE
            record.status = "VOUCHER_CREATED"
            record.validation_status = "VOUCHER_CREATED"
            record.vendor_id = vendor.id
            record.voucher_id = voucher_main.id
            record.processed = True
            record.save()
            
            print(f"FINAL STATUS: VOUCHER_CREATED (Voucher={voucher_main.id})")
            return {"status": "VOUCHER_CREATED", "voucher_id": voucher_main.id}

    except Exception as e:
        logger.error(f"AUTO-VALIDATION FAILED for record {record.id}: {str(e)}")
        record.validation_status = "ERROR"
        record.validation_message = str(e)
        record.save()
        print("FINAL STATUS: ERROR (Exception)")
        return {"status": "ERROR"}
