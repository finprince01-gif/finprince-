from django.db import models
from django.utils import timezone
from core.models import BaseModel

# ============================================================================
# BASE ITEM MODEL (Abstract)
# ============================================================================

class BaseInventoryOperationItem(BaseModel):
    """
    Abstract base class for all inventory operation line items.
    """
    item_code = models.CharField(max_length=100)
    item_name = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    quantity = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    uom = models.CharField(max_length=50, null=True, blank=True)
    rate = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    taxable_value = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    # Tax fields
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    cgst = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    sgst = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    igst = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    cess = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    total_value = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    # Helper for migration/verification
    original_idx = models.IntegerField(null=True, blank=True)

    class Meta:
        abstract = True

class InventoryMasterCategory(BaseModel):
    """
    Inventory Master Category Model
    Stores the master category hierarchy (Category -> Group -> Subgroup)
    """
    category = models.CharField(
        max_length=255, 
        help_text="Top-level category (e.g., RAW MATERIAL, Finished goods)",
        default="General"
    )
    group = models.CharField(
        max_length=255,
        default='',
        blank=True,
        help_text="Group under category (optional)"
    )
    subgroup = models.CharField(
        max_length=255,
        default='',
        blank=True,
        help_text="Subgroup under group (optional)"
    )
    sub_subgroup = models.CharField(
        max_length=255,
        default='',
        blank=True,
        help_text="Sub-subgroup under subgroup (optional)"
    )
    is_active = models.BooleanField(default=True)
    
    class Meta:

        db_table = 'inventory_master_category'
        unique_together = ('tenant_id', 'category', 'group', 'subgroup', 'sub_subgroup')
        ordering = ['category', 'group', 'subgroup', 'sub_subgroup']
        indexes = [
            models.Index(fields=['tenant_id', 'is_active']),
            models.Index(fields=['category']),
        ]
    
    def __str__(self):
        parts = [self.category]
        if self.group:
            parts.append(self.group)
        if self.subgroup:
            parts.append(self.subgroup)
        if self.sub_subgroup:
            parts.append(self.sub_subgroup)
        return " > ".join(parts)
    
    @property
    def full_path(self):
        return str(self)


class InventoryLocation(BaseModel):
    """
    Inventory Location Model
    Stores warehouse/storage locations
    """
    name = models.CharField(max_length=255, help_text="Location name", default="Main Location")
    location_type = models.CharField(
        max_length=50,
        help_text="Type of location (predefined or custom)",
        default='warehouse'
    )
    
    # Detailed Address Fields
    address_line1 = models.CharField(max_length=255, default='', help_text="Address Line 1 (Required)")
    address_line2 = models.CharField(max_length=255, null=True, blank=True, help_text="Address Line 2 (Optional)")
    address_line3 = models.CharField(max_length=255, null=True, blank=True, help_text="Address Line 3 (Optional)")
    city = models.CharField(max_length=100, default='', help_text="City")
    state = models.CharField(max_length=100, default='', help_text="State")
    country = models.CharField(max_length=100, default='India', help_text="Country")
    pincode = models.CharField(max_length=20, default='', help_text="Pincode/Zip Code")
    
    vendor_name = models.CharField(max_length=255, null=True, blank=True, help_text="Vendor/Agent Name")
    customer_name = models.CharField(max_length=255, null=True, blank=True, help_text="Customer Name")
    location_address = models.CharField(max_length=255, null=True, blank=True, help_text="Location Address Reference")
    
    gstin = models.CharField(
        max_length=15,
        null=True,
        blank=True,
        help_text="GSTIN"
    )
    
    class Meta:

        db_table = 'inventory_master_location'
        ordering = ['name']
        indexes = [
            models.Index(fields=['tenant_id', 'name']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.location_type})"


