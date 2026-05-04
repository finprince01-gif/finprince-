import os
import django
import sys

sys.path.append(r"d:\ledger_report0.22\AI-accounting-0.03\backend")
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vendors.models import VendorMasterBasicDetail, VendorMasterTDS

for vendor_name in ['vendor3', 'vendor4']:
    vendor = VendorMasterBasicDetail.objects.filter(vendor_name__iexact=vendor_name).first()
    if vendor:
        print(f"--- Vendor: {vendor_name} ---")
        tds_obj = VendorMasterTDS.objects.filter(vendor_basic_detail_id=vendor.id).first()
        if tds_obj:
            print(f"TDS Section: {tds_obj.tds_section_applicable}")
            print(f"TCS Section: {tds_obj.tcs_section_applicable}")
            print(f"Is Active: {tds_obj.is_active}")
        else:
            print("No TDS details found.")
