import os
import sys
import fitz

def render_pages():
    doc = fitz.open("backend/parity_harness/dataset/sample_1.pdf")
    os.makedirs("artifacts", exist_ok=True)
    for i in [0, 1, 2]:
        page = doc[i]
        pix = page.get_pixmap(dpi=150)
        out_path = f"artifacts/page_{i+1}.png"
        pix.save(out_path)
        print(f"Saved {out_path}")

if __name__ == "__main__":
    render_pages()
