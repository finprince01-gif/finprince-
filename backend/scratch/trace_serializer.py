import django, os, sys, json
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from ocr_pipeline.views import CleanOCRStagingView

# Instantiate the view
view = CleanOCRStagingView()

record = InvoiceTempOCR.objects.get(id=1007711)

# Map the record to UI row
res = view._map_record_to_ui_row(record, norm_data=record.extracted_data)

# Let's inspect the return value structure
print("Mapped keys:", list(res.keys()))
print("Mapped extracted_data keys:", list(res['extracted_data'].keys()))
print("Mapped extracted_data.gst_audit_trail present:", 'gst_audit_trail' in res['extracted_data'])
print("Mapped extracted_data.gst_audit_trail value:", res['extracted_data'].get('gst_audit_trail'))
print("Mapped extracted_data.gst_resolution value:", res['extracted_data'].get('gst_resolution'))
print("Mapped validationStatus:", res.get('validationStatus'))
print("Mapped validation_status:", res.get('validation_status'))
