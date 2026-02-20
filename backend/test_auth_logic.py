
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from core.authentication import CustomJWTAuthentication
from django.test import RequestFactory

def test_auth():
    try:
        User = get_user_model()
        user = User.objects.get(username='demo')
        
        # Generate token
        refresh = RefreshToken.for_user(user)
        # Add custom claims as flow.py does
        refresh['tenant_id'] = user.tenant_id
        
        access = str(refresh.access_token)
        print(f"Generated Access Token: {access[:20]}...")
        
        # Simulate request
        rf = RequestFactory()
        request = rf.get('/api/health/', HTTP_AUTHORIZATION=f'Bearer {access}')
        
        # Test CustomJWTAuthentication
        auth = CustomJWTAuthentication()
        result = auth.authenticate(request)
        
        if result:
            user_found, token = result
            print(f"SUCCESS: Authenticated as {user_found.username}")
            print(f"Tenant ID on user: {getattr(user_found, 'tenant_id', 'MISSING')}")
        else:
            print("FAILURE: Authentication returned None")
            
    except Exception as e:
        import traceback
        print(f"CRITICAL ERROR: {e}")
        traceback.print_exc()

if __name__ == "__main__":
    test_auth()
