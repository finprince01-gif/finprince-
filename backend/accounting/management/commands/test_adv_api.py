from django.core.management.base import BaseCommand
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
import json

class Command(BaseCommand):
    def handle(self, *args, **options):
        User = get_user_model()
        user = User.objects.first()

        client = APIClient()
        client.force_authenticate(user=user)

        response = client.get('/api/vouchers/advances/?ledger_id=688', HTTP_X_BRANCH_ID=str(user.tenant_id))
        print(json.dumps(response.json(), indent=2))
