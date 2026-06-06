import fitz # PyMuPDF
import sys

pdf_path = r"C:\Users\ulaganathan\Downloads\New folder (2)\IMG_20260406_0005.pdf"
doc = fitz.open(pdf_path)
print(f"Total pages: {len(doc)}")

for page_idx in range(len(doc)):
    page = doc[page_idx]
    text = page.get_text()
    print(f"\n--- Page {page_idx+1} Text Sample (first 500 chars) ---")
    print(text[:500])
    
    # Check if invoice numbers or GSTINs are in this page's text
    import re
    invoice_nos = re.findall(r'(?:Invoice|lnvoice|No\.|no\.)\s*[:\-\.]?\s*([A-Za-z0-9\-\/]+)', text, re.IGNORECASE)
    gstins = re.findall(r'\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}\b', text.upper())
    print(f"  Detected Invoice Candidates: {invoice_nos[:5]}")
    print(f"  Detected GSTIN Candidates: {list(set(gstins))}")
