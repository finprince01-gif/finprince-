from django.urls import path
from .bulk_job_api import BulkUploadAPIView, BulkStatusAPIView

urlpatterns = [
    path('bulk-upload/', BulkUploadAPIView.as_view(), name='bulk-invoice-upload'),
    path('bulk-status/<int:job_id>/', BulkStatusAPIView.as_view(), name='bulk-invoice-status'),
]
