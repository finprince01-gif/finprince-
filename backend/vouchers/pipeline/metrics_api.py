"""
Pipeline Metrics API
=====================
GET /api/bulk-metrics/
Returns basic in-process metrics.
Kafka lag and Redis metrics removed.
"""
import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

logger = logging.getLogger(__name__)


class PipelineMetricsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            from vouchers.pipeline.ai_gateway import _metrics
            return Response({
                'ai_gateway': _metrics.get_all(),
                'pipeline':   {},
                'kafka_lag':  {},   # Kafka removed
            })
        except Exception as e:
            logger.error(f"[METRICS] Error: {e}")
            return Response({'error': str(e)}, status=500)
