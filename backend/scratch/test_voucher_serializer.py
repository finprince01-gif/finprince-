import os
import sys
import django
import json

# Setup Django
sys.path.append(r"d:\ledger_report0.37\AI-accounting-0.03\backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from accounting.models import Voucher
from accounting.serializers import VoucherSerializer

try:
    instance = Voucher.objects.get(id=125)
    
    from rest_framework.test import APIRequestFactory
    factory = APIRequestFactory()
    request = factory.get('/')
    from django.contrib.auth import get_user_model
    User = get_user_model()
    user = User.objects.filter(tenant_id=instance.tenant_id).first()
    request.user = user
    
    serializer = VoucherSerializer(instance, context={'request': request})
    print(json.dumps(serializer.data, indent=2))
except Exception as e:
    import traceback
    traceback.print_exc()
