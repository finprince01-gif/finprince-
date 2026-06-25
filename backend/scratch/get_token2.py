from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from ocr_pipeline.models import InvoiceTempOCR

User = get_user_model()
user = User.objects.filter(is_active=True).first()

# Get tenant from existing records
rec = InvoiceTempOCR.objects.order_by('-created_at').first()
tenant_id = str(rec.tenant_id) if rec and rec.tenant_id else 'unknown'
print(f"TENANT_ID={tenant_id}")

refresh = RefreshToken.for_user(user)
token = str(refresh.access_token)
print(f"TOKEN={token}")
