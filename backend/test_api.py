import os
import django
import logging

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import MasterLedger
from accounting.serializers import MasterLedgerSerializer

class MockRequest:
    def build_absolute_uri(self):
        return ""

def test_serializer():
    ledger = MasterLedger.objects.get(name='cash3')
    serializer = MasterLedgerSerializer(ledger, context={'request': MockRequest()})
    print(serializer.data)

if __name__ == '__main__':
    test_serializer()
