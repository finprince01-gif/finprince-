# LEGACY STAGING API - DEPRECATED
# All OCR staging logic has been moved to 'ocr_pipeline' module.
# Use CleanOCRStagingView and OCRStagingFinalizeView from 'ocr_pipeline.views' instead.

from rest_framework import views

class OCRStagingView(views.APIView):
    def dispatch(self, *args, **kwargs):
        raise Exception("OLD STAGING API SHOULD NOT BE USED. Use ocr_pipeline instead.")

class OCRStagingFinalizeView(views.APIView):
    def dispatch(self, *args, **kwargs):
        raise Exception("OLD STAGING FINALIZE API SHOULD NOT BE USED. Use ocr_pipeline instead.")
