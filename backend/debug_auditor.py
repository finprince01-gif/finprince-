import os
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

def audit():
    with connection.cursor() as cursor:
        cursor.execute("SELECT ocr_raw_text, extracted_data FROM invoice_ocr_temp ORDER BY id DESC LIMIT 1")
        row = cursor.fetchone()
        
    if not row:
        print("No records found in invoice_ocr_temp")
        return

    ocr_raw_text = row[0]
    final_json = row[1]
    
    if isinstance(final_json, str):
        final_json = json.loads(final_json)
        
    print("--- 📑 RAW OCR TEXT 📑 ---")
    print(ocr_raw_text)
    print("\n--- 🤖 FINAL NORMALIZED JSON 🤖 ---")
    print(json.dumps(final_json, indent=2))

if __name__ == "__main__":
    audit()
