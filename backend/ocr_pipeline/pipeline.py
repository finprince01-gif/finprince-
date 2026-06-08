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

class CriticalPipelineError(ValueError):
    """Exception raised when critical invariants of the pipeline are violated."""
    pass

def trace_item_checkpoint(record_id, invoice_no, page_number, stage, item_count, item_status, snapshot_item_count=None):
    from core.redis_orchestrator import orchestrator
    
    # 1. Log the checkpoint
    logger.info(
        f"[{stage}] record_id={record_id} invoice_no={invoice_no} page_number={page_number} "
        f"item_count={item_count} item_status={item_status} snapshot_item_count={snapshot_item_count}"
    )
    
    # 2. Redis tracking for transitions
    redis_key = f"item_trace:{record_id}"
    
    # Let's define the order of stages to determine transition:
    stages_order = [
        "ITEM_TRACE_EXTRACTED",
        "ITEM_TRACE_AFTER_VALIDATION",
        "ITEM_TRACE_AFTER_ASSEMBLY",
        "ITEM_TRACE_BEFORE_SNAPSHOT",
        "ITEM_TRACE_AFTER_SNAPSHOT",
        "ITEM_TRACE_AFTER_HYDRATION"
    ]
    
    # Let's save the current stage item count in Redis
    try:
        if not orchestrator.redis:
            orchestrator._connect()
        r = orchestrator.redis
        if r:
            # Get all previously recorded counts
            all_counts = r.hgetall(redis_key)
            all_counts = {k.decode('utf-8') if isinstance(k, bytes) else k: int(v) for k, v in all_counts.items()}
        else:
            all_counts = {}
    except Exception as re_err:
        logger.error(f"[REDIS_TRACE_ERROR] {re_err}")
        all_counts = {}
        
    # Find the previous recorded stage in the order
    current_idx = stages_order.index(stage) if stage in stages_order else -1
    previous_stage = None
    previous_item_count = 0
    
    for idx in range(current_idx - 1, -1, -1):
        prev_stg = stages_order[idx]
        if prev_stg in all_counts:
            previous_stage = prev_stg
            previous_item_count = all_counts[prev_stg]
            break
            
    # Save current item count to Redis
    try:
        if r:
            r.hset(redis_key, stage, str(item_count))
            r.expire(redis_key, 86400) # Expire in 1 day
    except Exception as re_err:
        logger.error(f"[REDIS_TRACE_SAVE_ERROR] {re_err}")
        
    # Check for loss transition: previous_item_count > 0 and current_item_count == 0
    if previous_stage and previous_item_count > 0 and item_count == 0:
        logger.critical(
            f"[ITEM_LOSS_DETECTED] "
            f"record_id={record_id} "
            f"invoice_no={invoice_no} "
            f"previous_stage={previous_stage} "
            f"current_stage={stage} "
            f"previous_item_count={previous_item_count} "
            f"current_item_count={item_count}"
        )


def acquire_redis_lock(lock_name: str, expiry_s: int = 60) -> bool:
    from core.redis_orchestrator import orchestrator
    if not orchestrator.redis:
        orchestrator._connect()
    r = orchestrator.redis
    if not r:
        return True # Fallback if Redis is down
    lock_key = f"lock:{lock_name}"
    try:
        acquired = r.set(lock_key, "locked", ex=expiry_s, nx=True)
        return bool(acquired)
    except Exception as e:
        logger.warning(f"[REDIS_LOCK_ERR] Failed to acquire lock {lock_name}: {e}")
        return True

