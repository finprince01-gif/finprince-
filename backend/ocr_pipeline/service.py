import hashlib
import logging
import json
from typing import Dict, Any, Optional

from .repository import StagingRepository
from .pipeline import run_ocr_pipeline # THE SINGLE ENTRY POINT
from vendors.vendor_validation_logic import validate_vendor

logger = logging.getLogger(__name__)

# Singleton repository
repo = StagingRepository()

def generate_file_hash(file_bytes: bytes) -> str:
    """Returns SHA256 hash of the uploaded bytes."""
    return hashlib.sha256(file_bytes).hexdigest()

def process_invoice_upload(
    file_bytes: bytes, 
    voucher_type: str, 
    file_name: str = "uploaded_file.pdf", 
    upload_session_id: Optional[str] = None,
    tenant_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Orchestrates the new OCR pipeline using the single entry point.
    """
    file_hash = generate_file_hash(file_bytes)
    
    # 2. Duplicate Detection / Lifecycle Management
    existing = repo.find_by_hash_and_tenant(file_hash, tenant_id)
    if existing and existing.extracted_data:
        # Scenario: File already exists in staging (from any session) — skip re-processing
        logger.info(f"Duplicate detect: Reusing existing record {existing.id} for new session {upload_session_id}")
        
        # We MUST update session_id so the frontend view (which filters by current session) reveals it
        if existing.upload_session_id != upload_session_id:
            existing.upload_session_id = upload_session_id
            existing.save()

        return {
            "id": existing.id,
            "file_hash": existing.file_hash,
            "status": existing.status,
            "data": existing.extracted_data,
            "is_duplicate": True,
            "vendor_id": existing.vendor_id,
            "validation_status": existing.validation_status
        }
    
    # Otherwise, create or update record and RUN PIPELINE freshly
    if existing:
        record = existing
        record.status = 'PROCESSING'
        record.file_path = file_name # Update to latest name
        record.upload_session_id = upload_session_id
        record.save()
    else:
        record = repo.create_record(file_hash, file_name, voucher_type, tenant_id, upload_session_id)


    try:
        repo.update_status(record.id, 'EXTRACTING')
        
        # PHASE 1: Run the Unified OCR Pipeline (Now includes auto-validation)
        execution_res = run_ocr_pipeline(file_bytes, record)
        normalized_data = execution_res.get('data', {})
        validation_status = execution_res.get('validation', {}).get('status', 'ERROR')
        
        return {
            "id": record.id,
            "file_hash": file_hash,
            "status": 'EXTRACTED',
            "data": normalized_data,
            "vendor_id": getattr(record, 'vendor_id', None),
            "validation_status": validation_status,
            "is_duplicate": False
        }
        
    except Exception as e:
        logger.error(f"FATAL PIPELINE ERROR: {str(e)}")
        repo.update_status(record.id, 'FAILED', error_code='PIPELINE_ERROR')
        return {
            "status": 'FAILED',
            "error": str(e)
        }
