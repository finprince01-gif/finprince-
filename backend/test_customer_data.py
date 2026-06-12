import os
import sys
import django
import json

sys.path.append('d:/finpixe/Ai_Accounting_22/AI-accounting-0.03/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from customerportal.database import CustomerMasterCustomer
from customerportal.serializers import CustomerMasterCustomerSerializer

# Find Deepak and Mathesh customers
customers = CustomerMasterCustomer.objects.filter(customer_name__in=['DEEPAK', 'deepak', 'MATHESH', 'mathesh'])
serializer = CustomerMasterCustomerSerializer(customers, many=True)
data = serializer.data

for d in data:
    print(f"ID: {d.get('id')}, Name: {d.get('customer_name')}, Category Name: {d.get('customer_category_name')}, Code: {d.get('customer_code')}")
