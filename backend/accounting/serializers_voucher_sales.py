from rest_framework import serializers  # type: ignore
from django.db import transaction  # type: ignore
from .models_voucher_sales import (
    VoucherSalesInvoiceDetails, VoucherSalesItems, VoucherSalesItemsForeign,
    VoucherSalesPaymentDetails, VoucherSalesDispatchDetails,
    VoucherSalesEwayBill
)
from core.mixins import BranchModelSerializerMixin
from accounting.services.ledger_service import post_transaction
from accounting.utils_ledger import get_standard_ledger
from customerportal.database import CustomerMasterCustomerBasicDetails
from .models import Voucher
from inventory.models import InventoryOperationOutward
import decimal
from accounting.services.inventory_sync import sync_sales_to_outward
from .services.portal_mirror_service import mirror_sales_to_portal


class VoucherSalesItemsSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherSalesItems
        exclude = ('invoice', 'tenant_id')
        read_only_fields = ('id', 'created_at', 'updated_at')

class VoucherSalesItemsForeignSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherSalesItemsForeign
        exclude = ('invoice', 'tenant_id')
        read_only_fields = ('id', 'created_at', 'updated_at')

class VoucherSalesPaymentDetailsSerializer(serializers.ModelSerializer):
    advance_references = serializers.JSONField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = VoucherSalesPaymentDetails
        exclude = ('invoice', 'tenant_id')
        read_only_fields = ('id', 'created_at', 'updated_at', 'payment_received', 'payment_balance')

    def validate(self, data):
        """Round all decimal fields to 2 decimal places to prevent validation errors."""
        from decimal import Decimal, ROUND_HALF_UP
        for field, value in data.items():
            if isinstance(value, Decimal):
                data[field] = value.quantize(Decimal('0.00'), rounding=ROUND_HALF_UP)
        return data

class VoucherSalesDispatchDetailsSerializer(serializers.ModelSerializer):
    dispatch_document = serializers.FileField(required=False, allow_null=True)

    class Meta:
        model = VoucherSalesDispatchDetails
        exclude = ('invoice', 'tenant_id')
        read_only_fields = ('id', 'created_at', 'updated_at')

class VoucherSalesEwayBillSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoucherSalesEwayBill
        exclude = ('invoice', 'tenant_id')
        read_only_fields = ('id', 'created_at', 'updated_at') 

