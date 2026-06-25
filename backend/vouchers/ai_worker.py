import asyncio
import os
import logging
import json
import uuid
import traceback
from typing import Dict, Any
from django.db import transaction
from django.utils import timezone
from django.db import models

from .worker_base import BaseWorker
from core.sqs import queue_service
from ocr_pipeline.models import InvoicePageResult, SessionFinalizationState, OCRTask
from vouchers.models import InvoiceProcessingItem

logger = logging.getLogger(__name__)

# Global AI Semaphore (Phase 9/10 Stabilization)
GLOBAL_AI_SEMAPHORE = asyncio.Semaphore(int(os.getenv('AI_GLOBAL_CONCURRENCY', '25')))

# AI PROVIDER IMAGE PREPROCESSING PASSES
# Pass 0: Original image (no transform)
# Pass 1: Grayscale
# Pass 2: Adaptive threshold
# Pass 3: Sharpen kernel
# Pass 4: Contrast enhancement
# Provider: Qwen-VL (self-hosted OpenAI-compatible API)
MAX_IMAGE_PASSES = 5
PASS_NAMES = [
    "original image",
    "grayscale",
    "adaptive threshold",
    "sharpen",
    "contrast enhancement",
]

class AIWorker(BaseWorker):
    """
    Handles Qwen-VL AI extraction, normalization, and page persistence.
    Role: AI
    Queue: ai

    QWEN-ONLY: No Tesseract, no local OCR fallback, no secondary engines.
    Failure → deterministic mark-as-failed → forward to assembly.
    """
    def __init__(self):
        super().__init__(role="AI", queue_type=os.getenv('SQS_AI_QUEUE_TYPE', 'ai'))
        self.allowed_task_types = ['AI_EXTRACTION']


    def _apply_image_transformation(self, payload: Dict[str, Any], pass_idx: int) -> Dict[str, Any]:
        """
        Applies OpenCV image transformations for AI preprocessing.
        Provider-agnostic: same transforms work for Qwen-VL as they did for Gemini.
        """
        import copy
        import base64

        new_payload = copy.deepcopy(payload)

        if pass_idx == 0:
            return new_payload  # Pass 0: original image, no transformation

        img_b64 = None
        img_key = None
        if 'image_data' in new_payload:
            img_b64 = new_payload['image_data']
            img_key = 'image_data'
        elif 'batch_images' in new_payload and new_payload['batch_images']:
            img_b64 = new_payload['batch_images'][0]['data']
            img_key = 'batch_images'

        if not img_b64:
            return new_payload

        try:
            import cv2
            import numpy as np

            img_bytes = base64.b64decode(img_b64)
            img_arr = np.frombuffer(img_bytes, np.uint8)
            cv_img = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)

            if cv_img is None:
                return new_payload

            if pass_idx == 1:
                # Grayscale
                cv_img = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
                cv_img = cv2.cvtColor(cv_img, cv2.COLOR_GRAY2BGR)
            elif pass_idx == 2:
                # Adaptive threshold
                gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
                cv_img = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
                cv_img = cv2.cvtColor(cv_img, cv2.COLOR_GRAY2BGR)
            elif pass_idx == 3:
                # Sharpen
                kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
                cv_img = cv2.filter2D(cv_img, -1, kernel)
            elif pass_idx == 4:
                # Contrast enhancement
                cv_img = cv2.convertScaleAbs(cv_img, alpha=1.5, beta=20)

            _, buffer = cv2.imencode('.jpg', cv_img)
            new_b64 = base64.b64encode(buffer).decode('utf-8')

            logger.info(f"[OCR_IMAGE_PREPROCESS] Applied pass {pass_idx} ({PASS_NAMES[pass_idx]})")

            if img_key == 'image_data':
                new_payload['image_data'] = new_b64
            else:
                new_payload['batch_images'][0]['data'] = new_b64

        except Exception as e:
            logger.error(f"[IMAGE_TRANSFORM_ERROR] pass={pass_idx} error={e}")

        return new_payload

    async def handle_task(self, task: Dict[str, Any]):
        try:
            await self._handle_task_inner(task)
        finally:
            payload = task.get('payload', {})
            record_id = payload.get('record_id')
            page_idx = payload.get('page_number') or payload.get('page_index') or task.get('page_number')
            session_id = task.get('session_id')
            tenant_id = task.get('tenant_id')
            if record_id:
                try:
                    from core.redis_orchestrator import orchestrator
                    logger.info(f"[SLOT_FORCE_RELEASE] record={record_id} page={page_idx} session={session_id}")
                    orchestrator.release_ai_slot(str(record_id), page_idx, session_id=str(session_id), release_reason="FINALLY_BLOCK_CLEANUP", tenant_id=str(tenant_id))
                except Exception as e:
                    logger.error(f"[SLOT_FORCE_RELEASE_ERROR] {e}")

    async def _handle_task_inner(self, task: Dict[str, Any]):
        # [PHASE 11.5] Unwrap canonical payload
        payload = task['payload']
        record_id = payload.get('record_id')
        session_id = task['session_id']
        tenant_id = task['tenant_id']
        correlation_id = task['correlation_id']
        page_idx = payload.get('page_number') or payload.get('page_index') or task.get('page_number')
        job_id = payload.get('job_id', task.get('job_id', 'unknown'))
        file_hash = payload.get('file_hash')

        logger.info(f"[CONTEXT_TRACE_AI_RECEIVE] job_id={job_id} record_id={record_id} session_id={session_id} tenant_id={tenant_id} trace_id={task.get('trace_id')} page={page_idx}")
        logger.info(f"[SESSION_FORENSIC] stage='ai_worker_receive' record={record_id} session={session_id} tenant={tenant_id} page={page_idx}")
        logger.info(f"[AI_PAGE_START] record={record_id} page={page_idx} session={session_id} correlation_id={correlation_id} worker_role=AI")

        # ── [PHASE 13: IDEMPOTENCY CHECK] ──
        slot_released = False
        try:
            from ocr_pipeline.models import InvoicePageResult
            loop = asyncio.get_running_loop()
            is_rescan = payload.get('is_rescan', False)
            already_processed = await loop.run_in_executor(
                None, 
                lambda: InvoicePageResult.objects.filter(record_id=record_id, page_number=page_idx, is_failed=False).exists()
            ) if not is_rescan else False
            if already_processed:
                logger.info(f"[IDEMPOTENCY_SKIP] record={record_id} page={page_idx} already successfully processed. Forwarding to assembly to prevent barrier deadlock.")
                
                # Release slot for idempotency skipped page
                from core.redis_orchestrator import orchestrator
                try:
                    if not slot_released:
                        orchestrator.release_ai_slot(str(record_id), page_idx, session_id=str(session_id), release_reason="IDEMPOTENCY_SKIP", tenant_id=str(tenant_id))
                        slot_released = True
                except Exception as rel_err:
                    logger.error(f"[SLOT_RELEASE_IDEMPOTENCY_FAIL] record={record_id} page={page_idx} error={rel_err}")

                from ocr_pipeline.models import InvoicePageResult
                from vouchers.coordinator import terminalize_page_state
                existing = InvoicePageResult.objects.filter(record_id=record_id, page_number=page_idx).first()
                payload_val = dict(existing.canonical_payload) if existing and existing.canonical_payload else {}
                # Preserve all underscore keys from task payload (e.g. _pdf_ocr_text)
                for k, v in payload.items():
                    if k.startswith("_") and k not in payload_val:
                        payload_val[k] = v

                # Ensure both _pdf_ocr_text and _raw_text are populated with the OCR text
                ocr_text_val = payload_val.get('_pdf_ocr_text') or payload_val.get('_raw_text')
                if ocr_text_val:
                    payload_val['_pdf_ocr_text'] = ocr_text_val
                    payload_val['_raw_text'] = ocr_text_val

                loop = asyncio.get_running_loop()
                await loop.run_in_executor(
                    self.executor,
                    lambda: terminalize_page_state(
                        record_id=record_id,
                        page_number=page_idx,
                        session_id=session_id,
                        is_failed=False,
                        canonical_payload=payload_val,
                        worker_id="AIWorkerIdempotencySkip",
                        queue_source="ai_queue",
                        tenant_id=tenant_id,
                        correlation_id=correlation_id,
                        job_id=job_id,
                        item_id=payload.get('item_id') or task.get('item_id')
                    )
                )
                # Trigger next fanout so we don't stall the sliding window!
                try:
                    from ocr_pipeline.pipeline import trigger_next_fanout
                    await loop.run_in_executor(
                        self.executor,
                        lambda: trigger_next_fanout(record_id)
                    )
                except Exception as fan_err:
                    logger.error(f"[FANOUT_TRIGGER_IDEMPOTENCY_FAIL] record={record_id} err={fan_err}")
                return
        except Exception as e:
            logger.error(f"[IDEMPOTENCY_CHECK_FAIL] {e}")

        try:
            from core.ai_proxy import process_ai_request
            from ocr_pipeline.normalize import get_canonical_export_record
            from ocr_pipeline.extraction import _repair_json
            from core.observability import metrics

            loop = asyncio.get_running_loop()

            logger.info(f"[OCR_RETRY_CHAIN_START] record={record_id} page={page_idx} max_passes={MAX_IMAGE_PASSES}")

            # ── [PHASE 4: OCR RESPONSE CACHE] ──
            # Check if we have a cached extraction for this exact (file_hash, page_number).
            # If so, skip the AI provider entirely and reuse the prior result.
            if file_hash:
                try:
                    from ocr_pipeline.ocr_cache import OCRResponseCache
                    cached_payload = await loop.run_in_executor(
                        self.executor,
                        lambda: OCRResponseCache.get(file_hash, page_idx)
                    )
                    if cached_payload:
                        logger.info(
                            f"[OCR_CACHE_HIT_FASTPATH] record={record_id} page={page_idx} "
                            f"file_hash={file_hash} invoice_no={cached_payload.get('invoice_no')} "
                            f"item_count={len(cached_payload.get('items') or [])} "
                            "Skipping AI provider call."
                        )
                        # Inject live session context over the cached payload
                        cached_payload = dict(cached_payload)
                        cached_payload['record_id'] = str(record_id)
                        cached_payload['upload_session_id'] = str(session_id)
                        cached_payload['tenant_id'] = str(tenant_id)
                        if job_id != 'unknown':
                            cached_payload['job_id'] = str(job_id)

                        # Preserve all underscore keys from task payload (e.g. _pdf_ocr_text)
                        for k, v in payload.items():
                            if k.startswith("_") and k not in cached_payload:
                                cached_payload[k] = v

                        # Ensure both _pdf_ocr_text and _raw_text are populated with the OCR text
                        ocr_text_val = cached_payload.get('_pdf_ocr_text') or cached_payload.get('_raw_text')
                        if ocr_text_val:
                            cached_payload['_pdf_ocr_text'] = ocr_text_val
                            cached_payload['_raw_text'] = ocr_text_val

                        from core.redis_orchestrator import orchestrator
                        orchestrator.release_ai_slot(
                            str(record_id), page_idx,
                            session_id=str(session_id),
                            release_reason="CACHE_HIT",
                            tenant_id=str(tenant_id)
                        )
                        from vouchers.coordinator import terminalize_page_state
                        loop = asyncio.get_running_loop()
                        await loop.run_in_executor(
                            self.executor,
                            lambda: terminalize_page_state(
                                record_id=str(record_id),
                                page_number=page_idx,
                                session_id=session_id,
                                is_failed=False,
                                canonical_payload=cached_payload,
                                worker_id="AIWorkerCacheHit",
                                queue_source="ai_queue",
                                tenant_id=tenant_id,
                                correlation_id=correlation_id,
                                job_id=job_id,
                                item_id=payload.get('item_id') or task.get('item_id')
                            )
                        )
                        # Trigger next fanout so we don't stall the sliding window!
                        try:
                            from ocr_pipeline.pipeline import trigger_next_fanout
                            await loop.run_in_executor(
                                self.executor,
                                lambda: trigger_next_fanout(record_id)
                            )
                        except Exception as fan_err:
                            logger.error(f"[FANOUT_TRIGGER_CACHE_FAIL] record={record_id} err={fan_err}")
                        return
                except Exception as _cache_err:
                    logger.warning(f"[OCR_CACHE_FASTPATH_ERR] record={record_id} page={page_idx} err={_cache_err}")


            final_result = None
            success = False
            current_payload = payload  # will be updated per pass



            for pass_idx in range(MAX_IMAGE_PASSES):
                logger.info(f"[OCR_RECOVERY_PASS] pass={pass_idx+1}/{MAX_IMAGE_PASSES} ({PASS_NAMES[pass_idx]}) record={record_id} page={page_idx}")

                # Apply image transformation for AI extraction
                current_payload = await loop.run_in_executor(
                    self.executor,
                    lambda pi=pass_idx: self._apply_image_transformation(payload, pi)
                )

                # Run Qwen extraction (SOLE OCR ENGINE)
                result = None
                try:
                    result = await loop.run_in_executor(
                        self.executor,
                        lambda cp=current_payload: process_ai_request(cp)
                    )
                except Exception as e:
                    if e.__class__.__name__ == 'ProviderSaturatedError':
                        raise e
                    logger.error(f"[AI_PROVIDER_REQUEST_ERROR] pass={pass_idx+1} record={record_id} page={page_idx} error={e}")
                    # Phase 3: Check if terminal failure
                    from core.ai_proxy import is_retryable_ai_error
                    if not is_retryable_ai_error(e):
                        logger.error(f"[OCR_RECOVERY_SKIPPED_INFRA_FAILURE] Terminal AI failure, skipping recovery chain. record={record_id} page={page_idx} error={e}")
                        result = {'error': str(e), 'retryable': False}
                        break
                    result = None

                # Validate AI output
                raw_reply = result.get('reply', '') if result else ''

                if result and result.get('status') != 'OCR_FAILED' and raw_reply:
                    try:
                        parsed = None
                        repaired_text, repair_strategy, repair_err = await loop.run_in_executor(
                            None,
                            lambda rr=raw_reply: _repair_json(rr, record_id=record_id, page=page_idx)
                        )

                        # ── TASK 7: REPAIR-BEFORE-RETRY GATE ──────────────────────────────
                        # If the repair pipeline fixed an arithmetic expression (or any other
                        # structural issue) and json.loads() now succeeds, we accept the
                        # repaired payload IMMEDIATELY — no new 141s Qwen inference needed.
                        # Only trigger a new Qwen pass when:
                        #   - HTTP failure / timeout        → result is None
                        #   - Completely empty response     → raw_reply is empty
                        #   - REPAIR_FAILED strategy        → repair could not salvage the JSON
                        #
                        # Log the saved retry so we can measure the impact.
                        repair_succeeded = (
                            repair_strategy not in ("REPAIR_FAILED", "NO_JSON", "EMPTY", "NONE")
                            and repaired_text
                        )
                        if repair_succeeded and "ARITHMETIC_REPAIR" in repair_strategy:
                            logger.info(
                                f"[REPAIR_SAVED_RETRY] record={record_id} page={page_idx} "
                                f"pass={pass_idx+1} strategy={repair_strategy} "
                                f"avoided_qwen_retry=True estimated_saved_seconds=141"
                            )
                        # ──────────────────────────────────────────────────────────────────

                        parsed = json.loads(repaired_text)
                        if not parsed:
                            raise ValueError("StructuredParseError: parsed output is empty")
                        logger.info(f"[PARSER_VARIABLE_INIT] record={record_id} page={page_idx} stage=retries")
                        
                        canonical_payload = await loop.run_in_executor(
                            self.executor,
                            lambda: get_canonical_export_record(parsed, tenant_id=tenant_id)
                        )

                        if self._is_dto_valid(canonical_payload):
                            text_str = json.dumps(canonical_payload)
                            char_count = len(text_str)
                            alnum_count = sum(c.isalnum() for c in text_str)
                            density = alnum_count / max(1, char_count)
                            has_anchors = any(
                                k in parsed and parsed[k]
                                for k in ["invoice_no", "date", "total_amount", "vendor_name", "items"]
                            )

                            metrics.record_latency("ocr:text_density", density)

                            if char_count > 50 and density > 0.3 and has_anchors:
                                logger.info(f"[OCR_RECOVERY_SUCCESS] pass={pass_idx+1} record={record_id} page={page_idx}")
                                logger.info(f"[PAGE_OCR_COMPLETED] record={record_id} page={page_idx}")
                                metrics.increment_counter("ocr:page_success")
                                if pass_idx > 0:
                                    metrics.increment_counter("ocr:retry_success")
                                final_result = result
                                success = True

                                # ── [PHASE 4: STORE TO CACHE] ──
                                # Store this successful extraction so future uploads of the
                                # same page skip the AI provider entirely.
                                file_hash_val = payload.get('file_hash') or ''
                                if file_hash_val:
                                    try:
                                        from ocr_pipeline.ocr_cache import (
                                            OCRResponseCache,
                                            ItemExtractionConsensusEngine,
                                        )
                                        await loop.run_in_executor(
                                            self.executor,
                                            lambda: OCRResponseCache.store(
                                                file_hash_val, page_idx, canonical_payload
                                            )
                                        )
                                        # Run consensus if we have 2+ historic extractions
                                        history = await loop.run_in_executor(
                                            self.executor,
                                            lambda: ItemExtractionConsensusEngine.get_historic_payloads(
                                                file_hash_val, page_idx
                                            )
                                        )
                                        if len(history) >= 2:
                                            inv_no = canonical_payload.get('invoice_no', '')
                                            elected, conf, reason = ItemExtractionConsensusEngine.elect(
                                                history,
                                                invoice_no=inv_no,
                                                file_hash=file_hash_val,
                                                page_number=page_idx,
                                            )
                                            if conf >= 0.5:  # majority consensus
                                                canonical_payload = elected
                                                logger.info(
                                                    f"[ITEM_CONSENSUS_APPLIED] record={record_id} "
                                                    f"page={page_idx} reason={reason}"
                                                )
                                    except Exception as _ce:
                                        logger.warning(f"[PHASE4_CACHE_ERR] record={record_id} page={page_idx} err={_ce}")

                                break
                            else:
                                # ── TASK 7: only retry Qwen if repair did NOT fix the issue ──
                                if repair_succeeded:
                                    logger.warning(
                                        f"[OCR_RECOVERY_FAILED] pass={pass_idx+1} record={record_id} "
                                        f"page={page_idx} reason=low_density_or_missing_anchors "
                                        f"density={density:.2f} char_count={char_count} "
                                        f"repair_strategy={repair_strategy} "
                                        f"note=QWEN_RETRY_TRIGGERED_despite_repair"
                                    )
                                else:
                                    logger.warning(f"[OCR_RECOVERY_FAILED] pass={pass_idx+1} record={record_id} page={page_idx} reason=low_density_or_missing_anchors density={density:.2f} char_count={char_count}")
                        else:
                            logger.warning(f"[OCR_RECOVERY_FAILED] pass={pass_idx+1} record={record_id} page={page_idx} reason=invalid_dto")
                    except Exception as e:
                        if isinstance(e, (NameError, AttributeError, TypeError)):
                            logger.error(f"[OCR_PROGRAMMING_ERROR] pass={pass_idx+1} record={record_id} page={page_idx} error={e}. Aborting retries.")
                            raise e
                        logger.warning(f"[OCR_RECOVERY_FAILED] pass={pass_idx+1} record={record_id} page={page_idx} reason=parse_error error={e}")
                else:
                    logger.warning(f"[OCR_RECOVERY_FAILED] pass={pass_idx+1} record={record_id} page={page_idx} reason=ocr_failed_or_empty_reply")
                        
                if not success and pass_idx < MAX_IMAGE_PASSES - 1:
                    logger.warning(f"[PAGE_FAILED_RETRYABLE] record_id={record_id} page={page_idx} pass={pass_idx+1}/{MAX_IMAGE_PASSES}")


            if not success:
                logger.error(f"[OCR_RETRY_CHAIN_EXHAUSTED] record={record_id} page={page_idx} all_passes_failed=True")
                logger.error(f"[PAGE_FAILED_TERMINAL] record_id={record_id} page={page_idx}")
                metrics.increment_counter("ocr:page_failed")
                if final_result is not None:
                    final_result['status'] = 'OCR_FAILED'
                    final_result['error'] = 'Terminal validation failure (density/DTO)'
                else:
                    final_result = {'status': 'OCR_FAILED', 'error': 'All passes failed'}

            # Validation & persistence — ONCE, after retry chain completes
            final_task = {**task, 'payload': current_payload}
            await self._process_result(final_task, final_result)

        except Exception as e:
            if e.__class__.__name__ == 'ProviderSaturatedError':
                raise e
            tb = traceback.format_exc()
            logger.error(f"[AI_WORKER_UNHANDLED_EXCEPTION] record={record_id} page={page_idx} error={e}\ntraceback={tb}")
            logger.error(f"[DTO_LOST] Potential DTO loss for record={record_id} page={page_idx}")

            # Persist failure to DB so assembly barrier can proceed
            if record_id:
                try:
                    from ocr_pipeline.models import SessionFinalizationState, InvoicePageResult
                    from vouchers.coordinator import log_forensic_trace

                    def _fail_db():
                        log_forensic_trace("unhandled_fail_db_BEFORE", record_id, f"page={page_idx}")
                        try:
                            from vouchers.coordinator import terminalize_page_state
                            terminalize_page_state(
                                record_id=str(record_id),
                                page_number=page_idx,
                                session_id=session_id,
                                is_failed=True,
                                canonical_payload={'status': 'OCR_FAILED', 'error': f"UNHANDLED: {str(e)}"},
                                worker_id="AIWorker",
                                queue_source="ai_queue",
                                tenant_id=tenant_id,
                                correlation_id=correlation_id,
                                job_id=payload.get('job_id') or task.get('job_id'),
                                item_id=payload.get('item_id') or task.get('item_id')
                            )
                            log_forensic_trace("unhandled_fail_db_AFTER", record_id, f"page={page_idx}")
                        except Exception as inner_db_err:
                            logger.critical(f"[FAIL_DB_CONVERGENCE_FAILED] record={record_id} page={page_idx} error={inner_db_err}\ntrace={traceback.format_exc()}")
                            raise
                            
                        # Note: Slot is released in finally block
                        
                        # Also trigger next fanout so we don't stall the window
                        from ocr_pipeline.pipeline import trigger_next_fanout
                        trigger_next_fanout(record_id)

                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(self.executor, _fail_db)
                    logger.warning(f"[DB_BARRIER_INCREMENT] record={record_id} page={page_idx} status=FAILED (AI Worker Unhandled Exception)")
                except Exception as db_err:
                    logger.critical(f"[DB_BARRIER_FAIL] record={record_id} page={page_idx}: {db_err}")

            raise

    async def _process_result(self, task, result):
        payload = task.get('payload', {})
        record_id = payload.get('record_id') or task.get('record_id')
        page_idx = payload.get('page_number') or payload.get('page_index') or task.get('page_number') or task.get('page_index')
        item_id = payload.get('item_id') or task.get('item_id')
        job_id = payload.get('job_id') or task.get('job_id')
        session_id = task.get('session_id') or payload.get('session_id', 'unknown')
        tenant_id = task.get('tenant_id') or payload.get('tenant_id', 'unknown')
        correlation_id = task.get('correlation_id')
        
        is_failed = False
        
        # [PHASE 13] If skipped due to idempotency, DO NOT overwrite the DB, just push to assembly
        if result and result.get('status') == 'SKIPPED_DUPLICATE':
            logger.info(f"[IDEMPOTENCY_FORWARDING] record={record_id} page={page_idx}")
        else:
            from ocr_pipeline.normalize import get_canonical_export_record
            from ocr_pipeline.extraction import _repair_json

            raw_reply = result.get('reply', '') if result else ''
            canonical_payload = {}

            if result and result.get('status') != 'OCR_FAILED' and raw_reply:
                try:
                    parsed = None
                    loop = asyncio.get_running_loop()
                    repaired_text, _, _ = await loop.run_in_executor(
                        None,
                        lambda: _repair_json(raw_reply, record_id=record_id, page=page_idx)
                    )
                    logger.info(f"[AI_PARSE_START] record={record_id} page={page_idx}")
                    parsed = json.loads(repaired_text)
                    if not parsed:
                        raise ValueError("StructuredParseError: parsed output is empty")
                    
                    # Forensic logging of GSTIN raw and extracted states
                    raw_gstin_ocr = str(parsed.get('header', {}).get('vendor_gstin') or parsed.get('header', {}).get('gstin') or parsed.get('gstin') or "").strip()
                    logger.info(
                        f"[GSTIN_RAW_OCR] upload_session_id={session_id} page_number={page_idx} "
                        f"invoice_no={parsed.get('header', {}).get('invoice_no')} vendor_name={parsed.get('header', {}).get('vendor_name')} "
                        f"gstin={raw_gstin_ocr} length={len(raw_gstin_ocr)}"
                    )
                    logger.info(
                        f"[GSTIN_EXTRACTED] upload_session_id={session_id} page_number={page_idx} "
                        f"invoice_no={parsed.get('header', {}).get('invoice_no')} vendor_name={parsed.get('header', {}).get('vendor_name')} "
                        f"gstin={raw_gstin_ocr} length={len(raw_gstin_ocr)}"
                    )
                    logger.info(f"[PARSER_VARIABLE_INIT] record={record_id} page={page_idx} stage=process_result")
                    try:
                        from ocr_pipeline.extraction import log_forensic_page_dto
                        log_forensic_page_dto(parsed, session_id, record_id, page_idx, raw_reply)
                    except Exception as le:
                        logger.warning(f"[FORENSIC_PAGE_DTO_LOG_ERR] {le}")
                    
                    # [PHASE 5: DTO CONTEXT PROPAGATION]
                    # Ensure canonical context survives the async boundary.
                    # The AI model will never generate these, so we inject them.
                    parsed['record_id'] = str(record_id)
                    if job_id != 'unknown':
                        parsed['job_id'] = str(job_id)
                    parsed['upload_session_id'] = str(session_id)
                    parsed['tenant_id'] = str(tenant_id)
                    
                    # [QWEN_ITEM_CLASSIFICATION] Telemetry
                    pre_norm_items = parsed.get("items") or parsed.get("sections", {}).get("items") or []
                    for itm in pre_norm_items:
                        logger.info(f"[QWEN_ITEM_CLASSIFICATION] record={record_id} page={page_idx} description='{itm.get('description', '')}' quantity={itm.get('quantity')} rate={itm.get('rate')} amount={itm.get('amount')}")
                    
                    canonical_payload = await loop.run_in_executor(
                        self.executor,
                        lambda: get_canonical_export_record(parsed, tenant_id=tenant_id)
                    )
                    
                    # Double-ensure they are in the final payload
                    canonical_payload['record_id'] = str(record_id)
                    if job_id != 'unknown':
                        canonical_payload['job_id'] = str(job_id)
                    canonical_payload['upload_session_id'] = str(session_id)
                    canonical_payload['tenant_id'] = str(tenant_id)

                    # Preserve all underscore keys from task payload (e.g. _pdf_ocr_text)
                    for k, v in payload.items():
                        if k.startswith("_") and k not in canonical_payload:
                            canonical_payload[k] = v

                    # Ensure both _pdf_ocr_text and _raw_text are populated with the OCR text
                    ocr_text_val = canonical_payload.get('_pdf_ocr_text') or canonical_payload.get('_raw_text')
                    if ocr_text_val:
                        canonical_payload['_pdf_ocr_text'] = ocr_text_val
                        canonical_payload['_raw_text'] = ocr_text_val
                    
                    try:
                        from ocr_pipeline.pipeline import trace_item_checkpoint
                        trace_item_checkpoint(
                            record_id=str(record_id),
                            invoice_no=canonical_payload.get('invoice_no') or "",
                            page_number=page_idx,
                            stage="ITEM_TRACE_EXTRACTED",
                            item_count=len(canonical_payload.get('items', [])),
                            item_status=canonical_payload.get('item_status'),
                            snapshot_item_count=None
                        )
                    except Exception as trace_err:
                        logger.error(f"[TRACE_ERR] ITEM_TRACE_EXTRACTED: {trace_err}")
                    
                    is_failed = not self._is_dto_valid(canonical_payload, is_final=True)
                    if is_failed:
                        # [FIX] Do NOT emit AI_PAGE_SUCCESS for terminal page failures
                        logger.warning(f"[DEGRADED_PAGE_FAILED] record={record_id} page={page_idx} marked as FAILED for barrier.")
                        
                    if not is_failed:
                        logger.info(f"[AI_PAGE_SUCCESS] record={record_id} page={page_idx} correlation_id={correlation_id} worker_role=AI")
                        logger.info(f"[SESSION_FORENSIC] stage='ai_page_success' record={record_id} session={session_id} tenant={tenant_id} page={page_idx}")
                    else:
                        logger.error(f"[AI_PAGE_FAIL] record={record_id} page={page_idx} correlation_id={correlation_id} worker_role=AI reason=invalid_dto")
                        logger.info(f"[SESSION_FORENSIC] stage='ai_page_fail' record={record_id} session={session_id} tenant={tenant_id} page={page_idx} reason='invalid_dto'")
                except Exception as e:
                    logger.error(f"[AI_PARSE_ERR] {e} trace={traceback.format_exc()}")
                    canonical_payload = {"_error": str(e)}
                    is_failed = True
                    logger.error(f"[AI_PAGE_FAIL] record={record_id} page={page_idx} correlation_id={correlation_id} worker_role=AI reason=parse_err")
            else:
                is_failed = True
                canonical_payload = {"_error": result.get('error') if result else "TIMEOUT_OR_NULL"}
                logger.error(f"[AI_PAGE_FAIL] record={record_id} page={page_idx} correlation_id={correlation_id} worker_role=AI reason=ocr_failed")

            def _persist():
                from core.redis_orchestrator import orchestrator
                from vouchers.coordinator import log_forensic_trace, terminalize_page_state
                
                log_forensic_trace("persist_db_BEFORE", record_id, f"page={page_idx} is_failed={is_failed}")
                try:
                    session_id = task.get('session_id') or task.get('upload_session_id') or 'unknown'
                    terminalize_page_state(
                        record_id=str(record_id),
                        page_number=page_idx,
                        session_id=session_id,
                        is_failed=is_failed,
                        canonical_payload=canonical_payload,
                        worker_id="AIWorker",
                        queue_source="ai_queue",
                        tenant_id=tenant_id,
                        correlation_id=correlation_id,
                        job_id=job_id,
                        item_id=item_id
                    )
                    log_forensic_trace("persist_db_AFTER", record_id, f"page={page_idx} is_failed={is_failed} (saved)")
                except Exception as inner_db_err:
                    logger.critical(f"[PERSIST_DB_FAILED] record={record_id} page={page_idx} error={inner_db_err}\ntrace={traceback.format_exc()}")
                    raise

                # [FIX] Do NOT call update_session_status(PROCESSING, 0.0) here.
                # That overwrites legitimate progress set by assembly_worker back to 0%.
                # Progress is managed exclusively by assembly_worker once all pages are in.
                # We only push a proportional progress hint — never regress to 0.
                try:
                    barrier_state = SessionFinalizationState.objects.filter(id=str(record_id)).values(
                        'ai_completed_pages', 'expected_pages'
                    ).first()
                    if barrier_state and barrier_state['expected_pages'] > 0:
                        ai_done = barrier_state['ai_completed_pages']
                        expected = barrier_state['expected_pages']
                        # AI stage spans 20% - 70% of total progress
                        pct = 20.0 + (ai_done / expected) * 50.0
                        pct = min(pct, 70.0)  # never exceed 70% until assembly confirms
                        
                        log_forensic_trace("redis_progress_update_BEFORE", record_id, f"progress={pct:.1f}%")
                        orchestrator.update_session_status(str(record_id), "PROCESSING", progress=pct)
                        log_forensic_trace("redis_progress_update_AFTER", record_id, f"progress={pct:.1f}%")
                except Exception as _prog_err:
                    logger.warning(f"[AI_PROGRESS_HINT_FAIL] {_prog_err}")

                # Note: Slot is released in finally block

                from ocr_pipeline.pipeline import trigger_next_fanout
                trigger_next_fanout(record_id)

            loop = asyncio.get_running_loop()
            await loop.run_in_executor(self.executor, _persist)

            await self._update_task_status(task, is_failed)

        pass


    def _is_dto_valid(self, payload, is_final=False):
        record_id = payload.get('record_id') or "unknown"
        logger.info(f"[DTO_PRE_VALIDATION] record={record_id} keys={list(payload.keys())}")
        required = ['vendor_name', 'invoice_no']
        missing = [f for f in required if not payload.get(f)]
        if 'items' not in payload or payload.get('items') is None:
            missing.append('items')
        if missing:
            logger.error(f"[DTO_VALIDATION_ERROR] record={record_id} missing_fields={missing} "
                         f"extracted_sample={json.dumps({k: payload.get(k) for k in payload.keys() if not k.startswith('_')}, default=str)[:500]}")
            if is_final:
                logger.critical(f"[DTO_TERMINAL_VOID] record={record_id} Missing required fields {missing}. Rejecting DTO_PARTIAL_VALID.")
            else:
                logger.warning(f"[PAGE_STATUS] record={record_id} status=RETRYABLE_INVALID reason=missing_fields_{missing}")
            return False

        # Semantic DTO validation: allow continuation / summary / footer pages for staging, log as allowed.
        items = payload.get('items') or []
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

        if not has_real_items and has_summary_rows:
            logger.info(f"[CONTINUATION_PAGE_ALLOWED] page={record_id} is a summary-only/footer page, allowed to proceed to assembly staging.")

        logger.info(f"[DTO_POST_VALIDATION] record={record_id} valid=True")
        return True

    async def _update_task_status(self, task, is_failed):
        item_id = task.get('item_id')
        if not item_id:
            return
        status = 'FAILED' if is_failed else 'COMPLETED'
        loop = asyncio.get_running_loop()
        try:
            uuid.UUID(str(item_id))
            await loop.run_in_executor(
                None,
                lambda: OCRTask.objects.filter(id=item_id).update(status=status, updated_at=timezone.now())
            )
        except Exception:
            pass

if __name__ == "__main__":
    import django
    django.setup()
    worker = AIWorker()
    asyncio.run(worker.run())
