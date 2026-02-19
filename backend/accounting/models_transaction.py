"""
Transaction File Model - Comprehensive Ledger Master with Balance Tracking
This model maps to the existing Transcaction_file table in the database.
"""

from django.db import models


class TransactionFile(models.Model):
    """
    Comprehensive ledger master table with balance tracking.
    This is the primary table for storing ledger balances and details.
    Note: Does not inherit from BaseModel as table already exists in schema.
    """
    
    # Primary key and tenant
    id = models.BigAutoField(primary_key=True)
    tenant_id = models.CharField(max_length=36)  # Changed to CharField for UUID support

    
    BALANCE_TYPE_CHOICES = [
        ('Dr', 'Debit'),
        ('Cr', 'Credit'),
    ]
    
    NATURE_CHOICES = [
        ('Asset', 'Asset'),
        ('Liability', 'Liability'),
        ('Income', 'Income'),
        ('Expense', 'Expense'),
        ('Capital', 'Capital'),
    ]
    
    # Core Fields
    financial_year_id = models.BigIntegerField()
    ledger_code = models.CharField(max_length=50, unique=True, null=True, blank=True)
    ledger_name = models.CharField(max_length=255)
    alias_name = models.CharField(max_length=255, null=True, blank=True)
    group_id = models.BigIntegerField(null=True, blank=True)
    nature = models.CharField(max_length=20, choices=NATURE_CHOICES, null=True, blank=True)
    ledger_type = models.CharField(max_length=50, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    
    # Balance Fields
    opening_balance = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    opening_balance_type = models.CharField(max_length=10, choices=BALANCE_TYPE_CHOICES, null=True, blank=True)
    current_balance = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    current_balance_type = models.CharField(max_length=10, choices=BALANCE_TYPE_CHOICES, null=True, blank=True)
    closing_balance = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    closing_balance_type = models.CharField(max_length=10, choices=BALANCE_TYPE_CHOICES, null=True, blank=True)
    
    # Bank Details
    bank_name = models.CharField(max_length=255, null=True, blank=True)
    branch_name = models.CharField(max_length=255, null=True, blank=True)
    account_number = models.CharField(max_length=50, null=True, blank=True)
    ifsc_code = models.CharField(max_length=20, null=True, blank=True)
    micr_code = models.CharField(max_length=20, null=True, blank=True)
    upi_id = models.CharField(max_length=100, null=True, blank=True)
    
    # GST Details
    gst_applicable = models.BooleanField(default=False)
    gst_registration_type = models.CharField(max_length=50, null=True, blank=True)
    gstin = models.CharField(max_length=20, null=True, blank=True)
    hsn_sac_code = models.CharField(max_length=20, null=True, blank=True)
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    cgst_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    sgst_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    igst_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    
    # TDS Details
    is_tds_applicable = models.BooleanField(default=False)
    tds_section = models.CharField(max_length=20, null=True, blank=True)
    tds_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    
    # Contact Details
    contact_person = models.CharField(max_length=255, null=True, blank=True)
    mobile = models.CharField(max_length=20, null=True, blank=True)
    email = models.CharField(max_length=255, null=True, blank=True)
    address_line1 = models.CharField(max_length=255, null=True, blank=True)
    address_line2 = models.CharField(max_length=255, null=True, blank=True)
    city = models.CharField(max_length=100, null=True, blank=True)
    state = models.CharField(max_length=100, null=True, blank=True)
    pincode = models.CharField(max_length=20, null=True, blank=True)
    country = models.CharField(max_length=100, null=True, blank=True)
    
    # Business Rules
    allow_bill_wise = models.BooleanField(default=False)
    credit_limit = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    credit_days = models.IntegerField(null=True, blank=True)
    is_cost_center_required = models.BooleanField(default=False)
    is_inventory_linked = models.BooleanField(default=False)
    is_system_ledger = models.BooleanField(default=False)
    lock_editing = models.BooleanField(default=False)
    
    # Audit Fields
    created_by = models.BigIntegerField(null=True, blank=True)
    updated_by = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    
    class Meta:
        db_table = 'Transcaction_file'
        managed = False  # Django will not manage this table
        verbose_name = 'Transaction File'
        verbose_name_plural = 'Transaction Files'
        indexes = [
            models.Index(fields=['tenant_id', 'ledger_name']),
            models.Index(fields=['tenant_id', 'is_active']),
            models.Index(fields=['ledger_code']),
            models.Index(fields=['nature']),
        ]
    
    def __str__(self):
        return f"{self.ledger_name} ({self.ledger_code or 'No Code'})"
    
    def get_display_balance(self):
        """
        Get balance with proper sign based on nature and balance type.
        Returns positive for normal balances, negative for abnormal.
        """
        balance = self.current_balance or 0
        balance_type = self.current_balance_type or 'Dr'
        
        # Normal balances:
        # Assets & Expenses: Debit (Dr)
        # Liabilities, Income & Capital: Credit (Cr)
        if self.nature in ['Asset', 'Expense']:
            return balance if balance_type == 'Dr' else -balance
        else:  # Liability, Income, Capital
            return balance if balance_type == 'Cr' else -balance
    
    def update_balance(self, amount, transaction_type='Dr'):
        """
        Update current balance based on transaction.
        
        Args:
            amount: Transaction amount
            transaction_type: 'Dr' for debit, 'Cr' for credit
        """
        current = self.current_balance or 0
        current_type = self.current_balance_type or 'Dr'
        
        # Convert current balance to signed number
        if current_type == 'Cr':
            current = -current
        
        # Apply transaction
        if transaction_type == 'Dr':
            new_balance = current + amount
        else:  # Cr
            new_balance = current - amount
        
        # Store with proper type
        if new_balance >= 0:
            self.current_balance = abs(new_balance)
            self.current_balance_type = 'Dr'
        else:
            self.current_balance = abs(new_balance)
            self.current_balance_type = 'Cr'
        
        self.save()
