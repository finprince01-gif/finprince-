from django.db import models
from core.models import BaseModel

# ============================================================================
# PURCHASE VOUCHER MODELS
# ============================================================================

class VoucherPurchaseSupplierDetails(BaseModel):
    """
    Stores Supplier Details for Purchase Voucher (Tab 1)
    """
    date = models.DateField()
    supplier_invoice_no = models.CharField(max_length=100)
    purchase_voucher_no = models.CharField(max_length=100, null=True, blank=True)
    vendor_name = models.CharField(max_length=255)
    vendor_basic_detail = models.ForeignKey(
        'vendors.VendorMasterBasicDetail',
        on_delete=models.RESTRICT,
        db_column='vendor_basic_detail_id',
        related_name='purchase_vouchers'
    )
    gstin = models.CharField(max_length=50, null=True, blank=True)
    
    # GRN
    grn_reference = models.CharField(max_length=100, null=True, blank=True)
    
    # Address
    bill_from = models.TextField(null=True, blank=True)
    ship_from = models.TextField(null=True, blank=True)
    
    # Configuration
    input_type = models.CharField(max_length=50, default='Intrastate') # Intrastate, Interstate, Import
    invoice_in_foreign_currency = models.CharField(max_length=10, default='No') # Yes, No
    
    # Document
    supporting_document = models.FileField(upload_to='purchase_documents/', null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'voucher_purchase_supplier_details'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.purchase_voucher_no} - {self.vendor_name}"


class VoucherPurchaseSupplyForeignDetails(BaseModel):
    """
    Stores Supply Details for Purchase Voucher (Foreign Currency Tab)
    """
    supplier_details = models.OneToOneField(
        VoucherPurchaseSupplierDetails, 
        on_delete=models.CASCADE, 
        related_name='supply_foreign_details'
    )
    
    purchase_order_no = models.CharField(max_length=100, null=True, blank=True)
    purchase_ledger = models.CharField(max_length=255, null=True, blank=True)
    exchange_rate = models.DecimalField(max_digits=10, decimal_places=4, default=1.0)
    description = models.TextField(null=True, blank=True) # Maybe unused but good to have
    
    # Items for Foreign Supply
    # Structure: [{description, qty, uom, rate, amount}]
    items = models.JSONField(default=list)

    class Meta:
        managed = False
        db_table = 'voucher_purchase_supply_foreign_details'


class VoucherPurchaseSupplyINRDetails(BaseModel):
    """
    Stores Supply Details for Purchase Voucher (INR Tab)
    """
    supplier_details = models.OneToOneField(
        VoucherPurchaseSupplierDetails, 
        on_delete=models.CASCADE, 
        related_name='supply_inr_details'
    )
    
    purchase_order_no = models.CharField(max_length=100, null=True, blank=True)
    purchase_ledger = models.CharField(max_length=255, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    
    # Items for INR Supply
    # Structure: [{itemCode, itemName, hsnSac, qty, uom, rate, taxableValue, igst, cgst, sgst, cess, invoiceValue}]
    items = models.JSONField(default=list)

    class Meta:
        managed = False
        db_table = 'voucher_purchase_supply_inr_details'


class VoucherPurchaseDueDetails(BaseModel):
    """
    Stores Due Details for Purchase Voucher (Tab 3)
    """
    supplier_details = models.OneToOneField(
        VoucherPurchaseSupplierDetails, 
        on_delete=models.CASCADE, 
        related_name='due_details'
    )
    
    tds_gst = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tds_it = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    advance_paid = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    to_pay = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    posting_note = models.TextField(null=True, blank=True)
    terms = models.CharField(max_length=255, null=True, blank=True)
    
    # Advance References
    # Structure: [{date, refNo, amount, appliedNow}]
    advance_references = models.JSONField(default=list, null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'voucher_purchase_due_details'


class VoucherPurchaseTransitDetails(BaseModel):
    """
    Stores Transit Details for Purchase Voucher (Tab 4)
    """
    supplier_details = models.OneToOneField(
        VoucherPurchaseSupplierDetails, 
        on_delete=models.CASCADE, 
        related_name='transit_details'
    )
    
    mode = models.CharField(max_length=50, default='Road') # Road, Air, Sea, Rail
    
    # Basic / Road
    received_in = models.CharField(max_length=255, null=True, blank=True) # Dispatch From / Received In
    receipt_date = models.DateField(null=True, blank=True)
    receipt_time = models.TimeField(null=True, blank=True)
    
    delivery_type = models.CharField(max_length=100, null=True, blank=True)
    self_third_party = models.CharField(max_length=100, null=True, blank=True)
    transporter_id = models.CharField(max_length=100, null=True, blank=True)
    transporter_name = models.CharField(max_length=255, null=True, blank=True)
    vehicle_no = models.CharField(max_length=100, null=True, blank=True)
    lr_gr_consignment = models.CharField(max_length=100, null=True, blank=True)
    
    # Document
    document = models.FileField(upload_to='purchase_transit_documents/', null=True, blank=True)
    
    extra_details = models.JSONField(default=dict, blank=True)

    class Meta:
        managed = False
        db_table = 'voucher_purchase_transit_details'
