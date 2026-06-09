import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
sys.path.insert(0, '.')
django.setup()

from ocr_pipeline.models import SessionFinalizationState
from rest_framework.test import APIRequestFactory, force_authenticate
from ocr_pipeline.views import CleanOCRStagingView
from django.contrib.auth import get_user_model

def get_api_response_data(session_id):
    User = get_user_model()
    user = User.objects.first()
    factory = APIRequestFactory()
    request = factory.get(f'/api/bulk-upload/?upload_session_id={session_id}')
    force_authenticate(request, user=user)
    view = CleanOCRStagingView.as_view()
    response = view(request)
    return response.data.get('data', [])

def canonical_key(api_row):
    return {
        'invoice_no': str(api_row.get('invoice_no', '')).strip().upper(),
        'vendor_status': str(api_row.get('vendor_status', '')).strip().upper(),
        'voucher_status': str(api_row.get('validationStatus', '')).strip().upper(),
        'item_status': str(api_row.get('item_status', '')).strip().upper(),
        'item_count': len(api_row.get('items', [])),
        'gstin': str(api_row.get('gstin', '')).strip().upper(),
    }

session_ids = ['71d21f39-12f7-44e7-8f17-9b8a55fe186c', 'e6b3cc18-f622-4cfe-858a-c4999cce8f25', 'bfdeae52-5a7e-4e9d-b877-5286e3545d7f']
data = {sid: get_api_response_data(sid) for sid in session_ids}

def sorted_key_list(api_data):
    keys = [canonical_key(row) for row in api_data]
    return sorted(keys, key=lambda x: (x['invoice_no'], x['gstin']))

k1 = sorted_key_list(data['71d21f39-12f7-44e7-8f17-9b8a55fe186c'])
k2 = sorted_key_list(data['e6b3cc18-f622-4cfe-858a-c4999cce8f25'])
k3 = sorted_key_list(data['bfdeae52-5a7e-4e9d-b877-5286e3545d7f'])

print("Run 1 count:", len(k1))
print("Run 2 count:", len(k2))
print("Run 3 count:", len(k3))

print("Is k1 == k2?", k1 == k2)
print("Is k2 == k3?", k2 == k3)

if k1 != k2:
    print("\nDifferences between Run 1 and Run 2:")
    for idx, (a, b) in enumerate(zip(k1, k2)):
        if a != b:
            print(f"Index {idx}:")
            print("  Run 1:", a)
            print("  Run 2:", b)

if k2 != k3:
    print("\nDifferences between Run 2 and Run 3:")
    for idx, (a, b) in enumerate(zip(k2, k3)):
        if a != b:
            print(f"Index {idx}:")
            print("  Run 2:", a)
            print("  Run 3:", b)
