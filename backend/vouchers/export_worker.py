import asyncio
import os
import logging
from typing import Dict, Any
from .worker_base import BaseWorker

logger = logging.getLogger(__name__)

class ExportWorker(BaseWorker):
    """
    Dedicated Export Worker.
    Role: EXPORT
    Queue: export
    """
    def __init__(self):
        super().__init__(role="EXPORT", queue_type="export")
        self.allowed_task_types = ['EXPORT']

    async def handle_task(self, task: Dict[str, Any]):
        # [PHASE 11.5] Unwrap canonical payload
        payload = task['payload']
        task_type = task['task_type']
        record_id = payload.get('record_id')
        session_id = task['session_id']
        
        logger.info(f"[EXPORT_START] type={task_type} id={task.get('id')} record={record_id} session={session_id}")
        
        from core.redis_orchestrator import orchestrator
        if record_id:
            orchestrator.update_session_status(record_id, "EXPORTING", progress=90.0)

        loop = asyncio.get_running_loop()
        
        if task_type == 'EXPORT':
            # Run export in executor (network bound)
            await loop.run_in_executor(self.executor, lambda: self._handle_export(payload))
            if record_id:
                orchestrator.update_session_status(record_id, "EXPORTED", progress=100.0)
        else:
            logger.warning(f"[EXPORT_INVALID_TASK_TYPE] {task_type}")

    def _handle_export(self, payload):
        # Implementation logic for transformation and external sync (e.g. Zoho)
        export_id = payload.get('export_id')
        logger.info(f"[EXPORT_EXECUTE] id={export_id}")
        # ... logic ...

if __name__ == "__main__":
    import django
    django.setup()
    worker = ExportWorker()
    asyncio.run(worker.run())
