import logging
import json
import copy
from django.db import transaction
from django.utils import timezone
from google import genai
from core.ai_proxy import api_key_manager
from ocr_pipeline.extraction import extract_invoice
from .normalize import (
    normalize, 
    lossless_preserve, 
    is_empty, 
    get_canonical_export_record,
    get_ui_payload,
    normalize_amount
)
from .models import InvoiceTempOCR, InvoicePageResult
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
from core.redis_client import redis_client
from .forensic_merger import get_forensic_merger

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

    logger.info(f"[IDENTITY_ROOT_VALUES] inv='{root_inv}' gstin='{root_gstin}' vendor='{root_vendor}' total={root_total}")

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
        logger.info(f"[IDENTITY_HEADER_VALUES] inv='{nested_inv}' gstin='{nested_gstin}'")

    # 3. FINAL COALESCE (Strict Preservation)
    def _safe_str(val):
        return str(val).strip().upper() if val else ""

    final_inv = _safe_str(root_inv)
    if not final_inv and nested_inv:
        final_inv = _safe_str(nested_inv)
    elif root_inv and nested_inv and _safe_str(root_inv) != _safe_str(nested_inv):
        logger.info(f"[IDENTITY_OVERWRITE_BLOCKED] inv: kept root='{root_inv}' over nested='{nested_inv}'")

    final_gstin = _safe_str(root_gstin)
    if not final_gstin and nested_gstin:
        final_gstin = _safe_str(nested_gstin)
    elif root_gstin and nested_gstin and _safe_str(root_gstin) != _safe_str(nested_gstin):
        logger.info(f"[IDENTITY_OVERWRITE_BLOCKED] gstin: kept root='{root_gstin}' over nested='{nested_gstin}'")

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

