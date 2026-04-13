"""
Customer Portal Database Models
Defines all database tables and relationships for customer portal
"""
from django.db import models
from django.core.validators import EmailValidator, RegexValidator


class CustomerMaster(models.Model):
    """
    Customer Master Table
    Stores all customer information
    """
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True)
    customer_code = models.CharField(max_length=50, unique=True)
    customer_name = models.CharField(max_length=255)
    
    # Contact Information
    email = models.EmailField(validators=[EmailValidator()], null=True, blank=True)
    phone = models.CharField(
        max_length=15,
        validators=[RegexValidator(regex=r'^\+?1?\d{9,15}$')],
        null=True,
        blank=True
    )
    mobile = models.CharField(max_length=15, null=True, blank=True)
    
    # Address Information
    address_line1 = models.CharField(max_length=255, null=True, blank=True)
    address_line2 = models.CharField(max_length=255, null=True, blank=True)
    city = models.CharField(max_length=100, null=True, blank=True)
    state = models.CharField(max_length=100, null=True, blank=True)
    country = models.CharField(max_length=100, default='India')
    pincode = models.CharField(max_length=10, null=True, blank=True)
    
    # Business Information
    gstin = models.CharField(max_length=15, null=True, blank=True)
    pan = models.CharField(max_length=10, null=True, blank=True)
    category = models.ForeignKey(
        'CustomerMasterCategory',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='category_id',
        db_constraint=False,
        related_name='customer_masters'
    )
    
    # Financial Information
    credit_limit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    credit_days = models.IntegerField(default=0)
    opening_balance = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    current_balance = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    # Status and Metadata
    is_active = models.BooleanField(default=True)
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, null=True, blank=True)
    
    class Meta:

        db_table = 'customer_master'
        indexes = [
            models.Index(fields=['tenant_id', 'customer_code']),
            models.Index(fields=['tenant_id', 'is_deleted']),
        ]
    
    def __str__(self):
        return f"{self.customer_code} - {self.customer_name}"


class CustomerMasterCategory(models.Model):
    """
    Customer Master Category Table
    Stores customer category hierarchy (Category -> Group -> Subgroup)
    Replaces the old CustomerCategory model
    """
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True)
    category = models.CharField(max_length=100)
    group = models.CharField(max_length=100, default='', blank=True)
    subgroup = models.CharField(max_length=100, default='', blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:

        db_table = 'customer_master_category'
        unique_together = ['tenant_id', 'category', 'group', 'subgroup']
        ordering = ['category', 'group', 'subgroup']
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
        return " > ".join(parts)
    
    @property
    def full_path(self) -> str:
        """Returns the full path as category > group > subgroup"""
        return str(self)


class CustomerMastersSalesQuotation(models.Model):
    """
    Customer Masters Sales Quotation Series Table
    Manages sales quotation series configuration (prefix, suffix, digits, etc.)
    """
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True)
    series_name = models.CharField(max_length=100)
    customer_category = models.CharField(max_length=100, null=True, blank=True)
    prefix = models.CharField(max_length=20, default='SQ/')
    suffix = models.CharField(max_length=20, default='/24-25')
    required_digits = models.IntegerField(default=4)
    current_number = models.IntegerField(default=0)
    auto_year = models.BooleanField(default=False)
    
    # Status and Metadata
    is_active = models.BooleanField(default=True)
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, null=True, blank=True)
    
    class Meta:

        db_table = 'customer_masters_salesquotation'
        indexes = [
            models.Index(fields=['tenant_id', 'is_deleted']),
            models.Index(fields=['tenant_id', 'customer_category']),
        ]
        unique_together = ['tenant_id', 'series_name']
    
    def __str__(self):
        return f"{self.series_name} - {self.customer_category}"
    
    def get_next_number(self):
        """Generate the next quotation number in the series"""
        self.current_number += 1
        self.save()
        number_str = str(self.current_number).zfill(self.required_digits)
        return f"{self.prefix}{number_str}{self.suffix}"