class InventoryItem(BaseModel):
    """
    Inventory Item Model
    Stores individual inventory items/products
    """
    item_code = models.CharField(max_length=100, help_text="Item Code", default="ITEM000")
    item_name = models.CharField(max_length=255, help_text="Item Name", default="New Item")
    description = models.TextField(null=True, blank=True, help_text="Item Description")
    
    # Category Links
    category = models.ForeignKey(InventoryMasterCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='items')
    category_path = models.CharField(max_length=500, null=True, blank=True, help_text="Full category path display")
    subgroup = models.ForeignKey(InventoryMasterCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='subgroup_items')
    
    # Vendor Specific
    is_vendor_specific = models.BooleanField(default=False)
    vendor_specific_name = models.CharField(max_length=255, null=True, blank=True)
    vendor_specific_suffix = models.CharField(max_length=50, null=True, blank=True)
    
    # Units
    uom = models.CharField(max_length=50, help_text="Unit of Measure", default="nos")
    alternate_uom = models.CharField(max_length=50, null=True, blank=True)
    conversion_factor = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)
    
    # Pricing & Tax
    rate = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    rate_unit = models.CharField(max_length=50, null=True, blank=True)
    hsn_code = models.CharField(max_length=20, null=True, blank=True)
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    cess_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    
    # Other
    reorder_level = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    reorder_level_2 = models.CharField(max_length=255, null=True, blank=True)
    is_saleable = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:

        db_table = 'inventory_master_inventoryitems'
        ordering = ['item_name']
        indexes = [
            models.Index(fields=['tenant_id', 'item_code']),
            models.Index(fields=['category']),
        ]

    def __str__(self):
        return f"{self.item_code} - {self.item_name}"


class InventoryUnit(BaseModel):
    name = models.CharField(max_length=100, default="Number")  # e.g. Kilogram
    symbol = models.CharField(max_length=50, default="nos") # e.g. kg
    is_active = models.BooleanField(default=True)

    class Meta:

        db_table = 'inventory_unit'

    def __str__(self):
        return f"{self.name} ({self.symbol})"


class InventoryMasterGRN(BaseModel):
    """
    GRN (Goods Receipt Note) Master Configuration.
    """
    name = models.CharField(max_length=255, help_text="GRN Series Name", default="GRN Series")
    grn_type = models.CharField(max_length=100, help_text="GRN Type (job_work, purchase, import, other)", default="other")
    prefix = models.CharField(max_length=50, null=True, blank=True)
    suffix = models.CharField(max_length=50, null=True, blank=True)
    year = models.CharField(max_length=4, help_text="Year", default="2024")
    required_digits = models.IntegerField(help_text="Required Digits", default=4)
    start_from = models.IntegerField(help_text="Start from number", default=1)
    preview = models.CharField(max_length=255, null=True, blank=True)
    
    is_active = models.BooleanField(default=True)

    class Meta:

        db_table = 'inventory_master_grn'
        ordering = ['name']

    def __str__(self):
        return self.name


class InventoryMasterIssueSlip(BaseModel):
    """
    Issue Slip Master Configuration.
    """
    name = models.CharField(max_length=255, help_text="Issue Slip Series Name", default="Issue Slip Series")
    issue_slip_type = models.CharField(max_length=100, help_text="Issue Slip Type (internal_transfer, customer_return, damage, other)", default="other")
    prefix = models.CharField(max_length=50, null=True, blank=True)
    suffix = models.CharField(max_length=50, null=True, blank=True)
    year = models.CharField(max_length=4, help_text="Year", default="2024")
    required_digits = models.IntegerField(help_text="Required Digits", default=4)
    start_from = models.IntegerField(help_text="Start from number", default=1)
    preview = models.CharField(max_length=255, null=True, blank=True)
    
    is_active = models.BooleanField(default=True)

    class Meta:

        db_table = 'inventory_master_issueslip'
        ordering = ['name']

    def __str__(self):
        return self.name

# -------------------------------------------------------------------------
# OPERATION TABLES (JobWork, InterUnit, LocationChange, Production, Consumption, Scrap, Outward)
# -------------------------------------------------------------------------

