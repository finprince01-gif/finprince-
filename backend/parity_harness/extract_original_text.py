import os
import sys
import fitz

def extract_original_text():
    doc = fitz.open("backend/parity_harness/dataset/sample_1.pdf")
    print(f"Total pages: {len(doc)}")
    for page_idx in [0, 1, 2]:
        page = doc[page_idx]
        print(f"\n=================== PAGE {page_idx + 1} ORIGINAL TEXT ===================")
        print(page.get_text("text").strip()[:1000])

if __name__ == "__main__":
    extract_original_text()
