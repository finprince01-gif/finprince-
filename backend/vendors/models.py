
from django.db import models
from django.core.validators import EmailValidator, RegexValidator
from inventory.models import InventoryMasterCategory


class VendorMasterCategory(models.Model):
    """
    Vendor Master Category Model
    Stores the vendor category hierarchy (Category -> Group -> Subgroup)
    This is a flat lookup table for vendor category definitions
    """
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    category = models.CharField(
        max_length=255, 
        help_text="Top-level category (e.g., RAW MATERIAL, Stores and Spares, Packing Material)"
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
        help_text="Level 3 item under subgroup (optional)"
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        managed = False
        db_table = 'vendor_master_category'
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
    def full_path(self) -> str:
        """Get full category path"""
        return str(self)


class Vendor(models.Model):
    """
    Main Vendor model for storing vendor/supplier information.
    """
    # Tenant and identification
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    vendor_code = models.CharField(max_length=50, unique=True, help_text="Unique vendor code")
    
    # Basic Information
    vendor_name = models.CharField(max_length=200, help_text="Vendor/Supplier name")
    display_name = models.CharField(max_length=200, blank=True, null=True, help_text="Display name")
    vendor_type = models.CharField(
        max_length=50,
        choices=[
            ('supplier', 'Supplier'),
            ('manufacturer', 'Manufacturer'),
            ('distributor', 'Distributor'),
            ('service_provider', 'Service Provider'),
            ('other', 'Other')
        ],
        default='supplier',
        help_text="Type of vendor"
    )
    
    # Contact Information
    contact_person = models.CharField(max_length=100, blank=True, null=True, help_text="Primary contact person")
    email = models.EmailField(
        max_length=255,
        blank=True,
        null=True,
        validators=[EmailValidator()],
        help_text="Primary email address"
    )
    phone = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        validators=[RegexValidator(regex=r'^\+?1?\d{9,15}$', message="Enter a valid phone number")],
        help_text="Primary phone number"
    )
    mobile = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        validators=[RegexValidator(regex=r'^\+?1?\d{9,15}$', message="Enter a valid mobile number")],
        help_text="Mobile number"
    )
    website = models.URLField(max_length=255, blank=True, null=True, help_text="Website URL")
    
    # Billing Address
    billing_address_line1 = models.CharField(max_length=255, blank=True, null=True, help_text="Billing address line 1")
    billing_address_line2 = models.CharField(max_length=255, blank=True, null=True, help_text="Billing address line 2")
    billing_city = models.CharField(max_length=100, blank=True, null=True, help_text="Billing city")
    billing_state = models.CharField(max_length=100, blank=True, null=True, help_text="Billing state")
    billing_country = models.CharField(max_length=100, default='India', help_text="Billing country")
    billing_pincode = models.CharField(max_length=10, blank=True, null=True, help_text="Billing pincode")
    
    # Shipping Address
    shipping_address_line1 = models.CharField(max_length=255, blank=True, null=True, help_text="Shipping address line 1")
    shipping_address_line2 = models.CharField(max_length=255, blank=True, null=True, help_text="Shipping address line 2")
    shipping_city = models.CharField(max_length=100, blank=True, null=True, help_text="Shipping city")
    shipping_state = models.CharField(max_length=100, blank=True, null=True, help_text="Shipping state")
    shipping_country = models.CharField(max_length=100, default='India', help_text="Shipping country")
    shipping_pincode = models.CharField(max_length=10, blank=True, null=True, help_text="Shipping pincode")
    
    # Tax Information
    gstin = models.CharField(max_length=15, blank=True, null=True, help_text="GSTIN number")
    pan = models.CharField(max_length=10, blank=True, null=True, help_text="PAN number")
    tax_id = models.CharField(max_length=50, blank=True, null=True, help_text="Tax ID")
    
    # Payment Terms
    payment_terms = models.CharField(
        max_length=50,
        choices=[
            ('immediate', 'Immediate'),
            ('net_15', 'Net 15 Days'),
            ('net_30', 'Net 30 Days'),
            ('net_45', 'Net 45 Days'),
            ('net_60', 'Net 60 Days'),
            ('net_90', 'Net 90 Days'),
            ('custom', 'Custom')
        ],
        default='net_30',
        help_text="Payment terms"
    )
    credit_limit = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True, help_text="Credit limit")
    credit_days = models.IntegerField(blank=True, null=True, help_text="Credit days")
    
    # Banking Information
    bank_name = models.CharField(max_length=255, blank=True, null=True, help_text="Bank name")
    bank_account_number = models.CharField(max_length=20, blank=True, null=True, help_text="Bank account number")
    bank_ifsc = models.CharField(max_length=11, blank=True, null=True, help_text="IFSC code")
    bank_branch = models.CharField(max_length=255, blank=True, null=True, help_text="Bank branch")
    
    # Category
    category = models.ForeignKey(
        VendorMasterCategory,
        on_delete=models.SET_NULL,
        related_name='vendors',
        null=True,
        blank=True,
        help_text="Vendor category"
    )
    
    # Additional Information
    notes = models.TextField(blank=True, null=True, help_text="Additional notes")
    opening_balance = models.DecimalField(max_digits=15, decimal_places=2, default=0.00, help_text="Opening balance")
    current_balance = models.DecimalField(max_digits=15, decimal_places=2, default=0.00, help_text="Current balance")
    
    # Status and Metadata
    is_active = models.BooleanField(default=True, help_text="Is vendor active")
    is_verified = models.BooleanField(default=False, help_text="Is vendor verified")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, null=True, help_text="Created by user")
    updated_by = models.CharField(max_length=100, blank=True, null=True, help_text="Updated by user")

    class Meta:
        managed = False
        db_table = 'vendor_master'
        verbose_name = 'Vendor'
        verbose_name_plural = 'Vendors'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['vendor_code']),
            models.Index(fields=['tenant_id', 'vendor_name']),
            models.Index(fields=['tenant_id', 'is_active']),
        ]
        ordering = ['vendor_name']

    def __str__(self):
        return f"{self.vendor_code} - {self.vendor_name}"
    
    def get_full_billing_address(self):
        """Return formatted billing address"""
        parts = [
            self.billing_address_line1,
            self.billing_address_line2,
            self.billing_city,
            self.billing_state,
            self.billing_country,
            self.billing_pincode
        ]
        return ', '.join([p for p in parts if p])
    
    def get_full_shipping_address(self):
        """Return formatted shipping address"""
        parts = [
            self.shipping_address_line1,
            self.shipping_address_line2,
            self.shipping_city,
            self.shipping_state,
            self.shipping_country,
            self.shipping_pincode
        ]
        return ', '.join([p for p in parts if p])


