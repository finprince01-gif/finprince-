import logging
from django.db import transaction
from django.utils import timezone
from google import genai
from core.ai_proxy import api_key_manager
from ocr_pipeline.extraction import extract_invoice
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
import time
from google.genai import types

logger = logging.getLogger(__name__)

def run_ocr_pipeline(file_bytes: bytes, record: InvoiceTempOCR) -> dict:
    """
    SINGLE ENTRY POINT for OCR extraction and immediate validation.
    """
    print("NEW OCR PIPELINE ACTIVE")
    print("PIPELINE EXECUTED")
    logger.error(f"[TRACE] run_ocr_pipeline.entry | record_id={record.id} | session={record.upload_session_id} | py_id={id(record)}")
    logger.info(f"NEW OCR PIPELINE ACTIVE - Start processing record {record.id}...")
    
    try:
        # STEP 0: DEDUPE BYPASS
        if record.extracted_data:
            logger.info(f"[PIPELINE BYPASS] Reusing existing extraction data for record {record.id}")
            normalized = record.extracted_data
        else:
            # STEP 1: Process Extraction
            # Phase 1: High-Precision Extraction (Gemini via central Proxy)
            extracted = extract_invoice(
                client=None, 
                file_bytes=file_bytes, 
                voucher_type=record.voucher_type or 'Purchase',
                public_ip="0.0.0.0",
                user_id='system',
                tenant_id=str(record.tenant_id or 'system')
            )
            
            if "_error" in extracted:
                raise RuntimeError(f"Extraction Error: {extracted.get('_error')} - {extracted.get('_raw', '')[:100]}...")

            # Phase 2: Hierarchical Normalization
            normalized = normalize(extracted)
            if not normalized:
                raise RuntimeError("Normalization produced empty result")
            
        # Inject folder path for UI visibility (especially for folder-based batch uploads)
        normalized['folder_path'] = record.file_path
        
        # STEP 2: Save extracted data immediately
        record.extracted_data = normalized
        record.status = 'EXTRACTED'
        
        # Flatten critical headers to top-level model fields for easier querying/UI display
        sections = normalized.get("sections", {})
        supplier = sections.get("supplier_details", {})
        
        record.supplier_invoice_no = normalized.get("supplier_invoice_no") or supplier.get("supplier_invoice_no")
        record.gstin = normalized.get("gstin") or supplier.get("gstin")
        record.branch = normalized.get("branch") or supplier.get("branch")
        
        logger.error(f"[TRACE] run_ocr_pipeline.before_save | record_id={record.id} | session={record.upload_session_id} | py_id={id(record)}")
        record.save(update_fields=[
            'extracted_data', 'status', 'supplier_invoice_no', 
            'gstin', 'branch'
        ])
        logger.error(f"[TRACE] run_ocr_pipeline.after_save | record_id={record.id} | session={record.upload_session_id} | py_id={id(record)}")
        logger.info(f"[STAGING SAVE SUCCESS] Record {record.id} saved (excluding session_id to prevent race)")
            
        # STEP 3: IMMEDIATELY call validation and processing
        logger.info(f"PIPELINE: Extraction complete for record {record.id}. Starting immediate validation...")
        res = validate_and_process(record)
        
        return {
            "data": normalized,
            "validation": res
        }
    except Exception as e:
        err_msg = str(e).upper()
        # Note: ai_service already handles its internal retries. 
        # If it bubbles up to here, it's a terminal failure for this record.
        
        logger.error(f"PIPELINE CRITICAL FAILURE for record {record.id}: {str(e)}")
        record.status = 'FAILED'
        record.validation_status = 'ERROR'
        record.validation_message = f"Extraction Error: {str(e)}"
        record.save()
        return {
            "data": {},
            "validation": {"status": "ERROR", "error": str(e)}
        }