class InventoryOperationJobWork(BaseModel):
    """
    Job Work Operation
    Handles both "Goods sent for Jobwork" (Outward) and "Receipt of goods sent for Jobwork" (Receipt)
    """
    OPERATION_CHOICES = [
        ('outward', 'Outward'),
        ('receipt', 'Receipt'),
    ]

    operation_type = models.CharField(max_length=20, choices=OPERATION_CHOICES, default='outward')
    
    # Common Fields
    transaction_date = models.DateField(null=True, blank=True)
    transaction_time = models.TimeField(null=True, blank=True)
    location_id = models.BigIntegerField(null=True, blank=True, help_text="Issued From / Received At Location ID")
    
    # Jobwork Outward Specific Fields
    job_work_outward_no = models.CharField(max_length=50, null=True, blank=True)
    issue_slip_series = models.CharField(max_length=255, null=True, blank=True)
    po_reference_no = models.CharField(max_length=50, null=True, blank=True)
    
    # Jobwork Receipt Specific Fields
    job_work_receipt_no = models.CharField(max_length=50, null=True, blank=True)
    related_outward_no = models.CharField(max_length=50, null=True, blank=True)
    vendor_delivery_challan_no = models.CharField(max_length=50, null=True, blank=True)
    supplier_invoice_no = models.CharField(max_length=50, null=True, blank=True)
    
    # Vendor / Job Worker Details
    vendor_id = models.BigIntegerField(null=True, blank=True)
    vendor_name = models.CharField(max_length=255, null=True, blank=True)
    vendor_branch = models.CharField(max_length=255, null=True, blank=True)
    vendor_address = models.TextField(null=True, blank=True)
    vendor_gstin = models.CharField(max_length=20, null=True, blank=True)
    
    posting_note = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=50, default='Draft')



    # Dispatch Details
    dispatch_from = models.TextField(null=True, blank=True)
    mode_of_transport = models.CharField(max_length=100, null=True, blank=True)
    dispatch_date = models.DateField(null=True, blank=True)
    dispatch_time = models.TimeField(null=True, blank=True)
    delivery_type = models.CharField(max_length=100, null=True, blank=True)
    transporter_id = models.CharField(max_length=100, null=True, blank=True)
    transporter_name = models.CharField(max_length=255, null=True, blank=True)
    vehicle_no = models.CharField(max_length=100, null=True, blank=True)
    lr_gr_consignment = models.CharField(max_length=100, null=True, blank=True)

    # Auto-restored missing columns
    is_active = models.BooleanField(default=False)
    created_by = models.CharField(max_length=255, null=True, blank=True)
    updated_by = models.CharField(max_length=255, null=True, blank=True)

    class Meta:

        db_table = 'inventory_operation_jobwork'


class InventoryOperationJobWorkItem(BaseInventoryOperationItem):
    """Normalized items for Job Work operation"""
    parent = models.ForeignKey(InventoryOperationJobWork, on_delete=models.CASCADE, related_name='items_rel')
    
    class Meta:
        db_table = 'inventory_operation_jobwork_items'


class InventoryOperationInterUnit(BaseModel):
    """
    Inter Unit Operation
    """
    issue_slip_no = models.CharField(max_length=100)
    issue_slip_series = models.CharField(max_length=255, null=True, blank=True)
    date = models.DateField(null=True, blank=True)
    time = models.TimeField(null=True, blank=True)
    status = models.CharField(max_length=50, default='Draft')
    
    goods_from_location = models.CharField(max_length=255, null=True, blank=True)
    goods_to_location = models.CharField(max_length=255, null=True, blank=True)
    
    posting_note = models.TextField(null=True, blank=True)

    irn = models.CharField(max_length=255, null=True, blank=True)
    ack_no = models.CharField(max_length=100, null=True, blank=True)

    



    # Dispatch Details
    dispatch_from = models.TextField(null=True, blank=True)
    mode_of_transport = models.CharField(max_length=100, null=True, blank=True)
    dispatch_date = models.DateField(null=True, blank=True)
    dispatch_time = models.TimeField(null=True, blank=True)
    delivery_type = models.CharField(max_length=100, null=True, blank=True)
    transporter_id = models.CharField(max_length=100, null=True, blank=True)
    transporter_name = models.CharField(max_length=255, null=True, blank=True)
    vehicle_no = models.CharField(max_length=100, null=True, blank=True)
    lr_gr_consignment = models.CharField(max_length=100, null=True, blank=True)

    class Meta:

        db_table = 'inventory_operation_interunit'


class InventoryOperationInterUnitItem(BaseInventoryOperationItem):
    """Normalized items for Inter Unit operation"""
    parent = models.ForeignKey(InventoryOperationInterUnit, on_delete=models.CASCADE, related_name='items_rel')
    
    class Meta:
        db_table = 'inventory_operation_interunit_items'