class VoucherSalesInvoiceDetailsSerializer(BranchModelSerializerMixin, serializers.ModelSerializer):
    items = VoucherSalesItemsSerializer(many=True, required=False)
    foreign_items = VoucherSalesItemsForeignSerializer(many=True, required=False)
    payment_details = VoucherSalesPaymentDetailsSerializer(required=False)
    dispatch_details = VoucherSalesDispatchDetailsSerializer(required=False)
    eway_bill_details = VoucherSalesEwayBillSerializer(many=True, required=False) 
    
    # Explicitly define to avoid "Not a valid string" error from ChoiceField/other weirdness
    reverse_charge = serializers.CharField(required=False, default='N', max_length=1)
    supporting_document = serializers.FileField(required=False, allow_null=True)
    
    # Explicitly define place_of_supply without max_length=2 to allow state names like "Tamil Nadu" 
    # to be passed to validate_place_of_supply, which will then map them to the 2-digit code.
    place_of_supply = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=100)

    class Meta:
        model = VoucherSalesInvoiceDetails
        fields = [
            'id', 'tenant_id', 'date', 'sales_invoice_no', 'voucher_name', 'outward_slip_no',
            'customer_name', 'customer_id', 'customer_branch', 'bill_to', 'ship_to', 'gstin', 'contact',
            'tax_type', 'state_type', 'export_type', 'exchange_rate', 'supporting_document',
            'sales_order_no', 'place_of_supply', 'reverse_charge', 'invoice_type',
            'gst_export_type', 'port_code', 'shipping_bill_number', 'shipping_bill_date',
            'ecommerce_gstin', 'irn', 'ack_no', 'created_at', 'updated_at',
            'posting_status', 'posting_error', 'outward_slip_id', 'status',
            # Nested Fields
            'items', 'foreign_items', 'payment_details', 'dispatch_details', 'eway_bill_details'
        ]
        read_only_fields = ('id', 'tenant_id', 'created_at', 'updated_at', 'posting_status', 'posting_error')
    
    def validate_place_of_supply(self, value):
        if not value:
            return value
        
        val_str = str(value).strip().lower()
        
        state_to_code = {
            'jammu and kashmir': '01', 'jammu & kashmir': '01', 'j&k': '01',
            'himachal pradesh': '02',
            'punjab': '03',
            'chandigarh': '04',
            'uttarakhand': '05', 'uttaranchal': '05',
            'haryana': '06',
            'delhi': '07',
            'rajasthan': '08',
            'uttar pradesh': '09', 'up': '09',
            'bihar': '10',
            'sikkim': '11',
            'arunachal pradesh': '12',
            'nagaland': '13',
            'manipur': '14',
            'mizoram': '15',
            'tripura': '16',
            'meghalaya': '17',
            'assam': '18',
            'west bengal': '19', 'wb': '19',
            'jharkhand': '20',
            'odisha': '21', 'orissa': '21',
            'chhattisgarh': '22',
            'madhya pradesh': '23', 'mp': '23',
            'gujarat': '24',
            'daman and diu': '25', 'daman & diu': '25',
            'dadra and nagar haveli': '26', 'dadra & nagar haveli': '26',
            'maharashtra': '27',
            'andhra pradesh (old)': '28',
            'karnataka': '29',
            'goa': '30',
            'lakshadweep': '31',
            'kerala': '32',
            'tamil nadu': '33', 'tamilnadu': '33', 'tn': '33',
            'puducherry': '34', 'pondicherry': '34',
            'andaman and nicobar islands': '35', 'andaman & nicobar islands': '35', 'andaman & nicobar': '35',
            'telangana': '36',
            'andhra pradesh': '37', 'ap': '37',
            'ladakh': '38',
            'other territory': '97',
        }
        
        if val_str.isdigit() and len(val_str) <= 2:
            return val_str.zfill(2)
        
        code = state_to_code.get(val_str)
        if code:
            return code
            
        import re
        match = re.search(r'\b(\d{2})\b', val_str)
        if match:
            return match.group(1)
            
        return value[:2]

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        if rep.get('place_of_supply'):
            code = str(rep['place_of_supply']).strip()
            code_to_state = {
                '01': 'Jammu and Kashmir',
                '02': 'Himachal Pradesh',
                '03': 'Punjab',
                '04': 'Chandigarh',
                '05': 'Uttarakhand',
                '06': 'Haryana',
                '07': 'Delhi',
                '08': 'Rajasthan',
                '09': 'Uttar Pradesh',
                '10': 'Bihar',
                '11': 'Sikkim',
                '12': 'Arunachal Pradesh',
                '13': 'Nagaland',
                '14': 'Manipur',
                '15': 'Mizoram',
                '16': 'Tripura',
                '17': 'Meghalaya',
                '18': 'Assam',
                '19': 'West Bengal',
                '20': 'Jharkhand',
                '21': 'Odisha',
                '22': 'Chhattisgarh',
                '23': 'Madhya Pradesh',
                '24': 'Gujarat',
                '25': 'Daman and Diu',
                '26': 'Dadra and Nagar Haveli',
                '27': 'Maharashtra',
                '28': 'Andhra Pradesh (Old)',
                '29': 'Karnataka',
                '30': 'Goa',
                '31': 'Lakshadweep',
                '32': 'Kerala',
                '33': 'Tamil Nadu',
                '34': 'Puducherry',
                '35': 'Andaman and Nicobar Islands',
                '36': 'Telangana',
                '37': 'Andhra Pradesh',
                '38': 'Ladakh',
                '97': 'Other Territory',
            }
            rep['place_of_supply'] = code_to_state.get(code, code)
        return rep

    def validate_sales_invoice_no(self, value):
        """
        Ensures the invoice number is unique within the tenant by auto-incrementing if it already exists.
        """
        request = self.context.get('request')
        tenant_id = self.context.get('tenant_id')
        if not tenant_id and request:
            tenant_id = getattr(request.user, 'tenant_id', 1)
        
        if not tenant_id:
            return value

        if value:
            import re
            
            def increment_invoice_string(val):
                # Regex to match: prefix, numeric sequence, and trailing suffix (like -27, /27, -26-27 or any non-digits at the end)
                # The suffix regex specifically matches 2-digit fiscal year formats (e.g. -27, /27, -26-27)
                match = re.match(r'^(.*?)(?P<num>\d+)([-/]\d{2}(?:-\d{2})?|[^0-9]*)$', val)
                if match:
                    prefix = match.group(1)
                    num_str = match.group('num')
                    suffix = val[match.end('num'):]
                    
                    num = int(num_str) + 1
                    # Keep zero padding (zfill) matching length of original numeric string
                    new_num_str = str(num).zfill(len(num_str))
                    return f"{prefix}{new_num_str}{suffix}"
                else:
                    return val + "-1"

            while True:
                qs = VoucherSalesInvoiceDetails.objects.filter(
                    tenant_id=tenant_id,
                    sales_invoice_no__iexact=value.strip()
                )
                if self.instance:
                    qs = qs.exclude(pk=self.instance.pk)
                
                if qs.exists():
                    value = increment_invoice_string(value)
                else:
                    break
        
        return value
    
    def _sync_numbering_series(self, tenant_id, voucher_name, sales_invoice_no):
        """
        Ensures that the Master numbering series is ahead of any manually provided invoice number.
        Useful for syncing after Excel uploads.
        """
        from masters.models import MasterVoucherSales
        import re
        try:
            series = MasterVoucherSales.objects.filter(
                tenant_id=tenant_id, 
                voucher_name=voucher_name,
                enable_auto_numbering=True
            ).first()
            if not series:
                return

            next_num = (series.current_number or series.start_from or 1)
            
            if sales_invoice_no:
                clean_no = str(sales_invoice_no)
                if series.prefix and clean_no.startswith(series.prefix):
                    clean_no = clean_no[len(series.prefix):]
                if series.suffix and clean_no.endswith(series.suffix):
                    clean_no = clean_no[:-len(series.suffix)]
                
                # Extract numeric part (handles cases like INV000172 -> 172)
                match = re.search(r'(\d+)', clean_no)
                if match:
                    num_str = match.group(1)
                    extracted_num = int(num_str)
                    
                    # Typo protection: ignore abnormally long numbers
                    required_digits = series.required_digits or 4
                    if len(num_str) <= required_digits + 2:
                        next_num = max(next_num, extracted_num + 1)
                    else:
                        print(f"[SalesSerializer] Ignoring suspicious outlier: {num_str}")
            
            series.current_number = next_num
            series.save(update_fields=['current_number', 'updated_at'])
            print(f"[SalesSerializer] Series '{voucher_name}' sync: current_number set to {next_num}")
        except Exception as e:
            print(f"[SalesSerializer] Failed to sync numbering series: {e}")

    def _get_next_number_from_series(self, tenant_id, voucher_name):
        from masters.models import MasterVoucherSales
        try:
            series = MasterVoucherSales.objects.filter(
                tenant_id=tenant_id, 
                voucher_name=voucher_name,
                is_active=True
            ).first()
            if not series:
                return None
            
            num = series.current_number or series.start_from or 1
            digits = series.required_digits or 4
            prefix = series.prefix or ''
            suffix = series.suffix or ''
            
            formatted = f"{prefix}{str(num).zfill(digits)}{suffix}"
            
            # Increment the counter
            series.current_number = num + 1
            series.save(update_fields=['current_number', 'updated_at'])
            
            return formatted
        except Exception as e:
            print(f"[SalesSerializer] Auto-number failed: {e}")
            return None

    def create(self, validated_data):
        # Part 2: Debug Incoming Data
        print("DEBUG VALIDATED_DATA:", validated_data)

        # 0. Sync Numbering Series
        voucher_name = validated_data.get('voucher_name')
        sales_invoice_no = validated_data.get('sales_invoice_no')
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        tenant_id = getattr(user, 'tenant_id', None)
        
        if voucher_name and tenant_id:
            if not sales_invoice_no:
                # If number is missing (e.g. Excel upload), generate it from series
                generated_no = self._get_next_number_from_series(tenant_id, voucher_name)
                if generated_no:
                    validated_data['sales_invoice_no'] = generated_no
                    print(f"[SalesSerializer] Auto-generated invoice number: {generated_no}")
            else:
                # If number is provided, ensure the series counter is ahead of it
                self._sync_numbering_series(tenant_id, voucher_name, sales_invoice_no)

        # Part 1: Validate Input (MANDATORY)
        customer_id = validated_data.get("customer_id")
        if not customer_id:
            raise serializers.ValidationError({"customer_id": "customer_id is required"})

        items_data = validated_data.pop('items', [])
        foreign_items_data = validated_data.pop('foreign_items', [])
        payment_data = validated_data.pop('payment_details', None)
        dispatch_data = validated_data.pop('dispatch_details', None)
        eway_bill_details_data = validated_data.pop('eway_bill_details', [])
        
        # Part 5: Wrap in Transaction
        with transaction.atomic():
            # Create Invoice header
            invoice = super().create(validated_data)
            tenant_id = invoice.tenant_id

            # NEW: Link and Mark Outward Slip as USED
            outward_slip_id = validated_data.get('outward_slip_id')
            if outward_slip_id:
                try:
                    outward_slip = InventoryOperationOutward.objects.get(id=outward_slip_id, tenant_id=tenant_id)
                    if outward_slip.status == 'USED':
                         raise serializers.ValidationError({"outward_slip_id": "This outward slip has already been used in another invoice."})
                    
                    outward_slip.status = 'USED'
                    outward_slip.linked_sales_voucher_id = invoice.id
                    outward_slip.save(update_fields=['status', 'linked_sales_voucher_id'])
                except InventoryOperationOutward.DoesNotExist:
                    raise serializers.ValidationError({"outward_slip_id": "Invalid outward slip ID."})
            
            # Create Items
            for item in items_data:
                VoucherSalesItems.objects.create(invoice=invoice, tenant_id=tenant_id, **item)
            
            # Create Foreign Items
            for item in foreign_items_data:
                VoucherSalesItemsForeign.objects.create(invoice=invoice, tenant_id=tenant_id, **item)
            
            # Create Payment Details
            payment_obj = None
            adv_refs = None
            if payment_data:
                # Keep advance_references in payment_data so it's saved in create()
                adv_refs = payment_data.get('advance_references')
                payment_obj = VoucherSalesPaymentDetails.objects.create(invoice=invoice, tenant_id=tenant_id, **payment_data)
                
            # Create Dispatch Details
            if dispatch_data:
                VoucherSalesDispatchDetails.objects.create(invoice=invoice, tenant_id=tenant_id, **dispatch_data)
                
            # Create Eway Bill Details
            for eway_data in eway_bill_details_data:
                VoucherSalesEwayBill.objects.create(invoice=invoice, tenant_id=tenant_id, **eway_data)

            # Round total to 2 decimal places
            final_total = decimal.Decimal(str(payment_obj.payment_invoice_value if payment_obj else 0)).quantize(
                decimal.Decimal('0.00'), rounding=decimal.ROUND_HALF_UP
            )

            voucher = Voucher.objects.create(
                tenant_id=tenant_id,
                type="sales",
                voucher_number=invoice.sales_invoice_no or f"SAL-{invoice.id}",
                date=invoice.date,
                party=invoice.customer_name,
                total=final_total,
                invoice_no=invoice.sales_invoice_no,
                source="sales_invoice",
                reference_id=invoice.id
            )

            invoice.voucher_id = voucher.id
            invoice.save(update_fields=['voucher_id'])

            # --- Record Advance Allocation Maps (Phase 4C) ---
            if adv_refs:
                from django.db.models import Q  # type: ignore
                from accounting.services.advance_service import write_allocations
                try:
                    # Parse if string, or use as-is if already list/dict
                    if isinstance(adv_refs, str):
                        import json
                        adv_refs = json.loads(adv_refs)
                    
                    if adv_refs:
                        write_allocations(
                            tenant_id=tenant_id,
                            voucher_id=voucher.id,
                            voucher_type='sales',
                            advance_refs=adv_refs,
                            ledger_id=invoice.customer_id
                        )
                except Exception as ex:
                    print(f"[SalesSerializer] Advance allocation failed: {ex}")

        mirror_sales_to_portal(invoice)

        # Auto-sync to Inventory > Operations > Outward Slip
        sync_sales_to_outward(invoice)
        print(f"Voucher {invoice.sales_invoice_no} saved successfully (ID: {invoice.id})")

        # --- Double-Entry Posting for Sales (entries table) ---
        self._post_journal_entries(invoice)

        # Recalculate status centrally
        try:
            from .services.sales_status_service import update_sales_invoice_payment_status
            update_sales_invoice_payment_status(tenant_id, str(invoice.id))
        except Exception as e:
            print(f"!!! Status Sync Error in Create: {str(e)}")

        return invoice

    def _post_journal_entries(self, invoice):
        """Internal helper to post double-entry bookkeeping for the invoice with individual GST detail rows"""
        try:
            from accounting.services.ledger_service import post_transaction
            from accounting.utils_ledger import get_standard_ledger
            from accounting.models import JournalEntry
            from decimal import Decimal as D

            request = self.context.get('request')
            tenant_id = request.user.tenant_id if request and hasattr(request, 'user') else invoice.tenant_id
            payment_obj = getattr(invoice, 'payment_details', None)

            # Resolve Voucher ID
            v_id = getattr(invoice, 'voucher_id', None) or invoice.id

            # PRE-CLEANUP: If updating, clean up all related sales journal entries so removing a tax/TCS cleanly deletes the old entry
            from accounting.models import JournalEntry
            if v_id:
                JournalEntry.objects.filter(
                    tenant_id=tenant_id,
                    voucher_id=v_id,
                    voucher_type__in=["SALES", "SALES_GST_DETAIL", "SALES_TCS_DETAIL"]
                ).delete()
            if not payment_obj:
                print("[SalesSerializer] Skipped posting: No payment details found on instance")
                return

            total_amount = float(payment_obj.payment_invoice_value or 0)
            if total_amount == 0:
                print("[SalesSerializer] Skipped posting: Zero amount")
                return

            from customerportal.database import CustomerMasterCustomer
            customer = CustomerMasterCustomer.objects.filter(id=invoice.customer_id).first()
            if not customer:
                 print(f"[SalesSerializer] Posting Error: Customer {invoice.customer_id} not found.")
                 return

            sales_ledger = get_standard_ledger(tenant_id, 'Sales Account', 'Sales Accounts', 'Income')
            gst_output_ledger = get_standard_ledger(tenant_id, 'Output Tax Liability Ledger', 'Duties & Taxes', 'Liability')

            # Resolve Customer TCS/TDS Ledger and Amount
            tcs_amt = float(payment_obj.payment_tds_income_tax or 0)
            
            # The user wants TDS/TCS on sales to be a 'Receivable' (Asset).
            # To balance, the Customer debit must be the NET amount (Invoice Total - Tax Deduction).
            # Total Debit = (total_amount - tcs_amt) [Customer] + (tcs_amt) [Receivable] = total_amount.
            # Total Credit = (payment_taxable_value) [Sales] + (total_tax) [GST] = total_amount.
            customer_debit_amt = total_amount - tcs_amt

            entries = []
            if customer.ledger_id:
                entries.append({"ledger_id": customer.ledger_id, "debit": customer_debit_amt, "credit": 0})
            else:
                print(f"[SalesSerializer] Posting Error: Customer {customer.name} has no ledger mapping.")
                return

            # TCS/TDS collected/deducted on Sales — this is a RECEIVABLE (Asset)
            tcs_master_ledger = None
            tcs_section_name = "Unspecified Section"
            is_tcs = True # Default to TCS if unknown
            
            if tcs_amt > 0:
                # Try to resolve the specific section name for supplementary rows
                if invoice.customer_id:
                    try:
                        from customerportal.database import CustomerMasterCustomerTDS
                        tds_obj = CustomerMasterCustomerTDS.objects.filter(
                            customer_basic_detail_id=invoice.customer_id
                        ).first()
                        if tds_obj:
                            has_tcs_section = bool(getattr(tds_obj, 'tcs_section', ''))
                            has_tds_section = bool(getattr(tds_obj, 'tds_section', ''))
                            is_tcs_enabled = getattr(tds_obj, 'tcs_enabled', False)
                            is_tds_enabled = getattr(tds_obj, 'tds_enabled', False)
                            
                            if is_tcs_enabled or has_tcs_section:
                                tcs_section_name = getattr(tds_obj, 'tcs_section', '').strip() or "Unspecified Section"
                                is_tcs = True
                            elif is_tds_enabled or has_tds_section:
                                tcs_section_name = getattr(tds_obj, 'tds_section', '').strip() or "Unspecified Section"
                                is_tcs = False
                    except Exception:
                        pass
                        
                ledger_name_str = 'TCS Receivable' if is_tcs else 'TDS Receivable'
                tcs_master_ledger = get_standard_ledger(tenant_id, ledger_name_str, 'Duties & Taxes', 'Asset')
                entries.append({"ledger_id": tcs_master_ledger.id, "debit": tcs_amt, "credit": 0})

            # Sales (Credit - Taxable Value)
            from accounting.services.ledger_service import _resolve_ledger
            sales_ledger_map = {}
            default_sales_ledger = get_standard_ledger(tenant_id, 'Sales Account', 'Sales Accounts', 'Income')

            total_item_taxable = 0.0
            
            # Process domestic items
            for item in invoice.items.all():
                amt = float(item.taxable_value or 0)
                if amt > 0:
                    l_obj = _resolve_ledger(item.sales_ledger, tenant_id) if item.sales_ledger else None
                    l_id = l_obj.id if l_obj else default_sales_ledger.id
                    sales_ledger_map[l_id] = sales_ledger_map.get(l_id, 0.0) + amt
                    total_item_taxable += amt

            # Process foreign items
            for f_item in invoice.foreign_items.all():
                amt = float(f_item.amount or 0)
                if amt > 0:
                    l_obj = _resolve_ledger(f_item.sales_ledger, tenant_id) if f_item.sales_ledger else None
                    l_id = l_obj.id if l_obj else default_sales_ledger.id
                    sales_ledger_map[l_id] = sales_ledger_map.get(l_id, 0.0) + amt
                    total_item_taxable += amt

            # Check if there is any difference between item sum and payment_taxable_value (e.g., due to rounding or missing items)
            payment_taxable = float(payment_obj.payment_taxable_value or 0)
            diff = payment_taxable - total_item_taxable

            if abs(diff) > 0.01:
                sales_ledger_map[default_sales_ledger.id] = sales_ledger_map.get(default_sales_ledger.id, 0.0) + diff

            for l_id, amt in sales_ledger_map.items():
                if amt > 0:
                    entries.append({"ledger_id": l_id, "debit": 0, "credit": amt})

            # Collect individual GST amounts
            igst_amt = float(payment_obj.payment_igst or 0)
            cgst_amt = float(payment_obj.payment_cgst or 0)
            sgst_amt = float(payment_obj.payment_sgst or 0)
            cess_amt = float(payment_obj.payment_cess or 0)
            state_cess_amt = float(payment_obj.payment_state_cess or 0)
            total_tax = igst_amt + cgst_amt + sgst_amt + cess_amt + state_cess_amt

            # Taxes — single aggregated credit to Output Tax Liability Ledger
            if total_tax > 0:
                entries.append({"ledger_id": gst_output_ledger.id, "debit": 0, "credit": total_tax})

            # Resolve Voucher ID
            v_id = getattr(invoice, 'voucher_id', None) or invoice.id

            # Post
            post_transaction(
                voucher_type="SALES",
                voucher_id=v_id,
                tenant_id=tenant_id,
                transaction_date=invoice.date,
                voucher_number=invoice.sales_invoice_no,
                entries=entries
            )

            # Write supplementary GST detail rows for the Output Tax Liability Ledger drill-down
            if total_tax > 0:
                gst_detail_type = "SALES_GST_DETAIL"
                JournalEntry.objects.filter(
                    tenant_id=tenant_id,
                    voucher_type=gst_detail_type,
                    voucher_id=v_id
                ).delete()

                detail_rows = []
                component_map = [
                    ("IGST", igst_amt),
                    ("CGST", cgst_amt),
                    ("SGST/UTGST", sgst_amt),
                    ("Cess", cess_amt),
                    ("State Cess", state_cess_amt),
                ]
                for component_name, component_amt in component_map:
                    if component_amt > 0:
                        detail_rows.append(JournalEntry(
                            tenant_id=tenant_id,
                            voucher_type=gst_detail_type,
                            voucher_id=v_id,
                            voucher_number=invoice.sales_invoice_no,
                            transaction_date=invoice.date,
                            ledger_id=gst_output_ledger.id,
                            ledger_name=f"Output Tax Liability Ledger ({component_name})",
                            ledger_id_val=gst_output_ledger.id,
                            debit=D('0.00'),
                            credit=D(str(component_amt)),
                        ))
                if detail_rows:
                    JournalEntry.objects.bulk_create(detail_rows)

            # Write supplementary TCS/TDS detail rows for drill-down breakdown
            if tcs_amt > 0 and tcs_master_ledger:
                tcs_detail_type = "SALES_TCS_DETAIL" if is_tcs else "SALES_TDS_DETAIL"
                JournalEntry.objects.filter(
                    tenant_id=tenant_id,
                    voucher_type__in=["SALES_TCS_DETAIL", "SALES_TDS_DETAIL"],
                    voucher_id=v_id
                ).delete()
                
                JournalEntry.objects.create(
                    tenant_id=tenant_id,
                    voucher_type=tcs_detail_type,
                    voucher_id=v_id,
                    voucher_number=invoice.sales_invoice_no,
                    transaction_date=invoice.date,
                    ledger_id=tcs_master_ledger.id,
                    ledger_name=f"{ledger_name_str} ({tcs_section_name})",
                    ledger_id_val=tcs_master_ledger.id,
                    debit=D(str(tcs_amt)),
                    credit=D('0.00'),
                )

            invoice.posting_status = 'POSTED'
            invoice.posting_error = None
            invoice.save()
            print(f"[SalesSerializer] Double-entry posted for {invoice.sales_invoice_no}")

        except Exception as e:
            print(f"[SalesSerializer] CRITICAL POSTING ERROR: {e}")
            invoice.posting_status = 'FAILED'
            invoice.posting_error = str(e)
            try:
                invoice.save()
            except: pass


    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        foreign_items_data = validated_data.pop('foreign_items', None)
        payment_data = validated_data.pop('payment_details', None)
        dispatch_data = validated_data.pop('dispatch_details', None)
        eway_bill_details_data = validated_data.pop('eway_bill_details', None)

        # Update custom mapped fields from frontend
        if 'party' in self.initial_data:
            instance.customer_name = self.initial_data.get('party', '')
        if 'bill_to_address_1' in self.initial_data:
            instance.bill_to = self.initial_data.get('bill_to_address_1', '')
        if 'ship_to_address_1' in self.initial_data:
            instance.ship_to = self.initial_data.get('ship_to_address_1', '')
        if 'voucher_number' in self.initial_data:
            instance.sales_invoice_no = self.initial_data.get('voucher_number', '')
        if 'voucher_series' in self.initial_data:
            instance.voucher_name = self.initial_data.get('voucher_series', '')
        
        # Update Invoice Header
        instance = super().update(instance, validated_data)
        tenant_id = instance.tenant_id

        # Update Items
        # Map flat items array back if nested items is missing in validated_data
        if items_data is None and 'items' in self.initial_data:
            items_data = self.initial_data['items']

        if items_data is not None:
            instance.items.all().delete()
            for item in items_data:
                VoucherSalesItems.objects.create(invoice=instance, tenant_id=tenant_id, **item)
        
        # Update Foreign Items
        if foreign_items_data is not None:
            instance.foreign_items.all().delete()
            for item in foreign_items_data:
                VoucherSalesItemsForeign.objects.create(invoice=instance, tenant_id=tenant_id, **item)

        # Update Payment Details
        if payment_data:
            VoucherSalesPaymentDetails.objects.update_or_create(
                invoice=instance, 
                defaults={**payment_data, 'tenant_id': tenant_id}
            )

        # Update Dispatch Details
        if dispatch_data:
            VoucherSalesDispatchDetails.objects.update_or_create(
                invoice=instance, 
                defaults={**dispatch_data, 'tenant_id': tenant_id}
            )

        # Update Eway Bill Details
        if eway_bill_details_data is not None:
            instance.eway_bill_details.all().delete()
            for eway_data in eway_bill_details_data:
                VoucherSalesEwayBill.objects.create(invoice=instance, tenant_id=tenant_id, **eway_data)

        # Update the unified Voucher object
        if instance.voucher_id:
            try:
                payment_obj = getattr(instance, 'payment_details', None)
                final_total = decimal.Decimal(str(payment_obj.payment_invoice_value if payment_obj else 0)).quantize(
                    decimal.Decimal('0.00'), rounding=decimal.ROUND_HALF_UP
                )
                voucher = Voucher.objects.get(id=instance.voucher_id)
                voucher.date = instance.date
                voucher.party = instance.customer_name
                voucher.total = final_total
                voucher.invoice_no = instance.sales_invoice_no
                voucher.voucher_number = instance.sales_invoice_no or f"SAL-{instance.id}"
                voucher.save()
            except Voucher.DoesNotExist:
                pass

        # --- Record Advance Allocation Maps Update (Phase 4C) ---
        if instance.voucher_id:
            payment_obj = VoucherSalesPaymentDetails.objects.filter(invoice=instance).first()
            if payment_obj and payment_obj.advance_references:
                from accounting.services.advance_service import write_allocations
                try:
                    adv_refs = payment_obj.advance_references
                    if isinstance(adv_refs, str):
                        import json
                        adv_refs = json.loads(adv_refs)
                    
                    if adv_refs:
                        write_allocations(
                            tenant_id=tenant_id,
                            voucher_id=instance.voucher_id,
                            voucher_type='sales',
                            advance_refs=adv_refs,
                            ledger_id=instance.customer_id
                        )
                except Exception as ex:
                    print(f"[SalesSerializer] Advance allocation update failed: {ex}")

        mirror_sales_to_portal(instance)

        
        # Refresh double-entry posting using a fresh instance to avoid stale prefetched relations
        fresh_instance = VoucherSalesInvoiceDetails.objects.get(id=instance.id)
        self._post_journal_entries(fresh_instance)

        # Recalculate status centrally
        try:
            from .services.sales_status_service import update_sales_invoice_payment_status
            update_sales_invoice_payment_status(instance.tenant_id, str(instance.id))
        except Exception as e:
            print(f"!!! Status Sync Error in Update: {str(e)}")

        return instance


