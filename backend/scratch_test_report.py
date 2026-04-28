import os
import django
import sys

# Setup Django
sys.path.append('d:/ledger_report0.22/AI-accounting-0.03/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from rest_framework.test import APIRequestFactory, force_authenticate
from accounting.views import JournalEntryViewSet
from core.models import User

def test_report():
    factory = APIRequestFactory()
    user = User.objects.first() # Use a real user
    
    view = JournalEntryViewSet.as_view({'get': 'report'})
    
    # Test for cash1
    request = factory.get('/api/journal-entries/report/', {
        'ledger_name': 'cash1',
        'start_date': '2026-04-01',
        'end_date': '2026-04-27'
    })
    force_authenticate(request, user=user)
    
    response = view(request)
    print(f"Status: {response.status_code}")
    print(f"Data count: {len(response.data) if response.status_code == 200 else 'N/A'}")
    if response.status_code == 200:
        for entry in response.data:
            print(entry)

if __name__ == '__main__':
    test_report()
