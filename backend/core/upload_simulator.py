from rest_framework.views import APIView
from rest_framework.response import Response
from django.conf import settings
import os
import shutil

class LocalUploadSimulatorView(APIView):
    """
    PHASE 2 HARDENING: Local S3 Simulator.
    Allows testing direct upload flows without AWS credentials.
    """
    authentication_classes = [] # Allow unauthenticated POST from "browser"
    permission_classes = []

    def post(self, request):
        key = request.data.get('key')
        file_obj = request.FILES.get('file')
        
        if not key or not file_obj:
            # Check body for raw data if not multipart
            key = request.POST.get('key')
            file_obj = request.FILES.get('file')

        if not key:
            return Response({"error": "Key is required"}, status=400)
            
        local_root = getattr(settings, 'OCR_STORAGE_ROOT', os.path.join(settings.MEDIA_ROOT, 'ocr_storage'))
        dest_path = os.path.join(local_root, key.replace('/', os.sep))
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        
        with open(dest_path, 'wb') as f:
            for chunk in file_obj.chunks():
                f.write(chunk)
                
        return Response({"success": True, "path": dest_path})
