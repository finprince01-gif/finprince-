from rest_framework import serializers
from django.db import transaction
from .models_voucher_credit_note import (
    VoucherCreditNoteInvoiceDetails,
    VoucherCreditNoteItemDetails,
    VoucherCreditNoteDueDetails,
    VoucherCreditNoteTransitDetails
)

class VoucherCreditNoteItemDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherCreditNoteItemDetails
        fields = [
            'items', 'total_taxable_value', 'total_igst', 
            'total_cgst', 'total_sgst', 'total_cess', 'total_invoice_value'
        ]
        read_only_fields = ['tenant_id']

class VoucherCreditNoteDueDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherCreditNoteDueDetails
        exclude = ['credit_note_details']
        read_only_fields = ['tenant_id']

class VoucherCreditNoteTransitDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherCreditNoteTransitDetails
        exclude = ['credit_note_details']
        read_only_fields = ['tenant_id']

class VoucherCreditNoteInvoiceDetailsSerializer(serializers.ModelSerializer):
    item_details = VoucherCreditNoteItemDetailsSerializer()
    due_details = VoucherCreditNoteDueDetailsSerializer()
    transit_details = VoucherCreditNoteTransitDetailsSerializer()

    class Meta:
        model = VoucherCreditNoteInvoiceDetails
        fields = '__all__'
        read_only_fields = ['tenant_id']

    def create(self, validated_data):
        item_data = validated_data.pop('item_details', None) or {}
        due_data = validated_data.pop('due_details', None) or {}
        transit_data = validated_data.pop('transit_details', None) or {}
        
        request = self.context.get('request')
        tenant_id = None
        if request:
            from core.tenant import get_tenant_from_request
            tenant_id = get_tenant_from_request(request)
            validated_data['tenant_id'] = tenant_id

        try:
            with transaction.atomic():
                # Create Header
                instance = VoucherCreditNoteInvoiceDetails.objects.create(**validated_data)

                # Create Items
                item_instance = VoucherCreditNoteItemDetails.objects.create(
                    credit_note_details=instance, tenant_id=tenant_id, **item_data
                )
                
                # Create Due
                VoucherCreditNoteDueDetails.objects.create(
                    credit_note_details=instance, tenant_id=tenant_id, **due_data
                )
                
                # Create Transit
                VoucherCreditNoteTransitDetails.objects.create(
                    credit_note_details=instance, tenant_id=tenant_id, **transit_data
                )

                # ── Build global Voucher reference ────────────────────────────
                from .models import Voucher
                from decimal import Decimal
                
                cn_number = instance.credit_note_no or f"CN-{instance.id}"
                
                # Securely calculate totals for Voucher table
                total_val = Decimal('0.00')
                try:
                    total_val = Decimal(str(item_instance.total_invoice_value or 0))
                except:
                    pass

                Voucher.objects.create(
                    tenant_id=tenant_id,
                    type="credit_note",
                    date=instance.date,
                    voucher_number=cn_number,
                    party=instance.customer_name,
                    total=total_val,
                    source="credit_note_voucher",
                    reference_id=instance.id,
                    total_taxable_amount=Decimal(str(item_instance.total_taxable_value or 0)),
                    total_cgst=Decimal(str(item_instance.total_cgst or 0)),
                    total_sgst=Decimal(str(item_instance.total_sgst or 0)),
                    total_igst=Decimal(str(item_instance.total_igst or 0)),
                    items_data=item_instance.items,
                )

                return instance
        except Exception as e:
            # Re-throw with more context if needed, or let standard handler catch it
            raise serializers.ValidationError(f"Failed to create Credit Note: {str(e)}")

    def update(self, instance, validated_data):
        item_data = validated_data.pop('item_details', None)
        due_data = validated_data.pop('due_details', None)
        transit_data = validated_data.pop('transit_details', None)

        try:
            with transaction.atomic():
                # Update Header
                for attr, value in validated_data.items():
                    setattr(instance, attr, value)
                instance.save()

                # Update Related
                if item_data:
                    VoucherCreditNoteItemDetails.objects.update_or_create(
                        credit_note_details=instance, 
                        defaults={**item_data, 'tenant_id': instance.tenant_id}
                    )
                if due_data:
                    VoucherCreditNoteDueDetails.objects.update_or_create(
                        credit_note_details=instance, 
                        defaults={**due_data, 'tenant_id': instance.tenant_id}
                    )
                if transit_data:
                    VoucherCreditNoteTransitDetails.objects.update_or_create(
                        credit_note_details=instance, 
                        defaults={**transit_data, 'tenant_id': instance.tenant_id}
                    )

                return instance
        except Exception as e:
            raise serializers.ValidationError(f"Failed to update Credit Note: {str(e)}")
