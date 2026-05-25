import os
import django
import sys
import json

# Setup django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory, force_authenticate
from accounting.sales_api import SalesVoucherViewSet
from accounting.views_voucher_sales import VoucherSalesViewSet

factory = APIRequestFactory()
User = get_user_model()
user = User.objects.first() # Get a user to authenticate

print("--- Testing /api/vouchers/sales/21/ ---")
view_sales = SalesVoucherViewSet.as_view({'get': 'retrieve'})
request = factory.get('/api/vouchers/sales/21/')
force_authenticate(request, user=user)
try:
    response = view_sales(request, pk=21)
    print(f"Status Code: {response.status_code}")
    if hasattr(response, 'render'):
        response.render()
    print("Response Data:", json.dumps(response.data, indent=2))
except Exception as e:
    import traceback
    traceback.print_exc()

print("\n--- Testing /api/voucher-sales-new/21/ ---")
view_sales_new = VoucherSalesViewSet.as_view({'get': 'retrieve'})
request_new = factory.get('/api/voucher-sales-new/21/')
force_authenticate(request_new, user=user)
try:
    response_new = view_sales_new(request_new, pk=21)
    print(f"Status Code: {response_new.status_code}")
    if hasattr(response_new, 'render'):
        response_new.render()
    print("Response Data:", json.dumps(response_new.data, indent=2))
except Exception as e:
    import traceback
    traceback.print_exc()