class CustomerMastersSalesOrder(models.Model):
    """
    Customer Masters Sales Order Series Table
    Manages sales order series configuration (prefix, suffix, digits, etc.)
    """
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True)
    series_name = models.CharField(max_length=100)
    customer_category = models.CharField(max_length=100, null=True, blank=True)
    prefix = models.CharField(max_length=20, default='SO/')
    suffix = models.CharField(max_length=20, default='/24-25')
    required_digits = models.IntegerField(default=4)
    current_number = models.IntegerField(default=0)
    auto_year = models.BooleanField(default=False)
    
    # Status and Metadata
    is_active = models.BooleanField(default=True)
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, null=True, blank=True)
    
    class Meta:

        db_table = 'customer_masters_salesorder'
        indexes = [
            models.Index(fields=['tenant_id', 'is_deleted']),
            models.Index(fields=['tenant_id', 'customer_category']),
        ]
        unique_together = ['tenant_id', 'series_name']
    
    def __str__(self):
        return f"{self.series_name} - {self.customer_category}"
    
    def get_next_number(self):
        """Generate the next order number in the series"""
        self.current_number += 1
        self.save()
        number_str = str(self.current_number).zfill(self.required_digits)
        return f"{self.prefix}{number_str}{self.suffix}"


class CustomerMasterCustomerBasicDetails(models.Model):
    """
    Customer Master - Basic Details Table
    Stores basic customer information from the 'Basic Details' tab
    """
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True)
    
    # Basic Details
    customer_name = models.CharField(max_length=255)
    customer_code = models.CharField(max_length=50)
    customer_category = models.ForeignKey(
        'CustomerMasterCategory', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='customers', 
        db_column='customer_category_id',
        db_constraint=False
    )
    pan_number = models.CharField(max_length=10, null=True, blank=True)
    contact_person = models.CharField(max_length=255, null=True, blank=True)
    email_address = models.EmailField(validators=[EmailValidator()], null=True, blank=True)
    contact_number = models.CharField(max_length=15, null=True, blank=True)
    billing_currency = models.CharField(max_length=10, null=True, blank=True)
    is_also_vendor = models.BooleanField(default=False)
    gst_tds_applicable = models.BooleanField(default=False, help_text='TDS Applicable under GST')
    
    # Linked Accounting Ledger
    ledger = models.ForeignKey(
        'accounting.MasterLedger', 
        on_delete=models.RESTRICT, 
        null=True, 
        blank=True, 
        related_name='customers_basic',
        db_column='ledger_id'
    )
    
    # Status and Metadata
    is_active = models.BooleanField(default=True)
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, null=True, blank=True)
    updated_by = models.CharField(max_length=100, null=True, blank=True)
    
    class Meta:

        db_table = 'customer_master_customer_basicdetails'
        indexes = [
            models.Index(fields=['tenant_id', 'customer_code']),
            models.Index(fields=['tenant_id', 'is_deleted']),
            models.Index(fields=['customer_category']),
        ]
        unique_together = ['tenant_id', 'customer_code']
    
    def __str__(self):
        return f"{self.customer_code} - {self.customer_name}"


class CustomerMasterCustomerGSTDetails(models.Model):
    """
    Customer Master - GST Details Table
    Stores GST registration details and branch information
    """
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True)
    customer_basic_detail = models.ForeignKey(
        CustomerMasterCustomerBasicDetails,
        on_delete=models.CASCADE,
        related_name='gst_details',
        db_column='customer_basic_detail_id'
    )
    
    # GST Details
    gstin = models.CharField(max_length=15, null=True, blank=True, help_text='GST Identification Number')
    is_unregistered = models.BooleanField(default=False, help_text='Is customer unregistered for GST')
    
    # Branch Details
    branch_reference_name = models.CharField(max_length=255, null=True, blank=True)
    branch_address = models.TextField(null=True, blank=True, help_text='Legacy JSON address')
    
    # New Address Columns (Frontend Extract)
    address_line_1 = models.CharField(max_length=255, null=True, blank=True)
    address_line_2 = models.CharField(max_length=255, null=True, blank=True)
    address_line_3 = models.CharField(max_length=255, null=True, blank=True)
    city = models.CharField(max_length=100, null=True, blank=True)
    state = models.CharField(max_length=100, null=True, blank=True)
    country = models.CharField(max_length=100, null=True, blank=True)
    pincode = models.CharField(max_length=20, null=True, blank=True)

    branch_contact_person = models.CharField(max_length=255, null=True, blank=True)
    branch_email = models.EmailField(null=True, blank=True)
    branch_contact_number = models.CharField(max_length=15, null=True, blank=True)
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, null=True, blank=True)
    updated_by = models.CharField(max_length=100, null=True, blank=True)
    
    class Meta:

        db_table = 'customer_master_customer_gstdetails'
        indexes = [
            models.Index(fields=['tenant_id', 'gstin']),
            models.Index(fields=['customer_basic_detail']),
        ]
    
    def __str__(self):
        return f"{self.gstin or 'Unregistered'} - {self.branch_reference_name or 'N/A'}"


