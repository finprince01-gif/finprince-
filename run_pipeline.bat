
@echo off
cd backend
start "OCR Service" python -m vouchers.pipeline.ocr_service
start "AI Worker" python -m vouchers.pipeline.ai_worker
start "Merge Service" python -m vouchers.pipeline.merge_service
start "Retry Service" python -m vouchers.pipeline.retry_service
echo Pipeline services started in separate windows.
