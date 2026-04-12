from rest_framework import serializers
from .models import (
    InventoryMasterCategory, InventoryLocation, InventoryItem, InventoryUnit,
    InventoryMasterGRN, InventoryMasterIssueSlip,
    InventoryOperationJobWork,
    InventoryOperationInterUnit,
    InventoryOperationLocationChange,
    InventoryOperationProduction,
    InventoryOperationConsumption,
    InventoryOperationScrap,
    InventoryOperationOutward,
    InventoryOperationNewGRN,
    InventoryOperationJobWorkItem,
    InventoryOperationInterUnitItem,
    InventoryOperationLocationChangeItem,
    InventoryOperationProductionItem,
    InventoryOperationConsumptionItem,
    InventoryOperationScrapItem,
    InventoryOperationOutwardItem,
    InventoryOperationNewGRNItem
)
import json
from decimal import Decimal

class InventoryMasterCategorySerializer(serializers.ModelSerializer):
    full_path = serializers.ReadOnlyField()
    group = serializers.CharField(required=False, allow_null=True, allow_blank=True, default='')
    subgroup = serializers.CharField(required=False, allow_null=True, allow_blank=True, default='')
    sub_subgroup = serializers.CharField(required=False, allow_null=True, allow_blank=True, default='')
    
    class Meta:
        model = InventoryMasterCategory
        fields = ['id', 'tenant_id', 'category', 'group', 'subgroup', 'sub_subgroup', 'full_path', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at', 'full_path']

    def validate_group(self, value):
        return value if value is not None else ''

    def validate_subgroup(self, value):
        return value if value is not None else ''

    def validate_sub_subgroup(self, value):
        return value if value is not None else ''

class InventoryLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryLocation
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

class InventoryItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryItem
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

class InventoryUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryUnit
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

class InventoryMasterGRNSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryMasterGRN
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

class InventoryMasterIssueSlipSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryMasterIssueSlip
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']


class InventoryOperationItemSyncMixin:
    items = serializers.JSONField(write_only=True, required=False)
    eway_bill_details = serializers.JSONField(write_only=True, required=False)

    def _sync_items(self, instance, item_model, items_data):
        """Bridge between virtual JSON items in payload and normalized child tables."""
        if not items_data: return
        if isinstance(items_data, str):
            try: items_data = json.loads(items_data)
            except: return
        
        if not isinstance(items_data, list): return

        item_model.objects.filter(parent=instance).delete()
        for idx, item in enumerate(items_data):
            if not isinstance(item, dict): continue
            
            # Flexible key mapping for different operation types
            qty = item.get('qty', item.get('quantity', item.get('qty_issued', item.get('quantityIssued', item.get('quantityProduced', 0)))))
            rate = item.get('rate', item.get('itemRate', 0))
            
            item_model.objects.create(
                parent=instance,
                tenant_id=instance.tenant_id,
                item_code=item.get('itemCode', item.get('item_code', '')),
                item_name=item.get('itemName', item.get('item_name', '')),
                description=item.get('description', ''),
                quantity=Decimal(str(qty or 0)),
                uom=item.get('uom', ''),
                rate=Decimal(str(rate or 0)),
                taxable_value=Decimal(str(item.get('taxableValue', item.get('taxable_value', 0)))),
                gst_rate=Decimal(str(item.get('gstRate', item.get('gst_rate', 0)))),
                cgst=Decimal(str(item.get('cgst', 0))),
                sgst=Decimal(str(item.get('sgst', 0))),
                igst=Decimal(str(item.get('igst', 0))),
                total_value=Decimal(str(item.get('amount', item.get('total_value', 0)))),
                original_idx=idx
            )

    def _sync_eway_bills(self, instance, operation_type, eway_data):
        """Sync virtual E-Way Bill JSON to normalized table."""
        from .models import InventoryOperationEWayBill
        if not eway_data: return
        if isinstance(eway_data, str):
            try: eway_data = json.loads(eway_data)
            except: return
        if not isinstance(eway_data, list): return

        InventoryOperationEWayBill.objects.filter(operation_type=operation_type, operation_id=instance.id).delete()
        for row in eway_data:
            if not isinstance(row, dict): continue
            InventoryOperationEWayBill.objects.create(
                tenant_id=instance.tenant_id,
                operation_type=operation_type,
                operation_id=instance.id,
                eway_bill_no=row.get('ewayBillNo', row.get('eway_bill_no', '')),
                eway_bill_date=row.get('ewayBillDate', row.get('eway_bill_date')),
                distance=row.get('distance', ''),
                vehicle_no=row.get('vehicleNo', row.get('vehicle_no', '')),
                validity=row.get('validity', ''),
                status=row.get('status', 'Active')
            )

# -------------------------------------------------------------------------
# OPERATION ITEM SERIALIZERS
# -------------------------------------------------------------------------

class InventoryOperationJobWorkItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationJobWorkItem
        fields = '__all__'

class InventoryOperationInterUnitItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationInterUnitItem
        fields = '__all__'

class InventoryOperationLocationChangeItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationLocationChangeItem
        fields = '__all__'

class InventoryOperationProductionItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationProductionItem
        fields = '__all__'

class InventoryOperationConsumptionItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationConsumptionItem
        fields = '__all__'

class InventoryOperationScrapItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationScrapItem
        fields = '__all__'

class InventoryOperationOutwardItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationOutwardItem
        fields = '__all__'

class InventoryOperationNewGRNItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationNewGRNItem
        fields = '__all__'

# -------------------------------------------------------------------------
# OPERATION SERIALIZERS
# -------------------------------------------------------------------------

# --- Job Work ---
class InventoryOperationJobWorkSerializer(InventoryOperationItemSyncMixin, serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationJobWork
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

    def create(self, validated_data):
        dc_data = validated_data.get('delivery_challan', None)

        if dc_data:
            validated_data['dispatch_from'] = dc_data.get('dispatch_from')
            if not validated_data.get('dispatch_from'):
                 validated_data['dispatch_from'] = dc_data.get('dispatch_address')

            validated_data['mode_of_transport'] = dc_data.get('mode_of_transport')
            
            d_date = dc_data.get('dispatch_date')
            validated_data['dispatch_date'] = d_date if d_date else None
            
            d_time = dc_data.get('dispatch_time')
            validated_data['dispatch_time'] = d_time if d_time else None
            
            validated_data['delivery_type'] = dc_data.get('delivery_type')
            validated_data['transporter_id'] = dc_data.get('transporter_id')
            validated_data['transporter_name'] = dc_data.get('transporter_name')
            validated_data['vehicle_no'] = dc_data.get('vehicle_no')

            if not validated_data.get('vehicle_no'):
                 validated_data['vehicle_no'] = dc_data.get('vehicle_number')

            validated_data['lr_gr_consignment'] = dc_data.get('lr_gr_consignment')

        items_data = validated_data.pop('items', [])
        eway_data = validated_data.pop('eway_bill_details', [])
        instance = super().create(validated_data)
        self._sync_items(instance, InventoryOperationJobWorkItem, items_data)
        self._sync_eway_bills(instance, 'jobwork', eway_data)
        return instance

    def update(self, instance, validated_data):
        dc_data = validated_data.get('delivery_challan', None)
        
        if dc_data:
            instance.dispatch_from = dc_data.get('dispatch_from', instance.dispatch_from)
            if not instance.dispatch_from and dc_data.get('dispatch_address'):
                 instance.dispatch_from = dc_data.get('dispatch_address')
            
            instance.mode_of_transport = dc_data.get('mode_of_transport', instance.mode_of_transport)
            
            d_date = dc_data.get('dispatch_date')
            if d_date is not None:
                instance.dispatch_date = d_date if d_date else None
            
            d_time = dc_data.get('dispatch_time')
            if d_time is not None:
                instance.dispatch_time = d_time if d_time else None
            
            instance.delivery_type = dc_data.get('delivery_type', instance.delivery_type)
            instance.transporter_id = dc_data.get('transporter_id', instance.transporter_id)
            instance.transporter_name = dc_data.get('transporter_name', instance.transporter_name)
            
            instance.vehicle_no = dc_data.get('vehicle_no', instance.vehicle_no)
            if not instance.vehicle_no and dc_data.get('vehicle_number'):
                 instance.vehicle_no = dc_data.get('vehicle_number')

            instance.lr_gr_consignment = dc_data.get('lr_gr_consignment', instance.lr_gr_consignment)
            
        items_data = validated_data.pop('items', None)
        eway_data = validated_data.pop('eway_bill_details', None)
        instance = super().update(instance, validated_data)
        if items_data is not None:
            self._sync_items(instance, InventoryOperationJobWorkItem, items_data)
        if eway_data is not None:
            self._sync_eway_bills(instance, 'jobwork', eway_data)
        return instance

# --- Inter Unit ---
class InventoryOperationInterUnitSerializer(InventoryOperationItemSyncMixin, serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationInterUnit
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

    def create(self, validated_data):
        dc_data = validated_data.get('delivery_challan', None)

        if dc_data:
            validated_data['dispatch_from'] = dc_data.get('dispatch_from')
            if not validated_data.get('dispatch_from'):
                 validated_data['dispatch_from'] = dc_data.get('dispatch_address')

            validated_data['mode_of_transport'] = dc_data.get('mode_of_transport')
            
            d_date = dc_data.get('dispatch_date')
            validated_data['dispatch_date'] = d_date if d_date else None
            
            d_time = dc_data.get('dispatch_time')
            validated_data['dispatch_time'] = d_time if d_time else None
            
            validated_data['delivery_type'] = dc_data.get('delivery_type')
            validated_data['transporter_id'] = dc_data.get('transporter_id')
            validated_data['transporter_name'] = dc_data.get('transporter_name')
            validated_data['vehicle_no'] = dc_data.get('vehicle_no')

            if not validated_data.get('vehicle_no'):
                 validated_data['vehicle_no'] = dc_data.get('vehicle_number')

            validated_data['lr_gr_consignment'] = dc_data.get('lr_gr_consignment')

        items_data = validated_data.pop('items', [])
        eway_data = validated_data.pop('eway_bill_details', [])
        instance = super().create(validated_data)
        self._sync_items(instance, InventoryOperationInterUnitItem, items_data)
        self._sync_eway_bills(instance, 'interunit', eway_data)
        return instance

    def update(self, instance, validated_data):
        dc_data = validated_data.get('delivery_challan', None)
        
        if dc_data:
            instance.dispatch_from = dc_data.get('dispatch_from', instance.dispatch_from)
            if not instance.dispatch_from and dc_data.get('dispatch_address'):
                 instance.dispatch_from = dc_data.get('dispatch_address')
            
            instance.mode_of_transport = dc_data.get('mode_of_transport', instance.mode_of_transport)
            
            d_date = dc_data.get('dispatch_date')
            if d_date is not None:
                instance.dispatch_date = d_date if d_date else None
            
            d_time = dc_data.get('dispatch_time')
            if d_time is not None:
                instance.dispatch_time = d_time if d_time else None
            
            instance.delivery_type = dc_data.get('delivery_type', instance.delivery_type)
            instance.transporter_id = dc_data.get('transporter_id', instance.transporter_id)
            instance.transporter_name = dc_data.get('transporter_name', instance.transporter_name)
            
            instance.vehicle_no = dc_data.get('vehicle_no', instance.vehicle_no)
            if not instance.vehicle_no and dc_data.get('vehicle_number'):
                 instance.vehicle_no = dc_data.get('vehicle_number')

            instance.lr_gr_consignment = dc_data.get('lr_gr_consignment', instance.lr_gr_consignment)
            
        items_data = validated_data.pop('items', None)
        eway_data = validated_data.pop('eway_bill_details', None)
        instance = super().update(instance, validated_data)
        if items_data is not None:
            self._sync_items(instance, InventoryOperationInterUnitItem, items_data)
        if eway_data is not None:
             self._sync_eway_bills(instance, 'interunit', eway_data)
        return instance

# --- Location Change ---
class InventoryOperationLocationChangeSerializer(InventoryOperationItemSyncMixin, serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationLocationChange
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

    def create(self, validated_data):
        dc_data = validated_data.get('delivery_challan', None)

        if dc_data:
            validated_data['dispatch_from'] = dc_data.get('dispatch_from')
            if not validated_data.get('dispatch_from'):
                 validated_data['dispatch_from'] = dc_data.get('dispatch_address')

            validated_data['mode_of_transport'] = dc_data.get('mode_of_transport')
            
            d_date = dc_data.get('dispatch_date')
            validated_data['dispatch_date'] = d_date if d_date else None
            
            d_time = dc_data.get('dispatch_time')
            validated_data['dispatch_time'] = d_time if d_time else None
            
            validated_data['delivery_type'] = dc_data.get('delivery_type')
            validated_data['transporter_id'] = dc_data.get('transporter_id')
            validated_data['transporter_name'] = dc_data.get('transporter_name')
            validated_data['vehicle_no'] = dc_data.get('vehicle_no')

            if not validated_data.get('vehicle_no'):
                 validated_data['vehicle_no'] = dc_data.get('vehicle_number')

            validated_data['lr_gr_consignment'] = dc_data.get('lr_gr_consignment')

        items_data = validated_data.pop('items', [])
        eway_data = validated_data.pop('eway_bill_details', [])
        instance = super().create(validated_data)
        self._sync_items(instance, InventoryOperationLocationChangeItem, items_data)
        self._sync_eway_bills(instance, 'location_change', eway_data)
        return instance

    def update(self, instance, validated_data):
        dc_data = validated_data.get('delivery_challan', None)
        
        if dc_data:
            instance.dispatch_from = dc_data.get('dispatch_from', instance.dispatch_from)
            if not instance.dispatch_from and dc_data.get('dispatch_address'):
                 instance.dispatch_from = dc_data.get('dispatch_address')
            
            instance.mode_of_transport = dc_data.get('mode_of_transport', instance.mode_of_transport)
            
            d_date = dc_data.get('dispatch_date')
            if d_date is not None:
                instance.dispatch_date = d_date if d_date else None
            
            d_time = dc_data.get('dispatch_time')
            if d_time is not None:
                instance.dispatch_time = d_time if d_time else None
            
            instance.delivery_type = dc_data.get('delivery_type', instance.delivery_type)
            instance.transporter_id = dc_data.get('transporter_id', instance.transporter_id)
            instance.transporter_name = dc_data.get('transporter_name', instance.transporter_name)
            
            instance.vehicle_no = dc_data.get('vehicle_no', instance.vehicle_no)
            if not instance.vehicle_no and dc_data.get('vehicle_number'):
                 instance.vehicle_no = dc_data.get('vehicle_number')

            instance.lr_gr_consignment = dc_data.get('lr_gr_consignment', instance.lr_gr_consignment)
            
        items_data = validated_data.pop('items', None)
        eway_data = validated_data.pop('eway_bill_details', None)
        instance = super().update(instance, validated_data)
        if items_data is not None:
            self._sync_items(instance, InventoryOperationLocationChangeItem, items_data)
        if eway_data is not None:
            self._sync_eway_bills(instance, 'location_change', eway_data)
        return instance

# --- Production ---
class InventoryOperationProductionSerializer(InventoryOperationItemSyncMixin, serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationProduction
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

    def validate(self, data):
        items = data.get('items', [])
        if items:
            for item in items:
                qty = 0
                for k in ['qty_issued', 'quantity', 'quantityIssued', 'quantityProduced', 'issueQty']:
                    if k in item and item[k]:
                        try:
                            qty = float(item[k])
                            break
                        except (ValueError, TypeError):
                            continue
                rate = 0
                if 'rate' in item and item['rate']:
                    try: rate = float(item['rate'])
                    except (ValueError, TypeError): pass
                item['amount'] = round(qty * rate, 2)
        return data

    def create(self, validated_data):
        dc_data = validated_data.get('delivery_challan', None)
        if dc_data:
            validated_data['dispatch_from'] = dc_data.get('dispatch_from')
            if not validated_data.get('dispatch_from'):
                 validated_data['dispatch_from'] = dc_data.get('dispatch_address')
            validated_data['mode_of_transport'] = dc_data.get('mode_of_transport')
            d_date = dc_data.get('dispatch_date')
            validated_data['dispatch_date'] = d_date if d_date else None
            d_time = dc_data.get('dispatch_time')
            validated_data['dispatch_time'] = d_time if d_time else None
            validated_data['delivery_type'] = dc_data.get('delivery_type')
            validated_data['transporter_id'] = dc_data.get('transporter_id')
            validated_data['transporter_name'] = dc_data.get('transporter_name')
            validated_data['vehicle_no'] = dc_data.get('vehicle_no')
            if not validated_data.get('vehicle_no'):
                 validated_data['vehicle_no'] = dc_data.get('vehicle_number')
            validated_data['lr_gr_consignment'] = dc_data.get('lr_gr_consignment')

        items_data = validated_data.pop('items', [])
        eway_data = validated_data.pop('eway_bill_details', [])
        instance = super().create(validated_data)
        self._sync_items(instance, InventoryOperationProductionItem, items_data)
        self._sync_eway_bills(instance, 'production', eway_data)
        return instance

    def update(self, instance, validated_data):
        dc_data = validated_data.get('delivery_challan', None)
        if dc_data:
            instance.dispatch_from = dc_data.get('dispatch_from', instance.dispatch_from)
            if not instance.dispatch_from and dc_data.get('dispatch_address'):
                 instance.dispatch_from = dc_data.get('dispatch_address')
            instance.mode_of_transport = dc_data.get('mode_of_transport', instance.mode_of_transport)
            d_date = dc_data.get('dispatch_date')
            if d_date is not None: instance.dispatch_date = d_date if d_date else None
            d_time = dc_data.get('dispatch_time')
            if d_time is not None: instance.dispatch_time = d_time if d_time else None
            instance.delivery_type = dc_data.get('delivery_type', instance.delivery_type)
            instance.transporter_id = dc_data.get('transporter_id', instance.transporter_id)
            instance.transporter_name = dc_data.get('transporter_name', instance.transporter_name)
            instance.vehicle_no = dc_data.get('vehicle_no', instance.vehicle_no)
            if not instance.vehicle_no and dc_data.get('vehicle_number'):
                 instance.vehicle_no = dc_data.get('vehicle_number')
            instance.lr_gr_consignment = dc_data.get('lr_gr_consignment', instance.lr_gr_consignment)
            
        items_data = validated_data.pop('items', None)
        eway_data = validated_data.pop('eway_bill_details', None)
        instance = super().update(instance, validated_data)
        if items_data is not None:
            self._sync_items(instance, InventoryOperationProductionItem, items_data)
        if eway_data is not None:
             self._sync_eway_bills(instance, 'production', eway_data)
        return instance

# --- Consumption ---
class InventoryOperationConsumptionSerializer(InventoryOperationItemSyncMixin, serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationConsumption
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        instance = super().create(validated_data)
        self._sync_items(instance, InventoryOperationConsumptionItem, items_data)
        return instance

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        self._sync_items(instance, InventoryOperationConsumptionItem)
        return instance

# --- Scrap ---
class InventoryOperationScrapSerializer(InventoryOperationItemSyncMixin, serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationScrap
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

    def create(self, validated_data):
        dc_data = validated_data.get('delivery_challan', None)
        if dc_data:
            validated_data['dispatch_from'] = dc_data.get('dispatch_from')
            if not validated_data.get('dispatch_from'):
                 validated_data['dispatch_from'] = dc_data.get('dispatch_address')
            validated_data['mode_of_transport'] = dc_data.get('mode_of_transport')
            d_date = dc_data.get('dispatch_date')
            validated_data['dispatch_date'] = d_date if d_date else None
            d_time = dc_data.get('dispatch_time')
            validated_data['dispatch_time'] = d_time if d_time else None
            validated_data['delivery_type'] = dc_data.get('delivery_type')
            validated_data['transporter_id'] = dc_data.get('transporter_id')
            validated_data['transporter_name'] = dc_data.get('transporter_name')
            validated_data['vehicle_no'] = dc_data.get('vehicle_no')
            if not validated_data.get('vehicle_no'):
                 validated_data['vehicle_no'] = dc_data.get('vehicle_number')
            validated_data['lr_gr_consignment'] = dc_data.get('lr_gr_consignment')

        instance = super().create(validated_data)
        self._sync_items(instance, InventoryOperationScrapItem)
        return instance

    def update(self, instance, validated_data):
        dc_data = validated_data.get('delivery_challan', None)
        if dc_data:
            instance.dispatch_from = dc_data.get('dispatch_from', instance.dispatch_from)
            if not instance.dispatch_from and dc_data.get('dispatch_address'):
                 instance.dispatch_from = dc_data.get('dispatch_address')
            instance.mode_of_transport = dc_data.get('mode_of_transport', instance.mode_of_transport)
            d_date = dc_data.get('dispatch_date')
            if d_date is not None: instance.dispatch_date = d_date if d_date else None
            d_time = dc_data.get('dispatch_time')
            if d_time is not None: instance.dispatch_time = d_time if d_time else None
            instance.delivery_type = dc_data.get('delivery_type', instance.delivery_type)
            instance.transporter_id = dc_data.get('transporter_id', instance.transporter_id)
            instance.transporter_name = dc_data.get('transporter_name', instance.transporter_name)
            instance.vehicle_no = dc_data.get('vehicle_no', instance.vehicle_no)
            if not instance.vehicle_no and dc_data.get('vehicle_number'):
                 instance.vehicle_no = dc_data.get('vehicle_number')
            instance.lr_gr_consignment = dc_data.get('lr_gr_consignment', instance.lr_gr_consignment)
            
        items_data = validated_data.pop('items', None)
        eway_data = validated_data.pop('eway_bill_details', None)
        instance = super().update(instance, validated_data)
        if items_data is not None:
            self._sync_items(instance, InventoryOperationScrapItem, items_data)
        if eway_data is not None:
             self._sync_eway_bills(instance, 'scrap', eway_data)
        return instance

# --- Outward ---
class InventoryOperationOutwardSerializer(InventoryOperationItemSyncMixin, serializers.ModelSerializer):
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        eway_data = validated_data.pop('eway_bill_details', [])
        instance = super().create(validated_data)
        self._sync_items(instance, InventoryOperationOutwardItem, items_data)
        self._sync_eway_bills(instance, 'outward', eway_data)
        return instance

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        eway_data = validated_data.pop('eway_bill_details', None)
        instance = super().update(instance, validated_data)
        if items_data is not None:
             self._sync_items(instance, InventoryOperationOutwardItem, items_data)
        if eway_data is not None:
             self._sync_eway_bills(instance, 'outward', eway_data)
        return instance

    class Meta:
        model = InventoryOperationOutward
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

# --- New GRN ---
class InventoryOperationNewGRNSerializer(InventoryOperationItemSyncMixin, serializers.ModelSerializer):
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        eway_data = validated_data.pop('eway_bill_details', [])
        instance = super().create(validated_data)
        self._sync_items(instance, InventoryOperationNewGRNItem, items_data)
        self._sync_eway_bills(instance, 'grn', eway_data)
        return instance

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        eway_data = validated_data.pop('eway_bill_details', None)
        instance = super().update(instance, validated_data)
        if items_data is not None:
             self._sync_items(instance, InventoryOperationNewGRNItem, items_data)
        if eway_data is not None:
             self._sync_eway_bills(instance, 'grn', eway_data)
        return instance

    class Meta:
        model = InventoryOperationNewGRN
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']
