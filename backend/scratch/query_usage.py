import os
import django
import sys
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from ocr_pipeline.models import AIUsageAccounting, InvoicePageResult

usages = AIUsageAccounting.objects.filter(invoice_temp_ocr_id=1007711)
print(f"Total AIUsageAccounting entries for 1007711: {usages.count()}")
for u in usages:
    print(f"  Usage ID: {u.id} | prompt_tokens: {u.prompt_tokens} | completion_tokens: {u.completion_tokens} | total_tokens: {u.total_tokens} | cost: {u.cost} | created_at: {u.created_at}")

# Let's inspect the page result raw text for page 1
pr1 = InvoicePageResult.objects.filter(record_id=1007711, page_number=1).first()
if pr1:
    print(f"\nPage 1 payload contains _pdf_ocr_text length: {len(pr1.canonical_payload.get('_pdf_ocr_text', ''))}")
    print(f"Page 1 payload contains _raw_text length: {len(pr1.canonical_payload.get('_raw_text', ''))}")
    
pr2 = InvoicePageResult.objects.filter(record_id=1007711, page_number=2).first()
if pr2:
    print(f"\nPage 2 payload contains _pdf_ocr_text length: {len(pr2.canonical_payload.get('_pdf_ocr_text', ''))}")
    print(f"Page 2 payload contains _raw_text length: {len(pr2.canonical_payload.get('_raw_text', ''))}")
