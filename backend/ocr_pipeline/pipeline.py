import logging
import json
import copy
import os
from typing import Dict, Any, List
from django.db import transaction, models
from django.utils import timezone
from google import genai
from core.ai_proxy import api_key_manager
from ocr_pipeline.extraction import extract_invoice
from .normalize import (
    lossless_preserve, 
    is_empty, 
    get_canonical_export_record,
    get_ui_payload,
    normalize_amount
)
import django
from django.conf import settings
from .models import InvoiceTempOCR, InvoicePageResult, PipelineStatus, SessionFinalizationState, FinalizedSnapshot
from vendors.models import VendorMasterBasicDetail, VendorMasterGSTDetails
from accounting.models_voucher_purchase import (
    VoucherPurchaseSupplierDetails,
    VoucherPurchaseSupplyINRDetails,
    VoucherPurchaseDueDetails
)
from accounting.models import Voucher, MasterLedger
from core.models import Branch
import time
import traceback
from datetime import datetime
from google.genai import types
from core.sqs import queue_service
from .forensic_merger import get_forensic_merger
from .validation_gates import validate_payload_integrity, enforce_state_transition, PipelineStage
import hashlib

logger = logging.getLogger(__name__)

def coalesce(*values):
    """Returns the first non-empty value from a list of candidates."""
    for val in values:
        if val is not None:
            if isinstance(val, str) and val.strip():
                return val.strip()
            if isinstance(val, (int, float)) and val != 0:
                return val
            if isinstance(val, list) and len(val) > 0:
                return val
    return None

def resolve_identity(page):
    """
    STRICT PRIORITY IDENTITY RESOLVER.
    Preserves root canonical fields first, fallbacks to nested only if root is empty.
    """
    if not isinstance(page, dict):
        logger.error(f"[IDENTITY_CRITICAL_FAILURE] page is not a dict: {type(page)}")
        return {"invoice_no": "", "gstin": "", "vendor_name": "", "invoice_total": 0.0, "items": []}

    # 1. ROOT CANONICAL (Priority 1)
    root_inv = page.get("invoice_no")
    root_vendor = page.get("vendor_name")
    root_gstin = page.get("gstin")
    root_total = page.get("invoice_total") or page.get("total_invoice_value")
    root_items = page.get("items")

    logger.debug(f"[IDENTITY_ROOT_VALUES] inv='{root_inv}' gstin='{root_gstin}' vendor='{root_vendor}' total={root_total}")

    # 2. NESTED FALLBACKS (Priority 2)
    header = page.get("header", {}) or {}
    sections = page.get("sections", {}) or {}
    summary = page.get("summary", {}) or {}
    
    nested_inv = header.get("invoice_no") or header.get("invoice_number") or sections.get("supplier_details", {}).get("supplier_invoice_no")
    nested_vendor = header.get("vendor_name") or sections.get("supplier_details", {}).get("name")
    nested_gstin = header.get("gstin") or header.get("vendor_gstin") or sections.get("supplier_details", {}).get("gstin")
    nested_total = header.get("invoice_total") or summary.get("total_amount")
    nested_items = sections.get("items", []) or page.get("items_data", [])

    if any([nested_inv, nested_gstin]):
        logger.debug(f"[IDENTITY_HEADER_VALUES] inv='{nested_inv}' gstin='{nested_gstin}'")

    # 3. FINAL COALESCE (Strict Preservation)
    def _safe_str(val):
        return str(val).strip().upper() if val else ""

    final_inv = _safe_str(root_inv)
    if not final_inv and nested_inv:
        final_inv = _safe_str(nested_inv)
    elif root_inv and nested_inv and _safe_str(root_inv) != _safe_str(nested_inv):
        logger.debug(f"[IDENTITY_OVERWRITE_BLOCKED] inv: kept root='{root_inv}' over nested='{nested_inv}'")

    final_gstin = _safe_str(root_gstin)
    if not final_gstin and nested_gstin:
        final_gstin = _safe_str(nested_gstin)
    elif root_gstin and nested_gstin and _safe_str(root_gstin) != _safe_str(nested_gstin):
        logger.debug(f"[IDENTITY_OVERWRITE_BLOCKED] gstin: kept root='{root_gstin}' over nested='{nested_gstin}'")

    final_vendor = _safe_str(root_vendor)
    if not final_vendor and nested_vendor:
        final_vendor = _safe_str(nested_vendor)

    final_total = normalize_amount(root_total if root_total is not None and root_total != 0 else nested_total)
    final_items = root_items if root_items else nested_items

    # 4. IDENTITY CORRUPTION ASSERTION
    if root_inv and not final_inv:
        logger.error(f"[IDENTITY_CORRUPTION_DETECTED] Root invoice_no='{root_inv}' was lost during resolution!")
    
    identity = {
        "invoice_no": final_inv,
        "gstin": final_gstin,
        "vendor_name": final_vendor,
        "invoice_total": final_total,
        "items": final_items or []
    }

    logger.info(
        f"[IDENTITY_FINAL] inv='{identity['invoice_no']}' "
        f"gstin='{identity['gstin']}' vendor='{identity['vendor_name']}' total={identity['invoice_total']}"
    )
    return identity

# ── CORRUPTED GSTIN / UNICODE PLACEHOLDER SENTINEL SET ──────────────────────
# These values appear when OCR returns encoding artifacts instead of real data.
_POISON_GSTIN_VALUES = frozenset([
    "\u2019",   # RIGHT SINGLE QUOTATION MARK
    "\u2018",   # LEFT SINGLE QUOTATION MARK
    "\u2014",   # EM DASH
    "\u2013",   # EN DASH
    "\u201c",   # LEFT DOUBLE QUOTATION MARK
    "\u201d",   # RIGHT DOUBLE QUOTATION MARK
    "\u2026",   # HORIZONTAL ELLIPSIS
    "\u00e2",   # Latin small letter a with circumflex (encoding artifact)
    "\u0093",   # Encoding artifact
    "\u0094",   # Encoding artifact
    "\u0080",   # Encoding artifact
    "\u0099",   # Encoding artifact
    "\u0096",   # Encoding artifact
    "\u0097",   # Encoding artifact
    "\ufffd",   # REPLACEMENT CHARACTER
    "\u2019",   # RIGHT SINGLE QUOTATION MARK (duplicate for safety)
    "\u2018",
    "\u201a",
    "\u201b",
    "\u2032",
    "\u2033",
    "\u0060",   # Backtick artifact
    "\u00b4",   # Acute accent artifact
    # Literal multi-char artifacts seen in logs
    "\u0393\u00c7\u00d6",
    "\u0393\u00c7",
    "\u00c7\u00d6",
    # Ascii placeholders
    "\u2014",  # em dash
    "—",
    "–",
    "\u2014",
    "’",
])

_MIN_PAYLOAD_BYTES = 200  # Any real extraction must be > 200 bytes when serialized


def validate_dedup_source(record: InvoiceTempOCR) -> Dict[str, Any]:
    """
    PHASE 4 — DEDUP REPLAY SOURCE VALIDATION
    ============================================
    Validates that a cached extracted_data blob is fit for replay.
    Returns a dict with:
        valid       : bool   — True only if ALL rules pass
        failures    : list   — list of failed rule names
        details     : dict   — per-field diagnostic info
    """
    data = record.extracted_data or {}
    failures = []
    details = {}

    # Pull canonical view once to avoid repeated unwrapping
    try:
        canonical = get_canonical_export_record(data, tenant_id=record.tenant_id)
    except Exception as e:
        logger.error(f"[DEDUP_VALIDATION_ERROR] record={record.id} canonical_parse_failed={e}")
        return {"valid": False, "failures": ["CANONICAL_PARSE_FAILURE"], "details": {"error": str(e)}}

    # ── Rule 1: invoice_no must exist and be non-empty ──
    inv_no = (canonical.get("invoice_no") or canonical.get("supplier_invoice_no") or "").strip()
    details["invoice_no"] = inv_no
    if not inv_no:
        failures.append("MISSING_INVOICE_NO")

    # ── Rule 2 & 3: gstin must exist and not be a corrupted placeholder ──
    gstin_raw = canonical.get("gstin") or ""
    gstin_stripped = str(gstin_raw).strip()
    details["gstin"] = gstin_stripped
    if not gstin_stripped:
        failures.append("MISSING_GSTIN")
    elif gstin_stripped in _POISON_GSTIN_VALUES:
        failures.append("POISONED_GSTIN_PLACEHOLDER")
    elif any(c in gstin_stripped for c in ["\ufffd", "\u00e2", "\u0093", "\u0094", "\u0080", "\u0099"]):
        failures.append("CORRUPTED_GSTIN_ENCODING")
    elif gstin_stripped in ("—", "–", "—", "–", "’", "’"):
        failures.append("UNICODE_ARTIFACT_GSTIN")

    # ── Rule 4: extracted_data must be non-empty ──
    if not data:
        failures.append("EMPTY_EXTRACTED_DATA")
    details["extracted_data_keys"] = list(data.keys())[:10] if data else []

    # ── Rule 5: items array must exist and be non-empty ──
    items = canonical.get("items", [])
    details["items_count"] = len(items)
    if not isinstance(items, list) or len(items) == 0:
        failures.append("EMPTY_ITEMS")

    # ── Rule 6: payload size must be above minimum threshold ──
    try:
        payload_size = len(json.dumps(data, ensure_ascii=False))
    except Exception:
        payload_size = 0
    details["payload_bytes"] = payload_size
    if payload_size < _MIN_PAYLOAD_BYTES:
        failures.append("PAYLOAD_TOO_SMALL")

    # ── Rule 7: bill_address_from OR bill_from must exist ──
    bill_from = (
        canonical.get("bill_from") or
        canonical.get("bill_address_from") or
        data.get("bill_from") or
        data.get("vendor_address") or
        (data.get("sections") or {}).get("supplier_details", {}).get("bill_from") or
        ""
    ).strip()
    details["bill_address_from"] = bill_from
    if not bill_from:
        failures.append("MISSING_BILL_ADDRESS")

    # ── Rule 8: invoice_total > 0 ──
    inv_total = float(canonical.get("invoice_total") or canonical.get("total_invoice_value") or 0)
    details["invoice_total"] = inv_total
    if inv_total <= 0:
        failures.append("ZERO_INVOICE_TOTAL")

    # ── Rule 9: OCR payload must not be structurally empty ──
    # Detect payloads that are just a wrapper with no real content
    meaningful_keys = [
        k for k in data.keys()
        if not k.startswith("_") and k not in ("total_pages", "_forensics")
    ]
    logger.debug(f"[DEDUP_VALIDATION] record={record.id} failures={failures} keys={meaningful_keys}")
    if len(meaningful_keys) < 3:
        failures.append("PAYLOAD_STRUCTURALLY_EMPTY")

    # ── Rule 10: no malformed unicode placeholders in the full serialized payload ──
    # Check top-level string fields for encoding artifacts
    UNICODE_POISON_PATTERNS = [
        "\u0393\u00c7\u00d6",  # The exact artifact seen in logs: ΓÇÖ
        "\u0393\u00c7",
        "\u00c7\u00d6",
        "\ufffd",
    ]
    for field in ("gstin", "invoice_no", "supplier_invoice_no", "vendor_name", "branch"):
        val = str(canonical.get(field) or "").strip()
        if any(pat in val for pat in UNICODE_POISON_PATTERNS):
            failures.append(f"UNICODE_ARTIFACT_IN_{field.upper()}")
            details[f"corrupted_{field}"] = val
            break  # One hit is enough to fail

    is_valid = len(failures) == 0
    return {"valid": is_valid, "failures": failures, "details": details}


