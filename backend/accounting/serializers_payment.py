import uuid
from rest_framework import serializers  # type: ignore[import]
from .models_voucher_payment import VoucherPaymentSingle, VoucherPaymentBulk  # type: ignore[import]
from .models import MasterLedger, Voucher, JournalEntry  # type: ignore[import]
from accounting.services.ledger_service import post_transaction, _resolve_ledger
from customerportal.database import CustomerMasterCustomerBasicDetails
from vendors.models import VendorMasterBasicDetail
from decimal import Decimal, InvalidOperation


def _safe_decimal(value):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")

class VoucherPaymentSingleSerializer(serializers.ModelSerializer):
    pay_from_name = serializers.CharField(source='pay_from.name', read_only=True)
    pay_to_name = serializers.CharField(source='pay_to.name', read_only=True)
    
    pay_from = serializers.CharField(required=False, allow_null=True)
    pay_to = serializers.CharField(required=False, allow_null=True)
    voucher_number = serializers.CharField(required=False, allow_blank=True)
    
    class Meta:
        model = VoucherPaymentSingle
        fields = '__all__'
        read_only_fields = ['tenant_id']

    def validate(self, attrs):
        request = self.context.get('request')
        tenant_id = None
        if request and hasattr(request.user, 'tenant_id'):
            tenant_id = request.user.tenant_id

        pay_from_val = attrs.get('pay_from')
        pay_to_val = attrs.get('pay_to')

        if pay_from_val is not None and not hasattr(pay_from_val, 'pk'):
            attrs['pay_from'] = _resolve_ledger(pay_from_val, tenant_id)

        if pay_to_val is not None and not hasattr(pay_to_val, 'pk'):
            attrs['pay_to'] = _resolve_ledger(pay_to_val, tenant_id)

        return attrs

    def create(self, validated_data):
        if not validated_data.get('voucher_number'):
            validated_data['voucher_number'] = f"PAY-{uuid.uuid4().hex[:6].upper()}"
            
        payment = super().create(validated_data)

        # Unified voucher for global tracking
        # We use a filter check first to avoid poisoning the outer atomic transaction if creation fails
        voucher = Voucher.objects.filter(
            tenant_id=payment.tenant_id, 
            type='payment', 
            voucher_number=payment.voucher_number
        ).first()

        if not voucher:
            try:
                voucher = Voucher.objects.create(
                    tenant_id=payment.tenant_id,
                    type='payment',
                    date=payment.date,
                    voucher_number=payment.voucher_number,
                    party=payment.pay_to.name if payment.pay_to else None,
                    account=payment.pay_from.name if payment.pay_from else None,
                    amount=payment.total_payment,
                    total=payment.total_payment,
                    source=payment.source or 'manual',
                    reference_id=payment.id,
                )
            except Exception as e:
                print(f"!!! VOUCHER CREATION FAILED in payment serializer: {str(e)}")
                # Transaction might be poisoned here if this was an IntegrityError 
                # but the check above should have caught it.
                pass

        if voucher:
            # Refresh if it was just created/found
            setattr(payment, '_accounting_voucher_id', voucher.id)
            if any(field.name == 'voucher_id' for field in payment._meta.fields):
                payment.voucher_id = voucher.id
                payment.save(update_fields=['voucher_id'])

        # --- Double-Entry Posting for Single Payment (entries table) ---
        try:
            total_decimal = _safe_decimal(payment.total_payment)
            if total_decimal > 0 and voucher:
                entries = []
                if payment.pay_to:
                    entries.append({"ledger_id": payment.pay_to.id, "debit": float(total_decimal), "credit": 0})
                if payment.pay_from:
                    entries.append({"ledger_id": payment.pay_from.id, "debit": 0, "credit": float(total_decimal)})
                
                if len(entries) == 2:
                    post_transaction(voucher_type="PAYMENT", voucher_id=voucher.id, tenant_id=payment.tenant_id, entries=entries)
        except Exception as e:
            print(f"Error posting payment to entries: {str(e)}")

        self._mirror_to_vendor_portal(payment)
        return payment

    def _mirror_to_vendor_portal(self, payment, is_bulk=False):
        """Mirror Payment vouchers to Vendor Portal ledger"""
        try:
            from vendors.models import VendorMasterBasicDetail, VendorTransaction
            tenant_id = payment.tenant_id
            
            if is_bulk:
                rows = payment.payment_rows if isinstance(payment.payment_rows, list) else []
                for row in rows:
                    amt = _safe_decimal(row.get('amount'))
                    pay_to_id = row.get('payTo')
                    if amt > 0 and pay_to_id:
                        # Find vendor master
                        vendor = VendorMasterBasicDetail.objects.filter(tenant_id=tenant_id, ledger_id=pay_to_id).first()
                        if vendor:
                            VendorTransaction.objects.update_or_create(
                                tenant_id=tenant_id,
                                vendor_id=vendor.id,
                                transaction_number=payment.voucher_number,
                                transaction_type='payment',
                                defaults={
                                    'transaction_date': payment.date,
                                    'amount': amt,
                                    'total_amount': amt,
                                    'status': 'Paid',
                                    'reference_number': row.get('reference') or payment.voucher_number,
                                    'notes': payment.posting_note,
                                    'ledger_name': vendor.vendor_name
                                }
                            )
            else:
                if payment.pay_to:
                    vendor = VendorMasterBasicDetail.objects.filter(tenant_id=tenant_id, ledger_id=payment.pay_to.id).first()
                    if vendor:
                        amt = _safe_decimal(payment.total_payment)
                        VendorTransaction.objects.update_or_create(
                            tenant_id=tenant_id,
                            vendor_id=vendor.id,
                            transaction_number=payment.voucher_number,
                            transaction_type='payment',
                            defaults={
                                'transaction_date': payment.date,
                                'amount': amt,
                                'total_amount': amt,
                                'status': 'Paid',
                                'reference_number': payment.voucher_number,
                                'notes': payment.narration,
                                'ledger_name': vendor.vendor_name
                            }
                        )
        except Exception as e:
            print(f"!!! Vendor Portal Sync Failure (Payment): {str(e)}")

