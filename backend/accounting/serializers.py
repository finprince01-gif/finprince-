import uuid
import logging
from rest_framework import serializers
from .models import (
    MasterLedgerGroup, MasterLedger, MasterHierarchyRaw,
    Voucher, JournalEntry, AmountTransaction
)
from .models_question import Answer, Question

logger = logging.getLogger(__name__)

# ============================================================================
# MASTER SERIALIZERS
# ============================================================================

from core.utils import TenantModelSerializerMixin

class MasterLedgerGroupSerializer(TenantModelSerializerMixin, serializers.ModelSerializer):
    under = serializers.CharField(source='parent', required=False, allow_blank=True, allow_null=True)
    
    class Meta:
        model = MasterLedgerGroup
        fields = ['id', 'name', 'under', 'tenant_id', 'created_at', 'updated_at']
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']


class MasterLedgerSerializer(TenantModelSerializerMixin, serializers.ModelSerializer):
    question_answers = serializers.JSONField(source='additional_data', required=False, allow_null=True)
    balance = serializers.SerializerMethodField()

    class Meta:
        model = MasterLedger
        fields = [
            'id', 'name', 'code',
            'category', 'group',
            'sub_group_1', 'sub_group_2', 'sub_group_3', 'ledger_type',
            'gstin', 'registration_type', 'state',
            'extended_data',
            'additional_data',  # Include additional_data for balances
            'question_answers', # Maps to additional_data
            'balance',  # Computed balance from journal entries
            'parent_ledger_id',
            'tenant_id', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'code', 'balance', 'tenant_id', 'created_at', 'updated_at']
        extra_kwargs = {
            'category': {'required': False, 'allow_null': True, 'allow_blank': True},
            'group': {'required': False, 'allow_null': True, 'allow_blank': True},
            'sub_group_1': {'required': False, 'allow_null': True, 'allow_blank': True},
            'sub_group_2': {'required': False, 'allow_null': True, 'allow_blank': True},
            'sub_group_3': {'required': False, 'allow_null': True, 'allow_blank': True},
            'ledger_type': {'required': False, 'allow_null': True, 'allow_blank': True},
            'gstin': {'required': False, 'allow_null': True, 'allow_blank': True},
            'registration_type': {'required': False, 'allow_null': True, 'allow_blank': True},
            'state': {'required': False, 'allow_null': True, 'allow_blank': True},
            'extended_data': {'required': False, 'allow_null': True},
            'parent_ledger_id': {'required': False, 'allow_null': True},
        }
    
    def get_balance(self, obj):
        """Calculate balance from transaction files, amount_transactions, or journal entries"""
        try:
            logger.debug(f"Looking for ledger: '{obj.name}' with tenant_id: '{obj.tenant_id}'")
            
            # Try AmountTransaction first (for Cash/Bank ledgers)
            try:
                from accounting.models import AmountTransaction
                latest_txn = AmountTransaction.objects.filter(
                    tenant_id=obj.tenant_id,
                    ledger=obj
                ).order_by('-transaction_date', '-created_at').first()
                
                if latest_txn:
                    logger.debug(f"Found balance in AmountTransaction: {latest_txn.balance}")
                    return latest_txn.balance
            except Exception as e:
                logger.debug(f"AmountTransaction lookup failed: {e}")
            
            # Try TransactionFile
            from accounting.models import TransactionFile
            transaction_file = TransactionFile.objects.filter(
                tenant_id=obj.tenant_id,
                ledger_name=obj.name
            ).first()
            
            logger.debug(f"TransactionFile query result: {transaction_file}")
            
            if transaction_file and transaction_file.transactions:
                return transaction_file.transactions.get('balance', 0)
            
            # Fallback to journal entries (if table exists)
            try:
                logger.debug("Trying journal entries")
                from django.db.models import Sum
                from accounting.models import JournalEntry
                entries = JournalEntry.objects.filter(
                    tenant_id=obj.tenant_id,
                    ledger=obj
                )
                
                total_debit = entries.aggregate(Sum('debit'))['debit__sum'] or 0
                total_credit = entries.aggregate(Sum('credit'))['credit__sum'] or 0
                
                # Calculate balance based on ledger category
                if obj.category in ['Asset', 'Expenditure', 'Expense']:
                    balance = total_debit - total_credit
                else:  # Liability, Income, Capital
                    balance = total_credit - total_debit
                
                return float(balance)
            except Exception as je:
                logger.debug(f"Journal entries not available: {je}")
                return 0
            
        except Exception as e:
            # If any error, return 0

            import traceback
            traceback.print_exc()
            return 0.0


    def create(self, validated_data):
        # Extract question answers (mapped from 'question_answers' to 'additional_data' via source)
        question_answers = validated_data.get('additional_data', {})



        
        # Create the ledger first
        instance = super().create(validated_data)

        
        # Save answers to Answer table
        if question_answers and isinstance(question_answers, dict):
            tenant_id = instance.tenant_id

            
            for q_id, ans_text in question_answers.items():

                
                if not ans_text:

                    continue
                    
                try:
                    # Frontend keys are expected to be Question IDs (strings)

                    question_obj = Question.objects.get(id=q_id)

                    
                    # Refresh to ensure code is populated if assigned by signals
                    if not instance.code:
                        instance.refresh_from_db()

                        
                    Answer.objects.create(
                        ledger_code=instance.code,
                        sub_group_1_1=question_obj.sub_group_1_1,
                        sub_group_1_2=question_obj.sub_group_1_2,
                        question=question_obj.question,
                        answer=ans_text,
                        tenant_id=tenant_id
                    )

                    
                except Question.DoesNotExist:
                    pass
                except Exception as e:
                    import traceback
                    traceback.print_exc()
                    
        return instance

    def update(self, instance, validated_data):
        question_answers = validated_data.get('additional_data', {})

        
        # Update Master Ledger fields
        instance = super().update(instance, validated_data)
        
        # Update Answers
        if question_answers and isinstance(question_answers, dict):
            tenant_id = instance.tenant_id
            for q_id, ans_text in question_answers.items():
                if not ans_text: continue
                try:
                    question_obj = Question.objects.get(id=q_id)
                    Answer.objects.update_or_create(
                        ledger_code=instance.code,
                        sub_group_1_2=question_obj.sub_group_1_2,
                        defaults={
                            'sub_group_1_1': question_obj.sub_group_1_1,
                            'question': question_obj.question,
                            'answer': ans_text,
                            'tenant_id': tenant_id
                        }
                    )
                except Exception as e:

                    pass
        return instance


