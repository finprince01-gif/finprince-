"""
Django Models for Separate Voucher Master Tables
Each voucher type has its own dedicated table
"""
from django.db import models


class NumberingMixin:
    def get_next_number(self):
        num = self.current_number if self.current_number is not None else self.start_from
        digits = self.required_digits or 4
        prefix = self.prefix or ''
        suffix = self.suffix or ''
        return f"{prefix}{str(num).zfill(digits)}{suffix}"

    def increment_number(self):
        self.current_number = (self.current_number if self.current_number is not None else self.start_from) + 1
        self.save(update_fields=['current_number', 'updated_at'])


class MasterVoucherSales(models.Model, NumberingMixin):
    """Sales Voucher Master"""
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    voucher_name = models.CharField(max_length=100, help_text="Voucher name")
    prefix = models.CharField(max_length=20, blank=True, null=True, help_text="Prefix for voucher number")
    suffix = models.CharField(max_length=20, blank=True, null=True, help_text="Suffix for voucher number")
    start_from = models.IntegerField(default=1, help_text="Starting number")
    current_number = models.IntegerField(null=True, blank=True, help_text="Current number in sequence")
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


class MasterVoucherCreditNote(models.Model, NumberingMixin):
    """Credit Note Voucher Master"""
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    voucher_name = models.CharField(max_length=100, help_text="Voucher name")
    prefix = models.CharField(max_length=20, blank=True, null=True, help_text="Prefix for voucher number")
    suffix = models.CharField(max_length=20, blank=True, null=True, help_text="Suffix for voucher number")
    start_from = models.IntegerField(default=1, help_text="Starting number")
    current_number = models.IntegerField(null=True, blank=True, help_text="Current number in sequence")
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


class MasterVoucherReceipts(models.Model, NumberingMixin):
    """Receipts Voucher Master"""
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    voucher_name = models.CharField(max_length=100, help_text="Voucher name")
    prefix = models.CharField(max_length=20, blank=True, null=True, help_text="Prefix for voucher number")
    suffix = models.CharField(max_length=20, blank=True, null=True, help_text="Suffix for voucher number")
    start_from = models.IntegerField(default=1, help_text="Starting number")
    current_number = models.IntegerField(null=True, blank=True, help_text="Current number in sequence")
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


class MasterVoucherPurchases(models.Model, NumberingMixin):
    """Purchases Voucher Master"""
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    voucher_name = models.CharField(max_length=100, help_text="Voucher name")
    prefix = models.CharField(max_length=20, blank=True, null=True, help_text="Prefix for voucher number")
    suffix = models.CharField(max_length=20, blank=True, null=True, help_text="Suffix for voucher number")
    start_from = models.IntegerField(default=1, help_text="Starting number")
    current_number = models.IntegerField(null=True, blank=True, help_text="Current number in sequence")
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


class MasterVoucherDebitNote(models.Model, NumberingMixin):
    """Debit Note Voucher Master"""
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    voucher_name = models.CharField(max_length=100, help_text="Voucher name")
    prefix = models.CharField(max_length=20, blank=True, null=True, help_text="Prefix for voucher number")
    suffix = models.CharField(max_length=20, blank=True, null=True, help_text="Suffix for voucher number")
    start_from = models.IntegerField(default=1, help_text="Starting number")
    current_number = models.IntegerField(null=True, blank=True, help_text="Current number in sequence")
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


class MasterVoucherPayments(models.Model, NumberingMixin):
    """Payments Voucher Master"""
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    voucher_name = models.CharField(max_length=100, help_text="Voucher name")
    prefix = models.CharField(max_length=20, blank=True, null=True, help_text="Prefix for voucher number")
    suffix = models.CharField(max_length=20, blank=True, null=True, help_text="Suffix for voucher number")
    start_from = models.IntegerField(default=1, help_text="Starting number")
    current_number = models.IntegerField(null=True, blank=True, help_text="Current number in sequence")
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


class MasterVoucherExpenses(models.Model, NumberingMixin):
    """Expenses Voucher Master"""
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    voucher_name = models.CharField(max_length=100, help_text="Voucher name")
    prefix = models.CharField(max_length=20, blank=True, null=True, help_text="Prefix for voucher number")
    suffix = models.CharField(max_length=20, blank=True, null=True, help_text="Suffix for voucher number")
    start_from = models.IntegerField(default=1, help_text="Starting number")
    current_number = models.IntegerField(null=True, blank=True, help_text="Current number in sequence")
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


class MasterVoucherJournal(models.Model, NumberingMixin):
    """Journal Voucher Master"""
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    voucher_name = models.CharField(max_length=100, help_text="Voucher name")
    prefix = models.CharField(max_length=20, blank=True, null=True, help_text="Prefix for voucher number")
    suffix = models.CharField(max_length=20, blank=True, null=True, help_text="Suffix for voucher number")
    start_from = models.IntegerField(default=1, help_text="Starting number")
    current_number = models.IntegerField(null=True, blank=True, help_text="Current number in sequence")
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


class MasterVoucherContra(models.Model, NumberingMixin):
    """Contra Voucher Master"""
    tenant_id = models.CharField(max_length=36, help_text="Tenant ID for multi-tenancy")
    voucher_name = models.CharField(max_length=100, help_text="Voucher name")
    prefix = models.CharField(max_length=20, blank=True, null=True, help_text="Prefix for voucher number")
    suffix = models.CharField(max_length=20, blank=True, null=True, help_text="Suffix for voucher number")
    start_from = models.IntegerField(default=1, help_text="Starting number")
    current_number = models.IntegerField(null=True, blank=True, help_text="Current number in sequence")
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
