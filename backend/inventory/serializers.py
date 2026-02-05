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
    class Meta:
        model = InventoryMasterCategory
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

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
    # Accepts nested dicts for creation/update helper, merged into model fields
    delivery_challan = serializers.DictField(write_only=True, required=False, allow_null=True)
    eway_bill = serializers.DictField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = InventoryOperationJobWork
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

    def create(self, validated_data):
        dc_data = validated_data.pop('delivery_challan', None)
        ew_data = validated_data.pop('eway_bill', None)

        # Merge nested data into main model fields
        if dc_data:
            validated_data['dispatch_address'] = dc_data.get('dispatch_address')
            validated_data['dispatch_date'] = dc_data.get('dispatch_date')
        if ew_data:
            validated_data['vehicle_number'] = ew_data.get('vehicle_number')
            validated_data['valid_till'] = ew_data.get('valid_till')

        return super().create(validated_data)

    def update(self, instance, validated_data):
        dc_data = validated_data.pop('delivery_challan', None)
        ew_data = validated_data.pop('eway_bill', None)
        
        # Merge updates
        if dc_data:
            instance.dispatch_address = dc_data.get('dispatch_address', instance.dispatch_address)
            instance.dispatch_date = dc_data.get('dispatch_date', instance.dispatch_date)
        if ew_data:
            instance.vehicle_number = ew_data.get('vehicle_number', instance.vehicle_number)
            instance.valid_till = ew_data.get('valid_till', instance.valid_till)

        return super().update(instance, validated_data)

# --- Inter Unit ---
class InventoryOperationInterUnitSerializer(serializers.ModelSerializer):
    delivery_challan = serializers.DictField(write_only=True, required=False, allow_null=True)
    eway_bill = serializers.DictField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = InventoryOperationInterUnit
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

    def create(self, validated_data):
        dc_data = validated_data.pop('delivery_challan', None)
        ew_data = validated_data.pop('eway_bill', None)

        if dc_data:
            validated_data['dispatch_address'] = dc_data.get('dispatch_address')
            validated_data['dispatch_date'] = dc_data.get('dispatch_date')
        if ew_data:
            validated_data['vehicle_number'] = ew_data.get('vehicle_number')
            validated_data['valid_till'] = ew_data.get('valid_till')

        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        dc_data = validated_data.pop('delivery_challan', None)
        ew_data = validated_data.pop('eway_bill', None)

        if dc_data:
            instance.dispatch_address = dc_data.get('dispatch_address', instance.dispatch_address)
            instance.dispatch_date = dc_data.get('dispatch_date', instance.dispatch_date)
        if ew_data:
            instance.vehicle_number = ew_data.get('vehicle_number', instance.vehicle_number)
            instance.valid_till = ew_data.get('valid_till', instance.valid_till)

        return super().update(instance, validated_data)

# --- Location Change ---
class InventoryOperationLocationChangeSerializer(serializers.ModelSerializer):
    delivery_challan = serializers.DictField(write_only=True, required=False, allow_null=True)
    eway_bill = serializers.DictField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = InventoryOperationLocationChange
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

    def create(self, validated_data):
        dc_data = validated_data.pop('delivery_challan', None)
        ew_data = validated_data.pop('eway_bill', None)

        if dc_data:
            validated_data['dispatch_address'] = dc_data.get('dispatch_address')
            validated_data['dispatch_date'] = dc_data.get('dispatch_date')
        if ew_data:
            validated_data['vehicle_number'] = ew_data.get('vehicle_number')
            validated_data['valid_till'] = ew_data.get('valid_till')

        return super().create(validated_data)

    def update(self, instance, validated_data):
        dc_data = validated_data.pop('delivery_challan', None)
        ew_data = validated_data.pop('eway_bill', None)

        if dc_data:
            instance.dispatch_address = dc_data.get('dispatch_address', instance.dispatch_address)
            instance.dispatch_date = dc_data.get('dispatch_date', instance.dispatch_date)
        if ew_data:
            instance.vehicle_number = ew_data.get('vehicle_number', instance.vehicle_number)
            instance.valid_till = ew_data.get('valid_till', instance.valid_till)

        return super().update(instance, validated_data)

# --- Production ---
class InventoryOperationProductionSerializer(serializers.ModelSerializer):
    delivery_challan = serializers.DictField(write_only=True, required=False, allow_null=True)
    eway_bill = serializers.DictField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = InventoryOperationProduction
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

    def create(self, validated_data):
        dc_data = validated_data.pop('delivery_challan', None)
        ew_data = validated_data.pop('eway_bill', None)

        if dc_data:
            validated_data['dispatch_address'] = dc_data.get('dispatch_address')
            validated_data['dispatch_date'] = dc_data.get('dispatch_date')
        if ew_data:
            validated_data['vehicle_number'] = ew_data.get('vehicle_number')
            validated_data['valid_till'] = ew_data.get('valid_till')

        return super().create(validated_data)

    def update(self, instance, validated_data):
        dc_data = validated_data.pop('delivery_challan', None)
        ew_data = validated_data.pop('eway_bill', None)

        if dc_data:
            instance.dispatch_address = dc_data.get('dispatch_address', instance.dispatch_address)
            instance.dispatch_date = dc_data.get('dispatch_date', instance.dispatch_date)
        if ew_data:
            instance.vehicle_number = ew_data.get('vehicle_number', instance.vehicle_number)
            instance.valid_till = ew_data.get('valid_till', instance.valid_till)

        return super().update(instance, validated_data)

