import os
import sys
import fitz
from pathlib import Path

def search_pdf():
    doc = fitz.open("backend/parity_harness/dataset/sample_1.pdf")
    print(f"Total pages: {len(doc)}")
    for i, page in enumerate(doc):
        text = page.get_text()
        if "1008" in text or "26001008" in text:
            print(f"Page {i+1} matches:")
            for line in text.split("\n"):
                if "1008" in line:
                    print(f"  {line}")

if __name__ == "__main__":
    search_pdf()
