import logging
import uuid
import time
from typing import Dict, Any, Tuple, Optional

logger = logging.getLogger(__name__)

class MessageParser:
    """
    [PHASE 11.5] - Canonical Distributed Message Parser.
    Strictly validates and normalizes messages consumed by workers.
    """
    
    REQUIRED_FIELDS = {
        "correlation_id",
        "session_id",
        "tenant_id",
        "task_type",
        "payload"
    }

    VALID_TASK_TYPES = {
        'INGESTION',
        'AI_EXTRACTION',
        'ASSEMBLY',
        'FINALIZE',
        'EXPORT'
    }

    SUPPORTED_VERSIONS = {"v1"}

    @staticmethod
    def parse(raw_message: Dict[str, Any]) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
        """
        Parses and validates a raw message with Phase 11.9 Backward Compatibility.
        Returns: (is_valid, normalized_message, error_reason)
        """
        # 1. Check Required Fields (Basic)
        msg_id = raw_message.get("id") or raw_message.get("_sqs_message_id", "unknown")
        
        # 2. Extract Task Type with Backward Compatibility
        task_type_raw = str(raw_message.get("task_type", "UNKNOWN")).upper()
        
        # [PHASE 11.9] Legacy Mapping
        LEGACY_MAPPING = {
            "AI": "AI_EXTRACTION",
            "OCR": "INGESTION",
            "FINALIZATION": "FINALIZE"
        }
        
        task_type = LEGACY_MAPPING.get(task_type_raw, task_type_raw)
        
        if task_type_raw != task_type:
            logger.info(f"[LEGACY_MESSAGE_UPGRADED] id={msg_id} from={task_type_raw} to={task_type}")

        # 3. Validate Normalized Task Type
        if task_type not in MessageParser.VALID_TASK_TYPES:
            logger.error(f"[MESSAGE_TYPE_UNKNOWN] type={task_type} id={msg_id}")
            return False, None, f"UNKNOWN_TYPE: {task_type}"

        # 4. Check Core Identity Fields
        session_id = raw_message.get("session_id")
        if not session_id:
             logger.error(f"[MESSAGE_IDENTITY_MISSING] session_id is missing id={msg_id}")
             return False, None, "MISSING_SESSION_ID"

        # 5. Handle Versioning
        version = raw_message.get("payload_version")
        if not version:
            version = "v1_legacy"
            logger.info(f"[LEGACY_VERSION_ASSIGNED] id={msg_id} version=v1_legacy")
        
        if version not in MessageParser.SUPPORTED_VERSIONS and version != "v1_legacy":
            logger.error(f"[MESSAGE_VERSION_UNSUPPORTED] version={version} id={msg_id}")
            return False, None, f"UNSUPPORTED_VERSION: {version}"

        # 6. Normalize
        normalized = {
            "id": msg_id,
            "correlation_id": raw_message.get("correlation_id") or f"gen_{uuid.uuid4().hex[:8]}",
            "session_id": session_id,
            "tenant_id": str(raw_message.get("tenant_id", "system")),
            "task_type": task_type,
            "worker_role": raw_message.get("worker_role") or task_type,
            "page_number": int(raw_message.get("page_number", 1)),
            "expected_pages": int(raw_message.get("expected_pages", 1)),
            "payload_version": version,
            "retry_count": int(raw_message.get("retry_count", 0)),
            "yield_count": int(raw_message.get("_sqs_receive_count", 1)) - 1,
            "timestamp": raw_message.get("timestamp") or time.time(),
            "payload": raw_message.get("payload") or {},
            # Preserve SQS handles
            "_sqs_handle": raw_message.get("_sqs_handle"),
            "_sqs_message_id": raw_message.get("_sqs_message_id"),
            "_sqs_receive_count": raw_message.get("_sqs_receive_count")
        }

        # [MESSAGE_NORMALIZED] forensic marker
        logger.info(f"[MESSAGE_NORMALIZED] type={task_type} id={normalized['id']} ver={version}")
        return True, normalized, None

message_parser = MessageParser()