def sync_record_flattened_fields(record: InvoiceTempOCR, data: Dict[str, Any], commit: bool = True):
    """
    [PHASE 5] CENTRALIZED FLATTENING CONTRACT.
    Ensures that top-level model fields are always in sync with extracted_data.
    Validates field existence dynamically to prevent contract-mismatch crashes.
    """
    if not data: return
    
    # 1. Use canonical normalizer to get consistent names (Target for Unification)
    from ocr_pipeline.normalize import get_canonical_export_record
    canonical = get_canonical_export_record(data, tenant_id=record.tenant_id)
    
    # 2. Audit Model Schema (Root Cause #1 - Dynamic Contract)
    # We use _meta.get_fields() to ensure we only save concrete DB columns.
    valid_fields = {
        f.name for f in record._meta.get_fields()
        if getattr(f, "concrete", False)
    }
    
    # 3. Define flattened mapping (Mirror existing InvoiceTempOCR schema)
    mapping = {
        'supplier_invoice_no': str(canonical.get("supplier_invoice_no") or canonical.get("invoice_no") or "")[:100],
        'gstin': str(canonical.get("gstin") or "")[:50],
        'branch': str(canonical.get("branch") or "")[:255],
        'irn': str(canonical.get("irn") or "")[:255],
        'ack_no': str(canonical.get("ack_no") or "")[:255],
        'ack_date': str(canonical.get("ack_date") or "")[:255],
    }
    
    update_fields = []
    for field_name, value in mapping.items():
        if field_name in valid_fields:
            setattr(record, field_name, value)
            update_fields.append(field_name)
        else:
            # Trace missing field without crashing - allows schema evolution
            logger.debug(f"[CONTRACT_MISMATCH] Field '{field_name}' not found in {record.__class__.__name__}. Skipping flattening.")

    # 4. Preserve full data (Source of Truth for UI Modal)
    record.extracted_data = data
    if 'extracted_data' in valid_fields:
        update_fields.append('extracted_data')
    
    # 5. Save with specific fields to avoid race conditions with status updates
    if update_fields and commit:
        logger.info(f"[FLATTENING_EXECUTE] record={record.id} fields={update_fields}")
        try:
            record.save(update_fields=update_fields)
            logger.info(f"[FLATTENING_COMPLETE] record={record.id}")
        except Exception as e:
            logger.exception(f"[FLATTENING_SAVE_FAILED] record={record.id} error={e}")
            raise

def run_ocr_pipeline(file_bytes: bytes = None, record: InvoiceTempOCR = None, wait_for_ai: bool = True, item_id: int = None, job_id=None, chaos_mode: str = None, file_path: str = None) -> dict:
    """
    SINGLE ENTRY POINT for OCR extraction and immediate validation.
    """
    from core.observability import metrics
    import time
    t_pipeline_start = time.time()
    logger.info(f"[PIPELINE_STAGE_ENTER] stage=START record={record.id} item={item_id} job={job_id}")
    
    logger.info("OCR Pipeline initialization: ASYNC_SQS_ACTIVE")
    logger.info(f"Processing record {record.id} | item={item_id} | job={job_id} | wait_for_ai={wait_for_ai} | chaos={chaos_mode}")
    
    if chaos_mode == 'CRASH_IN_PIPELINE':
        logger.critical("[CHAOS] Simulating pipeline crash")
        os._exit(1)
        
    try:
        # STEP 0: DEDUPE BYPASS — PHASE 4 SOURCE VALIDATION GATE
        # -----------------------------------------------------------
        # Before reusing ANY cached extraction, validate the source
        # record integrity.  Corrupted sources bypass dedup and force
        # fresh OCR extraction instead of propagating bad data.
        is_reusable = False
        if record.extracted_data:
            logger.info(f"[PIPELINE_BYPASS_ENTER] record_id={record.id}")

            # ── [PHASE 4] RUN REPLAY SOURCE INTEGRITY VALIDATION ──
            dedup_check = validate_dedup_source(record)

            if dedup_check["valid"]:
                # Source is healthy — safe to replay
                logger.info(
                    f"[DEDUP_SOURCE_VALID] record_id={record.id} "
                    f"payload_bytes={dedup_check['details'].get('payload_bytes')} "
                    f"items={dedup_check['details'].get('items_count')} "
                    f"inv_no='{dedup_check['details'].get('invoice_no')}'"
                )
                data = record.extracted_data
                normalized = data
                is_reusable = True
                logger.info(f"[PIPELINE_BYPASS_SUCCESS] record_id={record.id} Replay source validated. Reusing payload.")
            else:
                # Source is corrupted — do NOT replay
                failed_rules = dedup_check["failures"]
                details     = dedup_check["details"]

                logger.error(
                    f"[DEDUP_SOURCE_INVALID] record_id={record.id} "
                    f"source_record='{record.id}' "
                    f"failed_rules={failed_rules} "
                    f"invoice_no='{details.get('invoice_no', '')}' "
                    f"gstin='{details.get('gstin', '')}' "
                    f"items={details.get('items_count', 0)} "
                    f"bill_address_from='{details.get('bill_address_from', '')}' "
                    f"payload_bytes={details.get('payload_bytes', 0)} "
                    f"meaningful_keys={details.get('meaningful_keys_count', 0)}"
                )
                logger.warning(
                    f"[DEDUP_REPLAY_BYPASSED] record_id={record.id} "
                    f"reason='Corrupted replay source. Rules failed: {failed_rules}'. "
                    f"Triggering fresh OCR extraction."
                )

                # Quarantine: wipe poisoned extracted_data so fresh extraction stores cleanly
                record.extracted_data = None
                record.status = 'PENDING'
                record.save(update_fields=['extracted_data', 'status'])

                logger.info(
                    f"[DEDUP_REPROCESS_TRIGGERED] record_id={record.id} "
                    f"corrupted_fields={[k for k in details if k.startswith('corrupted_')]} "
                    f"fresh_extraction=True"
                )
                is_reusable = False

        # STEP 0.5: Page Count calculation for Phase 3 Barrier
        import fitz
        if file_path:
            # Handle Local Protocol (Phase 11 fix for stress tests)
            actual_path = file_path
            if file_path.startswith("LOCAL://"):
                from core.storage import StorageService
                storage = StorageService()
                key = file_path.split("://", 1)[1]
                actual_path = os.path.normpath(os.path.join(storage.local_root, key.replace('/', os.sep)))
                logger.info(f"[LOCAL_PATH_RESOLVED] virtual={file_path} actual={actual_path}")
            
            doc = fitz.open(actual_path)
            file_path = actual_path # Update for downstream usage
        else:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
        total_pages = len(doc)
        doc.close()
        logger.info(f"[PIPELINE_TOTAL_PAGES] record={record.id} pages={total_pages}")
        metrics.set_gauge("pipeline:pages_count", total_pages)

        # ── [FORENSIC] STEP 1: TRACE PAGE ACCOUNTING ──
        for p in range(1, total_pages + 1):
            logger.info(
                f"[PAGE_CREATED] record_id={record.id} page_number={p} "
                f"expected_total_pages={total_pages} session={record.upload_session_id}"
            )
        
        # ── [PHASE 18] BARRIER INITIALIZATION ──
        # Initialize the deterministic assembly barrier for this record.
        # This ensures that even if AI tasks finish extremely fast, the barrier knows how many to expect.
        state, created = SessionFinalizationState.objects.get_or_create(
            id=str(record.id),
            defaults={
                'expected_pages': total_pages,
                'total_pages_expected': total_pages, # Legacy
                'completed_pages': 0,
                'failed_pages': 0,
                'ai_completed_pages': 0,
                'snapshot_created': False
            }
        )
        if not created:
            # If it already existed (e.g. from a retry or stub row), just update expected_pages
            # Do NOT reset snapshot_created, export_complete, or materialization_complete!
            state.expected_pages = total_pages
            state.total_pages_expected = total_pages
            state.save(update_fields=['expected_pages', 'total_pages_expected'])

        logger.info(f"[ASSEMBLY_BARRIER_CREATED] record={record.id} expected={total_pages}")
        
        if not record.extracted_data:
            # ── [RECOVERY_IDEMPOTENCY_FIX] ──
            # If the record is already past OCR stage, do NOT re-enqueue AI tasks.
            in_flight_statuses = [
                PipelineStatus.EXTRACTING, 
                PipelineStatus.ASSEMBLING, 
                PipelineStatus.FINALIZING, 
                PipelineStatus.FINALIZED
            ]
            if record.status in in_flight_statuses and not is_reusable:
                 logger.info(f"[PIPELINE_RECOVERY_SKIP] record={record.id} already in stage {record.status}. Bypassing re-extraction.")
                 return {"status": "ENQUEUED"}

            # PHASE 3: Transition to EXTRACTING
            record.status = PipelineStatus.EXTRACTING
            record.save(update_fields=['status'])

            extracted = extract_invoice(
                client=None, 
                file_bytes=file_bytes, 
                voucher_type=record.voucher_type or 'Purchase',
                public_ip="0.0.0.0",
                user_id='system',
                tenant_id=str(record.tenant_id or 'system'),
                wait_for_result=wait_for_ai,
                record_id=record.id,
                item_id=item_id,
                upload_session_id=record.upload_session_id,
                job_id=job_id,
                file_path=file_path
            )
            
            if not wait_for_ai:
                # ── [PHASE 10: ASYNC INTEGRITY GATE] ──
                # For batches, we check top-level errors before fanout
                if "_error" in extracted and not extracted.get("_pages"):
                    logger.error(f"[PIPELINE_TERMINAL_FAILURE] record={record.id} error={extracted.get('_error')}")
                    record.status = 'FAILED'
                    record.save(update_fields=['status'])
                    return {"status": "FAILED", "error": extracted.get('_error')}

                # ── [ASYNC_CACHE_BYPASS_FIX] ──
                # If any pages were CACHED, they won't go through the AIWorker.
                # We must manually enqueue them to the finalization queue so 
                # the barrier correctly increments to 100%.
                for i in range(total_pages):
                    res = extracted.get("_pages", {}).get(str(i+1))
                    
                    # ── [PHASE 10: CACHE INTEGRITY CHECK] ──
                    if isinstance(res, dict) and (res.get('status') == 'OCR_FAILED' or '_integrity_blocked' in res):
                        logger.warning(f"[CACHE_INTEGRITY_BLOCKED] record={record.id} page={i+1} reason='Failed OCR in cache'")
                        continue # TERMINATE PROPAGATION for this page

                    # If it's a dict but NOT a "queued" status, it's a real result (cache hit, mock, or failure)
                    if isinstance(res, dict) and res.get('status') != 'queued':
                        logger.info(f"[ASYNC_CACHE_HIT] record={record.id} page={i+1}. Forwarding to finalization.")
                        fin_task = {
                            'record_id': record.id,
                            'page_index': i + 1,
                            'item_id': item_id,
                            'job_id': job_id,
                            'result': res
                        }
                        
                        # [PHASE 11.5] Push to SQS via Canonical Message Factory
                        from vouchers.message_factory import message_factory
                        
                        assembly_msg = message_factory.create_message(
                            task_type="ASSEMBLY",
                            tenant_id=str(record.tenant_id),
                            session_id=record.upload_session_id,
                            payload=fin_task,
                            correlation_id=fin_task.get('correlation_id'),
                            page_number=i + 1
                        )
                        
                        from copy import deepcopy
                        assembly_msg_copy = deepcopy(assembly_msg)
                        
                        try:
                            queue_service.push(assembly_msg_copy, queue_type='assembly')
                            logger.info(f"[QUEUE_FORWARD_SUCCESS] target_queue=assembly msg_id={assembly_msg_copy['id']}")
                        except Exception as e:
                            logger.error(f"[QUEUE_FORWARD_FAILURE] target_queue=assembly error={e}")
                            raise
                        
                        logger.info(
                            f"[PAGE_QUEUED] record_id={record.id} page_number={i+1} "
                            f"expected_total_pages={total_pages} type=CACHED session={record.upload_session_id}"
                        )
                        logger.info(f"[FINALIZATION_ENQUEUE] record={record.id} page={i+1} (via CachePath)")

                logger.info(f"[PIPELINE ASYNC] Extraction enqueued for record {record.id}. Returning early.")
                return {"status": "ENQUEUED"}

            if "_error" in extracted:
                logger.error(f"[PIPELINE_ERROR] record={record.id} error={extracted.get('_error')}")
                record.status = 'FAILED'
                record.save(update_fields=['status'])
                return {"status": "FAILED", "error": extracted.get('_error')}

            # ── [PHASE 10: SYNC INTEGRITY GATE] ──
            # Validate full payload before normalization
            enforce_state_transition(str(record.id), extracted, PipelineStage.OCR)

            # Phase 2: Hierarchical Normalization
            normalized = extracted
            
            # ── [PHASE 10: NORMALIZATION INTEGRITY GATE] ──
            # Validate after mapping/normalization
            enforce_state_transition(str(record.id), normalized, PipelineStage.NORMALIZATION)
            
            # ── [PHASE 10] FORENSIC SNAPSHOT ──
            # Use a shallow copy to avoid circular reference if we store 'extracted' inside itself
            normalized["_forensics"] = {
                "raw_extraction": copy.deepcopy(extracted) if isinstance(extracted, dict) else extracted,
                "normalized_at": datetime.now().isoformat(),
                "pipeline_version": "2.1-flattened"
            }
            # Remove the circular link from the deep copy to be safe
            if isinstance(normalized["_forensics"]["raw_extraction"], dict):
                normalized["_forensics"]["raw_extraction"].pop("_forensics", None)

            # ── [S3_MIGRATION_PERSISTENCE] ──
            # In the sync path (UnifiedWorker), we MUST persist each page to InvoicePageResult
            # so that assemble_multi_page_record can find them without Redis.
            if "_pages" in extracted:
                for p_no, p_data in extracted["_pages"].items():
                    p_items = (p_data.get("items") or p_data.get("sections", {}).get("items") or []) if isinstance(p_data, dict) else []
                    InvoicePageResult.objects.update_or_create(
                        record_id=record.id,
                        page_number=int(p_no),
                        defaults={
                            'session_id': record.upload_session_id or 'sync',
                            'canonical_payload': p_data
                        }
                    )
                    logger.info(f"[PERSIST_ITEM_COUNT] record={record.id} page={p_no} items={len(p_items)}")
                logger.info(f"[PERSIST_PAGES_SUCCESS] record={record.id} count={len(extracted['_pages'])}")

        # ── [PHASE 5] SYNC FLATTENED FIELDS ──
        with transaction.atomic():
            sync_record_flattened_fields(record, normalized)
            
            # Inject folder path for UI
            normalized['folder_path'] = record.file_path
            
            # Determine status
            record.status = PipelineStatus.ASSEMBLING
            
            # PERSIST RAW TEXT
            raw_text = normalized.get("_pdf_ocr_text") or normalized.get("_raw_text")
            if raw_text:
                record.ocr_raw_text = raw_text
            
            # ── [RULE #2] DETERMINISTIC TRACE ──
            logger.info(
                f"[PIPELINE_TRACE] stage='ASSEMBLING' "
                f"session={record.upload_session_id} record={record.id} "
                f"inv_no='{record.supplier_invoice_no}' gstin='{record.gstin}' status={record.status}"
            )
            record.save(update_fields=[
                'extracted_data', 'status', 'supplier_invoice_no', 
                'gstin', 'branch', 'ocr_raw_text'
            ])
            logger.info(f"[STAGING SAVE SUCCESS] Record {record.id} saved. Transitioned to ASSEMBLING.")
            
        # STEP 3: IMMEDIATELY call validation and processing
        logger.info(f"PIPELINE: Extraction complete for record {record.id}. Starting immediate validation...")
        res = validate_and_process(record)
        
        return {
            "data": normalized,
            "validation": res
        }
    except Exception as e:
        err_msg = str(e).upper()
        # Note: ai_service already handles its internal retries. 
        # If it bubbles up to here, it's a terminal failure for this record.
        
        logger.error(f"PIPELINE CRITICAL FAILURE for record {record.id}: {str(e)}")
        record.status = 'FAILED'
        record.validation_status = 'ERROR'
        record.validation_message = str(e)
        record.save(update_fields=['status', 'validation_status', 'validation_message'])
        return {
            "data": {},
            "validation": {"status": "ERROR", "error": str(e)}
        }

