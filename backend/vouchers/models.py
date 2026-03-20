from django.db import models

class BulkInvoiceJob(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('success', 'Success'),
        ('failed', 'Failed'),
        ('partial', 'Partial Success'),
    ]
    tenant_id = models.CharField(max_length=100)
    file_hash = models.CharField(max_length=64, null=True)
    total_files = models.IntegerField(default=0)
    processed_count = models.IntegerField(default=0)
    failed_count = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    segmentation_done = models.BooleanField(default=False)
    timeout_rate = models.FloatField(default=0.0)
    success_rate = models.FloatField(default=0.0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'bulk_invoice_jobs'

class InvoiceProcessingItem(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('success', 'Success'),
        ('failed', 'Failed'),
        ('partial', 'Partial Success'),
        ('skipped', 'Skipped (blank)'),
    ]
    job = models.ForeignKey(BulkInvoiceJob, on_delete=models.CASCADE, related_name='items')
    file_path = models.CharField(max_length=500)
    file_hash = models.CharField(max_length=64, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    retry_count = models.IntegerField(default=0)
    parent_item_id = models.BigIntegerField(null=True)
    page_number = models.IntegerField(default=1)
    page_count = models.IntegerField(default=1)
    result_json = models.JSONField(null=True)
    error_message = models.TextField(null=True)
    processed_pages = models.IntegerField(default=0)  # Atomic counter for merge
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'invoice_processing_items'
