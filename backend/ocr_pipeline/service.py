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
    Orchestrates the new OCR pipeline. 
    Now includes a segmentation layer for multi-invoice PDFs.
    """
    # PHASE 0: Segmentation (1 PDF -> N Invoices)
    is_pdf = file_name.lower().endswith('.pdf')
    
    if is_pdf:
        from .grouping import segment_pdf_by_boundaries
        try:
            segments = segment_pdf_by_boundaries(file_bytes)
        except Exception as e:
            logger.error(f"Segmentation failed: {e}. Falling back to single-unit processing.")
            segments = [file_bytes]
    else:
        segments = [file_bytes]

    results = []
    
    for idx, segment_bytes in enumerate(segments):
        file_hash = generate_file_hash(segment_bytes)
        seg_file_name = f"part_{idx+1}_{file_name}" if len(segments) > 1 else file_name

        # 2. Duplicate Detection / Lifecycle Management
        existing = repo.find_by_hash_and_tenant(file_hash, tenant_id)
        if existing and existing.extracted_data:
            logger.info(f"Duplicate detect: Reusing existing record {existing.id}")
            if existing.upload_session_id != upload_session_id:
                existing.upload_session_id = upload_session_id
                existing.save()
            
            results.append({
                "id": existing.id,
                "file_hash": existing.file_hash,
                "status": existing.status,
                "data": existing.extracted_data,
                "is_duplicate": True,
                "vendor_id": existing.vendor_id,
                "validation_status": existing.validation_status
            })
            continue
        
        # Otherwise, create or update record and RUN PIPELINE freshly
        if existing:
            record = existing
            record.status = 'PROCESSING'
            record.file_path = seg_file_name
            record.upload_session_id = upload_session_id
            record.save()
        else:
            record = repo.create_record(file_hash, seg_file_name, voucher_type, tenant_id, upload_session_id)

        try:
            repo.update_status(record.id, 'PROCESSING')
            
            # PHASE 1: Run the Unified OCR Pipeline
            execution_res = run_ocr_pipeline(segment_bytes, record)
            normalized_data = execution_res.get('data', {})
            validation_status = execution_res.get('validation', {}).get('status', 'ERROR')
            
            results.append({
                "id": record.id,
                "file_hash": file_hash,
                "status": 'EXTRACTED',
                "data": normalized_data,
                "vendor_id": getattr(record, 'vendor_id', None),
                "validation_status": validation_status,
                "is_duplicate": False
            })
            
        except Exception as e:
            logger.error(f"FATAL PIPELINE ERROR for segment {idx}: {str(e)}")
            repo.update_status(record.id, 'FAILED', error_code='PIPELINE_ERROR')
            results.append({
                "status": 'FAILED',
                "error": str(e)
            })

    # For multi-segment uploads, return the first one as the primary response but ensure all are in DB
    return results[0] if len(results) == 1 else {
        "status": "BATCH_EXTRACTED",
        "results": results,
        "count": len(results)
    }