class CustomerMasterCustomerTDS(models.Model):
    """
    Customer Master - TDS & Other Statutory Details Table
    Stores TDS and other statutory information
    """
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True)
    customer_basic_detail = models.OneToOneField(
        CustomerMasterCustomerBasicDetails,
        on_delete=models.CASCADE,
        related_name='tds_details',
        db_column='customer_basic_detail_id'
    )
    
    # Statutory Details
    msme_no = models.CharField(max_length=50, null=True, blank=True, help_text='MSME Registration Number')
    fssai_no = models.CharField(max_length=50, null=True, blank=True, help_text='FSSAI License Number')
    iec_code = models.CharField(max_length=50, null=True, blank=True, help_text='Import Export Code')
    eou_status = models.CharField(max_length=100, null=True, blank=True, help_text='Export Oriented Unit Status')
    
    # TCS Details
    tcs_section = models.CharField(max_length=255, null=True, blank=True, help_text='TCS Section')
    tcs_enabled = models.BooleanField(default=False, help_text='Is TCS Enabled')
    
    # TDS Details
    tds_section = models.CharField(max_length=255, null=True, blank=True, help_text='TDS Section')
    tds_enabled = models.BooleanField(default=False, help_text='Is TDS Enabled')
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, null=True, blank=True)
    updated_by = models.CharField(max_length=100, null=True, blank=True)
    
    class Meta:

        db_table = 'customer_master_customer_tds'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['customer_basic_detail']),
        ]
    
    def __str__(self):
        return f"TDS Details for {self.customer_basic_detail.customer_code}"


class CustomerMasterCustomerBanking(models.Model):
    """
    Customer Master - Banking Information Table
    Stores bank account details for customers
    """
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True)
    customer_basic_detail = models.ForeignKey(
        CustomerMasterCustomerBasicDetails,
        on_delete=models.CASCADE,
        related_name='banking_details',
        db_column='customer_basic_detail_id'
    )
    
    # Bank Account Details
    account_number = models.CharField(max_length=50, null=True, blank=True, help_text='Bank Account Number')
    bank_name = models.CharField(max_length=255, null=True, blank=True, help_text='Bank Name')
    ifsc_code = models.CharField(max_length=11, null=True, blank=True, help_text='IFSC Code')
    branch_name = models.CharField(max_length=255, null=True, blank=True, help_text='Branch Name')
    swift_code = models.CharField(max_length=11, null=True, blank=True, help_text='SWIFT Code for international transfers')
    
    # Associated Branches (JSON field to store branch references)
    associated_branches = models.JSONField(null=True, blank=True, help_text='List of associated branch references')
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, null=True, blank=True)
    updated_by = models.CharField(max_length=100, null=True, blank=True)
    
    class Meta:

        db_table = 'customer_master_customer_banking'
        indexes = [
            models.Index(fields=['tenant_id', 'account_number']),
            models.Index(fields=['customer_basic_detail']),
        ]
    
    def __str__(self):
        return f"{self.bank_name} - {self.account_number}"


# Keep backward compatibility - alias for existing code
CustomerMasterCustomer = CustomerMasterCustomerBasicDetails


class CustomerMasterCustomerProductService(models.Model):
    """
    Customer Master Product Service Table
    Stores products/services associated with a customer
    """
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True, null=True, blank=True)
    customer_basic_detail = models.ForeignKey(
        CustomerMasterCustomerBasicDetails, 
        on_delete=models.CASCADE, 
        related_name='product_services', 
        db_column='customer_basic_detail_id', 
        null=True
    )
    item_code = models.CharField(max_length=50, null=True, blank=True)
    item_name = models.CharField(max_length=200, null=True, blank=True)
    hsn_code = models.CharField(max_length=20, null=True, blank=True)
    uom = models.CharField(max_length=50, null=True, blank=True, help_text='Unit of Measure')
    customer_item_code = models.CharField(max_length=50, null=True, blank=True)
    customer_item_name = models.CharField(max_length=200, null=True, blank=True)
    packing_notes = models.TextField(null=True, blank=True, help_text='Packing notes for this product/service')
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, null=True, blank=True)
    updated_by = models.CharField(max_length=100, null=True, blank=True)

    class Meta:

        db_table = 'customer_master_customer_productservice'
        indexes = [
            models.Index(fields=['tenant_id', 'item_code']),
            models.Index(fields=['customer_basic_detail']),
        ]