def run_ocr_pipeline(file_bytes: bytes, record: InvoiceTempOCR, wait_for_ai: bool = True, item_id: int = None, job_id=None) -> dict:
    """
    SINGLE ENTRY POINT for OCR extraction and immediate validation.
    """
    print("NEW OCR PIPELINE ACTIVE (ASYNC SUPPORT)")
    logger.info(f"Processing record {record.id} | item={item_id} | job={job_id} | wait_for_ai={wait_for_ai}")
    
    try:
        # STEP 0: DEDUPE BYPASS (Strict Verification Path)
        is_reusable = False
        if record.extracted_data:
            logger.info(f"[PIPELINE_BYPASS_ENTER] record_id={record.id}")
            data = record.extracted_data
            
            # Use canonical helper to check content validity
            # (get_canonical_export_record is already imported)
            canonical = get_canonical_export_record(data)
            
            has_invoice = bool(canonical.get("invoice_no"))
            has_vendor = bool(canonical.get("vendor_name"))
            has_items = len(canonical.get("items", [])) > 0
            has_total = float(canonical.get("total_invoice_value") or 0) > 0
            
            # Check for poison keys or error flags
            has_errors = any([
                data.get("_error"),
                data.get("invoice_status") in ["MISSING", "ERROR"],
                "_raw_source" in data and "error" in str(data.get("_raw_source", "")).lower(),
                "CIRCUIT_BREAKER" in str(data).upper()
            ])
            
            if all([has_invoice, has_vendor, has_items, has_total]) and not has_errors:
                logger.info(f"[PIPELINE_BYPASS_SUCCESS] record_id={record.id} Verified success found. Reusing payload.")
                normalized = data
                is_reusable = True
            else:
                reasons = []
                if not has_invoice: reasons.append("MISSING_INVOICE")
                if not has_vendor: reasons.append("MISSING_VENDOR")
                if not has_items: reasons.append("EMPTY_ITEMS")
                if not has_total: reasons.append("ZERO_TOTAL")
                if has_errors: reasons.append("POISONED_CACHE")
                
                logger.warning(f"[CACHE_INVALIDATED] record_id={record.id} reason='{', '.join(reasons)}'. Forcing fresh AI extraction.")
                record.extracted_data = None
                # We do not save here yet, as the extraction phase will update it soon.
                logger.info(f"[AI_REQUEUE_FORCED] record_id={record.id}")
                is_reusable = False

        # STEP 0.5: Page Count calculation for Phase 3 Barrier
        import fitz
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        total_pages = len(doc)
        doc.close()
        logger.info(f"[PIPELINE_TOTAL_PAGES] record={record.id} pages={total_pages}")
        
        if not record.extracted_data:
            record.extracted_data = {'total_pages': total_pages}
        else:
            record.extracted_data['total_pages'] = total_pages
        record.save(update_fields=['extracted_data'])

        if not is_reusable:
            # STEP 1: Process Extraction
            # Phase 1: High-Precision Extraction (Gemini via central Proxy)
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
                job_id=job_id
            )
            
            if not wait_for_ai:
                logger.info(f"[PIPELINE ASYNC] Extraction enqueued for record {record.id}. Returning early.")
                return {"status": "ENQUEUED"}

            if "_error" in extracted:
                raise RuntimeError(f"Extraction Error: {extracted.get('_error')} - {extracted.get('_raw', '')[:100]}...")

            # Phase 2: Hierarchical Normalization
            normalized = normalize(extracted)
            if not normalized:
                raise RuntimeError("Normalization produced empty result")
            
            # ── [PHASE 10] FORENSIC SNAPSHOT (STALENESS PROTECTION) ──
            normalized["_forensics"] = {
                "raw_extraction": extracted,
                "normalized_at": datetime.now().isoformat(),
                "pipeline_version": "2.0-stabilized"
            }

        # ── [RULE #1 & #2] FORENSIC LIFECYCLE LOGGING ──
        p_idx = getattr(record, "page_index", "AGGREGATE")
        logger.info(
            f"[SESSION_FORENSIC] stage='pipeline_entry' "
            f"session={record.upload_session_id} job={job_id} record={record.id} "
            f"index={p_idx} status={record.status} invoice_no={getattr(record, 'supplier_invoice_no', 'PENDING')}"
        )
            
        # Inject folder path for UI visibility (especially for folder-based batch uploads)
        normalized['folder_path'] = record.file_path
        
        # STEP 2: Save extracted data immediately
        record.extracted_data = normalized
        
        # Determine status based on the extraction metadata
        record.status = normalized.get("_status") or 'EXTRACTED'
        if normalized.get("status") == "OCR_FAILED":
            record.status = "OCR_FAILED"
        
        # PERSIST RAW TEXT FOR REPLAY/DEBUG
        raw_text = normalized.get("_pdf_ocr_text") or normalized.get("_raw_text")
        if raw_text:
            record.ocr_raw_text = raw_text
        
        # Flatten critical headers to top-level model fields for easier querying/UI display
        sections = normalized.get("sections", {})
        supplier = sections.get("supplier_details", {})
        
        record.supplier_invoice_no = normalized.get("supplier_invoice_no") or supplier.get("supplier_invoice_no")
        record.gstin = normalized.get("gstin") or supplier.get("gstin")
        record.branch = normalized.get("branch") or supplier.get("branch")
        
        # ── [RULE #2] DETERMINISTIC TRACE ──
        logger.info(
            f"[PIPELINE_TRACE] stage='STAGING' "
            f"session={record.upload_session_id} record={record.id} "
            f"inv_no='{record.supplier_invoice_no}' gstin='{record.gstin}' status={record.status}"
        )
        
        record.save(update_fields=[
            'extracted_data', 'status', 'supplier_invoice_no', 
            'gstin', 'branch', 'ocr_raw_text'
        ])
        logger.info(f"[STAGING SAVE SUCCESS] Record {record.id} saved.")
            
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

