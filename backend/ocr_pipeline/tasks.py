from celery import shared_task
from .service import process_invoice_upload
from .models import OCRJob, OCRTask
from django.db import transaction
import logging
import os

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3)
def process_invoice_task(self, task_id, file_path, voucher_type, tenant_id, upload_session_id):
    """
    Background task to process a single invoice file.
    """
    try:
        task = OCRTask.objects.select_related('job').get(id=task_id)
        task.status = 'PROCESSING'
        task.save()
        
        job = task.job
        if job.status == 'PENDING':
            job.status = 'PROCESSING'
            job.save()
            
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Source file not found at {file_path}")
            
        with open(file_path, 'rb') as f:
            file_bytes = f.read()
            
        # Call the existing processing logic
        # Note: This already handles segmentation internally if it's a multi-invoice PDF
        result = process_invoice_upload(
            file_bytes=file_bytes,
            voucher_type=voucher_type,
            file_name=task.file_name,
            upload_session_id=upload_session_id,
            tenant_id=tenant_id
        )
        
        task.status = 'COMPLETED'
        # result can be a single dict or a batch dict
        if isinstance(result, dict):
            if 'id' in result:
                task.result_id = result['id']
            elif 'results' in result and result['results']:
                # For batched results (segmentation), link to the first one as primary
                task.result_id = result['results'][0].get('id')
        
        task.save()
        
        # Update job progress atomically
        with transaction.atomic():
            job.refresh_from_db()
            job.processed_files += 1
            if job.processed_files + job.failed_files >= job.total_files:
                job.status = 'COMPLETED'
            job.save()
            
    except Exception as exc:
        logger.error(f"OCR Task {task_id} failed: {str(exc)}")
        
        # Handle retries for specific errors (e.g. AI rate limits, network)
        # For now, retry all exceptions up to 3 times
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=5 * (self.request.retries + 1))
            
        try:
            task = OCRTask.objects.get(id=task_id)
            task.status = 'FAILED'
            task.error_message = str(exc)
            task.save()
            
            job = task.job
            with transaction.atomic():
                job.refresh_from_db()
                job.failed_files += 1
                if job.processed_files + job.failed_files >= job.total_files:
                    job.status = 'COMPLETED'
                job.save()
        except Exception as e:
            logger.error(f"Failed to update task/job status after failure: {str(e)}")
            
        return {"status": "FAILED", "error": str(exc)}

    return {"status": "SUCCESS"}
