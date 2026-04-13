from rest_framework import serializers
from .models_voucher_contra import VoucherContra
from .models_voucher_journal import VoucherJournal, JournalVoucherEntry
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

    # New mapping for forex and charges fields
    contraConversionRate = serializers.DecimalField(source='conversion_rate', max_digits=18, decimal_places=6, required=False, allow_null=True)
    contraPaymentAmtForeign = serializers.DecimalField(source='payment_amt_foreign', max_digits=20, decimal_places=2, required=False, allow_null=True)
    contraPaymentRate = serializers.DecimalField(source='payment_rate', max_digits=18, decimal_places=6, required=False, allow_null=True)
    contraPaymentAmtINR = serializers.DecimalField(source='payment_amt_inr', max_digits=20, decimal_places=2, required=False, allow_null=True)
    contraReceiptAmtForeign = serializers.DecimalField(source='receipt_amt_foreign', max_digits=20, decimal_places=2, required=False, allow_null=True)
    contraReceiptRate = serializers.DecimalField(source='receipt_rate', max_digits=18, decimal_places=6, required=False, allow_null=True)
    contraReceiptAmtINR = serializers.DecimalField(source='receipt_amt_inr', max_digits=20, decimal_places=2, required=False, allow_null=True)
    contraForexGainLoss = serializers.DecimalField(source='forex_gain_loss', max_digits=20, decimal_places=2, required=False, allow_null=True)
    contraDeductChargesFrom = serializers.CharField(source='deduct_charges_from', required=False, allow_null=True, allow_blank=True)
    contraConversionCharges = serializers.DecimalField(source='conversion_charges', max_digits=15, decimal_places=2, required=False, allow_null=True)
    contraFemaPurposeCode = serializers.CharField(source='fema_purpose_code', required=False, allow_null=True, allow_blank=True)

    class Meta:
        model = VoucherContra
        fields = [
            'id', 'date', 'voucher_number', 'voucher_series', 'fromAccount', 'toAccount', 'amount', 'narration', 'tenant_id',
            'contraConversionRate', 'contraPaymentAmtForeign', 'contraPaymentRate', 'contraPaymentAmtINR',
            'contraReceiptAmtForeign', 'contraReceiptRate', 'contraReceiptAmtINR', 'contraForexGainLoss',
            'contraDeductChargesFrom', 'contraConversionCharges', 'contraFemaPurposeCode'
        ]
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
                
                from customerportal.database import CustomerMasterCustomerBasicDetails
                from vendors.models import VendorMasterBasicDetail

                def get_ids(led_id):
                    v_id = None
                    c_id = None
                    v = VendorMasterBasicDetail.objects.filter(tenant_id=tenant_id, ledger_id=led_id).first()
                    if v: v_id = v.id
                    else:
                        c = CustomerMasterCustomerBasicDetails.objects.filter(tenant_id=tenant_id, ledger_id=led_id).first()
                        if c: c_id = c.id
                    return v_id, c_id

                if to_ledger:
                    # Debit: Destination
                    vid, cid = get_ids(to_ledger.id)
                    entries.append({"ledger_id": to_ledger.id, "debit": total_amt, "credit": 0, "vendor_id": vid, "customer_id": cid})
                if from_ledger:
                    # Credit: Source
                    vid, cid = get_ids(from_ledger.id)
                    entries.append({"ledger_id": from_ledger.id, "debit": 0, "credit": total_amt, "vendor_id": vid, "customer_id": cid})
                
                if len(entries) == 2:
                    post_transaction(voucher_type="CONTRA", voucher_id=voucher.id, tenant_id=tenant_id, entries=entries)
        except Exception as e:
            print(f"Error posting contra to entries: {str(e)}")

        return contra

class JournalVoucherEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = JournalVoucherEntry
        fields = ['id', 'ledger_name', 'ledger_id', 'debit_amount', 'credit_amount', 'entry_note', 'reference_no']

