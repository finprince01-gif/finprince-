import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vendors.models import VendorMasterPOSettings

settings = VendorMasterPOSettings.objects.all()
for s in settings:
    print(f"ID: {s.id}, Name: {s.name}, Prefix: {s.prefix}, Suffix: {s.suffix}, Digits: {s.digits}, Current: {s.current_number}")