# --- Consumption ---
class InventoryOperationConsumptionSerializer(serializers.ModelSerializer):
    delivery_challan = serializers.DictField(write_only=True, required=False, allow_null=True)
    eway_bill = serializers.DictField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = InventoryOperationConsumption
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

    def create(self, validated_data):
        dc_data = validated_data.pop('delivery_challan', None)
        ew_data = validated_data.pop('eway_bill', None)

        if dc_data:
            validated_data['dispatch_address'] = dc_data.get('dispatch_address')
            validated_data['dispatch_date'] = dc_data.get('dispatch_date')
        if ew_data:
            validated_data['vehicle_number'] = ew_data.get('vehicle_number')
            validated_data['valid_till'] = ew_data.get('valid_till')

        return super().create(validated_data)

    def update(self, instance, validated_data):
        dc_data = validated_data.pop('delivery_challan', None)
        ew_data = validated_data.pop('eway_bill', None)

        if dc_data:
            instance.dispatch_address = dc_data.get('dispatch_address', instance.dispatch_address)
            instance.dispatch_date = dc_data.get('dispatch_date', instance.dispatch_date)
        if ew_data:
            instance.vehicle_number = ew_data.get('vehicle_number', instance.vehicle_number)
            instance.valid_till = ew_data.get('valid_till', instance.valid_till)

        return super().update(instance, validated_data)

# --- Scrap ---
class InventoryOperationScrapSerializer(serializers.ModelSerializer):
    delivery_challan = serializers.DictField(write_only=True, required=False, allow_null=True)
    eway_bill = serializers.DictField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = InventoryOperationScrap
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

    def create(self, validated_data):
        dc_data = validated_data.pop('delivery_challan', None)
        ew_data = validated_data.pop('eway_bill', None)

        if dc_data:
            validated_data['dispatch_address'] = dc_data.get('dispatch_address')
            validated_data['dispatch_date'] = dc_data.get('dispatch_date')
        if ew_data:
            validated_data['vehicle_number'] = ew_data.get('vehicle_number')
            validated_data['valid_till'] = ew_data.get('valid_till')

        return super().create(validated_data)

    def update(self, instance, validated_data):
        dc_data = validated_data.pop('delivery_challan', None)
        ew_data = validated_data.pop('eway_bill', None)

        if dc_data:
            instance.dispatch_address = dc_data.get('dispatch_address', instance.dispatch_address)
            instance.dispatch_date = dc_data.get('dispatch_date', instance.dispatch_date)
        if ew_data:
            instance.vehicle_number = ew_data.get('vehicle_number', instance.vehicle_number)
            instance.valid_till = ew_data.get('valid_till', instance.valid_till)

        return super().update(instance, validated_data)

# InventoryOperationGRNSerializer removed - replaced by InventoryOperationNewGRNSerializer

# --- Outward ---
class InventoryOperationOutwardSerializer(serializers.ModelSerializer):
    delivery_challan = serializers.DictField(write_only=True, required=False, allow_null=True)
    eway_bill = serializers.DictField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = InventoryOperationOutward
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

    def create(self, validated_data):
        dc_data = validated_data.pop('delivery_challan', None)
        ew_data = validated_data.pop('eway_bill', None)

        if dc_data:
            validated_data['dispatch_address'] = dc_data.get('dispatch_address')
            validated_data['dispatch_date'] = dc_data.get('dispatch_date')
        if ew_data:
            validated_data['vehicle_number'] = ew_data.get('vehicle_number')
            validated_data['valid_till'] = ew_data.get('valid_till')

        return super().create(validated_data)

    def update(self, instance, validated_data):
        dc_data = validated_data.pop('delivery_challan', None)
        ew_data = validated_data.pop('eway_bill', None)

        if dc_data:
            instance.dispatch_address = dc_data.get('dispatch_address', instance.dispatch_address)
            instance.dispatch_date = dc_data.get('dispatch_date', instance.dispatch_date)
        if ew_data:
            instance.vehicle_number = ew_data.get('vehicle_number', instance.vehicle_number)
            instance.valid_till = ew_data.get('valid_till', instance.valid_till)

        return super().update(instance, validated_data)

# --- New GRN ---
class InventoryOperationNewGRNSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationNewGRN
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']
