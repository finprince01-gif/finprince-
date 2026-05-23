import uuid
import time
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class MessageFactory:
    """
    [PHASE 11.5] - Canonical Distributed Message Factory.
    Ensures ALL messages pushed to SQS follow the strict system contract.
    
    FORBIDDEN: Manual dictionary construction for SQS payloads.
    """
    
    VALID_TASK_TYPES = {
        'INGESTION',
        'AI_EXTRACTION',
        'ASSEMBLY',
        'FINALIZE',
        'EXPORT',
        'MATERIALIZE'
    }

    @staticmethod
    def create_message(
        task_type: str,
        tenant_id: str,
        session_id: str,
        payload: Dict[str, Any],
        correlation_id: Optional[str] = None,
        worker_role: Optional[str] = None,
        page_number: int = 1,
        expected_pages: int = 1,
        payload_version: str = "v1",
        retry_count: int = 0
    ) -> Dict[str, Any]:
        """
        Builds a validated canonical message.
        """
        task_type = task_type.upper()
        if task_type not in MessageFactory.VALID_TASK_TYPES:
            logger.error(f"[MESSAGE_FACTORY_INVALID_TYPE] task_type={task_type}")
            # We still build it but log a critical error for forensic tracking
            # In Phase 11.5 Step 3, the Parser will reject this.

        # correlation_id fallback
        if not correlation_id:
            try:
                from core.middleware import get_correlation_id
                correlation_id = get_correlation_id()
            except ImportError:
                pass
        
        if not correlation_id:
            correlation_id = str(uuid.uuid4())

        # Generate Deterministic Dedupe Key (Phase 2 - Dedupe & Idempotency)
        import hashlib
        import json
        record_id = payload.get('record_id')
        job_id = payload.get('job_id')
        invoice_no = payload.get('invoice_no', '')
        
        if not record_id:
            raise ValueError(f"MessageFactory MUST receive 'record_id' in payload for task_type={task_type}")
        if not job_id:
            raise ValueError(f"MessageFactory MUST receive 'job_id' in payload for task_type={task_type}")
        # Dedupe key incorporates task type, tenant, session, record, page, and core identifiers
        dedupe_string = f"{task_type}:{tenant_id}:{session_id}:{record_id}:{page_number}:{invoice_no}"
        dedupe_key = hashlib.sha256(dedupe_string.encode('utf-8')).hexdigest()

        # Distributed Tracing ID
        trace_id = f"trace-{uuid.uuid4().hex[:12]}-{int(time.time())}"

        message = {
            "id": str(uuid.uuid4()), # Message Instance ID
            "correlation_id": correlation_id,
            "trace_id": trace_id,
            "dedupe_key": dedupe_key,
            "session_id": session_id,
            "tenant_id": str(tenant_id),
            "task_type": task_type,
            "worker_role": worker_role or task_type,
            "page_number": page_number,
            "expected_pages": expected_pages,
            "payload_version": payload_version,
            "retry_metadata": {
                "retry_count": retry_count,
                "first_attempt_at": time.time(),
                "last_attempt_at": time.time(),
                "dlq_routed": False,
                "failure_reasons": []
            },
            "timestamp": time.time(),
            "payload": payload
        }

        # [PHASE 11.9 / Phase 2] Forensic Producer Logging
        logger.info(
            f"[CANONICAL_MESSAGE_EMITTED] task_type={task_type} "
            f"ver={payload_version} corr={correlation_id} "
            f"trace_id={trace_id} dedupe_key={dedupe_key} "
            f"session={session_id} tenant={tenant_id} "
            f"job_id={job_id} record_id={record_id}"
        )
        logger.info(f"[JOB_CONTEXT_PROPAGATED] task_type={task_type} job_id={job_id} record_id={record_id}")
        return message

message_factory = MessageFactory()
