
import os
import django
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

try:
    print(f"MEDIA_URL: '{settings.MEDIA_URL}'")
except AttributeError:
    print("MEDIA_URL not defined")

try:
    print(f"MEDIA_ROOT: '{settings.MEDIA_ROOT}'")
except AttributeError:
    print("MEDIA_ROOT not defined")
