import os
import sys
import pytesseract
from PIL import Image

def ocr_rendered_pages():
    for i in [1, 2, 3]:
        img_path = f"artifacts/page_{i}.png"
        if os.path.exists(img_path):
            print(f"\n=================== OCR OF RENDERED PAGE {i} ===================")
            img = Image.open(img_path)
            text = pytesseract.image_to_string(img)
            print(text[:2500])
        else:
            print(f"File {img_path} not found")

if __name__ == "__main__":
    ocr_rendered_pages()
