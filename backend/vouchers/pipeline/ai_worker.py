"""
AI Worker – Chaos-Hardened (invoice.ocr → invoice.ai)
=======================================================
Changes in this version:
  - Page-level idempotency: skips duplicate Kafka deliveries
  - Redis-down safe mode: AI disabled, always uses rule parser
  - AI usage target: <20% of pages (tightened heuristics)
  - Large job protection: rejects pages beyond MAX_PAGES_PER_JOB
"""
import os
import re
import sys
import asyncio
import logging
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from . import storage, kafka_client
from .ai_gateway import AIGateway
from .health import SystemHealth, is_page_already_processed, MAX_PAGES_PER_JOB

logger = logging.getLogger(__name__)

# Heuristics for "simple" invoices (no AI needed)
# Tightened vs v1 to push AI usage below 20%
_SIMPLE_PATTERNS = [
    re.compile(r'Total\s*[:₹]\s*\d+', re.I),
    re.compile(r'Invoice\s*No', re.I),
    re.compile(r'GSTIN\s*:', re.I),
    re.compile(r'Bill\s*(To|From)', re.I),
    re.compile(r'Amount\s*Due', re.I),
]
_SIMPLE_THRESHOLD = 2   # match ≥2 → SIMPLE (no AI)

gateway = AIGateway()


def classify_text(text: str, text_length: int) -> str:
    """
    SKIP     → blank/noise (0 AI cost)
    SIMPLE   → rule parser (0 AI cost, targets 70-80%)
    AI_REQUIRED → gateway (<20% target)
    """
    if text_length < 50:
        return 'SKIP'
    matches = sum(1 for p in _SIMPLE_PATTERNS if p.search(text))
    if matches >= _SIMPLE_THRESHOLD:
        return 'SIMPLE'
    return 'AI_REQUIRED'


async def handle_ocr_event(payload: dict):
    job_id      = payload['job_id']
    page_key    = payload['page_key']
    page_hash   = payload['page_hash']
    page_number = payload['page_number']
    page_count  = payload['page_count']
    text        = payload.get('text', '')
    filename    = payload.get('filename', 'doc.pdf') # Added filename extraction
    text_length = payload.get('text_length', len(text))
    tenant_id   = payload['tenant_id']
    item_id     = payload.get('item_id')

    print(f"🔥 [AI] Processing Job {job_id} | File: {filename}") # Added print statement
    logger.info(f"[AI] Processing Job {job_id} | File: {filename}") # Added logger statement

    # ── Guard 1: Large job protection ───────────────────────────────────────
    if page_number > MAX_PAGES_PER_JOB:
        logger.warning(f"[AI WORKER] Job {job_id} page {page_number} exceeds "
                       f"MAX_PAGES_PER_JOB={MAX_PAGES_PER_JOB}. Skipping.")
        await _emit_result(job_id, tenant_id, item_id, page_key, page_hash,
                           page_number, page_count, {}, skipped=True)
        return

    # ── Guard 2: Page-level idempotency (duplicate Kafka delivery) ────────
    if item_id and is_page_already_processed(job_id, item_id, page_number):
        logger.info(f"[AI WORKER] DUPLICATE SKIP – Job {job_id} page {page_number} "
                    "already processed (Kafka at-least-once delivery)")
        return

    # ── Guard 3: Safe mode check ─────────────────────────────────────────────
    # If Redis is down, AI rate limiting cannot function → AI disabled
    ai_enabled = SystemHealth.is_ai_enabled()
    if not ai_enabled:
        logger.warning(f"[AI WORKER] SAFE MODE – Redis down. "
                       f"AI disabled for Job {job_id} page {page_number}. Using rule parser.")

    logger.info(f"[AI WORKER] Job {job_id} page {page_number}/{page_count} "
                f"text_len={text_length} ai_enabled={ai_enabled}")

    decision = classify_text(text, text_length) if ai_enabled else 'SIMPLE'
    result = {}
    skipped = False

    try:
        if decision == 'SKIP':
            logger.info(f"[AI WORKER] SKIP – Job {job_id} page {page_number}")
            skipped = True

        elif decision == 'SIMPLE' or not ai_enabled:
            logger.info(f"[AI WORKER] RULE_PARSE – Job {job_id} page {page_number} "
                        f"(ai_enabled={ai_enabled})")
            file_bytes = storage.download_bytes(page_key)
            mime = _guess_mime(page_key)
            result = AIGateway._rule_parse(file_bytes, mime)

        else:
            logger.info(f"[AI WORKER] AI_CALL  – Job {job_id} page {page_number}")
            file_bytes = storage.download_bytes(page_key)
            mime = _guess_mime(page_key)
            try:
                # ── PRIMARY: AI EXTRACTION ──────────────────────────────────
                result = await gateway.extract(file_bytes, mime, page_hash, tenant_id)
            except Exception as ai_err:
                # ── FALLBACK: RULE-BASED PARSER (on 504/timeout) ────────────
                logger.warning(f"⚠️ [AI WORKER] AI Timeout/Error for Job {job_id} page {page_number}: {ai_err}. "
                               f"Falling back to Rule-Based Parser to unblock.")
                result = AIGateway._rule_parse(file_bytes, mime)
                decision = 'RULE_FALLBACK'

        await _emit_result(job_id, tenant_id, item_id, page_key, page_hash,
                           page_number, page_count, result, skipped=skipped, decision=decision)

    except Exception as e:
        logger.error(f"[AI WORKER] CRITICAL ERROR for Job {job_id} page {page_number}: {e}")
        # Only retry if it's NOT a timeout (which we handled above)
        if "504" not in str(e) and "timeout" not in str(e).lower():
            await kafka_client.publish('retry', {
                'stage': 'ai', 'error': str(e),
                'retry_count': payload.get('retry_count', 0) + 1,
                **payload,
            })
        else:
            # If for some reason the outer try caught a timeout, just emit fallback
            logger.warning(f"Outer fallback for Job {job_id} page {page_number}")
            await _emit_result(job_id, tenant_id, item_id, page_key, page_hash,
                               page_number, page_count, {}, skipped=True, decision='TOTAL_FAILURE')


async def _emit_result(job_id, tenant_id, item_id, page_key, page_hash,
                       page_number, page_count, result, skipped=False, decision='UNKNOWN'):
    await kafka_client.publish('ai', {
        'job_id':      job_id,
        'tenant_id':   tenant_id,
        'item_id':     item_id,
        'page_key':    page_key,
        'page_hash':   page_hash,
        'page_number': page_number,
        'page_count':  page_count,
        'result':      result,
        'skipped':     skipped,
        'decision':    decision,
    }, key=str(job_id))


def _guess_mime(page_key: str) -> str:
    return 'application/pdf' if page_key.lower().endswith('.pdf') else 'image/jpeg'


async def run():
    logger.info("[AI WORKER] invoice.ocr consumer starting (safe-mode capable)")
    await kafka_client.consume('ocr', 'ai-workers', handle_ocr_event)


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