def assemble_multi_page_record(record: InvoiceTempOCR):
    """
    PHASE 4: IMMUTABLE FINAL SNAPSHOT ARCHITECTURE
    1. Acquire assembly lock
    2. Group isolated pages by identity markers
    3. Stabilize bill_from addresses
    4. Generate immutable snapshot JSON
    5. Freeze state to FINALIZED
    """
    logger.info(f"[PIPELINE_STAGE_ENTER] stage=ASSEMBLY record={record.id}")
    
    lock_key = f"lock:assembly:{record.id}"
    if not redis_client.get_client().set(lock_key, "1", nx=True, ex=600):
        logger.warning(f"[ASSEMBLY_ALREADY_RUNNING] record={record.id}")
        return {"status": "ALREADY_RUNNING"}

    try:
        from .models import FinalizedSnapshot, PipelineStatus
        
        with transaction.atomic():
            record = InvoiceTempOCR.objects.select_for_update().get(id=record.id)
            
            # [PHASE 2] STATE MACHINE
            record.status = PipelineStatus.SNAPSHOT_BUILDING
            record.save(update_fields=['status'])
            
            # ── [MANDATORY DURABILITY FIX] ──
            # Primary: Durable DB persistence (InvoicePageResult)
            # Secondary: Redis (for caching/performance)
            data = record.extracted_data or {}
            total_expected = data.get('total_pages', 1)
            
            # Fetch all durable results for this record
            db_results = InvoicePageResult.objects.filter(record_id=record.id)
            db_page_map = {res.page_number: res.canonical_payload for res in db_results}
            
            logger.info(f"[ASSEMBLY_DB_AUDIT] record={record.id} expected={total_expected} found_in_db={len(db_page_map)}")

            raw_pages = {}
            for page_num in range(1, total_expected + 1):
                page_redis_key = f"page_data:{record.id}:{page_num}"
                
                # Check DB first (Durable source of truth)
                db_payload = db_page_map.get(page_num)
                if db_payload:
                    raw_pages[str(page_num)] = db_payload
                    # SELF-HEALING: restore Redis cache if missing
                    if not redis_client.get_client().exists(page_redis_key):
                        logger.info(f"[ASSEMBLY_REDIS_RESTORE] record={record.id} page={page_num}")
                        redis_client.get_client().set(page_redis_key, json.dumps(db_payload), ex=7200)
                else:
                    # Tertiary fallback: Legacy extracted_data map
                    legacy_page = data.get('pages_canonical', {}).get(str(page_num))
                    if legacy_page:
                        raw_pages[str(page_num)] = legacy_page
                        logger.warning(f"[ASSEMBLY_LEGACY_FALLBACK] record={record.id} page={page_num}")
                    else:
                        logger.error(f"[ASSEMBLY_PAGE_MISSING] record={record.id} page={page_num} — NO DURABLE DATA FOUND.")

            logger.info(
                f"[ASSEMBLY_QUERY_AUDIT] record={record.id} "
                f"total_expected={total_expected} "
                f"redis_pages_found={len(raw_pages)} "
                f"pages_keys={list(raw_pages.keys())}"
            )
            
            # ── HARD READINESS GUARD ──
            # Verify all page_data Redis keys exist. Abort if ANY are missing.
            # This is the same check performed in check_session_completion, ensuring
            # assembly only runs when every page payload is actually present in Redis.
            missing_pages = []
            for p in range(1, total_expected + 1):
                if str(p) not in raw_pages:
                    missing_pages.append(p)

            logger.info(
                f"[ASSEMBLY_START] record={record.id} "
                f"total_expected={total_expected} "
                f"redis_pages_found={len(raw_pages)} "
                f"missing={missing_pages}"
            )

            if missing_pages:
                logger.error(
                    f"[ASSEMBLY_ABORT_MISSING_PAGES] record={record.id} "
                    f"missing={missing_pages}. Refusing to build empty snapshot."
                )
                return {"status": "WAITING_FOR_PAGES"}

            # ── PHASE 11: FORENSIC SEMANTIC ASSEMBLY ──
            sorted_keys = sorted(raw_pages.keys(), key=lambda x: int(x))
            merger = get_forensic_merger()
            
            # Prepare pages for merger (Ensure _raw_text is available for markers)
            pages_list = []
            for k in sorted_keys:
                p = copy.deepcopy(raw_pages[k])
                if "_pdf_ocr_text" in p and "_raw_text" not in p:
                    p["_raw_text"] = p["_pdf_ocr_text"]
                p["_page_no"] = int(k)
                pages_list.append(p)

            # Step 1: Group semantically using ForensicMerger
            groups_dict = merger.group_invoices(pages_list)
            
            # Step 2: Merge groups using ForensicMerger rules
            assembled_exports = []
            for group_key, group_list in groups_dict.items():
                logger.info(f"[ASSEMBLY_GROUPING] key='{group_key}' size={len(group_list)}")
                merged_inv = merger.merge_group(group_list)
                assembled_exports.append(merged_inv)

            logger.info(f"[ASSEMBLY_FINAL_COLLECTION] assembled_count={len(assembled_exports)}")
            final_invoices = []
            for idx, inv in enumerate(assembled_exports):
                ui_record = get_ui_payload(inv)
                logger.info(f"[ASSEMBLY_UI_BUILD] index={idx} keys={list(ui_record.keys())}")
                final_invoices.append(ui_record)

            # ── PHASE 11: PRELIMINARY DATA SAVE ──
            # This allows the UI to render the results "instantly" while the 
            # snapshot is being constructed.
            data['invoices'] = final_invoices
            data['assembled_exports'] = assembled_exports
            record.extracted_data = data
            record.save(update_fields=['extracted_data'])

            # ── PHASE 4: IMMUTABLE SNAPSHOT CREATION ──
            snapshot = FinalizedSnapshot.objects.create(
                session_id=record.upload_session_id,
                tenant_id=record.tenant_id,
                job_id=record.group_id,
                snapshot_json={
                    "invoices": final_invoices,
                    "raw_assembly": assembled_exports,
                    "metadata": {
                        "total_pages": total_expected,
                        "assembled_at": datetime.now().isoformat(),
                        "original_record_id": record.id
                    }
                },
                invoice_count=len(final_invoices)
            )
            logger.info(f"[SNAPSHOT_CREATED] id={snapshot.id} session={record.upload_session_id} count={len(final_invoices)}")
            
            logger.info(f"[SNAPSHOT_BUILD_COMPLETE] snapshot_id={snapshot.id} record={record.id} invoices={len(final_invoices)}")

            # ── PHASE 15: FINALIZED STATE BARRIER ──
            record.status = PipelineStatus.FINALIZED
            record.save(update_fields=['status'])
            
            # ── [RULE #2] DETERMINISTIC TRACE ──
            logger.info(
                f"[PIPELINE_TRACE] stage='FINALIZED' "
                f"session={record.upload_session_id} record={record.id} "
                f"snapshot={snapshot.id} invoices={len(final_invoices)}"
            )
            
            logger.info(f"[PIPELINE_STAGE_EXIT] stage=ASSEMBLY_FINALIZED record={record.id} snapshot={snapshot.id}")
            
            # ── [PHASE 15] TERMINATION ──
            # Snapshots are the terminal source of truth for the UI.
            return {
                "status": "FINALIZED",
                "snapshot_id": snapshot.id,
                "invoice_count": len(final_invoices)
            }

    except Exception as e:
        logger.error(f"[ASSEMBLY_FATAL_ERROR] record={record.id}: {str(e)}")
        logger.error(traceback.format_exc())
        return {"status": "ERROR", "error": str(e)}
    finally:
        redis_client.get_client().delete(lock_key)

