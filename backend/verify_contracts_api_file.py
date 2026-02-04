
import os
import sys

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

import django
django.setup()

from rest_framework.test import APIClient
from django.contrib.auth import get_user_model

with open('api_verify_out.txt', 'w', encoding='utf-8') as f:
    try:
        User = get_user_model()
        user = User.objects.get(username='admin')
        f.write(f"User: {user.username}\n")
        
        client = APIClient()
        client.force_authenticate(user=user)
        
        response = client.get('/api/customerportal/long-term-contracts/')
        f.write(f"Status: {response.status_code}\n")
        
        if response.status_code == 200:
            data = response.json()
            f.write(f"Data Type: {type(data)}\n")
            f.write(f"Data: {data}\n")
        else:
            f.write(f"Content: {response.content.decode('utf-8')[:500]}\n")

    except Exception as e:
        f.write(f"Exception: {e}\n")