class VoucherJournalSerializer(serializers.ModelSerializer):
    totalDebit = serializers.DecimalField(source='total_debit', max_digits=15, decimal_places=2)
    totalCredit = serializers.DecimalField(source='total_credit', max_digits=15, decimal_places=2)
    voucher_number = serializers.CharField(required=False)
    entries = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)
    entry_lines = JournalVoucherEntrySerializer(many=True, read_only=True)

    class Meta:
        model = VoucherJournal
        fields = ['id', 'date', 'voucher_number', 'voucher_series', 'entries', 'totalDebit', 'totalCredit', 'narration', 'tenant_id', 'entry_lines']
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']

    def create(self, validated_data):
        request = self.context.get('request')
        tenant_id = get_tenant_from_request(request)
        validated_data['tenant_id'] = tenant_id
        
        entries_data = validated_data.pop('entries', [])

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
            source='journal_voucher',
            reference_id=journal.id,
        )

        setattr(journal, '_accounting_voucher_id', voucher.id)
        if any(field.name == 'voucher_id' for field in journal._meta.fields):
            journal.voucher_id = voucher.id
            journal.save(update_fields=['voucher_id'])

        # --- Sync to Normalized Journal Entries Table ---
        self._sync_journal_entries(journal, entries_data)

        # --- Double-Entry Posting for Journal (entries table) ---
        try:
            entries_to_post = []
            rows = entries_data if isinstance(entries_data, list) else []
            
            from customerportal.database import CustomerMasterCustomerBasicDetails
            from vendors.models import VendorMasterBasicDetail

            def get_ids(led_id):
                v_id = None
                c_id = None
                v = VendorMasterBasicDetail.objects.filter(tenant_id=tenant_id, ledger_id=led_id).first()
                if v: v_id = v.id
                else:
                    c = CustomerMasterCustomerBasicDetails.objects.filter(tenant_id=tenant_id, ledger_id=led_id).first()
                    if c: c_id = c.id
                return v_id, c_id

            for row in rows:
                ledger_val = row.get('ledger')
                dr = float(row.get('debit', 0))
                cr = float(row.get('credit', 0))
                
                if dr > 0 or cr > 0:
                    ledger_obj = _resolve_ledger(ledger_val, tenant_id)
                    if ledger_obj:
                        vid, cid = get_ids(ledger_obj.id)
                        entries_to_post.append({
                            "ledger_id": ledger_obj.id,
                            "debit": dr,
                            "credit": cr,
                            "vendor_id": vid,
                            "customer_id": cid
                        })
            
            if len(entries_to_post) >= 2:
                post_transaction(voucher_type="JOURNAL", voucher_id=voucher.id, tenant_id=tenant_id, entries=entries_to_post)
        except Exception as e:
            print(f"Error posting journal to entries: {str(e)}")

        return journal

    def update(self, instance, validated_data):
        entries_data = validated_data.pop('entries', None)
        instance = super().update(instance, validated_data)
        
        if entries_data is not None:
            self._sync_journal_entries(instance, entries_data)
            
        return instance

    def _sync_journal_entries(self, journal, entries_json):
        """Sync entries JSON to JournalVoucherEntry table."""
        if not entries_json: return
        rows = entries_json if isinstance(entries_json, list) else []
        
        JournalVoucherEntry.objects.filter(voucher=journal).delete()
        for row in rows:
            if not isinstance(row, dict): continue
            
            # Resolve ledger_id for normalization
            led_val = row.get('ledger')
            led_obj = _resolve_ledger(led_val, journal.tenant_id)
            
            JournalVoucherEntry.objects.create(
                voucher=journal,
                tenant_id=journal.tenant_id,
                ledger_name=str(led_val),
                ledger_id=led_obj.id if led_obj else None,
                debit_amount=Decimal(str(row.get('debit', 0))),
                credit_amount=Decimal(str(row.get('credit', 0))),
                entry_note=row.get('note', ''),
                reference_no=row.get('refNo', '')
            )
