from django.core.management.base import BaseCommand
from rest_framework.test import APIRequestFactory
from accounting.views_payment import AdvancePaymentViewSet
from django.contrib.auth import get_user_model
import json

class Command(BaseCommand):
    def handle(self, *args, **options):
        User = get_user_model()
        user = User.objects.first()

        factory = APIRequestFactory()
        request = factory.get('/api/vouchers/advances/?ledger_id=688', HTTP_X_BRANCH_ID=str(user.tenant_id))
        request.user = user

        view = AdvancePaymentViewSet.as_view({'get': 'list'})
        response = view(request)
        print(json.dumps(response.data, indent=2))
