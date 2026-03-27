from django.db import models
from django.utils import timezone
import hashlib

class InvoiceTempOCR(models.Model):
    """
    Unified staging table for OCR extraction results.
    Matches the existing 'invoice_ocr_temp' schema.
    """
    id = models.BigAutoField(primary_key=True)
    file_hash = models.CharField(max_length=64)
    tenant_id = models.CharField(max_length=255)
    file_path = models.CharField(max_length=512)
    upload_session_id = models.CharField(max_length=255, null=True, blank=True)
    voucher_type = models.CharField(max_length=50, null=True, blank=True)
    
    ocr_raw_text = models.TextField(null=True, blank=True)
    extracted_data = models.JSONField(null=True, blank=True) # Source of truth for UI modal
    
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, null=True, blank=True)
    processed = models.BooleanField(default=False)
    
    validation_status = models.CharField(max_length=50, null=True, blank=True)
    vendor_status = models.CharField(max_length=50, null=True, blank=True)
    matched_by = models.CharField(max_length=100, null=True, blank=True)
    conflict_message = models.TextField(null=True, blank=True)
    
    vendor_id = models.BigIntegerField(null=True, blank=True)
    voucher_id = models.BigIntegerField(null=True, blank=True)
    
    # Mirror fields
    supplier_invoice_no = models.CharField(max_length=100, null=True, blank=True)
    gstin = models.CharField(max_length=50, null=True, blank=True)
    branch = models.CharField(max_length=255, null=True, blank=True)
    validation_message = models.TextField(null=True, blank=True)
    
    # Extra fields from schema
    group_id = models.CharField(max_length=64, null=True, blank=True)
    financial_year = models.CharField(max_length=20, null=True, blank=True)
    selected_by = models.CharField(max_length=50, null=True, blank=True)
    duplicate_count = models.IntegerField(null=True, blank=True)
    version_rank = models.IntegerField(null=True, blank=True)
    is_primary = models.IntegerField(null=True, blank=True)

    class Meta:
        managed = False # Tables are created by external migrations or preexisting
        db_table = 'invoice_ocr_temp'

    def __str__(self):
        return f"{self.id} - {self.file_path} ({self.status})"

class StagingRepository:
    """Handles all DB interactions for the ocr_pipeline staging table."""
    def create_record(self, file_hash, file_name, voucher_type, tenant_id, upload_session_id=None):
        return InvoiceTempOCR.objects.create(
            file_hash=file_hash,
            file_path=file_name,
            voucher_type=voucher_type,
            tenant_id=str(tenant_id),
            upload_session_id=upload_session_id,
            status='UPLOADED',
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