# MasterVoucherConfigSerializer removed


class MasterHierarchyRawSerializer(serializers.ModelSerializer):
    """Serializer for global hierarchy data (no tenant filtering)"""
    class Meta:
        model = MasterHierarchyRaw
        fields = [
            'id',
            'major_group_1',
            'group_1',
            'sub_group_1_1',
            'sub_group_2_1',
            'sub_group_3_1',
            'ledger_1',
        ]




class AmountTransactionSerializer(TenantModelSerializerMixin, serializers.ModelSerializer):
    """Serializer for Amount Transaction with debit/credit columns"""
    ledger_name = serializers.CharField(source='ledger.name', read_only=True)
    ledger_code = serializers.CharField(source='ledger.code', read_only=True)
    voucher_number = serializers.CharField(source='voucher.voucher_number', read_only=True, allow_null=True)
    
    class Meta:
        model = AmountTransaction
        fields = [
            'id',
            'ledger',
            'ledger_name',
            'ledger_code',
            'transaction_date',
            'transaction_type',
            'debit',
            'credit',
            'balance',
            'voucher',
            'voucher_number',
            'narration',
            'tenant_id',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at', 'ledger_name', 'ledger_code', 'voucher_number']
        extra_kwargs = {
            'debit': {'required': False, 'default': 0},
            'credit': {'required': False, 'default': 0},
            'balance': {'required': False, 'default': 0},
            'voucher': {'required': False, 'allow_null': True},
            'narration': {'required': False, 'allow_blank': True, 'allow_null': True},
        }


# ============================================================================
# VOUCHER SERIALIZERS - Unified
# ============================================================================

class JournalEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = JournalEntry
        fields = ['id', 'ledger', 'debit', 'credit']
        read_only_fields = ['id']


class VoucherSerializer(TenantModelSerializerMixin, serializers.ModelSerializer):
    """Unified serializer for all voucher types with type-specific validation"""
    
    # Frontend compatibility fields (camelCase)
    items = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)
    entries = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)
    
    invoiceNo = serializers.CharField(source='invoice_no', required=False, allow_blank=True)
    isInterState = serializers.BooleanField(source='is_inter_state', required=False)
    totalTaxableAmount = serializers.DecimalField(source='total_taxable_amount', max_digits=15, decimal_places=2, required=False)
    totalCgst = serializers.DecimalField(source='total_cgst', max_digits=15, decimal_places=2, required=False)
    totalSgst = serializers.DecimalField(source='total_sgst', max_digits=15, decimal_places=2, required=False)
    totalIgst = serializers.DecimalField(source='total_igst', max_digits=15, decimal_places=2, required=False)
    totalDebit = serializers.DecimalField(source='total_debit', max_digits=15, decimal_places=2, required=False)
    totalCredit = serializers.DecimalField(source='total_credit', max_digits=15, decimal_places=2, required=False)
    fromAccount = serializers.CharField(source='from_account', required=False, allow_blank=True)
    toAccount = serializers.CharField(source='to_account', required=False, allow_blank=True)
    
    class Meta:
        model = Voucher
        fields = '__all__'
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']
        extra_kwargs = {
            'voucher_number': {'required': False},
            'party': {'required': False, 'allow_blank': True},
            'account': {'required': False, 'allow_blank': True},
            'from_account': {'required': False, 'allow_blank': True},
            'to_account': {'required': False, 'allow_blank': True}
        }
    
    def to_representation(self, instance):
        """Convert to frontend-friendly format"""
        ret = super().to_representation(instance)
        
        # Add camelCase fields
        ret['invoiceNo'] = instance.invoice_no
        ret['isInterState'] = instance.is_inter_state
        ret['totalTaxableAmount'] = instance.total_taxable_amount
        ret['totalCgst'] = instance.total_cgst
        ret['totalSgst'] = instance.total_sgst
        ret['totalIgst'] = instance.total_igst
        ret['totalDebit'] = instance.total_debit
        ret['totalCredit'] = instance.total_credit
        ret['fromAccount'] = instance.from_account
        ret['toAccount'] = instance.to_account
        
        # Add items for sales/purchase
        if instance.type in ['sales', 'purchase']:
            ret['items'] = instance.items_data or []
        
        # Add journal entries for journal vouchers
        if instance.type == 'journal':
            entries = instance.journal_entries.all()
            ret['entries'] = JournalEntrySerializer(entries, many=True).data
        
        return ret
    
    def validate(self, data):
        """Type-specific validation"""
        voucher_type = data.get('type')
        
        if voucher_type in ['sales', 'purchase']:
            # Validate sales/purchase specific fields
            if not data.get('party'):
                data['party'] = 'Unknown'
        
        elif voucher_type in ['payment', 'receipt']:
            # Validate payment/receipt specific fields
            if not data.get('party'):
                data['party'] = 'Unknown'
            if not data.get('account'):
                data['account'] = 'Cash'
            if not data.get('amount'):
                raise serializers.ValidationError({'amount': 'Amount is required for payment/receipt vouchers'})
        
        elif voucher_type == 'contra':
            # Validate contra specific fields
            if not data.get('from_account'):
                data['from_account'] = 'Cash'
            if not data.get('to_account'):
                data['to_account'] = 'Bank'
            if not data.get('amount'):
                raise serializers.ValidationError({'amount': 'Amount is required for contra vouchers'})
        
        return data
    
    def create(self, validated_data):
        """Create voucher with type-specific logic"""
        items_data = validated_data.pop('items', [])
        entries_data = validated_data.pop('entries', [])
        voucher_type = validated_data.get('type')
        
        # Inject tenant_id from request user
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            validated_data['tenant_id'] = request.user.tenant_id
        
        # Store items_data for sales/purchase
        if voucher_type in ['sales', 'purchase']:
            validated_data['items_data'] = items_data
        
        # Auto-generate voucher_number if not provided
        if 'voucher_number' not in validated_data or not validated_data['voucher_number']:
            prefix_map = {
                'sales': 'SALES',
                'purchase': 'PURCH',
                'payment': 'PAY',
                'receipt': 'REC',
                'contra': 'CONTRA',
                'journal': 'JV'
            }
            prefix = prefix_map.get(voucher_type, 'VCH')
            unique_suffix = str(uuid.uuid4())[:8]
            validated_data['voucher_number'] = validated_data.get('invoice_no') or f"{prefix}-AUTO-{unique_suffix}"
        
        tenant_id = validated_data.get('tenant_id')
        voucher = Voucher.objects.create(**validated_data)
        
        # Create journal entries based on voucher type
        self._create_journal_entries(voucher, validated_data, entries_data, tenant_id)
        
        return voucher
    
    def _create_journal_entries(self, voucher, validated_data, entries_data, tenant_id):
        """Create journal entries based on voucher type"""
        voucher_type = voucher.type
        
        if voucher_type == 'sales':
            # Debit: Party, Credit: Sales
            JournalEntry.objects.create(
                voucher=voucher,
                ledger=validated_data.get('party', 'Unknown'),
                debit=voucher.total or 0,
                credit=0,
                tenant_id=tenant_id
            )
            JournalEntry.objects.create(
                voucher=voucher,
                ledger='Sales',
                debit=0,
                credit=voucher.total or 0,
                tenant_id=tenant_id
            )
        
        elif voucher_type == 'purchase':
            # Debit: Purchase, Credit: Party
            JournalEntry.objects.create(
                voucher=voucher,
                ledger='Purchase',
                debit=voucher.total or 0,
                credit=0,
                tenant_id=tenant_id
            )
            JournalEntry.objects.create(
                voucher=voucher,
                ledger=validated_data.get('party', 'Unknown'),
                debit=0,
                credit=voucher.total or 0,
                tenant_id=tenant_id
            )
        
        elif voucher_type == 'payment':
            # Debit: Party, Credit: Account
            JournalEntry.objects.create(
                voucher=voucher,
                ledger=validated_data.get('party', 'Unknown'),
                debit=voucher.amount or 0,
                credit=0,
                tenant_id=tenant_id
            )
            JournalEntry.objects.create(
                voucher=voucher,
                ledger=validated_data.get('account', 'Cash'),
                debit=0,
                credit=voucher.amount or 0,
                tenant_id=tenant_id
            )
        
        elif voucher_type == 'receipt':
            # Debit: Account, Credit: Party
            JournalEntry.objects.create(
                voucher=voucher,
                ledger=validated_data.get('account', 'Cash'),
                debit=voucher.amount or 0,
                credit=0,
                tenant_id=tenant_id
            )
            JournalEntry.objects.create(
                voucher=voucher,
                ledger=validated_data.get('party', 'Unknown'),
                debit=0,
                credit=voucher.amount or 0,
                tenant_id=tenant_id
            )
        
        elif voucher_type == 'contra':
            # Debit: To Account, Credit: From Account
            JournalEntry.objects.create(
                voucher=voucher,
                ledger=validated_data.get('to_account', 'Bank'),
                debit=voucher.amount or 0,
                credit=0,
                tenant_id=tenant_id
            )
            JournalEntry.objects.create(
                voucher=voucher,
                ledger=validated_data.get('from_account', 'Cash'),
                debit=0,
                credit=voucher.amount or 0,
                tenant_id=tenant_id
            )
        
        elif voucher_type == 'journal':
            # Create custom journal entries
            for entry in entries_data:
                JournalEntry.objects.create(
                    voucher=voucher,
                    ledger=entry.get('ledger'),
                    debit=entry.get('debit', 0),
                    credit=entry.get('credit', 0),
                    tenant_id=tenant_id
                )

