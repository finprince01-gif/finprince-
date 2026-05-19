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

# GEMINI-ONLY IMAGE PREPROCESSING PASSES
# Pass 0: Original image (no transform)
# Pass 1: Grayscale
# Pass 2: Adaptive threshold
# Pass 3: Sharpen kernel
# Pass 4: Contrast enhancement
# No Tesseract. No fallback engine. Gemini is sole OCR.
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
    Handles Gemini API extraction, normalization, and page persistence.
    Role: AI
    Queue: ai

    GEMINI-ONLY: No Tesseract, no local OCR fallback, no secondary engines.
    Failure → deterministic mark-as-failed → forward to assembly.
    """
    def __init__(self):
        super().__init__(role="AI", queue_type=os.getenv('SQS_AI_QUEUE_TYPE', 'ai'))
        self.allowed_task_types = ['AI_EXTRACTION']

    def _save_failed_artifact(self, payload: Dict[str, Any], record_id: str, page_idx: int, pass_idx: int):
        """Save failed page images for forensic inspection."""
        import base64
        from django.conf import settings
        try:
            artifact_dir = os.path.join(settings.BASE_DIR, "failed_pages")
            os.makedirs(artifact_dir, exist_ok=True)
            img_b64 = payload.get('image_data') or (
                payload.get('batch_images') and payload['batch_images'][0].get('data')
            )
            if img_b64:
                img_bytes = base64.b64decode(img_b64)
                file_path = os.path.join(artifact_dir, f"{record_id}_page{page_idx}_pass{pass_idx}.jpg")
                with open(file_path, "wb") as f:
                    f.write(img_bytes)
        except Exception as e:
            logger.error(f"[ARTIFACT_SAVE_ERROR] {e}")

    def _apply_image_transformation(self, payload: Dict[str, Any], pass_idx: int) -> Dict[str, Any]:
        """
        Applies OpenCV image transformations for Gemini preprocessing.
        GEMINI-ONLY: No Tesseract, no fallback OCR engine.
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
        # [PHASE 11.5] Unwrap canonical payload
        payload = task['payload']
        record_id = payload.get('record_id')
        session_id = task['session_id']
        tenant_id = task['tenant_id']
        correlation_id = task['correlation_id']
        page_idx = payload.get('page_number') or payload.get('page_index') or task.get('page_number')

        logger.info(f"[AI_PAGE_START] record={record_id} page={page_idx} session={session_id} correlation_id={correlation_id} worker_role=AI")

        try:
            async with GLOBAL_AI_SEMAPHORE:
                from core.ai_proxy import process_ai_request
                from ocr_pipeline.normalize import get_canonical_export_record
                from ocr_pipeline.extraction import _repair_json
                from core.observability import metrics

                loop = asyncio.get_running_loop()

                logger.info(f"[OCR_RETRY_CHAIN_START] record={record_id} page={page_idx} max_passes={MAX_IMAGE_PASSES}")

                final_result = None
                success = False
                current_payload = payload  # will be updated per pass

                for pass_idx in range(MAX_IMAGE_PASSES):
                    logger.info(f"[OCR_RECOVERY_PASS] pass={pass_idx+1}/{MAX_IMAGE_PASSES} ({PASS_NAMES[pass_idx]}) record={record_id} page={page_idx}")

                    # Apply image transformation for Gemini
                    current_payload = await loop.run_in_executor(
                        self.executor,
                        lambda pi=pass_idx: self._apply_image_transformation(payload, pi)
                    )

                    # Run Gemini extraction (SOLE OCR ENGINE)
                    result = None
                    try:
                        result = await loop.run_in_executor(
                            self.executor,
                            lambda cp=current_payload: process_ai_request(cp)
                        )
                    except Exception as e:
                        logger.error(f"[GEMINI_REQUEST_ERROR] pass={pass_idx+1} record={record_id} page={page_idx} error={e}")
                        result = None

                    # Validate Gemini output
                    raw_reply = result.get('reply', '') if result else ''

                    if result and result.get('status') != 'OCR_FAILED' and raw_reply:
                        try:
                            repaired_text, _, _ = await loop.run_in_executor(
                                None,
                                lambda rr=raw_reply: _repair_json(rr, record_id=record_id, page=page_idx)
                            )
                            parsed = json.loads(repaired_text)
                            canonical_payload = get_canonical_export_record(parsed)

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
                                    break
                                else:
                                    logger.warning(f"[OCR_RECOVERY_FAILED] pass={pass_idx+1} record={record_id} page={page_idx} reason=low_density_or_missing_anchors density={density:.2f} char_count={char_count}")
                            else:
                                logger.warning(f"[OCR_RECOVERY_FAILED] pass={pass_idx+1} record={record_id} page={page_idx} reason=invalid_dto")
                        except Exception as e:
                            logger.warning(f"[OCR_RECOVERY_FAILED] pass={pass_idx+1} record={record_id} page={page_idx} reason=parse_error error={e}")
                    else:
                        logger.warning(f"[OCR_RECOVERY_FAILED] pass={pass_idx+1} record={record_id} page={page_idx} reason=ocr_failed_or_empty_reply")

                    # Save failed artifact for this pass (forensic)
                    await loop.run_in_executor(
                        None,
                        lambda cp=current_payload, pi=pass_idx: self._save_failed_artifact(cp, record_id, page_idx, pi + 1)
                    )

                if not success:
                    logger.error(f"[OCR_RETRY_CHAIN_EXHAUSTED] record={record_id} page={page_idx} all_passes_failed=True")
                    metrics.increment_counter("ocr:page_failed")
                    if final_result is None:
                        final_result = result  # may be None

                # Validation & persistence — ONCE, after retry chain completes
                final_task = {**task, 'payload': current_payload}
                await self._process_result(final_task, final_result)

        except Exception as e:
            tb = traceback.format_exc()
            logger.error(f"[AI_WORKER_UNHANDLED_EXCEPTION] record={record_id} page={page_idx} error={e}\ntraceback={tb}")
            logger.error(f"[DTO_LOST] Potential DTO loss for record={record_id} page={page_idx}")

            # Persist failure to DB so assembly barrier can proceed
            if record_id:
                try:
                    from ocr_pipeline.models import SessionFinalizationState, InvoicePageResult

                    def _fail_db():
                        InvoicePageResult.objects.update_or_create(
                            record_id=record_id,
                            page_number=page_idx,
                            defaults={
                                'session_id': session_id,
                                'canonical_payload': {'status': 'OCR_FAILED', 'error': f"UNHANDLED: {str(e)}"},
                                'is_failed': True,
                            }
                        )
                        SessionFinalizationState.objects.filter(id=str(record_id)).update(
                            failed_pages=models.F('failed_pages') + 1,
                            updated_at=timezone.now()
                        )

                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(self.executor, _fail_db)
                    logger.warning(f"[DB_BARRIER_INCREMENT] record={record_id} page={page_idx} status=FAILED (AI Worker Unhandled Exception)")
                except Exception as db_err:
                    logger.critical(f"[DB_BARRIER_FAIL] record={record_id} page={page_idx}: {db_err}")

            # Always forward failure notification to Assembly so barrier doesn't deadlock
            try:
                from .message_factory import message_factory
                from copy import deepcopy

                assembly_payload = {
                    "record_id": record_id,
                    "page_index": page_idx,
                    "item_id": payload.get('item_id') or task.get('item_id'),
                    "job_id": payload.get('job_id') or task.get('job_id'),
                    "result": {"_db_persisted": False, "is_failed": True, "error": str(e)}
                }
                assembly_msg = message_factory.create_message(
                    task_type="ASSEMBLY",
                    tenant_id=tenant_id,
                    session_id=session_id,
                    payload=assembly_payload,
                    correlation_id=correlation_id,
                    page_number=page_idx
                )
                queue_service.push(deepcopy(assembly_msg), queue_type='assembly')
                logger.info(f"[DOWNSTREAM_ENQUEUE_SUCCESS] target_queue=assembly msg_id={assembly_msg['id']} is_failed=True")
            except Exception as q_err:
                logger.error(f"[DOWNSTREAM_ENQUEUE_FAILED] target_queue=assembly error={q_err}")
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

        from ocr_pipeline.normalize import get_canonical_export_record
        from ocr_pipeline.extraction import _repair_json

        raw_reply = result.get('reply', '') if result else ''
        canonical_payload = {}
        is_failed = False

        if result and result.get('status') != 'OCR_FAILED' and raw_reply:
            try:
                loop = asyncio.get_running_loop()
                repaired_text, _, _ = await loop.run_in_executor(
                    None,
                    lambda: _repair_json(raw_reply, record_id=record_id, page=page_idx)
                )
                logger.info(f"[AI_PARSE_START] record={record_id} page={page_idx}")
                parsed = json.loads(repaired_text)
                canonical_payload = get_canonical_export_record(parsed)
                is_failed = not self._is_dto_valid(canonical_payload)
                if not is_failed:
                    logger.info(f"[AI_PAGE_SUCCESS] record={record_id} page={page_idx} correlation_id={correlation_id} worker_role=AI")
                else:
                    logger.error(f"[AI_PAGE_FAIL] record={record_id} page={page_idx} correlation_id={correlation_id} worker_role=AI reason=invalid_dto")
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
            with transaction.atomic():
                res_obj, created = InvoicePageResult.objects.update_or_create(
                    record_id=record_id,
                    page_number=page_idx,
                    defaults={
                        'canonical_payload': canonical_payload,
                        'is_failed': is_failed,
                        'session_id': task.get('upload_session_id', 'unknown')
                    }
                )
                if not res_obj.counted_in_barrier:
                    SessionFinalizationState.objects.filter(id=str(record_id)).update(
                        ai_completed_pages=models.F('ai_completed_pages') + 1,
                        failed_pages=models.F('failed_pages') + (1 if is_failed else 0)
                    )
                    res_obj.counted_in_barrier = True
                    res_obj.save(update_fields=['counted_in_barrier'])
            orchestrator.update_session_status(record_id, "PROCESSING", progress=0.0)
            from ocr_pipeline.pipeline import trigger_next_fanout
            trigger_next_fanout(record_id)

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(self.executor, _persist)

        await self._update_task_status(task, is_failed)

        # Push to Assembly — ALWAYS forward so assembly barrier can complete
        from .message_factory import message_factory
        from copy import deepcopy

        assembly_payload = {
            "record_id": record_id,
            "page_index": page_idx,
            "item_id": item_id,
            "job_id": job_id,
            "result": {"_db_persisted": True, "is_failed": is_failed}
        }
        assembly_msg = message_factory.create_message(
            task_type="ASSEMBLY",
            tenant_id=tenant_id,
            session_id=session_id,
            payload=assembly_payload,
            correlation_id=correlation_id,
            page_number=page_idx
        )
        assembly_msg_copy = deepcopy(assembly_msg)

        logger.info(f"[ASSEMBLY_MESSAGE_EMITTED] record={record_id} page={page_idx} correlation_id={correlation_id} worker_role=AI is_failed={is_failed}")
        try:
            queue_service.push(assembly_msg_copy, queue_type='assembly')
            logger.info(f"[DOWNSTREAM_ENQUEUE_SUCCESS] target_queue=assembly msg_id={assembly_msg_copy['id']}")
        except Exception as e:
            logger.error(f"[DOWNSTREAM_ENQUEUE_FAILED] target_queue=assembly error={e}")
            raise
        logger.info(f"[AI_WORKER_DONE] record={record_id} page={page_idx} -> ASSEMBLY_QUEUED")

    def _is_dto_valid(self, payload):
        record_id = payload.get('record_id') or "unknown"
        logger.info(f"[DTO_PRE_VALIDATION] record={record_id} keys={list(payload.keys())}")
        required = ['vendor_name', 'invoice_no', 'items']
        missing = [f for f in required if not payload.get(f)]
        if missing:
            logger.error(f"[DTO_VALIDATION_ERROR] record={record_id} missing_fields={missing} "
                         f"extracted_sample={json.dumps({k: payload.get(k) for k in payload.keys() if not k.startswith('_')}, default=str)[:500]}")
            has_identity = any(payload.get(k) for k in ['vendor_name', 'invoice_no', 'gstin'])
            has_items = len(payload.get('items', [])) > 0
            if not has_identity and not has_items:
                logger.critical(f"[DTO_TERMINAL_VOID] record={record_id} No identity and no items. Rejecting.")
                return False
            logger.warning(f"[DTO_PARTIAL_VALID] record={record_id} Preserving partial extraction despite missing {missing}")
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
