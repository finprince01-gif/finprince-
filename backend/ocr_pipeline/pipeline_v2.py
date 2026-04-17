import logging
from django.db import transaction
from django.utils import timezone
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

def finalize_staging_record(record_id: int) -> dict:
    """
    STRICT Pipeline 2 Implementation:
    1. Validates vendors (by GSTIN)
    2. Prevents duplicate purchase vouchers (by GSTIN + Invoice No)
    3. Saves valid records into database tables
    4. Updates staging table status
    5. Uses ONLY the new OCR pipeline (NO legacy code)
    """
    try:
        record = InvoiceTempOCR.objects.get(id=record_id)
        if not record.extracted_data:
            return {"status": "FAILED", "error": "No extracted data found in staging record."}

        data = record.extracted_data
        sections = data.get('sections', {})
        supplier = sections.get('supplier_details', {})
        supply = sections.get('supply_details', {})
        due = sections.get('due_details', {})
        items = sections.get('items', [])

        gstin = (supplier.get('gstin') or "").strip().upper()
        invoice_number = (supplier.get('supplier_invoice_no') or "").strip()
        vendor_name = (supplier.get('vendor_name') or "").strip()
        branch = (supplier.get('branch') or "").strip() or 'Main Branch'
        address = (supplier.get('vendor_address') or "").strip()
        invoice_date = supplier.get('invoice_date')
        tenant_id = str(record.tenant_id)

        if not gstin or not invoice_number:
             return {"status": "FAILED", "error": "GSTIN and Invoice Number are mandatory for finalization."}

        # --- TRANSACTIONAL PROCESSING (CRITICAL) ---
        with transaction.atomic():
            
            # 🔍 STEP 1 — VENDOR VALIDATION + CREATION
            # RULE: GSTIN = UNIQUE. Name is NOT reliable.
            gst_record = VendorMasterGSTDetails.objects.filter(
                tenant_id=tenant_id,
                gstin__iexact=gstin,
                vendor_basic_detail__isnull=False
            ).select_related('vendor_basic_detail').first()

            if gst_record:
                vendor = gst_record.vendor_basic_detail
                logger.info(f"PIPELINE V2: Matched existing vendor {vendor.vendor_name} for GSTIN {gstin}")
            else:
                # CASE 2: GSTIN DOES NOT EXIST → CREATE NEW VENDOR
                logger.info(f"PIPELINE V2: Creating new vendor '{vendor_name}' for GSTIN {gstin}")
                
                # We create the vendor basic detail
                vendor = VendorMasterBasicDetail.objects.create(
                    tenant_id=tenant_id,
                    vendor_name=vendor_name or f"New Vendor {gstin[:8]}",
                    email=f"pending_{gstin[:8]}@example.com",
                    contact_no="+910000000000",
                    is_active=True
                )
                vendor.generate_vendor_code()
                vendor.save()
                
                # Create the GST identity
                VendorMasterGSTDetails.objects.create(
                    tenant_id=tenant_id,
                    vendor_basic_detail=vendor,
                    gstin=gstin,
                    legal_name=vendor_name or "New Vendor",
                    reference_name=branch,
                    branch_address=address
                )

            # 🔍 STEP 2 — PURCHASE DUPLICATE VALIDATION
            # RULE (STRICT): supplier_invoice_no + gstin exists in PurchaseVoucher
            duplicate_voucher = VoucherPurchaseSupplierDetails.objects.filter(
                supplier_invoice_no=invoice_number,
                gstin=gstin,
                tenant_id=tenant_id
            ).exists()

            if duplicate_voucher:
                record.validation_status = "DUPLICATE"
                record.status = "SKIPPED"
                record.save()
                return {
                    "status": "DUPLICATE", 
                    "message": f"RECORD SKIPPED: Invoice '{invoice_number}' already registered for GSTIN '{gstin}'."
                }

            # Determine input type (Interstate vs Intrastate)
            branch_record = Branch.objects.filter(id=tenant_id).first()
            company_gstin = branch_record.gstin if branch_record else None
            
            is_interstate = False
            if gstin and company_gstin and len(gstin) >= 2 and len(company_gstin) >= 2:
                is_interstate = gstin[:2] != company_gstin[:2]
            
            voucher_main = VoucherPurchaseSupplierDetails.objects.create(
                tenant_id=tenant_id,
                date=invoice_date or timezone.now().date(),
                supplier_invoice_no=invoice_number,
                supplier_invoice_date=invoice_date,
                vendor_name=vendor_name,
                vendor_basic_detail=vendor,
                gstin=gstin,
                branch=branch,
                bill_from=address,
                input_type='Interstate' if is_interstate else 'Intrastate'
            )

            # 🔍 STEP 5 — LINE ITEM INSERT
            # Maps items to the required ERP JSON structure
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
                description=f"Auto-generated via OCR Pipeline 2: {record.file_path}"
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

            # 🔗 Unified Voucher (Mandatory for double-entry and general ledger)
            # Find a unique voucher_number
            v_num = invoice_number
            if Voucher.objects.filter(voucher_number=v_num, tenant_id=tenant_id, type='purchase').exists():
                 v_num = f"{v_num}-{voucher_main.id}"
            
            voucher_unified = Voucher.objects.create(
                tenant_id=tenant_id,
                type='purchase',
                date=voucher_main.date,
                voucher_number=v_num,
                invoice_no=invoice_number,
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

            # 🔁 STEP 6 — UPDATE STAGING TABLE
            record.validation_status = "READY"
            record.status = "FINALIZED"
            record.processed = True
            record.vendor_id = vendor.id
            record.voucher_id = voucher_main.id
            record.save()

            return {
                "status": "READY",
                "vendor_id": vendor.id,
                "voucher_id": voucher_main.id,
                "message": f"Successfully created Purchase Voucher '{v_num}'."
            }

    except Exception as e:
        logger.error(f"PIPELINE V2 TRANSACTION FAILED: {str(e)}")
        return {"status": "FAILED", "error": str(e)}
