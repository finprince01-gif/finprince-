"""
Health Check API View
======================
GET /api/bulk-healthz/
  - No auth required (used by load balancers, ops dashboards)
  - Returns 200 if healthy, 503 if AI is unavailable
"""
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

logger = logging.getLogger(__name__)


class HealthCheckView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        from .health import SystemHealth
        h = SystemHealth.get()
        ready = h['healthy']
        message = 'ok' if ready else 'AI Model unavailable – check GEMINI_API_KEY'
        return Response({
            'status':  'healthy' if ready else 'degraded',
            'ai':      h['ai'],
            'message': message,
        }, status=200 if ready else 503)