class VendorMasterPOSettings(models.Model):
    """
    Model for storing Vendor PO Settings configuration.
    This table stores the PO series settings configured in the frontend.
    """
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    name = models.CharField(max_length=200, help_text="Name of PO Series")
    category = models.ForeignKey(
        'VendorMasterCategory',
        on_delete=models.PROTECT,
        related_name='vendor_po_settings',
        null=True,
        blank=True,
        help_text="Category for the PO Series"
    )
    prefix = models.CharField(max_length=50, blank=True, null=True, help_text="Prefix for PO number (e.g., PO/)")
    suffix = models.CharField(max_length=50, blank=True, null=True, help_text="Suffix for PO number (e.g., /24-25)")
    digits = models.IntegerField(default=4, help_text="Number of digits for the sequence")
    auto_year = models.BooleanField(default=False, help_text="Automatically include year in PO number")
    current_number = models.IntegerField(default=1, help_text="Current sequence number")
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'vendor_master_posettings'
        verbose_name = 'Vendor Master PO Setting'
        verbose_name_plural = 'Vendor Master PO Settings'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['tenant_id', 'name']),
        ]

    def __str__(self):
        return f"{self.name} ({self.tenant_id})"
    
    def generate_po_number(self):
        """Generate the next PO number based on settings"""
        number_str = str(self.current_number).zfill(self.digits)
        prefix = self.prefix or ''
        suffix = self.suffix or ''
        
        if self.auto_year:
            from datetime import datetime
            current_year = datetime.now().year
            suffix = f"/{current_year % 100:02d}"  # Last 2 digits of year
        
        return f"{prefix}{number_str}{suffix}"


