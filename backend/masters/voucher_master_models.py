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