def finalize_merged_records(records, auto_save: bool = True):
    """
    Groups and merges multi-page invoices into a single voucher.
    """
    if not records:
        return {"status": "ERROR", "error": "No records to merge"}
    
    if len(records) == 1:
        return validate_and_process(records[0], auto_save=auto_save)
    
    print(f"MERGING {len(records)} records for multi-page processing...")
    
    # ── Phase 1: Aggregation (Strict Rules per user request) ──
    primary = records[0] # FIRST record
    last_record = records[-1] # LAST record
    
    all_items = []
    for r in records:
        if not r.extracted_data:
            logger.warning(f"Record {r.id} has no extracted data, skipping in merge.")
            continue
        data = r.extracted_data
        sections = data.get("sections", {})
        all_items.extend(sections.get("items", []))
            
    # ── Phase 2: Create a virtual merged state ──
    if not primary.extracted_data:
        return {"status": "ERROR", "error": "Primary record has no extracted data"}
        
    merged_data = primary.extracted_data.copy()
    if "sections" not in merged_data: merged_data["sections"] = {}
    
    # 1. Header: already from primary (records[0])
    
    # 2. Line Items: Aggregate
    merged_data["sections"]["items"] = all_items
    
    # 3. Totals / Taxes / Charges: From LAST record
    last_extracted = last_record.extracted_data or {}
    last_sections = last_extracted.get("sections", {})
    merged_data["sections"]["supply_details"] = last_sections.get("supply_details", {})
    merged_data["sections"]["due_details"] = last_sections.get("due_details", {})
    merged_data["sections"]["transit_details"] = last_sections.get("transit_details", {})
    
    # ── Phase 2.5: Re-Normalize ──
    # Important: Clear _raw_source so normalize() uses the newly merged items and totals
    if "_raw_source" in merged_data:
        del merged_data["_raw_source"]
    
    # Re-run normalization to trigger tax type reconciliation across the combined items
    print("RE-NORMALIZING merged multi-page record to reconcile tax types...")
    merged_data = normalize(merged_data)
    
    # Update top-level field for consistency
    if last_record.extracted_data:
        merged_data["total_invoice_value"] = last_record.extracted_data.get("total_invoice_value")
        
    primary.extracted_data = merged_data
    # We save temporarily to allow validate_and_process to work with DB data
    primary.save()
    
    # ── Phase 3: Process the merged record ──
    res = validate_and_process(primary, auto_save=auto_save)
    
    # ── Phase 4: Sync status to other pages ──
    if res.get("status") == "VOUCHER_CREATED":
        v_id = res.get("voucher_id")
        for r in records[1:]:
            r.processed = True
            r.validation_status = "VOUCHER_CREATED"
            r.status = "VOUCHER_CREATED"
            r.voucher_id = v_id
            r.save()
            
    return res

