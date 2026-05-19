from django.urls import path
from .upload_simulator import LocalUploadSimulatorView

urlpatterns = [
    path('', LocalUploadSimulatorView.as_view(), name='local-upload-simulator'),
]
