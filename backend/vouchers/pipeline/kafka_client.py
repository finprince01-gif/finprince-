"""
Kafka Client – Sync & Async Wrappers
======================================
Wraps aiokafka for clean producer/consumer APIs.

Topics used by the invoice pipeline:
  invoice.upload  → new job uploaded, needs segmentation
  invoice.ocr     → page extracted, ready for AI filter
  invoice.ai      → AI result ready, needs merge
  invoice.complete→ job fully processed
  invoice.retry   → failed items needing retry
  invoice.dlq     → dead-letter queue (max retries exhausted)
"""
import os
import json
import asyncio
import logging
from typing import Any, AsyncIterator, Callable, Awaitable

logger = logging.getLogger(__name__)

KAFKA_BOOTSTRAP = os.environ.get('KAFKA_BOOTSTRAP', 'localhost:9092')

TOPICS = {
    'upload':   'invoice.upload',
    'ocr':      'invoice.ocr',
    'ai':       'invoice.ai',
    'merge':    'invoice.merge',
    'complete': 'invoice.complete',
    'retry':    'invoice.retry',
    'dlq':      'invoice.dlq',
}


# ───────────────────────────────────────────────
# PRODUCER
# ───────────────────────────────────────────────
async def publish(topic_key: str, payload: dict, key: str | None = None):
    """
    Publish a JSON payload to a Kafka topic.

    Args:
        topic_key: One of TOPICS keys (e.g. 'upload', 'ocr', 'ai')
        payload:   Dict to serialize as JSON
        key:       Optional message key for partition affinity (e.g. tenant_id)
    """
    from aiokafka import AIOKafkaProducer

    topic = TOPICS.get(topic_key, topic_key)
    value = json.dumps(payload).encode()
    msg_key = key.encode() if key else None

    try:
        producer = AIOKafkaProducer(bootstrap_servers=KAFKA_BOOTSTRAP)
        await producer.start()
        await producer.send_and_wait(topic, value=value, key=msg_key)
        await producer.stop()
        logger.debug(f"[KAFKA] Published to {topic}: job_id={payload.get('job_id')}")
    except Exception as e:
        logger.error(f"[KAFKA] Publish failed to {topic}: {e}")
        raise


def publish_sync(topic_key: str, payload: dict, key: str | None = None):
    """Synchronous wrapper around publish() for Django views."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # In async context (e.g. ASGI) – schedule it
            asyncio.ensure_future(publish(topic_key, payload, key))
        else:
            loop.run_until_complete(publish(topic_key, payload, key))
    except RuntimeError:
        asyncio.run(publish(topic_key, payload, key))


# ───────────────────────────────────────────────
# CONSUMER
# ───────────────────────────────────────────────
async def consume(
    topic_key: str,
    group_id: str,
    handler: Callable[[dict], Awaitable[None]],
    auto_offset_reset: str = 'earliest',
):
    """
    Consume messages from a Kafka topic and call handler() for each.
    Runs forever until process is killed.

    Args:
        topic_key:  One of TOPICS keys
        group_id:   Consumer group (e.g. 'ocr-workers')
        handler:    Async function to process each message payload
    """
    from aiokafka import AIOKafkaConsumer

    topic = TOPICS.get(topic_key, topic_key)
    consumer = AIOKafkaConsumer(
        topic,
        bootstrap_servers=KAFKA_BOOTSTRAP,
        group_id=group_id,
        value_deserializer=lambda v: json.loads(v.decode()),
        auto_offset_reset=auto_offset_reset,
        enable_auto_commit=False,     # Manual commit for at-least-once delivery
        max_poll_records=10,          # Limit burst
    )

    await consumer.start()
    logger.info(f"[KAFKA] Consumer started: topic={topic}, group={group_id}")

    try:
        async for msg in consumer:
            payload = msg.value
            logger.debug(f"[KAFKA] Consumed from {topic}: {payload.get('job_id')}")
            try:
                await handler(payload)
                await consumer.commit()  # Commit only after success
            except Exception as e:
                logger.error(f"[KAFKA] Handler error in {topic}: {e}. Message NOT committed → will retry.")
    finally:
        await consumer.stop()


async def get_lag(topic_key: str, group_id: str) -> int:
    """
    Returns total consumer lag for a topic + group.
    Used for global backpressure check.
    """
    from aiokafka import AIOKafkaConsumer
    from aiokafka.admin import AIOKafkaAdminClient

    topic = TOPICS.get(topic_key, topic_key)
    try:
        consumer = AIOKafkaConsumer(
            topic,
            bootstrap_servers=KAFKA_BOOTSTRAP,
            group_id=f'{group_id}-lag-check',
        )
        await consumer.start()
        partitions = consumer.partitions_for_topic(topic) or set()
        from aiokafka import TopicPartition
        tps = [TopicPartition(topic, p) for p in partitions]
        end_offsets = await consumer.end_offsets(tps)
        committed = {tp: await consumer.committed(tp) or 0 for tp in tps}
        lag = sum(end_offsets[tp] - committed[tp] for tp in tps)
        await consumer.stop()
        return lag
    except Exception as e:
        logger.warning(f"[KAFKA] Lag check failed: {e}")
        return 0