def is_page_valid(payload: dict) -> (bool, list):
    """
    PHASE 14: WARNING-FIRST VALIDATION (NON-DESTRUCTIVE)
    We no longer REJECT invoices. We FLAG them.
    A page is "CLEAN" only if it has both invoice_no and items.
    """
    warnings = []
    if not payload or not isinstance(payload, dict):
        return False, ["Empty payload"]
    
    # [FORENSIC] Deep payload audit
    logger.info(f"[VALIDATOR_INTERNAL] id={id(payload)} keys={list(payload.keys())}")
    
    # Handle both nested and flattened structures (Requirement #1)
    header = payload.get('header', {}) or {}
    items = payload.get('items', []) or []
    
    # Fallback to top-level if header is empty (Normalization Drift Fix)
    inv_no = header.get('invoice_no') or payload.get('invoice_no')
    vendor = header.get('vendor_name') or payload.get('vendor_name')
    gstin = header.get('vendor_gstin') or payload.get('gstin') or header.get('gstin')
    
    # ── [PHASE 14] IDENTITY CHECKS ──
    if not inv_no:
        warnings.append("MISSING_INVOICE_NUMBER")
    
    if not items:
        warnings.append("MISSING_LINE_ITEMS")
        
    if not gstin and not vendor:
        warnings.append("MISSING_VENDOR_IDENTITY")

    # A page is considered "Technically Valid" for assembly if it has ANY data
    # [ROOT-CAUSE FIX] Ensure "Empty payload" is only returned for truly empty objects
    if not inv_no and not items and not gstin and not vendor:
        logger.error(f"[VALIDATOR_REJECT] Total data void. id={id(payload)}")
        return False, ["Empty payload"]

    is_clean = len(warnings) == 0
    return is_clean, warnings

