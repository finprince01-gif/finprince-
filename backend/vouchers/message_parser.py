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
        'EXPORT',
        'MATERIALIZE'
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
        # [FORENSIC FIX] Accept both session_id and upload_session_id — old-path producers use
        # upload_session_id; rejecting them caused silent quarantine+delete before ingestion.
        session_id = raw_message.get("session_id") or raw_message.get("upload_session_id")
        if not session_id:
             logger.error(f"[MESSAGE_IDENTITY_MISSING] session_id/upload_session_id missing id={msg_id} keys={list(raw_message.keys())}")
             return False, None, "MISSING_SESSION_ID"
        if not raw_message.get("session_id") and raw_message.get("upload_session_id"):
             logger.warning(f"[SESSION_ID_COMPAT] id={msg_id} using upload_session_id as session_id fallback")

        # [PHASE 11.9] Strict Job Identity Validation
        payload = raw_message.get("payload", {})
        job_id = raw_message.get("job_id") or payload.get("job_id")
        record_id = raw_message.get("record_id") or payload.get("record_id")
        
        logger.info(f"[CONTEXT_TRACE_SCHEMA_VALIDATE] msg_id={msg_id} job_id={job_id} record_id={record_id} payload_keys={list(payload.keys())}")
        
        if not job_id or str(job_id).lower() == 'unknown':
            job_id = f"single_{session_id}"
            logger.info(f"[JOB_ID_COMPAT] Assigned synthetic job_id={job_id} for session={session_id}")
            
        if not record_id or str(record_id).lower() == 'unknown':
            logger.error(f"[INVALID_JOB_CONTEXT_REJECTED] record_id missing or unknown. id={msg_id}")
            return False, None, "MISSING_RECORD_ID"
            
        logger.info(f"[JOB_CONTEXT_VALIDATED] job_id={job_id} record_id={record_id} session_id={session_id}")

        # 5. Handle Versioning
        version = raw_message.get("payload_version")
        if not version:
            version = "v1_legacy"
            logger.info(f"[LEGACY_VERSION_ASSIGNED] id={msg_id} version=v1_legacy")
        
        if version not in MessageParser.SUPPORTED_VERSIONS and version != "v1_legacy":
            logger.error(f"[MESSAGE_VERSION_UNSUPPORTED] version={version} id={msg_id}")
            return False, None, f"UNSUPPORTED_VERSION: {version}"

        # 5.5 Check Environment Ownership (Cross-contamination prevention)
        import os
        expected_env = os.getenv('CLUSTER_ENV', 'local')
        ownership = raw_message.get('_ownership', {})
        msg_env = ownership.get('cluster_env')
        if msg_env and msg_env != expected_env:
            logger.critical(f"[ENVIRONMENT_MISMATCH] msg_env={msg_env} expected={expected_env} id={msg_id}")
            return False, None, f"ENV_MISMATCH: msg belongs to {msg_env}"
        if not msg_env:
            logger.warning(f"[MISSING_ENVIRONMENT_METADATA] id={msg_id} - Accepting legacy message")

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
            "job_id": job_id,
            "record_id": record_id,
            # Preserve SQS handles
            "_sqs_handle": raw_message.get("_sqs_handle"),
            "_sqs_message_id": raw_message.get("_sqs_message_id"),
            "_sqs_receive_count": raw_message.get("_sqs_receive_count")
        }
        
        if "job_id" not in normalized["payload"]:
            normalized["payload"]["job_id"] = job_id
        if "record_id" not in normalized["payload"]:
            normalized["payload"]["record_id"] = record_id

        # [MESSAGE_NORMALIZED] forensic marker
        logger.info(f"[JOB_CONTEXT_PROPAGATED] type={task_type} job_id={job_id} record_id={record_id}")
        logger.info(f"[MESSAGE_NORMALIZED] type={task_type} id={normalized['id']} ver={version}")
        return True, normalized, None

message_parser = MessageParser()
