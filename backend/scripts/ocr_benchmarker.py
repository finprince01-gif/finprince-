import fitz  # PyMuPDF
import time
import psutil
import os
import gc
import statistics
import json

def benchmark_ocr_render(file_path, iterations=5):
    """
    PHASE 6B: OCR CPU FORENSICS.
    Measures memory growth, CPU time, and fragmentation per page.
    """
    if not os.path.exists(file_path):
        print(f"ERROR: File not found {file_path}")
        return
    
    results = []
    process = psutil.Process(os.getpid())
    
    print(f"\n[OCR_BENCHMARK] File: {os.path.basename(file_path)}")
    print(f"{'-'*50}")
    
    for i in range(iterations):
        gc.collect()
        mem_before = process.memory_info().rss / (1024 * 1024)
        t0 = time.perf_counter()
        
        doc = fitz.open(file_path)
        page_count = len(doc)
        
        # Render each page to measure real CPU load
        for page_num in range(page_count):
            page = doc.load_page(page_num)
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2)) # 2x zoom for OCR quality
            _ = pix.tobytes()
            
        t_total = time.perf_counter() - t0
        mem_after = process.memory_info().rss / (1024 * 1024)
        
        render_per_page = t_total / page_count
        mem_growth = mem_after - mem_before
        
        results.append({
            "iteration": i + 1,
            "total_time": t_total,
            "time_per_page": render_per_page,
            "mem_before": mem_before,
            "mem_after": mem_after,
            "mem_growth": mem_growth
        })
        
        doc.close()
        print(f"Iteration {i+1}: {page_count} pages | {t_total:.2f}s | {mem_growth:.2f}MB growth")

    # Aggregate results
    avg_time = statistics.mean([r["time_per_page"] for r in results])
    avg_mem = statistics.mean([r["mem_growth"] for r in results])
    
    report = {
        "file": file_path,
        "page_count": page_count,
        "avg_time_per_page_sec": avg_time,
        "avg_mem_growth_mb": avg_mem,
        "max_pages_per_sec": 1.0 / avg_time if avg_time > 0 else 0,
        "max_pdfs_per_min": 60.0 / t_total if t_total > 0 else 0
    }
    
    print(f"\n[FINAL_REPORT]")
    print(json.dumps(report, indent=2))
    
    return report

if __name__ == "__main__":
    # Use 16-page sample for realistic CPU load
    test_pdf = r"C:\108\AI-accounting-0.03 (9)\AI-accounting-0.03\backend\media\temp_ingestion\64\IMG_20260406_0002.pdf"
    if not os.path.exists(test_pdf):
        print(f"ERROR: Sample PDF not found at {test_pdf}")
        exit(1)
            
    benchmark_ocr_render(test_pdf)
