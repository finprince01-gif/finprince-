import os
import sys
import base64
import json
import fitz
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(override=True)

# Initialize Django
current_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(current_dir))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()

from core.ai_proxy import ai_service
from ocr_pipeline.extraction import base_prompt

def test_fresh_extraction():
    doc = fitz.open("backend/parity_harness/dataset/sample_1.pdf")
    for page_idx in [0, 1, 2]:
        page = doc[page_idx]
        pix = page.get_pixmap(dpi=150)
        img_bytes = pix.tobytes("jpg", jpg_quality=80)
        file_b64 = base64.b64encode(img_bytes).decode('utf-8')
        
        prompt = f"### [PAGE {page_idx+1} OCR DATA]\n[Image Provided]\n\n{base_prompt}"
        
        request_data = {
            'type': 'extraction',
            'prompt': prompt,
            'image_data': file_b64,
            'mime_type': 'image/jpeg',
            'tenant_id': 'system',
            'wait_for_result': True
        }
        
        print(f"\n--- Fresh extraction for Page {page_idx+1} ---")
        response = ai_service.make_request('extraction', request_data, 'system', 'system')
        if 'error' in response:
            print("Error:", response['error'])
        else:
            reply = response.get('reply', '')
            print("Reply:", reply)

if __name__ == "__main__":
    test_fresh_extraction()
