from rest_framework import serializers
from .models_voucher_expense import VoucherExpense, ExpenseLineItem
from .models import Voucher, MasterLedger
from .services.ledger_service import post_transaction, _resolve_ledger
from decimal import Decimal, InvalidOperation
import uuid


def _safe_decimal(value):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")

class ExpenseLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseLineItem
        fields = [
            'id', 'expense_ledger_name', 'expense_ledger_id', 'post_to_ledger_name', 
            'post_to_ledger_id', 'amount', 'taxable_value', 'gst_rate', 'cgst', 'sgst', 'igst', 'total_amount'
        ]

class VoucherExpenseSerializer(serializers.ModelSerializer):
    voucher_number = serializers.CharField(required=False, allow_blank=True)
    expense_rows = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)
    line_items = ExpenseLineItemSerializer(many=True, read_only=True, source='rel_items')

    class Meta:
        model = VoucherExpense
        fields = [
            'id', 'date', 'voucher_series', 'voucher_number', 'expense_rows', 
            'posting_note', 'tenant_id', 'created_at', 'updated_at', 'line_items'
        ]
        read_only_fields = ['tenant_id', 'created_at', 'updated_at']
    
    def create(self, validated_data):
        request = self.context.get('request')
        tenant_id = None
        if request and hasattr(request, 'user') and hasattr(request.user, 'tenant_id'):
            tenant_id = request.user.branch_id
            validated_data['tenant_id'] = tenant_id

        rows = validated_data.pop('expense_rows', [])

        if not validated_data.get('voucher_number'):
            validated_data['voucher_number'] = f"EXP-{uuid.uuid4().hex[:6].upper()}"

        expense = super().create(validated_data)

        total_amount = sum(
            (_safe_decimal(row.get('totalAmount')) for row in rows if isinstance(row, dict)),
            Decimal("0"),
        )

        voucher = Voucher.objects.create(
            tenant_id=expense.tenant_id,
            type='expense',
            date=expense.date,
            voucher_number=expense.voucher_number,
            total=total_amount,
            narration=expense.posting_note,
            source='expense_voucher',
            reference_id=expense.id,
        )

        setattr(expense, '_accounting_voucher_id', voucher.id)
        if any(field.name == 'voucher_id' for field in expense._meta.fields):
            expense.voucher_id = voucher.id
            expense.save(update_fields=['voucher_id'])

        # --- Sync to Normalized Expense Items Table ---
        self._sync_expense_items(expense, rows)

        # --- Double-Entry Posting for Expense (entries table) ---
        self._post_journal_entries(expense)

        return expense

    def _post_journal_entries(self, expense):
        """Post double-entry journal records for expense."""
        try:
            tenant_id = expense.tenant_id
            rows = expense.get_items()
            entries = []

            for row in rows:
                amt = float(row.total_amount or 0)
                if amt <= 0:
                    continue
                
                if row.expense_ledger_id:
                    entries.append({"ledger_id": row.expense_ledger_id, "debit": amt, "credit": 0})
                if row.post_to_ledger_id:
                    entries.append({"ledger_id": row.post_to_ledger_id, "debit": 0, "credit": amt})
            
            if len(entries) >= 2:
                post_transaction(
                    voucher_type="EXPENSE", 
                    voucher_id=expense.id, 
                    tenant_id=tenant_id, 
                    entries=entries, 
                    transaction_date=expense.date, 
                    voucher_number=expense.voucher_number
                )
                
        except Exception as e:
            print(f"Error posting expense to entries: {str(e)}")

    def update(self, instance, validated_data):
        rows = validated_data.pop('expense_rows', None)
        instance = super().update(instance, validated_data)
        
        if rows is not None:
            self._sync_expense_items(instance, rows)
            self._post_journal_entries(instance)
            
        return instance

    def _sync_expense_items(self, expense, rows):
        """Sync expense_rows JSON to ExpenseLineItem table."""
        if not rows: return
        tenant_id = expense.tenant_id
        
        ExpenseLineItem.objects.filter(expense_voucher=expense).delete()
        for row in rows:
            if not isinstance(row, dict): continue
            
            exp_led_val = row.get('expense')
            post_to_val = row.get('postTo')
            
            exp_led_obj = _resolve_ledger(exp_led_val, tenant_id)
            post_to_led_obj = _resolve_ledger(post_to_val, tenant_id)
            
            ExpenseLineItem.objects.create(
                expense_voucher=expense,
                tenant_id=tenant_id,
                expense_ledger_name=str(exp_led_val),
                expense_ledger_id=exp_led_obj.id if exp_led_obj else None,
                post_to_ledger_name=str(post_to_val),
                post_to_ledger_id=post_to_led_obj.id if post_to_led_obj else None,
                amount=_safe_decimal(row.get('amount', 0)),
                taxable_value=_safe_decimal(row.get('taxableValue', 0)),
                gst_rate=_safe_decimal(row.get('gstRate', row.get('taxRate', 0))),
                cgst=_safe_decimal(row.get('cgst', 0)),
                sgst=_safe_decimal(row.get('sgst', 0)),
                igst=_safe_decimal(row.get('igst', 0)),
                total_amount=_safe_decimal(row.get('totalAmount', 0))
            )
