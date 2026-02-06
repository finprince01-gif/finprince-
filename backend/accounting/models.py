from django.db import models
from django.utils import timezone
from core.models import BaseModel

# Import TransactionFile model
from .models_transaction import TransactionFile
from .models_voucher_payment import VoucherPaymentSingle, VoucherPaymentBulk
from .models_voucher_receipt import VoucherReceiptSingle, VoucherReceiptBulk
from .models_voucher_expense import VoucherExpense
from .models_voucher_contra import VoucherContra
from .models_voucher_journal import VoucherJournal
from .models_voucher_purchase import (
    VoucherPurchaseSupplierDetails, 
    VoucherPurchaseSupplyForeignDetails, 
    VoucherPurchaseSupplyINRDetails,
    VoucherPurchaseDueDetails, 
    VoucherPurchaseTransitDetails
)


# ============================================================================
# NEW PRODUCTION COA ARCHITECTURE (ERP Grade)
# ============================================================================

class MasterChartOfAccounts(models.Model):
    """
    Global read-only master hierarchy for Chart of Accounts.
    Standardized across all tenants.
    """
    type_of_business = models.CharField(max_length=255)
    financial_reporting = models.CharField(max_length=255)
    major_group = models.CharField(max_length=255)
    group = models.CharField(max_length=255)
    sub_group_1 = models.CharField(max_length=255, null=True, blank=True)
    sub_group_2 = models.CharField(max_length=255, null=True, blank=True)
    sub_group_3 = models.CharField(max_length=255, null=True, blank=True)
    ledger_name = models.CharField(max_length=255, null=True, blank=True)
    ledger_code = models.CharField(max_length=50, unique=True, null=True, blank=True)
    
    level_depth = models.IntegerField(default=1)
    import_version = models.CharField(max_length=20, default='1.0')
    imported_at = models.DateTimeField(auto_now_add=True)
    
    # helper for UI
    is_leaf = models.BooleanField(default=False)

    class Meta:
        db_table = 'master_chart_of_accounts'
        verbose_name_plural = "Master Chart of Accounts"

    def __str__(self):
        return f"{self.ledger_name} ({self.ledger_code})" if self.ledger_name else self.group

class TenantLedger(BaseModel):
    """
    Tenant-specific selection of ledgers from the master.
    """
    master_ledger = models.ForeignKey(MasterChartOfAccounts, on_delete=models.RESTRICT)
    custom_alias = models.CharField(max_length=255, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'tenant_ledgers'
        unique_together = ('tenant_id', 'master_ledger')

    def __str__(self):
        return self.custom_alias or self.master_ledger.ledger_name

# ============================================================================
# LEGACY MODELS (Maintained for backward compatibility and current registration)
# ============================================================================

class MasterLedgerGroup(BaseModel):
    name = models.CharField(max_length=255)
    parent = models.CharField(max_length=255, null=True, blank=True, help_text="Parent group name")
    
    class Meta:
        db_table = 'master_ledger_groups'
        unique_together = ('name', 'tenant_id')

    def __str__(self):
        return self.name

class MasterLedger(BaseModel):
    REG_TYPE_CHOICES = [
        ('Registered', 'Registered'),
        ('Unregistered', 'Unregistered'),
        ('Composition', 'Composition'),
    ]
    name = models.CharField(max_length=255)
    group = models.CharField(max_length=255, help_text="Ledger group name")
    
    # Hierarchy fields (Migration 0004+)
    category = models.CharField(max_length=255, null=True, blank=True)
    sub_group_1 = models.CharField(max_length=255, null=True, blank=True)
    sub_group_2 = models.CharField(max_length=255, null=True, blank=True)
    sub_group_3 = models.CharField(max_length=255, null=True, blank=True)
    ledger_type = models.CharField(max_length=255, null=True, blank=True)
    
    gstin = models.CharField(max_length=15, null=True, blank=True)
    registration_type = models.CharField(max_length=20, choices=REG_TYPE_CHOICES, null=True, blank=True)
    state = models.CharField(max_length=100, null=True, blank=True)
    
    extended_data = models.JSONField(
        null=True, 
        blank=True, 
        help_text="Group-specific fields (e.g., cashLocation, loanAccountNumber)"
    )
    
    # Parent ledger for nested custom ledgers
    parent_ledger_id = models.IntegerField(
        null=True,
        blank=True,
        help_text="ID of parent custom ledger for nested structure"
    )
    
    # Auto-assigned ledger code based on hierarchy
    code = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        unique=True,
        db_column='ledger_code',
        help_text="Auto-generated code based on hierarchy position"
    )
    
    # Dynamic question answers (NEW FIELD for questions system)
    additional_data = models.JSONField(
        null=True,
        blank=True,
        help_text="Stores answers to dynamic questions (e.g., opening balance, GSTIN, credit limit)"
    )

    class Meta:
        db_table = 'master_ledgers'
        unique_together = ('name', 'tenant_id')

    def __str__(self):
        return f"{self.name} ({self.group})"

