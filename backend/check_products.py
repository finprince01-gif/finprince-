
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vendors.models import VendorMasterProductService

def check_data():
    count = VendorMasterProductService.objects.count()
    print(f"Total products in DB: {count}")
    
    if count > 0:
        latest = VendorMasterProductService.objects.all().order_by('-id')[:5]
        for p in latest:
            print(f"ID: {p.id}, Name: {p.item_name}, Vendor: {p.vendor_basic_detail_id}, Tenant: {p.tenant_id}")

if __name__ == "__main__":
    check_data()
