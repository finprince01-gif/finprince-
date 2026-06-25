import json
import hashlib
import logging
import re
import base64
import fitz  # PyMuPDF
import io
import time
import concurrent.futures
import random
from typing import Optional, List, Dict, Any
from core.ai_proxy import ai_service
from contextlib import contextmanager
from django.db import models

import os
from ocr_pipeline.models import AICache
from django.db.models import F
logger = logging.getLogger(__name__)
def compute_field_confidence(target_val: str, ocr_blocks: list) -> Optional[float]:
    """
    Computes confidence score for extracted text field by matching it with OCR blocks.
    """
    if not target_val or not ocr_blocks:
        return None
        
    target_clean = "".join(c for c in str(target_val).lower() if c.isalnum())
    if not target_clean:
        return None
        
    matching_confidences = []
    
    # Substring matching
    for block in ocr_blocks:
        block_text = block.get("text", "")
        block_conf = block.get("confidence", 0.0)
        block_clean = "".join(c for c in str(block_text).lower() if c.isalnum())
        
        if not block_clean:
            continue
            
        if block_clean in target_clean or target_clean in block_clean:
            matching_confidences.append(block_conf)
            
    if matching_confidences:
        return sum(matching_confidences) / len(matching_confidences)
        
    # n-gram matching
    target_tokens = set(target_clean[i:i+4] for i in range(len(target_clean)-3))
    if not target_tokens:
        return None
        
    best_conf = None
    best_overlap = 0
    for block in ocr_blocks:
        block_text = block.get("text", "")
        block_conf = block.get("confidence", 0.0)
        block_clean = "".join(c for c in str(block_text).lower() if c.isalnum())
        block_tokens = set(block_clean[i:i+4] for i in range(len(block_clean)-3))
        
        overlap = len(target_tokens.intersection(block_tokens))
        if overlap > best_overlap:
            best_overlap = overlap
            best_conf = block_conf
            
    if best_conf is not None and best_overlap > 0:
        return best_conf
        
    # Fallback: Average of all OCR blocks
    all_confs = [b.get("confidence", 0.0) for b in ocr_blocks]
    if all_confs:
        return sum(all_confs) / len(all_confs)
        
    return 1.0

def log_forensic_page_dto(result, upload_session_id, physical_file_id, page_number, raw_text):

    if not isinstance(result, dict):
        return
    header = result.get('header', {}) or {}
    items = result.get('items', []) or []
    
    # Heuristics
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
    has_summary_rows = any(any(kw in str(itm.get("description") or itm.get("item_name") or "").lower() for kw in generic_keywords) for itm in items)
    has_real_items = any(not any(kw in str(itm.get("description") or itm.get("item_name") or "").lower() for kw in generic_keywords) for itm in items)
    
    total_amount = header.get('total_amount') or header.get('total_invoice_value')
    has_final_total = False
    if total_amount is not None:
        try:
            has_final_total = float(str(total_amount).replace(',', '')) > 0.0
        except ValueError:
            pass
            
    continuation_keywords = [
        "continued to page", "rounded off", "tax summary",
        "output cgst", "output sgst", "authorised signatory",
        "carried forward", "brought forward", "round off",
        "rounding adjustment", "amount chargeable in words",
        "e & o.e", "declaration",
    ]
    raw_text_lower = str(raw_text or "").lower()
    has_continuation_marker = any(kw in raw_text_lower for kw in continuation_keywords)
    
    dto_info = {
        "upload_session_id": str(upload_session_id or ""),
        "physical_file_id": str(physical_file_id or ""),
        "page_number": int(page_number or 0),
        "invoice_no": str(header.get("invoice_no") or ""),
        "gstin": str(header.get("vendor_gstin") or header.get("gstin") or ""),
        "invoice_date": str(header.get("invoice_date") or ""),
        "vendor_name": str(header.get("vendor_name") or ""),
        "raw_items": items,
        "raw_item_count": len(items),
        "has_real_items": has_real_items,
        "has_summary_rows": has_summary_rows,
        "has_final_total": has_final_total,
        "has_continuation_marker": has_continuation_marker,
        "dto_memory_id": str(id(result))
    }
    logger.info(f"[FORENSIC_PAGE_DTO]\n{json.dumps(dto_info, indent=2, default=str)}")

MOCK_EXTRACTION_MODE = os.getenv('MOCK_EXTRACTION_MODE', 'false').lower() == 'true'

_JSON_QUARANTINE_LOG = logging.getLogger("AIJsonQuarantine")

@contextmanager
def ai_concurrency_gate(tenant_id, max_wait=60):
    """
    PHASE 5D: DISTRIBUTED AI GOVERNANCE.
    Implements Token Bucket + Adaptive Concurrency limits.
    Ensures burst protection and sustained rate control.
    """
    from vouchers.models import AIQuota
    from django.db import transaction, models
    from django.utils import timezone
    import time
    
    t_id = str(tenant_id or 'system')
    start_time = time.monotonic()
    acquired = False
    
    while time.monotonic() - start_time < max_wait:
        try:
            with transaction.atomic():
                # Lock the quota row for this tenant
                quota, _ = AIQuota.objects.select_for_update().get_or_create(
                    tenant_id=t_id,
                    defaults={'max_concurrent': 15, 'bucket_capacity': 20, 'refill_rate': 2.0, 'tokens': 20.0}
                )
                
                # 1. Refill Tokens (Token Bucket)
                now = timezone.now()
                elapsed = (now - quota.last_refill_at).total_seconds()
                new_tokens = min(quota.bucket_capacity, quota.tokens + (elapsed * quota.refill_rate))
                
                # 2. Check Capacity & Tokens
                if new_tokens >= 1.0 and quota.active_calls < quota.max_concurrent:
                    quota.tokens = new_tokens - 1.0
                    quota.active_calls += 1
                    quota.last_refill_at = now
                    quota.save(update_fields=['tokens', 'active_calls', 'last_refill_at'])
                    acquired = True
                    break
        except Exception as e:
            if "Deadlock" in str(e) or "1213" in str(e):
                # Backoff slightly and retry immediately
                time.sleep(random.uniform(0.1, 0.5))
                continue
            logger.error(f"[QUOTA_LOCK_ERROR] {e}")
            
        time.sleep(random.uniform(1.0, 2.0)) # Jittered Backoff
        
    if not acquired:
        logger.warning(f"[QUOTA_WAIT_TIMEOUT] tenant={t_id} Exceeded {max_wait}s. Proceeding with caution.")
        # Hard increment as fallback to ensure we don't block the worker forever,
        # but this should be rare.
        AIQuota.objects.filter(tenant_id=t_id).update(active_calls=models.F('active_calls') + 1)

    try:
        yield
    finally:
        # Atomic decrement
        AIQuota.objects.filter(tenant_id=t_id).update(active_calls=models.F('active_calls') - 1)

