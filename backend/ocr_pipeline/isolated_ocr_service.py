import os
import sys
import json
import base64
import logging
import multiprocessing
import time
import re
from typing import Dict, Any, Optional

# Set up logging for the subprocess
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("IsolatedOCR")

def preprocess_image(img_cv):
    """
    Applies image preprocessing to improve PaddleOCR text extraction.
    Configurable via environment variables:
      OCR_DESKEW_ENABLED
      OCR_NOISE_REDUCTION_ENABLED
      OCR_CLAHE_ENABLED
      OCR_SHARPEN_ENABLED
      OCR_BORDER_CLEANUP_ENABLED
    """
    import numpy as np
    import cv2
    import os

    deskew_enabled = os.getenv("OCR_DESKEW_ENABLED", "true").lower() == "true"
    noise_reduction_enabled = os.getenv("OCR_NOISE_REDUCTION_ENABLED", "true").lower() == "true"
    clahe_enabled = os.getenv("OCR_CLAHE_ENABLED", "true").lower() == "true"
    sharpen_enabled = os.getenv("OCR_SHARPEN_ENABLED", "true").lower() == "true"
    border_cleanup_enabled = os.getenv("OCR_BORDER_CLEANUP_ENABLED", "true").lower() == "true"
    border_width = int(os.getenv("OCR_BORDER_CLEANUP_WIDTH", "10"))

    # Make a copy to avoid mutating original in place
    img = img_cv.copy()

    # 1. Deskew
    if deskew_enabled:
        try:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            gray_inv = cv2.bitwise_not(gray)
            thresh = cv2.threshold(gray_inv, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
            coords = np.column_stack(np.where(thresh > 0))
            if len(coords) > 0:
                rect = cv2.minAreaRect(coords)
                angle = rect[-1]
                if angle < -45:
                    angle = -(90 + angle)
                else:
                    angle = -angle
                
                # Limit rotation to realistic skew angles to avoid false 90deg rotations
                if 0.5 < abs(angle) < 15:
                    (h, w) = img.shape[:2]
                    center = (w // 2, h // 2)
                    M = cv2.getRotationMatrix2D(center, angle, 1.0)
                    img = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
                    logger.info(f"[OCR_PREPROCESS] Deskew applied with angle={angle:.2f}°")
        except Exception as e:
            logger.warning(f"[OCR_PREPROCESS_ERR] Deskew failed: {e}")

    # 2. Noise Reduction (Bilateral Filter)
    if noise_reduction_enabled:
        try:
            img = cv2.bilateralFilter(img, 9, 75, 75)
            logger.info("[OCR_PREPROCESS] Bilateral noise reduction applied")
        except Exception as e:
            logger.warning(f"[OCR_PREPROCESS_ERR] Noise reduction failed: {e}")

    # 3. CLAHE Contrast Enhancement
    if clahe_enabled:
        try:
            lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            cl = clahe.apply(l)
            limg = cv2.merge((cl, a, b))
            img = cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)
            logger.info("[OCR_PREPROCESS] CLAHE contrast enhancement applied")
        except Exception as e:
            logger.warning(f"[OCR_PREPROCESS_ERR] Contrast enhancement failed: {e}")

    # 4. Sharpening (Unsharp Mask)
    if sharpen_enabled:
        try:
            gaussian = cv2.GaussianBlur(img, (0, 0), 3.0)
            img = cv2.addWeighted(img, 1.5, gaussian, -0.5, 0)
            logger.info("[OCR_PREPROCESS] Unsharp mask sharpening applied")
        except Exception as e:
            logger.warning(f"[OCR_PREPROCESS_ERR] Sharpening failed: {e}")

    # 5. Border Cleanup
    if border_cleanup_enabled and border_width > 0:
        try:
            h, w = img.shape[:2]
            cv2.rectangle(img, (0, 0), (w, h), (255, 255, 255), thickness=border_width)
            logger.info(f"[OCR_PREPROCESS] Border cleanup applied (width={border_width}px)")
        except Exception as e:
            logger.warning(f"[OCR_PREPROCESS_ERR] Border cleanup failed: {e}")

    return img


def _extract_page_worker(file_path: str, page_idx: int, dpi: int, result_queue: multiprocessing.Queue):
    """
    Subprocess worker to extract text and image from a specific PDF page.
    Provides isolation from memory leaks and segfaults.
    Uses pypdfium2 for rendering and PaddleOCR for text extraction.
    """
    try:
        import pypdfium2 as pdfium
        import numpy as np
        import cv2
        import os
        from paddleocr import PaddleOCR
        import logging as paddle_logging

        # Suppress PaddleOCR debug logs
        paddle_logging.getLogger('ppocr').setLevel(paddle_logging.ERROR)

        # ── 1. LOAD PDF PAGE ──
        pdf = pdfium.PdfDocument(file_path)
        page = pdf[page_idx]
        width_pts, height_pts = page.get_size()

        # ── 2. DYNAMIC DPI SELECTION & RENDER ──
        # Small page is defined as width or height < 400 points
        if width_pts < 400 or height_pts < 400:
            selected_dpi = 200
        else:
            selected_dpi = 300

        scale = selected_dpi / 72.0
        bitmap = page.render(
            scale=scale,
            rotation=0,
        )
        pil_image = bitmap.to_pil()
        
        # Convert PIL to OpenCV format (BGR) for initial check
        open_cv_image = np.array(pil_image) 
        img_cv_original = open_cv_image[:, :, ::-1].copy()

        # Compute focus score / blur score using Laplacian variance on original grayscale image
        gray_orig = cv2.cvtColor(img_cv_original, cv2.COLOR_BGR2GRAY)
        focus_score = float(cv2.Laplacian(gray_orig, cv2.CV_64F).var())

        # Check for blur threshold upgrade (only if initially selected_dpi is 300)
        blur_threshold = float(os.getenv("OCR_BLUR_THRESHOLD", "80.0"))
        if selected_dpi == 300 and focus_score < blur_threshold:
            selected_dpi = 400
            scale = selected_dpi / 72.0
            bitmap = page.render(
                scale=scale,
                rotation=0,
            )
            pil_image = bitmap.to_pil()
            open_cv_image = np.array(pil_image) 
            img_cv_original = open_cv_image[:, :, ::-1].copy()
            # Recompute focus score
            gray_orig = cv2.cvtColor(img_cv_original, cv2.COLOR_BGR2GRAY)
            focus_score = float(cv2.Laplacian(gray_orig, cv2.CV_64F).var())
            logger.info(f"[OCR_DPI_UPGRADE] Blurry page detected (score={focus_score:.2f} < threshold={blur_threshold}). Upgraded to 400 DPI.")

        # Cleanup PDF resources
        page.close()
        pdf.close()

        # Preserve legacy queue payload contract (Qwen gets original or resized original)
        # Prevent SQS Payload Size Limit (1MB) - Cap at 600KB to leave room for base64 & prompt
        img_cv_for_bytes = img_cv_original.copy()
        quality = 80
        _, buffer = cv2.imencode('.jpg', img_cv_for_bytes, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
        while len(buffer.tobytes()) > 600 * 1024 and quality > 20:
            quality -= 10
            _, buffer = cv2.imencode('.jpg', img_cv_for_bytes, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
            
        while len(buffer.tobytes()) > 600 * 1024:
            height, width = img_cv_for_bytes.shape[:2]
            img_cv_for_bytes = cv2.resize(img_cv_for_bytes, (int(width * 0.8), int(height * 0.8)))
            _, buffer = cv2.imencode('.jpg', img_cv_for_bytes, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
            
        img_bytes = buffer.tobytes()

        # ── 3. PREPROCESSING LAYER FOR PADDLEOCR ONLY ──
        preprocess_enabled = os.getenv("OCR_PREPROCESS_ENABLED", "true").lower() == "true"
        if preprocess_enabled:
            img_cv_processed = preprocess_image(img_cv_original)
        else:
            img_cv_processed = img_cv_original.copy()

        # Telemetry logs
        logger.info(f"[OCR_TELEMETRY] OCR_PREPROCESS_ENABLED={preprocess_enabled} OCR_DPI_SELECTED={selected_dpi} OCR_PAGE_WIDTH={width_pts} OCR_PAGE_HEIGHT={height_pts} OCR_FOCUS_SCORE={focus_score:.2f} OCR_BLUR_SCORE={focus_score:.2f}")

        # ── 4. PADDLE OCR ENGINE ──
        t_start = time.time()
        
        ocr_engine = PaddleOCR(use_angle_cls=False, lang='en', enable_mkldnn=False)
        ocr_results = ocr_engine.ocr(img_cv_processed, cls=False)
        
        # ── 5. READING ORDER SORTING & NOISE FILTERING ──
        extracted_lines = []
        raw_blocks = []
        ocr_blocks = []

        if ocr_results and len(ocr_results) > 0 and ocr_results[0] is not None:
            for item in ocr_results[0]:
                if not (isinstance(item, list) and len(item) > 1 and isinstance(item[1], tuple)):
                    continue
                    
                box = item[0]  # [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
                text = item[1][0]
                conf = float(item[1][1])

                ocr_blocks.append({
                    "text": text,
                    "confidence": conf
                })
                
                # Noise Filtration:
                if re.match(r'^[\W_]+$', text):
                    continue
                if len(text) < 2 and not text.isdigit():
                    continue

                x0 = min(box[0][0], box[3][0])
                y0 = min(box[0][1], box[1][1])
                x1 = max(box[1][0], box[2][0])
                y1 = max(box[2][1], box[3][1])
                
                raw_blocks.append({
                    "text": text,
                    "x0": x0,
                    "y0": y0,
                    "x1": x1,
                    "y1": y1,
                    "h": y1 - y0
                })

            # Sort initially by top Y
            raw_blocks.sort(key=lambda b: b['y0'])
            
            # Y-Clustering (Group into lines)
            lines = []
            for b in raw_blocks:
                added = False
                for line in lines:
                    # Check vertical overlap
                    overlap_top = max(b['y0'], line['y0'])
                    overlap_bottom = min(b['y1'], line['y1'])
                    y_overlap = max(0, overlap_bottom - overlap_top)
                    
                    # If the overlap is > 40% of the smaller height, it belongs to the same line
                    h_min = min(b['h'], line['h'])
                    if h_min > 0 and y_overlap > 0.4 * h_min:
                        line['blocks'].append(b)
                        # Expand line boundaries
                        line['y0'] = min(line['y0'], b['y0'])
                        line['y1'] = max(line['y1'], b['y1'])
                        line['h'] = line['y1'] - line['y0']
                        added = True
                        break
                if not added:
                    lines.append({
                        "y0": b['y0'],
                        "y1": b['y1'],
                        "h": b['h'],
                        "blocks": [b]
                    })
                    
            # Gap Analysis (Phases 1, 2, 3)
            seen = set()
            for line in lines:
                # Sort blocks in the line horizontally
                line_blocks = sorted(line['blocks'], key=lambda b: b['x0'])
                
                line_str = ""
                for i, b in enumerate(line_blocks):
                    text = b['text']
                    if text in seen:
                        continue
                    seen.add(text)
                    
                    if i > 0:
                        prev_b = line_blocks[i-1]
                        gap = b['x0'] - prev_b['x1']
                        avg_h = (b['h'] + prev_b['h']) / 2.0
                        
                        if gap > 2.0 * avg_h:
                            # Table column or distant address block
                            line_str += " | "
                        elif gap > 0.25 * avg_h:
                            # Standard whitespace
                            line_str += " "
                    
                    line_str += text
                    
                if line_str.strip():
                    extracted_lines.append(line_str.strip())

        final_text = "\n".join(extracted_lines).strip()
        duration_ms = int((time.time() - t_start) * 1000)

        # Telemetry requirement
        logger.info(f"[OCR_PROVIDER] provider=PaddleOCR")
        logger.info(f"[OCR_RESULT] page={page_idx+1} char_count={len(final_text)} duration_ms={duration_ms}")

        result_queue.put({
            "success": True,
            "image_bytes": img_bytes,
            "text": final_text,
            "ocr_blocks": ocr_blocks,
            "dpi": selected_dpi,
            "blur_score": focus_score,
            "width": width_pts,
            "height": height_pts
        })
        
    except Exception as e:
        import traceback
        trace = traceback.format_exc()
        logger.error(f"Isolated OCR Error on page {page_idx + 1}: {e}\n{trace}")
        result_queue.put({
            "success": False,
            "error": f"PaddleOCR Extraction failed: {str(e)}"
        })

def run_isolated_page_extraction(file_path: str, page_idx: int, dpi: int = 300) -> Dict[str, Any]:
    """
    Spawns a clean process to extract OCR data and returns the result safely.
    """
    # Create an explicit queue for cross-process IPC
    ctx = multiprocessing.get_context('spawn')
    result_queue = ctx.Queue()
    
    # Start worker process
    p = ctx.Process(
        target=_extract_page_worker, 
        args=(file_path, page_idx, dpi, result_queue),
        daemon=True
    )
    p.start()
    
    # Wait for completion and collect payload
    # Add a generous timeout to prevent hanging forever
    try:
        result = result_queue.get(timeout=60)
        p.join(timeout=5)
        
        if p.is_alive():
            logger.warning(f"Process for page {page_idx + 1} did not terminate cleanly. Forcing termination.")
            p.terminate()
            p.join()
            
        return result
        
    except multiprocessing.queues.Empty:
        p.terminate()
        p.join()
        return {
            "success": False,
            "error": "OCR Worker Process timed out after 60 seconds."
        }
    except Exception as exc:
        if p.is_alive():
            p.terminate()
            p.join()
        return {
            "success": False,
            "error": f"OCR IPC Failure: {str(exc)}"
        }
