
import os
import sys
import django
from django.db import connection

# Setup Django
sys.path.append(r'd:\testing\AI-accounting-0.03\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vendors.models import VendorMasterPOSettings
from django.db import connection

tenant_id = "392f47fa-4cab-41f9-9353-75d2b85dec97"
qs = VendorMasterPOSettings.objects.filter(tenant_id=tenant_id, is_active=True)
print(str(qs.query))

# Execute and check
print(f"Results: {list(qs)}")
