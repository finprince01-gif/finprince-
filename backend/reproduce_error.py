
import os
import django
from django.conf import settings

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from services.views import ServiceViewSet
from rest_framework.test import APIRequestFactory, force_authenticate
from core.models import User

def test_list_services():
    factory = APIRequestFactory()
    user = User.objects.filter(is_superuser=True).first()
    if not user:
        print("No user found")
        return

    view = ServiceViewSet.as_view({'get': 'list'})
    request = factory.get('/api/services/', {'is_active': 'true'})
    force_authenticate(request, user=user)
    
    response = view(request)
    print(f"Status: {response.status_code}")
    print(f"Data: {response.data}")

if __name__ == "__main__":
    test_list_services()
