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
    InventoryOperationNewGRNItem,
    InventoryOperationDeliveryChallan
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


class InventoryOperationItemSyncMixin(serializers.Serializer):
    items = serializers.JSONField(write_only=True, required=False)
    eway_bill_details = serializers.JSONField(write_only=True, required=False)
    delivery_challan = serializers.JSONField(write_only=True, required=False)

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
            qty = item.get('qty', item.get('quantity', item.get('qty_issued', item.get('quantity_issued', item.get('quantityIssued', item.get('quantityProduced', item.get('accepted_qty', item.get('acceptedQty', item.get('received_qty', item.get('receivedQty', 0))))))))))
            rate = item.get('rate', item.get('itemRate', item.get('item_rate', 0)))
            
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

    def _sync_delivery_challan(self, instance, operation_type, dc_data):
        """Sync virtual Delivery Challan JSON to normalized table."""
        from .models import InventoryOperationDeliveryChallan
        if not dc_data: return
        
        if isinstance(dc_data, str):
            try: dc_data = json.loads(dc_data)
            except: return
        
        if not isinstance(dc_data, dict): return

        InventoryOperationDeliveryChallan.objects.update_or_create(
            operation_type=operation_type,
            operation_id=instance.id,
            tenant_id=instance.tenant_id,
            defaults={
                'dispatch_from': dc_data.get('dispatch_from', dc_data.get('dispatch_address')),
                'mode_of_transport': dc_data.get('mode_of_transport'),
                'dispatch_date': dc_data.get('dispatch_date') if dc_data.get('dispatch_date') else None,
                'dispatch_time': dc_data.get('dispatch_time') if dc_data.get('dispatch_time') else None,
                'delivery_type': dc_data.get('delivery_type'),
                'transporter_id': dc_data.get('transporter_id'),
                'transporter_name': dc_data.get('transporter_name'),
                'vehicle_no': dc_data.get('vehicle_no', dc_data.get('vehicle_number')),
                'lr_gr_consignment': dc_data.get('lr_gr_consignment'),
                
                # Air/Sea
                'shipping_bill_no': dc_data.get('shipping_bill_no', dc_data.get('beyondPortShippingBillNo')),
                'shipping_bill_date': dc_data.get('shipping_bill_date') if dc_data.get('shipping_bill_date') else None,
                'ship_port_code': dc_data.get('ship_port_code', dc_data.get('beyondPortShipPortCode')),
                'vessel_flight_no': dc_data.get('vessel_flight_no', dc_data.get('beyondPortVesselFlightNo')),
                'port_of_loading': dc_data.get('port_of_loading', dc_data.get('beyondPortPortOfLoading')),
                'port_of_discharge': dc_data.get('port_of_discharge', dc_data.get('beyondPortPortOfDischarge')),
                'final_destination': dc_data.get('final_destination', dc_data.get('beyondPortFinalDestination')),
                'origin_city': dc_data.get('origin_city', dc_data.get('beyondPortOrigin')),
                'origin_country': dc_data.get('origin_country', dc_data.get('beyondPortOriginCountry')),
                'dest_country': dc_data.get('dest_country', dc_data.get('beyondPortDestCountry')),
                
                # Rail
                'railway_receipt_no': dc_data.get('railway_receipt_no', dc_data.get('railBeyondPortRailwayReceiptNo')),
                'railway_receipt_date': dc_data.get('railway_receipt_date') if dc_data.get('railway_receipt_date') else None,
                'fnr_no': dc_data.get('fnr_no', dc_data.get('railBeyondPortFnrNo')),
                'rail_no': dc_data.get('rail_no', dc_data.get('railBeyondPortRailNo')),
                'station_of_loading': dc_data.get('station_of_loading', dc_data.get('railBeyondPortStationOfLoading')),
                'station_of_discharge': dc_data.get('station_of_discharge', dc_data.get('railBeyondPortStationOfDischarge')),
            }
        )

class InventoryOperationDeliveryChallanSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationDeliveryChallan
        fields = '__all__'

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
        self._sync_delivery_challan(instance, 'jobwork', dc_data)
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
        if dc_data is not None:
            self._sync_delivery_challan(instance, 'jobwork', dc_data)
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
        self._sync_delivery_challan(instance, 'interunit', dc_data)
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
        if dc_data is not None:
             self._sync_delivery_challan(instance, 'interunit', dc_data)
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
        self._sync_delivery_challan(instance, 'location_change', dc_data)
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
        if dc_data is not None:
            self._sync_delivery_challan(instance, 'location_change', dc_data)
        return instance

