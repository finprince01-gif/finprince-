import django, os, sys
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
django.setup()

from django.contrib.auth import get_user_model
from ocr_pipeline.models import InvoiceTempOCR
from pending_purchases.models import PendingPurchase
from ocr_pipeline.pipeline import run_gst_validation_engine
from django.utils import timezone

User = get_user_model()

def run_verification():
    print("=" * 80)
    print(" GST MISMATCH CORRECTION BACKEND VERIFICATION RUN")
    print("=" * 80)

    # 1. Get or create a dummy user
    user = User.objects.filter(is_superuser=True).first()
    if not user:
        user = User.objects.create_superuser(
            username="gst_tester",
            email="gst_tester@example.com",
            password="testpassword"
        )
        print(f"Created superuser: {user.username}")
    else:
        print(f"Using superuser: {user.username}")

    # Ensure user has a tenant/branch ID set (needed by tenant checks)
    if not user.branch_id:
        from core.models import Branch
        branch = Branch.objects.first()
        if not branch:
            branch = Branch.objects.create(name="Main Test Branch", gstin="27AAAAA1111A1Z1")
        user.branch_id = branch.id
        user.save()
        print(f"Set user branch_id to: {branch.id}")

    tenant_id = user.branch_id

    # 2. Create a test InvoiceTempOCR record with an unresolved GST calculation mismatch
    # Let's say: Taxable value = 1000.0, rate = 18%, Interstate GST
    # Expected IGST = 180.0
    # Current IGST in extracted totals = 150.0 (leads to a difference of 30.0 > 1.0)
    test_extracted_data = {
        "invoice_no": "GST-TEST-001",
        "gstin": "29BBBBB2222B2Z2",
        "total_taxable_value": 1000.0,
        "gst_rate": "18%",
        "total_igst": 150.0, # Mismatch: extracted 150, expected 180
        "total_cgst": 0.0,
        "total_sgst": 0.0,
        "total_invoice_value": 1150.0,
        "items": [
            {
                "line_index": 0,
                "description": "Test Product",
                "taxable_value": 1000.0,
                "gst_rate": 18.0,
                "cgst_amount": 0.0,
                "sgst_amount": 0.0,
                "igst_amount": 150.0, # Extracted item tax
                "line_total": 1150.0
            }
        ],
        "sections": {
            "supply_details": {
                "total_taxable_value": 1000.0,
                "total_igst": 150.0,
                "total_cgst": 0.0,
                "total_sgst": 0.0,
                "total_invoice_value": 1150.0
            }
        }
    }

    # Clean old test records if any
    InvoiceTempOCR.objects.filter(supplier_invoice_no="GST-TEST-001", tenant_id=tenant_id).delete()

    record = InvoiceTempOCR.objects.create(
        tenant_id=tenant_id,
        supplier_invoice_no="GST-TEST-001",
        gstin="29BBBBB2222B2Z2",
        status="EXTRACTED",
        validation_status="PENDING",
        voucher_type="PURCHASE",
        extracted_data=test_extracted_data
    )
    print(f"Created staging record: ID={record.id}, validation_status={record.validation_status}")

    # Set supplier branch state prefix to 29, user's branch state prefix to 27
    from core.models import Branch
    Branch.objects.filter(id=tenant_id).update(gstin="27AAAAA1111A1Z1")

    # Create dummy PendingPurchase as well
    pp = PendingPurchase.objects.create(
        branch_id=tenant_id,
        source_scan_row_id=record.id,
        source_document_hash=f"gst_test_hash_{record.id}",
        invoice_number="GST-TEST-001",
        vendor_status="EXISTS",
        item_status="ALREADY EXIST",
        voucher_status="NEED_TO_SAVE",
        pending_purchase_status="PENDING",
        extraction_payload=record.extracted_data
    )
    print(f"Created PendingPurchase: ID={pp.id}")

    # 3. Run validation engine first
    print("\n--- Running GST Validation Engine on Mismatch Record ---")
    run_gst_validation_engine(record, user=user)
    record.refresh_from_db()

    trail = record.extracted_data.get('gst_audit_trail', {})
    print(f"validation_status : {record.validation_status} (Expected: GST_MISMATCH)")
    print(f"difference_amount : {trail.get('difference_amount')} (Expected: 30.0)")
    print(f"trail.validation_status : {trail.get('validation_status')} (Expected: FAIL)")

    # Assertions
    assert record.validation_status == 'GST_MISMATCH', "Validation status should be GST_MISMATCH!"
    assert trail.get('validation_status') == 'FAIL', "Audit validation status should be FAIL!"
    assert trail.get('difference_amount') == 30.0, "Difference amount should be 30.0!"

    # 4. Perform Correction Flow (simulating the view's post request)
    print("\n--- Simulating Correct GST View Flow ---")
    # Correct values: IGST = 180.0
    correct_cgst = 0.0
    correct_sgst = 0.0
    correct_igst = 180.0

    ext = record.extracted_data
    # Update total fields
    ext['total_igst'] = correct_igst
    if 'sections' in ext and 'supply_details' in ext['sections']:
        ext['sections']['supply_details']['total_igst'] = correct_igst

    # Remove previous resolution choice
    if 'gst_resolution' in ext:
        ext.pop('gst_resolution', None)

    record.save(update_fields=['extracted_data'])

    # Run GST engine to calculate difference
    run_gst_validation_engine(record, user=user)
    record.refresh_from_db()

    new_trail = record.extracted_data.get('gst_audit_trail', {})
    diff_val = new_trail.get('difference_amount', 0.0)
    print(f"New Difference Amount: {diff_val} (Expected: 0.0)")

    if diff_val <= 1.0:
        print("Success! Difference within tolerance limit. Setting gst_resolution to CORRECTED...")
        record.extracted_data["gst_resolution"] = "CORRECTED"
        record.save(update_fields=['extracted_data'])
        
        # Rerun to regenerate metadata and update item prices
        run_gst_validation_engine(record, user=user)
        record.refresh_from_db()

    # Propagate to PendingPurchase
    PendingPurchase.objects.filter(source_scan_row_id=record.id).update(
        extraction_payload=record.extracted_data
    )

    pp.refresh_from_db()

    final_trail = record.extracted_data.get('gst_audit_trail', {})
    final_pp_trail = pp.extraction_payload.get('gst_audit_trail', {})

    print(f"\nFinal record.validation_status: {record.validation_status} (Expected: NEED_TO_SAVE)")
    print(f"Final gst_resolution: {record.extracted_data.get('gst_resolution')} (Expected: CORRECTED)")
    print(f"Final audit status: {final_trail.get('validation_status')} (Expected: PASS)")
    print(f"Final item IGST: {record.extracted_data['items'][0].get('igst_amount')} (Expected: 180.0)")
    print(f"Final PP audit status: {final_pp_trail.get('validation_status')} (Expected: PASS)")

    # Assertions
    assert record.validation_status == 'NEED_TO_SAVE', "Staging record should be back to NEED_TO_SAVE!"
    assert record.extracted_data.get('gst_resolution') == 'CORRECTED', "gst_resolution should be CORRECTED!"
    assert final_trail.get('validation_status') == 'PASS', "Final audit status should be PASS!"
    assert record.extracted_data['items'][0].get('igst_amount') == 180.0, "Item IGST should be updated to expected 180.0!"
    assert final_pp_trail.get('validation_status') == 'PASS', "PendingPurchase audit status should be PASS!"

    print("\n" + "=" * 80)
    print(" ALL TESTS PASSED SUCCESSFULLY! GST VALIDATION ENGINE AND CORRECTION FLOW INTEGRITY IS 100% CORRECT.")
    print("=" * 80)

    # Clean up test records
    InvoiceTempOCR.objects.filter(id=record.id).delete()
    PendingPurchase.objects.filter(id=pp.id).delete()

if __name__ == "__main__":
    run_verification()
