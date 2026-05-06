import uuid
import logging
from rest_framework import serializers
from .models import (
    MasterLedgerGroup,
    MasterLedger,
    MasterHierarchyRaw,
    Voucher,
    JournalEntry,
    AmountTransaction,
    PaymentVoucherItem
)
from .services.ledger_service import post_transaction, _resolve_ledger
from decimal import Decimal

logger = logging.getLogger(__name__)

# ============================================================================
# MASTER SERIALIZERS
# ============================================================================

from core.mixins import BranchModelSerializerMixin

class MasterLedgerGroupSerializer(BranchModelSerializerMixin, serializers.ModelSerializer):
    under = serializers.CharField(source='parent', required=False, allow_blank=True, allow_null=True)
    
    class Meta:
        model = MasterLedgerGroup
        fields = ['id', 'name', 'under', 'tenant_id', 'created_at', 'updated_at']
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']


class MasterLedgerSerializer(BranchModelSerializerMixin, serializers.ModelSerializer):
    question_answers = serializers.JSONField(source='additional_data', required=False, allow_null=True)
    balance = serializers.SerializerMethodField()
    ledger_type = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    class Meta:
        model = MasterLedger
        fields = [
            'id', 'name', 'code',
            'category', 'group',
            'sub_group_1', 'sub_group_2', 'sub_group_3', 'ledger_type',
            'gstin', 'registration_type', 'state',
            'extended_data',
            'additional_data',
            'question_answers',
            'opening_balance',
            'opening_balance_type',
            'balance',  # Computed balance from journal entries
            'parent_ledger_id',
            'tenant_id', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'code', 'balance', 'tenant_id', 'created_at', 'updated_at']
        extra_kwargs = {
            'name': {'required': False, 'allow_null': True, 'allow_blank': True},
            'category': {'required': False, 'allow_blank': True, 'default': ''},
            'group': {'required': False, 'allow_null': True, 'allow_blank': True},
            'sub_group_1': {'required': False, 'allow_null': True, 'allow_blank': True},
            'sub_group_2': {'required': False, 'allow_null': True, 'allow_blank': True},
            'sub_group_3': {'required': False, 'allow_null': True, 'allow_blank': True},
            'gstin': {'required': False, 'allow_null': True, 'allow_blank': True},
            'registration_type': {'required': False, 'allow_null': True, 'allow_blank': True},
            'state': {'required': False, 'allow_null': True, 'allow_blank': True},
            'extended_data': {'required': False, 'allow_null': True},
            'additional_data': {'required': False, 'allow_null': True},
            'parent_ledger_id': {'required': False, 'allow_null': True},
            'opening_balance': {'required': False, 'default': 0.00},
            'opening_balance_type': {'required': False, 'allow_blank': True, 'default': 'Dr'},
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
                print("FOUND TRANSACTION_FILE BALANCE:", transaction_file.transactions.get('balance', 0))
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
                
                total_debit = float(entries.aggregate(Sum('debit'))['debit__sum'] or 0)
                total_credit = float(entries.aggregate(Sum('credit'))['credit__sum'] or 0)
                
                # Calculate balance using the direct DB columns for opening balance
                ob = float(obj.opening_balance or 0)
                ob_type = str(obj.opening_balance_type or 'Dr').strip()
                # Normalise to 'Dr'/'Cr' (accept legacy 'debit'/'credit' too)
                is_debit = ob_type.lower() in ('debit', 'dr')

                if obj.category in ['Asset', 'Expenditure', 'Expense']:
                    balance = total_debit - total_credit
                    balance += ob if is_debit else -ob
                else:  # Liability, Income, Capital
                    balance = total_credit - total_debit
                    balance += ob if not is_debit else -ob
                
                return float(balance)
            except Exception as je:
                logger.error(f"Journal entries lookup failed: {je}")
                return 0
            
        except Exception as e:
            # If any error, return 0
            logger.error(f"Error in get_balance: {e}")
            return 0.0

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Keep frontend-safe string values even for subgroup-only rows.
        if ret.get('name') is None:
            ret['name'] = ''
        if ret.get('ledger_type') in (None, ''):
            ret['ledger_type'] = ret.get('name') or ''
        return ret


    def create(self, validated_data):
        ledger_type = validated_data.pop('ledger_type', None)
        if ledger_type is not None:
            validated_data['name'] = (ledger_type or '').strip() or None
        elif not (validated_data.get('name') or '').strip():
            validated_data['name'] = None

        # Guard: category is NOT NULL in DB — never allow null to reach Django ORM
        if not validated_data.get('category'):
            validated_data['category'] = ''
        # Guard: group is nullable in DB but let's keep consistent
        if validated_data.get('group') is None:
            validated_data['group'] = ''
        # Ensure opening_balance_type fits VARCHAR(2)
        raw_type = str(validated_data.get('opening_balance_type', 'Dr') or 'Dr')
        validated_data['opening_balance_type'] = 'Dr' if raw_type.lower() in ('debit', 'dr') else 'Cr'

        instance = super().create(validated_data)
        return instance

    def update(self, instance, validated_data):
        ledger_type = validated_data.pop('ledger_type', None)
        if ledger_type is not None:
            validated_data['name'] = (ledger_type or '').strip() or None
        elif 'name' in validated_data and not (validated_data.get('name') or '').strip():
            validated_data['name'] = None

        # Update Master Ledger fields
        if 'category' in validated_data and validated_data['category'] is None:
            validated_data['category'] = ''
        # Ensure opening_balance_type fits VARCHAR(2)
        if 'opening_balance_type' in validated_data:
            raw_type = str(validated_data['opening_balance_type'] or 'Dr')
            validated_data['opening_balance_type'] = 'Dr' if raw_type.lower() in ('debit', 'dr') else 'Cr'

        instance = super().update(instance, validated_data)
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




class AmountTransactionSerializer(BranchModelSerializerMixin, serializers.ModelSerializer):
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
    ledger_name = serializers.CharField(source='ledger.name', read_only=True)
    
    class Meta:
        model = JournalEntry
        fields = ['id', 'ledger', 'ledger_name', 'debit', 'credit', 'voucher_type', 'voucher_number', 'transaction_date', 'voucher_id']
        read_only_fields = ['id']


class VoucherSerializer(BranchModelSerializerMixin, serializers.ModelSerializer):
    """Unified serializer for all voucher types with type-specific validation"""
    
    # Frontend compatibility fields (camelCase)
    items = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)
    entries = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)
    
    invoiceNo = serializers.CharField(source='invoice_no', required=False, allow_blank=True)
    isInterState = serializers.BooleanField(source='is_inter_state', required=False)
    totalTaxableAmount = serializers.DecimalField(source='total_taxable_amount', max_digits=20, decimal_places=2, required=False)
    totalCgst = serializers.DecimalField(source='total_cgst', max_digits=20, decimal_places=2, required=False)
    totalSgst = serializers.DecimalField(source='total_sgst', max_digits=20, decimal_places=2, required=False)
    totalIgst = serializers.DecimalField(source='total_igst', max_digits=20, decimal_places=2, required=False)
    totalDebit = serializers.DecimalField(source='total_debit', max_digits=20, decimal_places=2, required=False)
    totalCredit = serializers.DecimalField(source='total_credit', max_digits=20, decimal_places=2, required=False)
    fromAccount = serializers.CharField(source='from_account', required=False, allow_blank=True)
    toAccount = serializers.CharField(source='to_account', required=False, allow_blank=True)
    refNo = serializers.CharField(source='ref_no', required=False, allow_blank=True)
    
    class Meta:
        model = Voucher
        fields = '__all__'
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']
        extra_kwargs = {
            'voucher_number': {'required': False},
            'party': {'required': False, 'allow_blank': True},
            'account': {'required': False, 'allow_blank': True},
            'from_account': {'required': False, 'allow_blank': True},
            'to_account': {'required': False, 'allow_blank': True},
            'ref_no': {'required': False, 'allow_blank': True}
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
        ret['refNo'] = instance.ref_no
        
        # Add items for sales/purchase
        if instance.type in ['sales', 'purchase']:
            ret['items'] = instance.items_data or []
        
        # Add journal entries for journal vouchers
        if instance.type and instance.type.lower() == 'journal':
            from .models import JournalEntry
            # Voucher links to JournalEntry via voucher_id (loosely coupled)
            entries = JournalEntry.objects.filter(voucher_id=instance.id, tenant_id=instance.tenant_id)
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
            validated_data['tenant_id'] = request.user.branch_id
        
        # items_data was removed from the Voucher model in a previous normalization step.
        # It is now handled via a dynamic property in the Voucher model for read-only access.
        # For creation, items should be handled by specialized serializers or additional logic here.
        
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
    
    def _create_journal_entries(self, voucher, validated_data, entries_data=None, tenant_id=None):
        """
        Unified bridge to post_transaction service for doubled-entry.
        """
        if not tenant_id:
            tenant_id = voucher.tenant_id

        v_type = (voucher.type or '').lower()
        entries = []

        try:
            if v_type == 'sales':
                party = _resolve_ledger(validated_data.get('party'), tenant_id)
                sales = _resolve_ledger('Sales', tenant_id)
                total = float(voucher.total or 0)
                if party and sales and total > 0:
                    entries.append({"ledger_id": party.id, "debit": total, "credit": 0})
                    entries.append({"ledger_id": sales.id, "debit": 0, "credit": total})

            elif v_type == 'purchase':
                purchase = _resolve_ledger('Purchase', tenant_id)
                party = _resolve_ledger(validated_data.get('party'), tenant_id)
                total = float(voucher.total or 0)
                if purchase and party and total > 0:
                    entries.append({"ledger_id": purchase.id, "debit": total, "credit": 0})
                    entries.append({"ledger_id": party.id, "debit": 0, "credit": total})

            elif v_type in ('payment', 'receipt'):
                party = _resolve_ledger(validated_data.get('party'), tenant_id)
                account = _resolve_ledger(validated_data.get('account', 'Cash'), tenant_id)
                amt = float(voucher.total or voucher.amount or 0)
                if party and account and amt > 0:
                    if v_type == 'payment':
                        # Debit Party, Credit Account
                        entries.append({"ledger_id": party.id, "debit": amt, "credit": 0})
                        entries.append({"ledger_id": account.id, "debit": 0, "credit": amt})
                    else:
                        # Debit Account, Credit Party
                        entries.append({"ledger_id": account.id, "debit": amt, "credit": 0})
                        entries.append({"ledger_id": party.id, "debit": 0, "credit": amt})

            elif v_type == 'contra':
                to_acc = _resolve_ledger(validated_data.get('to_account', 'Bank'), tenant_id)
                from_acc = _resolve_ledger(validated_data.get('from_account', 'Cash'), tenant_id)
                amt = float(voucher.amount or 0)
                if to_acc and from_acc and amt > 0:
                    entries.append({"ledger_id": to_acc.id, "debit": amt, "credit": 0})
                    entries.append({"ledger_id": from_acc.id, "debit": 0, "credit": amt})

            elif v_type == 'journal':
                if entries_data:
                    for row in entries_data:
                        ledger = _resolve_ledger(row.get('ledger'), tenant_id)
                        dr = float(row.get('debit', 0))
                        cr = float(row.get('credit', 0))
                        if ledger and (dr > 0 or cr > 0):
                            entries.append({"ledger_id": ledger.id, "debit": dr, "credit": cr})

            if len(entries) >= 2:
                post_transaction(
                    voucher_type=v_type.upper(),
                    voucher_id=voucher.id,
                    tenant_id=tenant_id,
                    entries=entries,
                    transaction_date=voucher.date,
                    voucher_number=voucher.voucher_number
                )
        except Exception as e:
            logger.error(f"Failed to post Journal Entries for voucher {voucher.id}: {str(e)}")


class PaymentVoucherItemSerializer(serializers.ModelSerializer):
    """
    Serializer for mapping PaymentVoucherItem (Advances) to Frontend categories.
    Follows: PaymentVoucherItem -> MasterLedger -> Vendor/Customer -> Category
    """
    voucher_number = serializers.CharField(source='voucher.voucher_number', read_only=True)
    voucher_date = serializers.DateField(source='voucher.date', read_only=True)
    name = serializers.CharField(source='pay_to_ledger.name', read_only=True)
    ledger_id = serializers.IntegerField(source='pay_to_ledger.id', read_only=True)
    pay_to_ledger_id = serializers.IntegerField(source='pay_to_ledger.id', read_only=True)
    
    # Unified Category field for UI
    category = serializers.SerializerMethodField()
    
    # Matching IDs for frontend (Mapped to ledger_id as per Step 2/7)
    reference_no = serializers.CharField(source='voucher.voucher_number', read_only=True)

    # Backward-compat amount field
    amount = serializers.DecimalField(source='amount_applied', max_digits=20, decimal_places=2, read_only=True)

    class Meta:
        model = PaymentVoucherItem
        fields = [
            'id', 'voucher', 'voucher_number', 'voucher_date', 
            'pay_to_ledger', 'pay_to_ledger_id', 'ledger_id', 'name',
            'reference_type', 'reference_no', 'amount',
            'category'
        ]

    def get_category(self, obj):
        if not obj.pay_to_ledger:
            return None
            
        # 1. Try Vendor mapping
        try:
            from vendors.models import VendorMasterBasicDetail
            vendor = VendorMasterBasicDetail.objects.filter(ledger=obj.pay_to_ledger).first()
            if vendor and vendor.vendor_category:
                return vendor.vendor_category
        except:
            pass

        # 2. Try Customer mapping
        try:
            from customerportal.models import CustomerMasterCustomerBasicDetails
            customer = CustomerMasterCustomerBasicDetails.objects.filter(ledger=obj.pay_to_ledger).first()
            if customer and customer.customer_category:
                return customer.customer_category.category
        except:
            pass
            
        return None

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        return ret