class MasterVoucherConfig(BaseModel):
    name = models.CharField(max_length=255, default='__NUMBERING__')
    
    sales_enable_auto = models.BooleanField(default=True)
    sales_prefix = models.CharField(max_length=50, null=True, blank=True)
    sales_suffix = models.CharField(max_length=50, null=True, blank=True)
    sales_next_number = models.PositiveBigIntegerField(default=1)
    sales_padding = models.IntegerField(default=4)
    sales_preview = models.CharField(max_length=255, null=True, blank=True)
    
    purchase_enable_auto = models.BooleanField(default=True)
    purchase_prefix = models.CharField(max_length=50, null=True, blank=True)
    purchase_suffix = models.CharField(max_length=50, null=True, blank=True)
    purchase_next_number = models.PositiveBigIntegerField(default=1)
    purchase_padding = models.IntegerField(default=4)
    purchase_preview = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = 'master_voucher_config'


class VoucherConfiguration(BaseModel):
    """
    Voucher numbering configuration for all voucher types.
    Stores configuration for automatic voucher number generation.
    """
    VOUCHER_TYPE_CHOICES = [
        ('sales', 'Sales'),
        ('credit-note', 'Credit Note'),
        ('receipts', 'Receipts'),
        ('purchases', 'Purchases'),
        ('debit-note', 'Debit Note'),
        ('payments', 'Payments'),
        ('expenses', 'Expenses'),
        ('journal', 'Journal'),
        ('contra', 'Contra'),
    ]
    
    # Voucher Type and Name
    voucher_type = models.CharField(max_length=50, choices=VOUCHER_TYPE_CHOICES)
    voucher_name = models.CharField(max_length=255)
    
    # Automatic Numbering Series
    enable_auto_numbering = models.BooleanField(default=True)
    prefix = models.CharField(max_length=50, null=True, blank=True)
    suffix = models.CharField(max_length=50, null=True, blank=True)
    start_from = models.PositiveBigIntegerField(default=1)
    current_number = models.PositiveBigIntegerField(default=1)
    required_digits = models.IntegerField(default=4)
    
    # Sales-specific fields
    include_from_existing_series_id = models.BigIntegerField(null=True, blank=True)
    
    # Status
    is_active = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'voucher_configurations'
        unique_together = ('tenant_id', 'voucher_type', 'voucher_name')
        indexes = [
            models.Index(fields=['tenant_id', 'voucher_type']),
        ]
    
    def __str__(self):
        return f"{self.voucher_name} ({self.voucher_type}) - {self.tenant_id}"
    
    def get_next_voucher_number(self):
        """Generate the next voucher number based on configuration."""
        if not self.enable_auto_numbering:
            return None
        
        # Format the number with padding
        padded_number = str(self.current_number).zfill(self.required_digits)
        
        # Construct the voucher number
        voucher_number = f"{self.prefix or ''}{padded_number}{self.suffix or ''}"
        
        # Increment current_number for next use
        self.current_number += 1
        self.save(update_fields=['current_number', 'updated_at'])
        
        return voucher_number


class Voucher(BaseModel):
    VOUCHER_TYPES = [
        ('sales', 'Sales'),
        ('purchase', 'Purchase'),
        ('payment', 'Payment'),
        ('receipt', 'Receipt'),
        ('contra', 'Contra'),
        ('journal', 'Journal'),
    ]
    type = models.CharField(max_length=20, choices=VOUCHER_TYPES)
    voucher_number = models.CharField(max_length=50)
    date = models.DateField(default=timezone.now)
    party = models.CharField(max_length=255, null=True, blank=True)
    account = models.CharField(max_length=255, null=True, blank=True, help_text="Payment/Receipt account (Cash/Bank)")
    amount = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    total = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)
    narration = models.TextField(null=True, blank=True)
    
    # Sales/Purchase specific
    invoice_no = models.CharField(max_length=50, null=True, blank=True)
    is_inter_state = models.BooleanField(default=False, null=True, blank=True)
    total_taxable_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)
    total_cgst = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)
    total_sgst = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)
    total_igst = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)
    
    # Journal/Unified fields
    total_debit = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)
    total_credit = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)
    
    # Contra specific
    from_account = models.CharField(max_length=255, null=True, blank=True)
    to_account = models.CharField(max_length=255, null=True, blank=True)
    
    items_data = models.JSONField(null=True, blank=True, help_text="Line items with qty, rate, etc")
    dummy_force = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = 'vouchers'
        unique_together = ('voucher_number', 'tenant_id', 'type')
        ordering = ['-date']
        indexes = [
            models.Index(fields=['type', 'tenant_id', 'date']),
            models.Index(fields=['tenant_id', 'date']),
        ]

