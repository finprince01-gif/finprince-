"""
Serializers for Separate Voucher Master Tables
"""
from rest_framework import serializers
from .models import (
    MasterVoucherSales,
    MasterVoucherCreditNote,
    MasterVoucherReceipts,
    MasterVoucherPurchases,
    MasterVoucherDebitNote,
    MasterVoucherPayments,
    MasterVoucherExpenses,
    MasterVoucherJournal,
    MasterVoucherContra
)


class MasterVoucherSalesSerializer(serializers.ModelSerializer):
    """Serializer for Sales Voucher Master"""
    
    class Meta:
        model = MasterVoucherSales
        fields = [
            'id', 'tenant_id', 'voucher_name', 'prefix', 'suffix',
            'start_from', 'current_number', 'required_digits',
            'enable_auto_numbering', 'include_from_existing_series', 'is_active',
            'created_at', 'updated_at', 'created_by', 'updated_by'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']


class MasterVoucherCreditNoteSerializer(serializers.ModelSerializer):
    """Serializer for Credit Note Voucher Master"""
    
    class Meta:
        model = MasterVoucherCreditNote
        fields = [
            'id', 'tenant_id', 'voucher_name', 'prefix', 'suffix',
            'start_from', 'current_number', 'required_digits',
            'enable_auto_numbering', 'include_from_existing_series', 'is_active',
            'created_at', 'updated_at', 'created_by', 'updated_by'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']


class MasterVoucherReceiptsSerializer(serializers.ModelSerializer):
    """Serializer for Receipts Voucher Master"""
    
    class Meta:
        model = MasterVoucherReceipts
        fields = [
            'id', 'tenant_id', 'voucher_name', 'prefix', 'suffix',
            'start_from', 'current_number', 'required_digits',
            'enable_auto_numbering', 'include_from_existing_series', 'is_active',
            'created_at', 'updated_at', 'created_by', 'updated_by'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']


class MasterVoucherPurchasesSerializer(serializers.ModelSerializer):
    """Serializer for Purchases Voucher Master"""
    
    class Meta:
        model = MasterVoucherPurchases
        fields = [
            'id', 'tenant_id', 'voucher_name', 'prefix', 'suffix',
            'start_from', 'current_number', 'required_digits',
            'enable_auto_numbering', 'include_from_existing_series', 'is_active',
            'created_at', 'updated_at', 'created_by', 'updated_by'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']


class MasterVoucherDebitNoteSerializer(serializers.ModelSerializer):
    """Serializer for Debit Note Voucher Master"""
    
    class Meta:
        model = MasterVoucherDebitNote
        fields = [
            'id', 'tenant_id', 'voucher_name', 'prefix', 'suffix',
            'start_from', 'current_number', 'required_digits',
            'enable_auto_numbering', 'include_from_existing_series', 'is_active',
            'created_at', 'updated_at', 'created_by', 'updated_by'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']


class MasterVoucherPaymentsSerializer(serializers.ModelSerializer):
    """Serializer for Payments Voucher Master"""
    
    class Meta:
        model = MasterVoucherPayments
        fields = [
            'id', 'tenant_id', 'voucher_name', 'prefix', 'suffix',
            'start_from', 'current_number', 'required_digits',
            'enable_auto_numbering', 'include_from_existing_series', 'is_active',
            'created_at', 'updated_at', 'created_by', 'updated_by'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']


class MasterVoucherExpensesSerializer(serializers.ModelSerializer):
    """Serializer for Expenses Voucher Master"""
    
    class Meta:
        model = MasterVoucherExpenses
        fields = [
            'id', 'tenant_id', 'voucher_name', 'prefix', 'suffix',
            'start_from', 'current_number', 'required_digits',
            'enable_auto_numbering', 'include_from_existing_series', 'is_active',
            'created_at', 'updated_at', 'created_by', 'updated_by'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']


class MasterVoucherJournalSerializer(serializers.ModelSerializer):
    """Serializer for Journal Voucher Master"""
    
    class Meta:
        model = MasterVoucherJournal
        fields = [
            'id', 'tenant_id', 'voucher_name', 'prefix', 'suffix',
            'start_from', 'current_number', 'required_digits',
            'enable_auto_numbering', 'include_from_existing_series', 'is_active',
            'created_at', 'updated_at', 'created_by', 'updated_by'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']


class MasterVoucherContraSerializer(serializers.ModelSerializer):
    """Serializer for Contra Voucher Master"""
    
    class Meta:
        model = MasterVoucherContra
        fields = [
            'id', 'tenant_id', 'voucher_name', 'prefix', 'suffix',
            'start_from', 'current_number', 'required_digits',
            'enable_auto_numbering', 'include_from_existing_series', 'is_active',
            'created_at', 'updated_at', 'created_by', 'updated_by'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']
