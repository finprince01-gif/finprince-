"""
bank_upload/serializers.py
==========================
Serializers for the BankStatementTemp staging model.
No voucher logic here — just data shape for the API.
"""

from rest_framework import serializers  # type: ignore
from .models import BankStatementTemp, BankStatementStagingFile


class BankStatementStagingFileSerializer(serializers.ModelSerializer):
    """Metadata-only serializer for list view."""
    transaction_count = serializers.SerializerMethodField()

    class Meta:
        model = BankStatementStagingFile
        fields = [
            'id', 'file_name', 'account_id', 'uploaded_at', 
            'status', 'expires_at', 'transaction_count'
        ]

    def get_transaction_count(self, obj):
        if isinstance(obj.transaction_data, list):
            return len(obj.transaction_data)
        return 0


class BankStatementStagingFileDetailSerializer(serializers.ModelSerializer):
    """Full detail serializer including transaction_data."""
    class Meta:
        model = BankStatementStagingFile
        fields = '__all__'



class BankStatementTempSerializer(serializers.ModelSerializer):
    """Full read/write serializer for staging rows."""

    class Meta:
        model  = BankStatementTemp
        fields = [
            'id',
            'session_id',
            'tenant_id',
            'date',
            'narration',
            'voucher_number',
            'ref_no',
            'debit',
            'credit',
            'amount',
            'inferred_type',
            'ledger_id',
            'ledger_name',
            'bank_ledger_id',
            'bank_ledger_name',
            'status',
            'error_message',
            'voucher_id',
            'category',
            'party_id',
            'allocation_data',
            'raw_data',
            'raw_text',
            'balance',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'tenant_id', 'amount', 'created_at', 'updated_at']


class BankStatementRowUpdateSerializer(serializers.Serializer):
    """
    Partial-update payload sent when user maps a ledger to a row.
    Only the fields a user can change after extraction.
    """
    ledger_id     = serializers.IntegerField(required=False, allow_null=True)
    ledger_name   = serializers.CharField(required=False, allow_blank=True)
    inferred_type = serializers.ChoiceField(
        choices=['payment', 'receipt'], required=False
    )
    bank_ledger_id   = serializers.IntegerField(required=False, allow_null=True)
    bank_ledger_name = serializers.CharField(required=False, allow_blank=True)
    ref_no           = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    status           = serializers.ChoiceField(
        choices=['draft', 'mapped', 'posted', 'failed', 'duplicate'],
        required=False
    )



class BankUploadRequestSerializer(serializers.Serializer):
    """Validates the initial file-upload request."""
    file = serializers.FileField()
    bank_ledger_id   = serializers.IntegerField(required=False, allow_null=True)
    bank_ledger_name = serializers.CharField(required=False, allow_blank=True)


class BankPostRowResultSerializer(serializers.Serializer):
    """Shape of each row result returned by the Finalize & Post endpoint."""
    id            = serializers.IntegerField()
    status        = serializers.CharField()
    voucher_id    = serializers.IntegerField(allow_null=True)
    error_message = serializers.CharField(allow_null=True)
