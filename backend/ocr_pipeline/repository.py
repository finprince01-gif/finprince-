from django.db import models
from django.utils import timezone
import hashlib

from .models import InvoiceTempOCR

class StagingRepository:
    """Handles all DB interactions for the ocr_pipeline staging table."""
    def create_record(self, file_hash, file_name, voucher_type, tenant_id, upload_session_id=None):
        return InvoiceTempOCR.objects.create(
            file_hash=file_hash,
            file_path=file_name,
            voucher_type=voucher_type,
            tenant_id=str(tenant_id),
            upload_session_id=upload_session_id,
            status='QUEUED',
            created_at=timezone.now(),
            expires_at=timezone.now() + timezone.timedelta(days=7)
        )

    def find_by_hash_and_tenant(self, file_hash, tenant_id):
        return InvoiceTempOCR.objects.filter(file_hash=file_hash, tenant_id=str(tenant_id)).first()

    def update_status(self, record_id, status, error_code=None):
        update_fields = {'status': status}
        if error_code:
            update_fields['validation_message'] = error_code 
        InvoiceTempOCR.objects.filter(id=record_id).update(**update_fields)

    def save_results(self, record_id, normalized_json, status='EXTRACTED', vendor_id=None, validation_status=None):
        """Saves hierarchical extraction results back to the DB."""
        sections = normalized_json.get('sections', {})
        supplier = sections.get('supplier_details', {})
        
        InvoiceTempOCR.objects.filter(id=record_id).update(
            extracted_data=normalized_json, # Used as source of truth
            status=status,
            vendor_id=vendor_id,
            # Flatten some fields back to top-level for legacy UI logic
            supplier_invoice_no=supplier.get('supplier_invoice_no'),
            gstin=supplier.get('gstin'),
            branch=supplier.get('branch'),
            validation_status=validation_status,
            vendor_status='EXISTS' if validation_status in ['FOUND', 'READY', 'RESOLVED'] else 'NEW'
        )
