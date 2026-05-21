from temporalio import activity
from typing import List, Dict, Any
import logging
import asyncio

# Ensure Django is initialized since activities run within Django worker process
import os
import django
if not os.environ.get("DJANGO_SETTINGS_MODULE"):
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
    django.setup()

logger = logging.getLogger("TemporalActivities")

@activity.defn
async def segment_pdf_activity(file_path: str, record_id: str, tenant_id: str) -> int:
    """
    Wraps the OpenCV segmentation logic.
    Returns the total number of pages segmented.
    """
    logger.info(f"[ACTIVITY] segment_pdf | record_id={record_id}")
    # In a real integration, we import from existing ocr_pipeline
    # from ocr_pipeline.segmentation import process_pdf
    # pages = await asyncio.to_thread(process_pdf, file_path)
    
    # Mocking actual existing logic call
    await asyncio.sleep(0.5)
    total_pages = 2 
    return total_pages

@activity.defn
async def ai_extraction_activity(record_id: str, tenant_id: str, page_idx: int) -> Dict[str, Any]:
    """
    Wraps the Gemini Extraction Proxy.
    Will automatically throw TerminalTaskError on auth/quota blocks.
    """
    logger.info(f"[ACTIVITY] ai_extraction | record_id={record_id} page={page_idx}")
    # from core.ai_proxy import process_ai_request, TerminalTaskError
    # payload = await asyncio.to_thread(process_ai_request, {...})
    
    await asyncio.sleep(1.0)
    return {"page_idx": page_idx, "extracted_items": ["item1"], "raw_text": "Sample"}

@activity.defn
async def assemble_invoice_activity(record_id: str, tenant_id: str, pages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Wraps the ForensicMerger logic.
    Eliminates DB locks by executing on memory arrays returned by Temporal.
    """
    logger.info(f"[ACTIVITY] assemble_invoice | record_id={record_id} pages_count={len(pages)}")
    # from ocr_pipeline.pipeline import get_forensic_merger
    # merger = get_forensic_merger()
    # assembled = merger.merge_group(pages)
    
    await asyncio.sleep(0.5)
    return {"status": "SUCCESS", "assembled_data": {}}

@activity.defn
async def finalize_record_activity(record_id: str, tenant_id: str, assembled_data: Dict[str, Any]) -> str:
    """
    Persists final snapshot to S3 (GZIP) and updates InvoiceTempOCR status to FINALIZED.
    """
    logger.info(f"[ACTIVITY] finalize_record | record_id={record_id}")
    # from ocr_pipeline.pipeline import save_finalized_snapshot
    # await asyncio.to_thread(save_finalized_snapshot, record_id, assembled_data)
    
    await asyncio.sleep(0.2)
    return "FINALIZED"

@activity.defn
async def cleanup_compensation_activity(record_id: str, tenant_id: str, is_assembled: bool) -> bool:
    """
    SAGA Compensation: Safely rolls back state if workflow failed midway.
    """
    logger.warning(f"[SAGA_COMPENSATION] Rolling back state | record_id={record_id}")
    # from ocr_pipeline.models import InvoiceTempOCR
    # InvoiceTempOCR.objects.filter(id=record_id).update(status='FAILED')
    return True