def finalize_merged_records(records, auto_save: bool = True):
    """
    Groups and merges multi-page invoices into a single voucher.
    """
    if not records:
        return {"status": "ERROR", "error": "No records to merge"}
    
    if len(records) == 1:
        return validate_and_process(records[0], auto_save=auto_save)
    
    print(f"MERGING {len(records)} records for multi-page processing...")
    
    # ── Phase 1: Aggregation (Strict Rules per user request) ──
    primary = records[0] # FIRST record
    last_record = records[-1] # LAST record
    
    all_items = []
    for r in records:
        data = r.extracted_data or {}
        
        # ── MULTIPAGE_SKIP_EMPTY_PAGE (Phase 5) ──
        if data.get("_status") == "AI_FAILED" or not data:
            logger.warning(f"[MULTIPAGE_SKIP_EMPTY_PAGE] Record {r.id} has AI failure. Excluding from merge.")
            continue
            
        sections = data.get("sections", {})
        items = sections.get("items", [])
        if not items and not data.get("supplier_invoice_no"):
             logger.warning(f"[MULTIPAGE_SKIP_EMPTY_PAGE] Record {r.id} is empty (No items/invoice). Excluding.")
             continue
             
        all_items.extend(items)
            
    # ── Phase 2: Create a virtual merged state ──
    if not primary.extracted_data:
        return {"status": "ERROR", "error": "Primary record has no extracted data"}
        
    merged_data = primary.extracted_data.copy()
    if "sections" not in merged_data: merged_data["sections"] = {}
    
    # 1. Header: already from primary (records[0])
    
    # 2. Line Items: Aggregate
    merged_data["sections"]["items"] = all_items
    
    # 3. Totals / Taxes / Charges: From LAST record
    last_extracted = last_record.extracted_data or {}
    last_sections = last_extracted.get("sections", {})
    merged_data["sections"]["supply_details"] = last_sections.get("supply_details", {})
    merged_data["sections"]["due_details"] = last_sections.get("due_details", {})
    merged_data["sections"]["transit_details"] = last_sections.get("transit_details", {})
    
    # ── Phase 2.5: Re-Normalize ──
    # Important: Clear _raw_source so normalize() uses the newly merged items and totals
    if "_raw_source" in merged_data:
        del merged_data["_raw_source"]
    
    # Re-run normalization to trigger tax type reconciliation across the combined items
    print("RE-NORMALIZING merged multi-page record to reconcile tax types...")
    merged_data = normalize(merged_data)
    
    # Update top-level field for consistency (Lossless)
    if last_record.extracted_data:
        incoming_total = last_record.extracted_data.get("total_invoice_value")
        merged_data["total_invoice_value"] = lossless_preserve(
            merged_data.get("total_invoice_value"), 
            incoming_total, 
            "total_invoice_value"
        )
        
    primary.extracted_data = merged_data
    # We save temporarily to allow validate_and_process to work with DB data
    primary.save()
    
    # ── Phase 3: Process the merged record ──
    res = validate_and_process(primary, auto_save=auto_save)
    
    # ── Phase 4: Sync status to other pages ──
    if res.get("status") == "VOUCHER_CREATED":
        v_id = res.get("voucher_id")
        for r in records[1:]:
            r.processed = True
            r.validation_status = "VOUCHER_CREATED"
            r.status = "VOUCHER_CREATED"
            r.voucher_id = v_id
            r.save()
            
    return res

