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
    InventoryOperationNewGRN
)

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


# -------------------------------------------------------------------------
# OPERATION SERIALIZERS
# -------------------------------------------------------------------------
# Note: 'items' is now a JSONField on the model, so we don't need nested serializers 
# for child tables. We just let DRF handle the JSON data directly.

# --- Job Work ---
class InventoryOperationJobWorkSerializer(serializers.ModelSerializer):
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

        return super().create(validated_data)

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
            
        return super().update(instance, validated_data)

# --- Inter Unit ---
class InventoryOperationInterUnitSerializer(serializers.ModelSerializer):
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

        return super().create(validated_data)

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
            
        return super().update(instance, validated_data)

# --- Location Change ---
class InventoryOperationLocationChangeSerializer(serializers.ModelSerializer):
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

        return super().create(validated_data)

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
            
        return super().update(instance, validated_data)

# --- Production ---
class InventoryOperationProductionSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationProduction
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

    def validate(self, data):
        """
        Recalculate amount for all items before saving as a safety measure.
        """
        items = data.get('items', [])
        if items:
            for item in items:
                qty = 0
                # Check for various quantity keys used across different production types/tabs
                for k in ['qty_issued', 'quantity', 'quantityIssued', 'quantityProduced', 'issueQty']:
                    if k in item and item[k]:
                        try:
                            qty = float(item[k])
                            break
                        except (ValueError, TypeError):
                            continue
                
                rate = 0
                if 'rate' in item and item['rate']:
                    try:
                        rate = float(item['rate'])
                    except (ValueError, TypeError):
                        pass
                
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

        return super().create(validated_data)

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
            
        return super().update(instance, validated_data)

# --- Consumption ---
class InventoryOperationConsumptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationConsumption
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

        return super().create(validated_data)

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
            
        return super().update(instance, validated_data)

# --- Scrap ---
class InventoryOperationScrapSerializer(serializers.ModelSerializer):
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

        return super().create(validated_data)

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
            
        return super().update(instance, validated_data)

# InventoryOperationGRNSerializer removed - replaced by InventoryOperationNewGRNSerializer

# --- Outward ---
class InventoryOperationOutwardSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationOutward
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

        return super().create(validated_data)

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
            
        return super().update(instance, validated_data)

# --- New GRN ---
class InventoryOperationNewGRNSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationNewGRN
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']