class JournalEntry(BaseModel):
    voucher = models.ForeignKey(Voucher, on_delete=models.CASCADE, related_name='journal_entries')
    ledger = models.CharField(max_length=255)
    debit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    credit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    class Meta:
        db_table = 'journal_entries'
        indexes = [
            models.Index(fields=['voucher', 'tenant_id']),
        ]


class AmountTransaction(BaseModel):
    """
    Stores transaction amounts for Cash and Bank ledgers from Asset category.
    Tracks opening balances and transaction history with separate debit/credit columns.
    """
    TRANSACTION_TYPE_CHOICES = [
        ('opening_balance', 'Opening Balance'),
        ('transaction', 'Transaction'),
    ]
    
    # Ledger Reference
    ledger = models.ForeignKey(
        MasterLedger, 
        on_delete=models.CASCADE,
        related_name='amount_transactions',
        help_text="Reference to the Cash/Bank ledger"
    )
    
    # Ledger Name (denormalized for quick access)
    ledger_name = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Ledger name (e.g., 'bank2', 'Cash', 'HDFC Bank')"
    )
    
    # Sub Group 1 (Parent category like Current Assets)
    sub_group_1 = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Sub group 1 from ledger (e.g., 'Current Assets')"
    )
    
    # Ledger Code
    code = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        help_text="Ledger code from master_ledgers table"
    )
    
    # Transaction Details
    transaction_date = models.DateField(help_text="Date of transaction")
    transaction_type = models.CharField(
        max_length=20, 
        choices=TRANSACTION_TYPE_CHOICES,
        default='transaction',
        help_text="Type of transaction"
    )
    
    # Debit and Credit Columns
    debit = models.DecimalField(
        max_digits=15, 
        decimal_places=2,
        default=0,
        help_text="Debit amount (money coming in)"
    )
    credit = models.DecimalField(
        max_digits=15, 
        decimal_places=2,
        default=0,
        help_text="Credit amount (money going out)"
    )
    
    # Optional Voucher Reference
    voucher = models.ForeignKey(
        Voucher,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='amount_transactions',
        help_text="Reference to voucher if transaction is from a voucher"
    )
    
    # Balance Tracking
    balance = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        help_text="Running balance after this transaction"
    )
    
    # Description
    narration = models.TextField(
        null=True,
        blank=True,
        help_text="Transaction description or narration"
    )
    
    class Meta:
        db_table = 'amount_transactions'
        ordering = ['-transaction_date', '-created_at']
        indexes = [
            models.Index(fields=['tenant_id', 'ledger', 'transaction_date']),
            models.Index(fields=['tenant_id', 'transaction_type']),
            models.Index(fields=['transaction_date']),
        ]

    def clean(self):
        """
        Strict validation: Only allow ledgers from specific hierarchy.
        Assets -> Cash and Bank Balances -> Cash or Bank
        """
        if not self.ledger:
            return
            
        # Helper to safely get field values
        def match(val, expected):
            return str(val).lower().strip() == expected

        is_valid = False
        
        # Check Category
        if self.ledger.category and str(self.ledger.category).lower().strip() in ['asset', 'assets']:
            # Check Group
            if self.ledger.group and match(self.ledger.group, 'cash and bank balances'):
                # Check Sub Group 1
                if self.ledger.sub_group_1:
                    sg1 = str(self.ledger.sub_group_1).lower().strip()
                    if sg1 in ['cash', 'bank']:
                        is_valid = True
        
        if not is_valid:
            from django.core.exceptions import ValidationError
            raise ValidationError({
                'ledger_name': f"Invalid Ledger '{self.ledger.name}'. Transactions allowed only for 'Assets -> Cash and Bank Balances -> Cash or Bank'."
            })

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.ledger.name} - Dr:{self.debit} Cr:{self.credit} - {self.transaction_date}"

class MasterHierarchyRaw(models.Model):
    """
    Global hierarchy data (unmanaged, maps to existing table).
    This represents the complete COA from the original project source.
    """
    # Explicitly adding ID as requested in previous sessions
    id = models.AutoField(primary_key=True)
    
    # Column names match the actual database schema (snake_case)
    major_group_1 = models.TextField(db_column='major_group_1', null=True, blank=True)
    group_1 = models.TextField(db_column='group_1', null=True, blank=True)
    sub_group_1_1 = models.TextField(db_column='sub_group_1_1', null=True, blank=True)
    sub_group_2_1 = models.TextField(db_column='sub_group_2_1', null=True, blank=True)
    sub_group_3_1 = models.TextField(db_column='sub_group_3_1', null=True, blank=True)
    ledger_1 = models.TextField(db_column='ledger_1', null=True, blank=True)
    code = models.TextField(db_column='code', null=True, blank=True)
    
    class Meta:
        managed = False
        db_table = 'master_hierarchy_raw'
