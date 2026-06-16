import os
import sys
import django

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from pending_purchases.models import PendingPurchase
from ocr_pipeline.models import InvoiceTempOCR
from pending_purchases.services import evaluate_pending_purchase
from ocr_pipeline.statuses import ValidationEnums

def run_verification():
    print("--- Starting Deduplication Verification ---")
    
    # 1. Fetch current active PendingPurchase for UMT25-26/091
    invoice_no = "UMT25-26/091"
    gstin = "33BTPPM6743D1ZF"
    
    pps = PendingPurchase.objects.filter(
        invoice_number=invoice_no,
        vendor_gstin=gstin,
        pending_purchase_status='PENDING'
    )
    
    print(f"Current active PendingPurchase count for {invoice_no}: {pps.count()}")
    if pps.count() != 1:
        print("Error: Expected exactly 1 active PendingPurchase after collapse.")
        sys.exit(1)
        
    original_pp = pps.first()
    original_pp_id = original_pp.id
    original_source_id = original_pp.source_scan_row_id
    print(f"Original PendingPurchase ID: {original_pp_id}, linked to staging ID: {original_source_id}")
    
    # Fetch the corresponding staging record
    staging = InvoiceTempOCR.objects.get(id=original_source_id)
    
    # 2. Simulate a new upload session by creating a new InvoiceTempOCR record
    # with the same business details but a new upload_session_id and file_hash
    import uuid
    new_session_id = str(uuid.uuid4())
    new_file_hash = f"test_hash_{uuid.uuid4().hex[:16]}"
    
    new_staging = InvoiceTempOCR.objects.create(
        tenant_id=staging.tenant_id,
        upload_session_id=new_session_id,
        file_hash=new_file_hash,
        file_path=staging.file_path,
        voucher_type=staging.voucher_type,
        extracted_data=staging.extracted_data,
        supplier_invoice_no=staging.supplier_invoice_no,
        gstin=staging.gstin,
        branch=staging.branch,
        status='EXTRACTED',
        validation_status='PENDING'
    )
    print(f"Created new staging record ID: {new_staging.id} for session: {new_session_id}")
    
    # 3. Call evaluate_pending_purchase on the new staging record
    # mimicking validate_and_process output
    ui_row = {
        'invoice_no': new_staging.supplier_invoice_no,
        'invoice_date': '2026-03-19',
        'vendor_name': 'UMT Vendor',
        'vendor_gstin': new_staging.gstin,
        'total_amount': 1500.00,
    }
    
    print("Invoking evaluate_pending_purchase with new staging record...")
    is_pending = evaluate_pending_purchase(
        record=new_staging,
        vendor_status=ValidationEnums.VENDOR_STATUS_EXISTING,
        voucher_status=ValidationEnums.VOUCHER_STATUS_NEW,
        item_status=ValidationEnums.ITEM_STATUS_CREATE, # needs creation -> triggers pending queue
        tenant_id=new_staging.tenant_id,
        ui_row=ui_row,
        auto_save=False
    )
    
    # 4. Assertions
    # Fetch records again
    final_pps = PendingPurchase.objects.filter(
        invoice_number=invoice_no,
        vendor_gstin=gstin,
        pending_purchase_status='PENDING'
    )
    
    print(f"Final active PendingPurchase count for {invoice_no}: {final_pps.count()}")
    
    assert final_pps.count() == 1, f"Assertion Failed: Expected exactly 1 active PendingPurchase, found {final_pps.count()}"
    
    updated_pp = final_pps.first()
    assert updated_pp.id == original_pp_id, f"Assertion Failed: PendingPurchase ID changed from {original_pp_id} to {updated_pp.id}"
    assert updated_pp.source_scan_row_id == new_staging.id, f"Assertion Failed: source_scan_row_id was not updated to new staging ID {new_staging.id}, still {updated_pp.source_scan_row_id}"
    assert updated_pp.scan_session_id == new_session_id, f"Assertion Failed: scan_session_id was not updated to {new_session_id}"
    assert updated_pp.source_document_hash == new_file_hash, f"Assertion Failed: source_document_hash was not updated to {new_file_hash}"
    
    print("SUCCESS: Existing PendingPurchase record was reused and successfully linked to the new staging ID without inserting any duplicate rows!")

if __name__ == '__main__':
    run_verification()
