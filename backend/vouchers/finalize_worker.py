import asyncio
import os
import logging
from typing import Dict, Any
from .worker_base import BaseWorker

logger = logging.getLogger(__name__)

class FinalizeWorker(BaseWorker):
    """
    Handles finalization tasks: exports to Zoho/ERP, snapshot archival, and cleanup.
    Role: FINALIZE / EXPORT
    Queue: finalize (or export)
    """
    def __init__(self):
        super().__init__(role="FINALIZE", queue_type="finalize")
        self.allowed_task_types = ['FINALIZE']

    async def handle_task(self, task: Dict[str, Any]):
        # [PHASE 11.5] Unwrap canonical payload
        payload = task['payload']
        task_type = task['task_type']
        record_id = payload.get('record_id')
        session_id = task['session_id']
        
        logger.info(f"[FINALIZE_WORKER_START] type={task_type} id={task.get('id')} record={record_id} session={session_id}")
        
        job_id = payload.get('job_id')
        item_id = payload.get('item_id')
        is_failed = payload.get('failed', False)
        
        # [FINALIZE_DB_COMMIT]
        logger.info(f"[FINALIZE_DB_COMMIT] record={record_id} job={job_id} item={item_id} failed={is_failed}")
        
        if item_id:
            from core.constants import ItemStatus
            from vouchers.models import InvoiceProcessingItem, update_job_progress
            from ocr_pipeline.models import OCRTask, update_ocr_job_progress
            import uuid
            import asyncio
            
            is_ocr_task = False
            try:
                uuid.UUID(str(item_id))
                is_ocr_task = True
            except:
                pass
                
            loop = asyncio.get_running_loop()
            
            def commit_state():
                if is_ocr_task:
                    status = 'FAILED' if is_failed else 'COMPLETED'
                    OCRTask.objects.filter(id=item_id).update(status=status)
                    if job_id:
                        update_ocr_job_progress(job_id)
                else:
                    status = ItemStatus.FAILED if is_failed else ItemStatus.FINALIZED
                    InvoiceProcessingItem.objects.filter(id=item_id).update(status=status)
                    if job_id:
                        update_job_progress(job_id)
            
            await loop.run_in_executor(None, commit_state)
            
        logger.info(f"[JOB_TERMINAL_STATE_SET] record={record_id} job={job_id}")

if __name__ == "__main__":
    import django
    django.setup()
    worker = FinalizeWorker()
    asyncio.run(worker.run())