# --- Production ---
class InventoryOperationProductionSerializer(InventoryOperationItemSyncMixin, serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationProduction
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        eway_data = validated_data.pop('eway_bill_details', [])
        dc_data = validated_data.pop('delivery_challan', None)
        instance = super().create(validated_data)
        self._sync_items(instance, InventoryOperationProductionItem, items_data)
        self._sync_eway_bills(instance, 'production', eway_data)
        self._sync_delivery_challan(instance, 'production', dc_data)
        return instance

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        eway_data = validated_data.pop('eway_bill_details', None)
        dc_data = validated_data.pop('delivery_challan', None)
        instance = super().update(instance, validated_data)
        if items_data is not None:
            self._sync_items(instance, InventoryOperationProductionItem, items_data)
        if eway_data is not None:
            self._sync_eway_bills(instance, 'production', eway_data)
        if dc_data is not None:
            self._sync_delivery_challan(instance, 'production', dc_data)
        return instance

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



# --- Consumption ---
class InventoryOperationConsumptionSerializer(InventoryOperationItemSyncMixin, serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationConsumption
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        dc_data = validated_data.pop('delivery_challan', None)
        instance = super().create(validated_data)
        self._sync_items(instance, InventoryOperationConsumptionItem, items_data)
        self._sync_delivery_challan(instance, 'consumption', dc_data)
        return instance

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        dc_data = validated_data.pop('delivery_challan', None)
        instance = super().update(instance, validated_data)
        if items_data is not None:
            self._sync_items(instance, InventoryOperationConsumptionItem, items_data)
        if dc_data is not None:
            self._sync_delivery_challan(instance, 'consumption', dc_data)
        return instance

# --- Scrap ---
class InventoryOperationScrapSerializer(InventoryOperationItemSyncMixin, serializers.ModelSerializer):
    class Meta:
        model = InventoryOperationScrap
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        eway_data = validated_data.pop('eway_bill_details', [])
        dc_data = validated_data.pop('delivery_challan', None)

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
        self._sync_items(instance, InventoryOperationScrapItem, items_data)
        self._sync_eway_bills(instance, 'scrap', eway_data)
        self._sync_delivery_challan(instance, 'scrap', dc_data)
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
        if dc_data is not None:
             self._sync_delivery_challan(instance, 'scrap', dc_data)
        return instance

# --- Outward ---
class InventoryOperationOutwardSerializer(InventoryOperationItemSyncMixin, serializers.ModelSerializer):
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        eway_data = validated_data.pop('eway_bill_details', [])
        dc_data = validated_data.pop('delivery_challan', None)
        instance = super().create(validated_data)
        self._sync_items(instance, InventoryOperationOutwardItem, items_data)
        self._sync_eway_bills(instance, 'outward', eway_data)
        self._sync_delivery_challan(instance, 'outward', dc_data)
        return instance

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        eway_data = validated_data.pop('eway_bill_details', None)
        dc_data = validated_data.pop('delivery_challan', None)
        instance = super().update(instance, validated_data)
        if items_data is not None:
             self._sync_items(instance, InventoryOperationOutwardItem, items_data)
        if eway_data is not None:
             self._sync_eway_bills(instance, 'outward', eway_data)
        if dc_data is not None:
             self._sync_delivery_challan(instance, 'outward', dc_data)
        return instance

    def to_representation(self, instance):
        repr = super().to_representation(instance)
        repr['items'] = InventoryOperationOutwardItemSerializer(instance.items_rel.all(), many=True).data
        return repr

    class Meta:
        model = InventoryOperationOutward
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']

# --- New GRN ---
class InventoryOperationNewGRNSerializer(InventoryOperationItemSyncMixin, serializers.ModelSerializer):
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        eway_data = validated_data.pop('eway_bill_details', [])
        dc_data = validated_data.pop('delivery_challan', None)
        instance = super().create(validated_data)
        self._sync_items(instance, InventoryOperationNewGRNItem, items_data)
        self._sync_eway_bills(instance, 'grn', eway_data)
        self._sync_delivery_challan(instance, 'grn', dc_data)
        return instance

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        eway_data = validated_data.pop('eway_bill_details', None)
        dc_data = validated_data.pop('delivery_challan', None)
        instance = super().update(instance, validated_data)
        if items_data is not None:
             self._sync_items(instance, InventoryOperationNewGRNItem, items_data)
        if eway_data is not None:
             self._sync_eway_bills(instance, 'grn', eway_data)
        if dc_data is not None:
             self._sync_delivery_challan(instance, 'grn', dc_data)
        return instance

    def to_representation(self, instance):
        repr = super().to_representation(instance)
        repr['items'] = InventoryOperationNewGRNItemSerializer(instance.items_rel.all(), many=True).data
        return repr

    class Meta:
        model = InventoryOperationNewGRN
        fields = '__all__'
        read_only_fields = ['tenant_id', 'id', 'created_at', 'updated_at']
