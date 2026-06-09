import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from pending_purchases.models import PendingPurchase
from vendors.models import VendorMasterBasicDetail, VendorMasterGSTDetails

print("Checking record 1006957...")
try:
    rec = InvoiceTempOCR.objects.get(id=1006957)
    print(f"Staging Record: id={rec.id}")
    print(f"  status={rec.status}")
    print(f"  processed={rec.processed}")
    print(f"  validation_status={rec.validation_status}")
    print(f"  vendor_status={rec.vendor_status}")
    print(f"  vendor_id={rec.vendor_id}")
    print(f"  supplier_invoice_no={rec.supplier_invoice_no}")
    print(f"  gstin={rec.gstin}")
    print(f"  branch={rec.branch}")
    print(f"  tenant_id={rec.tenant_id}")
    print(f"  extracted_data keys: {list(rec.extracted_data.keys()) if rec.extracted_data else None}")
    
    # Check master details for the vendor
    from vendors.vendor_validation_logic import canonicalize_gstin_ocr, normalize_branch
    gst = canonicalize_gstin_ocr(rec.gstin)
    br = normalize_branch(rec.branch or "Main Branch")
    print(f"\nChecking VendorMasterGSTDetails/VendorMasterBasicDetail for GSTIN: {gst}, Branch: {br}")
    
    gst_details = VendorMasterGSTDetails.objects.filter(gstin__iexact=gst, reference_name__iexact=br)
    print(f"  GST Details rows matching exact GSTIN + Branch: {gst_details.count()}")
    for gd in gst_details:
        print(f"    gd id={gd.id}, vendor_id={gd.vendor_id}, reference_name={gd.reference_name}, gstin={gd.gstin}")
        
    gst_details_any_branch = VendorMasterGSTDetails.objects.filter(gstin__iexact=gst)
    print(f"  GST Details rows matching GSTIN (any branch): {gst_details_any_branch.count()}")
    for gd in gst_details_any_branch:
        print(f"    gd id={gd.id}, vendor_id={gd.vendor_id}, reference_name={gd.reference_name}, gstin={gd.gstin}")
        
    # Check if Vendor exists with that name
    if rec.extracted_data and rec.extracted_data.get('vendor_name'):
        vname = rec.extracted_data.get('vendor_name')
        basic_by_name = VendorMasterBasicDetail.objects.filter(vendor_name__iexact=vname)
        print(f"  Basic details matching exact name '{vname}': {basic_by_name.count()}")
        for bd in basic_by_name:
            print(f"    bd id={bd.id}, name={bd.vendor_name}, tenant_id={bd.tenant_id}")
            gsts = VendorMasterGSTDetails.objects.filter(vendor_basic_detail=bd)
            print(f"      GST Details count: {gsts.count()}")
            for gst_detail in gsts:
                print(f"        gstin={gst_detail.gstin}, reference_name={gst_detail.reference_name}")

    # Check if in PendingPurchase
    pp = PendingPurchase.objects.get(source_scan_row_id=1006957)
    print(f"\nPendingPurchase Record: id={pp.id}")
    print(f"  invoice_number={pp.invoice_number}")
    print(f"  vendor_name={pp.vendor_name}")
    print(f"  vendor_gstin={pp.vendor_gstin}")
    print(f"  vendor_status={pp.vendor_status}")
    print(f"  item_status={pp.item_status}")
    print(f"  voucher_status={pp.voucher_status}")
    print(f"  pending_purchase_status={pp.pending_purchase_status}")

except Exception as e:
    print(f"Error: {e}")
