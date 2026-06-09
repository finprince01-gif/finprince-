import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from pending_purchases.models import PendingPurchase
from pending_purchases.views import PendingPurchaseViewSet
from rest_framework.test import APIRequestFactory, force_authenticate
from core.models import User
import json

def simulate():
    pp_id = 2239
    rec_id = 1006961
    
    pp = PendingPurchase.objects.get(id=pp_id)
    rec = InvoiceTempOCR.objects.get(id=rec_id)
    
    # Reset row to simulated initial state (before user revalidated)
    # This is to match what the user is seeing on their UI before they click anything.
    print("=== RESETTING DATABASE TO SIMULATE INITIAL UN-REVALIDATED STATE ===")
    PendingPurchase.objects.filter(id=pp_id).update(
        vendor_status='VENDOR_STATUS_CREATE',
        item_status='ITEM_STATUS_CREATE',
        voucher_status='VOUCHER_STATUS_NEW',
        pending_purchase_status='PENDING'
    )
    InvoiceTempOCR.objects.filter(id=rec_id).update(
        vendor_status='CREATE_VENDOR',
        validation_status='PENDING_PURCHASE',
        processed=True,
        status='COMPLETED'
    )
    
    pp.refresh_from_db()
    rec.refresh_from_db()
    
    print("\n=== STEP 1: BEFORE REVALIDATING ===")
    print(f"DATABASE: PendingPurchase row (id={pp_id}):")
    print(f"  vendor_status: {pp.vendor_status}")
    print(f"  item_status: {pp.item_status}")
    print(f"  voucher_status: {pp.voucher_status}")
    print(f"  pending_purchase_status: {pp.pending_purchase_status}")
    print(f"DATABASE: InvoiceTempOCR row (id={rec_id}):")
    print(f"  vendor_status (col): {rec.vendor_status}")
    print(f"  validation_status: {rec.validation_status}")
    print(f"  processed: {rec.processed}")
    
    factory = APIRequestFactory()
    admin_user = User.objects.get(username='admin')
    
    # Call list API before revalidate
    request_list_before = factory.get('/api/pending-purchases/')
    force_authenticate(request_list_before, user=admin_user)
    view_list = PendingPurchaseViewSet.as_view({'get': 'list'})
    response_list_before = view_list(request_list_before)
    item_before = [item for item in response_list_before.data if item['id'] == pp_id][0]
    print("\nAPI RESPONSE (GET /api/pending-purchases/) BEFORE REVALIDATE:")
    print(json.dumps({
        'id': item_before['id'],
        'vendor_name': item_before['vendor_name'],
        'vendor_gstin': item_before['vendor_gstin'],
        'vendor_status': item_before['vendor_status'],
        'item_status': item_before['item_status'],
        'voucher_status': item_before['voucher_status'],
        'pending_purchase_status': item_before['pending_purchase_status']
    }, indent=2))
    
    # STEP 2: Call Revalidate
    print("\n=== STEP 2: TRIGGERING REVALIDATE ===")
    request_reval = factory.post(f'/api/pending-purchases/{pp_id}/revalidate/')
    force_authenticate(request_reval, user=admin_user)
    view_reval = PendingPurchaseViewSet.as_view({'post': 'revalidate'})
    response_reval = view_reval(request_reval, pk=pp_id)
    
    # STEP 3 & 5: Log returned values and API response
    print("\n=== STEP 3 & 5: REVALIDATE API RESPONSE PAYLOAD ===")
    print(f"Status Code: {response_reval.status_code}")
    print(json.dumps(response_reval.data, indent=2))
    
    # STEP 4: Query database immediately after
    pp.refresh_from_db()
    rec.refresh_from_db()
    print("\n=== STEP 4: IMMEDIATELY QUERY DATABASE POST-REVALIDATE ===")
    print(f"DATABASE: PendingPurchase row (id={pp_id}):")
    print(f"  vendor_status: {pp.vendor_status}")
    print(f"  item_status: {pp.item_status}")
    print(f"  voucher_status: {pp.voucher_status}")
    print(f"  pending_purchase_status: {pp.pending_purchase_status}")
    print(f"DATABASE: InvoiceTempOCR row (id={rec_id}):")
    print(f"  vendor_status (col): {rec.vendor_status}")
    print(f"  validation_status: {rec.validation_status}")
    print(f"  processed: {rec.processed}")
    
    # STEP 6: Call list API after revalidate (simulates React refresh)
    request_list_after = factory.get('/api/pending-purchases/')
    force_authenticate(request_list_after, user=admin_user)
    response_list_after = view_list(request_list_after)
    item_after = [item for item in response_list_after.data if item['id'] == pp_id][0]
    print("\nAPI RESPONSE (GET /api/pending-purchases/) AFTER REVALIDATE (React list fetch):")
    print(json.dumps({
        'id': item_after['id'],
        'vendor_name': item_after['vendor_name'],
        'vendor_gstin': item_after['vendor_gstin'],
        'vendor_status': item_after['vendor_status'],
        'item_status': item_after['item_status'],
        'voucher_status': item_after['voucher_status'],
        'pending_purchase_status': item_after['pending_purchase_status']
    }, indent=2))

if __name__ == '__main__':
    simulate()