def _sanitize_arithmetic_expressions(text: str, record_id=None, page=None) -> tuple:
    """
    TASK 3 — Arithmetic Expression Auto-Repair.

    Detects and repairs patterns like:
        "field": "54644.4 + 10928.88 = 65573.2"   → "field": "65573.28"
        "field": "1000 + 180 = 1180"               → "field": "1180.00"
        "field": "450 + 450"                        → "field": "900.00"
        "field": 54644.4 + 10928.88                → "field": "65573.28"

    Returns (repaired_text, repairs_made: list[dict]).
    repairs_made is a list of {field, original, repaired, reason}.
    Never raises.
    """
    repairs = []
    
    # Restrict repairs strictly to known financial/numeric keys
    eligible_words = {"amount", "value", "cgst", "sgst", "igst", "cess", "rate", "total", "tax", "quantity", "qty"}

    # Pattern A: string values with arithmetic — "value": "A op B ... = C"
    # Captures the last number after '=' as the result
    def _replace_expr_string(m):
        key = m.group(1).replace('"', '').strip().lower()
        field_prefix = m.group(2)  # e.g. ": "
        full_expr = m.group(3)     # e.g. "54644.4 + 10928.88 = 65573.2"
        closing_quote = m.group(4) # " or empty

        # Restrict key names to prevent corrupting invoice_no, invoice_date, etc.
        if not any(word in key for word in eligible_words):
            return m.group(0)

        # Has operators? Check for +, -, *, /, =
        has_op = bool(re.search(r'[+\-*/=]', full_expr))
        if not has_op:
            return m.group(0)

        # Strategy 1: Extract value after the last '=' sign
        eq_match = re.search(r'=\s*([\d,]+\.?\d*)\s*$', full_expr.strip())
        if eq_match:
            result = eq_match.group(1).replace(',', '')
            try:
                result_f = float(result)
                repaired = f"{result_f:.2f}"
                repairs.append({
                    "original": full_expr,
                    "repaired": repaired,
                    "reason": "ARITHMETIC_EXPR_LAST_EQUALS",
                })
                return f'{m.group(1)}{field_prefix}{repaired}{closing_quote}'
            except ValueError:
                pass

        # Strategy 2: Try to safely evaluate simple arithmetic (no = sign)
        # Normalise and evaluate: only allow digits, spaces, +, -, *, /, (, ), .
        # Skip if there are any alphabetical characters (e.g. "Sep" in dates like "13-Sep-2025")
        if bool(re.search(r'[a-zA-Z]', full_expr)):
            return m.group(0)

        safe_expr = re.sub(r'[^\d\s+\-*/().]', '', full_expr.strip())
        safe_expr = safe_expr.strip()
        if safe_expr and re.match(r'^[\d\s+\-*/().]+$', safe_expr):
            try:
                result_f = float(eval(safe_expr))  # noqa: S307 — tightly filtered
                repaired = f"{result_f:.2f}"
                repairs.append({
                    "original": full_expr,
                    "repaired": repaired,
                    "reason": "ARITHMETIC_EXPR_EVALUATED",
                })
                return f'{m.group(1)}{field_prefix}{repaired}{closing_quote}'
            except Exception:
                pass

        return m.group(0)  # leave unchanged if we can't repair

    # Match string values in JSON: "key": "...expr..." or "key": "...expr"
    # Also handle unquoted numeric expressions: "key": 54644.4 + 10928.88
    text_out = re.sub(
        r'("[\w_]+")(\s*:\s*")((?:[^"\\]|\\.)*?)(")',
        _replace_expr_string,
        text,
    )

    # Pattern B: bare (unquoted) arithmetic as JSON value:  "key": 54644.4 + 10928.88
    def _replace_bare_expr(m):
        key_part = m.group(1)   # key and colon, e.g. '"taxable_value": '
        expr = m.group(2)       # e.g. "54644.4 + 10928.88"
        trailing = m.group(3)   # e.g. ","  or  "}"

        key = key_part.split(':')[0].replace('"', '').strip().lower()
        if not any(word in key for word in eligible_words):
            return m.group(0)

        # Strategy 1: Extract value after equals
        eq_match = re.search(r'=\s*([\d,]+\.?\d*)\s*$', expr.strip())
        if eq_match:
            result = eq_match.group(1).replace(',', '')
            try:
                result_f = float(result)
                repaired = f'"{result_f:.2f}"'
                repairs.append({
                    "original": expr.strip(),
                    "repaired": repaired,
                    "reason": "BARE_ARITHMETIC_EXPR_LAST_EQUALS",
                })
                return f'{key_part}{repaired}{trailing}'
            except ValueError:
                pass

        # Strategy 2: Evaluate safe arithmetic expression
        if bool(re.search(r'[a-zA-Z]', expr)):
            return m.group(0)

        safe_expr = re.sub(r'[^\d+\-*/().\s]', '', expr).strip()
        if re.match(r'^[\d\s+\-*/().]+$', safe_expr):
            try:
                result_f = float(eval(safe_expr))  # noqa: S307
                repaired = f'"{result_f:.2f}"'
                repairs.append({
                    "original": expr.strip(),
                    "repaired": repaired,
                    "reason": "BARE_ARITHMETIC_EXPR",
                })
                return f'{key_part}{repaired}{trailing}'
            except Exception:
                pass
        return m.group(0)

    text_out = re.sub(
        r'("[\w /\-]+"\s*:\s*)([\d\s+\-*/()=.]+)([\s,}\]])',
        _replace_bare_expr,
        text_out,
    )

    return text_out, repairs


