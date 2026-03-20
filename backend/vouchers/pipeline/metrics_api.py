"""
Pipeline Metrics API
=====================
Redis-backed metrics exposed via Django REST endpoint.
Aggregates metrics from all distributed pipeline services.

GET /api/bulk-metrics/
Returns:
  {
    "ai_gateway":  { cache_hits, ai_success, ai_failures, circuit_open_fallbacks, ... },
    "pipeline":    { retries, dlq_total, dlq_non_retryable, dlq_max_retries },
    "kafka_lag":   { upload, ocr, ai, merge, retry },
    "queue_sizes": { invoice_pages, invoice_files },
  }
"""
import os
import logging
import asyncio

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

logger = logging.getLogger(__name__)


class PipelineMetricsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            import redis as redis_lib
            r = redis_lib.from_url(os.environ.get('REDIS_URL', 'redis://localhost:6379/0'))

            ai_metrics  = r.hgetall('ai_gw:metrics') or {}
            pip_metrics = r.hgetall('pipeline:metrics') or {}

            # AI latency P95 from sorted list
            latencies = [float(x) for x in (r.lrange('ai_gw:latency', 0, -1) or [])]
            p95 = round(sorted(latencies)[int(len(latencies) * 0.95)], 1) if latencies else 0

            ai_metrics['ai_latency_p95_ms'] = p95
            ai_metrics['samples'] = len(latencies)

            # Kafka lag (best-effort, non-blocking)
            kafka_lag = _get_kafka_lag_sync()

            return Response({
                'ai_gateway':  {k: int(v) if str(v).isdigit() else v for k, v in ai_metrics.items()},
                'pipeline':    {k: int(v) for k, v in pip_metrics.items()},
                'kafka_lag':   kafka_lag,
            })

        except Exception as e:
            logger.error(f"[METRICS] Error: {e}")
            return Response({'error': str(e)}, status=500)


def _get_kafka_lag_sync() -> dict:
    """Non-blocking Kafka lag check. Returns empty dict on failure."""
    try:
        from kafka import KafkaAdminClient, KafkaConsumer
        from kafka.structs import TopicPartition
        bootstrap = os.environ.get('KAFKA_BOOTSTRAP', 'localhost:9092')
        
        groups = {
            'upload': 'ocr-workers',
            'ocr':    'ai-workers',
            'ai':     'merge-workers',
            'retry':  'retry-workers',
        }
        from vouchers.pipeline.kafka_client import TOPICS
        lag = {}
        
        consumer = KafkaConsumer(bootstrap_servers=bootstrap, group_id='metrics-probe')
        for label, group in groups.items():
            topic = TOPICS.get(label, label)
            try:
                partitions = consumer.partitions_for_topic(topic) or []
                tps = [TopicPartition(topic, p) for p in partitions]
                end = consumer.end_offsets(tps)
                committed = {tp: (consumer.committed(tp) or 0) for tp in tps}
                lag[label] = sum(end[tp] - committed[tp] for tp in tps)
            except Exception:
                lag[label] = -1
        consumer.close()
        return lag
    except Exception as e:
        logger.debug(f"[METRICS] Kafka lag unavailable: {e}")
        return {}
