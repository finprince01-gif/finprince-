from django.urls import path
from .bulk_job_api import BulkUploadAPIView, BulkStatusAPIView, HealthCheckAPIView
from .pipeline.metrics_api import PipelineMetricsView
from .pipeline.health_api import HealthCheckView

urlpatterns = [
    path('bulk-upload/', BulkUploadAPIView.as_view(), name='bulk-invoice-upload'),
    path('bulk-status/<int:job_id>/', BulkStatusAPIView.as_view(), name='bulk-invoice-status'),
    path('bulk-metrics/', PipelineMetricsView.as_view(), name='pipeline-metrics'),
    path('bulk-healthz/', HealthCheckView.as_view(), name='pipeline-health'),
    path('health/', HealthCheckAPIView.as_view(), name='system-health'),
]
