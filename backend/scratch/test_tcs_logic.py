import os
import django
import sys

sys.path.append(r"d:\ledger_report0.22\AI-accounting-0.03\backend")
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from vendors.models import VendorMasterBasicDetail, VendorMasterTDS

vendor = VendorMasterBasicDetail.objects.filter(vendor_name__iexact='vendor3').first()
tds_obj = VendorMasterTDS.objects.filter(vendor_basic_detail_id=vendor.id).last()

is_tcs = False
tax_section_name = "Unspecified Section"

if tds_obj:
    print(f"vendor: {vendor.vendor_name}")
    print(f"vendor tcs_applicable: {vendor.tcs_applicable}")
    print(f"tds_obj tds_section_applicable: {repr(tds_obj.tds_section_applicable)}")
    print(f"tds_obj tcs_section_applicable: {repr(tds_obj.tcs_section_applicable)}")
    
    if getattr(tds_obj, 'tcs_enabled', False) and getattr(tds_obj, 'tcs_section_applicable', ''):
        tax_section_name = tds_obj.tcs_section_applicable.strip()
        is_tcs = True
    elif getattr(tds_obj, 'tcs_section_applicable', '') and not getattr(tds_obj, 'tds_section_applicable', ''):
        tax_section_name = tds_obj.tcs_section_applicable.strip()
        is_tcs = True
    elif getattr(tds_obj, 'tds_section_applicable', ''):
        tax_section_name = tds_obj.tds_section_applicable.strip()

print(f"Final is_tcs: {is_tcs}")
print(f"Final tax_section_name: {tax_section_name}")
