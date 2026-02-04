
import os
import sys

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

import django
django.setup()

from rest_framework.test import APIClient
from django.contrib.auth import get_user_model

User = get_user_model()
try:
    user = User.objects.get(username='admin')
    print(f"User found: {user.username} (ID: {user.id}) Tenant: {user.tenant_id}")
    
    client = APIClient()
    client.force_authenticate(user=user)
    
    response = client.get('/api/customerportal/long-term-contracts/')
    
    print(f"Response Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Data type: {type(data)}")
        if isinstance(data, list):
            print(f"Number of contracts: {len(data)}")
            for item in data:
                print(f" - Contract: {item.get('contract_number', 'N/A')}")
        elif isinstance(data, dict):
             print(f"Data keys: {data.keys()}")
             if 'results' in data:
                 print(f"Number of results: {len(data['results'])}")
             else:
                 print(data)
    else:
        print(f"Error content: {response.content}")

except User.DoesNotExist:
    print("User 'admin' does not exist!")
except Exception as e:
    print(f"Error: {e}")
