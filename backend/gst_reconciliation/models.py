from django.db import models
from core.models import BaseModel
import uuid

class GSTR2BInvoice(BaseModel):
    """
    Invoices ingested from government GSTR-2B JSON files.
    """
    upload_batch_id = models.UUIDField(default=uuid.uuid4, editable=False)
    gstin = models.CharField(max_length=15)
    vendor_name = models.CharField(max_length=255, null=True, blank=True)
    invoice_no = models.CharField(max_length=100)
    invoice_date = models.DateField()
    invoice_value = models.DecimalField(max_digits=18, decimal_places=2)
    taxable_value = models.DecimalField(max_digits=18, decimal_places=2)
    igst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    cgst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    sgst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    cess = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    # Duplicate detection
    fingerprint = models.CharField(max_length=64, unique=True, help_text="Hash of GSTIN + Invoice No + Date + Value")
    
    raw_data = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = 'gst_reconciliation_gstr2b_invoices'

class ReconciliationResult(BaseModel):
    """
    Comparison between GSTR-2B and Purchase Books.
    Fully decoupled via ID reference.
    """
    STATUS_CHOICES = [
        ('EXACT', 'Exact Match'),
        ('PARTIAL', 'Partial Match'),
        ('MISMATCH', 'Mismatch'),
        ('MISSING_2B', 'Missing in GSTR-2B'),
        ('MISSING_BOOKS', 'Missing in Books'),
    ]

    invoice_2b = models.ForeignKey(GSTR2BInvoice, on_delete=models.CASCADE, null=True, blank=True)
    # Linked to VoucherPurchaseSupplierDetails in 'accounting' app via ID
    purchase_voucher_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    
    matching_score = models.IntegerField(default=0) # 0-100
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    matching_details = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = 'gst_reconciliation_results'

class ITCSummary(BaseModel):
    """
    Input Tax Credit computation results for a specific period.
    """
    period_month = models.CharField(max_length=20) # e.g. "January"
    period_year = models.CharField(max_length=10)  # e.g. "2024-25"
    
    total_itc_igst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_itc_cgst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_itc_sgst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    eligible_itc_igst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    eligible_itc_cgst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    eligible_itc_sgst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    blocked_itc_igst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    matching_criteria_used = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = 'gst_reconciliation_itc_summaries'

class GSTR3BReport(BaseModel):
    """
    Simulated GSTR-3B report by combining GSTR-1 (Output) and ITC computation.
    """
    period_month = models.CharField(max_length=20)
    period_year = models.CharField(max_length=10)
    
    # Liability from GSTR-1
    output_tax_igst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    output_tax_cgst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    output_tax_sgst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    # ITC from ITC Summary
    input_tax_igst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    input_tax_cgst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    input_tax_sgst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    # Net Payable
    net_igst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    net_cgst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    net_sgst = models.DecimalField(max_digits=18, decimal_places=2, default=0)

    class Meta:
        db_table = 'gst_reconciliation_gstr3b_reports'

class AuditLog(BaseModel):
    """
    Audit trail for reconciliation activities.
    """
    action = models.CharField(max_length=255)
    details = models.JSONField(null=True, blank=True)
    executed_by = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = 'gst_reconciliation_audit_logs'

class ValidationResult(BaseModel):
    """
    Module 5: Validation Layer Results.
    Stores warnings for duplicates, invalid data, or mismatches.
    """
    SEVERITY_CHOICES = [('WARNING', 'Warning'), ('INFO', 'Info')]
    
    period_month = models.CharField(max_length=20)
    period_year = models.CharField(max_length=10)
    check_type = models.CharField(max_length=100) # e.g. "DUPLICATE_CHECK", "GSTIN_VALIDATION"
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES, default='WARNING')
    message = models.TextField()
    context_data = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = 'gst_reconciliation_validation_results'

class GSTJobStatus(BaseModel):
    """
    Phase D: Job Flow Control.
    Tracks background tasks like Reconciliation or 3B Computation.
    """
    JOB_TYPES = [('RECO', 'Reconciliation'), ('ITC', 'ITC Computation'), ('3B', 'GSTR-3B Generation')]
    STATUS_CHOICES = [('PENDING', 'Pending'), ('RUNNING', 'Running'), ('COMPLETED', 'Completed'), ('FAILED', 'Failed')]
    
    job_type = models.CharField(max_length=10, choices=JOB_TYPES)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDING')
    progress = models.IntegerField(default=0)
    result_summary = models.JSONField(null=True, blank=True)
    error_log = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'gst_reconciliation_job_status'
