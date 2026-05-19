from django.core.management.base import BaseCommand
from django.utils import timezone
from vouchers.models import BulkInvoiceJob, InvoiceProcessingItem, update_job_progress
from ocr_pipeline.models import InvoiceTempOCR, PipelineStatus
from core.constants import JobStatus, ItemStatus
import logging

logger = logging.getLogger("SessionReaper")

class Command(BaseCommand):
    help = 'Reaps stale processing sessions and marks them as FAILED if they have timed out.'

    def handle(self, *args, **options):
        # 1. Reaper for InvoiceProcessingItem
        # Stale if stuck in PROCESSING/QUEUED for > 1 hour
        stale_threshold = timezone.now() - timezone.timedelta(hours=1)
        
        stale_items = InvoiceProcessingItem.objects.filter(
            status__in=[ItemStatus.PROCESSING, ItemStatus.QUEUED],
            updated_at__lt=stale_threshold
        )
        
        count = stale_items.count()
        if count > 0:
            logger.warning(f"[REAPER] Found {count} stale processing items. Marking as FAILED.")
            for item in stale_items:
                item.status = ItemStatus.FAILED
                item.error_message = "TIMEOUT: Stale processing session reaped."
                item.save(update_fields=['status', 'error_message', 'updated_at'])
                update_job_progress(item.job_id)
        
        # 2. Reaper for InvoiceTempOCR
        stale_ocr = InvoiceTempOCR.objects.filter(
            status__in=[PipelineStatus.PROCESSING, PipelineStatus.EXTRACTING, PipelineStatus.ASSEMBLING, PipelineStatus.FINALIZING],
            created_at__lt=stale_threshold,
            processed=False
        )
        
        ocr_count = stale_ocr.count()
        if ocr_count > 0:
            logger.warning(f"[REAPER] Found {ocr_count} stale OCR records. Marking as FAILED.")
            stale_ocr.update(
                status=PipelineStatus.FAILED,
                validation_status='ERROR',
                validation_message='TIMEOUT: Stale OCR session reaped.'
            )

        # 3. Reaper for BulkInvoiceJob
        stale_jobs = BulkInvoiceJob.objects.filter(
            status__in=[JobStatus.PROCESSING, JobStatus.QUEUED],
            updated_at__lt=stale_threshold
        )
        
        job_count = stale_jobs.count()
        if job_count > 0:
            logger.warning(f"[REAPER] Found {job_count} stale jobs. Updating progress.")
            for job in stale_jobs:
                update_job_progress(job.id)

        self.stdout.write(self.style.SUCCESS(f"Reaped {count} items, {ocr_count} OCR records, and {job_count} jobs."))