class VendorMasterBasicDetail(models.Model):
    """
    Model for storing Vendor Basic Details.
    This table stores the basic vendor information from the Vendor Creation form.
    """
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    vendor_code = models.CharField(max_length=50, blank=True, null=True, help_text="Vendor code (auto-generated or manual)")
    vendor_name = models.CharField(max_length=200, help_text="Vendor name")
    pan_no = models.CharField(max_length=10, blank=True, null=True, help_text="PAN number")
    contact_person = models.CharField(max_length=100, blank=True, null=True, help_text="Contact person name")
    email = models.EmailField(
        max_length=255,
        help_text="Email address",
        validators=[EmailValidator()]
    )
    contact_no = models.CharField(
        max_length=20,
        help_text="Contact number",
        validators=[RegexValidator(regex=r'^\+?1?\d{9,15}$', message="Enter a valid contact number")]
    )
    vendor_category = models.CharField(max_length=200, blank=True, null=True, help_text="Vendor category")
    billing_currency = models.CharField(max_length=10, blank=True, null=True, help_text="Billing currency")
    is_also_customer = models.BooleanField(default=False, help_text="Is this vendor also a customer?")
    tcs_applicable = models.BooleanField(default=False, help_text="Is TCS applicable for this vendor?")
    
    # Linked Accounting Ledger
    ledger = models.ForeignKey(
        'accounting.MasterLedger', 
        on_delete=models.RESTRICT, 
        null=True, 
        blank=True, 
        related_name='vendors_basic',
        db_column='ledger_id'
    )
    
    # Metadata
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, null=True, help_text="Created by user")
    updated_by = models.CharField(max_length=100, blank=True, null=True, help_text="Updated by user")

    class Meta:
        managed = False
        db_table = 'vendor_master_vendorcreation_basicdetail'
        verbose_name = 'Vendor Master Basic Detail'
        verbose_name_plural = 'Vendor Master Basic Details'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['tenant_id', 'vendor_name']),
            models.Index(fields=['email']),
            models.Index(fields=['pan_no']),
        ]
        unique_together = [['tenant_id', 'vendor_code']]

    def __str__(self):
        return f"{self.vendor_name} ({self.vendor_code or 'No Code'})"
    
    def generate_vendor_code(self):
        """Auto-generate vendor code if not provided"""
        if not self.vendor_code:
            # Get the last vendor for this tenant
            last_vendor = VendorMasterBasicDetail.objects.filter(
                tenant_id=self.tenant_id
            ).exclude(vendor_code__isnull=True).exclude(vendor_code='').order_by('-id').first()
            
            if last_vendor and last_vendor.vendor_code:
                # Extract number from last code (e.g., VEN0001 -> 1)
                try:
                    last_number = int(last_vendor.vendor_code.replace('VEN', ''))
                    new_number = last_number + 1
                except (ValueError, AttributeError):
                    new_number = 1
            else:
                new_number = 1
            
            self.vendor_code = f"VEN{new_number:04d}"
        
        return self.vendor_code


