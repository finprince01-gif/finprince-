import os
import django
import sys

# Setup django environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from vendors.models import VendorMasterBasicDetail
from rest_framework.test import APIRequestFactory
from vendors.vendorbasicdetail_api import VendorBasicDetailViewSet
from django.contrib.auth import get_user_model
User = get_user_model()


try:
    # Try querying directly
    print("Attempting raw queryset execute...")
    count = VendorMasterBasicDetail.objects.filter(is_deleted=False).count()
    print(f"Direct count successful: {count}")

    from rest_framework.test import force_authenticate
    factory = APIRequestFactory()
    # Mock an admin user or the first user in system
    user = User.objects.first()
    print(f"Mocking user: {user.username if user else 'None'}")
    
    request = factory.get('/api/vendors/basic-details/?page_size=10000&limit=10000')
    force_authenticate(request, user=user)
    request.user = user
    
    view = VendorBasicDetailViewSet.as_view({'get': 'list'})
    response = view(request)
    response.render()
    
    print(f"Response Status Code: {response.status_code}")
    if response.status_code != 200:
        print(f"Error response details: {response.content}")
    else:
        print("Success response received from mock call.")

except Exception as e:
    import traceback
    print("\n--- EXCEPTION TRACEBACK ---")
    traceback.print_exc()
    print("--------------------------")