class CustomerMasterCustomerTermsCondition(models.Model):
    """
    Customer Master Terms & Conditions Table
    Stores terms and conditions associated with a customer
    """
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True, null=True, blank=True)
    customer_basic_detail = models.OneToOneField(
        CustomerMasterCustomerBasicDetails, 
        on_delete=models.CASCADE, 
        related_name='terms_conditions', 
        db_column='customer_basic_detail_id', 
        null=True
    )
    
    credit_period = models.CharField(max_length=50, null=True, blank=True, help_text='Credit period field')
    credit_terms = models.TextField(null=True, blank=True)
    penalty_terms = models.TextField(null=True, blank=True)
    delivery_terms = models.TextField(null=True, blank=True)
    warranty_details = models.TextField(null=True, blank=True)
    force_majeure = models.TextField(null=True, blank=True)
    dispute_terms = models.TextField(null=True, blank=True)
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, null=True, blank=True)
    updated_by = models.CharField(max_length=100, null=True, blank=True)

    class Meta:

        db_table = 'customer_master_customer_termscondition'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['customer_basic_detail']),
        ]


class CustomerTransaction(models.Model):
    """
    Customer Transaction Table
    Stores all customer transactions (invoices, payments, etc.)
    """
    TRANSACTION_TYPES = [
        ('invoice', 'Invoice'),
        ('payment', 'Payment'),
        ('receipt', 'Receipt'),
        ('credit_note', 'Credit Note'),
        ('debit_note', 'Debit Note'),
    ]
    
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True)
    customer_id = models.IntegerField(db_index=True)
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    transaction_number = models.CharField(max_length=50)
    transaction_date = models.DateField()
    
    # Financial Details
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=15, decimal_places=2)
    
    # Payment Information
    payment_status = models.CharField(max_length=20, default='pending')
    payment_mode = models.CharField(max_length=50, null=True, blank=True)
    
    # Reference and Notes
    reference_number = models.CharField(max_length=100, null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:

        db_table = 'customer_transaction'
        indexes = [
            models.Index(fields=['tenant_id', 'customer_id']),
            models.Index(fields=['transaction_date']),
        ]
    
    def __str__(self):
        return f"{self.transaction_number} - {self.transaction_type}"


# class CustomerSalesQuotation(models.Model):
#     """
#     Sales Quotation Table
#     Manages customer quotations
#     """
#     STATUS_CHOICES = [
#         ('draft', 'Draft'),
#         ('sent', 'Sent'),
#         ('accepted', 'Accepted'),
#         ('rejected', 'Rejected'),
#         ('converted', 'Converted to Order'),
#     ]
#     
#     id = models.AutoField(primary_key=True)
#     tenant_id = models.CharField(max_length=36, db_index=True)
#     customer_id = models.IntegerField(db_index=True)
#     quotation_number = models.CharField(max_length=50, unique=True)
#     quotation_date = models.DateField()
#     valid_until = models.DateField()
#     
#     # Financial Details
#     subtotal = models.DecimalField(max_digits=15, decimal_places=2)
#     tax_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
#     discount_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
#     total_amount = models.DecimalField(max_digits=15, decimal_places=2)
#     
#     # Status and Notes
#     status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
#     terms_and_conditions = models.TextField(null=True, blank=True)
#     notes = models.TextField(null=True, blank=True)
#     
#     # Metadata
#     created_at = models.DateTimeField(auto_now_add=True)
#     updated_at = models.DateTimeField(auto_now=True)
#     
#     class Meta:
#         db_table = 'customer_sales_quotation'
#         indexes = [
#             models.Index(fields=['tenant_id', 'customer_id']),
#             models.Index(fields=['quotation_date']),
#         ]
#     
#     def __str__(self):
#         return f"{self.quotation_number} - {self.status}"


# class CustomerSalesOrder(models.Model):
#     """
#     Sales Order Table
#     Manages customer sales orders
#     """
#     ORDER_STATUS = [
#         ('pending', 'Pending'),
#         ('confirmed', 'Confirmed'),
#         ('processing', 'Processing'),
#         ('shipped', 'Shipped'),
#         ('delivered', 'Delivered'),
#         ('cancelled', 'Cancelled'),
#     ]
#     
#     id = models.AutoField(primary_key=True)
#     tenant_id = models.CharField(max_length=36, db_index=True)
#     customer_id = models.IntegerField(db_index=True)
#     order_number = models.CharField(max_length=50, unique=True)
#     order_date = models.DateField()
#     expected_delivery_date = models.DateField(null=True, blank=True)
#     
#     # Reference
#     quotation_reference = models.CharField(max_length=50, null=True, blank=True)
#     po_number = models.CharField(max_length=50, null=True, blank=True)
#     
#     # Financial Details
#     subtotal = models.DecimalField(max_digits=15, decimal_places=2)
#     tax_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
#     discount_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
#     shipping_charges = models.DecimalField(max_digits=15, decimal_places=2, default=0)
#     total_amount = models.DecimalField(max_digits=15, decimal_places=2)
#     
#     # Status and Notes
#     status = models.CharField(max_length=20, choices=ORDER_STATUS, default='pending')
#     notes = models.TextField(null=True, blank=True)
#     
#     # Metadata
#     created_at = models.DateTimeField(auto_now_add=True)
#     updated_at = models.DateTimeField(auto_now=True)
#     
#     class Meta:
#         db_table = 'customer_sales_order'
#         indexes = [
#             models.Index(fields=['tenant_id', 'customer_id']),
#             models.Index(fields=['order_date']),
#             models.Index(fields=['status']),
#         ]
#     
#     def __str__(self):
#         return f"{self.order_number} - {self.status}"


# ============================================================================
# LONG-TERM CONTRACTS MODELS
# ============================================================================

class CustomerMasterLongTermContractBasicDetail(models.Model):
    """
    Customer Master Long-term Contract Basic Details Table
    Stores basic contract information
    """
    CONTRACT_TYPES = [
        ('Rate Contract', 'Rate Contract'),
        ('Service Contract', 'Service Contract'),
        ('AMC', 'AMC'),
    ]
    
    BILLING_FREQUENCY = [
        ('Weekly', 'Weekly'),
        ('Monthly', 'Monthly'),
        ('Quarterly', 'Quarterly'),
        ('Half-Yearly', 'Half-Yearly'),
        ('Yearly', 'Yearly'),
    ]
    
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True)
    
    # Basic Contract Information
    contract_number = models.CharField(max_length=50)
    customer_id = models.IntegerField(db_index=True, help_text='Reference to customer')
    customer_name = models.CharField(max_length=255, help_text='Customer name for display')
    branch_id = models.IntegerField(null=True, blank=True, help_text='Reference to branch')
    contract_type = models.CharField(max_length=50, choices=CONTRACT_TYPES)
    contract_validity_from = models.DateField()
    contract_validity_to = models.DateField()
    contract_document = models.CharField(max_length=500, null=True, blank=True, help_text='File path to uploaded contract document')
    
    # Billing Automation
    automate_billing = models.BooleanField(default=False)
    bill_start_date = models.DateField(null=True, blank=True)
    billing_frequency = models.CharField(max_length=20, choices=BILLING_FREQUENCY, null=True, blank=True)
    voucher_name = models.CharField(max_length=100, null=True, blank=True, help_text='Voucher type for automated billing')
    bill_period_from = models.DateField(null=True, blank=True)
    bill_period_to = models.DateField(null=True, blank=True)
    
    # Status and Metadata
    is_active = models.BooleanField(default=True)
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, null=True, blank=True)
    updated_by = models.CharField(max_length=100, null=True, blank=True)
    
    class Meta:

        db_table = 'customer_master_longtermcontracts_basicdetails'
        indexes = [
            models.Index(fields=['tenant_id', 'contract_number']),
            models.Index(fields=['tenant_id', 'customer_id']),
            models.Index(fields=['tenant_id', 'is_deleted']),
            models.Index(fields=['contract_validity_from', 'contract_validity_to']),
        ]
        unique_together = ['tenant_id', 'contract_number']
    
    def __str__(self):
        return f"{self.contract_number} - {self.customer_name}"