class ExtractedInvoice(BaseModel):
    """
    Stores data extracted from invoices via OCR.
    Supports 109 fields mapping to the Excel export specification.
    """
    # General Details
    voucher_date = models.CharField(max_length=20, null=True, blank=True)
    invoice_number = models.CharField(max_length=100, null=True, blank=True)
    po_number = models.CharField(max_length=100, null=True, blank=True)
    po_date = models.CharField(max_length=20, null=True, blank=True)
    
    # Supplier Details
    supplier_name = models.CharField(max_length=255, null=True, blank=True)
    bill_from_address = models.TextField(null=True, blank=True)
    ship_from_address = models.TextField(null=True, blank=True)
    email = models.CharField(max_length=255, null=True, blank=True)
    phone = models.CharField(max_length=100, null=True, blank=True)
    sales_person = models.CharField(max_length=255, null=True, blank=True)
    gstin = models.CharField(max_length=15, null=True, blank=True)
    pan = models.CharField(max_length=10, null=True, blank=True)
    msme_number = models.CharField(max_length=50, null=True, blank=True)
    payment_terms = models.CharField(max_length=255, null=True, blank=True)
    delivery_terms = models.CharField(max_length=255, null=True, blank=True)
    
    # Ledger Details
    ledger_amount = models.CharField(max_length=50, null=True, blank=True)
    ledger_rate = models.CharField(max_length=50, null=True, blank=True)
    ledger_dr_cr = models.CharField(max_length=10, null=True, blank=True, db_column='ledger_amount_dr_cr')
    ledger_narration = models.TextField(null=True, blank=True)
    ledger_description = models.TextField(null=True, blank=True, db_column='description_of_ledger')
    tax_payment_type = models.CharField(max_length=100, null=True, blank=True, db_column='type_of_tax_payment')
    
    # Item Details
    item_code = models.CharField(max_length=100, null=True, blank=True)
    item_description = models.TextField(null=True, blank=True, db_column='item_description')
    quantity = models.CharField(max_length=50, null=True, blank=True)
    uom = models.CharField(max_length=50, null=True, blank=True, db_column='quantity_uom')
    item_rate = models.CharField(max_length=50, null=True, blank=True)
    discount_pct = models.CharField(max_length=50, null=True, blank=True, db_column='disc_pct')
    item_amount = models.CharField(max_length=50, null=True, blank=True)
    marks = models.CharField(max_length=255, null=True, blank=True)
    num_packages = models.CharField(max_length=50, null=True, blank=True, db_column='no_of_packages')
    freight_charges = models.CharField(max_length=50, null=True, blank=True)
    
    # HSN/SAC
    hsn_sac = models.CharField(max_length=20, null=True, blank=True, db_column='hsn_sac_details')
    
    # GST Details
    gst_rate = models.CharField(max_length=50, null=True, blank=True)
    igst_amount = models.CharField(max_length=50, null=True, blank=True)
    cgst_amount = models.CharField(max_length=50, null=True, blank=True)
    sgst_amount = models.CharField(max_length=50, null=True, blank=True, db_column='sgst_utgst_amount')
    cess_rate = models.CharField(max_length=50, null=True, blank=True)
    cess_amount = models.CharField(max_length=50, null=True, blank=True)
    state_cess_rate = models.CharField(max_length=50, null=True, blank=True)
    state_cess_amount = models.CharField(max_length=50, null=True, blank=True)
    reverse_charge = models.CharField(max_length=10, null=True, blank=True, db_column='applicable_for_reverse_charge')
    taxable_value = models.CharField(max_length=50, null=True, blank=True)
    invoice_value = models.CharField(max_length=50, null=True, blank=True)
    
    # Flexible Storage for all 109 fields
    additional_fields = models.JSONField(null=True, blank=True, help_text="Stores the remaining 60+ fields dynamically")

    class Meta:
        db_table = 'extracted_invoices'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.invoice_number} - {self.supplier_name}"

# ============================================================================
# SALES / RECEIPT VOUCHER MODELS
# ============================================================================

class ReceiptVoucherType(BaseModel):
    """
    Master list of Receipt Voucher Types.
    Source data for Voucher Name dropdown in Sales Voucher creation.
    """
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50)
    description = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    display_order = models.IntegerField(default=0)
    
    class Meta:
        db_table = 'receipt_voucher_types'
        unique_together = ('tenant_id', 'code')
        ordering = ['display_order', 'name']
    
    def __str__(self):
        return f"{self.name} ({self.code})"


