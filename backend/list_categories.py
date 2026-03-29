from django.db import connection
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vendors.models import VendorMasterCategory

def list_categories():
    categories = VendorMasterCategory.objects.all()
    print(f"Total categories in DB: {categories.count()}")
    for c in categories:
        print(f"ID: {c.id}, Path: {c}")

if __name__ == "__main__":
    list_categories()