class VendorMasterGSTDetails(models.Model):
    """
    Model for storing Vendor GST Details.
    This table stores the GST information from the GST Details form.
    """
    
    GST_REGISTRATION_TYPES = [
        ('regular', 'Regular'),
        ('composition', 'Composition'),
        ('unregistered', 'Unregistered'),
        ('consumer', 'Consumer'),
        ('overseas', 'Overseas'),
        ('special_economic_zone', 'Special Economic Zone'),
        ('deemed_export', 'Deemed Export'),
    ]
    
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    vendor_basic_detail = models.ForeignKey(
        VendorMasterBasicDetail,
        on_delete=models.CASCADE,
        related_name='gst_details',
        null=True,
        blank=True,
        help_text="Link to vendor basic details"
    )
    gstin = models.CharField(max_length=15, help_text="GSTIN number (15 characters)")
    gst_registration_type = models.CharField(
        max_length=50,
        choices=GST_REGISTRATION_TYPES,
        default='regular',
        help_text="GST registration type"
    )
    legal_name = models.CharField(max_length=200, help_text="Legal name as per GST")
    trade_name = models.CharField(max_length=200, blank=True, null=True, help_text="Trade/Brand name")
    
    # Additional GST fields
    gst_state = models.CharField(max_length=100, blank=True, null=True, help_text="State of GST registration")
    gst_state_code = models.CharField(max_length=2, blank=True, null=True, help_text="State code (2 digits)")
    pan_linked_with_gstin = models.CharField(max_length=10, blank=True, null=True, help_text="PAN linked with GSTIN")
    date_of_registration = models.DateField(blank=True, null=True, help_text="Date of GST registration")
    
    # Place of Business (Branch) Details
    reference_name = models.CharField(max_length=200, blank=True, null=True, help_text="Branch reference name")
    branch_address = models.TextField(blank=True, null=True, help_text="Branch address")
    branch_contact_person = models.CharField(max_length=100, blank=True, null=True, help_text="Branch contact person")
    branch_email = models.CharField(max_length=255, blank=True, null=True, help_text="Branch email")
    branch_contact_no = models.CharField(max_length=20, blank=True, null=True, help_text="Branch contact number")
    
    # Metadata
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, null=True, help_text="Created by user")
    updated_by = models.CharField(max_length=100, blank=True, null=True, help_text="Updated by user")

    class Meta:
        managed = False
        db_table = 'vendor_master_vendorcreation_gstdetails'
        verbose_name = 'Vendor Master GST Detail'
        verbose_name_plural = 'Vendor Master GST Details'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['gstin']),
            models.Index(fields=['tenant_id', 'gstin']),
        ]
        unique_together = [['tenant_id', 'gstin', 'reference_name']]

    def __str__(self):
        return f"{self.gstin} - {self.legal_name}"
    
    def extract_pan_from_gstin(self):
        """Extract PAN from GSTIN (characters 3-12)"""
        if self.gstin and len(self.gstin) == 15:
            return self.gstin[2:12]
        return None
    
    def extract_state_code_from_gstin(self):
        """Extract state code from GSTIN (first 2 characters)"""
        if self.gstin and len(self.gstin) >= 2:
            return self.gstin[:2]
        return None


class VendorMasterProductService(models.Model):
    """
    Model for storing Vendor Products and Services.
    Stores all items as a JSON array in a single row per vendor.
    JSON structure: [{"hsn_sac_code": "", "item_code": "", "item_name": "",
                       "supplier_item_code": "", "supplier_item_name": ""}]
    """
    
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    vendor_basic_detail = models.OneToOneField(
        VendorMasterBasicDetail,
        on_delete=models.CASCADE,
        related_name='product_services',
        null=True,
        blank=True,
        help_text="Link to vendor basic details"
    )
    # All items stored as a JSON array
    items = models.JSONField(
        default=list,
        help_text="JSON array of product/service items"
    )
    
    # Metadata
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, null=True, help_text="Created by user")
    updated_by = models.CharField(max_length=100, blank=True, null=True, help_text="Updated by user")

    class Meta:
        managed = False
        db_table = 'vendor_master_vendorcreation_productservices'
        verbose_name = 'Vendor Master Product/Service'
        verbose_name_plural = 'Vendor Master Products/Services'

    def __str__(self):
        count = len(self.items) if self.items else 0
        return f"Products for vendor {self.vendor_basic_detail_id} ({count} items)"




