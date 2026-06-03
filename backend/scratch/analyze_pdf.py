import fitz
import os

pdf_path = r"C:\Users\ulaganathan\Downloads\New folder (2)\IMG_20260406_0005.pdf"

print(f"Opening {pdf_path}...")
doc = fitz.open(pdf_path)
print(f"Total Pages: {len(doc)}")

keywords = [
    "invoice", "total", "subtotal", "sub-total", "summary",
    "carried forward", "brought forward", "rounded off", "round off",
    "cgst", "sgst", "igst", "tax summary", "amount chargeable", "balance"
]

for i, page in enumerate(doc):
    text = page.get_text()
    text_lower = text.lower()
    page_num = i + 1
    
    found_keywords = [kw for kw in keywords if kw in text_lower]
    
    # Check for potential invoice number patterns
    # e.g., 5202/25-26
    has_inv_num = "5202/25-26" in text or "5202" in text
    
    print(f"--- Page {page_num} ---")
    print(f"Text length: {len(text)}")
    print(f"Has invoice no '5202/25-26': {has_inv_num}")
    print(f"Keywords found: {found_keywords}")
    print("Snippet:")
    snippet = " | ".join([line.strip() for line in text.split("\n") if line.strip()][:8])
    print(snippet)
    print()
