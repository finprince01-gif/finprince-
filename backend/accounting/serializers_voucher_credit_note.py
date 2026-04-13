from rest_framework import serializers
from django.db import transaction
from decimal import Decimal
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

                # Mirror to Customer Portal
                self._mirror_to_customer_portal(instance)

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
                
                # Mirror to Customer Portal (Updates existing record using update_or_create)
                self._mirror_to_customer_portal(instance)

                return instance
        except Exception as e:
            raise serializers.ValidationError(f"Failed to update Credit Note: {str(e)}")

    def _mirror_to_customer_portal(self, instance):
        """
        Push this Credit Note to the Customer Portal's transactions table.
        """
        try:
            from customerportal.database import CustomerMasterCustomer, CustomerTransaction
            
            # Resolve portal customer
            portal_customer = None
            if instance.customer_id:
                portal_customer = CustomerMasterCustomer.objects.filter(
                    tenant_id=instance.tenant_id, 
                    id=instance.customer_id
                ).first()
            if not portal_customer and instance.customer_name:
                portal_customer = CustomerMasterCustomer.objects.filter(
                    tenant_id=instance.tenant_id, 
                    customer_name__iexact=instance.customer_name
                ).first()

            if not portal_customer:
                print(f"!!! Portal Sync: No portal customer found for '{instance.customer_name}'")
                return

            # Get amount from item details
            total_amt = Decimal('0')
            try:
                # Refresh from DB to ensure OneToOne fields are attached
                instance.refresh_from_db()
                if hasattr(instance, 'item_details'):
                    total_amt = instance.item_details.total_invoice_value
            except:
                pass
            
            cn_number = instance.credit_note_no or f"CN-{instance.id}"

            # We use update_or_create based on transaction_number + tenant_id
            CustomerTransaction.objects.update_or_create(
                tenant_id=instance.tenant_id,
                transaction_number=cn_number,
                transaction_type='CREDIT_NOTE',
                defaults={
                    'customer_id': portal_customer.id,
                    'transaction_date': instance.date,
                    'amount': total_amt,
                    'total_amount': total_amt,
                    'payment_status': 'Open',
                    'reference_number': instance.sales_invoice_nos.split(',')[0] if instance.sales_invoice_nos else '',
                    'notes': instance.narration or f"Credit Note linked to Invoices: {instance.sales_invoice_nos}"
                }
            )
            print(f"!!! Portal Sync OK (Credit Note): {instance.customer_name} | {cn_number}")
        except Exception as e:
            print(f"!!! Portal Sync Failure (Credit Note): {str(e)}")
