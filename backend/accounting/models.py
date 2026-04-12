from django.db import models # pyre-fixme
from django.utils import timezone # pyre-fixme
from core.models import BaseModel # pyre-fixme

# Import TransactionFile model
from .models_transaction import TransactionFile # pyre-fixme
from .models_voucher_payment import PaymentVoucher, PaymentVoucherItem, VoucherPaymentSingle, VoucherPaymentBulk # pyre-fixme
from .models_voucher_receipt import VoucherReceiptSingle, VoucherReceiptBulk # pyre-fixme
from .models_voucher_expense import VoucherExpense # pyre-fixme
from .models_voucher_contra import VoucherContra # pyre-fixme
from .models_voucher_journal import VoucherJournal # pyre-fixme
from .models_bank_reconciliation import BankStatementTransaction, BankReconciliationLink # pyre-fixme
from .models_voucher_purchase import ( # pyre-fixme
    VoucherPurchaseSupplierDetails, 
    VoucherPurchaseSupplyForeignDetails, 
    VoucherPurchaseSupplyINRDetails,
    VoucherPurchaseDueDetails, 
    VoucherPurchaseTransitDetails
)
from .models_voucher_credit_note import (
    VoucherCreditNoteInvoiceDetails,
    VoucherCreditNoteItemDetails,
    VoucherCreditNoteDueDetails,
    VoucherCreditNoteTransitDetails
)
from .models_voucher_sales import ( # pyre-fixme
    VoucherSalesInvoiceDetails,
    VoucherSalesItems,
    VoucherSalesItemsForeign,
    VoucherSalesPaymentDetails,
    VoucherSalesDispatchDetails,
    VoucherSalesEwayBill
)
from .models_voucher_allocation import VoucherAllocation
from .models_advance_allocation import AdvanceAllocationMap  # noqa: F401  advance consumption tracking
from .models_pending_transaction import PendingTransaction, AllocationLink, VoucherPendingTransaction  # noqa: F401  bill allocation lifecycle


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
    Branch-specific selection of ledgers from the master.
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
    
    # NEW: Proper hierarchy linking
    parent_id = models.ForeignKey('self', on_delete=models.RESTRICT, null=True, blank=True, related_name='subgroups', db_column='parent_id')
    group_type = models.CharField(max_length=50, null=True, blank=True)
    
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
    
    # NEW: Proper group linking
    group_id = models.ForeignKey(MasterLedgerGroup, on_delete=models.RESTRICT, null=True, blank=True, related_name='ledgers', db_column='group_id')
    
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

    # Auto-restored missing columns
    major_group = models.CharField(max_length=255, null=True, blank=True)
    financial_reporting = models.CharField(max_length=255, null=True, blank=True)
    type_of_business = models.CharField(max_length=255, null=True, blank=True)

    class Meta:

        db_table = 'master_ledgers'
        unique_together = ('name', 'tenant_id')

    def __str__(self):
        return f"{self.name} ({self.group})"

# class MasterVoucherConfig(BaseModel):
#     name = models.CharField(max_length=255, default='__NUMBERING__')
#     
#     sales_enable_auto = models.BooleanField(default=True)
#     sales_prefix = models.CharField(max_length=50, null=True, blank=True)
#     sales_suffix = models.CharField(max_length=50, null=True, blank=True)
#     sales_next_number = models.PositiveBigIntegerField(default=1)
#     sales_padding = models.IntegerField(default=4)
#     sales_preview = models.CharField(max_length=255, null=True, blank=True)
#     
#     purchase_enable_auto = models.BooleanField(default=True)
#     purchase_prefix = models.CharField(max_length=50, null=True, blank=True)
#     purchase_suffix = models.CharField(max_length=50, null=True, blank=True)
#     purchase_next_number = models.PositiveBigIntegerField(default=1)
#     purchase_padding = models.IntegerField(default=4)
#     purchase_preview = models.CharField(max_length=255, null=True, blank=True)
# 
#     class Meta:
#         db_table = 'master_voucher_config'
# 
# 
# class VoucherConfiguration(BaseModel):
#     """
#     Voucher numbering configuration for all voucher types.
#     Stores configuration for automatic voucher number generation.
#     """
#     VOUCHER_TYPE_CHOICES = [
#         ('sales', 'Sales'),
#         ('credit-note', 'Credit Note'),
#         ('receipts', 'Receipts'),
#         ('purchases', 'Purchases'),
#         ('debit-note', 'Debit Note'),
#         ('payments', 'Payments'),
#         ('expenses', 'Expenses'),
#         ('journal', 'Journal'),
#         ('contra', 'Contra'),
#     ]
#     
#     # Voucher Type and Name
#     voucher_type = models.CharField(max_length=50, choices=VOUCHER_TYPE_CHOICES)
#     voucher_name = models.CharField(max_length=255)
#     
#     # Automatic Numbering Series
#     enable_auto_numbering = models.BooleanField(default=True)
#     prefix = models.CharField(max_length=50, null=True, blank=True)
#     suffix = models.CharField(max_length=50, null=True, blank=True)
#     start_from = models.PositiveBigIntegerField(default=1)
#     current_number = models.PositiveBigIntegerField(default=1)
#     required_digits = models.IntegerField(default=4)
#     
#     # Sales-specific fields
#     include_from_existing_series_id = models.BigIntegerField(null=True, blank=True)
#     
#     # Status
#     is_active = models.BooleanField(default=True)
#     
#     class Meta:
#         db_table = 'voucher_configurations'
#         unique_together = ('tenant_id', 'voucher_type', 'voucher_name')
#         indexes = [
#             models.Index(fields=['tenant_id', 'voucher_type']),
#         ]
#     
#     def __str__(self):
#         return f"{self.voucher_name} ({self.voucher_type}) - {self.tenant_id}"
#     
#     def get_next_voucher_number(self):
#         """Generate the next voucher number based on configuration."""
#         if not self.enable_auto_numbering:
#             return None
#         
#         # Format the number with padding
#         padded_number = str(self.current_number).zfill(self.required_digits)
#         
#         # Construct the voucher number
#         voucher_number = f"{self.prefix or ''}{padded_number}{self.suffix or ''}"
#         
#         # Increment current_number for next use
#         self.current_number += 1
#         self.save(update_fields=['current_number', 'updated_at'])
#         
#         return voucher_number


