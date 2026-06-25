from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from core.models import Company

User = get_user_model()

# Get first superuser or any active user
user = User.objects.filter(is_active=True).first()
print(f"User: {user} | email={getattr(user,'email','?')} | id={user.id}")

# Get tenant
try:
    company = Company.objects.filter(is_active=True).first()
    tenant_id = str(company.id) if company else 'unknown'
    print(f"Company: {company} | tenant_id={tenant_id}")
except Exception as e:
    print(f"Company error: {e}")
    tenant_id = 'unknown'

# Generate JWT token
refresh = RefreshToken.for_user(user)
access_token = str(refresh.access_token)
print(f"Access token: {access_token[:80]}...")
print(f"TENANT_ID={tenant_id}")
print(f"USER_ID={user.id}")