class InventoryOperationLocationChange(BaseModel):
    """
    Location Change Operation
    """
    issue_slip_no = models.CharField(max_length=100)
    issue_slip_series = models.CharField(max_length=100, null=True, blank=True)
    date = models.DateField(null=True, blank=True)
    time = models.TimeField(null=True, blank=True)
    status = models.CharField(max_length=50, default='Draft')
    
    goods_from_location = models.CharField(max_length=255, null=True, blank=True)
    goods_to_location = models.CharField(max_length=255, null=True, blank=True)
    
    posting_note = models.TextField(null=True, blank=True)





    # Dispatch Details
    dispatch_from = models.TextField(null=True, blank=True)
    mode_of_transport = models.CharField(max_length=100, null=True, blank=True)
    dispatch_date = models.DateField(null=True, blank=True)
    dispatch_time = models.TimeField(null=True, blank=True)
    delivery_type = models.CharField(max_length=100, null=True, blank=True)
    transporter_id = models.CharField(max_length=100, null=True, blank=True)
    transporter_name = models.CharField(max_length=255, null=True, blank=True)
    vehicle_no = models.CharField(max_length=100, null=True, blank=True)
    lr_gr_consignment = models.CharField(max_length=100, null=True, blank=True)

    # Auto-restored missing columns
    issue_slip_series = models.CharField(max_length=255, null=True, blank=True)

    class Meta:

        db_table = 'inventory_operation_locationchange'


class InventoryOperationLocationChangeItem(BaseInventoryOperationItem):
    """Normalized items for Location Change operation"""
    parent = models.ForeignKey(InventoryOperationLocationChange, on_delete=models.CASCADE, related_name='items_rel')
    
    class Meta:
        db_table = 'inventory_operation_locationchange_items'


class InventoryOperationProduction(BaseModel):
    """
    Production Operation
    """
    issue_slip_no = models.CharField(max_length=100)
    issue_slip_series = models.CharField(max_length=255, null=True, blank=True, help_text='Issue Slip Series name for production')
    date = models.DateField(null=True, blank=True)
    time = models.TimeField(null=True, blank=True)
    status = models.CharField(max_length=50, default='Draft')
    
    goods_from_location = models.CharField(max_length=255, null=True, blank=True)
    goods_to_location = models.CharField(max_length=255, null=True, blank=True)
    
    posting_note = models.TextField(null=True, blank=True)

    # Production Specifics
    production_type = models.CharField(max_length=50, default='materials_issued')
    material_issue_slip_no = models.CharField(max_length=100, null=True, blank=True)
    process_transfer_slip_no = models.CharField(max_length=100, null=True, blank=True)
    finished_goods_production_no = models.CharField(max_length=100, null=True, blank=True)
    batch_no = models.CharField(max_length=50, null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)

    





    # Auto-restored missing columns
    vehicle_no = models.CharField(max_length=255, null=True, blank=True)
    delivery_type = models.CharField(max_length=255, null=True, blank=True)
    dispatch_from = models.CharField(max_length=255, null=True, blank=True)
    transporter_name = models.CharField(max_length=255, null=True, blank=True)
    dispatch_time = models.CharField(max_length=255, null=True, blank=True)
    transporter_id = models.CharField(max_length=255, null=True, blank=True)
    dispatch_date = models.CharField(max_length=255, null=True, blank=True)
    mode_of_transport = models.CharField(max_length=255, null=True, blank=True)
    lr_gr_consignment = models.CharField(max_length=255, null=True, blank=True)

    class Meta:

        db_table = 'inventory_operation_production'


class InventoryOperationProductionItem(BaseInventoryOperationItem):
    """Normalized items for Production operation"""
    parent = models.ForeignKey(InventoryOperationProduction, on_delete=models.CASCADE, related_name='items_rel')
    
    class Meta:
        db_table = 'inventory_operation_production_items'


class InventoryOperationConsumption(BaseModel):
    """
    Consumption Operation
    """
    issue_slip_no = models.CharField(max_length=100)
    date = models.DateField(null=True, blank=True)
    time = models.TimeField(null=True, blank=True)
    status = models.CharField(max_length=50, default='Draft')
    
    goods_from_location = models.CharField(max_length=255, null=True, blank=True)
    
    posting_note = models.TextField(null=True, blank=True)

    # Consumption Specific Details
    
    # Consumption Specific Details
    consumption_type = models.CharField(max_length=50, null=True, blank=True)
    issue_slip_series = models.CharField(max_length=100, null=True, blank=True)
    fixed_asset_ledger = models.CharField(max_length=255, null=True, blank=True)
    expense_ledger = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = 'inventory_operation_consumption'


class InventoryOperationConsumptionItem(BaseInventoryOperationItem):
    """Normalized items for Consumption operation"""
    parent = models.ForeignKey(InventoryOperationConsumption, on_delete=models.CASCADE, related_name='items_rel')
    
    class Meta:
        db_table = 'inventory_operation_consumption_items'



