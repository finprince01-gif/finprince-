import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vendors.models import VendorMasterBasicDetail, VendorMasterGSTDetails

print("Listing all VendorMasterBasicDetail:")
bds = VendorMasterBasicDetail.objects.all()
print(f"Total basic details: {bds.count()}")
for bd in bds:
    print(f"  id={bd.id}, name='{bd.vendor_name}', tenant_id={bd.tenant_id}")
    gsts = VendorMasterGSTDetails.objects.filter(vendor_basic_detail=bd)
    print(f"    gsts ({gsts.count()}):")
    for gd in gsts:
        print(f"      id={gd.id}, gstin='{gd.gstin}', reference_name='{gd.reference_name}', tenant_id={gd.tenant_id}")