class VendorMasterTDS(models.Model):
    """
    Model for storing Vendor TDS & Other Statutory Details.
    This table stores the TDS and statutory information from the TDS Details form.
    """
    
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    vendor_basic_detail = models.ForeignKey(
        VendorMasterBasicDetail,
        on_delete=models.CASCADE,
        related_name='tds_details',
        null=True,
        blank=True,
        help_text="Link to vendor basic details"
    )
    
    # TDS Information
    tds_section_applicable = models.CharField(max_length=100, blank=True, null=True, help_text="TDS Section Applicable")
    enable_automatic_tds_posting = models.BooleanField(default=False, help_text="Enable automatic TDS posting")
    
    # MSME and FSSAI
    msme_udyam_no = models.CharField(max_length=50, blank=True, null=True, help_text="MSME Udyam Registration Number")
    fssai_license_no = models.CharField(max_length=50, blank=True, null=True, help_text="FSSAI License Number")
    
    # Import/Export
    import_export_code = models.CharField(max_length=50, blank=True, null=True, help_text="Import Export Code (IEC)")
    eou_status = models.CharField(max_length=100, blank=True, null=True, help_text="Export Oriented Unit Status")
    
    # Additional Statutory & TDS Fields
    pan_number = models.CharField(max_length=10, blank=True, null=True, help_text="PAN Number")
    tan_number = models.CharField(max_length=10, blank=True, null=True, help_text="TAN Number")
    tds_section = models.CharField(max_length=100, blank=True, null=True, help_text="TDS Section (alternate)")
    tds_rate = models.CharField(max_length=50, blank=True, null=True, help_text="TDS Rate")
    penalty_rate = models.CharField(max_length=50, blank=True, null=True, help_text="Penalty Rate")
    cin_number = models.CharField(max_length=21, blank=True, null=True, help_text="CIN Number")
    # TCS Fields
    tcs_section_applicable = models.CharField(max_length=200, blank=True, null=True, help_text="TCS Section Applicable")
    tcs_rate = models.CharField(max_length=50, blank=True, null=True, help_text="TCS Rate")
    
    # File Uploads
    msme_file = models.FileField(upload_to='vendors/msme/', blank=True, null=True, help_text="MSME Certificate")
    fssai_file = models.FileField(upload_to='vendors/fssai/', blank=True, null=True, help_text="FSSAI License")
    import_export_file = models.FileField(upload_to='vendors/iec/', blank=True, null=True, help_text="IEC Certificate")
    eou_file = models.FileField(upload_to='vendors/eou/', blank=True, null=True, help_text="EOU Certificate")
    
    # Metadata
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, null=True, help_text="Created by user")
    updated_by = models.CharField(max_length=100, blank=True, null=True, help_text="Updated by user")

    class Meta:
        managed = False
        db_table = 'vendor_master_vendorcreation_tds'
        verbose_name = 'Vendor Master TDS Detail'
        verbose_name_plural = 'Vendor Master TDS Details'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['vendor_basic_detail']),
        ]

    def __str__(self):
        return f"TDS Details for {self.vendor_basic_detail.vendor_name if self.vendor_basic_detail else 'Unknown Vendor'}"


