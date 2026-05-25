from rest_framework import serializers
from .models_voucher_expense import VoucherExpense, ExpenseLineItem
from .models import Voucher, MasterLedger, Transaction
from masters.models import MasterVoucherExpenses
from .services.ledger_service import post_transaction, _resolve_ledger
from decimal import Decimal, InvalidOperation
import uuid
import json
import logging

logger = logging.getLogger(__name__)


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
            'post_to_ledger_id', 'bill_ref_no', 'entry_note',
            'amount', 'taxable_value', 'gst_rate', 'cgst', 'sgst', 'igst', 'cess', 'show_tax', 'total_amount'
        ]

class VoucherExpenseSerializer(serializers.ModelSerializer):
    voucher_number = serializers.CharField(required=False, allow_blank=True)
    expense_rows = serializers.ListField(child=serializers.DictField(), required=False, write_only=True)
    uploaded_files = serializers.ListField(child=serializers.CharField(), required=False, write_only=True)
    line_items = ExpenseLineItemSerializer(many=True, read_only=True, source='rel_items')

    class Meta:
        model = VoucherExpense
        fields = [
            'id', 'date', 'voucher_series', 'voucher_number', 'expense_rows',
            'posting_note', 'uploaded_files',
            'total_amount', 'total_taxable_value', 'total_cgst', 'total_sgst', 'total_igst', 'total_cess',
            'tenant_id', 'created_at', 'updated_at', 'line_items'
        ]
        read_only_fields = ['tenant_id', 'created_at', 'updated_at', 'total_amount', 'total_taxable_value', 'total_cgst', 'total_sgst', 'total_igst', 'total_cess']

    @staticmethod
    def _parse_uploaded_files(raw_value):
        if isinstance(raw_value, list):
            return [str(v) for v in raw_value if v]
        if not raw_value:
            return []
        if isinstance(raw_value, str):
            text = raw_value.strip()
            if not text:
                return []
            try:
                parsed = json.loads(text)
                if isinstance(parsed, list):
                    return [str(v) for v in parsed if v]
            except Exception:
                pass
            return [v.strip() for v in text.split('\n') if v.strip()]
        return []

    @staticmethod
    def _encode_uploaded_files(files):
        file_list = [str(v).strip() for v in (files or []) if str(v).strip()]
        return '\n'.join(file_list)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['uploaded_files'] = self._parse_uploaded_files(getattr(instance, 'uploaded_files', ''))
        return data
    
    def create(self, validated_data):
        request = self.context.get('request')
        tenant_id = None
        if request and hasattr(request, 'user') and hasattr(request.user, 'tenant_id'):
            tenant_id = request.user.branch_id
            validated_data['tenant_id'] = tenant_id

        rows = validated_data.pop('expense_rows', [])
        uploaded_files = validated_data.pop('uploaded_files', [])

        # ── Voucher Numbering Logic ──────────────────────────────────────────
        voucher_series_name = validated_data.get('voucher_series')
        v_num = validated_data.get('voucher_number')
        series = None

        if voucher_series_name:
            series = MasterVoucherExpenses.objects.filter(
                tenant_id=tenant_id,
                voucher_name=voucher_series_name,
                is_active=True
            ).first()

        if series and series.enable_auto_numbering:
            # Always force increment if current v_num matches current state or is empty
            # OR if v_num is provided but we want to ensure uniqueness
            next_num = series.current_number or series.start_from or 1
            
            # Loop to ensure we find a truly unique number in Transaction table
            while True:
                digits = series.required_digits or 4
                prefix = series.prefix or ""
                suffix = series.suffix or ""
                candidate_num = f"{prefix}{str(next_num).zfill(digits)}{suffix}"
                
                if not Transaction.objects.filter(tenant_id=tenant_id, voucher_number=candidate_num).exists():
                    v_num = candidate_num
                    break
                next_num += 1
            
            # Update the series counter
            series.current_number = next_num + 1
            series.save(update_fields=['current_number'])
            validated_data['voucher_number'] = v_num
        else:
            # Fallback for manual or no series
            if not v_num or v_num == 'Manual Input' or v_num == 'Auto-generated':
                v_num = f"EXP-{uuid.uuid4().hex[:6].upper()}"
                validated_data['voucher_number'] = v_num
            else:
                # Manual input - check collision
                if Transaction.objects.filter(tenant_id=tenant_id, voucher_number=v_num).exists():
                    raise serializers.ValidationError({"voucher_number": f"Voucher number {v_num} already exists."})

        totals = {
            'total_amount': sum((_safe_decimal(row.get('totalAmount')) for row in rows if isinstance(row, dict)), Decimal("0")),
            'total_taxable_value': sum((_safe_decimal(row.get('taxableValue')) for row in rows if isinstance(row, dict)), Decimal("0")),
            'total_cgst': sum((_safe_decimal(row.get('cgst')) for row in rows if isinstance(row, dict)), Decimal("0")),
            'total_sgst': sum((_safe_decimal(row.get('sgst')) for row in rows if isinstance(row, dict)), Decimal("0")),
            'total_igst': sum((_safe_decimal(row.get('igst')) for row in rows if isinstance(row, dict)), Decimal("0")),
            'total_cess': sum((_safe_decimal(row.get('cess')) for row in rows if isinstance(row, dict)), Decimal("0")),
        }
        validated_data['uploaded_files'] = self._encode_uploaded_files(uploaded_files)
        validated_data.update(totals)
        expense = super().create(validated_data)

        party_name = 'N/A'
        if rows and isinstance(rows, list) and len(rows) > 0 and isinstance(rows[0], dict):
            post_to_val = rows[0].get('postTo')
            if post_to_val:
                party_name = str(post_to_val)

        voucher = Voucher.objects.create(
            tenant_id=expense.tenant_id,
            type='expense',
            date=expense.date,
            voucher_number=expense.voucher_number,
            total=totals['total_amount'],
            narration=expense.posting_note,
            source='expense_voucher',
            reference_id=expense.id,
            party=party_name,
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
            rows = expense.get_items() if hasattr(expense, "get_items") else expense.rel_items.all()
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
        uploaded_files = validated_data.pop('uploaded_files', None)
        if uploaded_files is not None:
            validated_data['uploaded_files'] = self._encode_uploaded_files(uploaded_files)
        instance = super().update(instance, validated_data)
        
        if rows is not None:
            totals = {
                'total_amount': sum((_safe_decimal(row.get('totalAmount')) for row in rows if isinstance(row, dict)), Decimal("0")),
                'total_taxable_value': sum((_safe_decimal(row.get('taxableValue')) for row in rows if isinstance(row, dict)), Decimal("0")),
                'total_cgst': sum((_safe_decimal(row.get('cgst')) for row in rows if isinstance(row, dict)), Decimal("0")),
                'total_sgst': sum((_safe_decimal(row.get('sgst')) for row in rows if isinstance(row, dict)), Decimal("0")),
                'total_igst': sum((_safe_decimal(row.get('igst')) for row in rows if isinstance(row, dict)), Decimal("0")),
                'total_cess': sum((_safe_decimal(row.get('cess')) for row in rows if isinstance(row, dict)), Decimal("0")),
            }
            instance.total_amount = totals['total_amount']
            instance.total_taxable_value = totals['total_taxable_value']
            instance.total_cgst = totals['total_cgst']
            instance.total_sgst = totals['total_sgst']
            instance.total_igst = totals['total_igst']
            instance.total_cess = totals['total_cess']
            instance.save()
            
            party_name = 'N/A'
            if rows and isinstance(rows, list) and len(rows) > 0 and isinstance(rows[0], dict):
                post_to_val = rows[0].get('postTo')
                if post_to_val:
                    party_name = str(post_to_val)

            voucher = Voucher.objects.filter(source='expense_voucher', reference_id=instance.id).first()
            if voucher:
                voucher.date = instance.date
                voucher.voucher_number = instance.voucher_number
                voucher.total = totals['total_amount']
                voucher.narration = instance.posting_note
                voucher.party = party_name
                voucher.save()

            self._sync_expense_items(instance, rows)
            self._post_journal_entries(instance)
            
        return instance

    def _sync_expense_items(self, expense, rows):
        """Sync frontend expense rows to normalized expense item columns."""
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
                bill_ref_no=(row.get('billRefNo') or '').strip() or None,
                entry_note=(row.get('entryNote') or '').strip() or None,
                amount=_safe_decimal(row.get('amount', row.get('totalAmount', 0))),
                taxable_value=_safe_decimal(row.get('taxableValue', 0)),
                gst_rate=_safe_decimal(row.get('gstRate', row.get('taxRate', 0))),
                cgst=_safe_decimal(row.get('cgst', 0)),
                sgst=_safe_decimal(row.get('sgst', 0)),
                igst=_safe_decimal(row.get('igst', 0)),
                cess=_safe_decimal(row.get('cess', 0)),
                show_tax=bool(row.get('showTax', False)),
                total_amount=_safe_decimal(row.get('totalAmount', 0))
            )