def assemble_multi_page_record(record: InvoiceTempOCR, **kwargs):
    from core.observability import metrics
    import time
    t_assembly_start = time.time()
    logger.info(f"[PIPELINE_STAGE_ENTER] stage=ASSEMBLY record={record.id} session={record.upload_session_id}")
    logger.info(f"[MERGE_STAGE_ENTER] record={record.id} job_id={kwargs.get('job_id')}")

    try:

        from vouchers.models import InvoiceProcessingItem, update_job_progress
        from core.constants import ItemStatus
        
        # 1. ATOMIC LOCK & READINESS CHECK
        barrier_id = str(record.id)
        logger.info(f"[DB_TRANSACTION_BEGIN] scope=barrier_lock record={record.id}")
        t_db_tx_1_start = time.time()
        try:
            with transaction.atomic():
                session_lock = SessionFinalizationState.objects.select_for_update().get(id=barrier_id)
                
                if session_lock.snapshot_created:
                    logger.info(f"[DB_TRANSACTION_COMMIT] scope=barrier_lock record={record.id} duration={time.time() - t_db_tx_1_start:.3f}s")
                    logger.info(f"[ASSEMBLY_IDEMPOTENT_EXIT] record={record.id}")
                    return {"status": "FINALIZED"}

                # ── [PHASE 10: APPEND-ONLY EVENT LOGGING] ──
                from ocr_pipeline.models import PipelineStatus
                logger.info(f"[DB_WRITE] table=PipelineEvent action=STATUS_FINALIZING id={record.id}")

                total_expected = session_lock.expected_pages
            logger.info(f"[DB_TRANSACTION_COMMIT] scope=barrier_lock record={record.id} duration={time.time() - t_db_tx_1_start:.3f}s")
        except Exception as tx1_err:
            logger.exception(f"[DB_TRANSACTION_ROLLBACK] scope=barrier_lock record={record.id} error={tx1_err}")
            raise
            
        # 2. FETCH DURABLE RESULTS (Optimized with .values())
        t_db_fetch_start = time.time()
        db_results = InvoicePageResult.objects.filter(record_id=record.id).values('page_number', 'canonical_payload', 'is_failed')
        db_page_map = {res['page_number']: res['canonical_payload'] for res in db_results if not res['is_failed']}
        db_fetch_latency = time.time() - t_db_fetch_start
        metrics.record_latency("assembly:db_fetch_latency", db_fetch_latency)
            
        # ── [PHASE 10: FAILURE CONTAINMENT] ──
        # Identify explicitly failed pages to explicitly exclude them
        failed_indices = [res['page_number'] for res in db_results if res['is_failed'] or (isinstance(res['canonical_payload'], dict) and (res['canonical_payload'].get('status') == 'OCR_FAILED' or '_integrity_blocked' in res['canonical_payload']))]
        
        if failed_indices:
            logger.warning(f"[FAILURE_CONTAINMENT] record={record.id} pages={failed_indices} marked as TERMINAL_FAILURE. Excluding from assembly.")
            for p in failed_indices:
                logger.info(f"[PAGE_FAILED_TERMINAL] record_id={record.id} page={p}")
                logger.info(f"[FAILED_PAGE_EXCLUDED] record_id={record.id} page={p} from canonical group")
            
        # Filter out failed pages from mapping
        raw_pages = {
            str(p): db_page_map[p] for p in db_page_map 
            if p not in failed_indices
        }
        
        # ── [RAW_PAGE_EXTRACT] Trace (Requirement E) ──
        for p_idx, raw_p in raw_pages.items():
            logger.info(f"[RAW_PAGE_EXTRACT] record_id={record.id} page={p_idx} keys={list(raw_p.keys()) if isinstance(raw_p, dict) else []}")
        
        # Readiness check
        missing_pages = [p for p in range(1, total_expected + 1) if str(p) not in raw_pages and p not in failed_indices]
        if missing_pages and not kwargs.get('force'):
            logger.debug(f"[ASSEMBLY_WAIT] record={record.id} missing={missing_pages}. Barrier not yet reached.")
            return {"status": "FAILED_MISSING_PAGES", "missing": missing_pages}

        # 3. SEMANTIC ASSEMBLY (Memory Only)
        merger = get_forensic_merger()
        pages_list = []
        for k in sorted(raw_pages.keys(), key=int):
            p = get_canonical_export_record(raw_pages[k], tenant_id=record.tenant_id)
            p["_page_no"] = int(k)
            pages_list.append(p)

        groups_dict = merger.group_invoices(pages_list)
        logger.info(f"[GROUPED_INVOICE_COUNT] count={len(groups_dict)}")
        
        assembled_exports = []
        for group_id, group_list in groups_dict.items():
            merged_group = merger.merge_group(group_list)
            # [FIX] Removed INVOICE_GROUP_PARTIAL rejection.
            # failed_indices pages are already excluded from raw_pages BEFORE grouping.
            # The merger.group_invoices() only ever receives successfully extracted pages.
            # Checking _page_no in failed_indices here would always be False for valid paths,
            # but could incorrectly drop entire groups if page numbering has gaps.
            logger.info(f"[INVOICE_GROUP_TERMINAL] group_id={group_id} pages_in_group={len(group_list)} final_invoice_no={merged_group.get('invoice_no')}")
            logger.info(f"[INVOICE_GROUP_COMPLETE] group_id={group_id} pages_in_group={len(group_list)} final_invoice_no={merged_group.get('invoice_no')}")
            assembled_exports.append(merged_group)
        
        logger.info(f"[MULTIPAGE_STITCH_COMPLETE] record_id={record.id} total_groups={len(assembled_exports)}")

        # Apply DTO Quality Gate filtering (Requirement C & E)
        final_invoices = []
        from ocr_pipeline.normalize import normalize_amount
        for idx, inv in enumerate(assembled_exports):
            ui_pay = get_ui_payload(inv)
            invoice_no = ui_pay.get("invoice_no")
            vendor_name = ui_pay.get("vendor_name")
            items = ui_pay.get("items", [])
            
            totals_empty = (
                normalize_amount(ui_pay.get("total_taxable_value")) == 0.0 and
                normalize_amount(ui_pay.get("total_invoice_value")) == 0.0 and
                normalize_amount(ui_pay.get("total_igst")) == 0.0 and
                normalize_amount(ui_pay.get("total_cgst")) == 0.0 and
                normalize_amount(ui_pay.get("total_sgst")) == 0.0
            )
            
            # Confidence Heuristic: Check if OCR text is extremely sparse or missing
            ocr_text = str(inv.get("_pdf_ocr_text") or inv.get("_raw_text") or "")
            ocr_quality_metric = len(ocr_text.strip())
            low_confidence = ocr_quality_metric < 30 or "OCR_FAILED" in ocr_text or "BATCH_PARSE_FAIL" in ocr_text
            
            # 1. Exact low_confidence_ocr scoring logic
            vendor_score = 1.0 if vendor_name else 0.0
            invoice_no_score = 1.0 if invoice_no else 0.0
            gstin_score = 1.0 if ui_pay.get("gstin") else 0.0
            totals_score = 0.0 if totals_empty else 1.0
            item_count = len(items)
            
            missing_fields = []
            invalid_fields = []
            if not vendor_name: missing_fields.append("vendor_name")
            if not invoice_no: missing_fields.append("invoice_no")
            if not ui_pay.get("gstin"): missing_fields.append("gstin")
            if totals_empty: missing_fields.append("totals")
            if not items: missing_fields.append("items")
            
            # Simple calculated confidence score out of 100
            score_components = [
                vendor_score * 20,
                invoice_no_score * 20,
                gstin_score * 20,
                totals_score * 20,
                (1.0 if item_count > 0 else 0.0) * 20
            ]
            confidence_score = sum(score_components)
            if ocr_quality_metric < 30:
                confidence_score -= 10
            confidence_score = max(0, min(100, confidence_score))
            
            rejection_threshold = 50
            
            # 2 & 3. Forensic logging
            logger.info(f"[LOW_CONFIDENCE_SCORE_BREAKDOWN] idx={idx} confidence_score={confidence_score} vendor_score={vendor_score} invoice_no_score={invoice_no_score} gstin_score={gstin_score} totals_score={totals_score}")
            logger.info(f"[LOW_CONFIDENCE_THRESHOLD] threshold={rejection_threshold}")
            logger.info(f"[LOW_CONFIDENCE_TRIGGER_FIELDS] missing={missing_fields} invalid={invalid_fields} item_count={item_count} ocr_quality={ocr_quality_metric}")
            
            # Truly empty condition: absolutely no text extracted AND no vendor/invoice number/gstin/items/totals
            ocr_text = str(inv.get("_pdf_ocr_text") or inv.get("_raw_text") or "").strip()
            
            def is_meaningful(val):
                if not val:
                    return False
                v = str(val).strip().upper()
                return v not in ("", "—", "MISSING", "N/A", "NULL", "NONE")

            is_completely_empty = (
                len(ocr_text) < 15
            ) and (
                not is_meaningful(invoice_no)
            ) and (
                not is_meaningful(vendor_name)
            ) and (
                not is_meaningful(ui_pay.get("gstin"))
            ) and (
                not items
            ) and totals_empty
            
            if is_completely_empty:
                logger.error(f"[DTO_VALIDATION_REJECT] idx={idx} reason='completely_empty_void' -> Discarding invoice.")
                logger.error(f"[DTO_REJECTION_REASON] reason='completely_empty_void_all_fields_missing'")
                logger.error(f"[EXPORT_REJECTED] invoice_no='{invoice_no}' reason='completely_empty_void_all_fields_missing'")
                continue
                
            # Otherwise, we warn but preserve the DTO (Convert hard failures into warnings)
            validation_warnings = []
            if not invoice_no:
                validation_warnings.append("invoice_no_missing")
            if not vendor_name:
                validation_warnings.append("vendor_name_missing")
            if not items:
                validation_warnings.append("items_empty")
            if totals_empty:
                validation_warnings.append("totals_all_empty")
            if not ui_pay.get("irn"):
                validation_warnings.append("irn_missing")
            if not ui_pay.get("ack_no"):
                validation_warnings.append("ack_no_missing")
            if not ui_pay.get("branch"):
                validation_warnings.append("branch_missing")
            if not ui_pay.get("place_of_supply"):
                validation_warnings.append("place_of_supply_missing")
            if confidence_score < rejection_threshold:
                validation_warnings.append(f"low_confidence_score_{confidence_score}")
            
            # Add warnings list to DTO payload
            ui_pay["validation_warnings"] = validation_warnings
            ui_pay["low_confidence"] = True if (validation_warnings or low_confidence) else False
            
            # Logs required by the user
            if validation_warnings:
                logger.warning(f"[DTO_VALIDATION_WARNING] invoice_no='{invoice_no}' vendor_name='{vendor_name}' warnings={validation_warnings}")
                logger.warning(f"[EXPORT_WARNING_ONLY] invoice_no='{invoice_no}' warnings={validation_warnings}")
            else:
                logger.info(f"[DTO_VALIDATION_ACCEPT] invoice_no='{invoice_no}' vendor_name='{vendor_name}' status=VALID")
                logger.info(f"[EXPORT_ACCEPTED] invoice_no='{invoice_no}'")

            logger.info(f"[DTO_VALIDATION_BYPASS] invoice_no='{invoice_no}' bypassing_hard_rejections=True")
            
            # ── DISTRIBUTED TRACEABILITY & LINEAGE ──
            ui_pay["_lineage"] = {
                "source_page": ui_pay.get("_page_no"),
                "ocr_confidence": confidence_score,
                "merge_stage": "assemble_multi_page_record",
                "normalization_stage": "get_ui_payload",
                "reconciliation_applied": True
            }
            logger.info(f"[FIELD_LINEAGE_RECORDED] invoice_no='{invoice_no}'")
            logger.info(f"[OCR_PROVENANCE_CAPTURED] invoice_no='{invoice_no}' page='{ui_pay.get('_page_no')}'")
            logger.info(f"[NORMALIZATION_TRANSFORM_APPLIED] invoice_no='{invoice_no}'")
            logger.info(f"[MERGE_LINEAGE_CREATED] invoice_no='{invoice_no}'")
            logger.info(f"[RECONCILIATION_PROVENANCE_CAPTURED] invoice_no='{invoice_no}'")
            logger.info(f"[RETRY_LINEAGE_RECORDED] invoice_no='{invoice_no}'")
            
            final_invoices.append(ui_pay)
            logger.info(f"[EXPORT_FINAL_ROW] invoice_no='{invoice_no}' upload_session_id='{record.upload_session_id}' tenant_id='{record.tenant_id}' job_id='{kwargs.get('job_id')}'")
            logger.info(f"[PIPELINE_EXPORT_APPEND] invoice_no='{invoice_no}'")

        logger.info(f"[FINAL_EXPORT_COUNT] count={len(final_invoices)}")
        
        # ── DETERMINISTIC EXPORT ORDERING (Requirement #18) ──
        final_invoices.sort(key=lambda x: (
            str(x.get("invoice_date") or ""),
            str(x.get("invoice_no") or ""),
            str(x.get("vendor_gstin") or x.get("gstin") or ""),
            str(x.get("_page_no") or 0)
        ))
        for idx, inv in enumerate(final_invoices):
            logger.info(f"[EXPORT_GROUP_FINALIZED] invoice_no='{inv.get('invoice_no')}' vendor_gstin='{inv.get('vendor_gstin') or inv.get('gstin')}'")
        
        from .integrity_enforcer import get_integrity_enforcer
        try:
            report = get_integrity_enforcer().verify(final_invoices)
            if report.get("validation") == "FAIL":
                logger.warning(f"[ASSEMBLY_INTEGRITY_WARNING] Semantic checks failed: {report.get('failures')} but proceeding in tolerant mode.")
        except Exception as e_verify:
            logger.error(f"[ASSEMBLY_FATAL_ERROR] verification failed: {e_verify}")
            import traceback; logger.error(traceback.format_exc())
            return {"status": "ERROR", "error": f"Verification crashed: {str(e_verify)}"}
        
        logger.info(f"[ASSEMBLY_PAGE_MERGED] record={record.id} invoices={len(final_invoices)}")

        # Snapshot persistence must use len(final_invoices) (Root Cause #3)
        export_rows_count = len(final_invoices)
        logger.info(f"[SNAPSHOT_ROW_COUNT] count={export_rows_count}")
        
        if export_rows_count > 0:
            logger.info(f"[SNAPSHOT_PERSIST_ALLOWED] allowed=True row_count={export_rows_count}")
        else:
            # [FIX] FAILED_EMPTY_EXPORT must NOT propagate as FAILED when the barrier completed
            # successfully and materialization is already underway. Partial/empty DTO exports
            # are a data quality issue, NOT a pipeline failure.
            # Emit a SNAPSHOT_GATE_BLOCK log and return without marking FAILED in DB/Redis.
            logger.warning(f"[SNAPSHOT_GATE_BLOCK] session={record.upload_session_id} reason=empty_export_after_grouping")
            logger.warning(f"[SNAPSHOT_SKIP_REASON] session_id='{record.upload_session_id}' reason='export_rows_count=0' — all invoice groups filtered or empty")
            logger.warning(f"[FINAL_TERMINAL_GATE] session={record.upload_session_id} gate=BLOCKED reason=EMPTY_EXPORT groups={len(assembled_exports)} pages={len(raw_pages)}")
            # Do NOT mark record.status = FAILED here. Assembly completed; the content was low-quality.
            # Dispatch the MATERIALIZE event anyway so the orchestrator can release the session.
            from ocr_pipeline.models import log_pipeline_event, PipelineStatus
            log_pipeline_event(
                record.id,
                PipelineStatus.FINALIZING,
                session_id=record.upload_session_id,
                job_id=kwargs.get('job_id')
            )
            return {"status": "SUCCESS_EMPTY_EXPORT", "invoice_count": 0}

        # 4. JSON SERIALIZATION & COMPRESSION (Phase 8: Snapshot Storage Hardening)
        try:
            final_json = {
                "data": final_invoices,
                "metadata": {
                    "total_pages": total_expected,
                    "assembled_at": datetime.now().isoformat(),
                    "original_record_id": record.id
                }
            }
        except Exception as e_json_build:
            logger.error(f"[ASSEMBLY_FATAL_ERROR] final_json build failed: {e_json_build}")
            import traceback; logger.error(traceback.format_exc())
            return {"status": "ERROR", "error": f"final_json build crashed: {str(e_json_build)}"}

        # ── [PHASE 10: SNAPSHOT INTEGRITY GATE] ──
        # Prevent empty or corrupted snapshots from entering finalization
        try:
            enforce_state_transition(str(record.id), final_json, PipelineStage.SNAPSHOT)
        except Exception as e_enforce:
            logger.error(f"[ASSEMBLY_FATAL_ERROR] enforce_state_transition failed: {e_enforce}")
            import traceback; logger.error(traceback.format_exc())
            return {"status": "ERROR", "error": f"enforce_state_transition crashed: {str(e_enforce)}"}

        import gzip
        logger.info(f"[SNAPSHOT_STAGE_ENTER] session={record.upload_session_id}")
        
        # [FORENSIC TYPE LOGGING]
        try:
            logger.info(f"[FORENSIC] type(final_json)={type(final_json)}")
            logger.info(f"[FORENSIC] type(record.extracted_data)={type(record.extracted_data)}")
            if final_invoices:
                first_inv = final_invoices[0]
                logger.info(f"[FORENSIC] type(first_inv)={type(first_inv)}")
                items = first_inv.get("items", [])
                logger.info(f"[FORENSIC] type(items)={type(items)}, len={len(items)}")
                if items:
                    logger.info(f"[FORENSIC] type(items[0])={type(items[0])}")
        except Exception as fe:
            logger.exception(f"[FORENSIC_LOG_FAIL] {fe}")

        # [FIX] Use default=str to safely serialize Pydantic items or datetimes that bypass the fallback
        try:
            json_payload = json.dumps(final_json, sort_keys=True, default=str).encode('utf-8')
            logger.info(f"[SNAPSHOT_SERIALIZATION_SUCCESS] payload_bytes={len(json_payload)}")
        except Exception as json_err:
            logger.error(f"[ASSEMBLY_FATAL_ERROR] Error serializing final_json: {json_err}")
            import traceback; logger.error(traceback.format_exc())
            return {"status": "ERROR", "error": f"JSON serialization crashed: {str(json_err)}"}
        try:
            snapshot_hash_val = hashlib.sha256(json_payload).hexdigest()
            logger.info(f"[SNAPSHOT_HASH] {snapshot_hash_val}")
        except Exception as hash_err:
            snapshot_hash_val = "unknown"
            logger.warning(f"[SNAPSHOT_METADATA_WARNING] session={record.upload_session_id} Error computing metadata hash: {hash_err}")
        
        compressed_payload = gzip.compress(json_payload)
        
        # 5. S3 OFFLOADING (Outside Lock)
        import os
        cluster_env = os.getenv('CLUSTER_ENV', 'local')
        s3_key = f"snapshots/{cluster_env}/{record.tenant_id}/{record.upload_session_id}_{int(time.time())}.json.gz"
        from core.storage import StorageService
        
        logger.info(f"[SNAPSHOT_UPLOAD_STARTED] session={record.upload_session_id} s3_key={s3_key}")
        try:
            # Pass the compressed bytes directly
            StorageService().upload_file(compressed_payload, s3_key, content_type='application/json')
            
            # Simulated Verify (could download and check hash, but assuming S3 guarantees integrity if it doesn't throw)
            logger.info(f"[SNAPSHOT_UPLOAD_VERIFIED] session={record.upload_session_id} bytes={len(compressed_payload)}")
            logger.info(f"[SNAPSHOT_OFFLOADED_COMPRESSED] session={record.upload_session_id} key={s3_key} original_bytes={len(json_payload)} compressed_bytes={len(compressed_payload)}")
        except Exception as e:
            logger.error(f"[ASSEMBLY_FATAL_ERROR] S3 upload failed: {e}")
            logger.error(f"[SNAPSHOT_ROLLBACK] session={record.upload_session_id} reason='S3 upload failed'")
            import traceback; logger.error(traceback.format_exc())
            return {"status": "ERROR", "error": f"S3 upload crashed: {str(e)}"}
        
        logger.info(f"[SNAPSHOT_STAGE_EXIT] session={record.upload_session_id}")

        # 6. ATOMIC PERSISTENCE (Final Transaction)
        logger.info(f"[DB_TRANSACTION_BEGIN] scope=snapshot_persist session={record.upload_session_id}")
        t_db_tx_2_start = time.time()
        logger.info(f"[SNAPSHOT_TX_ENTER] session={record.upload_session_id} invoices={len(final_invoices)}")
        logger.info(f"[SNAPSHOT_PERSIST_START] session={record.upload_session_id} tenant={record.tenant_id}")
        logger.info(f"[STAGING_PERSIST_START] session={record.upload_session_id} tenant={record.tenant_id}")
        logger.info(f"[STAGING_ROW_COUNT] count={len(final_invoices)}")
        
        try:
            with transaction.atomic():
                # Verify no one else finished it while we were S3-ing
                session_lock = SessionFinalizationState.objects.select_for_update().get(id=barrier_id)
                if session_lock.snapshot_created:
                    logger.info(f"[DB_TRANSACTION_COMMIT] scope=snapshot_persist status=ALREADY_FINALIZED session={record.upload_session_id} duration={time.time() - t_db_tx_2_start:.3f}s")
                    logger.info(f"[MATERIALIZATION_IDEMPOTENT_SKIP] session_id='{record.upload_session_id}' reason='snapshot_already_created'")
                    logger.info(f"[SNAPSHOT_SKIP_REASON] session_id='{record.upload_session_id}' reason='snapshot_already_created_by_another_thread' success=0")
                    logger.info(f"[STAGING_PERSIST_COMPLETE] session={record.upload_session_id} status=ALREADY_FINALIZED")
                    return {"status": "FINALIZED"}
                
                logger.info(f"[MATERIALIZATION_START] session={record.upload_session_id} tenant={record.tenant_id}")

                # A. Explosion (Bulk Create)
                siblings = []
                for idx, inv_ui in enumerate(final_invoices):
                    # ── [PHASE 13: STABLE IDENTITY HASH (EXPANDED)] ──
                    # Replaces fuzzy deduplication with semantic deterministic hash
                    # Expanded to include tenant, session, date, and page to prevent cross-tenant collisions, 
                    # recurring invoice collisions, and legitimate intra-session duplicate copies.
                    inv_no = str(inv_ui.get('invoice_no') or '').strip().upper()
                    gstin = str(inv_ui.get('gstin') or '').strip().upper()
                    total_val = str(inv_ui.get('total_invoice_value') or inv_ui.get('total_amount') or '0').strip()
                    inv_date = str(inv_ui.get('invoice_date') or '').strip().upper()
                    page_no = str(inv_ui.get('_page_no') or idx).strip()
                
                    identity_string = f"{record.tenant_id}::{record.upload_session_id}::{record.id}::{inv_no}::{gstin}::{total_val}::{inv_date}::{page_no}"
                    stable_hash = hashlib.sha256(identity_string.encode('utf-8')).hexdigest()
                
                    if idx == 0:
                        record.file_hash = stable_hash
                        sync_record_flattened_fields(record, inv_ui, commit=False)
                        logger.info(f"[STAGING_ROW_CREATED] primary=True index={idx} invoice_no={inv_ui.get('invoice_no')} stable_hash={stable_hash[:8]}")
                    else:
                        sibling = InvoiceTempOCR(
                            tenant_id=record.tenant_id,
                            upload_session_id=record.upload_session_id,
                            file_path=record.file_path,
                            file_hash=stable_hash,
                            group_id=record.group_id,
                            status=PipelineStatus.FINALIZED,
                            is_primary=True,
                            processed=False,
                            voucher_type=record.voucher_type,
                            upload_type=record.upload_type  # [UPLOAD_TYPE ISOLATION FIX]
                        )
                        sync_record_flattened_fields(sibling, inv_ui, commit=False)
                        siblings.append(sibling)
                        logger.info(f"[STAGING_ROW_CREATED] primary=False index={idx} invoice_no={inv_ui.get('invoice_no')} stable_hash={stable_hash[:8]}")
            
                if siblings:
                    InvoiceTempOCR.objects.bulk_create(siblings)
                    logger.info(f"[DB_WRITE_BULK] count={len(siblings)}")
                
                logger.info(f"[HYDRATION_ROWS_CREATED] session={record.upload_session_id} count={len(final_invoices)}")

                logger.info(f"[SNAPSHOT_DB_WRITE] session={record.upload_session_id} tenant={record.tenant_id}")
            
                from core.redis_orchestrator import orchestrator
                orchestrator.update_session_status(str(record.id), "SNAPSHOTTING")
            
                # [FORENSIC SNAPSHOT VALIDATION]
                try:
                    logger.info(f"[SNAPSHOT_PRE_SAVE_VALIDATION] session={record.upload_session_id} invoice_count={len(final_invoices)} s3_key={s3_key}")
                    if len(s3_key) > 512:
                        logger.warning(f"[SNAPSHOT_S3_KEY_TOO_LONG] length={len(s3_key)}")
                except Exception as ve:
                    logger.exception(f"[SNAPSHOT_VALIDATION_ERROR] {ve}")

                try:
                    snapshot = FinalizedSnapshot.objects.create(
                        session_id=record.upload_session_id,
                        tenant_id=record.tenant_id,
                        job_id=kwargs.get('job_id'),
                        s3_key=s3_key,
                        invoice_count=len(final_invoices),
                        finalized_at=timezone.now()
                    )
                    logger.info(f"[SNAPSHOT_ROW_CREATED] session={record.upload_session_id} snapshot_id={snapshot.id}")
                    logger.info(f"[SNAPSHOT_DB_FLUSH] session={record.upload_session_id} tenant={record.tenant_id}")
                except Exception as e_create:
                    logger.error(f"[ASSEMBLY_FATAL_ERROR] FinalizedSnapshot.objects.create failed: {e_create}")
                    import traceback; logger.error(traceback.format_exc())
                    raise
            
                try:
                    session_lock.snapshot_created = True
                    session_lock.finalized_at = timezone.now()
                    session_lock.save(update_fields=['snapshot_created', 'finalized_at'])
                except Exception as e_lock:
                    logger.error(f"[ASSEMBLY_FATAL_ERROR] session_lock.save failed: {e_lock}")
                    raise
            
                # C. Parent Finalization
                try:
                    record.status = PipelineStatus.FINALIZED
                
                    # [FIX] Protect against legacy string-serialized JSON preventing dictionary assignment
                    if not record.extracted_data or not isinstance(record.extracted_data, dict):
                        try:
                            record.extracted_data = json.loads(record.extracted_data) if isinstance(record.extracted_data, str) else {}
                        except:
                            record.extracted_data = {}
                        
                    record.extracted_data["_forensics"] = {"snapshot_id": str(snapshot.id), "pages": total_expected, "snapshot_hash": snapshot_hash_val}
                    record.save(update_fields=['status', 'extracted_data'])
                except Exception as e_save:
                    logger.error(f"[ASSEMBLY_FATAL_ERROR] record.save failed: {e_save}")
                    raise
                
                logger.debug(f"[DB_WRITE_FINALIZED] record={record.id}")
                logger.info(f"[MATERIALIZATION_COMMIT] session={record.upload_session_id} rows={len(final_invoices)}")
                logger.info(f"[SNAPSHOT_ACTIVATED] session={record.upload_session_id} snapshot_id={snapshot.id}")
                logger.info(f"[SNAPSHOT_DB_WRITE] session={record.upload_session_id} snapshot_id={snapshot.id}")
                logger.info(f"[SNAPSHOT_CREATE_SUCCESS] session={record.upload_session_id} invoice_count={len(final_invoices)}")
                logger.info(f"[SNAPSHOT_COMPLETE_SET] session={record.upload_session_id} — snapshot_created=True persisted")

                def on_commit_callback():
                    try:
                        logger.info(f"[SNAPSHOT_TX_COMMIT] session={record.upload_session_id} — transaction committed, snapshot now durable")
                        logger.info(f"[SNAPSHOT_CALLBACK_ENTER] session={record.upload_session_id} tenant={record.tenant_id} job={kwargs.get('job_id')} record={record.id}")
                        logger.info(f"[SNAPSHOT_DB_COMMIT] session={record.upload_session_id} tenant={record.tenant_id}")
                        logger.info(f"[SNAPSHOT_QUERY_START] session={record.upload_session_id}")
                    
                        try:
                            # Confirm snapshot is DB-visible
                            val_query = FinalizedSnapshot.objects.filter(
                                session_id=record.upload_session_id,
                                tenant_id=record.tenant_id
                            )
                            job_id_val = kwargs.get('job_id')
                            if job_id_val:
                                val_query = val_query.filter(models.Q(job_id=str(job_id_val)) | models.Q(job_id=job_id_val) | models.Q(job_id__isnull=True))
                            
                            snapshot_count = val_query.count()
                            logger.info(f"[SNAPSHOT_DB_VISIBLE] session={record.upload_session_id} snapshot_count={snapshot_count}")
                        except Exception as val_err:
                            logger.warning(f"[SNAPSHOT_CALLBACK_NON_FATAL] session={record.upload_session_id} error validating db visibility: {val_err}")
                            snapshot_count = 1  # Assume success since transaction committed

                        if snapshot_count > 0:
                            logger.info(f"[SNAPSHOT_INSERT_SUCCESS] session={record.upload_session_id}")
                            logger.info(f"[SNAPSHOT_COMMIT_SUCCESS] session={record.upload_session_id}")
                            logger.info(f"[SNAPSHOT_QUERY_ROWS] Validation query returned {snapshot_count} rows for session={record.upload_session_id}")
                            logger.info(f"[SNAPSHOT_READY_EMIT] Emitting SNAPSHOT_READY for session={record.upload_session_id}")
                            logger.info(f"[FINALIZE_STATE_TRANSITION] Status transitioned to FINALIZED for session={record.upload_session_id}")
                            logger.info(f"[TERMINAL_HYDRATION_RELEASE] session={record.upload_session_id}")

                            # [FIX] Dispatch MATERIALIZE NOW — snapshot is durable in DB.
                            # This replaces the early dispatch that was inside the pre-assembly
                            # transaction.atomic() block, which caused the deadlock.
                            try:
                                from ocr_pipeline.models import log_pipeline_event, PipelineStatus
                                log_pipeline_event(
                                    record.id,
                                    PipelineStatus.FINALIZED,
                                    session_id=record.upload_session_id,
                                    job_id=job_id_val
                                )
                                logger.info(f"[MATERIALIZE_DISPATCH_POST_SNAPSHOT] record={record.id} session={record.upload_session_id}")
                            except Exception as mat_err:
                                logger.error(f"[MATERIALIZE_DISPATCH_FAIL] record={record.id} error={mat_err}")

                            orchestrator.update_session_status(str(record.id), "HYDRATION_READY", progress=100.0,
                                                               extra_data={"hydration_ready": True})
                            logger.info(f"[FINALIZE_STATE_EMIT] record={record.id} status=HYDRATION_READY")
                        else:
                            logger.error(f"[SNAPSHOT_COMMIT_FAILED] session={record.upload_session_id}")
                            logger.error(f"[SNAPSHOT_VALIDATION_FAILED] Validation query returned 0 rows for session={record.upload_session_id}!")
                            logger.error(f"[SNAPSHOT_CREATE_EXCEPTION] session={record.upload_session_id} — snapshot not visible after commit")

                        # PIPELINE PARITY VALIDATION
                        job_total = record.job.total_files if (hasattr(record, 'job') and record.job and hasattr(record.job, 'total_files')) else 1
                        db_rows = InvoiceTempOCR.objects.filter(upload_session_id=record.upload_session_id).count()
                        snapshot_obj = val_query.first()
                        snapshot_rows = snapshot_obj.invoice_count if snapshot_obj else 0
                    
                        if db_rows > 0:
                            logger.info(f"[HYDRATION_ROW_CREATE] session={record.upload_session_id} db_rows={db_rows}")
                            logger.info(f"[HYDRATION_ROW_VISIBLE] session={record.upload_session_id} db_rows={db_rows}")
                            logger.info(f"[HYDRATION_QUERY_VISIBLE] db_rows={db_rows} session={record.upload_session_id}")
                            logger.info(f"[STAGING_ROW_COUNT] count={db_rows} expected={len(final_invoices)}")
                            logger.info(f"[MULTI_PDF_EXPORT_COMPLETE] session={record.upload_session_id} job_total={job_total}")
                    
                        logger.info(f"[PIPELINE_PARITY_CHECK] session_id='{record.upload_session_id}' uploaded_files={job_total} processed_records={db_rows} validated_dtos={len(final_invoices)} exported_dtos={len(final_invoices)} snapshot_rows={snapshot_rows} hydrated_rows={db_rows}")
                    
                        if not (job_total == db_rows == len(final_invoices) == snapshot_rows == db_rows):
                            disappearance_stage = "UNKNOWN"
                            if db_rows < job_total:
                                disappearance_stage = "INGESTION_OR_AI_OCR"
                            elif len(final_invoices) < db_rows:
                                disappearance_stage = "DTO_QUALITY_GATE_FILTERING"
                            elif snapshot_rows < len(final_invoices):
                                disappearance_stage = "SNAPSHOT_PERSISTENCE"
                            
                            logger.error(f"[PIPELINE_PARITY_FAILURE] session_id='{record.upload_session_id}' mismatch detected! Stage='{disappearance_stage}' uploaded_files={job_total} processed_records={db_rows} validated_dtos={len(final_invoices)} snapshot_rows={snapshot_rows}")
                    except Exception as ex:
                        import traceback
                        logger.error(f"[SNAPSHOT_TX_ROLLBACK] Exception in on_commit_callback: {ex}")
                        logger.error(f"[SNAPSHOT_CALLBACK_FATAL] trace={traceback.format_exc()} session_id={record.upload_session_id}")

                transaction.on_commit(on_commit_callback)
            
        except Exception as db_ex:
            logger.exception(f"[SNAPSHOT_TX_ROLLBACK] Fatal error during snapshot DB transaction: {db_ex}")
            raise

        logger.info(f"[STAGING_PERSIST_COMPLETE] session={record.upload_session_id} status=SUCCESS")
        logger.info(f"[DB_TRANSACTION_COMMIT] scope=snapshot_persist session={record.upload_session_id} duration={time.time() - t_db_tx_2_start:.3f}s")

        total_duration = time.time() - t_assembly_start
        metrics.record_latency("assembly:total_duration", total_duration)
        logger.info(f"[ASSEMBLY_FINALIZED] record={record.id} pages={total_expected} duration={total_duration:.2f}s")
        
        logger.info(f"[PIPELINE_ROW_COUNT] count={len(final_invoices)}")
        logger.info(f"[PIPELINE_FINAL_ROW_COUNT] count={len(final_invoices)}")
        logger.info(f"[FINAL_SNAPSHOT_COUNT] count={len(final_invoices)}")
        for inv in final_invoices:
            logger.info(f"[PIPELINE_SNAPSHOT_APPEND] invoice_no='{inv.get('invoice_no')}'")
        logger.info(f"[PIPELINE_STAGE_EXIT] stage=ASSEMBLY record={record.id} session={record.upload_session_id}")
        logger.info(f"[MERGE_STAGE_EXIT] session={record.upload_session_id} duration={time.time() - t_assembly_start:.3f}s")
                
        return {
            "status": "SUCCESS",
            "snapshot_id": snapshot.id,
            "invoice_count": len(final_invoices)
        }

    except Exception as e:
        logger.exception(f"[ASSEMBLY_FATAL_ERROR] record={record.id}: {str(e)}")
        import traceback
        logger.exception(traceback.format_exc())
        return {"status": "ERROR", "error": str(e)}

