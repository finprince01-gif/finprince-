from rest_framework import serializers
from .models_voucher_contra import VoucherContra
from .models_voucher_journal import VoucherJournal
from .models import Voucher, MasterLedger
from .services.ledger_service import post_transaction
from core.tenant import get_tenant_from_request
import uuid
from decimal import Decimal

def _resolve_ledger(value, tenant_id=None):
    """
    Resolve either a numeric ID or a ledger name to a MasterLedger instance.
    """
    if value is None or value == '':
        return None

    # Already an integer ID
    try:
        pk = int(value)
        qs = MasterLedger.objects.filter(pk=pk)
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)
        return qs.first()
    except (ValueError, TypeError):
        pass

    # String name
    if isinstance(value, str):
        qs = MasterLedger.objects.filter(name__iexact=value.strip())
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)
        return qs.first()

    return None

class VoucherContraSerializer(serializers.ModelSerializer):
    # Map frontend camelCase to backend snake_case
    fromAccount = serializers.CharField(source='from_account')
    toAccount = serializers.CharField(source='to_account')
    voucher_number = serializers.CharField(required=False)

    class Meta:
        model = VoucherContra
        fields = ['id', 'date', 'voucher_number', 'fromAccount', 'toAccount', 'amount', 'narration', 'tenant_id']
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']
    
    def create(self, validated_data):
        request = self.context.get('request')
        tenant_id = get_tenant_from_request(request)
        validated_data['tenant_id'] = tenant_id
        
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

        # --- Double-Entry Posting for Contra (entries table) ---
        try:
            total_amt = float(contra.amount)
            if total_amt > 0:
                entries = []
                from_ledger = _resolve_ledger(contra.from_account, tenant_id)
                to_ledger = _resolve_ledger(contra.to_account, tenant_id)
                
                if to_ledger:
                    # Debit: Destination
                    entries.append({"ledger_id": to_ledger.id, "debit": total_amt, "credit": 0})
                if from_ledger:
                    # Credit: Source
                    entries.append({"ledger_id": from_ledger.id, "debit": 0, "credit": total_amt})
                
                if len(entries) == 2:
                    post_transaction(voucher_type="CONTRA", voucher_id=voucher.id, tenant_id=tenant_id, entries=entries)
        except Exception as e:
            print(f"Error posting contra to entries: {str(e)}")

        return contra

class VoucherJournalSerializer(serializers.ModelSerializer):
    totalDebit = serializers.DecimalField(source='total_debit', max_digits=15, decimal_places=2)
    totalCredit = serializers.DecimalField(source='total_credit', max_digits=15, decimal_places=2)
    voucher_number = serializers.CharField(required=False)

    class Meta:
        model = VoucherJournal
        fields = ['id', 'date', 'voucher_number', 'entries', 'totalDebit', 'totalCredit', 'narration', 'tenant_id']
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']

    def create(self, validated_data):
        request = self.context.get('request')
        tenant_id = get_tenant_from_request(request)
        validated_data['tenant_id'] = tenant_id
        
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

        # --- Double-Entry Posting for Journal (entries table) ---
        try:
            entries = []
            rows = journal.entries if isinstance(journal.entries, list) else []
            for row in rows:
                ledger_val = row.get('ledger')
                dr = float(row.get('debit', 0))
                cr = float(row.get('credit', 0))
                
                if dr > 0 or cr > 0:
                    ledger_obj = _resolve_ledger(ledger_val, tenant_id)
                    if ledger_obj:
                        entries.append({
                            "ledger_id": ledger_obj.id,
                            "debit": dr,
                            "credit": cr
                        })
            
            if len(entries) >= 2:
                post_transaction(voucher_type="JOURNAL", voucher_id=voucher.id, tenant_id=tenant_id, entries=entries)
        except Exception as e:
            print(f"Error posting journal to entries: {str(e)}")

        return journal
