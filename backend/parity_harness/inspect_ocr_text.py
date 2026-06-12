import os
import sys
import re
from pathlib import Path

# Initialize Django
current_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(current_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from ocr_pipeline.models import InvoicePageResult

def inspect_ocr_text():
    pages = InvoicePageResult.objects.filter(record_id=1007120, page_number__in=[1, 2, 3])
    for p in pages:
        print(f"\n=================== PAGE {p.page_number} OCR TEXT ===================")
        text = p.canonical_payload.get("_pdf_ocr_text") or ""
        print(text[:2000])  # Print first 2000 chars of OCR text
        print("--- Regex search for invoice number ---")
        matches = re.findall(r'(?i)(?:invoice\s*no|inv\s*no|bill\s*no|no)[:.\s]*([0-9/a-zA-Z-]+)', text)
        print("Matches:", matches[:10])

if __name__ == "__main__":
    inspect_ocr_text()
