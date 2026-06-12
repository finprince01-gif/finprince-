import os
import sys
import fitz
import pytesseract
from PIL import Image
from pathlib import Path

def search_visual_ocr():
    doc = fitz.open("backend/parity_harness/dataset/sample_1.pdf")
    print(f"Total pages: {len(doc)}")
    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=150)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        text = pytesseract.image_to_string(img)
        if "1008" in text:
            print(f"Page {i+1} visual matches:")
            for line in text.split("\n"):
                if "1008" in line:
                    print(f"  {line}")

if __name__ == "__main__":
    search_visual_ocr()