class CustomerMasterLongTermContractProductService(models.Model):
    """
    Customer Master Long-term Contract Products/Services Table
    Stores product/service details for each contract
    """
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True)
    contract_basic_detail = models.ForeignKey(
        CustomerMasterLongTermContractBasicDetail,
        on_delete=models.CASCADE,
        related_name='products_services',
        db_column='contract_basic_detail_id'
    )
    
    # Product/Service Information
    item_code = models.CharField(max_length=50, help_text='Our item code')
    item_name = models.CharField(max_length=200, help_text='Our item name')
    customer_item_name = models.CharField(max_length=200, null=True, blank=True, help_text='Customer\'s item name')
    uom = models.CharField(max_length=50, null=True, blank=True, help_text='Unit of Measure')
    
    # Quantity Range
    qty_min = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True, help_text='Minimum quantity')
    qty_max = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True, help_text='Maximum quantity')
    
    # Price Range
    price_min = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True, help_text='Minimum price')
    price_max = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True, help_text='Maximum price')
    
    # Price Deviation
    acceptable_price_deviation = models.CharField(max_length=50, null=True, blank=True, help_text='e.g., ±5%')
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, null=True, blank=True)
    updated_by = models.CharField(max_length=100, null=True, blank=True)
    
    class Meta:

        db_table = 'customer_master_longtermcontracts_productservices'
        indexes = [
            models.Index(fields=['tenant_id', 'item_code']),
            models.Index(fields=['contract_basic_detail']),
        ]
    
    def __str__(self):
        return f"{self.item_code} - {self.item_name}"