def validate_and_process(record: InvoiceTempOCR, auto_save: bool = False, **kwargs):
    """
    CORE VALIDATION FUNCTION: 
    Checks for Vendor, Duplicates, and optionally creates Voucher.
    """
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
                                    'status': 'EXTRACTED'
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
        canonical = get_canonical_export_record(data)
        gstin = (canonical.get("gstin") or "").strip().upper()
        invoice_no = (canonical.get("invoice_no") or "").strip()
        vendor_name = (canonical.get("vendor_name") or "").strip()
        branch_name = (canonical.get("branch") or record.branch or "").strip()
        tenant_id = str(record.tenant_id)

        print("GSTIN:", gstin)
        print("INVOICE:", invoice_no)

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
                print(f"FAST PATH: Using stored vendor_id={record.vendor_id} for {vendor.vendor_name}")
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
                print(f"STRICT MATCH FOUND: {vendor.vendor_name if vendor else 'Unknown'}")
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
        print("DUPLICATE CHECK:", is_duplicate)

        if is_duplicate:
            record.validation_status = "DUPLICATE"
            record.save()
            print("FINAL STATUS: DUPLICATE")
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
                record.validation_status = "NEED_VENDOR"
                record.save()
                return {"status": "NEED_VENDOR"}

        # Sync vendor name from master if found
        if vendor:
             vendor_name = vendor.vendor_name

        # 🔹 CREATE PURCHASE VOUCHER (ONLY IF auto_save IS TRUE)
        if not auto_save:
            record.validation_status = "READY"
            record.save()
            print("FINAL STATUS: READY (Waiting for manual finalization)")
            return {"status": "READY"}

        # Using the Pipeline 2 logic refined earlier
        with transaction.atomic():
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
            
            print(f"FINAL STATUS: VOUCHER_CREATED (Voucher={voucher_main.id})")
            return {"status": "VOUCHER_CREATED", "voucher_id": voucher_main.id}

    except Exception as e:
        logger.error(f"AUTO-VALIDATION FAILED for record {record.id}: {str(e)}")
        record.validation_status = "ERROR"
        record.validation_message = str(e)
        record.save()
        print("FINAL STATUS: ERROR (Exception)")
        return {"status": "ERROR"}

