import logging
import json
from typing import Dict, Any, List, Tuple

logger = logging.getLogger(__name__)

class PipelineStage:
    OCR = "OCR"
    NORMALIZATION = "NORMALIZATION"
    ASSEMBLY = "ASSEMBLY"
    SNAPSHOT = "SNAPSHOT"
    FINALIZATION = "FINALIZATION"

def validate_payload_integrity(payload: Dict[str, Any], stage: str) -> Tuple[bool, List[str]]:
    """
    PHASE 10: MANDATORY INTEGRITY GATE.
    Enforces strict structural and content rules at each stage transition.
    """
    errors = []
    
    if not payload or not isinstance(payload, dict):
        return False, ["EMPTY_OR_INVALID_TYPE"]

    # Terminal Failure Check
    if payload.get("status") == "OCR_FAILED" or "_error" in payload or payload.get("_integrity_blocked"):
        logger.error(f"[INTEGRITY_TERMINAL_FAILURE] Stage={stage} payload contains explicit error or block.")
        return False, ["TERMINAL_FAILURE_DETECTED"]

    if stage == PipelineStage.OCR:
        # Rules for raw AI extraction result
        if not payload.get("_raw_text") and not payload.get("_pdf_ocr_text"):
            errors.append("MISSING_OCR_TEXT")
        
        # Extracted data structure check
        if not payload.get("header") and not any(k for k in payload.keys() if not k.startswith("_")):
            errors.append("EMPTY_EXTRACTED_DATA")
        
        if errors:
            logger.error(f"[PAYLOAD_QUARANTINED] Stage={stage} record={payload.get('record_id')} errors={errors}")

    elif stage == PipelineStage.NORMALIZATION:
        # Rules for normalized payload
        # [PHASE 11.9] Tolerant identity check
        inv_no = payload.get("invoice_no") or payload.get("supplier_invoice_no") or payload.get("Invoice No")
        vendor = payload.get("vendor_name") or payload.get("Name")
        
        if not inv_no and not vendor:
            errors.append("MISSING_IDENTITY_ANCHORS")
            
        items = payload.get("items") or []
        if not isinstance(items, list):
            errors.append("INVALID_ITEMS_STRUCTURE")
        
        if not errors:
            logger.info(f"[PAYLOAD_VALIDATED] Stage={stage}")

    elif stage == PipelineStage.SNAPSHOT:
        # Rules for finalized multi-page assembly
        data = payload.get("data", [])
        if not data or len(data) == 0:
            errors.append("EMPTY_SNAPSHOT_DATA")
        
        for idx, inv in enumerate(data):
            # Check for ANY identity anchor
            inv_no = inv.get("invoice_no") or inv.get("Invoice No") or inv.get("vendor_name")
            if not inv_no:
                errors.append(f"INVOICE_{idx}_MISSING_IDENTITY")
            
            items = inv.get("items", [])
            if not items and not inv.get("invoice_no"):
                # If both are missing, it's a void invoice
                errors.append(f"INVOICE_{idx}_VOID_DATA")
        
        if not errors:
            logger.info(f"[SNAPSHOT_ACCEPTED] record={payload.get('metadata', {}).get('original_record_id')}")
        else:
            logger.error(f"[SNAPSHOT_REJECTED] record={payload.get('metadata', {}).get('original_record_id')} errors={errors}")

    if errors:
        logger.warning(f"[PAYLOAD_POTENTIALLY_INVALID] Stage={stage} Errors={errors} - PROCEEDING IN TOLERANT MODE")
        # [PHASE 11.9] In tolerant mode, we don't return False unless it's a terminal structural failure
        if "EMPTY_OR_INVALID_TYPE" in errors or "TERMINAL_FAILURE_DETECTED" in errors:
            return False, errors
        return True, errors # Proceed with warnings
    else:
        logger.info(f"[PAYLOAD_VALIDATED] Stage={stage}")
        
    return True, []

def enforce_state_transition(record_id: str, payload: Dict[str, Any], next_stage: str):
    """
    Blocks invalid transitions and logs forensic markers.
    """
    valid, errors = validate_payload_integrity(payload, next_stage)
    if not valid:
        logger.error(f"[INVALID_TRANSITION] record={record_id} next_stage={next_stage} errors={errors}")
        # Raise exception to halt pipeline propagation
        raise ValueError(f"PIPELINE_INTEGRITY_VIOLATION: {errors}")
    
    logger.info(f"[STATE_TRANSITION] record={record_id} -> {next_stage}")
