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
        'EXPORT'
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

        message = {
            "id": str(uuid.uuid4()), # Message Instance ID
            "correlation_id": correlation_id,
            "session_id": session_id,
            "tenant_id": str(tenant_id),
            "task_type": task_type,
            "worker_role": worker_role or task_type,
            "page_number": page_number,
            "expected_pages": expected_pages,
            "payload_version": payload_version,
            "retry_count": retry_count,
            "timestamp": time.time(),
            "payload": payload
        }

        # [PHASE 11.9] Forensic Producer Logging
        logger.info(
            f"[CANONICAL_MESSAGE_EMITTED] task_type={task_type} "
            f"ver={payload_version} corr={correlation_id} "
            f"session={session_id} tenant={tenant_id}"
        )
        return message

message_factory = MessageFactory()