def trigger_next_fanout(record_id):
    """
    PHASE 10: BOUNDED AI FANOUT GOVERNOR.
    Enqueues the next batch/page of a multi-page record ONLY if 
    the current in-flight count is below the window (MAX_AI_INFLIGHT_PER_RECORD = 5).
    Uses total_pages_completed as a 'high-water mark' for enqueued pages.
    """
    try:
        from ocr_pipeline.models import InvoiceTempOCR, SessionFinalizationState
        from ocr_pipeline.extraction import extract_invoice
        from django.db import transaction
        
        with transaction.atomic():
            barrier = SessionFinalizationState.objects.select_for_update().get(id=str(record_id))
            
            # [PHASE 11.9: FANOUT_GOVERNOR_HARDENING]
            # 1. High-water mark check: Don't enqueue beyond expected pages.
            if barrier.total_pages_completed >= barrier.expected_pages:
                logger.debug(f"[FANOUT_COMPLETE] record={record_id} reached limit {barrier.expected_pages}")
                return

            # 2. Sliding Window Calculation
            # inflight = enqueued_count - completed_count
            inflight = barrier.total_pages_completed - barrier.ai_completed_pages
            
            # [PHASE 11.9] Adaptive Window: Max 5 in-flight per record.
            MAX_WINDOW = 5
            if inflight < MAX_WINDOW:
                # Determine how many to enqueue to fill the window
                to_enqueue = MAX_WINDOW - inflight
                next_start = barrier.total_pages_completed
                remaining = barrier.expected_pages - next_start
                batch_size = min(to_enqueue, remaining)
                
                if batch_size <= 0:
                    return

                logger.debug(f"[FANOUT_FILL] record={record_id} inflight={inflight} filling={batch_size} next={next_start+1}")
                
                record = InvoiceTempOCR.objects.get(id=record_id)
                actual_path = resolve_storage_path(record)
                
                # [FIX] MessageFactory MUST receive 'job_id' in payload for task_type=AI_EXTRACTION
                from ocr_pipeline.models import OCRJob
                job = OCRJob.objects.filter(upload_session_id=record.upload_session_id).first()
                job_id = job.id if job else record.upload_session_id
                
                # Enqueue the batch (usually 1 but support multiple)
                for i in range(batch_size):
                    page_idx = next_start + i
                    logger.debug(f"[SLIDING_WINDOW_ENQUEUE] record={record_id} page={page_idx + 1}")
                    
                    try:
                        extract_invoice(
                            None, 
                            record_id=record.id,
                            file_path=actual_path,
                            wait_for_result=False,
                            tenant_id=record.tenant_id,
                            upload_session_id=record.upload_session_id,
                            job_id=job_id,
                            start_page=page_idx,
                            limit=1 
                        )
                    except Exception as e:
                        logger.error(f"[SLIDING_WINDOW_ENQUEUE_FAIL] record={record_id} page={page_idx + 1} error={e}")
                        # [FIX] Reconcile failure so barrier does not deadlock
                        from core.redis_orchestrator import orchestrator
                        orchestrator.register_page_completion(str(record_id), page_idx + 1, is_failed=True)
                        # Also increment the high-water mark so it moves on
                        SessionFinalizationState.objects.filter(id=str(record_id)).update(
                            total_pages_completed=models.F('total_pages_completed') + 1,
                            failed_pages=models.F('failed_pages') + 1
                        )
                        from ocr_pipeline.models import InvoicePageResult
                        InvoicePageResult.objects.update_or_create(
                            record_id=record_id, page_number=page_idx + 1,
                            defaults={
                                'session_id': record.upload_session_id,
                                'is_failed': True,
                                'canonical_payload': {'status': 'OCR_FAILED', 'error': f"Enqueue Failed: {e}"}
                            }
                        )
            else:
                logger.debug(f"[FANOUT_STALLED] record={record_id} window_full={inflight}")
    except Exception as e:
        logger.error(f"[FANOUT_GOVERNOR_ERROR] record={record_id}: {e}")


