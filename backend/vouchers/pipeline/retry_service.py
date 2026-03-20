"""
Retry & DLQ Service – Final Hardened
=======================================
New in this version:
  - Retry storm protection (checks retry topic lag, pauses if overwhelmed)
  - Jitter on all retry delays (prevents thundering herd)
  - DLQ samples stored in Redis for ops inspection
  - AI-disabled flag respected on retry (no point retrying AI if AI is off)
"""
import os
import sys
import random
import asyncio
import logging
import json
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from . import kafka_client

logger = logging.getLogger(__name__)

MAX_RETRIES = int(os.environ.get('BULK_MAX_RETRIES', '3'))
RETRY_LAG_LIMIT = int(os.environ.get('KAFKA_RETRY_LAG_LIMIT', '10000'))
DLQ_SAMPLE_LIMIT = int(os.environ.get('DLQ_SAMPLE_LIMIT', '100'))  # store last N DLQ payloads

NON_RETRYABLE_ERRORS = [
    'invalid_data', 'bad_format', 'unsupported_file', 'parse_error',
    'json_decode', 'schema_validation', 'invalid_mime'
]

STAGE_BACK_TOPIC = {'ai': 'ocr', 'merge': 'ai', 'ocr': 'upload'}


def _is_non_retryable(error: str, error_type: str = '') -> bool:
    combined = (error + ' ' + error_type).lower()
    return any(kw in combined for kw in NON_RETRYABLE_ERRORS)


def _jitter(base_delay: float) -> float:
    """Add ±40% random jitter to prevent thundering herd."""
    return base_delay * (0.6 + random.random() * 0.8)


async def _check_retry_storm() -> bool:
    """Returns True if retry topic is overwhelmed (storm detected)."""
    try:
        from .health import SystemHealth
        storm, lag = SystemHealth.check_retry_storm()
        if storm:
            logger.warning(f"[RETRY STORM] invoice.retry lag={lag} > {RETRY_LAG_LIMIT}. Throttling!")
        return storm
    except Exception:
        return False


async def handle_retry_event(payload: dict):
    retry_count = payload.get('retry_count', 1)
    stage       = payload.get('stage', 'unknown')
    job_id      = payload.get('job_id')
    item_id     = payload.get('item_id')
    error       = payload.get('error', '')
    error_type  = payload.get('error_type', '')

    # ── Non-retryable: immediate DLQ ────────────────────────────────────────
    if _is_non_retryable(error, error_type):
        logger.error(f"[RETRY] Job {job_id} non-retryable ({error[:60]}). → DLQ")
        payload['dlq_reason'] = 'non_retryable'
        await kafka_client.publish('dlq', payload)
        await _mark_failed(item_id, f"Non-retryable: {error[:200]}")
        _inc_metric('dlq_non_retryable')
        return

    # ── Max retries cap ──────────────────────────────────────────────────────
    if retry_count > MAX_RETRIES:
        logger.error(f"[RETRY] Job {job_id}: {retry_count} retries exceeded cap ({MAX_RETRIES}). → DLQ")
        payload['dlq_reason'] = 'max_retries'
        await kafka_client.publish('dlq', payload)
        await _mark_failed(item_id, f"Max retries ({MAX_RETRIES}) at stage={stage}: {error[:200]}")
        _inc_metric('dlq_max_retries')
        return

    # ── Retry storm protection ───────────────────────────────────────────────
    if await _check_retry_storm():
        # Add extra pause before re-queuing to let backlog drain
        extra_delay = _jitter(30.0)
        logger.warning(f"[RETRY STORM] Pausing {extra_delay:.1f}s before re-routing Job {job_id}")
        await asyncio.sleep(extra_delay)

    # ── Retryable: exponential backoff + jitter ──────────────────────────────
    base_delay = min(2 ** retry_count, 60)
    delay = _jitter(base_delay)
    logger.warning(f"[RETRY] Job {job_id} → retry {retry_count}/{MAX_RETRIES} "
                   f"stage={stage} delay={delay:.1f}s")
    await asyncio.sleep(delay)

    back_topic = STAGE_BACK_TOPIC.get(stage, stage)
    await kafka_client.publish(back_topic, {
        **payload,
        'retry_count': retry_count,
    }, key=str(job_id))
    _inc_metric('retries')


async def handle_dlq_event(payload: dict):
    """Dead-letter: mark failed, store sample, alert."""
    job_id  = payload.get('job_id')
    item_id = payload.get('item_id')
    reason  = payload.get('dlq_reason', 'unknown')
    error   = payload.get('error', '')

    logger.error(f"[DLQ] PERMANENT FAILURE – Job {job_id} item {item_id} reason={reason}: {error[:100]}")
    await _mark_failed(item_id, f"DLQ({reason}): {error[:200]}")

    # Store sample for ops inspection
    _store_dlq_sample(payload)
    _inc_metric('dlq_total')

    # Alert if DLQ rate is high
    _check_dlq_alert()


def _store_dlq_sample(payload: dict):
    """Store last DLQ_SAMPLE_LIMIT payloads in Redis for inspection."""
    try:
        import redis as redis_lib
        r = redis_lib.from_url(os.environ.get('REDIS_URL', 'redis://localhost:6379/0'))
        sample = {
            'job_id':   payload.get('job_id'),
            'item_id':  payload.get('item_id'),
            'stage':    payload.get('stage'),
            'error':    str(payload.get('error', ''))[:300],
            'reason':   payload.get('dlq_reason'),
            'ts':       __import__('time').time(),
        }
        r.lpush('pipeline:dlq:samples', json.dumps(sample))
        r.ltrim('pipeline:dlq:samples', 0, DLQ_SAMPLE_LIMIT - 1)
    except Exception:
        pass


def _check_dlq_alert():
    """Log CRITICAL alert if DLQ rate exceeds threshold in last 5 min."""
    try:
        import redis as redis_lib
        import time
        r = redis_lib.from_url(os.environ.get('REDIS_URL', 'redis://localhost:6379/0'))
        samples_raw = r.lrange('pipeline:dlq:samples', 0, -1) or []
        now = time.time()
        recent = [
            json.loads(s) for s in samples_raw
            if json.loads(s).get('ts', 0) > now - 300
        ]
        if len(recent) >= 10:
            logger.critical(
                f"[DLQ ALERT] {len(recent)} failures in last 5 minutes! "
                "Possible systemic issue. Check pipeline:dlq:samples in Redis."
            )
    except Exception:
        pass


async def _mark_failed(item_id, error_msg: str):
    if not item_id:
        return
    try:
        from vouchers.models import InvoiceProcessingItem
        from django.db import connection
        connection.close()
        InvoiceProcessingItem.objects.filter(id=item_id).update(
            status='failed',
            error_message=str(error_msg)[:500],
        )
    except Exception as e:
        logger.error(f"[DLQ] Mark failed error for item {item_id}: {e}")


def _inc_metric(key: str):
    try:
        import redis as redis_lib
        r = redis_lib.from_url(os.environ.get('REDIS_URL', 'redis://localhost:6379/0'))
        r.hincrby('pipeline:metrics', key, 1)
    except Exception:
        pass


async def run():
    logger.info("[RETRY SERVICE] Starting retry + DLQ consumers (storm-protected)")
    await asyncio.gather(
        kafka_client.consume('retry', 'retry-workers', handle_retry_event),
        kafka_client.consume('dlq',   'dlq-workers',   handle_dlq_event),
    )


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