class InventoryOperationScrap(BaseModel):
    """
    Scrap Operation
    """
    issue_slip_no = models.CharField(max_length=100)
    issue_slip_series = models.CharField(max_length=100, null=True, blank=True)
    date = models.DateField(null=True, blank=True)
    time = models.TimeField(null=True, blank=True)
    status = models.CharField(max_length=50, default='Draft')
    
    goods_from_location = models.CharField(max_length=255, null=True, blank=True)
    goods_to_location = models.CharField(max_length=255, null=True, blank=True)
    
    posting_note = models.TextField(null=True, blank=True)

    



    # Dispatch Details
    dispatch_from = models.TextField(null=True, blank=True)
    mode_of_transport = models.CharField(max_length=100, null=True, blank=True)
    dispatch_date = models.DateField(null=True, blank=True)
    dispatch_time = models.TimeField(null=True, blank=True)
    delivery_type = models.CharField(max_length=100, null=True, blank=True)
    transporter_id = models.CharField(max_length=100, null=True, blank=True)
    transporter_name = models.CharField(max_length=255, null=True, blank=True)
    vehicle_no = models.CharField(max_length=100, null=True, blank=True)
    lr_gr_consignment = models.CharField(max_length=100, null=True, blank=True)

    class Meta:

        db_table = 'inventory_operation_scrap'


class InventoryOperationScrapItem(BaseInventoryOperationItem):
    """Normalized items for Scrap operation"""
    parent = models.ForeignKey(InventoryOperationScrap, on_delete=models.CASCADE, related_name='items_rel')
    
    class Meta:
        db_table = 'inventory_operation_scrap_items'


# InventoryOperationGRN removed - replaced by InventoryOperationNewGRN


class InventoryOperationOutward(BaseModel):
    """
    Outward Operation (Sales / Purchase Return)
    """
    outward_slip_no = models.CharField(max_length=100)
    issue_slip_series = models.CharField(max_length=100, null=True, blank=True)
    date = models.DateField(null=True, blank=True)
    time = models.TimeField(null=True, blank=True)
    
    # 'sales' or 'purchase_return'
    outward_type = models.CharField(max_length=50, default='sales')
    
    # Location Logic in Outward form uses ID select
    location = models.ForeignKey(InventoryLocation, on_delete=models.SET_NULL, null=True, blank=True)
    
    # Sales Fields
    sales_order_no = models.CharField(max_length=500, null=True, blank=True)

    customer_name = models.CharField(max_length=255, null=True, blank=True)
    customer_id = models.BigIntegerField(null=True, blank=True, help_text="Link to customer master")
    
    # Purchase Return Fields
    supplier_invoice_no = models.CharField(max_length=100, null=True, blank=True)
    vendor_name = models.CharField(max_length=255, null=True, blank=True)
    
    # Common
    branch = models.CharField(max_length=100, null=True, blank=True)
    address = models.TextField(null=True, blank=True)
    gstin = models.CharField(max_length=20, null=True, blank=True)
    
    total_boxes = models.PositiveIntegerField(null=True, blank=True)
    posting_note = models.TextField(null=True, blank=True)
    reasons_for_return = models.TextField(null=True, blank=True)
    
    # Tracking
    status = models.CharField(max_length=20, default='PENDING')
    linked_sales_voucher_id = models.BigIntegerField(null=True, blank=True, unique=True)



    class Meta:
        db_table = 'inventory_operation_outward'


class InventoryOperationOutwardItem(BaseInventoryOperationItem):
    """Normalized items for Outward operation"""
    parent = models.ForeignKey(InventoryOperationOutward, on_delete=models.CASCADE, related_name='items_rel')
    
    class Meta:
        db_table = 'inventory_operation_outward_items'



