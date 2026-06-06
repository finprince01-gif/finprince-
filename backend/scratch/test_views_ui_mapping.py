import os, sys, django, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from ocr_pipeline.views import CleanOCRStagingView

# Instatiate viewset and get the mapping function
viewset = CleanOCRStagingView()
record = InvoiceTempOCR.objects.get(id=1006138)

# Run mapping
mapped_row = viewset._map_record_to_ui_row(record)

print("Mapped UI Row GSTIN Fields:")
keys_to_print = [
    "vendor_gstin", "gstin", "buyer_gstin", "consignee_gstin", "ship_to_gstin", "bill_to_gstin",
    "raw_vendor_gstin", "raw_buyer_gstin", "raw_consignee_gstin",
    "canonical_vendor_gstin", "canonical_buyer_gstin", "canonical_consignee_gstin"
]
for key in keys_to_print:
    print(f"  {key}: {mapped_row.get(key)}")
