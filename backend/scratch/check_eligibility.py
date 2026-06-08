import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import InvoiceTempOCR
from ocr_pipeline.views import get_save_eligible_rows, get_pending_purchase_eligible_rows
from vendors.vendor_validation_logic import build_session_vendor_map
from ocr_pipeline.views import CleanOCRStagingView

record_id = 1006938
r = InvoiceTempOCR.objects.get(id=record_id)
print(f"Record ID={r.id}, Invoice={r.supplier_invoice_no}, status={r.status}, processed={r.processed}, validation_status={r.validation_status}")

tenant_id = r.tenant_id
upload_session_id = r.upload_session_id

# Let's run get_save_eligible_rows
save_eligible = get_save_eligible_rows(upload_session_id, tenant_id)
print("Save eligible IDs:", [str(x[0].id) for x in save_eligible])

# Let's run get_pending_purchase_eligible_rows
pending_eligible = get_pending_purchase_eligible_rows(upload_session_id, tenant_id)
print("Pending purchase eligible IDs:", [str(x[0].id) for x in pending_eligible])

# Trace variables inside get_pending_purchase_eligible_rows
vendor_map = build_session_vendor_map(tenant_id, [r])
view_instance = CleanOCRStagingView()
ui_row = view_instance._map_record_to_ui_row(r, vendor_map=vendor_map)

effective_vendor_id = ui_row.get('vendor_id')
ui_validation_status = ui_row.get('validationStatus')

has_effective_match = r.vendor_status in ['EXISTS', 'FOUND', 'MATCHED', 'RESOLVED'] or effective_vendor_id
vendor_status_badge = 'ALREADY_EXIST' if has_effective_match else 'CREATE_VENDOR'

if ui_validation_status in ['processing', 'PENDING', 'EXTRACTING', 'PROCESSING', 'SCANNING']:
    voucher_status_badge = 'SCANNING'
elif ui_validation_status == 'EXTRACTION_FAILED':
    voucher_status_badge = 'FAILED'
elif ui_validation_status == 'VOUCHER_CREATED':
    voucher_status_badge = 'SAVED'
elif ui_validation_status in ['DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE']:
    voucher_status_badge = 'ALREADY_EXIST'
elif effective_vendor_id or ui_validation_status in ['READY', 'FOUND', 'RESOLVED', 'SUCCESS', 'NEED_VENDOR', 'NEED_TO_SAVE']:
    voucher_status_badge = 'NEED_TO_SAVE'
else:
    voucher_status_badge = 'WAIT'

print(f"vendor_status_badge: {vendor_status_badge} (has_effective_match={has_effective_match}, r.vendor_status={r.vendor_status}, effective_vendor_id={effective_vendor_id})")
print(f"voucher_status_badge: {voucher_status_badge} (ui_validation_status={ui_validation_status})")
print(f"item_status: {ui_row.get('item_status')}")

# Condition
show_in_pending = False
if vendor_status_badge == 'ALREADY_EXIST' and voucher_status_badge == 'ALREADY_EXIST' and ui_row.get('item_status') == 'ALREADY EXIST':
    print("Match bypass condition -> show_in_pending = False")
else:
    print("Do not match bypass -> show_in_pending = True")
    show_in_pending = True
