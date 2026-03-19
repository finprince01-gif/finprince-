from rest_framework import serializers
from .models_voucher_contra import VoucherContra
from .models_voucher_journal import VoucherJournal
from .models import Voucher
from core.tenant import get_tenant_from_request
import uuid

class VoucherContraSerializer(serializers.ModelSerializer):
    # Map frontend camelCase to backend snake_case
    fromAccount = serializers.CharField(source='from_account')
    toAccount = serializers.CharField(source='to_account')
    voucher_number = serializers.CharField(required=False)

    class Meta:
        model = VoucherContra
        # Include mapped fields and other model fields
        fields = ['id', 'date', 'voucher_number', 'fromAccount', 'toAccount', 'amount', 'narration', 'tenant_id']
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']
    
    def create(self, validated_data):
        request = self.context.get('request')
        validated_data['tenant_id'] = get_tenant_from_request(request)
        
        if not validated_data.get('voucher_number'):
            validated_data['voucher_number'] = f"CN-{uuid.uuid4().hex[:6].upper()}"

        contra = super().create(validated_data)

        voucher = Voucher.objects.create(
            tenant_id=contra.tenant_id,
            type='contra',
            date=contra.date,
            voucher_number=contra.voucher_number,
            amount=contra.amount,
            total=contra.amount,
            narration=contra.narration,
            from_account=contra.from_account,
            to_account=contra.to_account,
            source='contra_voucher',
            reference_id=contra.id,
        )

        setattr(contra, '_accounting_voucher_id', voucher.id)
        if any(field.name == 'voucher_id' for field in contra._meta.fields):
            contra.voucher_id = voucher.id
            contra.save(update_fields=['voucher_id'])

        return contra

class VoucherJournalSerializer(serializers.ModelSerializer):
    # Map frontend camelCase to backend snake_case
    totalDebit = serializers.DecimalField(source='total_debit', max_digits=15, decimal_places=2)
    totalCredit = serializers.DecimalField(source='total_credit', max_digits=15, decimal_places=2)
    voucher_number = serializers.CharField(required=False)

    class Meta:
        model = VoucherJournal
        fields = ['id', 'date', 'voucher_number', 'entries', 'totalDebit', 'totalCredit', 'narration', 'tenant_id']
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']

    def create(self, validated_data):
        request = self.context.get('request')
        validated_data['tenant_id'] = get_tenant_from_request(request)
        
        if not validated_data.get('voucher_number'):
            validated_data['voucher_number'] = f"JN-{uuid.uuid4().hex[:6].upper()}"

        journal = super().create(validated_data)
        total_amount = journal.total_debit or journal.total_credit

        voucher = Voucher.objects.create(
            tenant_id=journal.tenant_id,
            type='journal',
            date=journal.date,
            voucher_number=journal.voucher_number,
            total=total_amount,
            total_debit=journal.total_debit,
            total_credit=journal.total_credit,
            narration=journal.narration,
            items_data=journal.entries,
            source='journal_voucher',
            reference_id=journal.id,
        )

        setattr(journal, '_accounting_voucher_id', voucher.id)
        if any(field.name == 'voucher_id' for field in journal._meta.fields):
            journal.voucher_id = voucher.id
            journal.save(update_fields=['voucher_id'])

        return journal
