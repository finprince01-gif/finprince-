import django, os, sys, json
sys.path.insert(0, '.')
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
django.setup()

from ocr_pipeline.models import InvoiceTempOCR

r = InvoiceTempOCR.objects.get(id=1007711)
print(f"Record ID: {r.id}")
print(f"Validation Status: {r.validation_status}")
ext = r.extracted_data or {}
print(f"extracted_data type: {type(ext)}")
print(f"gst_audit_trail in extracted_data: {'gst_audit_trail' in ext}")
print(f"gst_audit_trail value: {ext.get('gst_audit_trail')}")
print(f"gst_resolution value: {ext.get('gst_resolution')}")
print(f"extracted_data keys: {list(ext.keys())}")