class InventoryOperationNewGRN(BaseModel):
    """
    New GRN / Goods Receipt Note Table based on frontend modal
    """
    grn_type = models.CharField(max_length=50, default='purchases') # purchases, sales_return
    grn_no = models.CharField(max_length=100, null=True, blank=True)
    grn_series_name = models.CharField(max_length=255, null=True, blank=True)
    date = models.DateField(null=True, blank=True)
    time = models.TimeField(null=True, blank=True)
    
    # Location Logic
    location_id = models.BigIntegerField(null=True, blank=True)
    
    # Party Details
    vendor_name = models.CharField(max_length=255, null=True, blank=True)
    customer_name = models.CharField(max_length=255, null=True, blank=True)
    branch = models.CharField(max_length=255, null=True, blank=True)
    address = models.TextField(null=True, blank=True)
    gstin = models.CharField(max_length=50, null=True, blank=True)
    
    # References
    reference_no = models.CharField(max_length=100, null=True, blank=True) # PO No / Sales Voucher No
    
    # Sales Return Specific
    return_reason = models.TextField(null=True, blank=True)
    
    # Common
    posting_note = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=50, default='Posted')

    # Auto-restored missing columns
    
    # Auto-restored missing columns
    secondary_ref_no = models.CharField(max_length=255, null=True, blank=True)

    class Meta:

        db_table = 'inventory_operation_new_grn'


class InventoryOperationNewGRNItem(BaseInventoryOperationItem):
    """Normalized items for New GRN operation"""
    parent = models.ForeignKey(InventoryOperationNewGRN, on_delete=models.CASCADE, related_name='items_rel')
    
    class Meta:
        db_table = 'inventory_operation_new_grn_items'

class InventoryOperationEWayBill(BaseModel):
    """
    Normalized E-Way Bill details for inventory operations.
    Replaces the 'eway_bill_details' JSON list.
    """
    OPERATION_TYPES = [
        ('jobwork', 'Job Work'),
        ('interunit', 'Inter Unit'),
        ('location_change', 'Location Change'),
        ('production', 'Production'),
        ('scrap', 'Scrap'),
        ('outward', 'Outward'),
        ('grn', 'New GRN'),
    ]
    operation_type = models.CharField(max_length=20, choices=OPERATION_TYPES)
    operation_id = models.BigIntegerField()
    
    eway_bill_no = models.CharField(max_length=50)
    eway_bill_date = models.DateField(null=True, blank=True)
    distance = models.CharField(max_length=50, null=True, blank=True)
    vehicle_no = models.CharField(max_length=50, null=True, blank=True)
    validity = models.CharField(max_length=50, null=True, blank=True)
    status = models.CharField(max_length=50, default='Active')

    class Meta:
        db_table = 'inventory_operation_ewaybills'
        indexes = [
            models.Index(fields=['operation_type', 'operation_id']),
        ]

class HsnGstMaster(models.Model):
    hsn_code = models.CharField(max_length=20, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    sgst_utgst = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    igst = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    cgst = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    class Meta:

        db_table = 'hsn_gst_master'

class InventoryStockGroup(BaseModel):
    """
    Inventory Stock Group Model for hierarchy
    """
    name = models.CharField(max_length=255)
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='subgroups')
    description = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'inventory_stock_groups'
        unique_together = ('tenant_id', 'name')

    def __str__(self):
        return self.name

class InventoryStockItem(BaseModel):
    """
    Inventory Stock Item Model - used for centralized stock balance and reporting
    """
    name = models.CharField(max_length=255)
    item_code = models.CharField(max_length=100, db_index=True)
    hsn_code = models.CharField(max_length=20, null=True, blank=True)
    group = models.CharField(max_length=255, null=True, blank=True)
    unit = models.CharField(max_length=50, default='nos')
    current_balance = models.DecimalField(max_digits=15, decimal_places=3, default=0)
    rate = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'inventory_stock_items'
        unique_together = ('tenant_id', 'item_code')

    def __str__(self):
        return f"{self.item_code} - {self.name}"

class StockMovement(BaseModel):
    """
    Stock Movement Model - tracks all inward/outward movements
    """
    item_code = models.CharField(max_length=100, db_index=True)
    date = models.DateField(default=timezone.now)
    time = models.TimeField(null=True, blank=True)
    voucher_type = models.CharField(max_length=50) # GRN, Outward, etc.
    voucher_no = models.CharField(max_length=100)
    location = models.CharField(max_length=255, null=True, blank=True)
    inward_qty = models.DecimalField(max_digits=15, decimal_places=3, default=0)
    outward_qty = models.DecimalField(max_digits=15, decimal_places=3, default=0)
    balance_qty = models.DecimalField(max_digits=15, decimal_places=3, default=0)
    rate = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    value = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    class Meta:
        db_table = 'inventory_stock_movements'
        indexes = [
            models.Index(fields=['tenant_id', 'item_code', 'date']),
            models.Index(fields=['tenant_id', 'location']),
        ]

    def __str__(self):
        return f"{self.item_code} | {self.voucher_type} | {self.voucher_no}"
