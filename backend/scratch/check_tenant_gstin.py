import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.models import Tenant
t = Tenant.objects.filter(id='2eda0ac6-6af2-493e-8792-bc973fe946b7').first()
if t:
    print(f"Tenant ID: {t.id} | Name: {t.name} | GSTIN: {t.gstin}")
else:
    print("Tenant not found")
