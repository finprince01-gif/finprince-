from rest_framework import serializers
from .models_voucher_expense import VoucherExpense
from .models import Voucher, MasterLedger
from .services.ledger_service import post_transaction, _resolve_ledger
from decimal import Decimal, InvalidOperation
import uuid


def _safe_decimal(value):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")

class VoucherExpenseSerializer(serializers.ModelSerializer):
    voucher_number = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = VoucherExpense
        fields = '__all__'
        read_only_fields = ['tenant_id']
    
    def create(self, validated_data):
        request = self.context.get('request')
        tenant_id = None
        if request and hasattr(request.user, 'tenant_id'):
            tenant_id = request.user.tenant_id
            validated_data['tenant_id'] = tenant_id

        if not validated_data.get('voucher_number'):
            validated_data['voucher_number'] = f"EXP-{uuid.uuid4().hex[:6].upper()}"

        expense = super().create(validated_data)

        rows = expense.expense_rows if isinstance(expense.expense_rows, list) else []
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
            items_data=rows or None,
            source='expense_voucher',
            reference_id=expense.id,
        )

        setattr(expense, '_accounting_voucher_id', voucher.id)
        if any(field.name == 'voucher_id' for field in expense._meta.fields):
            expense.voucher_id = voucher.id
            expense.save(update_fields=['voucher_id'])

        # --- Double-Entry Posting for Expense (entries table) ---
        try:
            entries = []
            for row in rows:
                amt = float(_safe_decimal(row.get('totalAmount', 0)))
                if amt <= 0:
                    continue
                
                exp_ledger_val = row.get('expense')
                post_to_val = row.get('postTo')
                
                exp_ledger = _resolve_ledger(exp_ledger_val, tenant_id)
                post_to_ledger = _resolve_ledger(post_to_val, tenant_id)
                
                if exp_ledger:
                    # Debit Expense
                    entries.append({"ledger_id": exp_ledger.id, "debit": amt, "credit": 0})
                if post_to_ledger:
                    # Credit Source (Bank/Cash)
                    entries.append({"ledger_id": post_to_ledger.id, "debit": 0, "credit": amt})
            
            if len(entries) >= 2:
                post_transaction(voucher_type="EXPENSE", voucher_id=voucher.id, tenant_id=tenant_id, entries=entries)
                
        except Exception as e:
            print(f"Error posting expense to entries: {str(e)}")

        return expense