class CustomerMasterLongTermContractTermsCondition(models.Model):
    """
    Customer Master Long-term Contract Terms & Conditions Table
    Stores terms and conditions for each contract
    """
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True)
    contract_basic_detail = models.OneToOneField(
        CustomerMasterLongTermContractBasicDetail,
        on_delete=models.CASCADE,
        related_name='terms_conditions',
        db_column='contract_basic_detail_id'
    )
    
    # Terms & Conditions
    payment_terms = models.TextField(null=True, blank=True)
    penalty_terms = models.TextField(null=True, blank=True)
    force_majeure = models.TextField(null=True, blank=True)
    termination_clause = models.TextField(null=True, blank=True)
    dispute_terms = models.TextField(null=True, blank=True, help_text='Dispute & Redressal Terms')
    others = models.TextField(null=True, blank=True, help_text='Other terms')
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, null=True, blank=True)
    updated_by = models.CharField(max_length=100, null=True, blank=True)
    
    class Meta:

        db_table = 'customer_master_longtermcontracts_termscondition'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['contract_basic_detail']),
        ]
    
    def __str__(self):
        return f"Terms for {self.contract_basic_detail.contract_number}"


class CustomerTransactionSalesQuotationGeneral(models.Model):
    """
    Customer Transaction - Sales Quotation General Table
    Stores general sales quotation details
    """
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True)
    
    quote_number = models.CharField(max_length=50, unique=True)
    customer_category = models.CharField(max_length=100, null=True, blank=True)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    
    # Items (Stored as JSON)
    items = models.JSONField(default=list, blank=True, null=True)

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, null=True, blank=True)
    
    class Meta:

        db_table = 'customer_transaction_salesquotation_general'
        indexes = [
            models.Index(fields=['tenant_id', 'quote_number']),
            models.Index(fields=['effective_from']),
        ]

    def __str__(self):
        return self.quote_number