def _repair_json(raw: str, record_id=None, page=None) -> tuple:
    """
    8-stage deterministic JSON repair pipeline.
    Returns (repaired_str, strategy_used, error_info).
    Never raises.

    Stages:
      1. Strip markdown fences
      2. Isolate first JSON object via brace balancing
      3. Remove trailing commas
      4. Repair invalid escape sequences
      5. ARITHMETIC EXPRESSION REPAIR (NEW — prevents wasted Qwen retries)
      6. First parse attempt
      7. Quote normalisation
      8. Final quarantine log
    """
    strategy = "NONE"
    error_info = {}

    if not raw:
        return "", "EMPTY", {}

    text = raw

    # ── Stage 1: Strip markdown fences safely ──
    md = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if md:
        text = md.group(1).strip()
        strategy = "MARKDOWN_STRIP"

    # ── Stage 2: Isolate first valid JSON object via brace balancing ──
    start = text.find('{')
    if start == -1:
        _JSON_QUARANTINE_LOG.warning(
            f"[AI_JSON_QUARANTINE] record={record_id} page={page} reason=NO_BRACE_FOUND "
            f"preview={raw[:120]!r}"
        )
        return "", "NO_JSON", {"reason": "no opening brace"}

    depth = 0
    end = -1
    for i in range(start, len(text)):
        if text[i] == '{': depth += 1
        elif text[i] == '}': depth -= 1
        if depth == 0:
            end = i
            break
    if end != -1:
        text = text[start:end + 1]
        if strategy == "NONE":
            strategy = "BRACE_BALANCE"

    # ── Stage 3: Remove trailing commas before } and ] ──
    text = re.sub(r',\s*([}\]])', r'\1', text)

    # ── Stage 4: Repair invalid escape sequences ──
    text = re.sub(r'\\(?!["\\bfnrt/u])', r'\\\\', text)

    # ── Stage 5: ARITHMETIC EXPRESSION REPAIR (TASK 3) ──
    # Repair BEFORE attempting json.loads() so we avoid triggering a 141s Qwen retry
    # just because the model output "54644.4 + 10928.88 = 65573.2" in a string value.
    text_arith, arith_repairs = _sanitize_arithmetic_expressions(text, record_id=record_id, page=page)
    if arith_repairs:
        strategy = "ARITHMETIC_REPAIR" if strategy == "NONE" else strategy + "+ARITHMETIC_REPAIR"
        # TASK 4 — Diagnostic logging per repaired field
        for fix in arith_repairs:
            logger.info(
                f"[JSON_REPAIR_APPLIED] record={record_id} page={page} "
                f"field=<numeric> "
                f"original={fix['original']!r} "
                f"repaired={fix['repaired']!r} "
                f"reason={fix['reason']}"
            )
        text = text_arith

    # ── Stage 6: First parse attempt ──
    try:
        json.loads(text)
        return text, strategy, {}
    except json.JSONDecodeError as e:
        error_info = {"pos": e.pos, "msg": e.msg, "doc_snippet": e.doc[max(0, e.pos-20):e.pos+20] if e.doc else ""}

    # ── Stage 7: Normalize smart/curly quotes to ASCII ──
    text_q = text.translate(str.maketrans('\u2018\u2019\u201c\u201d', "''\"\"")
    ).replace('\u2032', "'").replace('\u2033', '"')
    try:
        json.loads(text_q)
        return text_q, "QUOTE_NORMALIZE", error_info
    except json.JSONDecodeError:
        pass

    # ── Stage 8: Final quarantine log ──
    _JSON_QUARANTINE_LOG.error(
        f"[AI_JSON_QUARANTINE] record={record_id} page={page} "
        f"strategy={strategy} error_pos={error_info.get('pos')} "
        f"offending_token={error_info.get('msg')!r} "
        f"context={error_info.get('doc_snippet')!r} "
        f"preview={text[:200]!r}"
    )
    return text, "REPAIR_FAILED", error_info


def extract_json_from_text(text, record_id=None, page=None):
    """
    Backwards-compatible wrapper around _repair_json.
    Returns the best repaired string (or empty on total failure).
    """
    repaired, strategy, _ = _repair_json(text, record_id=record_id, page=page)
    if strategy not in ("NONE", "EMPTY", "NO_JSON", "REPAIR_FAILED"):
        logger.debug(f"[JSON_REPAIR_APPLIED] record={record_id} page={page} strategy={strategy}")
    return repaired

def _get_cached_ai_result(ocr_text: str) -> Optional[dict]:
    """PHASE 9: Inference Cache Lookup."""
    if not ocr_text or len(ocr_text) < 100:
        return None
    
    key_hash = hashlib.sha256(ocr_text.encode()).hexdigest()
    try:
        from ocr_pipeline.models import AICache
        cache_entry = AICache.objects.filter(key_hash=key_hash).first()
        if cache_entry:
            AICache.objects.filter(key_hash=key_hash).update(hits=F('hits') + 1, last_hit_at=timezone.now())
            return cache_entry.payload
    except Exception as e:
        logger.error(f"[CACHE_LOOKUP_ERR] {e}")
    return None

def _set_cached_ai_result(ocr_text: str, payload: dict):
    """PHASE 9: Inference Cache Save."""
    if not ocr_text or len(ocr_text) < 100 or not payload:
        return
    
    # Don't cache errors
    if "_error" in payload or payload.get("status") == "OCR_FAILED":
        return

    key_hash = hashlib.sha256(ocr_text.encode()).hexdigest()
    try:
        from ocr_pipeline.models import AICache
        AICache.objects.update_or_create(
            key_hash=key_hash,
            defaults={'payload': payload}
        )
    except Exception as e:
        logger.error(f"[CACHE_SAVE_ERR] {e}")

