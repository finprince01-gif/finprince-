import os
import sys
import django
import json

sys.path.append('d:/finpixe/Ai_Accounting_22/AI-accounting-0.03/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from customerportal.serializers import CustomerMasterCustomerSerializer
from customerportal.database import CustomerMasterCustomer

# Print exactly what the API returns for Deepak and Mathesh
customers = CustomerMasterCustomer.objects.filter(customer_name__in=['DEEPAK', 'deepak', 'MATHESH', 'mathesh'])
serializer = CustomerMasterCustomerSerializer(customers, many=True)
data = serializer.data

for d in data:
    print(json.dumps({
        'id': d.get('id'),
        'name': d.get('customer_name'),
        'cat_id': d.get('customer_category'),
        'cat_name': d.get('customer_category_name'),
        'code': d.get('customer_code')
    }))
