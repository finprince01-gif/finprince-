import os
import sys
import django

sys.path.append('d:/finpixe/Ai_Accounting_22/AI-accounting-0.03/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from customerportal.database import CustomerMasterCustomer
from customerportal.serializers import CustomerMasterCustomerSerializer

for c in CustomerMasterCustomer.objects.filter(id__in=[147, 149]):
    print(f"Customer ID {c.id}: {c.customer_name}, Code: {c.customer_code}, Category: {c.customer_category_id}")
