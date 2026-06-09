import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vendors.models import VendorMasterBasicDetail, VendorMasterGSTDetails

vendors = VendorMasterBasicDetail.objects.filter(vendor_name__icontains='SRI VISHNU')
print("=== SRI VISHNU BASIC DETAILS ===")
for v in vendors:
    print(f"  ID: {v.id} | Name: {v.vendor_name} | tenant: {v.tenant_id}")
    gstins = VendorMasterGSTDetails.objects.filter(vendor_basic_detail=v)
    for g in gstins:
         print(f"    GSTIN: {g.gstin} | reference_name: {g.reference_name} | is_active: {g.is_active}")

vendors2 = VendorMasterBasicDetail.objects.filter(vendor_name__icontains='N.S.SOLUTION')
print("\n=== N.S.SOLUTION BASIC DETAILS ===")
for v in vendors2:
    print(f"  ID: {v.id} | Name: {v.vendor_name}")
    gstins = VendorMasterGSTDetails.objects.filter(vendor_basic_detail=v)
    for g in gstins:
         print(f"    GSTIN: {g.gstin} | reference_name: {g.reference_name} | is_active: {g.is_active}")