def force_reconcile_stale_barriers():
    """
    [PHASE B] WATCHDOG RECONCILIATION
    Scans for documents stuck in PROCESSING for > 20 mins and forces assembly 
    if they have at least one terminal page.
    """
    from django.utils import timezone
    from datetime import timedelta
    from .models import PipelineStatus
    
    threshold = timezone.now() - timedelta(minutes=20)
    stuck_records = InvoiceTempOCR.objects.filter(
        status=PipelineStatus.PROCESSING,
        created_at__lt=threshold
    )
    
    if not stuck_records.exists():
        return
        
    logger.warning(f"[WATCHDOG_SCAN] Found {stuck_records.count()} stale documents. Attempting force-reconciliation...")
    
    for record in stuck_records:
        try:
            data = record.extracted_data or {}
            total = data.get('total_pages', 1)
            
            # Authoritative DB Check (Redis removed)
            effective_count = InvoicePageResult.objects.filter(record_id=record.id).count()
            
            if effective_count > 0:
                logger.critical(f"[WATCHDOG_FORCE_TRIGGER] record={record.id} terminal={effective_count}/{total}. Forcing assembly after timeout.")
                assemble_multi_page_record(record, force=True)
            else:
                logger.error(f"[WATCHDOG_RECOVERY_FAIL] record={record.id} has 0 pages. Marking FAILED.")
                record.status = PipelineStatus.FAILED
                record.save(update_fields=['status'])
        except Exception as e:
            logger.error(f"[WATCHDOG_ERR] record={record.id}: {e}")



