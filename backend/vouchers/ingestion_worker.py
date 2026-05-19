import asyncio
import os
import logging
from typing import Dict, Any
from .worker_base import BaseWorker
from ocr_pipeline.pipeline import process_invoice_upload_sync

logger = logging.getLogger(__name__)

class IngestionWorker(BaseWorker):
    """
    Handles PDF splitting, OCR text extraction, and page-level fanout to AI workers.
    Role: INGESTION / OCR
    Queue: ocr (or ingestion)
    """
    def __init__(self):
        super().__init__(role="INGESTION", queue_type="ingestion")
        self.allowed_task_types = ['INGESTION']

    async def handle_task(self, task: Dict[str, Any]):
        # [PHASE 11.5] Unwrap canonical payload
        payload = task['payload']
        record_id = payload.get('record_id')
        session_id = task.get('session_id', 'unknown')
        tenant_id = task.get('tenant_id', 'unknown')
        
        logger.info(f"[INGESTION_TASK_START] id={task.get('id')} record={record_id} session={session_id}")
        
        try:
            logger.info(f"[INGESTION_TASK_EXECUTE] id={task.get('id')} record={record_id} session={session_id}")
            
            if not record_id:
                logger.error(f"[INGESTION_RECORD_MISSING] id={task.get('id')} - No record_id in payload.")
                raise Exception("MISSING_RECORD_ID")
                
            logger.info(f"[INGESTION_RECORD_VERIFIED] id={task.get('id')} record={record_id}")
            
            from core.redis_orchestrator import orchestrator
            if record_id:
                orchestrator.update_session_status(record_id, "INGESTING", progress=5.0)
    
            loop = asyncio.get_running_loop()
            # [PHASE 11.9] Capture bridge success
            success = await loop.run_in_executor(self.executor, lambda: process_invoice_upload_sync(task))
            
            if not success:
                logger.error(f"[INGESTION_ABORTED] id={task.get('id')} record={record_id} - Failing task.")
                # Do NOT update to INGESTED. 
                # We raise an exception so BaseWorker handles retry/preserve
                raise Exception(f"Ingestion failed for record {record_id}")
    
            # [PHASE 11.9] Only proceed to COMPLETE if bridge returned True
            if record_id:
                orchestrator.update_session_status(record_id, "INGESTED", progress=20.0)
                
            logger.info(f"[INGESTION_TASK_SUCCESS] id={task.get('id')} record={record_id}")
            
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            logger.error(f"[INGESTION_TASK_EXCEPTION_TRACE] id={task.get('id')} error={e}\ntraceback={tb}")
            raise
        finally:
            logger.info(f"[INGESTION_TASK_COMPLETE] id={task.get('id')} record={record_id}")

if __name__ == "__main__":
    import django
    django.setup()
    worker = IngestionWorker()
    asyncio.run(worker.run())
