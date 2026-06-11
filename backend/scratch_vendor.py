import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'accounting.settings')
django.setup()

from vendors.models import VendorMasterGSTDetails

gstin = '33AKWPP4092M1Z8'
qs = VendorMasterGSTDetails.objects.filter(gstin__iexact=gstin)
for v in qs:
    print(f"ID: {v.id}")
    print(f"Tenant: {v.tenant_id}")
    print(f"GSTIN: {v.gstin}")
    print(f"Reference Name: {v.reference_name}")
    if v.vendor_basic_detail:
        print(f"Vendor Name: {v.vendor_basic_detail.vendor_name}")
    else:
        print("NO BASIC DETAIL")
    print("-" * 40)
