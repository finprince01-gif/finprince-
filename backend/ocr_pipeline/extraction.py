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
from google.genai import types
from core.ai_proxy import ai_service
from contextlib import contextmanager
from django.db import models

import os
from ocr_pipeline.models import AICache
from django.db.models import F
logger = logging.getLogger(__name__)

MOCK_EXTRACTION_MODE = os.getenv('MOCK_EXTRACTION_MODE', 'false').lower() == 'true'

_JSON_QUARANTINE_LOG = logging.getLogger("AIJsonQuarantine")

@contextmanager
def gemini_concurrency_gate(tenant_id, max_wait=60):
    """
    PHASE 5D: DISTRIBUTED AI GOVERNANCE.
    Implements Token Bucket + Adaptive Concurrency limits.
    Ensures burst protection and sustained rate control.
    """
    from vouchers.models import GeminiQuota
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
                quota, _ = GeminiQuota.objects.select_for_update().get_or_create(
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
        GeminiQuota.objects.filter(tenant_id=t_id).update(active_calls=models.F('active_calls') + 1)
        
    try:
        yield
    finally:
        # Atomic decrement
        GeminiQuota.objects.filter(tenant_id=t_id).update(active_calls=models.F('active_calls') - 1)

def _repair_json(raw: str, record_id=None, page=None) -> tuple:
    """
    5-stage deterministic JSON repair pipeline.
    Returns (repaired_str, strategy_used, error_info).
    Never raises.
    """
    strategy = "NONE"
    error_info = {}

    if not raw:
        return "", "EMPTY", {}

    text = raw

    # Stage 1: Strip markdown fences safely
    md = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if md:
        text = md.group(1).strip()
        strategy = "MARKDOWN_STRIP"

    # Stage 2: Isolate first valid JSON object via brace balancing
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

    # Stage 3: Remove trailing commas before } and ]
    text = re.sub(r',\s*([}\]])', r'\1', text)

    # Stage 4: Repair invalid escape sequences (\' → ', \" already valid)
    text = re.sub(r'\\(?!["\\bfnrt/u])', r'\\\\', text)

    # Stage 5: First parse attempt — if it fails, try quote normalization
    try:
        json.loads(text)
        return text, strategy, {}
    except json.JSONDecodeError as e:
        error_info = {"pos": e.pos, "msg": e.msg, "doc_snippet": e.doc[max(0, e.pos-20):e.pos+20] if e.doc else ""}

    # Stage 5b: Normalize smart/curly quotes to ASCII (last resort)
    text_q = text.translate(str.maketrans('\u2018\u2019\u201c\u201d', "''\"\"")
    ).replace('\u2032', "'").replace('\u2033', '"')
    try:
        json.loads(text_q)
        return text_q, "QUOTE_NORMALIZE", error_info
    except json.JSONDecodeError:
        pass

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

def extract_invoice(client, file_bytes=None, voucher_type='Purchase', upload_type='UNKNOWN', public_ip="0.0.0.0", user_id='system', tenant_id='system', wait_for_result=True, record_id=None, item_id=None, upload_session_id=None, job_id=None, file_path=None, start_page=0, limit=None):
    """
    Extracts invoice data using the central AI Proxy service with fallbacks.
    Returns a unified JSON object matching the internal schema.

    ROOT-CAUSE FIX (PAYLOAD ISOLATION):
    Processes each page independently with ONLY its own OCR text and image.
    Ensures prompt size remains < 150K and prevents "full document" leakage.
    """
    # ── STEP 1: IDENTIFY PAGES ──
    try:
        # [PHASE 4] Opening doc to get page count is generally safe, 
        # but the heavy rendering is isolated later.
        if file_path:
            doc = fitz.open(file_path)
        else:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
        page_count = len(doc)
    except Exception:
        doc = None
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

    def _call_ai_batch(batch_data, item_id, job_id=None, wait_for_result=True, tenant_id=None):
        """
        PHASE 9: 1 CALL -> MANY PAGES.
        batch_data: list of {'img_bytes': ..., 'ocr_text': ..., 'idx': ...}
        """
        if not batch_data: return {}
        
        count = len(batch_data)
        if count == 1:
            p = batch_data[0]
            return {p['idx']: _call_ai_for_page(p['img_bytes'], p['ocr_text'], p['idx'], page_count, item_id, job_id, wait_for_result, tenant_id)}

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
            'batch_indices': [p['idx'] for p in batch_data]
        }

        if not wait_for_result:
            # SAFETY CHECK: If batch is too large for SQS (256KB limit), split it.
            # We estimate 1.33 overhead for base64.
            total_size = sum(len(img['data']) for img in batch_images)
            if total_size > 200000: # 200KB limit for safety
                logger.warning(f"[BATCH_TOO_LARGE] size={total_size} -> Splitting batch of {count}")
                results = {}
                for p in batch_data:
                    results[p['idx']] = _call_ai_for_page(p['img_bytes'], p['ocr_text'], p['idx'], page_count, item_id, job_id, wait_for_result, tenant_id)
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
        with gemini_concurrency_gate(tenant_id):
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
                final_results[idx] = p_res
            return final_results
        except Exception as e:
            logger.error(f"[BATCH_PARSE_FAIL] {e}")
            # PHASE 10: Mark as terminal failure to block propagation
            return {p['idx']: {"status": "OCR_FAILED", "_error": f"BATCH_PARSE_FAIL: {str(e)}", "_raw": raw_text} for p in batch_data}

    # ── STEP 2: PREPARE BASE PROMPT (UNTOUCHED) ──
    base_prompt = f"""
Extract invoice data from this {voucher_type} document into the EXACT JSON format below.
Failure to extract ANY field that is visible on the document is unacceptable.

# 🎯 SCHEMA
{{
  "header": {{
    "vendor_name": "",
    "vendor_address": "",
    "billing_address": "",
    "vendor_gstin": "",
    "vendor_state": "",
    "place_of_supply": "",
    "invoice_no": "",
    "invoice_date": "",
    "total_amount": 0,
    "taxable_value": 0,
    "cgst": 0,
    "sgst": 0,
    "igst": 0,
    "gst_taxability_type": "Taxable",
    "gst_nature_of_transaction": "",
    "sales_order_no": "",
    "irn": "",
    "ack_no": "",
    "ack_date": ""
  }},
  "items": [
    {{
      "description": "",
      "hsn_code": "",
      "quantity": 0,
      "uom": "",
      "rate": 0,
      "discount_percent": 0,
      "taxable_value": 0,
      "igst_rate": 0,
      "igst_amount": 0,
      "cgst_rate": 0,
      "cgst_amount": 0,
      "sgst_rate": 0,
      "sgst_amount": 0,
      "cess_rate": 0,
      "cess_amount": 0,
      "amount": 0
    }}
  ]
}}

# 🧠 EXTRACTION STRATEGY (STRICT RULES)

## 1. DATA SEPARATION & MAPPING
* **HEADER FIELDS**: Extract exactly ONCE per invoice into the "header" object.
* **LINE ITEMS**: Extract as a list of rows into the "items" array. 
* **NO MIXING**: Do NOT mix header values into item rows incorrectly. 

## 2. SECTION BOUNDARY & ADDRESS EXTRACTION (MANDATORY)
* **HARD SEGMENTATION**: Use the following anchors to isolate address blocks:
    - **Ship-To (Consignee) Window**:
        - START: "Consignee (Ship to)"
        - END: "Buyer (Bill to)"
    - **Bill-To (Buyer) Window**:
        - START: "Buyer (Bill to)"
        - END: "Place of Supply" OR Start of item table
* **ADDRESS PRECISION**: 
    - "vendor_address" MUST contain the data from the "Consignee (Ship to)" section.
    - "billing_address" MUST ONLY contain data from the "Buyer (Bill to)" section.
    - NEVER leak "Consignee" data into the "billing_address" field.
    - If a section is empty or missing, return NULL for that address.

## 3. FINANCIAL VALIDATION
* **TOTAL INTEGRITY**: Total Invoice Value MUST equal sum(Taxable Value + Taxes).
* **ROW ACCURACY**: Row count MUST match visible table rows.
* **DO NOT GUESS**: If a field is missing, return NULL. Do NOT hallucinate.

## 4. VENDOR/SUPPLIER IDENTIFICATION
* **INVOICE NUMBER (HIGH RELIABILITY)**: 
    * **MULTI-PATTERN DETECTION**: Detect invoice numbers in ALL possible formats.
    * **CANDIDATE SELECTION (RANKING)**: 
        1. Proximity to "Invoice No" or "Bill No" label.
        2. Location near top or Date field.
        3. Presence of separators (/, -).
    * **VALIDATION**: Must contain at least ONE digit. 3-25 chars long.
* **VENDOR/SUPPLIER**: The entity issuing the bill.
* **PLACE OF SUPPLY**: Look for state label or code (e.g., "33-Tamil Nadu").

## 5. LINE ITEM EXTRACTION (STRICT)
* **HSN/SAC**: Every line must have an HSN code if visible.
* **UOM**: Extract units (Nos, Pcs, Kgs, etc.).
* **LINE TOTALS**: `taxable_value` + taxes = `amount`.

## 6. MULTI-PAGE & CONTINUATION DETECTION
* **CONTINUATION MARKERS**: Detect if this page is a continuation. Look for:
    - "continued to page", "page 2", "amount chargeable", "total invoice value", "rounded off", "tax amount", "bank details", "authorised signatory"
* **HEADER PERSISTENCE**: If this is a continuation page, still attempt to extract the `invoice_no` and `vendor_name` from labels at the top.

# 🚫 RULES
* Return ONLY valid JSON.
* Ensure all numeric fields are numbers.
* NO hallway citations or placeholders.
"""

    def _call_ai_for_page(segment_bytes, page_ocr_text, page_idx, total_pages, item_id, job_id=None, wait_for_result=True, tenant_id=None):
        """
        HARD ISOLATION RULE: ONE PAGE -> ONE OCR TEXT -> ONE IMAGE -> ONE REQUEST
        PHASE 9: CACHE AWARE.
        """
        # 1. Cache Check
        cached_res = _get_cached_ai_result(page_ocr_text)
        if cached_res:
            logger.info(f"[AI_CACHE_HIT] record={record_id} page={page_idx+1}")
            return cached_res

        # Ensure ONLY this page's OCR text is included. 
        # Explicitly label the text to prevent any overlap with previous/next pages.
        page_isolated_prompt = f"### [PAGE {page_idx+1} OCR DATA]\n{page_ocr_text}\n\n{base_prompt}"
        
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
            'wait_for_result': wait_for_result,
            '_pdf_ocr_text': page_ocr_text,
            
            # Forensic Fields
            'item_id': item_id,
            'record_id': record_id,
            'job_id': job_id,
            'upload_session_id': upload_session_id,
            'tenant_id': tenant_id,
            'upload_type': upload_type,  # [UPLOAD_TYPE ISOLATION FIX]
            'correlation_id': corr_id
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
            'id': f"ai_{record_id}_{page_idx+1}_{int(time.time())}" # Unique AI Task ID
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
            with gemini_concurrency_gate(tenant_id):
                response = ai_service.make_request('extraction', request_data, user_id, tenant_id, metadata=metadata)
            metrics.record_latency("ai:latency", time.monotonic() - t_ai_start, tags={"record_id": record_id, "page": page_idx + 1})
            
            # Check for 429 or quota error in response
            is_429 = response.get('status_code') == 429 or "quota" in str(response.get('error', '')).lower()
            
            if is_429 and current_attempt < max_429_retries:
                current_attempt += 1
                wait_time = 2 ** current_attempt # Exponential backoff: 2, 4, 8s
                logger.warning(f"[GEMINI_429] Rate limited. Retrying in {wait_time}s... ({current_attempt}/{max_429_retries})")
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
            # This protects the worker from PyMuPDF segfaults/memory leaks.
            from .isolated_ocr_service import run_isolated_page_extraction
            
            # Detect if it's a scanned image PDF (no text) - Heuristic check
            # We do a light check first to determine DPI
            light_text = doc[i].get_text("text").strip()
            is_scanned = len(light_text) < 10
            dpi = 300 if is_scanned else 150
            
            logger.info(f"[ISOLATED_START] page={i+1} scanned={is_scanned}")
            from core.observability import metrics
            t_ocr_start = time.monotonic()
            iso_res = run_isolated_page_extraction(file_path, i, dpi=dpi)
            metrics.record_latency("ocr:render_duration", time.monotonic() - t_ocr_start, tags={"record_id": record_id, "page": i + 1})
            
            if not iso_res["success"]:
                 raise RuntimeError(f"Isolation failure: {iso_res.get('error')}")

            img_bytes = iso_res["image_bytes"]
            page_text = iso_res["text"]

            if is_scanned or len(page_text) < 50:
                logger.info(f"[FALLBACK_OCR_TRIGGERED] page={i+1} reason='Low text density'")
                page_text = f"[SCANNED_PAGE_NO_DIRECT_TEXT] Image size: {len(img_bytes)} bytes"

            logger.info(f"[OCR_TEXT_LENGTH] page={i+1} length={len(page_text)}")
            
            # Clean up OCR text (Preserve newlines, collapse horizontal whitespace)
            page_text = re.sub(r'[ \t]+', ' ', page_text).strip()
            page_text = re.sub(r'(\r\n|\r|\n){2,}', '\n\n', page_text) # Normalize multiple newlines
            
            # ── [PHASE 9] MULTI-INVOICE DETECTION HINT ──
            if len(page_text) > 1000:
                gst_matches = len(re.findall(r'\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}', page_text))
                if gst_matches > 1:
                    logger.info(f"[MULTI_INVOICE_DETECTED] page={i+1} GST_count={gst_matches}")

            # 3. Call Gemini
            res = _call_ai_for_page(img_bytes, page_text, i, page_count, item_id, job_id=job_id, wait_for_result=wait_for_result, tenant_id=tenant_id)
            
            # ── [PHASE 4] RELAXED VALIDATION & STATUS ──
            final_status = "EXTRACTED"
            if isinstance(res, dict):
                res["_pdf_ocr_text"] = page_text
                res["_page_no"] = i+1
                
                header = res.get("header", {})
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
            # ... render page ...
            from .isolated_ocr_service import run_isolated_page_extraction
            
            light_text = doc[idx].get_text("text").strip()
            is_scanned = len(light_text) < 10
            dpi = 300 if is_scanned else 150
            
            iso_res = run_isolated_page_extraction(file_path, idx, dpi=dpi)
            if not iso_res["success"]:
                 continue
            
            page_text = re.sub(r'\s+', ' ', iso_res["text"]).strip()
            batch_data.append({
                'img_bytes': iso_res["image_bytes"],
                'ocr_text': page_text,
                'idx': idx
            })
            
        # 2. Call Batch AI
        batch_results = _call_ai_batch(batch_data, item_id, job_id, wait_for_result, tenant_id)
        
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
    
    # ── [PHASE 10: BARRIER STATE SYNC] ──
    if not wait_for_result and record_id:
        from .models import SessionFinalizationState
        SessionFinalizationState.objects.filter(id=str(record_id)).update(
            total_pages_completed=models.F('total_pages_completed') + len(results_map) # Tracking enqueued count
        )
        logger.info(f"[BOUNDED_FANOUT_SYNC] record={record_id} newly_enqueued={len(results_map)}")
    
    if limit is None and len(results_map) != page_count:
        logger.error(f"[FANOUT_MISMATCH] record_id={record_id} expected={page_count} actual={len(results_map)}")

    if doc: doc.close()

    # ── STEP 4: PAGE-BY-PAGE ISOLATION (Root Cause Fix) ──
    pages_map = {}
    for i in range(page_count):
        page_result = results_map.get(i) or {"status": "OCR_FAILED", "_error": "MISSING_RESULT"}
        page_result["_page_no"] = i + 1
        pages_map[str(i+1)] = page_result

    # [ROOT-CAUSE FIX] Return first page as primary, but NEVER merge unrelated pages here.
    # The assembly/splitting logic in pipeline.py handles multi-invoice PDFs.
    if results_map:
        final_result = results_map[0].copy()
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