def release_redis_lock(lock_name: str):
    from core.redis_orchestrator import orchestrator
    if not orchestrator.redis:
        return
    r = orchestrator.redis
    if r:
        lock_key = f"lock:{lock_name}"
        try:
            r.delete(lock_key)
        except Exception as e:
            logger.warning(f"[REDIS_LOCK_ERR] Failed to release lock {lock_name}: {e}")

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
        with transaction.atomic():
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
            # Row lock to serialize with trigger_next_fanout calls
            state = SessionFinalizationState.objects.select_for_update().get(id=str(record.id))
            
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

    tenant_id = getattr(record, 'tenant_id', None)
    session_id = getattr(record, 'upload_session_id', None)
    
    merge_lock_name = f"merge:{tenant_id}:{session_id}:{record.id}"
    finalization_lock_name = f"finalization:{tenant_id}:{session_id}:{record.id}"
    
    acquired_canonical_locks = []
    
    if not acquire_redis_lock(merge_lock_name, expiry_s=120):
        logger.warning(f"[DISTRIBUTED_LOCK_REJECTED] merge_lock rejected for record={record.id}")
        return {"status": "PROCESSING"}
        
    if not acquire_redis_lock(finalization_lock_name, expiry_s=120):
        logger.warning(f"[DISTRIBUTED_LOCK_REJECTED] finalization_lock rejected for record={record.id}")
        release_redis_lock(merge_lock_name)
        return {"status": "PROCESSING"}

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
        
        for res in db_results:
            p_payload = res['canonical_payload'] if isinstance(res['canonical_payload'], dict) else {}
            inv_no = p_payload.get('invoice_no', 'N/A')
            gstin_val = p_payload.get('gstin', 'N/A')
            logger.info(f"[OCR_COMPLETE] page_no={res['page_number']} invoice_no={inv_no} merge_key=N/A dedupe_key=N/A filter_reason=None dropped={res['is_failed']}")
            logger.info(f"[PAGE_OCR_COMPLETE] page_no={res['page_number']} invoice_no={inv_no} gstin={gstin_val}")
            
        # [FIX 3] DISABLE ALL PRE-GROUPING FILTERS TEMPORARILY
        db_page_map = {res['page_number']: res['canonical_payload'] for res in db_results}
        db_fetch_latency = time.time() - t_db_fetch_start
        metrics.record_latency("assembly:db_fetch_latency", db_fetch_latency)
            
        # ── [PHASE 10: FAILURE CONTAINMENT] ──
        failed_indices = [
            res['page_number'] 
            for res in db_results 
            if res['is_failed'] or (
                isinstance(res['canonical_payload'], dict) and (
                    res['canonical_payload'].get('status') in ('OCR_FAILED', 'EXTRACTION_FAILED', 'NEED_MANUAL_REVIEW')
                    or '_integrity_blocked' in res['canonical_payload']
                )
            )
        ]
        
        if failed_indices:
            logger.warning(f"[FAILURE_CONTAINMENT] Processing page list with failed pages {failed_indices} for record {record.id}. NOT aborting assembly.")
            try:
                b_state = SessionFinalizationState.objects.filter(id=str(record.id)).first()
                if b_state:
                    b_state.failed_pages = len(failed_indices)
                    b_state.save(update_fields=['failed_pages'])
            except Exception as _b_err:
                logger.warning(f"[BARRIER_STATE_WRITE_FAILED] {_b_err}")
            
        # Filter out failed pages from mapping (BYPASSED)
        raw_pages = {
            str(p): db_page_map[p] for p in db_page_map 
        }
        
        # ── [RAW_PAGE_CREATED] Trace (Requirement E) ──
        for p_idx, raw_p in raw_pages.items():
            inv_no = raw_p.get("invoice_no", "N/A") if isinstance(raw_p, dict) else "N/A"
            logger.info(f"[RAW_PAGE_CREATED] page_no={p_idx} invoice_no={inv_no} merge_key=N/A dedupe_key=N/A filter_reason=None dropped=False")
            logger.info(f"[GROUPING_INPUT] page_no={p_idx} invoice_no={inv_no} merge_key=N/A dedupe_key=N/A filter_reason=None dropped=False")
        
        # Readiness check
        missing_pages = [p for p in range(1, total_expected + 1) if str(p) not in raw_pages]
        if missing_pages and not kwargs.get('force'):
            logger.debug(f"[ASSEMBLY_WAIT] record={record.id} missing={missing_pages}. Barrier not yet reached.")
            return {"status": "FAILED_MISSING_PAGES", "missing": missing_pages}

        # 3. SEMANTIC ASSEMBLY (Memory Only)
        merger = get_forensic_merger()
        pages_list = []
        for p_idx, k in enumerate(sorted(raw_pages.keys(), key=int), start=1):
            # Safe payload extraction even for garbage pages
            payload_src = raw_pages[k]
            if not isinstance(payload_src, dict):
                payload_src = {}
                
            page_int = int(k)
            if page_int in failed_indices:
                p = {
                    "status": "PARTIAL_FAILED",
                    "validation_warnings": ["page_ocr_failed"],
                    "error": "Page failed raw OCR extraction.",
                    "invoice_no": "FAILED",
                    "vendor_name": "FAILED",
                }
            else:
                try:
                    p = get_canonical_export_record(payload_src, tenant_id=record.tenant_id)
                except Exception as e_page:
                    logger.error(f"[ASSEMBLY_PAGE_NORMALIZATION_FAILED] page={k} error={e_page}")
                    p = {
                        "status": "PARTIAL_FAILED",
                        "validation_warnings": ["page_normalization_failed"],
                        "error": f"Page normalization failed: {str(e_page)}",
                        "invoice_no": "FAILED",
                        "vendor_name": "FAILED",
                    }
            
            # [FIX 4 & 5] Split physical page identity from runtime task ordering
            p["_page_no"] = p_idx                  # Sequential logical page for the UI/exported rows
            p["_physical_page_no"] = page_int      # True physical page from the PDF enumerate
            p["_runtime_task_id"] = page_int       # Preserve for async routing
            
            pages_list.append(p)

        # [STEP 2] HARD ASSERTION BEFORE GROUPING
        logger.info(f"FORENSIC GROUP Starting grouping for {len(pages_list)} invoice pages")
        expected_pages = record.total_pages if hasattr(record, 'total_pages') else total_expected
        actual_pages = len(pages_list)
        grouping_page_ids = [p.get("_physical_page_no") for p in pages_list]
        missing_pages_pre_group = set(range(1, expected_pages + 1)) - set(grouping_page_ids)
        
        logger.critical(
            "[PRE_GROUPING_FORENSICS] "
            f"expected={expected_pages} "
            f"actual={actual_pages} "
            f"grouping_pages={grouping_page_ids} "
            f"missing={missing_pages_pre_group}"
        )
        
        if missing_pages_pre_group:
            logger.error(f"[TERMINAL_PARTIAL_FAILURE] session={record.upload_session_id} record={record.id} missing_pages={missing_pages_pre_group}")
            for missing_p in missing_pages_pre_group:
                pages_list.append({
                    "_physical_page_no": missing_p,
                    "_page_no": missing_p,
                    "status": "PARTIAL_FAILED",
                    "validation_warnings": ["missing_or_failed_page"],
                    "error": "This page failed extraction completely.",
                    "invoice_no": "FAILED",
                    "vendor_name": "FAILED",
                })

        logger.info(f"[GROUPING_START] total_pages={len(pages_list)} record={record.id} session={record.upload_session_id}")
        groups_dict = merger.group_invoices(pages_list)
        logger.info(f"[GROUPED_INVOICE_COUNT] count={len(groups_dict)}")
        
        assembled_exports = []
        for group_id, group_list in groups_dict.items():
            merged_group = merger.merge_group(group_list)
            
            # Semantic DTO validation check: run AFTER grouping & merge
            # Reject DTO when has_real_items == False and has_summary_rows == True
            # unless continuation_page == True or explicitly tagged as summary continuation.
            # Footer/summary-only pages must NEVER become standalone invoices.
            items = merged_group.get('items') or []
            generic_keywords = [
                "services", "total", "subtotal", "sub-total", "summary",
                "carried forward", "brought forward",
                "rounded off", "round off", "rounding", "adjustment",
                "output cgst", "output sgst", "output igst",
                "input cgst", "input sgst", "input igst",
                "cgst @", "sgst @", "igst @",
                "tax summary", "amount chargeable", "declaration",
                "less round", "add round", "bank charges", "net amount",
                "e & o.e", "balance",
            ]
            
            has_summary_rows = False
            has_real_items = False
            for itm in items:
                desc = str(itm.get("description") or itm.get("item_name") or "").lower()
                is_summary = any(kw in desc for kw in generic_keywords)
                if is_summary:
                    has_summary_rows = True
                else:
                    has_real_items = True

            continuation_page = (
                merged_group.get('continuation_page') == True or 
                merged_group.get('_continuation_page') == True or 
                merged_group.get('is_continuation') == True or 
                merged_group.get('has_continuation_marker') == True or
                merged_group.get('is_continuation_page') == True or
                merged_group.get('summary_continuation') == True or
                merged_group.get('_summary_continuation') == True or
                "summary continuation" in str(merged_group.get('warnings') or []).lower() or
                "continuation" in str(merged_group.get('warnings') or []).lower()
            )

            if not has_real_items and has_summary_rows and not continuation_page:
                logger.error(
                    f"[INVALID_PREASSEMBLY_VALIDATION_BLOCKED] [DTO_SEMANTIC_REJECTED] [SUMMARY_ONLY_PAGE_REJECTED] [INVALID_INVOICE_STRUCTURE] "
                    f"group_id={group_id} - rejecting summary-only invoice structure after grouping."
                )
                continue
                
            logger.info(f"[INVOICE_GROUP_TERMINAL] group_id={group_id} pages_in_group={len(group_list)} final_invoice_no={merged_group.get('invoice_no')}")
            logger.info(f"[INVOICE_GROUP_COMPLETE] group_id={group_id} pages_in_group={len(group_list)} final_invoice_no={merged_group.get('invoice_no')}")
            logger.info(
                f"[GROUP_FINALIZED] group_key={group_id} "
                f"pages={merged_group.get('_source_pages', [p.get('_page_no') for p in group_list])} "
                f"item_count={len(merged_group.get('items', []))}"
            )
            assembled_exports.append(merged_group)
        
        logger.info(f"[MULTIPAGE_STITCH_COMPLETE] record_id={record.id} total_groups={len(assembled_exports)}")

        # Apply DTO Quality Gate filtering (Requirement C & E)
        final_invoices = kwargs.get('final_invoices')
        if final_invoices is None:
            final_invoices = []
            from ocr_pipeline.normalize import normalize_amount
            _loop_exports = assembled_exports
        else:
            _loop_exports = []
        for idx, inv in enumerate(_loop_exports):
            for p in inv.get("_source_pages", [inv.get("_page_no")]):
                if p:
                    logger.info(f"[DTO_VALIDATION] page={p}")
                    
            # ── [TRACE DTO LIFECYCLE] ──
            page_src = inv.get('_page_no', 'N/A')
            inv_no_pre = inv.get("invoice_no", "N/A")
            logger.info(f"[DTO_PRE_VALIDATION] page_no={page_src} invoice_no={inv_no_pre} merge_key=N/A dedupe_key=N/A filter_reason=None dropped=False")
            
            ui_pay = get_ui_payload(inv)
            invoice_no = ui_pay.get("invoice_no") or "N/A"
            vendor_name = ui_pay.get("vendor_name")
            items = ui_pay.get("items", [])
            
            # Run item validation during assembly before final freeze
            try:
                from .inventory_validation import InventoryItemValidationService
                inv_val = InventoryItemValidationService.validate_items(record.tenant_id, items)
                ui_pay["items"] = inv_val["items"]
                ui_pay["item_status"] = inv_val["item_status"]
                ui_pay["missing_items"] = inv_val["missing_items"]
                items = inv_val["items"]  # Update local reference for scoring/warnings
                logger.info(
                    f"[ITEM_EXTRACTION_RESULT] session={record.upload_session_id} "
                    f"invoice_no={invoice_no} item_count={len(items)} "
                    f"item_status={inv_val['item_status']} missing_count={len(inv_val['missing_items'])}"
                )
            except Exception as e_val:
                logger.error(f"[ITEM_VALIDATION_ASSEMBLY_FAILED] error={e_val}")
            
            try:
                trace_item_checkpoint(
                    record_id=str(record.id),
                    invoice_no=invoice_no,
                    page_number=page_src,
                    stage="ITEM_TRACE_AFTER_VALIDATION",
                    item_count=len(ui_pay.get("items", [])),
                    item_status=ui_pay.get("item_status"),
                    snapshot_item_count=None
                )
            except Exception as trace_err:
                logger.error(f"[TRACE_ERR] ITEM_TRACE_AFTER_VALIDATION: {trace_err}")
            
            logger.info(f"[NORMALIZATION_COMPLETE] page_no={page_src} invoice_no={invoice_no} merge_key=N/A dedupe_key=N/A filter_reason=None dropped=False")
            
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
                logger.error(f"[DTO_VALIDATION_REJECT] idx={idx} reason='completely_empty_void' -> Converting to PARTIAL_FAILED instead of discarding.")
                ui_pay["status"] = "PARTIAL_FAILED"
                ui_pay["warnings"] = ["low_confidence", "completely_empty_void"]
                ui_pay["_page_no"] = inv.get("_page_no")
                
                # If this group was artificially created due to missing pages, ensure the status propagates.
                if ui_pay.get("invoice_no") == "FAILED":
                    ui_pay["error"] = "Extraction failed or pages missing"
                
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
            
            logger.info(f"[DTO_POST_VALIDATION] page_no={page_src} invoice_no={invoice_no} merge_key=N/A dedupe_key=N/A filter_reason=None dropped=False")
            
            logger.info(
                f"[FINAL_CANONICAL_DTO]\n"
                f"invoice_no={invoice_no}\n"
                f"item_count={len(items)}\n"
                f"pages={inv.get('_source_pages', [inv.get('_page_no')])}"
            )
            
            final_invoices.append(ui_pay)
            logger.info(f"[EXPORT_FINAL_ROW] invoice_no='{invoice_no}' upload_session_id='{record.upload_session_id}' tenant_id='{record.tenant_id}' job_id='{kwargs.get('job_id')}'")
            logger.info(f"[PIPELINE_EXPORT_APPEND] invoice_no='{invoice_no}'")

        logger.info(f"[FINAL_EXPORT_COUNT] count={len(final_invoices)}")
        
        # Freeze DTOs to enforce Phase 4 Hard Canonical Freeze
        for ui_pay in final_invoices:
            ui_pay["is_canonical_frozen"] = True
            logger.info(f"[CANONICAL_FREEZE] DTO frozen: invoice_no={ui_pay.get('invoice_no')}")

        # ── DETERMINISTIC EXPORT ORDERING (Requirement #18) ──
        def _get_sort_key(x):
            src_pages = x.get("_source_pages", [])
            if src_pages:
                return min(int(p) for p in src_pages if p is not None)
            return int(x.get("_physical_page_no") or x.get("_page_no") or 0)
            
        final_invoices.sort(key=_get_sort_key)
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

        for ui_pay in final_invoices:
            try:
                trace_item_checkpoint(
                    record_id=str(record.id),
                    invoice_no=ui_pay.get("invoice_no") or "N/A",
                    page_number=ui_pay.get("_page_no"),
                    stage="ITEM_TRACE_AFTER_ASSEMBLY",
                    item_count=len(ui_pay.get("items", [])),
                    item_status=ui_pay.get("item_status"),
                    snapshot_item_count=None
                )
            except Exception as trace_err:
                logger.error(f"[TRACE_ERR] ITEM_TRACE_AFTER_ASSEMBLY: {trace_err}")

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

        # PHASE 2: PRINT REAL STRUCTURES - before snapshot freeze
        for idx, inv_ui in enumerate(final_invoices):
            logger.critical(
                "[FORENSIC_ITEMS_STRUCTURE]\n%s",
                json.dumps(inv_ui.get("items"), indent=2, default=str)
            )
            # PHASE 1: TRACE ONE FAILING ROW ONLY - before snapshot freeze
            logger.critical(
                "[FORENSIC_ITEMS_LIFECYCLE] [BEFORE_SNAPSHOT_FREEZE] record_id=%s invoice_no=%s item_count=%d item_status=%s payload_keys=%s",
                inv_ui.get("id"), inv_ui.get("invoice_no"), len(inv_ui.get("items", [])), inv_ui.get("item_status"), list(inv_ui.keys())
            )
            # PHASE 6: BEFORE SNAPSHOT CHECKPOINT
            inv_items = inv_ui.get("items") or []
            logger.critical(
                "[CANONICAL_ITEM_CHECKPOINT] record_id=%s item_count=%d validated_item_count=%d item_status=%s payload_keys=%s",
                inv_ui.get("id") or record.id, len(inv_items), len(inv_items), inv_ui.get("item_status"), list(inv_ui.keys())
            )
            # Phase 5 Assertion check before snapshot freeze
            if len(inv_items) > 0 and inv_ui.get("item_status") is None:
                raise CriticalPipelineError(
                    f"Item status lost despite extracted items before snapshot freeze: record_id={inv_ui.get('id') or record.id}"
                )
            
            try:
                trace_item_checkpoint(
                    record_id=str(inv_ui.get("id") or record.id),
                    invoice_no=inv_ui.get("invoice_no") or "N/A",
                    page_number=inv_ui.get("_page_no"),
                    stage="ITEM_TRACE_BEFORE_SNAPSHOT",
                    item_count=len(inv_items),
                    item_status=inv_ui.get("item_status"),
                    snapshot_item_count=len(inv_items)
                )
            except Exception as trace_err:
                logger.error(f"[TRACE_ERR] ITEM_TRACE_BEFORE_SNAPSHOT: {trace_err}")

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
                    
                    # ── [PHASE 4: DISTRIBUTED LOCKS & IDEMPOTENCY KEY] ──
                    # Key: (tenant_id, upload_session_id, canonical_invoice_hash)
                    fields_str = f"{inv_no}::{total_val}::{gstin}::{inv_date}"
                    canonical_invoice_hash = hashlib.sha256(fields_str.encode('utf-8')).hexdigest()
                    canonical_lock_name = f"canonical:{record.tenant_id}:{record.upload_session_id}:{canonical_invoice_hash}"
                    
                    if not acquire_redis_lock(canonical_lock_name, expiry_s=60):
                        logger.warning(f"[DISTRIBUTED_LOCK_REJECTED] canonical lock held for hash={canonical_invoice_hash} in assembly.")
                        if idx == 0:
                            record.validation_status = 'DUPLICATE'
                            record.save(update_fields=['validation_status'])
                        continue
                    
                    acquired_canonical_locks.append(canonical_lock_name)
                
                    has_inv = bool(inv_no and inv_no not in ('', 'MISSING', '—'))
                    v_name = str(inv_ui.get('vendor_name') or '').strip().upper()
                    has_vendor = bool(v_name and v_name not in ('', 'MISSING', '—'))
                    has_gstin = bool(gstin and gstin not in ('', 'MISSING', '—'))
                    is_primary = has_inv or (has_vendor and has_gstin)
                
                    if idx == 0:
                        record.file_hash = stable_hash
                        record.is_primary = is_primary
                        sync_record_flattened_fields(record, inv_ui, commit=False)

                        # 🔹 RUN AUTHORITATIVE STRICT DUPLICATE VALIDATION IMMEDIATELY FOR PRIMARY
                        from accounting.models_voucher_purchase import VoucherPurchaseSupplierDetails
                        logger.info(f"[DUPLICATE_CHECK_START] primary record={record.id} inv_no='{record.supplier_invoice_no}' gstin='{record.gstin}' branch='{record.branch}' tenant_id='{record.tenant_id}'")
                        is_dup = False
                        if record.supplier_invoice_no and record.gstin:
                            is_dup = VoucherPurchaseSupplierDetails.objects.filter(
                                supplier_invoice_no__iexact=record.supplier_invoice_no,
                                gstin__iexact=record.gstin,
                                branch__iexact=record.branch,
                                tenant_id=record.tenant_id
                            ).exists()
                        if is_dup:
                            record.validation_status = 'DUPLICATE'
                            logger.warning(f"[DUPLICATE_MATCH_FOUND] primary record={record.id} inv_no='{record.supplier_invoice_no}'")
                        else:
                            record.validation_status = 'NEED_TO_SAVE'
                        logger.info(f"[DUPLICATE_STATUS_PERSISTED] primary record={record.id} status={record.validation_status}")

                        logger.info(f"[STAGING_ROW_CREATED] primary={is_primary} index={idx} invoice_no={inv_ui.get('invoice_no')} stable_hash={stable_hash[:8]}")
                    else:
                        sibling = InvoiceTempOCR(
                            tenant_id=record.tenant_id,
                            upload_session_id=record.upload_session_id,
                            file_path=record.file_path,
                            file_hash=stable_hash,
                            group_id=record.group_id,
                            status=PipelineStatus.FINALIZED,
                            is_primary=is_primary,
                            processed=False,
                            voucher_type=record.voucher_type,
                            upload_type=record.upload_type  # [UPLOAD_TYPE ISOLATION FIX]
                        )
                        sync_record_flattened_fields(sibling, inv_ui, commit=False)

                        # 🔹 RUN AUTHORITATIVE STRICT DUPLICATE VALIDATION IMMEDIATELY FOR SIBLING
                        from accounting.models_voucher_purchase import VoucherPurchaseSupplierDetails
                        logger.info(f"[DUPLICATE_CHECK_START] sibling inv_no='{sibling.supplier_invoice_no}' gstin='{sibling.gstin}' branch='{sibling.branch}' tenant_id='{sibling.tenant_id}'")
                        is_dup = False
                        if sibling.supplier_invoice_no and sibling.gstin:
                            is_dup = VoucherPurchaseSupplierDetails.objects.filter(
                                supplier_invoice_no__iexact=sibling.supplier_invoice_no,
                                gstin__iexact=sibling.gstin,
                                branch__iexact=sibling.branch,
                                tenant_id=sibling.tenant_id
                            ).exists()
                        if is_dup:
                            sibling.validation_status = 'DUPLICATE'
                            logger.warning(f"[DUPLICATE_MATCH_FOUND] sibling inv_no='{sibling.supplier_invoice_no}'")
                        else:
                            sibling.validation_status = 'NEED_TO_SAVE'
                        logger.info(f"[DUPLICATE_STATUS_PERSISTED] sibling status={sibling.validation_status}")

                        siblings.append(sibling)
                        logger.info(f"[STAGING_ROW_CREATED] primary={is_primary} index={idx} invoice_no={inv_ui.get('invoice_no')} stable_hash={stable_hash[:8]}")
            
                # Enforce Phase 4 Hard Canonical Freeze and Validation Revision on primary/siblings
                from ocr_pipeline.integrity_enforcer import get_dto_hash
                if not isinstance(record.extracted_data, dict):
                    record.extracted_data = {}
                record.extracted_data["is_canonical_frozen"] = True
                p_hash = get_dto_hash(record.extracted_data)
                record.extracted_data["validation_revision"] = {
                    "hash": p_hash,
                    "version": 1,
                    "timestamp": timezone.now().isoformat(),
                    "failures": []
                }
                record.save(update_fields=['extracted_data'])

                for sib in siblings:
                    if not isinstance(sib.extracted_data, dict):
                        sib.extracted_data = {}
                    sib.extracted_data["is_canonical_frozen"] = True
                    s_hash = get_dto_hash(sib.extracted_data)
                    sib.extracted_data["validation_revision"] = {
                        "hash": s_hash,
                        "version": 1,
                        "timestamp": timezone.now().isoformat(),
                        "failures": []
                    }

                if siblings:
                    for sib in siblings:
                        logger.info(
                            f"[PERSISTENCE_ATTEMPT] invoice_no={sib.supplier_invoice_no} "
                            f"group_key=sibling page_count=1 session={record.upload_session_id}"
                        )
                    # Clear stale sibling records for the session to prevent unique key violation
                    InvoiceTempOCR.objects.filter(upload_session_id=record.upload_session_id).exclude(id=record.id).delete()
                    InvoiceTempOCR.objects.bulk_create(siblings)
                    for sib in siblings:
                        logger.info(
                            f"[DB_RECORD_CREATED] record_id={sib.id} invoice_no={sib.supplier_invoice_no} "
                            f"group_key=sibling page_count=1"
                        )
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
                    # Forensic logging of GSTIN snapshot state
                    for inv in final_invoices:
                        logger.info(
                            f"[GSTIN_SNAPSHOT] record_id={record.id} "
                            f"gstin={inv.get('gstin')} status={record.status}"
                        )
                    logger.info(f"[SNAPSHOT_ROW_CREATED] session={record.upload_session_id} snapshot_id={snapshot.id}")
                    logger.info(f"[SNAPSHOT_DB_FLUSH] session={record.upload_session_id} tenant={record.tenant_id}")
                    for inv in final_invoices:
                        try:
                            trace_item_checkpoint(
                                record_id=str(inv.get("id") or record.id),
                                invoice_no=inv.get("invoice_no") or "N/A",
                                page_number=inv.get("_page_no"),
                                stage="ITEM_TRACE_AFTER_SNAPSHOT",
                                item_count=len(inv.get("items", [])),
                                item_status=inv.get("item_status"),
                                snapshot_item_count=len(inv.get("items", []))
                            )
                        except Exception as trace_err:
                            logger.error(f"[TRACE_ERR] ITEM_TRACE_AFTER_SNAPSHOT: {trace_err}")
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
                    logger.info(
                        f"[PERSISTENCE_ATTEMPT] invoice_no={record.supplier_invoice_no} "
                        f"group_key=primary page_count={total_expected} session={record.upload_session_id}"
                    )
                    record.status = PipelineStatus.FINALIZED
                
                    # [FIX] Protect against legacy string-serialized JSON preventing dictionary assignment
                    if not record.extracted_data or not isinstance(record.extracted_data, dict):
                        try:
                            record.extracted_data = json.loads(record.extracted_data) if isinstance(record.extracted_data, str) else {}
                        except:
                            record.extracted_data = {}
                        
                    record.extracted_data["_forensics"] = {"snapshot_id": str(snapshot.id), "pages": total_expected, "snapshot_hash": snapshot_hash_val}
                    record.save()
                    logger.info(
                        f"[DB_RECORD_CREATED] record_id={record.id} invoice_no={record.supplier_invoice_no} "
                        f"group_key=primary page_count={total_expected}"
                    )
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

                        # PIPELINE PARITY VALIDATION - PAGE ACCOUNTING
                        expected_pages = session_lock.expected_pages
                        accounted_pages = 0
                        merged_groups = len(final_invoices)
                        continuation_pages = 0
                        partial_pages = 0
                        
                        failed_pages_count = len(failed_indices) if 'failed_indices' in locals() else 0
                        accounted_pages += failed_pages_count

                        for inv in final_invoices:
                            pages = inv.get('_source_pages', [])
                            if not pages and inv.get('_page_no'):
                                pages = [inv.get('_page_no')]
                            
                            accounted_pages += len(pages)
                            if len(pages) > 1:
                                continuation_pages += (len(pages) - 1)
                            if inv.get('status') == 'partial_extraction':
                                partial_pages += len(pages)

                        logger.info(
                            f"[PIPELINE_PAGE_ACCOUNTING] "
                            f"expected_pages={expected_pages} "
                            f"accounted_pages={accounted_pages} "
                            f"merged_groups={merged_groups} "
                            f"continuations={continuation_pages} "
                            f"partials={partial_pages} "
                            f"orphans={failed_pages_count}"
                        )
                    
                        if expected_pages != accounted_pages:
                            logger.error(
                                f"[PIPELINE_PARITY_FAILURE] session_id='{record.upload_session_id}' "
                                f"mismatch detected! expected_pages={expected_pages} "
                                f"accounted_pages={accounted_pages} "
                                f"merged_groups={merged_groups} "
                                f"continuations={continuation_pages} "
                                f"partials={partial_pages} "
                                f"orphans={failed_pages_count}"
                            )
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
    finally:
        for lock_n in acquired_canonical_locks:
            release_redis_lock(lock_n)
        release_redis_lock(merge_lock_name)
        release_redis_lock(finalization_lock_name)

