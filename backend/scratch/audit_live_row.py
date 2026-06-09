import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from pending_purchases.models import PendingPurchase
from pending_purchases.views import PendingPurchaseViewSet
from rest_framework.test import APIRequestFactory, force_authenticate
from core.models import User
from ocr_pipeline.pipeline import validate_and_process

def run_live_audit():
    print("=== LIVE ROW REVALIDATION AUDIT START ===")
    
    # Target PP row currently in queue
    pp_id = 2239
    rec_id = 1006961
    
    pp = PendingPurchase.objects.get(id=pp_id)
    rec = InvoiceTempOCR.objects.get(id=rec_id)
    
    # STEP 1: Log initial state
    print("\n--- STEP 1: Initial Database State ---")
    print(f"PendingPurchase ID: {pp.id}")
    print(f"  vendor_status: {pp.vendor_status}")
    print(f"  item_status: {pp.item_status}")
    print(f"  voucher_status: {pp.voucher_status}")
    print(f"  pending_purchase_status: {pp.pending_purchase_status}")
    print(f"InvoiceTempOCR ID: {rec.id}")
    print(f"  validation_status: {rec.validation_status}")
    print(f"  processed: {rec.processed}")
    print(f"  status: {rec.status}")
    print(f"  extracted_data keys: {list(rec.extracted_data.keys()) if rec.extracted_data else None}")
    
    print("\n--- STEP 1: Review Payload (initial) ---")
    import pprint
    pprint.pprint(pp.review_payload)
    
    factory = APIRequestFactory()
    admin_user = User.objects.get(username='admin')
    
    # Request detail endpoint to simulate frontend GET
    request_get = factory.get(f'/api/pending-purchases/{pp_id}/')
    force_authenticate(request_get, user=admin_user)
    view_detail = PendingPurchaseViewSet.as_view({'get': 'retrieve'})
    response_get = view_detail(request_get, pk=pp_id)
    print("\n--- STEP 1: Initial GET API Response ---")
    pprint.pprint(response_get.data)
    
    # STEP 2: Call Revalidate and trace execution
    print("\n--- STEP 2: Triggering Revalidate Action ---")
    request_reval = factory.post(f'/api/pending-purchases/{pp_id}/revalidate/')
    force_authenticate(request_reval, user=admin_user)
    view_reval = PendingPurchaseViewSet.as_view({'post': 'revalidate'})
    
    response_reval = view_reval(request_reval, pk=pp_id)
    
    # STEP 3 & 5: Log returned values and API response
    print("\n--- STEP 3 & 5: Capture API Response ---")
    print(f"Status Code: {response_reval.status_code}")
    pprint.pprint(response_reval.data)
    
    # STEP 4: Query database immediately after revalidate
    pp.refresh_from_db()
    rec.refresh_from_db()
    print("\n--- STEP 4: Immediately Query Database Post-Revalidate ---")
    print(f"PendingPurchase ID: {pp.id}")
    print(f"  vendor_status: {pp.vendor_status}")
    print(f"  item_status: {pp.item_status}")
    print(f"  voucher_status: {pp.voucher_status}")
    print(f"  pending_purchase_status: {pp.pending_purchase_status}")
    print(f"InvoiceTempOCR ID: {rec.id}")
    print(f"  validation_status: {rec.validation_status}")
    print(f"  processed: {rec.processed}")
    print(f"  status: {rec.status}")
    
    # STEP 6: Capture React state simulation / explanation
    print("\n--- STEP 6: Capture React State Mapping ---")
    print("In React (PendingPurchases.tsx):")
    print("When the response from revalidate comes in, it updates the local state for the row:")
    print("  vendor_status =", pp.vendor_status)
    print("  item_status =", pp.item_status)
    print("  voucher_status =", pp.voucher_status)
    print("\nLet's check the VendorStatusBadge, ItemStatusBadge, and VoucherStatusBadge definitions:")
    print("VendorStatusBadge maps:")
    print("  'VENDOR_STATUS_EXISTING', 'ALREADY_EXIST', 'EXISTS' -> 'ALREADY EXIST'")
    print("  Any other value -> 'CREATE VENDOR'")
    print("ItemStatusBadge maps:")
    print("  'ITEM_STATUS_EXISTING', 'ALREADY_EXIST', 'ALREADY EXIST' -> 'ALREADY EXIST'")
    print("  Any other value -> 'CREATE ITEM'")
    print("VoucherStatusBadge maps:")
    print("  'VOUCHER_STATUS_NEW', 'NEED_TO_SAVE', 'NEED TO SAVE' -> 'NEED TO SAVE'")
    print("  'VOUCHER_STATUS_EXISTING', 'ALREADY_EXIST' -> 'ALREADY EXIST'")
    print("  Any other value -> 'PENDING'")
    
    print("\n=== LIVE ROW REVALIDATION AUDIT COMPLETE ===")

if __name__ == '__main__':
    run_live_audit()
