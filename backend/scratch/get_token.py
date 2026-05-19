import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from rest_framework_simplejwt.tokens import RefreshToken

from core.models import User

user = User.objects.get(username="stress_test_0@finpixe.com")
refresh = RefreshToken.for_user(user)
print(str(refresh.access_token))