class CustomerTransactionSalesQuotationGeneralItem(models.Model):
    """Normalized items for Sales Quotation General (Rate Contracts)"""
    quotation = models.ForeignKey(CustomerTransactionSalesQuotationGeneral, on_delete=models.CASCADE, related_name='items_rel')
    item_code = models.CharField(max_length=50)
    item_name = models.CharField(max_length=200)
    uom = models.CharField(max_length=50)
    effective_rate = models.DecimalField(max_digits=15, decimal_places=2, help_text='Rate specified in quotation')
    
    tenant_id = models.CharField(max_length=36, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'customer_transaction_salesquotation_general_items'


class CustomerTransactionSalesQuotationSpecific(models.Model):
    """
    Customer Transaction - Sales Quotation Specific Table
    Stores specific sales quotation details
    """
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True)
    
    quote_number = models.CharField(max_length=50, unique=True)
    customer_name = models.CharField(max_length=255, null=True, blank=True)
    branch = models.CharField(max_length=100, null=True, blank=True)
    address = models.TextField(null=True, blank=True)
    email = models.EmailField(null=True, blank=True)
    contact_no = models.CharField(max_length=20, null=True, blank=True)
    
    validity_from = models.DateField(null=True, blank=True)
    validity_to = models.DateField(null=True, blank=True)
    tentative_delivery_date = models.DateField(null=True, blank=True)
    payment_terms = models.TextField(null=True, blank=True)
    
    # Items (Stored as JSON)
    items = models.JSONField(default=list, blank=True, null=True)

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, null=True, blank=True)
    
    class Meta:

        db_table = 'customer_transaction_salesquotation_specific'
        indexes = [
            models.Index(fields=['tenant_id', 'quote_number']),
            models.Index(fields=['validity_from']),
        ]

    def __str__(self):
        return f"{self.quote_number} - {self.customer_name}"


class CustomerTransactionSalesQuotationSpecificItem(models.Model):
    """Normalized items for Sales Quotation Specific"""
    quotation = models.ForeignKey(CustomerTransactionSalesQuotationSpecific, on_delete=models.CASCADE, related_name='items_rel')
    item_code = models.CharField(max_length=50)
    item_name = models.CharField(max_length=200)
    hsn_sac = models.CharField(max_length=20, null=True, blank=True)
    quantity = models.DecimalField(max_digits=15, decimal_places=2)
    uom = models.CharField(max_length=50)
    rate = models.DecimalField(max_digits=15, decimal_places=2)
    taxable_value = models.DecimalField(max_digits=15, decimal_places=2)
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    gst_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_value = models.DecimalField(max_digits=15, decimal_places=2)
    
    tenant_id = models.CharField(max_length=36, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'customer_transaction_salesquotation_specific_items'


class CustomerTransactionSalesOrderBasicDetails(models.Model):
    """
    Customer Transaction - Sales Order Basic Details
    Stores basic sales order information
    """
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True)
    
    # Basic Details
    so_series_name = models.CharField(max_length=100, null=True, blank=True, help_text='SO Series Name')
    so_number = models.CharField(max_length=50, help_text='Sales Order Number (auto-generated)')
    date = models.DateField(help_text='Sales Order Date')
    customer_po_number = models.CharField(max_length=100, null=True, blank=True, help_text='Customer PO Number')
    customer_name = models.CharField(max_length=255, help_text='Customer Name')
    branch = models.CharField(max_length=255, null=True, blank=True, help_text='Branch')
    address = models.TextField(null=True, blank=True, help_text='Address')
    email = models.EmailField(null=True, blank=True, help_text='Email Address')
    contact_number = models.CharField(max_length=20, null=True, blank=True, help_text='Contact Number')
    gst_no = models.CharField(max_length=20, null=True, blank=True, help_text='GST Number')
    status = models.CharField(max_length=20, default='pending', help_text='SO Status: pending, approved, cancelled, completed')
    
    # Quotation/Contract Linking - Moved to separate table
    # quotation_type and quotation_number removed
    
    
    # Status and Metadata
    is_active = models.BooleanField(default=True)
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, null=True, blank=True)
    updated_by = models.CharField(max_length=100, null=True, blank=True)

    class Meta:

        db_table = 'customer_transaction_salesorder_basicdetails'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['customer_name']),
            models.Index(fields=['date']),
        ]
        unique_together = ['tenant_id', 'so_number']

    def __str__(self):
        return f"{self.so_number} - {self.customer_name}"