class SalesVoucher(BaseModel):
    """
    Sales/Receipt Voucher with strict validation rules.
    Implements multi-step form workflow with mandatory validations.
    """
    TAX_TYPE_CHOICES = [
        ('within_state', 'Within State'),
        ('other_state', 'Other State'),
        ('export', 'Export'),
    ]
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    # Header Section - Invoice Details Tab
    date = models.DateField(help_text="Must be today or past date, no future dates allowed")
    voucher_type = models.ForeignKey(
        ReceiptVoucherType, 
        on_delete=models.PROTECT,
        help_text="From master list of Receipt Voucher Types"
    )
    sales_invoice_number = models.CharField(
        max_length=50, 
        help_text="Auto-generated, sequential, read-only"
    )
    voucher_name = models.CharField(max_length=100, null=True, blank=True)
    outward_slip_no = models.CharField(max_length=50, null=True, blank=True)

    customer = models.ForeignKey(
        MasterLedger, 
        on_delete=models.PROTECT, 
        related_name='sales_vouchers',
        help_text="Customer from Customer Module"
    )
    
    # Address Fields (Auto-fetched from Customer Module)
    bill_to_address = models.TextField(help_text="Auto-fetched, read-only")
    bill_to_gstin = models.CharField(max_length=15, null=True, blank=True)
    bill_to_contact = models.CharField(max_length=255, null=True, blank=True)
    bill_to_state = models.CharField(max_length=100, null=True, blank=True)
    bill_to_country = models.CharField(max_length=100, default='India')
    
    ship_to_address = models.TextField(help_text="Auto-fetched, editable, does not update customer master")
    ship_to_state = models.CharField(max_length=100, null=True, blank=True)
    ship_to_country = models.CharField(max_length=100, default='India')
    
    # Tax Type (Auto-determined based on address logic, not manually editable)
    tax_type = models.CharField(
        max_length=20, 
        choices=TAX_TYPE_CHOICES,
        help_text="Auto-determined: Within State if User State = Bill To State, Other State if different states in India, Export if Bill To Country != India"
    )
    
    # GST-Compliant Fields for GSTR1
    place_of_supply = models.CharField(
        max_length=2,
        null=True,
        blank=True,
        help_text="State code (01-38) for Place of Supply as per GST"
    )
    reverse_charge = models.CharField(
        max_length=1,
        default='N',
        help_text="Y or N - Reverse charge applicable"
    )
    invoice_type = models.CharField(
        max_length=50,
        default='Regular',
        help_text="Regular, SEZ with payment, SEZ without payment, Deemed Export"
    )
    export_type = models.CharField(
        max_length=10,
        null=True,
        blank=True,
        help_text="WPAY (With Payment) or WOPAY (Without Payment) for exports"
    )
    port_code = models.CharField(
        max_length=6,
        null=True,
        blank=True,
        help_text="6-digit port code for exports (e.g., INBLR1)"
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
        help_text="GSTIN of e-commerce operator if applicable"
    )
    
    # Workflow tracking
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    current_step = models.IntegerField(default=1, help_text="Track which tab user is on (1-5)")
    
    # Totals (calculated from items)
    total_taxable_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_cgst = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_sgst = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_igst = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    # Additional fields for other tabs (to be populated in later steps)
    payment_details = models.JSONField(null=True, blank=True, help_text="Payment Details tab data")
    dispatch_details = models.JSONField(null=True, blank=True, help_text="Dispatch Details tab data")
    einvoice_details = models.JSONField(null=True, blank=True, help_text="E-Invoice & E-way Bill Details tab data")
    
    class Meta:
        db_table = 'sales_vouchers'
        unique_together = ('tenant_id', 'sales_invoice_number')
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['tenant_id', 'date']),
            models.Index(fields=['sales_invoice_number']),
            models.Index(fields=['customer', 'tenant_id']),
        ]
    
    def __str__(self):
        return f"{self.sales_invoice_number} - {self.customer.name}"
    
    def clean(self):
        """Validate that date is not in future"""
        from django.core.exceptions import ValidationError
        from django.utils import timezone
        
        if self.date and self.date > timezone.now().date():
            raise ValidationError({
                'date': 'Future dates are not allowed. Date must be today or a past date.'
            })