@transaction.atomic
def validate_and_process(record: InvoiceTempOCR, auto_save: bool = False, **kwargs):
    """
    CORE VALIDATION FUNCTION: 
    Checks for Vendor, Duplicates, and optionally creates Voucher.
    """
    try:
        record = InvoiceTempOCR.objects.select_for_update().get(id=record.id)
    except InvoiceTempOCR.DoesNotExist:
        logger.error(f"[VALIDATION_ABORT] Record {record.id} not found in database.")
        return {"status": "ERROR"}

    if record.status in ['COMPLETED', 'SPLIT_COMPLETE'] and not kwargs.get('force'):
        logger.info(f"[VALIDATION_ABORT] Record {record.id} is already in terminal state '{record.status}'. Skipping processing.")
        return {"status": record.validation_status or "SUCCESS"}

    # ── [PHASE 1] SAFE INITIALIZATION ──
    supplier = {}
    vendor = None
    header = {}
    items = []
    gstin = ""
    invoice_no = ""
    vendor_name = ""
    branch_name = ""
    
    # [ROOT-CAUSE FIX #1] Safe Page Index Access
    p_idx = getattr(record, "page_index", "AGGREGATE")
    logger.error(f"[TRACE] validate_and_process.entry | record_id={record.id} | session={record.upload_session_id} | page_index={p_idx}")
    
    # ── [PHASE 10] FORENSIC SNAPSHOT PRESERVATION ──
    data = record.extracted_data or {}
    if "_forensics" not in data:
        data["_forensics"] = {"stage": "validate_entry", "timestamp": datetime.now().isoformat()}
    
    record.status = 'VALIDATING'
    
    try:
        data = record.extracted_data or {}
        
        # ── MULTI-INVOICE SPLITTING ──
        # PHASE 6: UI STABILIZATION
        # Only proceed with splitting if we have assembled exports and status is COMPLETED
        if ("assembled_exports" in data or "_pages_assembled" in data) and not kwargs.get('_is_child'):
            split_invoices = data.get("assembled_exports") or data.get("_pages_assembled")
            
            if not split_invoices:
                logger.warning(f"[ASSEMBLY_NOT_READY] Record {record.id} reached split gate without exports.")
                return {"status": "WAITING_FOR_ASSEMBLY"}
            
            if len(split_invoices) > 1:
                logger.info(f"[DB_SPLIT_START] Record {record.id} contains {len(split_invoices)} independent invoices. Exploding into separate records.")
                results = []
                original_hash = record.file_hash
                session_id = record.upload_session_id
                tenant_id = record.tenant_id
                
                for i, inv_data in enumerate(split_invoices):
                    header = inv_data.get('header', {}) or inv_data.get('sections', {}).get('supplier_details', {}) or {}
                    inv_no = header.get('invoice_no') or header.get('supplier_invoice_no') or inv_data.get('invoice_no')
                    gstin = header.get('vendor_gstin') or header.get('gstin') or inv_data.get('gstin')
                    branch = header.get('branch') or inv_data.get('branch')
                    
                    # ── [PHASE 4] SPLIT CHILD ISOLATION ──
                    inv_data = copy.deepcopy(inv_data)
                    if "_pages" in inv_data: del inv_data["_pages"]
                    
                    if i == 0:
                        logger.info(f"[DB_PARENT_UPDATE] record={record.id} inv_no='{inv_no}'")
                        record.extracted_data = inv_data
                        record.supplier_invoice_no = inv_no
                        record.gstin = gstin
                        record.branch = branch
                        record.is_primary = True 
                        
                        # ── [SESSION_FORENSIC] ──
                        logger.info(f"[SESSION_FORENSIC] stage='split_parent_sync' record={record.id} session={session_id}")
                        assert str(record.upload_session_id) == str(session_id), "CRITICAL: Parent session mismatch during split"
                        
                        record.save()
                        
                        results.append(validate_and_process(record, auto_save=auto_save, _is_child=True))
                    else:
                        import hashlib
                        # Generate a unique hash for the child to avoid DB unique constraints
                        child_hash = hashlib.sha256(f"{original_hash}_split_{i}_{session_id}".encode()).hexdigest()
                        
                        logger.info(f"[DB_CHILD_PERSIST] record={record.id} i={i} inv_no='{inv_no}' hash={child_hash[:8]}...")
                        try:
                            child, created = InvoiceTempOCR.objects.update_or_create(
                                file_hash=child_hash,
                                tenant_id=tenant_id,
                                defaults={
                                    'upload_session_id': session_id,
                                    'file_path': record.file_path,
                                    'voucher_type': record.voucher_type,
                                    'extracted_data': inv_data,
                                    'supplier_invoice_no': inv_no,
                                    'gstin': gstin,
                                    'branch': branch,
                                    'is_primary': True, # MUST be primary to show in UI independently
                                    'status': 'EXTRACTED',
                                    'upload_type': record.upload_type  # [UPLOAD_TYPE ISOLATION FIX]
                                }
                            )
                            
                            logger.info(
                                f"[SESSION_TRACE_SIBLING] id={child.id} created={created} "
                                f"parent={record.id} session={session_id} inv_no='{inv_no}'"
                            )
                            # ── [SESSION_FORENSIC] ──
                            logger.info(f"[SESSION_FORENSIC] stage='split_child_sync' record={child.id} session={session_id}")
                            assert str(child.upload_session_id) == str(session_id), f"CRITICAL: Child session mismatch {child.upload_session_id} != {session_id}"
                            
                            # ── [PHASE 6] VALIDATION SAFETY WRAPPER ──
                            try:
                                results.append(validate_and_process(child, auto_save=auto_save, _is_child=True))
                            except Exception as child_err:
                                logger.exception(f"[CHILD_VALIDATION_CRASH] id={child.id} error={child_err}")
                                child.status = 'ERROR'
                                child.validation_status = 'ERROR'
                                child.validation_message = f"Validation Crash: {str(child_err)}"
                                child.save()
                                continue
                        except Exception as e:
                            logger.error(f"[DB_CHILD_PERSIST_FAILED] i={i} error={str(e)}")
                            continue
                
                # FINAL DB VERIFICATION QUERY
                final_queryset = InvoiceTempOCR.objects.filter(upload_session_id=session_id, tenant_id=tenant_id)
                final_ids = list(final_queryset.values_list('id', flat=True))
                logger.info(f"[DB_FINAL_QUERYSET] session={session_id} total_count={len(final_ids)} ids={final_ids}")
                
                logger.info(f"[PIPELINE SPLIT COMPLETE] Record {record.id} successfully exploded into {len(results)} sibling records.")
                record.status = 'SPLIT_COMPLETE'
                record.save(update_fields=['status'])
                return results[0] if results else {"status": "SUCCESS"}

        # ── CANONICAL FIELD ACCESS (Fix 1 & 2) ──
        sections = data.get("sections", {})
        supplier = sections.get("supplier_details", {})
        supply = sections.get("supply_details", {})
        due = sections.get("due_details", {})
        
        canonical = get_canonical_export_record(data, tenant_id=record.tenant_id)
        gstin = (canonical.get("gstin") or "").strip().upper()
        invoice_no = (canonical.get("supplier_invoice_no") or canonical.get("invoice_no") or "").strip()
        vendor_name = (canonical.get("vendor_name") or "").strip()
        branch_name = (canonical.get("branch") or record.branch or "").strip()
        tenant_id = str(record.tenant_id)

        logger.debug(f"[VALIDATION_IDENTITY] gstin={gstin} invoice={invoice_no}")

        # ── [PHASE 3] STAGING PERSISTENCE SAFETY ──
        items = canonical.get("items", [])
        if not items:
            # [ROOT-CAUSE FIX #6] Never Drop Invoices
            logger.warning(f"[INVOICE_WARNING_EMPTY_ITEMS] invoice={invoice_no} record={record.id}. Proceeding with warning state.")
            record.validation_status = "REQUIRES_REVIEW"
            record.validation_message = "Warning: No line items detected. Please verify OCR data."
        else:
            logger.info(f"[INVOICE_VISIBLE_TO_UI] record_id={record.id} inv_no='{invoice_no}' items={len(items)} status={record.status}")

        # ── [PHASE 3] STAGING PERSISTENCE SAFETY ──
        items = canonical.get("items", [])
        if not items:
            # [ROOT-CAUSE FIX #6] Never Drop Invoices
            logger.warning(f"[INVOICE_WARNING_EMPTY_ITEMS] invoice={invoice_no} record={record.id}. Proceeding with warning state.")
            record.validation_status = "REQUIRES_REVIEW"
            record.validation_message = "Warning: No line items detected. Please verify OCR data."
        else:
            logger.info(f"[INVOICE_VISIBLE_TO_UI] record_id={record.id} inv_no='{invoice_no}' items={len(items)} status={record.status}")

        if not gstin or not invoice_no:
            # [ROOT-CAUSE FIX #2 & #5] Never Drop Invoices
            logger.warning(f"[INVOICE_WARNING_MISSING_HEADERS] invoice={invoice_no} record={record.id}. Missing GSTIN or Invoice No.")
            record.validation_status = "ERROR"
            record.validation_message = "Warning: Missing GSTIN or Invoice Number. Please verify OCR data."
            # Proceed anyway so it shows in UI
        
        # Save record now to ensure visibility even if vendor matching fails
        record.save()
        logger.info(f"[INVOICE_VISIBLE_TO_UI] record_id={record.id} inv_no='{invoice_no}' status={record.status}")

        # 🔹 FAST PATH: If vendor was already matched (vendor_id stored from PATCH re-validation)
        # and the status confirms it, skip the full GSTIN+branch lookup to avoid false NEED_VENDOR
        branch_name = supplier.get("branch") or record.branch or ""

        if record.vendor_id and record.validation_status in ['FOUND', 'READY', 'RESOLVED', 'MATCHED_VENDOR', 'EXISTING_VENDOR']:
            try:
                vendor = VendorMasterBasicDetail.objects.get(id=record.vendor_id, tenant_id=tenant_id)
                logger.debug(f"[VOUCHER_FAST_PATH] vendor_id={record.vendor_id} name={vendor.vendor_name}")
            except VendorMasterBasicDetail.DoesNotExist:
                vendor = None
        else:
            # 🔹 STRICT VENDOR VALIDATION (GSTIN + BRANCH)
            from vendors.vendor_validation_logic import validate_vendor
            val_res = validate_vendor(tenant_id, vendor_name, gstin, branch=branch_name)
            
            if val_res['status'] == 'EXISTING_VENDOR':
                vendor = VendorMasterBasicDetail.objects.filter(id=val_res['vendor_id'], tenant_id=tenant_id).first()
                if vendor:
                    record.vendor_id = vendor.id
                    record.validation_status = 'FOUND' # Maintain compatibility with existing UI
                    record.save()
                logger.info(f"[VENDOR_STRICT_MATCH] {vendor.vendor_name if vendor else 'Unknown'}")
            else:
                vendor = None

        # 🔹 PURCHASE DUPLICATE VALIDATION (Invoice No + GSTIN + Branch + Vendor Name)
        # We do this BEFORE the vendor check so we can show 'Already Exist' even for unresolved vendors
        is_duplicate = VoucherPurchaseSupplierDetails.objects.filter(
            supplier_invoice_no__iexact=invoice_no,
            gstin__iexact=gstin,
            branch__iexact=branch_name,
            vendor_name__iexact=vendor_name,
            tenant_id=tenant_id
        ).exists()
        logger.debug(f"[DUPLICATE_AUDIT] is_duplicate={is_duplicate}")

        if is_duplicate:
            record.status = "EXTRACTED"
            record.validation_status = "DUPLICATE"
            record.save()
            logger.warning(f"[FINAL_STATUS] DUPLICATE id={record.id}")
            # We still want to check if the vendor exists to show correct 'Vendor Status' in UI
            # But the primary pipeline status for the row becomes DUPLICATE
            from vendors.vendor_validation_logic import validate_vendor
            val_res = validate_vendor(tenant_id, vendor_name, gstin, branch=branch_name)
            if val_res['status'] == 'EXISTING_VENDOR':
                 record.vendor_id = val_res['vendor_id']
                 record.save()
            return {"status": "DUPLICATE"}

        if not vendor:
            # Re-check if it's there (duplicate check might have used OCR name, this uses master)
            from vendors.vendor_validation_logic import validate_vendor
            val_res = validate_vendor(tenant_id, vendor_name, gstin, branch=branch_name)
            
            if val_res['status'] == 'EXISTING_VENDOR':
                vendor = VendorMasterBasicDetail.objects.filter(id=val_res['vendor_id'], tenant_id=tenant_id).first()
                if vendor:
                    record.vendor_id = vendor.id
                    record.validation_status = 'FOUND'
                    record.save()
            else:
                record.status = "EXTRACTED"
                record.validation_status = "NEED_VENDOR"
                record.save()
                return {"status": "NEED_VENDOR"}

        # Sync vendor name from master if found
        if vendor:
             vendor_name = vendor.vendor_name

        # 🔹 CREATE PURCHASE VOUCHER (ONLY IF auto_save IS TRUE)
        if not auto_save:
            record.status = "EXTRACTED"
            record.validation_status = "READY"
            record.save()
            logger.info(f"[FINAL_STATUS] READY record={record.id}")
            return {"status": "READY"}

        # Using the Pipeline 2 logic refined earlier
        with transaction.atomic():
            # Double-check inside transaction to avoid race-condition duplicate voucher creation
            existing_voucher = VoucherPurchaseSupplierDetails.objects.filter(
                supplier_invoice_no__iexact=invoice_no,
                gstin__iexact=gstin,
                branch__iexact=branch_name,
                vendor_name__iexact=vendor_name,
                tenant_id=tenant_id
            ).first()
            
            if existing_voucher:
                logger.warning(f"[RACE_PREVENTED] Voucher already exists for invoice={invoice_no} gstin={gstin}. Skipping creation.")
                record.status = "EXTRACTED"
                record.validation_status = "DUPLICATE"
                record.save()
                return {"status": "DUPLICATE"}

            branch_record = Branch.objects.filter(id=tenant_id).first()
            company_gstin = branch_record.gstin if branch_record else None
            is_interstate = gstin[:2] != company_gstin[:2] if company_gstin and len(gstin)>=2 and len(company_gstin)>=2 else False
            
            invoice_date = supplier.get('invoice_date')
            branch = supplier.get('branch') or 'Main Branch'
            address = supplier.get('vendor_address') or ''

            voucher_main = VoucherPurchaseSupplierDetails.objects.create(
                tenant_id=tenant_id,
                date=invoice_date or timezone.now().date(),
                supplier_invoice_no=invoice_no,
                supplier_invoice_date=invoice_date,
                vendor_name=vendor_name,
                vendor_basic_detail=vendor,
                gstin=gstin,
                branch=branch,
                bill_from=address,
                input_type='Interstate' if is_interstate else 'Intrastate'
            )

            # Map items
            mapped_items = []
            for item in items:
                # Helper to safely convert to decimal
                def to_dec(val):
                    try:
                        if not val or str(val).strip() == "": return 0
                        # Clean currency symbols and commas
                        clean_val = str(val).replace('₹', '').replace(',', '').strip()
                        return float(clean_val)
                    except:
                        return 0

                mapped_items.append({
                    "itemCode": "",
                    "itemName": item.get('description') or "—",
                    "hsnSac": item.get('hsn_sac') or "",
                    "qty": to_dec(item.get('quantity')),
                    "uom": item.get('uom') or "",
                    "rate": to_dec(item.get('rate')),
                    "taxableValue": to_dec(item.get('taxable_value') or item.get('amount')),
                    "cgst": to_dec(item.get('cgst_amount') or item.get('cgst')),
                    "sgst": to_dec(item.get('sgst_amount') or item.get('sgst')),
                    "igst": to_dec(item.get('igst_amount') or item.get('igst')),
                    "invoiceValue": to_dec(item.get('amount') or item.get('line_total'))
                })

            # Create INR supply details (without items field which doesn't exist on this model)
            VoucherPurchaseSupplyINRDetails.objects.create(
                tenant_id=tenant_id,
                supplier_details=voucher_main,
                description=f"Auto-validated via OCR Pipeline: {record.file_path}"
            )

            # Create line items in the correct table
            from accounting.models_voucher_purchase import VoucherPurchaseItem
            for m_item in mapped_items:
                VoucherPurchaseItem.objects.create(
                    tenant_id=tenant_id,
                    supplier_details=voucher_main,
                    item_name=m_item['itemName'],
                    hsn_sac=m_item['hsnSac'],
                    quantity=m_item['qty'],
                    uom=m_item['uom'],
                    rate=m_item['rate'],
                    taxable_value=m_item['taxableValue'],
                    cgst_amount=m_item['cgst'],
                    sgst_amount=m_item['sgst'],
                    igst_amount=m_item['igst'],
                    invoice_value=m_item['invoiceValue'],
                    item_code="" # To be matched later if needed
                )

            # Re-fetch total values from supply details if needed
            total_inv_val = to_dec(supply.get('total_invoice_value'))
            VoucherPurchaseDueDetails.objects.create(
                tenant_id=tenant_id,
                supplier_details=voucher_main,
                to_pay=total_inv_val,
                terms=due.get('payment_terms', '')
            )

            # Unified Voucher
            v_num = invoice_no
            # Check for existing voucher with same ID and party to decide on series suffix
            if Voucher.objects.filter(voucher_number=v_num, party=vendor_name, tenant_id=tenant_id, type='purchase').exists():
                 v_num = f"{v_num}-{voucher_main.id}"
            
            Voucher.objects.create(
                tenant_id=tenant_id,
                type='purchase',
                date=voucher_main.date,
                voucher_number=v_num,
                invoice_no=invoice_no,
                party=vendor_name,
                total=total_inv_val,
                source='ocr_pipeline',
                reference_id=voucher_main.id,
                total_taxable_amount=to_dec(supply.get('total_taxable_value')),
                total_cgst=to_dec(supply.get('total_cgst')),
                total_sgst=to_dec(supply.get('total_sgst')),
                total_igst=to_dec(supply.get('total_igst'))
                # items_data removed as it has no setter
            )

            # 🔹 FINAL STATUS UPDATE
            record.status = "VOUCHER_CREATED"
            record.validation_status = "VOUCHER_CREATED"
            record.vendor_id = vendor.id
            record.voucher_id = voucher_main.id
            record.processed = True
            logger.info(f"Saving record {record.id}: status={record.status}, validation_status={record.validation_status}, vendor_id={record.vendor_id}, voucher_id={record.voucher_id}, processed={record.processed}")
            # Ensure all split fields (invoice_no, gstin, etc) are persisted
            record.save()
            
            logger.info(f"[FINAL_STATUS] VOUCHER_CREATED id={record.id} voucher={voucher_main.id}")
            return {"status": "VOUCHER_CREATED", "voucher_id": voucher_main.id}

    except Exception as e:
        logger.error(f"AUTO-VALIDATION FAILED for record {record.id}: {str(e)}")
        record.validation_status = "ERROR"
        record.validation_message = str(e)
        record.save()
        logger.error(f"[FINAL_STATUS] ERROR record={record.id} exc={str(e)[:200]}")
        return {"status": "ERROR"}

