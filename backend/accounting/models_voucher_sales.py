from django.db import models
from core.models import BaseModel
# from .models import MasterLedger

class VoucherSalesInvoiceDetails(BaseModel):
    """
    Sales Voucher - Invoice Details
    Header table for the sales voucher transaction.
    """
    # Date
    date = models.DateField(help_text="Voucher Date")
    
    # Invoice No
    # Invoice No
    sales_invoice_no = models.CharField(max_length=100, help_text="Sales Invoice Number")
    
    # New Fields matching Frontend
    voucher_name = models.CharField(max_length=255, null=True, blank=True)
    outward_slip_no = models.CharField(max_length=100, null=True, blank=True)
    
    # Customer
    customer_name = models.CharField(max_length=255, help_text="Customer Name as entered/selected")
    customer_id = models.BigIntegerField(null=True, blank=True, help_text="Link to customer master")
    customer_branch = models.CharField(max_length=100, null=True, blank=True)
    voucher_id = models.BigIntegerField(null=True, blank=True, help_text="Link to voucher master table")
    outward_slip_id = models.BigIntegerField(null=True, blank=True, help_text="Link to outward slip")
    
    # Addresses
    bill_to = models.TextField(null=True, blank=True, help_text="Billing Address")
    ship_to = models.TextField(null=True, blank=True, help_text="Shipping Address")
    
    # Contact Info
    gstin = models.CharField(max_length=15, null=True, blank=True)
    contact = models.CharField(max_length=100, null=True, blank=True)
    
    # State/Tax Info
    tax_type = models.CharField(max_length=50, null=True, blank=True)
    state_type = models.CharField(
        max_length=20, 
        choices=[('within', 'Within State'), ('other', 'Other State'), ('export', 'Export')],
        default='within'
    )
    export_type = models.CharField(max_length=50, null=True, blank=True)
    exchange_rate = models.CharField(max_length=50, null=True, blank=True)
    
    # Document
    supporting_document = models.FileField(upload_to='voucher_documents/sales/', null=True, blank=True)

    # Reference from Item Tab (logically header info)
    sales_order_no = models.CharField(max_length=255, null=True, blank=True)

    # GST-Compliant Fields
    place_of_supply = models.CharField(
        max_length=2, 
        null=True, 
        blank=True, 
        help_text="State code (01-38)"
    )
    reverse_charge = models.CharField(
        max_length=1, 
        default='N', 
        help_text="Reverse charge applicable (Y/N)"
    )
    invoice_type = models.CharField(
        max_length=50, 
        default='Regular', 
        help_text="Invoice type (Regular, SEZ with payment, etc.)"
    )
    gst_export_type = models.CharField(
        max_length=10, 
        null=True, 
        blank=True, 
        help_text="Export type (WPAY/WOPAY) for exports"
    )
    port_code = models.CharField(
        max_length=6, 
        null=True, 
        blank=True, 
        help_text="6-digit port code for exports"
    )
    shipping_bill_number = models.CharField(
        max_length=50, 
        null=True, 
        blank=True, 
        help_text="Shipping bill number for exports"
    )
    shipping_bill_date = models.DateField(
        null=True, 
        blank=True, 
        help_text="Shipping bill date for exports"
    )
    ecommerce_gstin = models.CharField(
        max_length=15, 
        null=True, 
        blank=True, 
        help_text="E-commerce operator GSTIN"
    )
    irn = models.CharField(max_length=255, null=True, blank=True)
    ack_no = models.CharField(max_length=100, null=True, blank=True)

    # Status Tracking
    status = models.CharField(
        max_length=20, 
        choices=[
            ('draft', 'Draft'), 
            ('pending', 'Pending Approval'), 
            ('completed', 'Completed'), 
            ('cancelled', 'Cancelled'),
            ('received', 'Received'),
            ('partially received', 'Partially Received')
        ],
        default='draft'
    )
    current_step = models.IntegerField(default=1, help_text="Current creation step (1-5)")

    # Posting Status Tracking
    posting_status = models.CharField(
        max_length=20, 
        choices=[('POSTED', 'Posted'), ('SKIPPED', 'Skipped'), ('FAILED', 'Failed')],
        default='SKIPPED'
    )
    posting_error = models.TextField(null=True, blank=True)

    class Meta:

        db_table = 'voucher_sales_invoicedetails'
        verbose_name = "Voucher Sales Invoice Detail"