class CustomerTransactionSalesOrderItemDetails(models.Model):
    """
    Customer Transaction - Sales Order Items
    Stores item details for each sales order
    """
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True)
    so_basic_detail = models.ForeignKey(
        CustomerTransactionSalesOrderBasicDetails, 
        on_delete=models.CASCADE, 
        related_name='items', 
        db_column='so_basic_detail_id'
    )
    
    # Item Details
    item_code = models.CharField(max_length=50, null=True, blank=True, help_text='Item Code')
    item_name = models.CharField(max_length=255, null=True, blank=True, help_text='Item Name')
    quantity = models.DecimalField(max_digits=15, decimal_places=2, default=0, help_text='Quantity')
    price = models.DecimalField(max_digits=15, decimal_places=2, default=0, help_text='Price per unit')
    taxable_value = models.DecimalField(max_digits=15, decimal_places=2, default=0, help_text='Taxable Value (Qty * Price)')
    gst = models.DecimalField(max_digits=15, decimal_places=2, default=0, help_text='GST Amount')
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0, help_text='GST Rate (%)')
    net_value = models.DecimalField(max_digits=15, decimal_places=2, default=0, help_text='Net Value (Taxable + GST)')
    uom = models.CharField(max_length=50, null=True, blank=True, help_text='Unit of Measure')
    packing_notes = models.TextField(null=True, blank=True, help_text='Packing notes for this item')
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:

        db_table = 'customer_transaction_salesorder_items'
        indexes = [
            models.Index(fields=['tenant_id']),
            models.Index(fields=['so_basic_detail']),
        ]

    def __str__(self):
        return f"{self.item_code} - {self.item_name}"


class CustomerTransactionSalesOrderDeliveryTerms(models.Model):
    """
    Customer Transaction - Sales Order Delivery Terms
    Stores delivery terms for each sales order
    """
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True)
    so_basic_detail = models.OneToOneField(
        CustomerTransactionSalesOrderBasicDetails, 
        on_delete=models.CASCADE, 
        related_name='delivery_terms', 
        db_column='so_basic_detail_id'
    )
    
    # Delivery Details
    deliver_at = models.CharField(max_length=500, null=True, blank=True, help_text='Delivery Address')
    delivery_date = models.DateField(null=True, blank=True, help_text='Delivery Date')
    third_party_address = models.JSONField(null=True, blank=True, help_text='Third Party Delivery Address Details')
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:

        db_table = 'customer_transaction_salesorder_deliveryterms'
        indexes = [
            models.Index(fields=['tenant_id']),
        ]

    def __str__(self):
        return f"Delivery for {self.so_basic_detail.so_number}"


class CustomerTransactionSalesOrderPaymentAndSalesperson(models.Model):
    """
    Customer Transaction - Sales Order Payment and Salesperson
    Stores payment terms and salesperson details for each sales order
    """
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True)
    so_basic_detail = models.OneToOneField(
        CustomerTransactionSalesOrderBasicDetails, 
        on_delete=models.CASCADE, 
        related_name='payment_and_salesperson', 
        db_column='so_basic_detail_id'
    )
    
    # Payment Details
    credit_period = models.CharField(max_length=100, null=True, blank=True, help_text='Credit Period')
    
    # Salesperson Details
    salesperson_in_charge = models.CharField(max_length=255, null=True, blank=True, help_text='Salesperson In Charge')
    employee_id = models.CharField(max_length=50, null=True, blank=True, help_text='Employee ID / Agent ID')
    employee_name = models.CharField(max_length=255, null=True, blank=True, help_text='Employee Name / Agent Name')
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:

        db_table = 'customer_transaction_salesorder_payment_salesperson'
        indexes = [
            models.Index(fields=['tenant_id']),
        ]

    def __str__(self):
        return f"Payment & Salesperson for {self.so_basic_detail.so_number}"


class CustomerTransactionSalesOrderQuotationDetails(models.Model):
    """
    Customer Transaction - Sales Order Quotation Details
    Stores quotation linking details for each sales order
    """
    id = models.AutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36, db_index=True)
    so_basic_detail = models.OneToOneField(
        CustomerTransactionSalesOrderBasicDetails, 
        on_delete=models.CASCADE, 
        related_name='quotation_details', 
        db_column='so_basic_detail_id'
    )
    
    # Quotation Details
    quotation_type = models.CharField(max_length=50, null=True, blank=True, help_text='Type: Sales Quotation or Contract')
    quotation_number = models.CharField(max_length=100, null=True, blank=True, help_text='Sales Quotation # / Contract #')
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:

        db_table = 'customer_transaction_salesorder_quotation_details'
        indexes = [
            models.Index(fields=['tenant_id']),
        ]

    def __str__(self):
        return f"Quotation Details for {self.so_basic_detail.so_number}"
