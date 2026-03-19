from django.db import models

class BulkInvoiceJob(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
    ]
    tenant_id = models.CharField(max_length=36)
    total_files = models.IntegerField(default=0)
    processed_count = models.IntegerField(default=0)
    failed_count = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'bulk_invoice_jobs'

class InvoiceProcessingItem(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('done', 'Done'),
        ('failed', 'Failed'),
    ]
    job = models.ForeignKey(BulkInvoiceJob, on_delete=models.CASCADE, related_name='items')
    file_path = models.CharField(max_length=500)
    file_hash = models.CharField(max_length=64, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    result_json = models.JSONField(null=True)
    error_message = models.TextField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'invoice_processing_items'