class VendorMasterBanking(models.Model):
    """
    Model for storing Vendor Banking Information.
    This table stores the banking details from the Banking Info form.
    """
    
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    vendor_basic_detail = models.ForeignKey(
        VendorMasterBasicDetail,
        on_delete=models.CASCADE,
        related_name='banking_details',
        null=True,
        blank=True,
        help_text="Link to vendor basic details"
    )
    
    # Bank Account Information
    bank_account_no = models.CharField(max_length=50, help_text="Bank Account Number")
    bank_name = models.CharField(max_length=200, help_text="Bank Name")
    ifsc_code = models.CharField(max_length=11, help_text="IFSC Code")
    branch_name = models.CharField(max_length=200, blank=True, null=True, help_text="Branch Name")
    swift_code = models.CharField(max_length=11, blank=True, null=True, help_text="SWIFT Code (for international transactions)")
    
    # Vendor Branch Association
    vendor_branch = models.CharField(max_length=200, blank=True, null=True, help_text="Associate to a vendor branch")
    
    # Account Type
    ACCOUNT_TYPE_CHOICES = [
        ('savings', 'Savings'),
        ('current', 'Current'),
        ('cash_credit', 'Cash Credit'),
        ('overdraft', 'Overdraft'),
    ]
    account_type = models.CharField(
        max_length=20,
        choices=ACCOUNT_TYPE_CHOICES,
        default='current',
        help_text="Type of bank account"
    )
    
    # Metadata
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, null=True, help_text="Created by user")
    updated_by = models.CharField(max_length=100, blank=True, null=True, help_text="Updated by user")

    class Meta:
        managed = False
        db_table = 'vendor_master_vendorcreation_banking'
        verbose_name = 'Vendor Master Banking Detail'
        verbose_name_plural = 'Vendor Master Banking Details'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['vendor_basic_detail']),
            models.Index(fields=['bank_account_no']),
        ]

    def __str__(self):
        return f"Banking Details for {self.vendor_basic_detail.vendor_name if self.vendor_basic_detail else 'Unknown Vendor'} - {self.bank_name}"


class VendorMasterTerms(models.Model):
    """
    Model for storing Vendor Terms & Conditions.
    This table stores the terms and conditions from the Terms & Conditions form.
    """
    
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    vendor_basic_detail = models.ForeignKey(
        VendorMasterBasicDetail,
        on_delete=models.CASCADE,
        related_name='terms_conditions',
        null=True,
        blank=True,
        help_text="Link to vendor basic details"
    )
    
    # Terms and Conditions Fields
    credit_limit = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True, help_text="Credit limit amount")
    credit_period = models.CharField(max_length=100, blank=True, null=True, help_text="Credit period (e.g., 30 days, 60 days)")
    credit_terms = models.TextField(blank=True, null=True, help_text="Credit terms and conditions")
    penalty_terms = models.TextField(blank=True, null=True, help_text="Penalty terms for late payments or breaches")
    delivery_terms = models.TextField(blank=True, null=True, help_text="Delivery terms, lead time, shipping conditions")
    warranty_guarantee_details = models.TextField(blank=True, null=True, help_text="Warranty and guarantee terms")
    force_majeure = models.TextField(blank=True, null=True, help_text="Force majeure clauses")
    dispute_redressal_terms = models.TextField(blank=True, null=True, help_text="Dispute resolution and redressal terms")
    
    # Metadata
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, null=True, help_text="Created by user")
    updated_by = models.CharField(max_length=100, blank=True, null=True, help_text="Updated by user")

    class Meta:
        managed = False
        db_table = 'vendor_master_vendorcreation_terms'
        verbose_name = 'Vendor Master Terms & Conditions'
        verbose_name_plural = 'Vendor Master Terms & Conditions'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['vendor_basic_detail']),
        ]

    def __str__(self):
        return f"Terms & Conditions for {self.vendor_basic_detail.vendor_name if self.vendor_basic_detail else 'Unknown Vendor'}"