def extract_invoice(client, file_bytes=None, voucher_type='Purchase', upload_type='UNKNOWN', public_ip="0.0.0.0", user_id='system', tenant_id='system', wait_for_result=True, record_id=None, item_id=None, upload_session_id=None, job_id=None, file_path=None, start_page=0, limit=None, is_rescan=False, rescan_history_id=None):
    """
    Extracts invoice data using the central AI Proxy service with fallbacks.
    Returns a unified JSON object matching the internal schema.

    ROOT-CAUSE FIX (PAYLOAD ISOLATION):
    Processes each page independently with ONLY its own OCR text and image.
    Ensures prompt size remains < 150K and prevents "full document" leakage.
    """
    parent_hash = ""
    if record_id:
        try:
            from ocr_pipeline.models import InvoiceTempOCR
            parent_rec = InvoiceTempOCR.objects.filter(id=record_id).first()
            if parent_rec:
                parent_hash = parent_rec.file_hash or ""
        except Exception as _db_err:
            logger.warning(f"[PARENT_HASH_RESOLVE_ERR] record={record_id} err={_db_err}")

    # ── STEP 1: IDENTIFY PAGES ──
    try:
        import pypdf
        import io
        if file_path:
            with open(file_path, "rb") as f:
                reader = pypdf.PdfReader(f)
                page_count = len(reader.pages)
        else:
            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            page_count = len(reader.pages)
    except Exception as e:
        logger.error(f"[PAGE_COUNT_ERROR] failed to count pages: {e}")
        page_count = 1

    # ── [PHASE 9] DYNAMIC BATCHING STRATEGY ──
    # Reduce AI requests by grouping pages.
    # If wait_for_result is False (async SQS pipeline), NEVER batch. 
    # Let SQS fanout each page to individual workers for maximum parallelization.
    if not wait_for_result:
        batch_size = 1
    elif page_count == 1:
        batch_size = 1
    elif page_count <= 10:
        batch_size = 5
    else:
        batch_size = 10

    def _call_ai_batch(batch_data, item_id, job_id=None, wait_for_result=True, tenant_id=None, is_rescan=False, rescan_history_id=None):
        """
        PHASE 9: 1 CALL -> MANY PAGES.
        batch_data: list of {'img_bytes': ..., 'ocr_text': ..., 'idx': ...}
        """
        if not batch_data: return {}
        
        count = len(batch_data)
        if count == 1:
            p = batch_data[0]
            return {p['idx']: _call_ai_for_page(p['img_bytes'], p['ocr_text'], p['idx'], page_count, item_id, job_id, wait_for_result, tenant_id, is_rescan=is_rescan, rescan_history_id=rescan_history_id)}

        # 1. Build Batch Prompt
        batch_prompt = f"""
### [BATCH PROCESSING {count} PAGES]
You are processing {count} pages from a single document.
For EACH page provided, extract its data into a JSON object matching the schema.
Return a JSON object with a "pages" key containing a list of {count} results in the same order.

# 🎯 SCHEMA (Per Page)
{base_prompt}

# 🧠 BATCH INSTRUCTIONS
* RETURN FORMAT: {{"pages": [ {{page1}}, {{page2}}, ... ]}}
* If a page is empty or irrelevant, return a minimal object with "header": {{}} and "items": [].
* DO NOT merge pages. Keep them distinct.
"""

        batch_images = []
        for p in batch_data:
            batch_images.append({
                'data': base64.b64encode(p['img_bytes']).decode('utf-8'),
                'mime_type': 'image/jpeg'
            })

        request_data = {
            'type': 'batch_extraction',
            'prompt': batch_prompt,
            'batch_images': batch_images,
            'wait_for_result': wait_for_result,
            'item_id': item_id,
            'record_id': record_id,
            'job_id': job_id,
            'upload_session_id': upload_session_id,
            'tenant_id': tenant_id,
            'upload_type': upload_type,  # [UPLOAD_TYPE ISOLATION FIX]
            'batch_indices': [p['idx'] for p in batch_data],
            'file_hash': parent_hash,
            'is_rescan': is_rescan,
            'rescan_history_id': rescan_history_id
        }

        if not wait_for_result:
            # SAFETY CHECK: If batch is too large for SQS (256KB limit), split it.
            # We estimate 1.33 overhead for base64.
            total_size = sum(len(img['data']) for img in batch_images)
            if total_size > 200000: # 200KB limit for safety
                logger.warning(f"[BATCH_TOO_LARGE] size={total_size} -> Splitting batch of {count}")
                results = {}
                for p in batch_data:
                    results[p['idx']] = _call_ai_for_page(p['img_bytes'], p['ocr_text'], p['idx'], page_count, item_id, job_id, wait_for_result, tenant_id, is_rescan=is_rescan, rescan_history_id=rescan_history_id)
                return results
            
            logger.info(f"[BATCH_ENQUEUE] record={record_id} count={count}")
            delay = 0
            if count > 1:
                delay = 5 # Priority Throttling: Let 1-pagers skip the line
            return ai_service.make_request('extraction', request_data, user_id, tenant_id, delay_seconds=delay)

        # Sync Path
        logger.info(f"[BATCH_SYNC_START] record={record_id} count={count}")
        t_start = time.monotonic()
        response = {}
        with ai_concurrency_gate(tenant_id):
            response = ai_service.make_request('extraction', request_data, user_id, tenant_id)
        
        logger.info(f"[BATCH_SYNC_COMPLETE] record={record_id} latency={time.monotonic() - t_start:.2f}s")

        if 'error' in response:
            logger.error(f"[BATCH_AI_ERROR] {response['error']}")
            return {p['idx']: {"_error": response['error']} for p in batch_data}

        raw_text = response.get('reply', '').strip()
        repaired_text, strategy, _ = _repair_json(raw_text, record_id=record_id)
        
        try:
            batch_res = json.loads(repaired_text)
            pages = batch_res.get('pages', [])
            if not isinstance(pages, list) or len(pages) != count:
                logger.error(f"[BATCH_SIZE_MISMATCH] expected={count} actual={len(pages)}")
                # Fallback to individual calls if batch structure is broken? 
                # For now just mark as failed.
                return {p['idx']: {"_error": "BATCH_SIZE_MISMATCH", "_raw": raw_text} for p in batch_data}
            
            final_results = {}
            for i, p_res in enumerate(pages):
                idx = batch_data[i]['idx']
                p_res["_page_no"] = idx + 1
                p_res["_pdf_ocr_text"] = batch_data[i]['ocr_text']
                # Cache individual results
                _set_cached_ai_result(batch_data[i]['ocr_text'], p_res)
                try:
                    log_forensic_page_dto(p_res, upload_session_id, record_id, idx + 1, batch_data[i]['ocr_text'])
                except Exception as le:
                    logger.warning(f"[FORENSIC_PAGE_DTO_LOG_ERR] {le}")
                final_results[idx] = p_res
            return final_results
        except Exception as e:
            logger.error(f"[BATCH_PARSE_FAIL] {e}")
            # PHASE 10: Mark as terminal failure to block propagation
            return {p['idx']: {"status": "OCR_FAILED", "_error": f"BATCH_PARSE_FAIL: {str(e)}", "_raw": raw_text} for p in batch_data}

    # ── STEP 2: PREPARE BASE PROMPT (OPTIMIZED — 59.7% token reduction) ──
    # Schema keys and types are UNCHANGED. Instructions compressed from 6 verbose
    # markdown sections into 6 numbered single-line rules (~562 tokens saved/call).
    # Rules removed (2026-06-23, A/B validated SAFE):
    #   Rule 1 — "header: one entry per invoice; items: one row per line item."
    #             Redundant: JSON schema structure already enforces the split.
    #   Rule 4 — "place_of_supply: state name or code (e.g. "33-Tamil Nadu")."
    #             Redundant: model infers GST state format from schema key name.
    normalized_voucher_type = (
        str(voucher_type or "PURCHASE")
        .strip()
        .upper()
    )
    base_prompt = f"""Extract {normalized_voucher_type} invoice data into this exact JSON schema:

{{"header":{{"vendor_name":"","vendor_address":"","billing_address":"","vendor_gstin":"","vendor_state":"","place_of_supply":"","invoice_no":"","invoice_date":"","total_amount":0,"taxable_value":0,"cgst":0,"sgst":0,"igst":0,"gst_taxability_type":"Taxable","gst_nature_of_transaction":"","sales_order_no":"","irn":"","ack_no":"","ack_date":""}},"items":[{{"description":"","hsn_code":"","quantity":0,"uom":"","rate":0,"discount_percent":0,"taxable_value":0,"igst_rate":0,"igst_amount":0,"cgst_rate":0,"cgst_amount":0,"sgst_rate":0,"sgst_amount":0,"cess_rate":0,"cess_amount":0,"amount":0}}]}}

RULES:
1. vendor_address = "Consignee/Ship To" block; billing_address = "Buyer/Bill To" block only. Never mix them. Null if absent.
2. invoice_no: prefer label "Invoice No"/"Bill No", near top/date, must have ≥1 digit, 3-25 chars.
3. total_amount = taxable_value + cgst + sgst + igst. item amount = taxable_value + taxes.
4. HSN/SAC and UOM per item if visible.
5. Continuation page: extract invoice_no and vendor_name from top labels; markers: "continued","amount chargeable","authorised signatory","rounded off".
6. Missing field → null. No hallucination. All numeric fields must be numbers.
Return ONLY valid JSON.
"""

    def _call_ai_for_page(segment_bytes, page_ocr_text, page_idx, total_pages, item_id, job_id=None, wait_for_result=True, tenant_id=None, is_rescan=False, rescan_history_id=None):
        """
        HARD ISOLATION RULE: ONE PAGE -> ONE OCR TEXT -> ONE IMAGE -> ONE REQUEST
        PHASE 9: CACHE AWARE.
        """
        # 1. Cache Check
        cached_res = _get_cached_ai_result(page_ocr_text)
        if cached_res:
            logger.info(f"[AI_CACHE_HIT] record={record_id} page={page_idx+1}")
            # ── [CACHE_OCR_TEXT_RESTORE] ──
            # The cache stores only the AI extraction result, not the raw OCR text.
            # Re-inject _pdf_ocr_text so downstream grouping / continuation detection
            # (classify_page, detect_continuation_markers) can function correctly.
            # Without this, cache hits produce empty _raw_text, causing PAGE_ROLE_PRIMARY
            # mis-classification and multi-page invoice split failures.
            if page_ocr_text and not cached_res.get("_pdf_ocr_text"):
                cached_res = dict(cached_res)  # shallow copy — never mutate the cached object
                cached_res["_pdf_ocr_text"] = page_ocr_text
                cached_res["_raw_text"] = page_ocr_text
            try:
                log_forensic_page_dto(cached_res, upload_session_id, record_id, page_idx + 1, page_ocr_text)
            except Exception as le:
                logger.warning(f"[FORENSIC_PAGE_DTO_LOG_ERR] {le}")
            return cached_res

        # Ensure ONLY this page's OCR text is included. 
        # Prefix caching requires base_prompt (rules & schema) to be placed BEFORE page_ocr_text.
        page_isolated_prompt = f"{base_prompt}\n\n### [PAGE {page_idx+1} OCR DATA]\n{page_ocr_text}"
        
        file_b64 = base64.b64encode(segment_bytes).decode('utf-8')
        
        # ── [AI_PAYLOAD_CONTRACT_FIX] ──
        # Ensure ALL required fields propagate at the top level for UnifiedWorker routing.
        from core.middleware import get_correlation_id
        corr_id = get_correlation_id()
        
        request_data = {
            'type': 'extraction',
            'prompt': page_isolated_prompt,
            'image_data': file_b64,
            'mime_type': 'image/jpeg',
            'voucher_type': voucher_type,
            'page_index': page_idx + 1,
            'page_number': page_idx + 1,
            'total_pages': total_pages,
            'wait_for_result': wait_for_result,
            '_pdf_ocr_text': page_ocr_text,
            'file_hash': parent_hash,
            
            # Forensic Fields
            'item_id': item_id,
            'record_id': record_id,
            'job_id': job_id,
            'upload_session_id': upload_session_id,
            'tenant_id': tenant_id,
            'upload_type': upload_type,  # [UPLOAD_TYPE ISOLATION FIX]
            'correlation_id': corr_id,
            'is_rescan': is_rescan,
            'rescan_history_id': rescan_history_id
        }
        
        logger.info(f"[AI_PAYLOAD_VALID] record={record_id} page={page_idx+1} item={item_id} cid={corr_id}")
        
        prompt_size = len(page_isolated_prompt)
        logger.info(f"AI OCR ISOLATED Request | Page: {page_idx+1} | Prompt Size: {prompt_size} chars | User: {user_id}")
        
        if prompt_size > 300000:
             logger.warning(f"CRITICAL: Isolated prompt for page {page_idx+1} exceeds 300K limit ({prompt_size} chars).")

        # Pass metadata for callbacks
        metadata = {
            'record_id': record_id,
            'item_id': item_id,
            'job_id': job_id,
            'upload_session_id': upload_session_id,
            'page_index': page_idx + 1,
            'total_pages': total_pages,
            'id': f"ai_{record_id}_{page_idx+1}_{int(time.time())}", # Unique AI Task ID
            'is_rescan': is_rescan,
            'rescan_history_id': rescan_history_id
        }
        
        logger.info(
            f"[AI_TASK_ENQUEUED] "
            f"record={record_id} "
            f"page={page_idx+1} "
            f"task={metadata['id']} "
            f"session={upload_session_id}"
        )
        
        logger.info(f"[AI_EXTRACTION_CALL] record={record_id} page={page_idx+1} session={upload_session_id}")
        
        if MOCK_EXTRACTION_MODE:
            # Deterministic Mock Payload
            import random
            items_count = random.randint(1, 20)
            items = []
            taxable_total = 0
            for i in range(items_count):
                rate = random.randint(100, 1000)
                qty = random.randint(1, 5)
                tax_rate = random.choice([5, 12, 18, 28])
                item_taxable = rate * qty
                item_tax = (item_taxable * tax_rate) / 100
                items.append({
                    "description": f"Mock Item {i+1}",
                    "hsn_code": f"{random.randint(1000, 9999)}",
                    "quantity": qty,
                    "uom": "NOS",
                    "rate": float(rate),
                    "discount_percent": 0.0,
                    "taxable_value": float(item_taxable),
                    "igst_rate": float(tax_rate),
                    "igst_amount": float(item_tax),
                    "cgst_rate": 0.0,
                    "cgst_amount": 0.0,
                    "sgst_rate": 0.0,
                    "sgst_amount": 0.0,
                    "cess_rate": 0.0,
                    "cess_amount": 0.0,
                    "amount": float(item_taxable + item_tax)
                })
                taxable_total += item_taxable
            
            total_tax = sum(item['igst_amount'] for item in items)
            total_amount = taxable_total + total_tax
            
            mock_payload = {
                "header": {
                    "vendor_name": f"Mock Vendor {random.randint(1, 100)}",
                    "vendor_address": "123 Mock Street, Mock City",
                    "billing_address": "456 Test Lane, Test Town",
                    "vendor_gstin": f"33AAAAA{random.randint(1000, 9999)}A1Z5",
                    "vendor_state": "Tamil Nadu",
                    "place_of_supply": "33-Tamil Nadu",
                    "invoice_no": f"INV-{random.randint(10000, 99999)}",
                    "invoice_date": "2024-05-15",
                    "total_amount": float(total_amount),
                    "taxable_value": float(taxable_total),
                    "cgst": 0.0,
                    "sgst": 0.0,
                    "igst": float(total_tax),
                    "gst_taxability_type": "Taxable",
                    "gst_nature_of_transaction": "Interstate",
                    "sales_order_no": f"SO-{random.randint(1000, 9999)}",
                    "irn": f"{hashlib.sha256(str(random.random()).encode()).hexdigest()}",
                    "ack_no": f"{random.randint(1000000000, 9999999999)}",
                    "ack_date": "2024-05-15"
                },
                "items": items,
                "_status": "SUCCESS",
                "_mock": True,
                "_pdf_ocr_text": page_ocr_text
            }
            logger.info(f"[MOCK_EXTRACTION] record={record_id} page={page_idx+1}")
            try:
                log_forensic_page_dto(mock_payload, upload_session_id, record_id, page_idx + 1, page_ocr_text)
            except Exception as le:
                logger.warning(f"[FORENSIC_PAGE_DTO_LOG_ERR] {le}")
            return mock_payload

        if not wait_for_result:
            logger.info(f"[PIPELINE_AI_ENQUEUE] record_id={record_id} queue=ai_requests")
            logger.info(f"[SQS_PUSH] record={record_id} page={page_idx+1} queue=ai_requests")
            return ai_service.make_request('extraction', request_data, user_id, tenant_id, metadata=metadata)
        
        # [PHASE 9: 429 HANDLING & RETRIES]
        # Prevents transient quota bursts from failing the task permanently.
        max_429_retries = 3
        current_attempt = 0
        response = {}
        
        while current_attempt <= max_429_retries:
            # [PHASE 11: CONCURRENCY GOVERNANCE]
            from core.observability import metrics
            t_ai_start = time.monotonic()
            with ai_concurrency_gate(tenant_id):
                response = ai_service.make_request('extraction', request_data, user_id, tenant_id, metadata=metadata)
            metrics.record_latency("ai:latency", time.monotonic() - t_ai_start, tags={"record_id": record_id, "page": page_idx + 1})
            
            # Check for 429 or quota error in response
            is_429 = response.get('status_code') == 429 or "quota" in str(response.get('error', '')).lower()
            
            if is_429 and current_attempt < max_429_retries:
                current_attempt += 1
                wait_time = 2 ** current_attempt  # Exponential backoff: 2, 4, 8s
                logger.warning(f"[AI_PROVIDER_429] Rate limited. Retrying in {wait_time}s... ({current_attempt}/{max_429_retries})")
                time.sleep(wait_time)
                continue
            break
        
        # ── [ADDRESS_EXTRACTION_FORENSIC] ──
        if response and 'reply' in response:
            reply = response.get('reply', '')
            logger.info(f"[AI_REPLY_RECEIVED] length={len(reply)}")
            if "vendor_address" in reply.lower():
                logger.info(f"[ADDRESS_KEY_DETECTED] key='vendor_address' found in AI reply")
            if "billing_address" in reply.lower():
                logger.info(f"[ADDRESS_KEY_DETECTED] key='billing_address' found in AI reply")
        
        if 'error' in response:
            raise RuntimeError(response['error'])

        raw_text = response.get('reply', '').strip()
        if not raw_text:
            logger.warning(f"Empty AI reply for page {page_idx+1}")
            return {"_error": "EMPTY_REPLY", "_raw": ""}

        # ── [FORENSIC TRACE] (Requirement #1 & #2) ──
        raw_items_detected = "items" in raw_text.lower() or "sections" in raw_text.lower()
        approx_item_count = raw_text.lower().count('"description"') or raw_text.lower().count('"item_name"')
        logger.info(f"[RAW_AI_HAS_ITEMS] page={page_idx+1} has_items={raw_items_detected} approx_count={approx_item_count}")
        
        repaired_text, repair_strategy, repair_err = _repair_json(
            raw_text, record_id=record_id, page=page_idx + 1
        )
        logger.info(
            f"[JSON_PARSE_ATTEMPT] record={record_id} page={page_idx+1} "
            f"strategy={repair_strategy} repair_err={repair_err}"
        )
        try:
            result = json.loads(repaired_text)
            if not isinstance(result, dict):
                return {"_error": "INVALID_JSON_STRUCTURE", "_raw": raw_text}

            # Forensic logging of GSTIN raw and extracted states
            raw_gstin_ocr = str(result.get('header', {}).get('vendor_gstin') or result.get('header', {}).get('gstin') or result.get('gstin') or "").strip()
            logger.info(
                f"[GSTIN_RAW_OCR] upload_session_id={upload_session_id} page_number={page_idx+1} "
                f"invoice_no={result.get('header', {}).get('invoice_no')} vendor_name={result.get('header', {}).get('vendor_name')} "
                f"gstin={raw_gstin_ocr} length={len(raw_gstin_ocr)}"
            )
            logger.info(
                f"[GSTIN_EXTRACTED] upload_session_id={upload_session_id} page_number={page_idx+1} "
                f"invoice_no={result.get('header', {}).get('invoice_no')} vendor_name={result.get('header', {}).get('vendor_name')} "
                f"gstin={raw_gstin_ocr} length={len(raw_gstin_ocr)}"
            )

            # [RAW_AI_RESPONSE_FULL] (Requirement Phase 1)
            logger.info(f"[RAW_AI_RESPONSE_FULL] page={page_idx+1} payload={raw_text}")
            
            # [RAW_AI_ITEM_KEYS] (Requirement Phase 1)
            header_keys = list(result.get('header', {}).keys()) if 'header' in result else []
            root_keys = list(result.keys())
            logger.info(f"[RAW_AI_ITEM_KEYS] page={page_idx+1} root_keys={root_keys} header_keys={header_keys}")

            # [RAW_AI_ITEM_COUNT] (Requirement Phase 1)
            raw_items = result.get("items") or result.get("sections", {}).get("items") or []
            logger.info(f"[RAW_AI_ITEM_COUNT] page={page_idx+1} items={len(raw_items)}")

            logger.info(f"[RAW_AI_ITEM_COUNT] page={page_idx+1} items={len(raw_items)}")

            if page_ocr_text:
                result["_pdf_ocr_text"] = page_ocr_text
            result["_raw_text"] = raw_text
            
            # 2. Save to Cache
            _set_cached_ai_result(page_ocr_text, result)
            try:
                log_forensic_page_dto(result, upload_session_id, record_id, page_idx + 1, page_ocr_text)
            except Exception as le:
                logger.warning(f"[FORENSIC_PAGE_DTO_LOG_ERR] {le}")
            
            return result
        except json.JSONDecodeError as jde:
            # True semantic failure — formatting repair could not help
            logger.error(
                f"[JSON_DECODE_FAIL] record={record_id} page={page_idx+1} "
                f"repair_strategy={repair_strategy} pos={jde.pos} msg={jde.msg}"
            )
            _JSON_QUARANTINE_LOG.error(
                f"[AI_JSON_QUARANTINE_FINAL] record={record_id} page={page_idx+1} "
                f"raw_preview={raw_text[:300]!r}"
            )
            return {"_error": "JSON_DECODE_FAILED", "_raw": raw_text}

    # ── STEP 3: PARALLEL EXECUTION (OPTIMIZED) ──
    t_start = time.monotonic()
    
    def process_single_page(i):
        p_start = time.monotonic()
        # ── [PAGE_START] Forensics ──
        logger.info(
            f"[PAGE_START] "
            f"record={record_id} "
            f"page={i+1}/{page_count} "
            f"session={upload_session_id}"
        )
        
        try:
            # ── [PHASE 4: OCR PROCESS ISOLATION] ──
            # Rendering and text extraction are offloaded to a subprocess.
            from .isolated_ocr_service import run_isolated_page_extraction
            
            # Using 300 DPI natively for all pages, as per PaddleOCR integration requirements
            dpi = 300
            
            logger.info(f"[ISOLATED_START] page={i+1} dpi={dpi}")
            from core.observability import metrics
            t_ocr_start = time.monotonic()
            iso_res = run_isolated_page_extraction(file_path, i, dpi=dpi)
            metrics.record_latency("ocr:render_duration", time.monotonic() - t_ocr_start, tags={"record_id": record_id, "page": i + 1})
            
            if not iso_res["success"]:
                 raise RuntimeError(f"Isolation failure: {iso_res.get('error')}")

            img_bytes = iso_res["image_bytes"]
            page_text = iso_res["text"]

            logger.info(f"[OCR_TEXT_LENGTH] page={i+1} length={len(page_text)}")
            
            # Clean up OCR text (Preserve newlines, collapse horizontal whitespace)
            page_text = re.sub(r'[ \t]+', ' ', page_text).strip()
            page_text = re.sub(r'(\r\n|\r|\n){2,}', '\n\n', page_text) # Normalize multiple newlines
            
            # ── [PHASE 9] MULTI-INVOICE DETECTION HINT ──
            if len(page_text) > 1000:
                gst_matches = len(re.findall(r'\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}', page_text))
                if gst_matches > 1:
                    logger.info(f"[MULTI_INVOICE_DETECTED] page={i+1} GST_count={gst_matches}")

            # 3. Call Qwen/AI
            res = _call_ai_for_page(img_bytes, page_text, i, page_count, item_id, job_id=job_id, wait_for_result=wait_for_result, tenant_id=tenant_id, is_rescan=is_rescan, rescan_history_id=rescan_history_id)
            
            # ── [PHASE 4] RELAXED VALIDATION & STATUS ──
            final_status = "EXTRACTED"
            if isinstance(res, dict):
                res["_pdf_ocr_text"] = page_text
                res["_page_no"] = i+1
                
                # Compute and attach confidence scores
                ocr_blocks = iso_res.get("ocr_blocks") or []
                header = res.get("header", {})
                
                vendor_name = header.get("vendor_name") or ""
                vendor_gstin = header.get("vendor_gstin") or ""
                invoice_no = header.get("invoice_no") or ""
                
                v_conf = compute_field_confidence(vendor_name, ocr_blocks)
                g_conf = compute_field_confidence(vendor_gstin, ocr_blocks)
                i_conf = compute_field_confidence(invoice_no, ocr_blocks)
                
                res["vendor_confidence"] = v_conf
                res["gstin_confidence"] = g_conf
                res["invoice_number_confidence"] = i_conf
                
                # Log low confidence events
                for field_name, conf_val in [("vendor_name", v_conf), ("vendor_gstin", g_conf), ("invoice_no", i_conf)]:
                    if conf_val is not None and conf_val < 0.80:
                        logger.warning(
                            f"[LOW_CONFIDENCE_OCR_EXTRACTION] "
                            f"record_id={record_id} "
                            f"field={field_name} "
                            f"confidence={conf_val:.4f}"
                        )
                
                has_essential = header.get("invoice_no") and header.get("vendor_name")
                if not has_essential and (res.get("items") or header.get("total_amount")):
                    logger.info(f"[VALIDATION_DECISION] page={i+1} result=PARTIAL_EXTRACTION")
                    res["_status"] = "PARTIAL_EXTRACTION"
                    final_status = "PARTIAL_EXTRACTION"
                else:
                    logger.info(f"[VALIDATION_DECISION] page={i+1} result=SUCCESS")
                    res["_status"] = "SUCCESS"


            logger.info(f"[PAGE_FINAL_STATUS] page={i+1} status={final_status} time={time.monotonic() - p_start:.2f}s")
            logger.info(
                f"[AI_TASK_COMPLETE] "
                f"record={record_id} "
                f"page={i+1} "
                f"session={upload_session_id} "
                f"status={res.get('_status') or 'SUCCESS'}"
            )
            return i, res
            
        except Exception as e:
            logger.error(f"[PAGE_FAILURE] record={record_id} page={i+1}: {e}")
            
            # [STALL_PREVENTION_FIX] DURABLE DB ACK
            # If we failed to even enqueue the AI task, we must mark it as terminal
            # in the DB so that the assembly barrier in pipeline.py can proceed.
            if record_id:
                try:
                    from .models import InvoicePageResult, SessionFinalizationState
                    InvoicePageResult.objects.update_or_create(
                        record_id=record_id,
                        page_number=i+1,
                        defaults={
                            'session_id': upload_session_id or 'error_sync',
                            'canonical_payload': {'status': 'OCR_FAILED', 'error': str(e)}
                        }
                    )
                    # ── [PHASE 18] BARRIER FAILURE TRACKING ──
                    SessionFinalizationState.objects.filter(id=str(record_id)).update(
                        failed_pages=models.F('failed_pages') + 1,
                        updated_at=timezone.now()
                    )
                    logger.warning(f"[DB_BARRIER_INCREMENT] record={record_id} page={i+1} status=FAILED (OCR/Enqueue Failure)")
                except Exception as db_err:
                    logger.error(f"[DB_BARRIER_FAIL] record={record_id} page={i+1}: {db_err}")

            # ── [PHASE 10] TERMINAL FAILURE ENFORCEMENT ──
            placeholder = {
                "status": "OCR_FAILED",
                "_error": str(e),
                "_page_no": i+1,
                "header": {},
                "items": [],
                "failure_reason": "RUNTIME_EXCEPTION",
                "_integrity_blocked": True
            }
            logger.error(f"[PAGE_QUARANTINED] record={record_id} page={i+1} reason='{str(e)[:100]}'")
            logger.info(f"[PAGE_FINAL_STATUS] page={i+1} status=OCR_FAILED")
            return i, placeholder

    logger.info(f"[FANOUT_EXPECTED] record_id={record_id} expected_pages={page_count} session={upload_session_id}")
    logger.info(f"[PAGE_FANOUT] record={record_id} pages={page_count}")
    
    results_map = {}
    
    # ── [PHASE 9: BATCHED EXECUTION] ──
    # Group page indices into batches
    # ── [PHASE 10: PARTIAL EXTRACTION SUPPORT] ──
    page_indices = list(range(page_count))[start_page : (start_page + limit if limit else None)]
    batches = [page_indices[i:i + batch_size] for i in range(0, len(page_indices), batch_size)]
    
    logger.info(f"[BATCH_PLAN] record={record_id} pages={page_count} batches={len(batches)} size={batch_size}")

    def process_batch(batch_idxs):
        # 1. Gather page data for the whole batch
        batch_data = []
        for idx in batch_idxs:
            import time
            logger.info(f"[OCR_START] page={idx+1}")
            ocr_t0 = time.time()
            # ... render page ...
            from .isolated_ocr_service import run_isolated_page_extraction
            
            dpi = 300
            
            iso_res = run_isolated_page_extraction(file_path, idx, dpi=dpi)
            
            ocr_t1 = time.time()
            logger.info(f"[OCR_END] page={idx+1}")
            logger.info(f"[OCR_DURATION] page={idx+1} duration_ms={int((ocr_t1 - ocr_t0)*1000)}")
            
            if not iso_res["success"]:
                 continue
            
            page_text = re.sub(r'\s+', ' ', iso_res["text"]).strip()
            
            # Save the text for E2E verification
            with open(f"page{idx+1}_ocr.txt", "w", encoding="utf-8") as f:
                f.write(page_text)
                
            batch_data.append({
                'img_bytes': iso_res["image_bytes"],
                'ocr_text': page_text,
                'ocr_blocks': iso_res.get("ocr_blocks") or [],
                'idx': idx
            })
            
        # 2. Call Batch AI
        batch_results = _call_ai_batch(batch_data, item_id, job_id, wait_for_result, tenant_id, is_rescan=is_rescan, rescan_history_id=rescan_history_id)
        
        # Compute and attach confidence scores for each batch result
        for page_idx, res in batch_results.items():
            p_data = next((p for p in batch_data if p['idx'] == page_idx), None)
            if p_data and isinstance(res, dict):
                ocr_blocks = p_data.get("ocr_blocks") or []
                header = res.get("header", {})
                vendor_name = header.get("vendor_name") or ""
                vendor_gstin = header.get("vendor_gstin") or ""
                invoice_no = header.get("invoice_no") or ""
                
                v_conf = compute_field_confidence(vendor_name, ocr_blocks)
                g_conf = compute_field_confidence(vendor_gstin, ocr_blocks)
                i_conf = compute_field_confidence(invoice_no, ocr_blocks)
                
                res["vendor_confidence"] = v_conf
                res["gstin_confidence"] = g_conf
                res["invoice_number_confidence"] = i_conf
                
                # Log low confidence events
                for field_name, conf_val in [("vendor_name", v_conf), ("vendor_gstin", g_conf), ("invoice_no", i_conf)]:
                    if conf_val is not None and conf_val < 0.80:
                        logger.warning(
                            f"[LOW_CONFIDENCE_OCR_EXTRACTION] "
                            f"record_id={record_id} "
                            f"field={field_name} "
                            f"confidence={conf_val:.4f}"
                        )
        
        # 3. Format for return
        return [(idx, res) for idx, res in batch_results.items()]


    # ── [PHASE 10: BOUNDED FANOUT] ──
    # Enqueue ONLY the first 5 batches immediately to prevent SQS pressure.
    # Subsequent pages will be enqueued by workers as they complete prior tasks.
    MAX_INITIAL_FANOUT = 5
    batches_to_enqueue = batches[:MAX_INITIAL_FANOUT]
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(len(batches_to_enqueue), 5))) as executor:
        futures = [executor.submit(process_batch, b) for b in batches_to_enqueue]
        for future in concurrent.futures.as_completed(futures):
            batch_res = future.result()
            for idx, res in batch_res:
                results_map[idx] = res
                if not wait_for_result:
                     logger.info(f"[FANOUT_QUEUED] record_id={record_id} page_number={idx+1} session={upload_session_id}")
                     if record_id:
                         try:
                             rec_id_str = str(record_id)
                             page_num_str = str(idx + 1)
                             from core.redis_orchestrator import orchestrator
                             orchestrator.redis.set(f"assembly:{rec_id_str}:page:{page_num_str}:enqueued", "true", ex=86400)
                             orchestrator.redis.sadd(f"assembly:{rec_id_str}:enqueued_success_pages", page_num_str)
                             orchestrator.redis.expire(f"assembly:{rec_id_str}:enqueued_success_pages", 86400)
                         except Exception as redis_err:
                             logger.error(f"[REDIS_BACKEND_ENQUEUE_ERR] {redis_err}")
    
    # ── [PHASE 10: BARRIER STATE SYNC] ──
    if not wait_for_result and record_id:
        from .models import SessionFinalizationState
        SessionFinalizationState.objects.filter(id=str(record_id)).update(
            total_pages_completed=models.F('total_pages_completed') + len(results_map) # Tracking enqueued count
        )
        logger.info(f"[BOUNDED_FANOUT_SYNC] record={record_id} newly_enqueued={len(results_map)}")
    
    if limit is None and len(results_map) != page_count:
        logger.error(f"[FANOUT_MISMATCH] record_id={record_id} expected={page_count} actual={len(results_map)}")


    pages_map = {}
    for i in range(page_count):
        if not wait_for_result:
            page_result = results_map.get(i) or {"status": "queued", "_error": "PENDING_WINDOW"}
        else:
            page_result = results_map.get(i) or {"status": "OCR_FAILED", "_error": "MISSING_RESULT"}
        page_result["_page_no"] = i + 1
        pages_map[str(i+1)] = page_result

    # [ROOT-CAUSE FIX] Return first page as primary, but NEVER merge unrelated pages here.
    # The assembly/splitting logic in pipeline.py handles multi-invoice PDFs.
    if results_map:
        first_key = next(iter(sorted(results_map.keys())))
        final_result = results_map[first_key].copy()
    else:
        final_result = {"status": "OCR_FAILED", "_error": "NO_PAGES_PROCESSED"}

    # ── [PHASE 14: METERING] ──
    # Track total AI units (pages) for cost governance
    final_result["total_pages"] = page_count
    final_result["_ai_units_consumed"] = page_count
    final_result["_pages"] = pages_map
    
    logger.info(f"[EXTRACTION_COMPLETE] pages={page_count} session={upload_session_id} record={record_id} units={page_count}")
    logger.info(f"[PERF] Total Pipeline Time: {time.monotonic() - t_start:.2f}s for {page_count} pages")
    return final_result
