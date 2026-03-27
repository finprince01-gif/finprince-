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
    
    # 2. Duplicate Detection
    existing = repo.find_by_hash_and_tenant(file_hash, tenant_id)
    if existing:
        # Crucial: Update session ID to current upload, so UI can find it
        if upload_session_id:
            existing.upload_session_id = upload_session_id
        
        # Scenario A: Already has data — just refresh and return
        if existing.extracted_data:
            # Re-validate vendor (cheap refresh)
            sections = existing.extracted_data.get("sections", {})
            supplier = sections.get("supplier_details", {})
            v_res = validate_vendor(
                tenant_id=str(tenant_id),
                vendor_name=supplier.get("vendor_name"),
                gstin=supplier.get("gstin"),
                supplier_invoice_no=supplier.get("supplier_invoice_no")
            )
            existing.vendor_id = v_res.get('vendor_id')
            existing.validation_status = v_res.get('status')
            existing.save()

            logger.info(f"Duplicate detect: Reusing existing record {existing.id} for tenant {tenant_id}. Status: {existing.status}")
            return {
                "id": existing.id,
                "file_hash": existing.file_hash,
                "status": existing.status,
                "data": existing.extracted_data,
                "is_duplicate": True,
                "vendor_id": existing.vendor_id,
                "validation_status": existing.validation_status or 'NEED_VENDOR'
            }
        
        # Scenario B: Exists but no data (e.g. interrupted previous upload)
        # We FALL THROUGH to step 3, but we must use the existing record ID
        logger.info(f"Duplicate detect: Found empty record {existing.id}, resuming extraction...")
        record = existing
    else:
        # 3. Create fresh record
        record = repo.create_record(file_hash, file_name, voucher_type, tenant_id, upload_session_id=upload_session_id)


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