class VendorTransactionPO(models.Model):
    """
    Model for Vendor Purchase Order Transactions.
    This table stores purchase orders created for vendors.
    """
    
    STATUS_CHOICES = [
        ('Draft', 'Draft'),
        ('Pending Approval', 'Pending Approval'),
        ('Approved', 'Approved'),
        ('Mailed', 'Mailed'),
        ('Closed', 'Closed'),
    ]
    
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    po_number = models.CharField(max_length=50, help_text="Purchase Order Number")
    po_series = models.ForeignKey(
        VendorMasterPOSettings,
        on_delete=models.SET_NULL,
        related_name='purchase_orders',
        null=True,
        blank=True,
        help_text="PO Series configuration"
    )
    vendor_basic_detail = models.ForeignKey(
        VendorMasterBasicDetail,
        on_delete=models.CASCADE,
        related_name='purchase_orders',
        null=True,
        blank=True,
        help_text="Link to vendor basic details"
    )
    
    # Vendor Information (denormalized for performance)
    vendor_name = models.CharField(max_length=200, blank=True, null=True, help_text="Vendor name")
    branch = models.CharField(max_length=200, blank=True, null=True, help_text="Vendor branch")
    
    # Address Information
    address_line1 = models.CharField(max_length=255, blank=True, null=True, help_text="Address Line 1")
    address_line2 = models.CharField(max_length=255, blank=True, null=True, help_text="Address Line 2")
    address_line3 = models.CharField(max_length=255, blank=True, null=True, help_text="Address Line 3")
    city = models.CharField(max_length=100, blank=True, null=True, help_text="City")
    state = models.CharField(max_length=100, blank=True, null=True, help_text="State")
    country = models.CharField(max_length=100, blank=True, null=True, help_text="Country")
    pincode = models.CharField(max_length=20, blank=True, null=True, help_text="Pincode")
    email_address = models.EmailField(max_length=255, blank=True, null=True, help_text="Email Address")
    contract_no = models.CharField(max_length=100, blank=True, null=True, help_text="Contract Number")
    
    # Delivery Information
    receive_by = models.DateField(blank=True, null=True, help_text="Expected receive date")
    receive_at = models.CharField(max_length=200, blank=True, null=True, help_text="Receive at location")
    delivery_terms = models.TextField(blank=True, null=True, help_text="Delivery terms and conditions")
    
    # Financial Summary
    total_taxable_value = models.DecimalField(max_digits=15, decimal_places=2, default=0.00, help_text="Total taxable value")
    total_tax = models.DecimalField(max_digits=15, decimal_places=2, default=0.00, help_text="Total tax amount")
    total_value = models.DecimalField(max_digits=15, decimal_places=2, default=0.00, help_text="Total PO value")
    
    # Status and Metadata
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='Draft', help_text="PO Status")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, null=True, help_text="Created by user")
    updated_by = models.CharField(max_length=100, blank=True, null=True, help_text="Updated by user")

    class Meta:
        managed = False
        db_table = 'vendor_transaction_po'
        verbose_name = 'Vendor Purchase Order'
        verbose_name_plural = 'Vendor Purchase Orders'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['po_number']),
            models.Index(fields=['tenant_id', 'po_number']),
            models.Index(fields=['status']),
        ]
        unique_together = [['tenant_id', 'po_number']]
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.po_number} - {self.vendor_name or 'No Vendor'}"


class VendorTransactionPOItem(models.Model):
    """
    Model for Vendor Purchase Order Line Items.
    This table stores individual items in a purchase order.
    """
    
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    po = models.ForeignKey(
        VendorTransactionPO,
        on_delete=models.CASCADE,
        related_name='items',
        help_text="Link to purchase order"
    )
    
    # Item Information
    item_code = models.CharField(max_length=50, blank=True, null=True, help_text="Item code")
    item_name = models.CharField(max_length=200, blank=True, null=True, help_text="Item name")
    supplier_item_code = models.CharField(max_length=50, blank=True, null=True, help_text="Supplier item code")
    
    # Quantity and Rates
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=0.00, help_text="Quantity")
    uom = models.CharField(max_length=20, blank=True, null=True, help_text="Unit of Measurement")
    negotiated_rate = models.DecimalField(max_digits=15, decimal_places=2, default=0.00, help_text="Negotiated rate")
    final_rate = models.DecimalField(max_digits=15, decimal_places=2, default=0.00, help_text="Final rate")
    
    # Tax and Values
    taxable_value = models.DecimalField(max_digits=15, decimal_places=2, default=0.00, help_text="Taxable value")
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, help_text="GST rate percentage")
    gst_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0.00, help_text="GST amount")
    invoice_value = models.DecimalField(max_digits=15, decimal_places=2, default=0.00, help_text="Total invoice value")
    
    # Metadata
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'vendor_transaction_po_items'
        verbose_name = 'Vendor PO Item'
        verbose_name_plural = 'Vendor PO Items'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['po']),
        ]
        ordering = ['id']

    def __str__(self):
        return f"{self.item_name or 'Item'} - {self.po.po_number}"