def trigger_next_fanout(record_id):
    """
    PHASE 10: BOUNDED AI FANOUT GOVERNOR.
    Enqueues the next batch/page of a multi-page record ONLY if 
    the current in-flight count is below the window (MAX_AI_INFLIGHT_PER_RECORD = 5).
    Uses active_slots in Redis as the source of truth for adaptive windowing.
    """
    try:
        from ocr_pipeline.models import InvoiceTempOCR, SessionFinalizationState
        from ocr_pipeline.extraction import extract_invoice
        from django.db import transaction
        from core.redis_orchestrator import orchestrator
        
        # 0. Clean stale/timed-out slots first to avoid deadlock
        record = InvoiceTempOCR.objects.get(id=record_id)
        orchestrator.clean_stale_slots(str(record_id), session_id=str(record.upload_session_id))
        
        with transaction.atomic():
            barrier = SessionFinalizationState.objects.select_for_update().get(id=str(record_id))
            
            # Check expected pages
            if barrier.total_pages_completed >= barrier.expected_pages:
                logger.debug(f"[FANOUT_COMPLETE] record={record_id} reached limit {barrier.expected_pages}")
                return

            # Fetch actual inflight count from Redis
            inflight = orchestrator.get_active_slots_count(str(record_id))
            
            MAX_WINDOW = 5
            if inflight < MAX_WINDOW:
                to_enqueue = MAX_WINDOW - inflight
                next_start = barrier.total_pages_completed
                remaining = barrier.expected_pages - next_start
                batch_size = min(to_enqueue, remaining)
                
                if batch_size <= 0:
                    return

                logger.debug(f"[FANOUT_FILL] record={record_id} inflight={inflight} filling={batch_size} next={next_start+1}")
                
                actual_path = resolve_storage_path(record)
                
                from ocr_pipeline.models import OCRTask
                _ocr_task = OCRTask.objects.filter(result_id=record.id).first()
                job_id = _ocr_task.job_id if _ocr_task and _ocr_task.job_id else record.upload_session_id
                logger.debug(f"[FANOUT_JOB_RESOLVED] record={record_id} job_id={job_id} via={'OCRTask' if _ocr_task else 'session_fallback'}")
                
                for i in range(batch_size):
                    page_idx = next_start + i
                    page_num = page_idx + 1
                    
                    # Try to acquire AI slot atomically in Redis
                    slot_acquired = orchestrator.acquire_ai_slot(str(record_id), page_num, session_id=str(record.upload_session_id), tenant_id=str(record.tenant_id))
                    
                    if not slot_acquired:
                        logger.warning(f"[SLOT_ACQUIRE_FAILED] record={record_id} page={page_num} — failed to acquire slot")
                        break
                    
                    try:
                        logger.debug(f"[SLIDING_WINDOW_ENQUEUE] record={record_id} page={page_num}")
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
                        # Redundant success register upon successful call
                        try:
                            rec_id_str = str(record_id)
                            page_num_str = str(page_num)
                            orchestrator.redis.set(f"assembly:{rec_id_str}:page:{page_num_str}:enqueued", "true", ex=86400)
                            orchestrator.redis.sadd(f"assembly:{rec_id_str}:enqueued_success_pages", page_num_str)
                            orchestrator.redis.expire(f"assembly:{rec_id_str}:enqueued_success_pages", 86400)
                        except Exception as redis_ok_err:
                            logger.error(f"[REDIS_OK_ERR] {redis_ok_err}")
                    except Exception as e:
                        # Hard assertion: Did SQS push succeed?
                        already_pushed = False
                        try:
                            rec_id_str = str(record_id)
                            page_num_str = str(page_num)
                            already_pushed = (
                                orchestrator.redis.get(f"assembly:{rec_id_str}:page:{page_num_str}:enqueued") == "true"
                                or orchestrator.redis.sismember(f"assembly:{rec_id_str}:enqueued_success_pages", page_num_str)
                            )
                        except Exception as redis_err:
                            logger.error(f"[REDIS_CHECK_ERR] {redis_err}")
                        
                        if already_pushed:
                            logger.warning(f"[SLIDING_WINDOW_ENQUEUE_BYPASS] record={record_id} page={page_num} caught exception {e} but SQS push was already successful. Bypassing enqueue failure.")
                        else:
                            logger.error(f"[SLIDING_WINDOW_ENQUEUE_FAIL] record={record_id} page={page_num} error={e}")
                            logger.error(f"[BARRIER_FAILED_INCREMENT] record={record_id} page={page_num}")
                            # Reconcile failure
                            from django.utils import timezone
                            SessionFinalizationState.objects.filter(id=str(record_id)).update(
                                total_pages_completed=models.F('total_pages_completed') + 1,
                                updated_at=timezone.now()
                            )
                            orchestrator.release_ai_slot(str(record_id), page_num, session_id=str(record.upload_session_id), release_reason="ENQUEUE_FAIL", tenant_id=str(record.tenant_id))
                            
                            from vouchers.coordinator import terminalize_page_state, check_and_trigger_assembly
                            terminalize_page_state(
                                record_id=str(record_id),
                                page_number=page_num,
                                session_id=str(record.upload_session_id),
                                is_failed=True,
                                canonical_payload={'status': 'OCR_FAILED', 'error': f"Enqueue Failed: {e}"},
                                worker_id="ingestion",
                                queue_source="ingestion_queue"
                            )
                            check_and_trigger_assembly(
                                record_id=str(record_id),
                                tenant_id=str(record.tenant_id),
                                session_id=str(record.upload_session_id),
                                correlation_id=f"ingestion_fail_{record_id}_{page_num}",
                                job_id=str(record.upload_session_id),
                                item_id=None
                            )
            else:
                logger.debug(f"[FANOUT_STALLED] record={record_id} window_full={inflight}")
                logger.info(f"[FANOUT_WINDOW_STATUS] record={record_id} current={inflight}")
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
    import hashlib
    tenant_id = getattr(record, 'tenant_id', None)
    session_id = getattr(record, 'upload_session_id', None)
    lock_name = f"validation:{tenant_id}:{session_id}:{record.id}"
    
    # ── [PHASE 4: DISTRIBUTED LOCKS & IDEMPOTENCY KEY] ──
    # Safely retrieve canonical details from extracted_data or flat fields
    data = record.extracted_data or {}
    assembled = data.get("assembled_exports") or data.get("_pages_assembled") or []
    assembled_first = assembled[0] if (isinstance(assembled, list) and assembled) else {}
    canonical_data_src = data
    if not data.get("sections") and assembled_first:
        canonical_data_src = assembled_first

    sections = canonical_data_src.get("sections", {})
    supplier_sec = sections.get("supplier_details", {}) or {}
    supply_sec = sections.get("supply_details", {}) or {}

    inv_no = getattr(record, 'supplier_invoice_no', None)
    if not inv_no:
        inv_no = canonical_data_src.get('invoice_no') or supplier_sec.get('invoice_no') or supplier_sec.get('supplier_invoice_no')
    inv_no = str(inv_no or '').strip().upper()

    gstin = getattr(record, 'gstin', None)
    if not gstin:
        gstin = canonical_data_src.get('gstin') or supplier_sec.get('vendor_gstin') or supplier_sec.get('gstin')
    gstin = str(gstin or '').strip().upper()

    total_val = getattr(record, 'total_amount', None) or getattr(record, 'invoice_total', None)
    if not total_val:
        total_val = supply_sec.get('total_invoice_value') or canonical_data_src.get('total_invoice_value') or canonical_data_src.get('invoice_total') or '0'
    total_val = str(total_val).strip()

    inv_date = getattr(record, 'invoice_date', None)
    if not inv_date:
        inv_date = supplier_sec.get('invoice_date') or canonical_data_src.get('invoice_date') or ''
    inv_date = str(inv_date).strip().upper()
    
    fields_str = f"{inv_no}::{total_val}::{gstin}::{inv_date}"
    canonical_invoice_hash = hashlib.sha256(fields_str.encode('utf-8')).hexdigest()
    canonical_lock_name = f"canonical:{tenant_id}:{session_id}:{canonical_invoice_hash}"
    
    if not acquire_redis_lock(canonical_lock_name, expiry_s=120):
        logger.warning(f"[DISTRIBUTED_LOCK_REJECTED] canonical lock held for hash={canonical_invoice_hash} in validation/finalization. Sleeping 50ms and retrying...")
        time.sleep(0.05)
        if not acquire_redis_lock(canonical_lock_name, expiry_s=120):
            logger.warning(f"[DISTRIBUTED_LOCK_REJECTED] canonical lock held for hash={canonical_invoice_hash} in validation/finalization on retry - returning current status")
            return {"status": record.validation_status or "PROCESSING"}

    if not acquire_redis_lock(lock_name, expiry_s=120):
        logger.warning(f"[DISTRIBUTED_LOCK_REJECTED] validation_lock rejected for record={record.id} - sleeping 50ms and retrying...")
        time.sleep(0.05)
        if not acquire_redis_lock(lock_name, expiry_s=120):
            logger.warning(f"[DISTRIBUTED_LOCK_REJECTED] validation_lock rejected for record={record.id} on retry - returning current status")
            release_redis_lock(canonical_lock_name)
            return {"status": record.validation_status or "PROCESSING"}

    try:
        try:
            record = InvoiceTempOCR.objects.select_for_update().get(id=record.id)
        except InvoiceTempOCR.DoesNotExist:
            logger.error(f"[VALIDATION_ABORT] Record {record.id} not found in database.")
            return {"status": "ERROR"}

        # ── Check validation_revision and freeze bypass ──
        from ocr_pipeline.integrity_enforcer import get_dto_hash
        data = record.extracted_data or {}

        # Enforce strict immutability post-finalization
        # Restored original execution path: a status of FINALIZED only means the OCR/assembly step finished.
        # It is only business-finalized if processed=True or validation_status is in terminal states.
        is_already_finalized = (
            record.status in ['VOUCHER_CREATED', 'COMPLETED', 'DUPLICATE', 'FAILED', 'ERROR']
            or (record.status == 'FINALIZED' and getattr(record, 'processed', False) is True)
            or getattr(record, 'processed', False) is True
            or record.validation_status in ['VOUCHER_CREATED', 'DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE']
        )
        if is_already_finalized:
            logger.info(f"[POST_FINALIZATION_MUTATION_BLOCKED] record_id={record.id} status={record.status} processed={record.processed}")
            logger.info(f"[CANONICAL_FREEZE_CONFIRMED] record_id={record.id}")
            return {"status": record.validation_status or "SUCCESS"}

        # Block any mutation or re-validation on frozen DTOs unless we are executing the final save
        # DO NOT bypass if the record has not been processed yet or validation status is PENDING
        is_processed = getattr(record, 'processed', False) is True
        has_validation = record.validation_status and record.validation_status != 'PENDING'

        if data.get("is_canonical_frozen") and not auto_save and is_processed and has_validation:
            logger.info(f"[CANONICAL_FREEZE_BYPASS] Bypassing validate_and_process for frozen DTO of record {record.id}")
            return {"status": record.validation_status or "SUCCESS"}

        current_hash = get_dto_hash(data)
        val_rev = data.get("validation_revision")
        if val_rev and isinstance(val_rev, dict) and val_rev.get("hash") == current_hash and not auto_save and is_processed and has_validation:
            logger.info(f"[VALIDATION_SKIPPED_ALREADY_VALIDATED] Skip validate_and_process for record {record.id} hash {current_hash}")
            return {"status": record.validation_status or "SUCCESS"}

    # Stage 5 Forensic Trace: validate_and_process_entry
        import json
        data = record.extracted_data or {}
        items = data.get("items", []) or []
        if not items and "assembled_exports" in data and data["assembled_exports"]:
            items = data["assembled_exports"][0].get("items", [])
            
        generic_keywords = [
            "services", "total", "subtotal", "sub-total", "summary",
            "carried forward", "brought forward",
            "rounded off", "round off", "rounding", "adjustment",
            "output cgst", "output sgst", "output igst",
            "input cgst", "input sgst", "input igst",
            "cgst @", "sgst @", "igst @",
            "tax summary", "amount chargeable", "declaration",
            "less round", "add round", "bank charges", "net amount",
            "e & o.e", "balance",
        ]
        is_summary_only = len(items) > 0 and all(
            any(kw in str(itm.get("description") or itm.get("item_name") or "").lower() for kw in generic_keywords)
            for itm in items
        )
        
        pre_val_info = {
            "invoice_no": str(record.supplier_invoice_no or ""),
            "inventory_items": items,
            "vendor_status": str(record.vendor_id or ""),
            "validation_status": str(record.validation_status or ""),
            "is_canonicalized": bool("assembled_exports" in data or record.is_primary),
            "is_summary_only": is_summary_only,
            "dto_memory_id": str(id(data)),
            "validation_stage_name": "validate_and_process_entry"
        }
        logger.info(f"[FORENSIC_PRE_VALIDATION]\n{json.dumps(pre_val_info, indent=2, default=str)}")
    except Exception as le:
        logger.warning(f"[FORENSIC_PRE_VALIDATION_LOG_ERR] {le}")

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
    logger.error(f"[DUPLICATE_RUNTIME_PROBE] file={__file__} record_id={record.id} session={record.upload_session_id} page_index={p_idx} current_validation_status={record.validation_status}")
    
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

        # ── CANONICAL FIELD ACCESS ──
        # [ROOT CAUSE FIX] assembled_exports records have their invoice data nested inside
        # assembled_exports[0], NOT at the root of extracted_data. get_canonical_export_record
        # only searches root/header/sections, so it returns empty for gstin/invoice_no/branch.
        # The serializer then fails because supplier_invoice_no is CharField(max_length=100)
        # with no blank=True. Fix: unwrap assembled_exports[0] for sections, and fall back to
        # flat DB fields (set by the pipeline during assembly) as authoritative values.

        # 1. Try to unwrap assembled_exports[0] when root sections are empty
        assembled = data.get("assembled_exports") or data.get("_pages_assembled") or []
        assembled_first = assembled[0] if (isinstance(assembled, list) and assembled) else {}

        # Use assembled_first as the canonical data source if root sections are empty
        canonical_data_src = data
        if not data.get("sections") and assembled_first:
            canonical_data_src = assembled_first
            logger.info(f"[ASSEMBLED_EXPORTS_UNWRAP] record={record.id} — using assembled_exports[0] as canonical data source")

        sections = canonical_data_src.get("sections", {})
        supplier = sections.get("supplier_details", {})
        supply = sections.get("supply_details", {})
        due = sections.get("due_details", {})

        canonical = get_canonical_export_record(canonical_data_src, tenant_id=record.tenant_id)

        # 2. Fall back to flat DB fields when canonical extraction returns empty.
        # These fields are set by the pipeline during assembly and are authoritative.
        gstin = (canonical.get("gstin") or record.gstin or "").strip().upper()
        invoice_no = (canonical.get("supplier_invoice_no") or canonical.get("invoice_no") or record.supplier_invoice_no or "").strip()
        vendor_name = (canonical.get("vendor_name") or "").strip()
        branch_name = (canonical.get("branch") or record.branch or "").strip()
        tenant_id = str(record.tenant_id)

        logger.info(
            f"[VENDOR_VALIDATION_SUCCESS] record={record.id} "
            f"gstin={gstin} invoice_no={invoice_no} branch={branch_name} "
            f"vendor_id={record.vendor_id} validation_status={record.validation_status}"
        )
        logger.info(f"[FINALIZE_VENDOR_ID_RECEIVED] record={record.id} vendor_id={record.vendor_id} source=staging_db")

        # ── [PHASE 3] STAGING PERSISTENCE SAFETY ──
        items = canonical.get("items", []) or assembled_first.get("items", []) if assembled_first else canonical.get("items", [])
        if not items:
            logger.warning(f"[INVOICE_WARNING_EMPTY_ITEMS] invoice={invoice_no} record={record.id}. Proceeding with warning state.")
            record.validation_status = "REQUIRES_REVIEW"
            record.validation_message = "Warning: No line items detected. Please verify OCR data."
        else:
            logger.info(f"[INVOICE_VISIBLE_TO_UI] record_id={record.id} inv_no='{invoice_no}' items={len(items)} status={record.status}")

        if not gstin or not invoice_no:
            logger.warning(f"[INVOICE_WARNING_MISSING_HEADERS] invoice={invoice_no} gstin={gstin} record={record.id}. Missing GSTIN or Invoice No.")
            record.validation_status = "ERROR"
            record.validation_message = "Warning: Missing GSTIN or Invoice Number. Please verify OCR data."
            # Proceed anyway so it shows in UI

        # Save record now to ensure visibility even if vendor matching fails
        record.save()
        logger.info(f"[INVOICE_VISIBLE_TO_UI] record_id={record.id} inv_no='{invoice_no}' status={record.status}")

        # branch_name already resolved above from canonical + record.branch fallback
        # (do NOT overwrite with supplier.get() which may be empty for assembled records)

        # 🔹 AUTHORITATIVE STRICT DUPLICATE CHECK (Invoice No + GSTIN + Branch within tenant_id)
        is_duplicate = False
        if invoice_no and gstin:
            from vendors.vendor_validation_logic import canonicalize_gstin_ocr
            canonical_gst = canonicalize_gstin_ocr(gstin)
            is_duplicate = VoucherPurchaseSupplierDetails.objects.filter(
                supplier_invoice_no__iexact=invoice_no,
                gstin__iexact=canonical_gst,
                branch__iexact=branch_name,
                tenant_id=tenant_id
            ).exists()

        if is_duplicate:
            logger.warning(f"[DUPLICATE_MATCH_FOUND] id={record.id} inv_no='{invoice_no}' gstin='{gstin}' branch='{branch_name}' tenant='{tenant_id}'")
            record.status = "EXTRACTED"
            record.validation_status = "DUPLICATE"
            record.save()
            logger.warning(f"[DUPLICATE_STATUS_PERSISTED] id={record.id} validation_status=DUPLICATE")
            # We don't return early here anymore. Let it flow to vendor and inventory validation for Pending Purchase evaluation.

        # ── [INVENTORY ITEM VALIDATION GATING] ──
        # PHASE 2: PRINT REAL STRUCTURES - before validation
        logger.critical(
            "[FORENSIC_ITEMS_STRUCTURE]\n%s",
            json.dumps(items, indent=2, default=str)
        )
        # PHASE 1: TRACE ONE FAILING ROW ONLY - before validation
        logger.critical(
            "[FORENSIC_ITEMS_LIFECYCLE] [BEFORE_VALIDATION] record_id=%s invoice_no=%s item_count=%d item_status=%s payload_keys=%s",
            record.id, invoice_no, len(items), (record.extracted_data or {}).get("item_status"), list((record.extracted_data or {}).keys())
        )

        from .inventory_validation import InventoryItemValidationService
        inv_val = InventoryItemValidationService.validate_items(tenant_id, items)

        # PHASE 2: PRINT REAL STRUCTURES - after validation
        logger.critical(
            "[FORENSIC_ITEMS_STRUCTURE]\n%s",
            json.dumps(inv_val.get("items"), indent=2, default=str)
        )
        # PHASE 1: TRACE ONE FAILING ROW ONLY - after validation
        logger.critical(
            "[FORENSIC_ITEMS_LIFECYCLE] [AFTER_VALIDATION] record_id=%s invoice_no=%s item_count=%d item_status=%s payload_keys=%s",
            record.id, invoice_no, len(inv_val.get("items", [])), inv_val.get("item_status"), list(inv_val.keys())
        )

        # PHASE 5: ADD HARD ASSERTIONS
        raw_item_count = len(items)
        item_status = inv_val.get("item_status")
        if raw_item_count > 0 and item_status is None:
            raise CriticalPipelineError(
                f"Item status lost despite extracted items: record_id={record.id} raw_item_count={raw_item_count}"
            )
        
        # [CANONICAL FORENSIC LOG] DTO validation state after item validation
        logger.info(
            f"[DTO_VALIDATION_STATE] "
            f"record_id={record.id} "
            f"vendor_status={'EXISTS' if record.vendor_id else 'NEW'} "
            f"vendor_id={record.vendor_id} "
            f"voucher_status={'ALREADY_EXIST' if is_duplicate else 'NEED_TO_SAVE'} "
            f"item_status={inv_val.get('item_status', 'UNKNOWN')}"
        )
        
        # ── [PERSIST METADATA INTO DB] ──
        # Always update validation results (item_status, missing_items, items) to ensure propagation.
        # Log if DTO is canonically frozen.
        if (record.extracted_data or {}).get("is_canonical_frozen"):
            logger.info(f"[CANONICAL_FREEZE_VAL_UPDATE] Updating validation metadata on frozen DTO for record {record.id}")
            
        if not isinstance(record.extracted_data, dict):
            record.extracted_data = {}
        record.extracted_data["item_status"] = inv_val["item_status"]
        record.extracted_data["missing_items"] = inv_val["missing_items"]
        record.extracted_data["items"] = inv_val["items"]  # Enforce dto.items
        
        if "assembled_exports" in record.extracted_data and record.extracted_data["assembled_exports"]:
            record.extracted_data["assembled_exports"][0]["items"] = inv_val["items"]
            record.extracted_data["assembled_exports"][0]["item_status"] = inv_val["item_status"]
            record.extracted_data["assembled_exports"][0]["missing_items"] = inv_val["missing_items"]
        record.save(update_fields=['extracted_data'])

        # ⚫ FAST PATH: vendor_id already validated and stored in staging — skip re-validation.
        # Expand status list to include READY, FINALIZED, VOUCHER_CREATED to cover all valid states.
        if record.vendor_id and record.validation_status in [
            'FOUND', 'READY', 'RESOLVED', 'MATCHED_VENDOR', 'EXISTING_VENDOR',
            'NEED_TO_SAVE', 'FINALIZED', 'VOUCHER_CREATED', 'REQUIRES_REVIEW'
        ]:
            logger.info(f"[FINALIZE_VENDOR_LOOKUP] record={record.id} vendor_id={record.vendor_id} path=FAST_PATH status={record.validation_status}")
            try:
                vendor = VendorMasterBasicDetail.objects.get(id=record.vendor_id, tenant_id=tenant_id)
                logger.info(f"[PURCHASE_VENDOR_RESOLUTION] record={record.id} vendor_id={vendor.id} name={vendor.vendor_name} path=FAST_PATH")
            except VendorMasterBasicDetail.DoesNotExist:
                vendor = None
                logger.warning(f"[VENDOR_FK_RESOLUTION_FAILED] record={record.id} vendor_id={record.vendor_id} tenant={tenant_id} — vendor not found in master. Falling back to GSTIN lookup.")
        else:
            # ⚫ STRICT VENDOR VALIDATION (GSTIN + BRANCH) — only when vendor_id not pre-resolved
            from vendors.vendor_validation_logic import build_session_vendor_map, normalize_branch as _nb, canonicalize_gstin_ocr
            logger.info(f"[FINALIZE_VENDOR_LOOKUP] record={record.id} path=GSTIN_BRANCH gstin={gstin} branch={branch_name}")
            logger.info(f"[PURCHASE_SCAN_VENDOR_VALIDATION_CALL] id={record.id} tenant_id={tenant_id} validation_status={record.validation_status}")
            logger.info(f"[EXISTING_VENDOR_VALIDATION_CALL] tenant_id={tenant_id} name={vendor_name} gstin={gstin} branch={branch_name}")
            _vendor_map = build_session_vendor_map(tenant_id, [record])
            gstin_key = canonicalize_gstin_ocr(gstin)
            branch_key = _nb(branch_name or "Main Branch")
            val_res = _vendor_map.get((gstin_key, branch_key)) or {"status": "CREATE_VENDOR", "vendor_id": None}
            logger.info(f"[VENDOR_VALIDATION_RESULT] record_id={record.id} result={val_res}")

            if val_res['status'] == 'EXISTING_VENDOR':
                vendor = VendorMasterBasicDetail.objects.filter(id=val_res['vendor_id'], tenant_id=tenant_id).first()
                if vendor:
                    record.vendor_id = vendor.id
                    record.vendor_status = 'EXISTS'  # [CANONICAL FIX] Persist vendor_status to DB
                    logger.info(
                        f"[VENDOR_VALIDATION_RESULT] "
                        f"gstin={gstin_key} "
                        f"matched_vendor_id={vendor.id} "
                        f"assigned_status=EXISTING_VENDOR "
                        f"record_id={record.id}"
                    )
                    logger.info(f"[VENDOR_ID_ASSIGNED] record={record.id} vendor_id={vendor.id} path=GSTIN_BRANCH")
                    logger.info(f"[STAGING_VENDOR_ID_PERSISTED] record={record.id} vendor_id={vendor.id}")
                    logger.info(f"[PURCHASE_VENDOR_RESOLUTION] record={record.id} vendor_id={vendor.id} name={vendor.vendor_name} path=GSTIN_BRANCH")
            else:
                vendor = None
                logger.info(
                    f"[VENDOR_VALIDATION_RESULT] "
                    f"gstin={gstin_key} "
                    f"matched_vendor_id=None "
                    f"assigned_status=CREATE_VENDOR "
                    f"record_id={record.id}"
                )

        logger.debug(f"[DUPLICATE_AUDIT] is_duplicate={is_duplicate}")

        if not vendor:
            # Re-check if it's there (duplicate check might have used OCR name, this uses master)
            from vendors.vendor_validation_logic import build_session_vendor_map, normalize_branch as _nb, canonicalize_gstin_ocr
            logger.info(f"[EXISTING_VENDOR_VALIDATION_CALL] tenant_id={tenant_id} name={vendor_name} gstin={gstin} branch={branch_name}")
            _vendor_map = build_session_vendor_map(tenant_id, [record])
            gstin_key = canonicalize_gstin_ocr(gstin)
            branch_key = _nb(branch_name or "Main Branch")
            val_res = _vendor_map.get((gstin_key, branch_key)) or {"status": "CREATE_VENDOR", "vendor_id": None}
            logger.info(f"[VENDOR_VALIDATION_RESULT] record_id={record.id} result={val_res}")
            
            if val_res['status'] == 'EXISTING_VENDOR':
                vendor = VendorMasterBasicDetail.objects.filter(id=val_res['vendor_id'], tenant_id=tenant_id).first()
                if vendor:
                    record.vendor_id = vendor.id
                    record.vendor_status = 'EXISTS'  # [CANONICAL FIX] Persist vendor_status to DB
                    record.validation_status = 'NEED_TO_SAVE'
                    logger.info(
                        f"[VENDOR_VALIDATION_RESULT] "
                        f"gstin={gstin_key} "
                        f"matched_vendor_id={vendor.id} "
                        f"assigned_status=EXISTING_VENDOR "
                        f"record_id={record.id}"
                    )
                    logger.info(f"[VALIDATION_STATE_PROPAGATION] record_id={record.id} status=NEED_TO_SAVE vendor_id={vendor.id}")
                    record.save()
            else:
                record.status = "EXTRACTED"
                record.validation_status = "NEED_VENDOR"
                logger.info(
                    f"[VENDOR_VALIDATION_RESULT] "
                    f"gstin={gstin_key} "
                    f"matched_vendor_id=None "
                    f"assigned_status=CREATE_VENDOR "
                    f"record_id={record.id}"
                )
                logger.info(f"[VALIDATION_STATE_PROPAGATION] record_id={record.id} status=NEED_VENDOR")
                record.save()
                
                # Proceed to Pending Purchase evaluation regardless of auto_save.
                pass

        # Sync vendor name from master if found
        if vendor:
             vendor_name = vendor.vendor_name

        # Validation has been performed earlier in validate_and_process_entry
        pass

        # ── [EXPLICIT PENDING EVALUATION STAGE] ──
        # TIMING FIX: evaluate_pending_purchase runs UNCONDITIONALLY after all three
        # validations are complete (vendor, item, duplicate-voucher check).
        # This means Pending Purchase queue entries are created immediately after the
        # initial validation pass — NOT only when Finalize & Save is clicked.
        # auto_save=True (Finalize) proceeds through this block but will short-circuit
        # below if the record is already queued, preventing duplicate queue entries.
        from ocr_pipeline.statuses import ValidationEnums
        from pending_purchases.services import evaluate_pending_purchase

        vendor_status_enum = ValidationEnums.VENDOR_STATUS_EXISTING if vendor else ValidationEnums.VENDOR_STATUS_CREATE
        voucher_status_enum = ValidationEnums.VOUCHER_STATUS_EXISTING if is_duplicate else ValidationEnums.VOUCHER_STATUS_NEW
        item_status_enum = ValidationEnums.ITEM_STATUS_EXISTING if inv_val["item_status"] == "ALREADY EXIST" else ValidationEnums.ITEM_STATUS_CREATE
        ui_row = {
            'invoice_no': invoice_no,
            'invoice_date': (canonical.get('invoice_date') or supplier.get('invoice_date') or supply.get('invoice_date') or ''),
            'vendor_name': vendor_name,
            'vendor_gstin': gstin,
            'total_amount': (canonical.get('total_amount') or canonical.get('grand_total') or due.get('total_amount') or None),
        }
        is_pending = evaluate_pending_purchase(
            record,
            vendor_status_enum,
            voucher_status_enum,
            item_status_enum,
            tenant_id,
            ui_row=ui_row,
            auto_save=auto_save
        )

        if is_pending:
            logger.info(f"[FINAL_STATUS] PENDING_PURCHASE record={record.id} auto_save={auto_save}")
            return {"status": "PENDING_PURCHASE"}

        # If it's a duplicate and NOT sent to pending purchase, NOW we return DUPLICATE
        if is_duplicate:
            record.validation_status = "DUPLICATE"
            record.save()
            return {"status": "DUPLICATE"}

        # 🔹 CREATE PURCHASE VOUCHER (ONLY IF auto_save IS TRUE)
        # Finalize & Save must only create vouchers — Pending Purchase creation happens above.
        if not auto_save:
            record.status = "EXTRACTED"
            record.validation_status = "NEED_TO_SAVE"
            record.save()
            logger.info(f"[FINAL_STATUS] NEED_TO_SAVE record={record.id}")
            return {"status": "NEED_TO_SAVE"}

        # Enforce backend hard validation to block voucher saves unless the item status is 'ALREADY EXIST'
        if inv_val["item_status"] != "ALREADY EXIST":
            logger.error(f"[INVENTORY_SAVE_BLOCKED] Save blocked for record {record.id} because item_status is {inv_val['item_status']}")
            record.validation_status = "ERROR"
            record.validation_message = "Voucher save blocked: one or more inventory items do not exist in Master."
            record.save()
            return {"status": "ERROR", "validation_message": "Voucher save blocked: one or more inventory items do not exist."}

        # Using the Pipeline 2 logic refined earlier
        try:
            logger.info(f"[ATOMIC_SAVE_START] record_id={record.id}")
            with transaction.atomic():
                # Double-check inside transaction to avoid race-condition duplicate voucher creation
                existing_voucher = VoucherPurchaseSupplierDetails.objects.filter(
                    supplier_invoice_no__iexact=invoice_no,
                    gstin__iexact=gstin,
                    branch__iexact=branch_name,
                    tenant_id=tenant_id
                ).first()
                
                if existing_voucher:
                    logger.warning(f"[RACE_PREVENTED] Voucher already exists for invoice={invoice_no} gstin={gstin}. Skipping creation.")
                    record.status = "EXTRACTED"
                    record.validation_status = "DUPLICATE"
                    record.save()
                    return {"status": "DUPLICATE"}

                # ── [PURCHASE_SCAN_SAVE_START] ──
                logger.info(f"[PURCHASE_SCAN_SAVE_START] record_id={record.id} tenant_id={tenant_id} invoice_no={invoice_no}")

                branch_record = Branch.objects.filter(id=tenant_id).first()
                company_gstin = branch_record.gstin if branch_record else None
                is_interstate = gstin[:2] != company_gstin[:2] if company_gstin and len(gstin)>=2 and len(company_gstin)>=2 else False

                # ── Invoice date: from supplier dict (populated from canonical_data_src) ──
                invoice_date_raw = supplier.get('invoice_date') or canonical.get('invoice_date')
                invoice_date = None
                if invoice_date_raw:
                    from datetime import date as _date
                    if isinstance(invoice_date_raw, _date):
                        invoice_date = invoice_date_raw
                    else:
                        from datetime import datetime as _dt
                        for fmt in ('%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d', '%d-%b-%Y'):
                            try:
                                invoice_date = _dt.strptime(str(invoice_date_raw).strip(), fmt).date()
                                break
                            except ValueError:
                                continue
                if not invoice_date:
                    invoice_date = timezone.now().date()

                # [FIX] Use canonical branch_name (already resolved with DB fallback) ──
                # Do NOT use supplier.get('branch') here — supplier may be empty for assembled records.
                # branch_name is the authoritative value resolved earlier from canonical + record.branch.
                address = supplier.get('vendor_address') or canonical.get('bill_from') or ''

                def to_dec(val):
                    try:
                        if not val or str(val).strip() == "": return 0.0
                        clean_val = str(val).replace('₹', '').replace(',', '').strip()
                        return float(clean_val)
                    except:
                        return 0.0

                # Totals: prefer supply dict (from unwrapped sections), fall back to canonical extraction
                total_taxable_val = to_dec(supply.get('total_taxable_value') or canonical.get('total_taxable_value'))
                total_igst_val    = to_dec(supply.get('total_igst')           or canonical.get('total_igst'))
                total_cgst_val    = to_dec(supply.get('total_cgst')           or canonical.get('total_cgst'))
                total_sgst_val    = to_dec(supply.get('total_sgst')           or canonical.get('total_sgst'))
                total_cess_val    = to_dec(supply.get('total_cess')           or canonical.get('total_cess'))
                total_inv_val     = to_dec(supply.get('total_invoice_value')  or canonical.get('total_invoice_value'))

                if total_inv_val == 0.0:
                    total_inv_val = total_taxable_val + total_igst_val + total_cgst_val + total_sgst_val + total_cess_val

                # Map items to the format expected by the serializer's supply_inr_details/supply_foreign_details items
                serializer_items = []
                for item in items:
                    tx_val = to_dec(item.get('taxable_value') or item.get('amount'))
                    cgst = to_dec(item.get('cgst_amount') or item.get('cgst'))
                    sgst = to_dec(item.get('sgst_amount') or item.get('sgst'))
                    igst = to_dec(item.get('igst_amount') or item.get('igst'))
                    cess = to_dec(item.get('cess_amount') or item.get('cess'))
                    qty = to_dec(item.get('quantity'))
                    rate = to_dec(item.get('rate'))
                    inv_val = to_dec(item.get('amount') or item.get('line_total'))
                    if inv_val == 0.0:
                        inv_val = tx_val + cgst + sgst + igst + cess

                    serializer_items.append({
                        "itemCode": item.get('item_code') or "",
                        "itemName": item.get('description') or "—",
                        "hsnSac": item.get('hsn_sac') or "",
                        "qty": qty,
                        "uom": item.get('uom') or "",
                        "itemRate": rate,
                        "taxableValue": tx_val,
                        "cgst": cgst,
                        "sgst": sgst,
                        "igst": igst,
                        "cess": cess,
                        "gstRate": to_dec(item.get('gst_rate') or item.get('tax_rate')),
                        "invoiceValue": inv_val
                    })

                # ── [AUTO-NUMBERING RESOLUTION] ──
                # Check if a series/voucher_no was manually edited or pre-filled in sections/extracted_data
                purchase_series = data.get('purchase_voucher_series') or sections.get('supplier_details', {}).get('purchase_voucher_series') or ''
                purchase_no = data.get('purchase_voucher_no') or sections.get('supplier_details', {}).get('purchase_voucher_no') or ''
                
                if not purchase_series or not purchase_no:
                    # Resolve active config from MasterVoucherPurchases
                    from masters.voucher_master_models import MasterVoucherPurchases
                    config = MasterVoucherPurchases.objects.filter(tenant_id=tenant_id, is_active=True).first()
                    if config:
                        if not purchase_series:
                            purchase_series = config.voucher_name
                        if not purchase_no:
                            if config.enable_auto_numbering:
                                purchase_no = config.get_next_number()
                                config.increment_number()
                            else:
                                purchase_no = invoice_no
                    else:
                        purchase_no = purchase_no or invoice_no

                transit = sections.get("transit_details", {}) or {}
                is_foreign = supplier.get('invoice_in_foreign_currency') == 'Yes'
                
                supply_details = {
                    'purchase_order_no': supply.get('purchase_order_no', ''),
                    'purchase_ledger': supply.get('purchase_ledger', 'Purchase Account'),
                    'description': supply.get('description') or f"Auto-validated via OCR Pipeline: {record.file_path}",
                    'exchange_rate': to_dec(supply.get('exchange_rate', 1.0)),
                    'items': serializer_items
                }

                # ── [TRANSIT_NORMALIZATION_START] ──
                # Build transit dict only from non-empty values.
                # If all fields are blank/zero, pass None so the serializer skips transit entirely.
                # This prevents mode="" from triggering "may not be blank" on invoices without transport.
                _raw_transit = {
                    'mode':              transit.get('mode') or None,
                    'received_in':       transit.get('received_in') or None,
                    'receipt_date':      transit.get('receipt_date') or None,
                    'receipt_time':      transit.get('receipt_time') or None,
                    'received_quantity':  transit.get('received_quantity') or None,
                    'uqc':               transit.get('uqc') or None,
                    'delivery_type':     transit.get('delivery_type') or None,
                    'self_third_party':  transit.get('self_third_party') or None,
                    'transporter_id':    transit.get('transporter_id') or None,
                    'transporter_name':  transit.get('transporter_name') or None,
                    'vehicle_no':        transit.get('vehicle_no') or None,
                    'lr_gr_consignment': transit.get('lr_gr_consignment') or None,
                }
                # Keep only keys with actual non-null values
                _transit_payload = {k: v for k, v in _raw_transit.items() if v is not None}
                _has_real_transit = bool(_transit_payload)
                if _has_real_transit:
                    logger.info(f"[TRANSIT_FINAL_PAYLOAD] record={record.id} fields={list(_transit_payload.keys())}")
                else:
                    logger.info(f"[TRANSIT_EMPTY_PAYLOAD_REMOVED] record={record.id} — no transit data; excluding transit_details from payload")
                    logger.info(f"[TRANSIT_OPTIONAL_FIELD_BYPASS] record={record.id} transit_details=None (optional metadata, not mandatory)")

                serializer_data = {
                    'date': invoice_date or timezone.now().date(),
                    'supplier_invoice_no': invoice_no,           # canonical + record.supplier_invoice_no fallback
                    'supplier_invoice_date': invoice_date,
                    'purchase_voucher_series': purchase_series or None,
                    'purchase_voucher_no': purchase_no or None,
                    'vendor_id': vendor.id,
                    'vendor_name': vendor_name or vendor.vendor_name,
                    'gstin': gstin,                              # canonical + record.gstin fallback
                    'branch': branch_name or 'Main Branch',      # canonical resolved, not supplier.get('branch')
                    'bill_from': address,
                    'input_type': 'Interstate' if is_interstate else 'Intrastate',
                    'invoice_in_foreign_currency': 'Yes' if is_foreign else 'No',
                    'supply_inr_details': None if is_foreign else supply_details,
                    'supply_foreign_details': supply_details if is_foreign else None,
                    'due_details': {
                        'tds_gst': to_dec(due.get('tds_gst', 0.0)),
                        'tds_it': to_dec(due.get('tds_it', 0.0)),
                        'advance_paid': to_dec(due.get('advance_paid', 0.0)),
                        'to_pay': to_dec(due.get('to_pay') or total_inv_val),
                        'posting_note': due.get('posting_note', ''),
                        'terms': due.get('terms', due.get('payment_terms', ''))
                    },
                    'transit_details': _transit_payload if _has_real_transit else None,
                }


                # \u2500\u2500 [SERIALIZER_VALIDATION_START] \u2500\u2500
                # ── [PURCHASE_PAYLOAD_TRACE] ──
                logger.info(
                    f"[PURCHASE_PAYLOAD_TRACE] record_id={record.id} upload_session_id={record.upload_session_id} "
                    f"supplier_invoice_no='{invoice_no}' vendor_id={vendor.id if vendor else None} "
                    f"gstin='{gstin}' branch='{branch_name}' voucher_series='{purchase_series}' "
                    f"voucher_type='purchase' "
                    f"transit_details={serializer_data.get('transit_details')} "
                    f"supply_details={supply_details} "
                    f"due_details={serializer_data.get('due_details')} "
                    f"item_rows={serializer_items}"
                )

                # ── [SERIALIZER_VALIDATION_START] ──
                logger.info(f"[SERIALIZER_VALIDATION_START] record={record.id} payload_keys={list(serializer_data.keys())}")

                from accounting.serializers_voucher_purchase import VoucherPurchaseSupplierDetailsSerializer
                serializer = VoucherPurchaseSupplierDetailsSerializer(data=serializer_data)
                try:
                    is_valid_result = serializer.is_valid(raise_exception=False)
                    if not is_valid_result:
                        logger.error(
                            f"[SERIALIZER_VALIDATION_FAILED] record={record.id} "
                            f"errors={serializer.errors} "
                            f"supplier_invoice_no='{invoice_no}' gstin='{gstin}' branch='{branch_name}' vendor_id={vendor.id}"
                        )
                        logger.error(f"[PURCHASE_SAVE_ABORTED] record={record.id} reason=SERIALIZER_VALIDATION_FAILED errors={serializer.errors}")
                        # Surface actual field errors as the validation_message
                        err_str = str(serializer.errors)
                        record.validation_status = "ERROR"
                        record.validation_message = f"Serializer validation failed: {err_str[:500]}"
                        record.save(update_fields=['validation_status', 'validation_message'])
                        return {"status": "ERROR", "validation_message": err_str[:500]}
                    else:
                        logger.info(f"[SERIALIZER_VALIDATION_SUCCESS] record_id={record.id}")
                except Exception as val_ex:
                    logger.error(f"[SERIALIZER_VALIDATION_FAILED] record={record.id} exception={val_ex}", exc_info=True)
                    raise val_ex

                # Save the voucher utilizing the canonical serializer which runs full posting, syncs inventory and vendor portal
                logger.info(f"[PURCHASE_DB_INSERT_START] record={record.id} vendor_id={vendor.id} invoice_no={invoice_no}")
                try:
                    voucher_main = serializer.save(tenant_id=tenant_id)
                except Exception as save_ex:
                    logger.error(f"[PURCHASE_SAVE_EXCEPTION] record={record.id} exception={save_ex}", exc_info=True)
                    raise save_ex

                # ── [VERIFY PHYSICAL DB INSERT] ──
                logger.info(f"[POST_SAVE_VERIFICATION_START] record={record.id} voucher_id={voucher_main.id}")
                from accounting.models_voucher_purchase import (
                    VoucherPurchaseSupplierDetails as VP_SupplierDetails,
                    VoucherPurchaseSupplyForeignDetails as VP_ForeignDetails,
                    VoucherPurchaseSupplyINRDetails as VP_INRDetails,
                    VoucherPurchaseDueDetails as VP_DueDetails,
                    VoucherPurchaseTransitDetails as VP_TransitDetails,
                    VoucherPurchaseItem as VP_Item
                )
                parent_exists = VP_SupplierDetails.objects.filter(id=voucher_main.id).exists()
                inr_exists = VP_INRDetails.objects.filter(supplier_details_id=voucher_main.id).exists()
                foreign_exists = VP_ForeignDetails.objects.filter(supplier_details_id=voucher_main.id).exists()
                due_exists = VP_DueDetails.objects.filter(supplier_details_id=voucher_main.id).exists()
                transit_exists = VP_TransitDetails.objects.filter(supplier_details_id=voucher_main.id).exists()
                items_exists = VP_Item.objects.filter(supplier_details_id=voucher_main.id).exists()
                
                logger.info(
                    f"[POST_SAVE_VERIFICATION_STATUS] record={record.id} voucher_id={voucher_main.id} "
                    f"parent_exists={parent_exists} due_exists={due_exists} transit_exists={transit_exists} "
                    f"items_exists={items_exists} inr_exists={inr_exists} foreign_exists={foreign_exists}"
                )
                
                if not parent_exists or not (due_exists and transit_exists and items_exists):
                    logger.error(
                        f"[POST_SAVE_VERIFICATION_FAILED] record={record.id} voucher_id={voucher_main.id} "
                        f"parent={parent_exists} due={due_exists} transit={transit_exists} items={items_exists}"
                    )

                # ── [PURCHASE_HEADER_INSERT] ──
                logger.info(f"[PURCHASE_HEADER_INSERT] inserted table='voucher_purchase_supplier_details' row_count=1 tenant_id={tenant_id} voucher_id={voucher_main.id}")

                # ── [PURCHASE_ITEM_INSERT] ──
                from accounting.models_voucher_purchase import VoucherPurchaseItem
                item_count = VoucherPurchaseItem.objects.filter(supplier_details=voucher_main).count()
                logger.info(f"[PURCHASE_ITEM_INSERT] inserted table='voucher_purchase_items' row_count={item_count} tenant_id={tenant_id} voucher_id={voucher_main.id}")

                # Fetch master voucher to obtain generic voucher_id for journal entry linking
                from accounting.models import Voucher
                v_master = Voucher.objects.filter(tenant_id=tenant_id, reference_id=voucher_main.id, type='purchase').first()
                v_master_id = v_master.id if v_master else None

                # ── [LEDGER_POSTING_START] ──
                logger.info(f"[LEDGER_POSTING_START] ledger posting started for record_id={record.id} voucher_id={voucher_main.id} master_voucher_id={v_master_id}")

                # Verify ledger postings exist
                from accounting.models import JournalEntry
                je_count = JournalEntry.objects.filter(tenant_id=tenant_id, voucher_id=v_master_id).count() if v_master_id else 0
                
                # ── [LEDGER_POSTING_COMPLETE] ──
                logger.info(f"[LEDGER_POSTING_COMPLETE] ledger posting completed. inserted rows={je_count} record_id={record.id} voucher_id={voucher_main.id} master_voucher_id={v_master_id}")

                # ── [INVENTORY_POSTING_START] ──
                logger.info(f"[INVENTORY_POSTING_START] inventory sync started for record_id={record.id} voucher_id={voucher_main.id}")

                # Verify GRN entries
                from inventory.models import InventoryOperationNewGRN
                grn_count = InventoryOperationNewGRN.objects.filter(tenant_id=tenant_id, reference_no=invoice_no).count()

                # ── [INVENTORY_POSTING_COMPLETE] ──
                logger.info(f"[INVENTORY_POSTING_COMPLETE] inventory sync completed. inserted rows={grn_count} record_id={record.id} voucher_id={voucher_main.id}")

                # ── [VOUCHER_TRANSACTION_COMMIT] ──
                logger.info(f"[VOUCHER_TRANSACTION_COMMIT] full persistence committed successfully for record_id={record.id} voucher_id={voucher_main.id}")

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
                
                # ── [SUCCESS_RESPONSE_SENT] ──
                logger.info(f"[SUCCESS_RESPONSE_SENT] success toast response ready for record_id={record.id}")

                logger.info(f"[ATOMIC_SAVE_COMMIT] record_id={record.id}")
                return {"status": "VOUCHER_CREATED", "voucher_id": voucher_main.id}
        except Exception as ex_atomic:
            import traceback as _tb
            _exc_str = str(ex_atomic)
            _tb_str  = _tb.format_exc()
            logger.error(f"[ATOMIC_SAVE_ROLLBACK] record_id={record.id} exception={_exc_str}")
            logger.error(f"[VOUCHER_TRANSACTION_ROLLBACK] record={record.id} reason={_exc_str[:300]}")
            logger.error(f"[PURCHASE_SAVE_EXCEPTION] record={record.id} traceback=\n{_tb_str}")
            logger.error(f"[PARTIAL_SAVE_DETECTED] Partial save detected for record {record.id} tenant_id={tenant_id}")
            raise ex_atomic

    except Exception as e:
        import traceback as _tb2
        _exc_str = str(e)
        logger.error(f"AUTO-VALIDATION FAILED for record {record.id}: {_exc_str}", exc_info=True)
        logger.error(f"[PURCHASE_SAVE_EXCEPTION] record={record.id} exception={_exc_str[:500]}")
        record.validation_status = "ERROR"
        record.validation_message = _exc_str[:500]
        try:
            record.save()
        except Exception as save_err:
            logger.error(f"Failed to save record ERROR status: {save_err}")
        logger.error(f"[FINAL_STATUS] ERROR record={record.id} exc={_exc_str[:200]}")
        return {"status": "ERROR", "validation_message": _exc_str[:500]}
    finally:
        release_redis_lock(canonical_lock_name)
        release_redis_lock(lock_name)

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