def validate_and_process(record: InvoiceTempOCR, auto_save: bool = False):
    """
    CORE VALIDATION FUNCTION: 
    Checks for Vendor, Duplicates, and optionally creates Voucher.
    """
    logger.error(f"[TRACE] validate_and_process.entry | record_id={record.id} | session={record.upload_session_id} | py_id={id(record)}")
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

        # 🔹 PURCHASE DUPLICATE VALIDATION (Invoice No + GSTIN + Branch + Vendor Name)
        # We do this BEFORE the vendor check so we can show 'Already Exist' even for unresolved vendors
        is_duplicate = VoucherPurchaseSupplierDetails.objects.filter(
            supplier_invoice_no__iexact=invoice_no,
            gstin__iexact=gstin,
            branch__iexact=branch_name,
            vendor_name__iexact=vendor_name,
            tenant_id=tenant_id
        ).exists()
        print("DUPLICATE CHECK:", is_duplicate)

        if is_duplicate:
            record.validation_status = "DUPLICATE"
            record.save()
            print("FINAL STATUS: DUPLICATE")
            # We still want to check if the vendor exists to show correct 'Vendor Status' in UI
            # But the primary pipeline status for the row becomes DUPLICATE
            from vendors.vendor_validation_logic import validate_vendor
            val_res = validate_vendor(tenant_id, vendor_name, gstin, branch=branch_name)
            if val_res['status'] == 'EXISTING_VENDOR':
                 record.vendor_id = val_res['vendor_id']
                 record.save()
            return {"status": "DUPLICATE"}

        if not vendor:
            # Re-check if it's there (duplicate check might have used OCR name, this uses master)
            from vendors.vendor_validation_logic import validate_vendor
            val_res = validate_vendor(tenant_id, vendor_name, gstin, branch=branch_name)
            
            if val_res['status'] == 'EXISTING_VENDOR':
                vendor = VendorMasterBasicDetail.objects.filter(id=val_res['vendor_id'], tenant_id=tenant_id).first()
                if vendor:
                    record.vendor_id = vendor.id
                    record.validation_status = 'FOUND'
                    record.save()
            else:
                record.validation_status = "NEED_VENDOR"
                record.save()
                return {"status": "NEED_VENDOR"}

        # Sync vendor name from master if found
        if vendor:
             vendor_name = vendor.vendor_name

        # 🔹 CREATE PURCHASE VOUCHER (ONLY IF auto_save IS TRUE)
        if not auto_save:
            record.validation_status = "READY"
            record.save()
            print("FINAL STATUS: READY (Waiting for manual finalization)")
            return {"status": "READY"}

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
                # Helper to safely convert to decimal
                def to_dec(val):
                    try:
                        if not val or str(val).strip() == "": return 0
                        # Clean currency symbols and commas
                        clean_val = str(val).replace('₹', '').replace(',', '').strip()
                        return float(clean_val)
                    except:
                        return 0

                mapped_items.append({
                    "itemCode": "",
                    "itemName": item.get('description') or "—",
                    "hsnSac": item.get('hsn_sac') or "",
                    "qty": to_dec(item.get('quantity')),
                    "uom": item.get('uom') or "",
                    "rate": to_dec(item.get('rate')),
                    "taxableValue": to_dec(item.get('taxable_value') or item.get('amount')),
                    "cgst": to_dec(item.get('cgst_amount') or item.get('cgst')),
                    "sgst": to_dec(item.get('sgst_amount') or item.get('sgst')),
                    "igst": to_dec(item.get('igst_amount') or item.get('igst')),
                    "invoiceValue": to_dec(item.get('amount') or item.get('line_total'))
                })

            # Create INR supply details (without items field which doesn't exist on this model)
            VoucherPurchaseSupplyINRDetails.objects.create(
                tenant_id=tenant_id,
                supplier_details=voucher_main,
                description=f"Auto-validated via OCR Pipeline: {record.file_path}"
            )

            # Create line items in the correct table
            from accounting.models_voucher_purchase import VoucherPurchaseItem
            for m_item in mapped_items:
                VoucherPurchaseItem.objects.create(
                    tenant_id=tenant_id,
                    supplier_details=voucher_main,
                    item_name=m_item['itemName'],
                    hsn_sac=m_item['hsnSac'],
                    quantity=m_item['qty'],
                    uom=m_item['uom'],
                    rate=m_item['rate'],
                    taxable_value=m_item['taxableValue'],
                    cgst_amount=m_item['cgst'],
                    sgst_amount=m_item['sgst'],
                    igst_amount=m_item['igst'],
                    invoice_value=m_item['invoiceValue'],
                    item_code="" # To be matched later if needed
                )

            # Re-fetch total values from supply details if needed
            total_inv_val = to_dec(supply.get('total_invoice_value'))
            VoucherPurchaseDueDetails.objects.create(
                tenant_id=tenant_id,
                supplier_details=voucher_main,
                to_pay=total_inv_val,
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
                total=total_inv_val,
                source='ocr_pipeline',
                reference_id=voucher_main.id,
                total_taxable_amount=to_dec(supply.get('total_taxable_value')),
                total_cgst=to_dec(supply.get('total_cgst')),
                total_sgst=to_dec(supply.get('total_sgst')),
                total_igst=to_dec(supply.get('total_igst'))
                # items_data removed as it has no setter
            )

            # 🔹 FINAL STATUS UPDATE
            record.status = "VOUCHER_CREATED"
            record.validation_status = "VOUCHER_CREATED"
            record.vendor_id = vendor.id
            record.voucher_id = voucher_main.id
            record.processed = True
            logger.info(f"Saving record {record.id}: status={record.status}, validation_status={record.validation_status}, vendor_id={record.vendor_id}, voucher_id={record.voucher_id}, processed={record.processed}")
            record.save(update_fields=['status', 'validation_status', 'vendor_id', 'voucher_id', 'processed'])
            
            print(f"FINAL STATUS: VOUCHER_CREATED (Voucher={voucher_main.id})")
            return {"status": "VOUCHER_CREATED", "voucher_id": voucher_main.id}

    except Exception as e:
        logger.error(f"AUTO-VALIDATION FAILED for record {record.id}: {str(e)}")
        record.validation_status = "ERROR"
        record.validation_message = str(e)
        record.save()
        print("FINAL STATUS: ERROR (Exception)")
        return {"status": "ERROR"}
