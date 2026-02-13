import os
import django
import sys
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework import status

# Ensure current directory is in sys.path
sys.path.append(os.getcwd())

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.models import User
from inventory.views import InventoryMasterGRNViewSet
from inventory.models import InventoryMasterGRN

def test_save():
    user = User.objects.filter(username='cash').first()
    if not user:
        print("User 'cash' not found")
        return

    factory = APIRequestFactory()
    view = InventoryMasterGRNViewSet.as_view({'post': 'create', 'put': 'update'})

    # Test POST (Create)
    data = {
        'name': 'New Series 2',
        'grn_type': 'purchase',
        'prefix': 'GRN',
        'suffix': '/2024',
        'year': '2024',
        'required_digits': 4,
        'preview': 'GRN0001/2024'
    }
    request = factory.post('/api/inventory/master-voucher-grn/', data, format='json')
    force_authenticate(request, user=user)
    # Inject tenant_id in header for get_tenant_from_request
    request.META['HTTP_X_TENANT_ID'] = user.tenant_id
    
    response = view(request)
    print(f"POST Response Status: {response.status_code}")
    print(f"POST Response Data: {response.data}")

    # Test PUT (Update) if we have one
    grn = InventoryMasterGRN.objects.filter(tenant_id=user.tenant_id, is_active=True).first()
    if grn:
        request = factory.put(f'/api/inventory/master-voucher-grn/{grn.id}/', data, format='json')
        force_authenticate(request, user=user)
        request.META['HTTP_X_TENANT_ID'] = user.tenant_id
        response = view(request, pk=grn.id)
        print(f"PUT Response Status: {response.status_code}")
        print(f"PUT Response Data: {response.data}")
    else:
        print("No active GRN found for PUT test")

test_save()