class Voucher(BaseModel):
    VOUCHER_TYPES = [
        ('sales', 'Sales'),
        ('purchase', 'Purchase'),
        ('payment', 'Payment'),
        ('receipt', 'Receipt'),
        ('contra', 'Contra'),
        ('journal', 'Journal'),
        ('debit_note', 'Debit Note'),
        ('credit_note', 'Credit Note'),
    ]
    type = models.CharField(max_length=20, choices=VOUCHER_TYPES)
    voucher_number = models.CharField(max_length=50)
    date = models.DateField(default=timezone.now)
    party = models.CharField(max_length=255, null=True, blank=True)
    account = models.CharField(max_length=255, null=True, blank=True, help_text="Payment/Receipt account (Cash/Bank)")
    amount = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    total = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)
    narration = models.TextField(null=True, blank=True)
    source = models.CharField(max_length=100, default='manual', help_text="Source of voucher (e.g., manual, bank_reconciliation)")
    
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
    
    reference_id = models.BigIntegerField(null=True, blank=True, help_text="ID of the source document (Invoice/Order)")
    dummy_force = models.IntegerField(null=True, blank=True)

    # Party IDs for explicit tracking
    ledger_id_val     = models.BigIntegerField(null=True, blank=True)
    party_customer_id = models.BigIntegerField(null=True, blank=True)
    party_vendor_id   = models.BigIntegerField(null=True, blank=True)

    class Meta:

        db_table = 'vouchers'
        unique_together = ('tenant_id', 'type', 'voucher_number')
        ordering = ['-date']
        indexes = [
            models.Index(fields=['type', 'tenant_id', 'date']),
            models.Index(fields=['tenant_id', 'date']),
        ]