class SalesVoucherItem(BaseModel):
    """
    Line items for sales voucher (Items & Tax Details tab).
    Stores item details with tax calculations.
    """
    sales_voucher = models.ForeignKey(
        SalesVoucher, 
        on_delete=models.CASCADE, 
        related_name='items'
    )
    
    # Item Details
    item_name = models.CharField(max_length=255)
    hsn_code = models.CharField(max_length=20, null=True, blank=True)
    quantity = models.DecimalField(max_digits=15, decimal_places=3)
    unit = models.CharField(max_length=50, null=True, blank=True)
    rate = models.DecimalField(max_digits=15, decimal_places=2)
    
    # Tax Calculations
    taxable_amount = models.DecimalField(max_digits=15, decimal_places=2)
    cgst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    cgst_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    sgst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    sgst_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    igst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    igst_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=15, decimal_places=2)
    
    # Line item order
    line_number = models.IntegerField(default=1)
    
    class Meta:
        db_table = 'sales_voucher_items'
        ordering = ['line_number']
        indexes = [
            models.Index(fields=['sales_voucher', 'tenant_id']),
        ]
    
    def __str__(self):
        return f"{self.item_name} - {self.quantity} x {self.rate}"


class SalesVoucherDocument(BaseModel):
    """
    Supporting documents for sales voucher.
    Allowed formats: JPG, JPEG, PDF only.
    Multiple uploads allowed.
    """
    ALLOWED_FILE_TYPES = ['jpg', 'jpeg', 'pdf']
    
    sales_voucher = models.ForeignKey(
        SalesVoucher, 
        on_delete=models.CASCADE, 
        related_name='documents'
    )
    
    file_name = models.CharField(max_length=255)
    file_path = models.CharField(max_length=500)
    file_type = models.CharField(max_length=10, help_text="jpg, jpeg, or pdf only")
    file_size = models.IntegerField(help_text="File size in bytes")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'sales_voucher_documents'
        ordering = ['uploaded_at']
        indexes = [
            models.Index(fields=['sales_voucher', 'tenant_id']),
        ]
    
    def __str__(self):
        return f"{self.file_name} ({self.file_type})"
    
    def clean(self):
        """Validate file type"""
        from django.core.exceptions import ValidationError
        
        if self.file_type and self.file_type.lower() not in self.ALLOWED_FILE_TYPES:
            raise ValidationError({
                'file_type': f'Only {", ".join(self.ALLOWED_FILE_TYPES).upper()} files are allowed.'
            })


# ============================================================================
# SALES INVOICE MODEL (NEW - Phase 1: Invoice Details Only)
# ============================================================================

class SalesInvoice(BaseModel):
    """
    Sales Invoice - Invoice Details Only (Phase 1)
    Separate from SalesVoucher for cleaner architecture.
    """
    TAX_TYPE_CHOICES = [
        ('within_state', 'Within State'),
        ('other_state', 'Other State'),
        ('export', 'Export'),
    ]
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    # Invoice Header
    invoice_number = models.CharField(
        max_length=50,
        help_text="Auto-generated, sequential"
    )
    invoice_date = models.DateField(
        help_text="Must be today or past date"
    )
    
    # Voucher Type
    voucher_type = models.ForeignKey(
        ReceiptVoucherType,
        on_delete=models.PROTECT,
        related_name='sales_invoices',
        help_text="Sales voucher type"
    )
    
    # Customer
    customer = models.ForeignKey(
        MasterLedger,
        on_delete=models.PROTECT,
        related_name='invoices',
        help_text="Customer from ledgers"
    )
    
    # Billing Address (Auto-fetched from customer)
    bill_to_address = models.TextField(
        help_text="Auto-fetched from customer"
    )
    bill_to_gstin = models.CharField(
        max_length=15,
        null=True,
        blank=True
    )
    bill_to_contact = models.CharField(
        max_length=255,
        null=True,
        blank=True
    )
    bill_to_state = models.CharField(
        max_length=100,
        null=True,
        blank=True
    )
    bill_to_country = models.CharField(
        max_length=100,
        default='India'
    )
    
    # Shipping Address (Editable)
    ship_to_address = models.TextField(
        help_text="Auto-fetched but editable"
    )
    ship_to_state = models.CharField(
        max_length=100,
        null=True,
        blank=True
    )
    ship_to_country = models.CharField(
        max_length=100,
        default='India'
    )
    
    # Tax Type (Auto-determined)
    tax_type = models.CharField(
        max_length=20,
        choices=TAX_TYPE_CHOICES,
        help_text="Auto-determined from addresses"
    )
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft'
    )
    current_step = models.IntegerField(
        default=1,
        help_text="Current workflow step (1-5)"
    )
    
    class Meta:
        db_table = 'sales_invoices'
        unique_together = ('tenant_id', 'invoice_number')
        ordering = ['-invoice_date', '-created_at']
        indexes = [
            models.Index(fields=['tenant_id', 'invoice_date']),
            models.Index(fields=['customer', 'tenant_id']),
            models.Index(fields=['voucher_type']),
        ]
    
    def __str__(self):
        return f"{self.invoice_number} - {self.customer.name}"
    
    def clean(self):
        """Validate invoice date"""
        from django.core.exceptions import ValidationError
        from django.utils import timezone
        
        if self.invoice_date and self.invoice_date > timezone.now().date():
            raise ValidationError({
                'invoice_date': 'Future dates not allowed'
            })
