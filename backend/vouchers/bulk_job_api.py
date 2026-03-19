import os
import uuid
import hashlib
import json
import logging
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from .models import BulkInvoiceJob, InvoiceProcessingItem
from .worker import start_bulk_job_thread

logger = logging.getLogger(__name__)

class BulkUploadAPIView(APIView):
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request, *args, **kwargs):
        files = request.FILES.getlist('files')
        if not files:
            return Response({'error': 'No files uploaded'}, status=400)

        if len(files) > 300: # Explicit limit as per request goal
            return Response({'error': 'Too many files. Max 300 allowed.'}, status=400)

        tenant_id = getattr(request.user, 'tenant_id', 'default_tenant')

        # 0. Check for existing active job for this tenant
        existing_job = BulkInvoiceJob.objects.filter(
            tenant_id=tenant_id, 
            status__in=['pending', 'processing']
        ).first()
        if existing_job:
            return Response({
                'status': 'existing_job_found',
                'job_id': existing_job.id,
                'message': 'An active bulk job is already running for this tenant.',
                'total_files': existing_job.total_files
            })

        # 1. Create Job Entry
        job = BulkInvoiceJob.objects.create(
            tenant_id=tenant_id,
            total_files=len(files),
            status='pending'
        )

        job_dir = os.path.join('bulk_uploads', str(job.id))
        if not os.path.exists(os.path.join(settings.MEDIA_ROOT, job_dir)):
             os.makedirs(os.path.join(settings.MEDIA_ROOT, job_dir))

        # 2. Create individual items (Supports multi-invoice PDF)
        for uploaded_file in files:
            file_bytes = uploaded_file.read()
            uploaded_file.seek(0)
            
            # Detect PDF and potentially split
            is_pdf = uploaded_file.name.lower().endswith('.pdf')
            split_items = []
            
            if is_pdf:
                try:
                    from core.pdf_splitter import split_pdf_into_invoice_files
                    split_results = split_pdf_into_invoice_files(
                        pdf_bytes=file_bytes,
                        original_filename=uploaded_file.name
                    )
                    
                    if len(split_results) > 1:
                        for inv_number, tmp_path, group in split_results:
                            with open(tmp_path, 'rb') as f:
                                split_bytes = f.read()
                            
                            s_hash = hashlib.sha256(split_bytes).hexdigest()
                            s_unique = f"{uuid.uuid4().hex}.pdf"
                            s_path = os.path.join(settings.MEDIA_ROOT, job_dir, s_unique)
                            
                            with open(s_path, 'wb+') as dest:
                                dest.write(split_bytes)
                                
                            split_items.append({
                                'path': s_path,
                                'hash': s_hash,
                            })
                            # cleanup tmp file
                            from core.pdf_splitter import cleanup_temp_pdf
                            cleanup_temp_pdf(tmp_path)
                    else:
                         pass # split failed or only 1 invoice
                except Exception as e:
                    logger.warning(f"PDF split failed for {uploaded_file.name}: {e}")

            if not split_items:
                # Regular file or single-invoice PDF
                file_hash = hashlib.sha256(file_bytes).hexdigest()
                file_ext = os.path.splitext(uploaded_file.name)[1].lower()
                unique_filename = f"{uuid.uuid4().hex}{file_ext}"
                file_path = os.path.join(settings.MEDIA_ROOT, job_dir, unique_filename)
                
                with open(file_path, 'wb+') as destination:
                    destination.write(file_bytes)
                    
                split_items.append({
                    'path': file_path,
                    'hash': file_hash,
                })

            for si in split_items:
                InvoiceProcessingItem.objects.create(
                    job=job,
                    file_path=si['path'],
                    file_hash=si['hash'],
                    status='pending'
                )

        # Update total count in case of splits
        total_count = job.items.count()
        if total_count != job.total_files:
            job.total_files = total_count
            job.save()

        # 3. Start background job
        start_bulk_job_thread(job.id)

        return Response({
            'status': 'processing_started',
            'job_id': job.id,
            'total_files': len(files)
        })

class BulkStatusAPIView(APIView):
    def get(self, request, job_id, *args, **kwargs):
        try:
            job = BulkInvoiceJob.objects.get(id=job_id)
            
            # Calculate accurately
            pending = job.items.filter(status='pending').count()
            processing = job.items.filter(status='processing').count()
            done = job.items.filter(status='done').count()
            failed = job.items.filter(status='failed').count()

            current_status = job.status
            # Auto-complete if finished
            if done + failed >= job.total_files and current_status not in ['completed', 'failed']:
                job.status = 'completed'
                job.save()
                current_status = 'completed'

            return Response({
                'id': job.id,
                'total': job.total_files,
                'processed': done,
                'failed': failed,
                'pending': pending + processing,
                'status': current_status,
                'created_at': job.created_at
            })
        except BulkInvoiceJob.DoesNotExist:
            return Response({'error': 'Job not found'}, status=404)
        except Exception as e:
            return Response({'error': str(e)}, status=500)
