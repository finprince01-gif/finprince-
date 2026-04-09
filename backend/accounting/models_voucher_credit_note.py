from django.db import models
from core.models import BaseModel

# ============================================================================
# CREDIT NOTE VOUCHER MODELS
# ============================================================================

class VoucherCreditNoteInvoiceDetails(BaseModel):
    """
    Stores Invoice Details for Credit Note Voucher (Tab 1)
    """
    date = models.DateField()
    credit_note_series = models.CharField(max_length=100, null=True, blank=True)
    credit_note_no = models.CharField(max_length=100, null=True, blank=True)
    
    customer_name = models.CharField(max_length=255)
    customer_id = models.BigIntegerField(null=True, blank=True, help_text="Link to customer master")
    branch = models.CharField(max_length=255, null=True, blank=True)
    gstin = models.CharField(max_length=15, null=True, blank=True)
    
    # References to Sales Invoices
    sales_invoice_nos = models.TextField(null=True, blank=True, help_text="Comma-separated Sales Invoice Numbers")
    sales_invoice_dates = models.TextField(null=True, blank=True, help_text="Comma-separated Sales Invoice Dates")
    
    # Customer Debit Note Reference
    customer_debit_note_no = models.CharField(max_length=100, null=True, blank=True)
    customer_debit_note_date = models.DateField(null=True, blank=True)
    
    # GRN Reference
    grn_ref_no = models.CharField(max_length=100, null=True, blank=True)
    
    # Addresses
    bill_from = models.TextField(null=True, blank=True)
    ship_from = models.TextField(null=True, blank=True)
    
    # Configuration
    is_financial = models.CharField(max_length=10, default='No') # Yes/No
    in_foreign_currency = models.CharField(max_length=10, default='No') # Yes/No
    exchange_rate = models.DecimalField(max_digits=15, decimal_places=6, default=1.0)
    
    # Narration
    narration = models.TextField(null=True, blank=True)
    
    # Document
    supporting_document = models.FileField(upload_to='credit_note_documents/', null=True, blank=True)

    class Meta:
        db_table = 'voucher_credit_note_invoice_details'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.credit_note_no} - {self.customer_name}"


class VoucherCreditNoteItemDetails(BaseModel):
    """
    Stores Item & Tax Details for Credit Note Voucher (Tab 2)
    """
    credit_note_details = models.OneToOneField(
        VoucherCreditNoteInvoiceDetails, 
        on_delete=models.CASCADE, 
        related_name='item_details'
    )
    
    # Items
    # Structure: [{id, itemCode, itemName, hsnSac, qty, uom, rate, taxableValue, igst, cgst, sgst, cess, invoiceValue, salesLedger, ...}]
    items = models.JSONField(default=list)
    
    # Totals
    total_taxable_value = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_igst = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_cgst = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_sgst = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_cess = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_invoice_value = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    class Meta:
        db_table = 'voucher_credit_note_item_details'


class VoucherCreditNoteDueDetails(BaseModel):
    """
    Stores Due Details for Credit Note Voucher (Tab 3)
    """
    credit_note_details = models.OneToOneField(
        VoucherCreditNoteInvoiceDetails, 
        on_delete=models.CASCADE, 
        related_name='due_details'
    )
    
    credit_period = models.IntegerField(default=0)
    due_date = models.DateField(null=True, blank=True)
    
    # Tax amounts
    tds_it = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    gst_tds_tcs_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    income_tax_tds_tcs_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    # Financials
    advance_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    payable_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    # Notes
    posting_note = models.TextField(null=True, blank=True)
    terms_conditions = models.TextField(null=True, blank=True)
    
    # Reverse Tax Toggles (using strings 'Yes'/'No' for consistency with other voucher parts)
    reverse_gst_tcs = models.CharField(max_length=10, default='No')
    reverse_gst_tds = models.CharField(max_length=10, default='No')
    reverse_income_tax_tcs = models.CharField(max_length=10, default='No')
    reverse_income_tax_tds = models.CharField(max_length=10, default='No')
    
    # Bill Allocation
    applied_invoices = models.JSONField(default=list, help_text="Mapping of sales invoice numbers and applied amounts")

    class Meta:
        db_table = 'voucher_credit_note_due_details'


class VoucherCreditNoteTransitDetails(BaseModel):
    """
    Stores Transit Details for Credit Note Voucher (Tab 4)
    """
    credit_note_details = models.OneToOneField(
        VoucherCreditNoteInvoiceDetails, 
        on_delete=models.CASCADE, 
        related_name='transit_details'
    )
    
    received_in = models.CharField(max_length=255, null=True, blank=True)
    mode_of_transport = models.CharField(max_length=50, default='Road')
    receipt_date = models.DateField(null=True, blank=True)
    receipt_time = models.TimeField(null=True, blank=True)
    
    delivery_type = models.CharField(max_length=100, null=True, blank=True)
    transporter_id_gstin = models.CharField(max_length=20, null=True, blank=True)
    transporter_name = models.CharField(max_length=255, null=True, blank=True)
    vehicle_no = models.CharField(max_length=50, null=True, blank=True)
    lr_gr_consignment_no = models.CharField(max_length=100, null=True, blank=True)
    
    # Port / Shipping details
    shipping_details = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'voucher_credit_note_transit_details'