"""
Django Models for Separate Voucher Master Tables
Each voucher type has its own dedicated table
"""
from django.db import models


class MasterVoucherSales(models.Model):
    """Sales Voucher Master"""
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    voucher_name = models.CharField(max_length=100, help_text="Voucher name")
    prefix = models.CharField(max_length=20, blank=True, null=True, help_text="Prefix for voucher number")
    suffix = models.CharField(max_length=20, blank=True, null=True, help_text="Suffix for voucher number")
    start_from = models.IntegerField(default=1, help_text="Starting number")
    current_number = models.IntegerField(default=1, help_text="Current number in sequence")
    required_digits = models.IntegerField(default=4, help_text="Number of digits for padding")
    enable_auto_numbering = models.BooleanField(default=True, help_text="Enable automatic numbering")
    include_from_existing_series = models.CharField(max_length=200, blank=True, null=True, help_text="Include from existing series")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = 'master_voucher_sales'
        verbose_name = 'Sales Voucher Master'
        verbose_name_plural = 'Sales Voucher Masters'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['voucher_name']),
        ]


class MasterVoucherCreditNote(models.Model):
    """Credit Note Voucher Master"""
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    voucher_name = models.CharField(max_length=100, help_text="Voucher name")
    prefix = models.CharField(max_length=20, blank=True, null=True, help_text="Prefix for voucher number")
    suffix = models.CharField(max_length=20, blank=True, null=True, help_text="Suffix for voucher number")
    start_from = models.IntegerField(default=1, help_text="Starting number")
    current_number = models.IntegerField(default=1, help_text="Current number in sequence")
    required_digits = models.IntegerField(default=4, help_text="Number of digits for padding")
    enable_auto_numbering = models.BooleanField(default=True, help_text="Enable automatic numbering")
    include_from_existing_series = models.CharField(max_length=200, blank=True, null=True, help_text="Include from existing series")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = 'master_voucher_creditnote'
        verbose_name = 'Credit Note Voucher Master'
        verbose_name_plural = 'Credit Note Voucher Masters'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['voucher_name']),
        ]


class MasterVoucherReceipts(models.Model):
    """Receipts Voucher Master"""
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    voucher_name = models.CharField(max_length=100, help_text="Voucher name")
    prefix = models.CharField(max_length=20, blank=True, null=True, help_text="Prefix for voucher number")
    suffix = models.CharField(max_length=20, blank=True, null=True, help_text="Suffix for voucher number")
    start_from = models.IntegerField(default=1, help_text="Starting number")
    current_number = models.IntegerField(default=1, help_text="Current number in sequence")
    required_digits = models.IntegerField(default=4, help_text="Number of digits for padding")
    enable_auto_numbering = models.BooleanField(default=True, help_text="Enable automatic numbering")
    include_from_existing_series = models.CharField(max_length=200, blank=True, null=True, help_text="Include from existing series")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = 'master_voucher_receipts'
        verbose_name = 'Receipts Voucher Master'
        verbose_name_plural = 'Receipts Voucher Masters'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['voucher_name']),
        ]


class MasterVoucherPurchases(models.Model):
    """Purchases Voucher Master"""
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    voucher_name = models.CharField(max_length=100, help_text="Voucher name")
    prefix = models.CharField(max_length=20, blank=True, null=True, help_text="Prefix for voucher number")
    suffix = models.CharField(max_length=20, blank=True, null=True, help_text="Suffix for voucher number")
    start_from = models.IntegerField(default=1, help_text="Starting number")
    current_number = models.IntegerField(default=1, help_text="Current number in sequence")
    required_digits = models.IntegerField(default=4, help_text="Number of digits for padding")
    enable_auto_numbering = models.BooleanField(default=True, help_text="Enable automatic numbering")
    include_from_existing_series = models.CharField(max_length=200, blank=True, null=True, help_text="Include from existing series")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = 'master_voucher_purchases'
        verbose_name = 'Purchases Voucher Master'
        verbose_name_plural = 'Purchases Voucher Masters'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['voucher_name']),
        ]


