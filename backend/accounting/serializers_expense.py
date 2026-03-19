from rest_framework import serializers
from .models_voucher_expense import VoucherExpense
from .models import Voucher
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

        return expense