class VoucherPaymentBulkSerializer(serializers.ModelSerializer):
    pay_from_name = serializers.CharField(source='pay_from.name', read_only=True)
    pay_from = serializers.CharField(required=False, allow_null=True)
    voucher_number = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = VoucherPaymentBulk
        fields = '__all__'
        read_only_fields = ['tenant_id']

    def validate(self, attrs):
        request = self.context.get('request')
        tenant_id = None
        if request and hasattr(request.user, 'tenant_id'):
            tenant_id = request.user.tenant_id

        pay_from_val = attrs.get('pay_from')
        if pay_from_val is not None and not hasattr(pay_from_val, 'pk'):
            attrs['pay_from'] = _resolve_ledger(pay_from_val, tenant_id)

        return attrs

    def create(self, validated_data):
        if not validated_data.get('voucher_number'):
            validated_data['voucher_number'] = f"PAYB-{uuid.uuid4().hex[:6].upper()}"
            
        payment = super().create(validated_data)

        # Calculate total
        payment_rows = payment.payment_rows if isinstance(payment.payment_rows, list) else []
        total_amount = sum(
            (_safe_decimal(row.get('amount')) for row in payment_rows if isinstance(row, dict)),
            Decimal("0"),
        )

        # Check existing voucher
        voucher = Voucher.objects.filter(
            tenant_id=payment.tenant_id, 
            type='payment', 
            voucher_number=payment.voucher_number
        ).first()

        if not voucher:
            try:
                voucher = Voucher.objects.create(
                    tenant_id=payment.tenant_id,
                    type='payment',
                    date=payment.date,
                    voucher_number=payment.voucher_number,
                    account=payment.pay_from.name if payment.pay_from else None,
                    amount=total_amount,
                    total=total_amount,
                    narration=payment.posting_note,
                    source='manual',
                    items_data=payment_rows or None,
                    reference_id=payment.id,
                )
            except Exception as e:
                print(f"!!! VOUCHER CREATION FAILED in bulk payment: {str(e)}")
                pass

        if voucher:
            setattr(payment, '_accounting_voucher_id', voucher.id)
            if any(field.name == 'voucher_id' for field in payment._meta.fields):
                payment.voucher_id = voucher.id
                payment.save(update_fields=['voucher_id'])

        # --- Double-Entry Posting for Bulk Payment (entries table) ---
        try:
            if voucher:
                entries = []
                total_bulk_decimal = Decimal("0")
                rows = payment.payment_rows if isinstance(payment.payment_rows, list) else []
                
                for row in rows:
                    amt_dec = _safe_decimal(row.get('amount', 0))
                    pay_to_id = row.get('payTo')
                    if amt_dec > 0 and pay_to_id:
                        total_bulk_decimal += amt_dec
                        entries.append({"ledger_id": pay_to_id, "debit": float(amt_dec), "credit": 0})
                
                if total_bulk_decimal > 0 and payment.pay_from:
                    entries.append({"ledger_id": payment.pay_from.id, "debit": 0, "credit": float(total_bulk_decimal)})
                    if len(entries) >= 2:
                        post_transaction(voucher_type="PAYMENT_BULK", voucher_id=voucher.id, tenant_id=payment.tenant_id, entries=entries)
        except Exception as e:
            print(f"Error posting bulk payment to entries: {str(e)}")

        self._mirror_to_vendor_portal(payment, is_bulk=True)

        return payment