class MasterVoucherDebitNote(models.Model):
    """Debit Note Voucher Master"""
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    voucher_name = models.CharField(max_length=100, help_text="Voucher name")
    prefix = models.CharField(max_length=20, blank=True, null=True, help_text="Prefix for voucher number")
    suffix = models.CharField(max_length=20, blank=True, null=True, help_text="Suffix for voucher number")
    start_from = models.IntegerField(default=1, help_text="Starting number")
    current_number = models.IntegerField(default=1, help_text="Current number in sequence")
    required_digits = models.IntegerField(default=4, help_text="Number of digits for padding")
    enable_auto_numbering = models.BooleanField(default=True, help_text="Enable automatic numbering")
    include_from_existing_series = models.CharField(max_length=200, blank=True, null=True, help_text="Include from existing series")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = 'master_voucher_debitnote'
        verbose_name = 'Debit Note Voucher Master'
        verbose_name_plural = 'Debit Note Voucher Masters'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['voucher_name']),
        ]


class MasterVoucherPayments(models.Model):
    """Payments Voucher Master"""
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    voucher_name = models.CharField(max_length=100, help_text="Voucher name")
    prefix = models.CharField(max_length=20, blank=True, null=True, help_text="Prefix for voucher number")
    suffix = models.CharField(max_length=20, blank=True, null=True, help_text="Suffix for voucher number")
    start_from = models.IntegerField(default=1, help_text="Starting number")
    current_number = models.IntegerField(default=1, help_text="Current number in sequence")
    required_digits = models.IntegerField(default=4, help_text="Number of digits for padding")
    enable_auto_numbering = models.BooleanField(default=True, help_text="Enable automatic numbering")
    include_from_existing_series = models.CharField(max_length=200, blank=True, null=True, help_text="Include from existing series")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = 'master_voucher_payments'
        verbose_name = 'Payments Voucher Master'
        verbose_name_plural = 'Payments Voucher Masters'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['voucher_name']),
        ]


class MasterVoucherExpenses(models.Model):
    """Expenses Voucher Master"""
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    voucher_name = models.CharField(max_length=100, help_text="Voucher name")
    prefix = models.CharField(max_length=20, blank=True, null=True, help_text="Prefix for voucher number")
    suffix = models.CharField(max_length=20, blank=True, null=True, help_text="Suffix for voucher number")
    start_from = models.IntegerField(default=1, help_text="Starting number")
    current_number = models.IntegerField(default=1, help_text="Current number in sequence")
    required_digits = models.IntegerField(default=4, help_text="Number of digits for padding")
    enable_auto_numbering = models.BooleanField(default=True, help_text="Enable automatic numbering")
    include_from_existing_series = models.CharField(max_length=200, blank=True, null=True, help_text="Include from existing series")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = 'master_voucher_expenses'
        verbose_name = 'Expenses Voucher Master'
        verbose_name_plural = 'Expenses Voucher Masters'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['voucher_name']),
        ]


class MasterVoucherJournal(models.Model):
    """Journal Voucher Master"""
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    voucher_name = models.CharField(max_length=100, help_text="Voucher name")
    prefix = models.CharField(max_length=20, blank=True, null=True, help_text="Prefix for voucher number")
    suffix = models.CharField(max_length=20, blank=True, null=True, help_text="Suffix for voucher number")
    start_from = models.IntegerField(default=1, help_text="Starting number")
    current_number = models.IntegerField(default=1, help_text="Current number in sequence")
    required_digits = models.IntegerField(default=4, help_text="Number of digits for padding")
    enable_auto_numbering = models.BooleanField(default=True, help_text="Enable automatic numbering")
    include_from_existing_series = models.CharField(max_length=200, blank=True, null=True, help_text="Include from existing series")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = 'master_voucher_journal'
        verbose_name = 'Journal Voucher Master'
        verbose_name_plural = 'Journal Voucher Masters'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['voucher_name']),
        ]


class MasterVoucherContra(models.Model):
    """Contra Voucher Master"""
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    voucher_name = models.CharField(max_length=100, help_text="Voucher name")
    prefix = models.CharField(max_length=20, blank=True, null=True, help_text="Prefix for voucher number")
    suffix = models.CharField(max_length=20, blank=True, null=True, help_text="Suffix for voucher number")
    start_from = models.IntegerField(default=1, help_text="Starting number")
    current_number = models.IntegerField(default=1, help_text="Current number in sequence")
    required_digits = models.IntegerField(default=4, help_text="Number of digits for padding")
    enable_auto_numbering = models.BooleanField(default=True, help_text="Enable automatic numbering")
    include_from_existing_series = models.CharField(max_length=200, blank=True, null=True, help_text="Include from existing series")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = 'master_voucher_contra'
        verbose_name = 'Contra Voucher Master'
        verbose_name_plural = 'Contra Voucher Masters'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['voucher_name']),
        ]

from .models_voucher_sales import *
from .models_voucher_payment import *
