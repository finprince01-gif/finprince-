import json
import logging
import re
import base64
import fitz  # PyMuPDF
import io
import time
import concurrent.futures
from google.genai import types
from core.ai_proxy import ai_service

logger = logging.getLogger(__name__)

_JSON_QUARANTINE_LOG = logging.getLogger("AIJsonQuarantine")

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

def extract_invoice(client, file_bytes, voucher_type='Purchase', public_ip="0.0.0.0", user_id='system', tenant_id='system', wait_for_result=True, record_id=None, item_id=None, upload_session_id=None, job_id=None):
    """
    Extracts invoice data using the central AI Proxy service with fallbacks.
    Returns a unified JSON object matching the internal schema.

    ROOT-CAUSE FIX (PAYLOAD ISOLATION):
    Processes each page independently with ONLY its own OCR text and image.
    Ensures prompt size remains < 150K and prevents "full document" leakage.
    """
    # ── STEP 1: IDENTIFY PAGES ──
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        page_count = len(doc)
    except Exception:
        doc = None
        page_count = 1

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

    def _call_ai_for_page(segment_bytes, page_ocr_text, page_idx, total_pages, item_id, job_id=None, wait_for_result=True):
        """
        HARD ISOLATION RULE: ONE PAGE -> ONE OCR TEXT -> ONE IMAGE -> ONE REQUEST
        """
        # Ensure ONLY this page's OCR text is included. 
        # Explicitly label the text to prevent any overlap with previous/next pages.
        page_isolated_prompt = f"### [PAGE {page_idx+1} OCR DATA]\n{page_ocr_text}\n\n{base_prompt}"
        
        file_b64 = base64.b64encode(segment_bytes).decode('utf-8')
        
        # Build fresh request dictionary
        request_data = {
            'type': 'extraction',
            'prompt': page_isolated_prompt,
            'image_data': file_b64,
            'mime_type': 'image/jpeg',
            'voucher_type': voucher_type,
            'page_index': page_idx + 1,
            'wait_for_result': wait_for_result, # Use the passed parameter
            '_pdf_ocr_text': page_ocr_text # Preserve for finalization
        }
        
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
        response = ai_service.make_request('extraction', request_data, user_id, tenant_id, metadata=metadata)
        
        # ── [ADDRESS_EXTRACTION_FORENSIC] ──
        if response and 'reply' in response:
            reply = response.get('reply', '')
            logger.info(f"[AI_REPLY_RECEIVED] length={len(reply)}")
            if "vendor_address" in reply.lower():
                logger.info(f"[ADDRESS_KEY_DETECTED] key='vendor_address' found in AI reply")
            if "billing_address" in reply.lower():
                logger.info(f"[ADDRESS_KEY_DETECTED] key='billing_address' found in AI reply")
        
        if not wait_for_result:
            logger.info(f"[PIPELINE_AI_ENQUEUE] record_id={record_id} queue=ai_requests")
            return response # Return the enqueued job info immediately

        if 'error' in response:
            raise RuntimeError(response['error'])

        raw_text = response.get('reply', '').strip()
        if not raw_text:
            logger.warning(f"Empty AI reply for page {page_idx+1}")
            return {"_error": "EMPTY_REPLY", "_raw": ""}

        cleaned_json_text = extract_json_from_text(raw_text)
        if not cleaned_json_text:
            return {"_error": "NO_JSON_FOUND", "_raw": raw_text}
        
        repaired_text, repair_strategy, repair_err = _repair_json(
            cleaned_json_text, record_id=record_id, page=page_idx + 1
        )
        logger.info(
            f"[JSON_PARSE_ATTEMPT] record={record_id} page={page_idx+1} "
            f"strategy={repair_strategy} repair_err={repair_err}"
        )
        try:
            result = json.loads(repaired_text)
            if not isinstance(result, dict):
                return {"_error": "INVALID_JSON_STRUCTURE", "_raw": raw_text}

            logger.info(
                f"[EXTRACTION_SUCCESS] record={record_id} page={page_idx+1} "
                f"repair_strategy={repair_strategy} "
                f"keys={list(result.get('header', {}).keys()) if 'header' in result else list(result.keys())}"
            )
            if page_ocr_text:
                result["_pdf_ocr_text"] = page_ocr_text
            result["_raw_text"] = raw_text
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
        # ── [AI_TASK_STARTED] Forensics ──
        logger.info(
            f"[AI_TASK_STARTED] "
            f"record={record_id} "
            f"page={i+1} "
            f"session={upload_session_id}"
        )
        
        try:
            page = doc[i]
            
            # ── [PHASE 2 & 3] ROTATION & IMAGE DETECTION ──
            rotation = page.rotation
            logger.info(f"[PAGE_ROTATION] page={i+1} degrees={rotation}")
            
            # Detect if it's a scanned image PDF (no text)
            raw_text_content = page.get_text("text").strip()
            is_scanned = len(raw_text_content) < 10
            
            if is_scanned:
                logger.info(f"[IMAGE_PDF_DETECTED] page={i+1} Switching to High DPI rasterization")
                # Phase 3: High DPI for scans
                pix = page.get_pixmap(dpi=300)
            else:
                pix = page.get_pixmap(dpi=150)

            # Auto-Rotation Check (Simple heuristic or PyMuPDF's rotation)
            # If rotation is 90/180/270, pixmap already handles it in some versions, 
            # but we can force it if needed.
            
            img_bytes = pix.tobytes("jpg", jpg_quality=80)
            
            # ── [PHASE 8] FALLBACK OCR CHAIN ──
            page_text = raw_text_content
            if is_scanned or len(page_text) < 50:
                logger.info(f"[FALLBACK_OCR_TRIGGERED] page={i+1} reason='Low text density'")
                # If we had Tesseract/Paddle, we'd call them here. 
                # For now, we rely on Gemini's Vision capability as the ultimate fallback.
                page_text = f"[SCANNED_PAGE_NO_DIRECT_TEXT] Image size: {len(img_bytes)} bytes"

            logger.info(f"[OCR_TEXT_LENGTH] page={i+1} length={len(page_text)}")
            
            # Clean up OCR text
            page_text = re.sub(r'\s+', ' ', page_text).strip()
            
            # ── [PHASE 9] MULTI-INVOICE DETECTION HINT ──
            if len(page_text) > 1000:
                gst_matches = len(re.findall(r'\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}', page_text))
                if gst_matches > 1:
                    logger.info(f"[MULTI_INVOICE_DETECTED] page={i+1} GST_count={gst_matches}")

            # 3. Call Gemini
            res = _call_ai_for_page(img_bytes, page_text, i, page_count, item_id, job_id=job_id, wait_for_result=wait_for_result)
            
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
                f"[AI_TASK_COMPLETED] "
                f"record={record_id} "
                f"page={i+1} "
                f"session={upload_session_id} "
                f"status={res.get('_status') or 'SUCCESS'}"
            )
            return i, res
            
        except Exception as e:
            logger.error(f"Failed to process page {i+1}: {e}")
            # ── [PHASE 1] NEVER DROP PAGES ──
            placeholder = {
                "status": "OCR_FAILED",
                "_error": str(e),
                "_page_no": i+1,
                "header": {},
                "items": [],
                "failure_reason": "RUNTIME_EXCEPTION"
            }
            logger.info(f"[PAGE_FINAL_STATUS] page={i+1} status=OCR_FAILED")
            return i, placeholder

    logger.info(f"[PERF] Starting Parallel OCR for {page_count} pages...")
    
    results_map = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(page_count, 5)) as executor:
        futures = [executor.submit(process_single_page, i) for i in range(page_count)]
        for future in concurrent.futures.as_completed(futures):
            idx, res = future.result()
            results_map[idx] = res

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

    final_result["_pages"] = pages_map
    
    logger.info(f"[EXTRACTION_COMPLETE] pages={page_count} session={upload_session_id} record={record_id}")
    logger.info(f"[PERF] Total Pipeline Time: {time.monotonic() - t_start:.2f}s for {page_count} pages")
    return final_result
