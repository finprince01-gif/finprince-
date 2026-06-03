import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import Voucher
from django.test import RequestFactory
from accounting.views_receipt import ReceiptVoucherViewSet
from django.contrib.auth import get_user_model

factory = RequestFactory()
request = factory.post(
    '/api/vouchers/receipt-single/', 
    data={
        'date': '2026-06-03', 
        'voucher_type': 'Receipt Voucher', 
        'voucher_number': 'REC004426-27', 
        'ref_no': '', 
        'receive_in': 685, 
        'customer': 700, 
        'total_amount': 45450, 
        'amount': 45450, 
        'items': [{
            'customer': 700, 
            'reference_id': 'ref123444', 
            'reference_type': 'advance', 
            'amount': 45450, 
            'received_amount': 45450, 
            'is_advance': True, 
            'advance_ref_no': 'ref123444'
        }]
    }, 
    content_type='application/json'
)

User = get_user_model()
request.user = User.objects.first()
# Force tenant_id logic
request.user.branch_id = request.user.tenant_id if hasattr(request.user, 'tenant_id') else 1

from rest_framework.test import force_authenticate
force_authenticate(request, user=request.user)

view = ReceiptVoucherViewSet.as_view({'post': 'create'})
response = view(request)

print('STATUS:', response.status_code)
print('DATA:', response.data)