class VoucherSalesItems(BaseModel):
    """
    Sales Voucher - Items (Standard/Domestic)
    """
    invoice = models.ForeignKey(VoucherSalesInvoiceDetails, on_delete=models.CASCADE, related_name='items')
    
    item_code = models.CharField(max_length=100, null=True, blank=True)
    item_name = models.CharField(max_length=255, null=True, blank=True)
    hsn_sac = models.CharField(max_length=50, null=True, blank=True)
    qty = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    uom = models.CharField(max_length=50, null=True, blank=True)
    item_rate = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    # Values
    taxable_value = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    igst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    cgst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    sgst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    cess = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    invoice_value = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    # Extra
    sales_ledger = models.CharField(max_length=255, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    alternate_unit = models.CharField(max_length=50, null=True, blank=True)

    class Meta:

        db_table = 'voucher_sales_items'
        verbose_name = "Voucher Sales Item"


class VoucherSalesItemsForeign(BaseModel):
    """
    Sales Voucher - Items (Foreign/Export)
    """
    invoice = models.ForeignKey(VoucherSalesInvoiceDetails, on_delete=models.CASCADE, related_name='foreign_items')

    item_name = models.CharField(max_length=255, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    quantity = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    uqc = models.CharField(max_length=50, null=True, blank=True)
    rate = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    alternate_unit = models.CharField(max_length=50, null=True, blank=True)
    sales_ledger = models.CharField(max_length=255, null=True, blank=True)

    class Meta:

        db_table = 'voucher_sales_items_foreign'
        verbose_name = "Voucher Sales Item Foreign"


class VoucherSalesPaymentDetails(BaseModel):
    """
    Sales Voucher - Payment Details
    """
    invoice = models.OneToOneField(VoucherSalesInvoiceDetails, on_delete=models.CASCADE, related_name='payment_details')
    
    # Tax Summaries
    payment_taxable_value = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    payment_igst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    payment_cgst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    payment_sgst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    payment_cess = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    payment_state_cess = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    payment_invoice_value = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    # Specific Payment Fields
    payment_tds_income_tax = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    payment_tds_gst = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    payment_advance = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    payment_payable = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    # Tracking (Quantitative)
    payment_received = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    payment_balance = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    # Notes
    posting_note = models.TextField(null=True, blank=True)
    terms_conditions = models.TextField(null=True, blank=True)
    
    class Meta:

        db_table = 'voucher_sales_paymentdetails'
        verbose_name = "Voucher Sales Payment Detail"


class VoucherSalesDispatchDetails(BaseModel):
    """
    Sales Voucher - Dispatch Details
    """
    invoice = models.OneToOneField(VoucherSalesInvoiceDetails, on_delete=models.CASCADE, related_name='dispatch_details')
    
    dispatch_from = models.TextField(null=True, blank=True)
    mode_of_transport = models.CharField(max_length=50, null=True, blank=True)
    dispatch_date = models.DateField(null=True, blank=True)
    dispatch_time = models.TimeField(null=True, blank=True)
    
    delivery_type = models.CharField(max_length=50, null=True, blank=True)
    self_third_party = models.CharField(max_length=255, null=True, blank=True)
    transporter_id = models.CharField(max_length=100, null=True, blank=True)
    transporter_name = models.CharField(max_length=255, null=True, blank=True)
    vehicle_no = models.CharField(max_length=50, null=True, blank=True)
    lr_gr_consignment = models.CharField(max_length=100, null=True, blank=True)
    
    dispatch_document = models.FileField(upload_to='voucher_documents/dispatch/', null=True, blank=True)

    # Air/Sea Upto Port
    upto_port_shipping_bill_no = models.CharField(max_length=100, null=True, blank=True)
    upto_port_shipping_bill_date = models.DateField(null=True, blank=True)
    upto_port_ship_port_code = models.CharField(max_length=50, null=True, blank=True)
    upto_port_origin = models.CharField(max_length=100, null=True, blank=True)
    
    # Air/Sea Beyond Port
    beyond_port_shipping_bill_no = models.CharField(max_length=100, null=True, blank=True)
    beyond_port_shipping_bill_date = models.DateField(null=True, blank=True)
    beyond_port_ship_port_code = models.CharField(max_length=50, null=True, blank=True)
    beyond_port_vessel_flight_no = models.CharField(max_length=100, null=True, blank=True)
    beyond_port_port_of_loading = models.CharField(max_length=100, null=True, blank=True)
    beyond_port_port_of_discharge = models.CharField(max_length=100, null=True, blank=True)
    beyond_port_final_destination = models.CharField(max_length=100, null=True, blank=True)
    beyond_port_origin_country = models.CharField(max_length=100, null=True, blank=True)
    beyond_port_dest_country = models.CharField(max_length=100, null=True, blank=True)
    
    # Rail
    rail_upto_port_delivery_type = models.CharField(max_length=100, null=True, blank=True)
    rail_upto_port_transporter_id = models.CharField(max_length=100, null=True, blank=True)
    rail_upto_port_transporter_name = models.CharField(max_length=255, null=True, blank=True)
    rail_upto_port_vehicle_no = models.CharField(max_length=100, null=True, blank=True)
    rail_upto_port_lr_gr_consignment = models.CharField(max_length=100, null=True, blank=True)
    
    rail_beyond_port_receipt_no = models.CharField(max_length=100, null=True, blank=True)
    rail_beyond_port_receipt_date = models.DateField(null=True, blank=True)
    rail_beyond_port_origin = models.CharField(max_length=100, null=True, blank=True)
    rail_beyond_port_origin_country = models.CharField(max_length=100, null=True, blank=True)
    rail_beyond_port_rail_no = models.CharField(max_length=100, null=True, blank=True)
    rail_beyond_port_fnr_no = models.CharField(max_length=100, null=True, blank=True)
    rail_beyond_port_station_loading = models.CharField(max_length=100, null=True, blank=True)
    rail_beyond_port_station_discharge = models.CharField(max_length=100, null=True, blank=True)
    rail_beyond_port_final_destination = models.CharField(max_length=100, null=True, blank=True)
    rail_beyond_port_dest_country = models.CharField(max_length=100, null=True, blank=True)

    class Meta:

        db_table = 'voucher_sales_dispatchdetails'
        verbose_name = "Voucher Sales Dispatch Detail"


class VoucherSalesEwayBill(BaseModel):
    """
    Sales Voucher - E-way Bill & E-Invoice Details
    """
    invoice = models.ForeignKey(VoucherSalesInvoiceDetails, on_delete=models.CASCADE, related_name='eway_bill_details')
    
    eway_bill_available = models.BooleanField(default=False)
    eway_bill_no = models.CharField(max_length=50, null=True, blank=True)
    eway_bill_date = models.DateField(null=True, blank=True)
    validity_period = models.CharField(max_length=50, null=True, blank=True)
    distance = models.CharField(max_length=50, null=True, blank=True)
    
    # Extended EWB
    extension_date = models.DateField(null=True, blank=True)
    extended_ewb_no = models.CharField(max_length=50, null=True, blank=True)
    extension_reason = models.CharField(max_length=255, null=True, blank=True)
    from_place = models.CharField(max_length=100, null=True, blank=True)
    remaining_distance = models.CharField(max_length=50, null=True, blank=True)
    new_validity = models.CharField(max_length=50, null=True, blank=True)
    updated_vehicle_no = models.CharField(max_length=50, null=True, blank=True)
    
    # E-Invoice
    irn = models.CharField(max_length=255, null=True, blank=True)
    ack_no = models.CharField(max_length=100, null=True, blank=True)

    class Meta:

        db_table = 'voucher_sales_ewaybill'
        verbose_name = "Voucher Sales Eway Bill"
