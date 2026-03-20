"""
Health Check API View
======================
GET /api/bulk-healthz/
  - No auth required (used by load balancers, ops dashboards)
  - Returns 200 if healthy, 503 if any dependency is down

Response:
  {
    "status": "healthy" | "degraded",
    "redis":  true | false,
    "kafka":  true | false,
    "message": "ok" | "Redis unavailable – system cannot process jobs"
  }
"""
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

logger = logging.getLogger(__name__)


class HealthCheckView(APIView):
    permission_classes = [AllowAny]   # Load balancers need no auth
    authentication_classes = []

    def get(self, request):
        from .health import SystemHealth
        h = SystemHealth.get()

        ready, reason = (True, "ok") if h['healthy'] else (False, reason_from(h))

        status_code = 200 if ready else 503
        return Response({
            'status':  'healthy' if ready else 'degraded',
            'redis':   h['redis'],
            'kafka':   h['kafka'],
            'message': reason,
        }, status=status_code)


def reason_from(h: dict) -> str:
    if not h['redis']:
        return "Redis unavailable – system cannot process jobs"
    if not h['kafka']:
        return "Kafka unavailable – upload pipeline is offline"
    return "unknown"