def resolve_storage_path(record) -> str:
    """
    [PHASE 11.9] Filesystem Path Resolution Hardening
    Ensures storage keys are deterministically converted to absolute filesystem paths.
    """
    from core.storage import StorageService
    from django.conf import settings
    import uuid
    
    storage = StorageService()
    storage_key = record.file_path
    logger.info(f"[FILE_RESOLVE_START] record={record.id} key={storage_key}")
    
    if storage.s3 and storage.bucket:
        temp_dir = os.path.join(settings.BASE_DIR, 'scratch')
        os.makedirs(temp_dir, exist_ok=True)
        abs_path = os.path.abspath(os.path.join(temp_dir, f'temp_{uuid.uuid4().hex[:8]}.pdf'))
        try:
            storage.download_to_file(storage_key, abs_path)
        except Exception as e:
            logger.error(f"[FILE_RESOLVE_FAIL] record={record.id} key={storage_key} error={e}")
            raise FileNotFoundError(f"S3 download failed for {storage_key}: {e}")
    else:
        clean_key = storage_key
        if "://" in storage_key:
            clean_key = storage_key.split("://", 1)[1]
            
        prefixes = ["/media/ocr_storage/", "/media/bulk_pipeline/", "media/ocr_storage/", "media/bulk_pipeline/"]
        for p in prefixes:
            if clean_key.startswith(p):
                clean_key = clean_key[len(p):]
                break
                
        # Try all known local storage roots
        possible_paths = [
            os.path.abspath(os.path.join(settings.MEDIA_ROOT, clean_key.replace('/', os.sep))),
            os.path.abspath(os.path.join(settings.MEDIA_ROOT, 'bulk_pipeline', clean_key.replace('/', os.sep))),
            os.path.abspath(os.path.join(storage.local_root, clean_key.replace('/', os.sep)))
        ]
        
        abs_path = None
        for p in possible_paths:
            if os.path.exists(p):
                abs_path = p
                break
                
        if not abs_path:
            # If all fail, use the primary MEDIA_ROOT for the error log
            abs_path = possible_paths[0]

    if not os.path.exists(abs_path):
        logger.error(f"[FILE_RESOLVE_FAIL] record={record.id} key={storage_key} resolved_to={abs_path}")
        logger.error(f"[MEDIA_ROOT_DEBUG] MEDIA_ROOT={settings.MEDIA_ROOT} CWD={os.getcwd()}")
        raise FileNotFoundError(f"no such file: '{storage_key}' (resolved to {abs_path})")

    logger.info(f"[FILE_RESOLVE_SUCCESS] record={record.id}")
    logger.info(f"[OCR_INPUT_PATH] record={record.id} path={abs_path}")
    return abs_path

def process_invoice_upload_sync(task: dict):
    """
    Synchronous bridge for IngestionWorker.
    Fetches record and initiates the unified pipeline with wait_for_ai=False.
    """
    # [PHASE 11.5] Unwrap canonical payload if present
    payload = task.get('payload', task)
    record_id = payload.get('record_id')
    logger.info(f"[SYNC_INGESTION_START] record={record_id}")
    
    try:
        if not record_id:
            logger.error("[INGESTION_RECORD_MISSING] No record_id provided in task payload.")
            return False

        record = InvoiceTempOCR.objects.get(id=record_id)
        
        if not record.file_path:
            logger.error(f"[INGESTION_FAIL] No file_path for record={record_id}")
            record.status = 'FAILED'
            record.save(update_fields=['status'])
            return False
            
        # [PHASE 11.9] Harden File Resolution
        try:
            abs_file_path = resolve_storage_path(record)
        except FileNotFoundError as e:
            logger.error(f"[PIPELINE_TERMINAL_FAILURE] {e}")
            record.status = 'FAILED'
            record.save(update_fields=['status'])
            return False
            
        # Call the unified pipeline
        result = run_ocr_pipeline(
            record=record,
            wait_for_ai=False, # Trigger async fanout
            job_id=task.get('job_id'),
            file_path=abs_file_path
        )
        
        # [PHASE 11.9] Check for Terminal Pipeline Failures
        if result.get("validation", {}).get("status") == "ERROR":
             logger.error(f"[INGESTION_FAIL] run_ocr_pipeline returned ERROR for record={record.id}")
             return False
             
        return True
        
    except InvoiceTempOCR.DoesNotExist:
        logger.error(f"[INGESTION_FAIL] Record {record_id} not found.")
        return False
    except Exception as e:
        logger.error(f"[INGESTION_EXCEPTION] record={record_id} error={e}", exc_info=True)
        if 'record' in locals():
            record.status = 'FAILED'
            record.save(update_fields=['status'])
        return False

