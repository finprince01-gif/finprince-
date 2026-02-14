
import os
import django
import requests

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

# Test the API endpoint
BASE_URL = "http://localhost:8000"

# First, let's check if we can access the endpoint
print("Testing Service Group API...")
print("-" * 80)

try:
    # Try to get all service groups
    response = requests.get(f"{BASE_URL}/api/services/groups/")
    print(f"GET /api/services/groups/")
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.json()}")
    print("-" * 80)
except Exception as e:
    print(f"Error: {e}")
    print("-" * 80)
