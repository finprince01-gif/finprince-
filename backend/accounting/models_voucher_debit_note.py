from django.db import models
from core.models import BaseModel

# ============================================================================
# DEBIT NOTE VOUCHER MODELS
# ============================================================================

class VoucherDebitNoteSupplierDetails(BaseModel):
    """
    Stores Supplier Details for Debit Note Voucher (Tab 1)
    """
    date = models.DateField()
    debit_note_series = models.CharField(max_length=100, null=True, blank=True)
    debit_note_no = models.CharField(max_length=100, null=True, blank=True)
    
    vendor_name = models.CharField(max_length=255)
    vendor_basic_detail = models.ForeignKey(
        'vendors.VendorMasterBasicDetail',
        on_delete=models.RESTRICT,
        db_column='vendor_basic_detail_id',
        related_name='debit_notes'
    )
    gstin = models.CharField(max_length=50, null=True, blank=True)
    branch = models.CharField(max_length=255, null=True, blank=True)
    
    # References to Purchase Invoices
    supplier_invoice_nos = models.TextField(null=True, blank=True, help_text="Comma-separated Supplier Invoice Numbers")
    purchase_voucher_nos = models.TextField(null=True, blank=True, help_text="Comma-separated Purchase Voucher Numbers")
    purchase_voucher_dates = models.TextField(null=True, blank=True, help_text="Comma-separated Purchase Voucher Dates")
    
    # Outward Slip Reference
    outward_slip_nos = models.TextField(null=True, blank=True, help_text="Comma-separated Outward Slip Numbers")
    
    # Address
    bill_to = models.TextField(null=True, blank=True)
    ship_to = models.TextField(null=True, blank=True)
    
    # Configuration
    nature_of_supply = models.CharField(max_length=50, default='Regular') 
    reverse_charge = models.CharField(max_length=10, default='No')
    place_of_supply = models.CharField(max_length=255, null=True, blank=True)
    
    # Currency
    invoice_in_foreign_currency = models.CharField(max_length=10, default='No')
    exchange_rate = models.DecimalField(max_digits=10, decimal_places=4, default=1.0)
    foreign_currency = models.CharField(max_length=10, default='USD')
    
    # Document
    supporting_document = models.FileField(upload_to='debit_note_documents/', null=True, blank=True)

    class Meta:
        db_table = 'voucher_debit_note_supplier_details'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.debit_note_no} - {self.vendor_name}"


class VoucherDebitNoteSupplyDetails(BaseModel):
    """
    Stores Supply Details for Debit Note Voucher (Tab 2)
    """
    debit_note_details = models.OneToOneField(
        VoucherDebitNoteSupplierDetails, 
        on_delete=models.CASCADE, 
        related_name='supply_details'
    )
    
    # Items
    # Structure: [{id, itemCode, itemName, hsnSac, qty, uom, itemRate, taxableValue, igst, cgst, sgst, cess, invoiceValue, reasonForReturn, ...}]
    items = models.JSONField(default=list)
    
    # Totals
    total_taxable_value = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_igst = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_cgst = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_sgst = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_cess = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_invoice_value = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    class Meta:
        db_table = 'voucher_debit_note_supply_details'


class VoucherDebitNoteDueDetails(BaseModel):
    """
    Stores Due/Payment Details for Debit Note Voucher (Tab 3)
    """
    debit_note_details = models.OneToOneField(
        VoucherDebitNoteSupplierDetails, 
        on_delete=models.CASCADE, 
        related_name='due_details'
    )
    
    reverse_tcs = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    reverse_tds = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tds_it = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    purchase_invoice_amount_applied = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    gross_amount_due = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    net_amount_due = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    terms_and_conditions = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'voucher_debit_note_due_details'


class VoucherDebitNoteTransitDetails(BaseModel):
    """
    Stores Transit/Dispatch Details for Debit Note Voucher (Tab 4)
    """
    debit_note_details = models.OneToOneField(
        VoucherDebitNoteSupplierDetails, 
        on_delete=models.CASCADE, 
        related_name='transit_details'
    )
    
    dispatch_from = models.CharField(max_length=255, null=True, blank=True)
    mode_of_transport = models.CharField(max_length=50, default='Road') # Road, Air, Sea, Rail
    dispatch_date = models.DateField(null=True, blank=True)
    dispatch_time = models.TimeField(null=True, blank=True)
    
    delivery_type = models.CharField(max_length=100, null=True, blank=True)
    transporter_id_gstin = models.CharField(max_length=100, null=True, blank=True)
    transporter_name = models.CharField(max_length=255, null=True, blank=True)
    vehicle_no = models.CharField(max_length=100, null=True, blank=True)
    lr_gr_consignment_no = models.CharField(max_length=100, null=True, blank=True)
    
    # Port / Shipping details (JSON for flexibility)
    shipping_details = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'voucher_debit_note_transit_details'
