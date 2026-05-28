import os
import sys
import django
import time

# Setup Django path & environment
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

import logging
logging.basicConfig(level=logging.WARNING)  # Suppress noise; only warnings+

from ocr_pipeline.models import InvoiceTempOCR
from ocr_pipeline.pipeline import validate_and_process
from accounting.models import Voucher, JournalEntry, MasterLedger
from accounting.models_voucher_purchase import VoucherPurchaseSupplierDetails, VoucherPurchaseItem
from inventory.models import InventoryOperationNewGRN
from vendors.models import VendorMasterBasicDetail


# ─── helper ──────────────────────────────────────────────────────────────────
def check_ledger(tenant_id, name_fragment):
    """Return first MasterLedger whose name contains name_fragment (case-insensitive)."""
    return MasterLedger.objects.filter(
        tenant_id=tenant_id,
        name__icontains=name_fragment
    ).first()


def run_verification():
    print("==================================================================")
    print("PURCHASE SCAN PERSISTENCE VERIFICATION RUN")
    print("==================================================================")

    # ── 1. Fetch a staging record ──────────────────────────────────────────
    record = InvoiceTempOCR.objects.filter(extracted_data__isnull=False).last()
    if not record:
        print("ERROR: No staged OCR records found in invoice_ocr_temp with extracted_data!")
        return

    tenant_id = str(record.tenant_id)
    print(f"\nStaging Record  : ID={record.id}  Tenant={tenant_id}")
    print(f"  Status        : {record.status} / {record.validation_status}")

    # ── 2. Baseline counts ─────────────────────────────────────────────────
    base_headers   = VoucherPurchaseSupplierDetails.objects.filter(tenant_id=tenant_id).count()
    base_items     = VoucherPurchaseItem.objects.filter(tenant_id=tenant_id).count()
    base_vouchers  = Voucher.objects.filter(tenant_id=tenant_id, type='purchase').count()
    base_journal   = JournalEntry.objects.filter(tenant_id=tenant_id).count()
    base_grns      = InventoryOperationNewGRN.objects.filter(tenant_id=tenant_id).count()

    print(f"\nBaseline counts:")
    print(f"  VoucherPurchaseSupplierDetails : {base_headers}")
    print(f"  VoucherPurchaseItem            : {base_items}")
    print(f"  Voucher (master)               : {base_vouchers}")
    print(f"  JournalEntry                   : {base_journal}")
    print(f"  InventoryOperationNewGRN       : {base_grns}")

    # ── 3. Pre-flight ledger check ─────────────────────────────────────────
    purch_ledger = check_ledger(tenant_id, 'Purchase')
    vendor_obj   = VendorMasterBasicDetail.objects.filter(tenant_id=tenant_id).first()
    vendor_ledger = vendor_obj.ledger if vendor_obj and vendor_obj.ledger_id else None

    print(f"\nPre-flight ledger check:")
    print(f"  Purchase Account ledger : {'FOUND — ' + str(purch_ledger.name) if purch_ledger else 'MISSING — journal entries will be skipped'}")
    print(f"  Vendor ledger           : {'FOUND — ' + str(vendor_ledger) if vendor_ledger else 'MISSING — vendor credit entry skipped'}")

    # ── 4. Build a fully-wired injected payload ────────────────────────────
    unique_inv_no = f"VRF-{int(time.time())}"
    print(f"\nInjecting test invoice number: {unique_inv_no}")

    # Vendor info
    if not vendor_obj:
        print("ERROR: No VendorMasterBasicDetail found — cannot proceed.")
        return

    vendor_gstin  = "33ABACA5718R1ZD"
    vendor_branch = "Main Branch"
    if vendor_obj.gst_details.exists():
        gst = vendor_obj.gst_details.first()
        vendor_gstin  = gst.gstin or vendor_gstin
        vendor_branch = gst.reference_name or gst.branch_city or vendor_branch

    # Item row in the CANONICAL snake_case format that get_canonical_export_record produces
    # (pipeline reads: item_code, description, taxable_value, quantity, rate, gst_rate, hsn_sac, uom,
    #                  cgst_amount, sgst_amount, igst_amount, cess_amount)
    canon_item = {
        "item_code":     "TEST-001",
        "description":   "Test Verification Item",
        "hsn_sac":       "998898",
        "quantity":      5,
        "uom":           "PCS",
        "rate":          100.0,
        "taxable_value": 500.0,
        "cgst_amount":   45.0,
        "sgst_amount":   45.0,
        "igst_amount":   0.0,
        "cess_amount":   0.0,
        "gst_rate":      18.0,
        "amount":        590.0,
    }

    # Build extracted_data in the EXACT structure the pipeline canonical parser expects
    # sections.supplier_details → gstin, invoice_no, vendor_name, branch, invoice_date
    # sections.supply_details   → totals
    # sections.items / top-level items → line items (canonical format)
    ext_data = {
        "gstin":                vendor_gstin,
        "invoice_no":           unique_inv_no,
        "supplier_invoice_no":  unique_inv_no,
        "vendor_name":          vendor_obj.vendor_name,
        "branch":               vendor_branch,
        "invoice_date":         "2026-05-28",
        "total_taxable_value":  500.0,
        "total_cgst":           45.0,
        "total_sgst":           45.0,
        "total_igst":           0.0,
        "total_cess":           0.0,
        "total_invoice_value":  590.0,
        "place_of_supply":      "Tamil Nadu",
        # canonical items list
        "items": [canon_item],
        "sections": {
            "supplier_details": {
                "invoice_no":          unique_inv_no,
                "supplier_invoice_no": unique_inv_no,
                "gstin":               vendor_gstin,
                "vendor_name":         vendor_obj.vendor_name,
                "branch":              vendor_branch,
                "invoice_date":        "2026-05-28",
                "vendor_address":      "Test Address, Chennai",
            },
            "supply_details": {
                "total_taxable_value": 500.0,
                "total_cgst":          45.0,
                "total_sgst":          45.0,
                "total_igst":          0.0,
                "total_cess":          0.0,
                "total_invoice_value": 590.0,
            },
            # items also nested under sections for belt-and-suspenders
            "items": [canon_item],
            "due_details": {
                "payment_terms": "Net 30",
            }
        }
    }

    # Stamp onto the record
    record.extracted_data      = ext_data
    record.supplier_invoice_no = unique_inv_no
    record.gstin               = vendor_gstin
    record.branch              = vendor_branch
    record.vendor_id           = vendor_obj.id
    record.validation_status   = 'FOUND'
    record.status              = 'EXTRACTED'
    record.save()
    print(f"  Record saved with vendor_id={vendor_obj.id} and status=EXTRACTED")

    # ── 5. Execute pipeline ────────────────────────────────────────────────
    print("\nCalling validate_and_process(auto_save=True, force=True) …")
    res = validate_and_process(record, auto_save=True, force=True)
    print(f"Pipeline result : {res}")

    # ── 6. Post-execution counts ───────────────────────────────────────────
    new_headers  = VoucherPurchaseSupplierDetails.objects.filter(tenant_id=tenant_id).count()
    new_items    = VoucherPurchaseItem.objects.filter(tenant_id=tenant_id).count()
    new_vouchers = Voucher.objects.filter(tenant_id=tenant_id, type='purchase').count()
    new_journal  = JournalEntry.objects.filter(tenant_id=tenant_id).count()
    new_grns     = InventoryOperationNewGRN.objects.filter(tenant_id=tenant_id).count()

    h_diff = new_headers  - base_headers
    i_diff = new_items    - base_items
    v_diff = new_vouchers - base_vouchers
    j_diff = new_journal  - base_journal
    g_diff = new_grns     - base_grns

    print("\n==================================================================")
    print("VERIFICATION RESULTS")
    print("==================================================================")
    rows = [
        ("VoucherPurchaseSupplierDetails", base_headers,  new_headers,  h_diff, 1),
        ("VoucherPurchaseItem",            base_items,     new_items,     i_diff, 1),
        ("Voucher (accounting master)",    base_vouchers,  new_vouchers,  v_diff, 1),
        ("JournalEntry (ledger postings)", base_journal,   new_journal,   j_diff, 1 if (purch_ledger and vendor_ledger) else 0),
        ("InventoryOperationNewGRN",       base_grns,      new_grns,      g_diff, 0),  # GRN requires real item master linkage
    ]

    all_ok = True
    for label, base, new, diff, expected in rows:
        tick = "OK  " if diff >= expected else "FAIL"
        note = "" if diff >= expected else f"  <- EXPECTED +{expected}"
        print(f"  [{tick}] {label:<40}  {base} -> {new}  (+{diff}){note}")
        if diff < expected:
            all_ok = False

    print("==================================================================")

    # ── 7. Detailed inspection of what was saved ───────────────────────────
    saved_header = VoucherPurchaseSupplierDetails.objects.filter(
        tenant_id=tenant_id, supplier_invoice_no=unique_inv_no
    ).first()

    if saved_header:
        print(f"\nSaved header     : ID={saved_header.id}  invoice={saved_header.supplier_invoice_no}")
        print(f"  Vendor         : {saved_header.vendor_name}")
        print(f"  GSTIN          : {saved_header.gstin}")
        print(f"  Purchase Vch # : {saved_header.purchase_voucher_no}")

        saved_items = VoucherPurchaseItem.objects.filter(supplier_details=saved_header)
        print(f"  Line items saved: {saved_items.count()}")
        for it in saved_items:
            print(f"    -> {it.item_name}  qty={it.quantity}  taxable={it.taxable_value}  total={it.invoice_value}")

        saved_master = Voucher.objects.filter(
            tenant_id=tenant_id, reference_id=saved_header.id, type='purchase'
        ).first()
        if saved_master:
            j_entries = JournalEntry.objects.filter(tenant_id=tenant_id, voucher_id=saved_master.id)
            print(f"\n  Master Voucher  : ID={saved_master.id}  No={saved_master.voucher_number}")
            print(f"  JournalEntries  : {j_entries.count()}")
            for je in j_entries:
                print(f"    Dr={je.debit:>10.2f}  Cr={je.credit:>10.2f}  Ledger={je.ledger_name}")
        else:
            print("\n  Master Voucher  : NOT FOUND (Voucher record missing)")

    print("\n==================================================================")
    if all_ok:
        print("RESULT: PASS — All critical tables populated.")
    else:
        print("RESULT: PARTIAL — Some tables still missing data (see ✗ rows above).")
        if not purch_ledger:
            print("  FIX NEEDED: Create 'Purchase Account' MasterLedger for this tenant.")
        if not vendor_ledger:
            print("  FIX NEEDED: Link a MasterLedger to the vendor record.")
    print("==================================================================")


if __name__ == "__main__":
    run_verification()