class JournalEntry(BaseModel):
    voucher_type = models.CharField(max_length=50)
    voucher_id = models.BigIntegerField()
    voucher_number = models.CharField(max_length=50, null=True, blank=True)
    transaction_date = models.DateField(null=True, blank=True)
    narration = models.TextField(null=True, blank=True)
    
    ledger = models.ForeignKey(
        MasterLedger, 
        on_delete=models.RESTRICT, 
        related_name='journal_entries',
        db_column='ledger_id',
        null=True,
        blank=True
    )
    ledger_name = models.CharField(max_length=255, null=True, blank=True)
    debit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    credit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    # Direct mappings
    customer = models.ForeignKey(
        'customerportal.CustomerMasterCustomerBasicDetails',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        db_column='customer_id'
    )
    vendor = models.ForeignKey(
        'vendors.VendorMasterBasicDetail',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        db_column='vendor_id'
    )
    
    # Party IDs for explicit tracking
    ledger_id_val     = models.BigIntegerField(null=True, blank=True)
    party_customer_id = models.BigIntegerField(null=True, blank=True)
    party_vendor_id   = models.BigIntegerField(null=True, blank=True)
    
    class Meta:

        db_table = 'entries'
        indexes = [
            models.Index(fields=['tenant_id', 'voucher_type', 'voucher_id']),
            models.Index(fields=['tenant_id', 'ledger']),
        ]

    def save(self, *args, **kwargs):
        from customerportal.database import CustomerMasterCustomerBasicDetails
        from vendors.models import VendorMasterBasicDetail
        from django.core.exceptions import ValidationError

        if self.customer and self.vendor:
            raise ValidationError("A journal entry cannot belong to both a customer and a vendor.")

        if not self.customer and not self.vendor and self.ledger_name:
            v_type = (self.voucher_type or '').lower()
            if 'sale' in v_type or 'receipt' in v_type or (self.ledger and self.ledger.group == 'Sundry Debtors'):
                mapped_customer = CustomerMasterCustomerBasicDetails.objects.filter(
                    tenant_id=self.tenant_id, 
                    customer_name=self.ledger_name
                ).first()
                if mapped_customer:
                    self.customer = mapped_customer
            elif 'purchase' in v_type or 'payment' in v_type or (self.ledger and self.ledger.group == 'Sundry Creditors'):
                mapped_vendor = VendorMasterBasicDetail.objects.filter(
                    tenant_id=self.tenant_id, 
                    vendor_name=self.ledger_name
                ).first()
                if mapped_vendor:
                    self.vendor = mapped_vendor

        super().save(*args, **kwargs)


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
            from django.core.exceptions import ValidationError # pyre-fixme
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
    
    # Auto-restored missing columns
    major_group_2 = models.CharField(max_length=255, null=True, blank=True)
    sub_group_3_2 = models.CharField(max_length=255, null=True, blank=True)
    type_of_business_2 = models.CharField(max_length=255, null=True, blank=True)
    sub_group_2_2 = models.CharField(max_length=255, null=True, blank=True)
    financial_reporting_1 = models.CharField(max_length=255, null=True, blank=True)
    sub_group_1_2 = models.CharField(max_length=255, null=True, blank=True)
    type_of_business_1 = models.CharField(max_length=255, null=True, blank=True)
    ledger_2 = models.CharField(max_length=255, null=True, blank=True)
    financial_reporting_2 = models.CharField(max_length=255, null=True, blank=True)

    class Meta:

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

# ============================================================================
# SALES / RECEIPT VOUCHER MODELS
# ============================================================================

# Use the models that match the schema.sql (imported from models_voucher_sales.py)
# ALIASES TO FIX BACKEND ERROR: Mapping Legacy Code to New Schema
from .models_voucher_sales import ( # pyre-fixme
    VoucherSalesInvoiceDetails as SalesVoucher, # Alias SalesVoucher to VoucherSalesInvoiceDetails
    VoucherSalesItems as SalesVoucherItem, # Alias SalesVoucherItem to VoucherSalesItems
    VoucherSalesDispatchDetails,
    VoucherSalesEwayBill,
    VoucherSalesPaymentDetails
)
# COMMENTED OUT LEGACY MODELS TO PREVENT TABLE NOT FOUND ERRORS
# class ReceiptVoucherType(BaseModel): ... (Already commented above aliasing)
# class SalesVoucher(BaseModel): ...
# class SalesVoucherItem(BaseModel): ...
# class SalesVoucherDocument(BaseModel): ... (Not present in schema as separate table)

# Note: The following models are preserved but might need updates if they rely on the above.
# SalesInvoice (Phase 1) - lines 771+ are still there.

# class ReceiptVoucherType(BaseModel):
#     """
#     Master list of Receipt Voucher Types.
#     Source data for Voucher Name dropdown in Sales Voucher creation.
#     """
#     name = models.CharField(max_length=255)
#     code = models.CharField(max_length=50)
#     description = models.TextField(null=True, blank=True)
#     is_active = models.BooleanField(default=True)
#     display_order = models.IntegerField(default=0)
#     
#     class Meta:
#         db_table = 'receipt_voucher_types'
#         unique_together = ('tenant_id', 'code')
#         ordering = ['display_order', 'name']
#     
#     def __str__(self):
#         return f"{self.name} ({self.code})"


# class SalesVoucher(BaseModel):
#     """
#     Sales/Receipt Voucher with strict validation rules.
#     Implements multi-step form workflow with mandatory validations.
#     """
#     # ... (Legacy content removed to use Alias)
#     pass

# class SalesVoucherItem(BaseModel):
#     # ... (Legacy content removed to use Alias)
#     pass

# class SalesVoucherDocument(BaseModel):
#     # ... (Legacy content removed to use Alias)
#     pass


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
        'masters.MasterVoucherReceipts',
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
        from django.core.exceptions import ValidationError # pyre-fixme
        from django.utils import timezone # pyre-fixme
        
        if self.invoice_date and self.invoice_date > timezone.now().date():
            raise ValidationError({
                'invoice_date': 'Future dates not allowed'
            })
