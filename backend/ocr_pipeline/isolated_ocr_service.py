import os
import sys
import json
import base64
import logging
import multiprocessing
from typing import Dict, Any, Optional

# Set up logging for the subprocess
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("IsolatedOCR")

def _extract_page_worker(file_path: str, page_idx: int, dpi: int, result_queue: multiprocessing.Queue):
    """
    Subprocess worker to extract text and image from a specific PDF page.
    Provides isolation from memory leaks and segfaults.
    """
    try:
        import fitz
        doc = fitz.open(file_path)
        page = doc[page_idx]
        
        # 1. Detect visual orientation before main render / OCR / extraction (Requirement B)
        # Check geometry first
        is_landscape = page.rect.width > page.rect.height
        if is_landscape:
            logger.info(f"[ROTATION_DETECTED] Page geometry landscape detected (width={page.rect.width}, height={page.rect.height}).")

        # Generate quick low-res preview for pytesseract OSD
        pix_preview = page.get_pixmap(dpi=72)
        img_preview_bytes = pix_preview.tobytes("jpg", jpg_quality=70)
        
        rotate_angle = 0
        try:
            import io
            from PIL import Image
            import pytesseract
            
            img = Image.open(io.BytesIO(img_preview_bytes))
            osd = pytesseract.image_to_osd(img)
            
            for line in osd.splitlines():
                if "Rotate:" in line:
                    try:
                        rotate_angle = int(line.split(":")[1].strip())
                        logger.info(f"[ROTATION_DETECTED] Tesseract OSD detected visual rotation of {rotate_angle} degrees.")
                    except:
                        pass
                    break
        except Exception as osd_err:
            logger.debug(f"[OSD_ERROR] OSD detection failed or skipped: {osd_err}")

        # Determine rotation to apply
        apply_rotation = 0
        if rotate_angle in [90, 180, 270]:
            apply_rotation = rotate_angle
        elif is_landscape and rotate_angle == 0:
            # Fallback geometry rotation if OSD couldn't detect text orientation but page is sideways
            logger.info(f"[ROTATION_DETECTED] Fallback landscape geometry rotation applied.")
            apply_rotation = 270 # Standard landscape to portrait rotation

        if apply_rotation > 0:
            logger.info(f"[ROTATION_APPLIED] Rotating page {page_idx} by {apply_rotation} degrees.")
            new_rot = (page.rotation + apply_rotation) % 360
            page.set_rotation(new_rot)
            
        # Re-render main pixmap at the corrected rotation
        pix = page.get_pixmap(dpi=dpi)
        img_bytes = pix.tobytes("jpg", jpg_quality=80)
        
        # Run OCR / text extraction on the rotated page
        text = page.get_text("text").strip()
        logger.info(f"[PRE_OCR_NORMALIZATION_COMPLETE] Page {page_idx} pre-OCR normalization complete. Text length={len(text)}.")
        
        doc.close()
        
        # We pass back B64 to ensure it survives the queue pickling
        result_queue.put({
            "success": True,
            "text": text,
            "image_b64": base64.b64encode(img_bytes).decode('utf-8')
        })
    except Exception as e:
        logger.error(f"Isolated OCR Error on page {page_idx}: {e}")
        result_queue.put({"success": False, "error": str(e)})

def run_isolated_page_extraction(file_path: str, page_idx: int, dpi: int = 150, timeout: int = 45) -> Dict[str, Any]:
    """
    PHASE 4: OCR PROCESS ISOLATION.
    Runs page rendering and text extraction in a separate OS process.
    Guarantees that a segfault or RAM leak in PyMuPDF won't kill the main worker.
    """
    queue = multiprocessing.Queue()
    process = multiprocessing.Process(
        target=_extract_page_worker, 
        args=(file_path, page_idx, dpi, queue)
    )
    
    process.start()
    try:
        result = queue.get(timeout=timeout)
        process.join()
        if result["success"]:
            # Decode back to bytes
            result["image_bytes"] = base64.b64decode(result["image_b64"])
        return result
    except Exception as e:
        logger.error(f"Isolated OCR Timeout/Failure on page {page_idx}: {e}")
        if process.is_alive():
            process.terminate()
            process.join()
        return {"success": False, "error": f"Isolation failure: {str(e)}"}
