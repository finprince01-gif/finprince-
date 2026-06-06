import fitz
import re

pdf_path = r"C:\Users\ulaganathan\Downloads\New folder (2)\IMG_20260406_0005.pdf"
doc = fitz.open(pdf_path)

for idx, page in enumerate(doc):
    text = page.get_text()
    # Find any 15-character words that look like GSTINs (or close to it)
    # GSTIN format: 2 digits, 10 chars (PAN), 1 digit/char, 1 char (Z), 1 digit/char
    gstin_regex = r'\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z0-9]{1}[0-9A-Z]{1}\b'
    matches = re.findall(gstin_regex, text.upper())
    # Also find any word that has 15 chars and starts with 33
    all_15 = [w for w in re.split(r'\s+', text) if len(w) == 15]
    print(f"Page {idx+1}:")
    print(f"  Matches: {list(set(matches))}")
    print(f"  All 15-char words: {all_15}")
