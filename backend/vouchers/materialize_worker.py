import asyncio
import json
import logging
import traceback
from typing import Dict, Any

from vouchers.worker_base import BaseWorker
from core.observability import metrics

logger = logging.getLogger("MaterializeWorker")

class MaterializeWorker(BaseWorker):
    """
    PHASE 1: Dedicated Projection/Materialization Worker.
    Replaces unsafe in-process threads. 
    Processes SQS events and projects state safely via Causal Ordering.
    """
    def __init__(self):
        super().__init__(role='MATERIALIZE', queue_type='materialization')

    async def handle_task(self, task: Dict[str, Any]):
        """
        PHASE 4: Projection Safety.
        Materializes status to InvoiceTempOCR ONLY IF incoming_version > stored_version.
        """
        payload = task.get('payload', {})
        if not payload:
            logger.warning("[MATERIALIZE_EMPTY_PAYLOAD] Dropping message")
            return

        record_id = payload.get('record_id')
        status = payload.get('status')
        workflow_version = payload.get('workflow_version', 1)
        
        if not record_id or not status:
            logger.error("[MATERIALIZE_INVALID_PAYLOAD] Missing record_id or status")
            return

        loop = asyncio.get_running_loop()
        try:
            import time
            t_start = time.time()
            
            await loop.run_in_executor(
                self.executor,
                self._safe_materialize,
                record_id,
                status,
                workflow_version
            )
            
            latency = time.time() - t_start
            metrics.record_latency("projection:materialize_latency", latency, tags={"status": status})
            
            logger.info(f"[MATERIALIZE_SUCCESS] record={record_id} version={workflow_version} status={status} latency={latency:.3f}s")
        except Exception as e:
            logger.error(f"[MATERIALIZE_FAIL] record={record_id} error={e}")
            metrics.increment_counter("projection:materialize_errors", 1)
            raise  # Let SQS retry mechanism handle it

    def _safe_materialize(self, record_id: str, status: str, workflow_version: int):
        from django.db import transaction, connection
        from ocr_pipeline.models import InvoiceTempOCR
        from core.observability import observability, metrics
        
        try:
            with transaction.atomic():
                # Phase 4: Version-Aware Projection
                # Update ONLY if incoming version is strictly greater than stored version.
                # This guarantees protection against late-arrival corruption and replay overwrites.
                updated_rows = InvoiceTempOCR.objects.filter(
                    id=record_id,
                    workflow_version__lt=workflow_version
                ).update(
                    status=status,
                    workflow_version=workflow_version
                )
                
                if updated_rows == 0:
                    # Check if it was stale or if record doesn't exist
                    exists = InvoiceTempOCR.objects.filter(id=record_id).exists()
                    if exists:
                        logger.warning(f"[MATERIALIZE_STALE_EVENT_IGNORED] record={record_id} incoming_version={workflow_version} <= stored_version")
                        metrics.increment_counter("projection:stale_events_suppressed", 1)
                        observability.info(event="STALE_EVENT_SUPPRESSED", record_id=record_id, version=workflow_version)
                    else:
                        logger.error(f"[MATERIALIZE_ORPHAN_EVENT] record={record_id} not found in InvoiceTempOCR")
        finally:
            connection.close()

if __name__ == "__main__":
    import django
    django.setup()
    worker = MaterializeWorker()
    import asyncio
    asyncio.run(worker.run())
