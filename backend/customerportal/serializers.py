"""
Customer Portal Serializers
Handles data serialization for API responses
"""
from rest_framework import serializers
import json
from .database import (
    CustomerMaster,
    CustomerMasterCategory,
    CustomerMastersSalesQuotation,
    CustomerMastersSalesOrder,
    CustomerMasterCustomer,
    CustomerTransaction,
    # CustomerSalesQuotation,
    # CustomerSalesOrder,
    CustomerMasterLongTermContractBasicDetail,
    CustomerMasterLongTermContractProductService,
    CustomerMasterLongTermContractTermsCondition,
    CustomerTransactionSalesQuotationGeneral,
    CustomerTransactionSalesQuotationSpecific,
    CustomerTransactionSalesOrderBasicDetails,
    CustomerTransactionSalesOrderItemDetails,
    CustomerTransactionSalesOrderDeliveryTerms,
    CustomerTransactionSalesOrderPaymentAndSalesperson,
    CustomerTransactionSalesOrderQuotationDetails
)


class CustomerMasterSerializer(serializers.ModelSerializer):
    """Serializer for Customer Master"""
    
    class Meta:
        model = CustomerMaster
        fields = [
            'id', 'tenant_id', 'customer_code', 'customer_name',
            'email', 'phone', 'mobile',
            'address_line1', 'address_line2', 'city', 'state', 'country', 'pincode',
            'gstin', 'pan', 'category',
            'credit_limit', 'credit_days', 'opening_balance', 'current_balance',
            'is_active', 'is_deleted', 'created_at', 'updated_at', 'created_by'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class CustomerMasterCategorySerializer(serializers.ModelSerializer):
    """Serializer for Customer Master Category"""
    full_path = serializers.ReadOnlyField()
    group = serializers.CharField(required=False, allow_null=True, allow_blank=True, default='')
    subgroup = serializers.CharField(required=False, allow_null=True, allow_blank=True, default='')
    
    class Meta:
        model = CustomerMasterCategory
        fields = [
            'id', 'tenant_id', 'category', 'group', 'subgroup', 'full_path',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at', 'full_path']

    def validate_group(self, value):
        return value if value is not None else ''

    def validate_subgroup(self, value):
        return value if value is not None else ''


class CustomerMastersSalesQuotationSerializer(serializers.ModelSerializer):
    """Serializer for Customer Masters Sales Quotation Series"""
    
    class Meta:
        model = CustomerMastersSalesQuotation
        fields = [
            'id', 'tenant_id', 'series_name', 'customer_category',
            'prefix', 'suffix', 'required_digits', 'current_number', 'auto_year',
            'is_active', 'is_deleted', 'created_at', 'updated_at', 'created_by'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_by', 'created_at', 'updated_at']


class CustomerMastersSalesOrderSerializer(serializers.ModelSerializer):
    """Serializer for Customer Masters Sales Order Series"""
    
    class Meta:
        model = CustomerMastersSalesOrder
        fields = [
            'id', 'tenant_id', 'series_name', 'customer_category',
            'prefix', 'suffix', 'required_digits', 'current_number', 'auto_year',
            'is_active', 'is_deleted', 'created_at', 'updated_at', 'created_by'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_by', 'created_at', 'updated_at']


class CustomerMasterCustomerSerializer(serializers.ModelSerializer):
    """
    Serializer for Customer Master Customer (Create New Customer form)
    Handles saving data to all 6 separate tables when 'Onboard Customer' is clicked
    """
    
    # Accept these fields in the request but they won't be saved to BasicDetails
    gst_details = serializers.JSONField(required=False, allow_null=True)
    products_services = serializers.JSONField(required=False, allow_null=True)
    banking_info = serializers.JSONField(required=False, allow_null=True)
    
    # TDS fields (will be saved to separate table)
    msme_no = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    fssai_no = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    iec_code = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    eou_status = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    tcs_section = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    tcs_enabled = serializers.BooleanField(required=False, default=False)
    tds_section = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    tds_enabled = serializers.BooleanField(required=False, default=False)
    tax_type = serializers.CharField(required=False, read_only=True)
    
    # Terms & Conditions fields (will be saved to separate table)
    credit_period = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    credit_terms = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    penalty_terms = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    delivery_terms = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    warranty_details = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    force_majeure = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    dispute_terms = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    
    class Meta:
        model = CustomerMasterCustomer  # This is aliased to CustomerMasterCustomerBasicDetails
        fields = [
            'id', 'tenant_id', 'customer_name', 'customer_code', 'customer_category',
            'pan_number', 'contact_person', 'email_address', 'contact_number', 'billing_currency',
            'is_also_vendor', 'gst_tds_applicable', 'tax_type',
            # These are not in the model but accepted in serializer
            'gst_details', 'products_services', 'banking_info',
            'msme_no', 'fssai_no', 'iec_code', 'eou_status',
            'tcs_section', 'tcs_enabled', 'tds_section', 'tds_enabled',
            'credit_period', 'credit_terms', 'penalty_terms',
            'delivery_terms', 'warranty_details', 'force_majeure', 'dispute_terms',
            'is_active', 'is_deleted', 'created_at', 'updated_at', 'created_by', 'updated_by'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_by', 'created_at', 'updated_at']

    def validate_customer_code(self, value):
        """Ensure customer code is unique per tenant if provided."""
        if not value:
            return value

        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            return value

        tenant_id = getattr(request.user, 'tenant_id', None)
        if not tenant_id:
            return value

        # Check uniqueness (case-insensitive)
        queryset = CustomerMasterCustomer.objects.filter(
            tenant_id=tenant_id,
            customer_code__iexact=value,
            is_deleted=False
        )

        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.exists():
            raise serializers.ValidationError(
                f"Customer with code '{value}' already exists. Please use a different customer code."
            )

        return value

    def validate_pan_number(self, value):
        """Ensure PAN number is unique per tenant if provided."""
        if not value:
            return value
            
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            return value
            
        tenant_id = getattr(request.user, 'tenant_id', None)
        if not tenant_id:
            return value
            
        # Check uniqueness
        queryset = CustomerMasterCustomer.objects.filter(
            tenant_id=tenant_id,
            pan_number__iexact=value,
            is_deleted=False
        )
        
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
            
        if queryset.exists():
            raise serializers.ValidationError(f"Customer with PAN {value} already exists.")
            
        return value

    def to_representation(self, instance):
        """
        Convert the model instance to a dictionary for JSON serialization
        Only include fields that actually exist in the BasicDetails model
        """
        # Helper to parse address
        def parse_address_data(addr_str):
            if not addr_str:
                return {}
            try:
                addr_str = addr_str.strip()
                if (addr_str.startswith('{') and addr_str.endswith('}')):
                    return json.loads(addr_str)
                return {'addressLine1': addr_str}
            except:
                return {'addressLine1': addr_str}

        # Process branches
        processed_branches = []
        dropdown_branches = []
        
        # Pre-fetch related objects safely
        tds_details = getattr(instance, 'tds_details', None) if hasattr(instance, 'tds_details') else None
        terms_conditions = getattr(instance, 'terms_conditions', None) if hasattr(instance, 'terms_conditions') else None
        
        for gst in instance.gst_details.all():
            # Check for new columns first, fallback to legacy JSON
            if gst.address_line_1 or gst.city:
                addressLine1 = gst.address_line_1 or ''
                addressLine2 = gst.address_line_2 or ''
                addressLine3 = gst.address_line_3 or ''
                city = gst.city or ''
                pincode = gst.pincode or ''
                state = gst.state or ''
                country = gst.country or 'India'
            else:
                addr_data = parse_address_data(gst.branch_address)
                addressLine1 = addr_data.get('addressLine1', '')
                addressLine2 = addr_data.get('addressLine2', '')
                addressLine3 = addr_data.get('addressLine3', '')
                city = addr_data.get('city', '')
                pincode = addr_data.get('pincode', '')
                state = addr_data.get('state', '')
                country = addr_data.get('country', 'India')
            
            processed_branch = {
                'id': gst.id,
                'gstin': gst.gstin,
                'defaultRef': gst.branch_reference_name,
                'addressLine1': addressLine1,
                'addressLine2': addressLine2,
                'addressLine3': addressLine3,
                'city': city,
                'pincode': pincode,
                'state': state,
                'country': country,
                'contactPerson': gst.branch_contact_person,
                'email': gst.branch_email,
                'contactNumber': gst.branch_contact_number
            }
            # For backward compatibility if needed, or structured usage
            processed_branches.append(processed_branch)
            
            dropdown_branches.append({
                'id': gst.id,
                'gstin': gst.gstin,
                'branch_reference_name': gst.branch_reference_name or "Main Branch",
                'address_line_1': addressLine1,
                'address_line_2': addressLine2,
                'address_line_3': addressLine3,
                'city': city,
                'state': state,
                'pincode': pincode,
                'country': country,
                'addressLine1': addressLine1,
                'addressLine2': addressLine2,
                'addressLine3': addressLine3,
                'contactPerson': gst.branch_contact_person,
                'email': gst.branch_email,
                'contactNumber': gst.branch_contact_number
            })

        return {
            'id': instance.id,
            'tenant_id': instance.tenant_id,
            'customer_name': instance.customer_name,
            'customer_code': instance.customer_code,
            'customer_category': instance.customer_category_id,
            'customer_category_name': str(instance.customer_category) if instance.customer_category else None,
            'pan_number': instance.pan_number,
            'contact_person': instance.contact_person,
            'email_address': instance.email_address,
            'contact_number': instance.contact_number,
            'billing_currency': instance.billing_currency,
            'is_also_vendor': instance.is_also_vendor,
            'gst_tds_applicable': instance.gst_tds_applicable,
            'ledger_id': instance.ledger_id,
            'is_active': instance.is_active,
            'is_deleted': instance.is_deleted,
            'created_at': instance.created_at.isoformat() if instance.created_at else None,
            'updated_at': instance.updated_at.isoformat() if instance.updated_at else None,
            'created_by': instance.created_by,
            'updated_by': instance.updated_by,
            
            # Form-compatible structure for GST & Branch Configuration
            'gst_details': {
                'gstins': [gst.gstin for gst in instance.gst_details.all() if gst.gstin],
                'branches': processed_branches
            },
            
            # Compatibility list for dropdowns
            'branches': dropdown_branches,
            
            # Products/Services
            'products_services': {
                'items': [
                    {
                        'id': item.id,
                        'itemCode': item.item_code,
                        'itemName': item.item_name,
                        'hsnCode': item.hsn_code,
                        'uom': item.uom,
                        'custItemCode': item.customer_item_code,
                        'custItemName': item.customer_item_name,
                        'packingNotes': item.packing_notes
                    }
                    for item in instance.product_services.all()
                ]
            },
            
            # Banking Information
            'banking_info': {
                'accounts': [
                    {
                        'id': bank.id,
                        'accountNumber': bank.account_number,
                        'bankName': bank.bank_name,
                        'ifscCode': bank.ifsc_code,
                        'branchName': bank.branch_name,
                        'swiftCode': bank.swift_code,
                        'associatedBranches': bank.associated_branches or []
                    }
                    for bank in instance.banking_details.all()
                ]
            },
            
            # Flattened Statutory Details
            'msme_no': getattr(tds_details, 'msme_no', None) if tds_details else None,
            'fssai_no': getattr(tds_details, 'fssai_no', None) if tds_details else None,
            'iec_code': getattr(tds_details, 'iec_code', None) if tds_details else None,
            'eou_status': getattr(tds_details, 'eou_status', None) if tds_details else None,
            'tcs_section': getattr(tds_details, 'tcs_section', None) if tds_details else None,
            'tcs_enabled': getattr(tds_details, 'tcs_enabled', False) if tds_details else False,
            'tds_section': getattr(tds_details, 'tds_section', None) if tds_details else None,
            'tds_enabled': getattr(tds_details, 'tds_enabled', False) if tds_details else False,
            'tax_type': 'TCS' if tds_details and getattr(tds_details, 'tcs_section', None) else ('TDS' if tds_details and getattr(tds_details, 'tds_section', None) else 'NONE'),
            
            # Flattened Terms & Conditions
            'credit_period': getattr(terms_conditions, 'credit_period', None) if terms_conditions else None,
            'credit_terms': getattr(terms_conditions, 'credit_terms', None) if terms_conditions else None,
            'penalty_terms': getattr(terms_conditions, 'penalty_terms', None) if terms_conditions else None,
            'delivery_terms': getattr(terms_conditions, 'delivery_terms', None) if terms_conditions else None,
            'warranty_details': getattr(terms_conditions, 'warranty_details', None) if terms_conditions else None,
            'force_majeure': getattr(terms_conditions, 'force_majeure', None) if terms_conditions else None,
            'dispute_terms': getattr(terms_conditions, 'dispute_terms', None) if terms_conditions else None,
        }


    def create(self, validated_data):
        """
        Create customer and save data to all 6 separate tables
        This is called when 'Onboard Customer' button is clicked
        """
        from .models import (
            CustomerMasterCustomerGSTDetails,
            CustomerMasterCustomerProductService,
            CustomerMasterCustomerTDS,
            CustomerMasterCustomerBanking,
            CustomerMasterCustomerTermsCondition
        )
        from django.db import transaction
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info("=" * 80)
        logger.info("SERIALIZER CREATE METHOD CALLED")
        logger.info("=" * 80)
        logger.info(f"Validated Data Keys: {list(validated_data.keys())}")
        
        # Extract data for separate tables
        gst_details_data = validated_data.pop('gst_details', None)
        products_services_data = validated_data.pop('products_services', None)
        banking_info_data = validated_data.pop('banking_info', None)
        
        logger.info(f"GST Details Data: {gst_details_data}")
        logger.info(f"Products/Services Data: {products_services_data}")
        logger.info(f"Banking Info Data: {banking_info_data}")
        
        # Extract TDS fields
        tds_data = {
            'msme_no': validated_data.pop('msme_no', None),
            'fssai_no': validated_data.pop('fssai_no', None),
            'iec_code': validated_data.pop('iec_code', None),
            'eou_status': validated_data.pop('eou_status', None),
            'tcs_section': validated_data.pop('tcs_section', None),
            'tcs_enabled': validated_data.pop('tcs_enabled', False),
            'tds_section': validated_data.pop('tds_section', None),
            'tds_enabled': validated_data.pop('tds_enabled', False),
        }
        
        logger.info(f"TDS Data: {tds_data}")
        
        # Extract Terms & Conditions fields
        terms_data = {
            'credit_period': validated_data.pop('credit_period', None),
            'credit_terms': validated_data.pop('credit_terms', None),
            'penalty_terms': validated_data.pop('penalty_terms', None),
            'delivery_terms': validated_data.pop('delivery_terms', None),
            'warranty_details': validated_data.pop('warranty_details', None),
            'force_majeure': validated_data.pop('force_majeure', None),
            'dispute_terms': validated_data.pop('dispute_terms', None),
        }
        
        logger.info(f"Terms & Conditions Data: {terms_data}")
        logger.info(f"Any terms data? {any(terms_data.values())}")
        
        # Use transaction to ensure all-or-nothing save
        try:
            with transaction.atomic():
                # 1. Create Basic Details (parent table)
                logger.info("Creating Basic Details...")
                basic_details = super().create(validated_data)
                logger.info(f"[OK] Basic Details created: ID={basic_details.id}, Code={basic_details.customer_code}")
                print("CUSTOMER CREATED - NO LEDGER SHOULD BE CREATED")
                
                # 2. Create GST Details
                logger.info("Creating GST Details...")
                gstins = []
                branches = []
                
                if gst_details_data:
                    gstins = gst_details_data.get('gstins', [])
                    branches = gst_details_data.get('branches', [])
                
                # Use a set to track processed GSTINs to avoid duplicates
                processed_gstins = set()
                
                # Process branches first (they have more detail)
                for branch in branches:
                    branch_gstin = branch.get('gstin')
                    
                    # Construct structured address JSON (Legacy Support)
                    address_data = {
                        'addressLine1': branch.get('addressLine1', branch.get('address', '')),
                        'addressLine2': branch.get('addressLine2', ''),
                        'addressLine3': branch.get('addressLine3', ''),
                        'city': branch.get('city', ''),
                        'pincode': branch.get('pincode', ''),
                        'state': branch.get('state', ''),
                        'country': branch.get('country', 'India')
                    }
                    branch_address_json = json.dumps(address_data)

                    CustomerMasterCustomerGSTDetails.objects.create(
                        customer_basic_detail=basic_details,
                        tenant_id=basic_details.tenant_id,
                        gstin=branch_gstin,
                        branch_reference_name=branch.get('defaultRef'),
                        branch_address=branch_address_json, # Keep legacy JSON for now
                        
                        # New Columns
                        address_line_1=branch.get('addressLine1', branch.get('address', '')),
                        address_line_2=branch.get('addressLine2', ''),
                        address_line_3=branch.get('addressLine3', ''),
                        city=branch.get('city', ''),
                        state=branch.get('state', ''),
                        country=branch.get('country', 'India'),
                        pincode=branch.get('pincode', ''),
                        
                        branch_contact_person=branch.get('contactPerson'),
                        branch_email=branch.get('email'),
                        branch_contact_number=branch.get('contactNumber'),
                        created_by=basic_details.created_by
                    )
                    if branch_gstin:
                        processed_gstins.add(branch_gstin)
                
                # Process remaining GSTINs that didn't have specific branch info
                for gstin in gstins:
                    if gstin and gstin not in processed_gstins:
                        CustomerMasterCustomerGSTDetails.objects.create(
                            customer_basic_detail=basic_details,
                            tenant_id=basic_details.tenant_id,
                            gstin=gstin,
                            is_unregistered=False,
                            created_by=basic_details.created_by
                        )
                        processed_gstins.add(gstin)
                
                # If truly nothing provided, create one empty/unregistered record
                if not processed_gstins and not branches:
                    CustomerMasterCustomerGSTDetails.objects.create(
                        customer_basic_detail=basic_details,
                        tenant_id=basic_details.tenant_id,
                        gstin=None,
                        is_unregistered=True,
                        created_by=basic_details.created_by
                    )
                
                # 3. Create Product/Service mappings (ALWAYS create at least one record, even if empty)
                logger.info("Creating Product/Service mappings...")
                items = []
                
                if products_services_data and 'items' in products_services_data:
                    items = products_services_data['items']
                    logger.info(f"  Items to process: {len(items)}")
                
                created_count = 0
                
                # Process provided items
                for item in items:
                    item_code = item.get('itemCode')
                    # Save all provided rows, even if item_code is missing (e.g. only customer details provided)
                    prod_record = CustomerMasterCustomerProductService.objects.create(
                        customer_basic_detail=basic_details,
                        tenant_id=basic_details.tenant_id,
                        item_code=item_code,
                        item_name=item.get('itemName'),
                        hsn_code=item.get('hsnCode'),
                        uom=item.get('uom'),
                        customer_item_code=item.get('custItemCode'),
                        customer_item_name=item.get('custItemName'),
                        packing_notes=item.get('packingNotes'),
                        created_by=basic_details.created_by
                    )
                    logger.info(f"  [OK] Product/Service created: ID={prod_record.id}, Code={item_code}")
                    created_count += 1
                
                # If no products created, create one empty record
                if created_count == 0:
                    logger.info("  No products provided, creating empty product record...")
                    prod_record = CustomerMasterCustomerProductService.objects.create(
                        customer_basic_detail=basic_details,
                        tenant_id=basic_details.tenant_id,
                        item_code=None,
                        item_name=None,
                        created_by=basic_details.created_by
                    )
                    logger.info(f"  [OK] Empty Product/Service created: ID={prod_record.id}")
                
                # 4. Create TDS Details (ALWAYS create, even if all fields are empty)
                logger.info("Creating TDS Details...")
                tds_record, created = CustomerMasterCustomerTDS.objects.update_or_create(
                    customer_basic_detail=basic_details,
                    defaults={
                        'tenant_id': basic_details.tenant_id,
                        'created_by': basic_details.created_by,
                        **tds_data
                    }
                )
                logger.info(f"  [OK] TDS Details {'created' if created else 'updated'}: ID={tds_record.id}")
                
                # 5. Create Banking Information (ALWAYS create at least one record, even if empty)
                logger.info("Creating Banking Information...")
                accounts = []
                
                if banking_info_data and 'accounts' in banking_info_data:
                    accounts = banking_info_data['accounts']
                
                created_count = 0
                
                # Process provided accounts
                for account in accounts:
                    if account.get('accountNumber'):
                        bank_record = CustomerMasterCustomerBanking.objects.create(
                            customer_basic_detail=basic_details,
                            tenant_id=basic_details.tenant_id,
                            account_number=account.get('accountNumber'),
                            bank_name=account.get('bankName'),
                            ifsc_code=account.get('ifscCode'),
                            branch_name=account.get('branchName'),
                            swift_code=account.get('swiftCode'),
                            associated_branches=account.get('associatedBranches'),
                            created_by=basic_details.created_by
                        )
                        logger.info(f"  [OK] Banking Info created: ID={bank_record.id}, Account={account.get('accountNumber')}")
                        created_count += 1
                
                # If no bank accounts created, create one empty record
                if created_count == 0:
                    logger.info("  No bank accounts provided, creating empty banking record...")
                    bank_record = CustomerMasterCustomerBanking.objects.create(
                        customer_basic_detail=basic_details,
                        tenant_id=basic_details.tenant_id,
                        account_number=None,
                        bank_name=None,
                        ifsc_code=None,
                        created_by=basic_details.created_by
                    )
                    logger.info(f"  [OK] Empty Banking Info created: ID={bank_record.id}")
                
                # 6. Create Terms & Conditions (ALWAYS create, even if all fields are empty)
                logger.info("Creating Terms & Conditions...")
                logger.info(f"  Terms data to save: {terms_data}")
                terms_record, created = CustomerMasterCustomerTermsCondition.objects.update_or_create(
                    customer_basic_detail=basic_details,
                    defaults={
                        'tenant_id': basic_details.tenant_id,
                        'created_by': basic_details.created_by,
                        **terms_data
                    }
                )
                logger.info(f"  [OK] Terms & Conditions {'created' if created else 'updated'}: ID={terms_record.id}")
            
            logger.info("=" * 80)
            logger.info("[OK] CUSTOMER CREATION COMPLETED SUCCESSFULLY")
            logger.info("=" * 80)
            
        except Exception as e:
            logger.error("=" * 80)
            logger.error("[ERROR] ERROR DURING CUSTOMER CREATION")
            logger.error("=" * 80)
            logger.error(f"Error: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            raise
        
        return basic_details

    def update(self, instance, validated_data):
        """
        Update customer and related data in all 6 tables
        """
        from .models import (
            CustomerMasterCustomerGSTDetails,
            CustomerMasterCustomerProductService,
            CustomerMasterCustomerTDS,
            CustomerMasterCustomerBanking,
            CustomerMasterCustomerTermsCondition
        )
        from django.db import transaction
        
        # Extract data for separate tables
        gst_details_data = validated_data.pop('gst_details', None)
        products_services_data = validated_data.pop('products_services', None)
        banking_info_data = validated_data.pop('banking_info', None)
        
        # Extract TDS fields
        tds_data = {
            'msme_no': validated_data.pop('msme_no', None),
            'fssai_no': validated_data.pop('fssai_no', None),
            'iec_code': validated_data.pop('iec_code', None),
            'eou_status': validated_data.pop('eou_status', None),
            'tcs_section': validated_data.pop('tcs_section', None),
            'tcs_enabled': validated_data.pop('tcs_enabled', False),
            'tds_section': validated_data.pop('tds_section', None),
            'tds_enabled': validated_data.pop('tds_enabled', False),
        }
        
        # Extract Terms & Conditions fields
        terms_data = {
            'credit_period': validated_data.pop('credit_period', None),
            'credit_terms': validated_data.pop('credit_terms', None),
            'penalty_terms': validated_data.pop('penalty_terms', None),
            'delivery_terms': validated_data.pop('delivery_terms', None),
            'warranty_details': validated_data.pop('warranty_details', None),
            'force_majeure': validated_data.pop('force_majeure', None),
            'dispute_terms': validated_data.pop('dispute_terms', None),
        }
        
        with transaction.atomic():
            # Update basic details
            instance = super().update(instance, validated_data)
            
            # Update GST Details
            if gst_details_data is not None:
                # Delete existing GST details
                CustomerMasterCustomerGSTDetails.objects.filter(customer_basic_detail=instance).delete()
                
                gstins = gst_details_data.get('gstins', [])
                branches = gst_details_data.get('branches', [])
                processed_gstins = set()
                
                for branch in branches:
                    branch_gstin = branch.get('gstin')
                    
                    # Construct structured address JSON (Legacy Support)
                    address_data = {
                        'addressLine1': branch.get('addressLine1', branch.get('address', '')),
                        'addressLine2': branch.get('addressLine2', ''),
                        'addressLine3': branch.get('addressLine3', ''),
                        'city': branch.get('city', ''),
                        'pincode': branch.get('pincode', ''),
                        'state': branch.get('state', ''),
                        'country': branch.get('country', 'India')
                    }
                    branch_address_json = json.dumps(address_data)

                    CustomerMasterCustomerGSTDetails.objects.create(
                        customer_basic_detail=instance,
                        tenant_id=instance.tenant_id,
                        gstin=branch_gstin,
                        branch_reference_name=branch.get('defaultRef'),
                        branch_address=branch_address_json, # Keep legacy JSON
                        
                        # New Columns
                        address_line_1=branch.get('addressLine1', branch.get('address', '')),
                        address_line_2=branch.get('addressLine2', ''),
                        address_line_3=branch.get('addressLine3', ''),
                        city=branch.get('city', ''),
                        state=branch.get('state', ''),
                        country=branch.get('country', 'India'),
                        pincode=branch.get('pincode', ''),
                        
                        branch_contact_person=branch.get('contactPerson'),
                        branch_email=branch.get('email'),
                        branch_contact_number=branch.get('contactNumber'),
                        updated_by=instance.updated_by
                    )
                    if branch_gstin:
                        processed_gstins.add(branch_gstin)
                
                for gstin in gstins:
                    if gstin and gstin not in processed_gstins:
                        CustomerMasterCustomerGSTDetails.objects.create(
                            customer_basic_detail=instance,
                            tenant_id=instance.tenant_id,
                            gstin=gstin,
                            is_unregistered=False,
                            updated_by=instance.updated_by
                        )
                        processed_gstins.add(gstin)
                
                if not processed_gstins and not branches:
                    CustomerMasterCustomerGSTDetails.objects.create(
                        customer_basic_detail=instance,
                        tenant_id=instance.tenant_id,
                        gstin=None,
                        is_unregistered=True,
                        updated_by=instance.updated_by
                    )
            
            # Update Products/Services
            if products_services_data is not None:
                CustomerMasterCustomerProductService.objects.filter(customer_basic_detail=instance).delete()
                
                items = products_services_data.get('items', [])
                for item in items:
                    CustomerMasterCustomerProductService.objects.create(
                            customer_basic_detail=instance,
                            tenant_id=instance.tenant_id,
                            item_code=item.get('itemCode'),
                            item_name=item.get('itemName'),
                            hsn_code=item.get('hsnCode'),
                            uom=item.get('uom'),
                            customer_item_code=item.get('custItemCode'),
                            customer_item_name=item.get('custItemName'),
                            packing_notes=item.get('packingNotes'),
                            updated_by=instance.updated_by
                        )
            
            # Update TDS Details
            if any(tds_data.values()):
                tds_instance, created = CustomerMasterCustomerTDS.objects.get_or_create(
                    customer_basic_detail=instance,
                    defaults={'tenant_id': instance.tenant_id}
                )
                for key, value in tds_data.items():
                    setattr(tds_instance, key, value)
                tds_instance.updated_by = instance.updated_by
                tds_instance.save()
            
            # Update Banking Info
            if banking_info_data is not None:
                CustomerMasterCustomerBanking.objects.filter(customer_basic_detail=instance).delete()
                
                accounts = banking_info_data.get('accounts', [])
                for account in accounts:
                    if account.get('accountNumber'):
                        CustomerMasterCustomerBanking.objects.create(
                            customer_basic_detail=instance,
                            tenant_id=instance.tenant_id,
                            account_number=account.get('accountNumber'),
                            bank_name=account.get('bankName'),
                            ifsc_code=account.get('ifscCode'),
                            branch_name=account.get('branchName'),
                            swift_code=account.get('swiftCode'),
                            associated_branches=account.get('associatedBranches'),
                            updated_by=instance.updated_by
                        )
            
            # Update Terms & Conditions
            if any(terms_data.values()):
                terms_instance, created = CustomerMasterCustomerTermsCondition.objects.get_or_create(
                    customer_basic_detail=instance,
                    defaults={'tenant_id': instance.tenant_id}
                )
                for key, value in terms_data.items():
                    setattr(terms_instance, key, value)
                terms_instance.updated_by = instance.updated_by
                terms_instance.save()
        
        return instance



class CustomerTransactionSerializer(serializers.ModelSerializer):
    """Serializer for Customer Transaction"""
    debit = serializers.SerializerMethodField()
    credit = serializers.SerializerMethodField()
    date = serializers.DateField(source='transaction_date')
    voucher_number = serializers.CharField(source='transaction_number')
    customer = serializers.IntegerField(source='customer_id')
    
    class Meta:
        model = CustomerTransaction
        fields = [
            'id', 'tenant_id', 'customer', 'customer_id', 'transaction_type',
            'voucher_number', 'transaction_number', 'date', 'transaction_date',
            'amount', 'tax_amount', 'total_amount',
            'debit', 'credit',
            'payment_status', 'payment_mode',
            'reference_number', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_debit(self, obj):
        t_type = (obj.transaction_type or '').upper()
        if t_type in ['INVOICE', 'DEBIT_NOTE']:
            return obj.total_amount or obj.amount
        return 0

    def get_credit(self, obj):
        t_type = (obj.transaction_type or '').upper()
        if t_type in ['PAYMENT', 'CREDIT_NOTE', 'RECEIPT']:
            return obj.total_amount or obj.amount
        return 0


# class CustomerSalesQuotationSerializer(serializers.ModelSerializer):
#     """Serializer for Sales Quotation"""
#     
#     class Meta:
#         # model = CustomerSalesQuotation
#         fields = [
#             'id', 'tenant_id', 'customer_id', 'quotation_number',
#             'quotation_date', 'valid_until',
#             'subtotal', 'tax_amount', 'discount_amount', 'total_amount',
#             'status', 'terms_and_conditions', 'notes',
#             'created_at', 'updated_at'
#         ]
#         read_only_fields = ['id', 'created_at', 'updated_at']


# class CustomerSalesOrderSerializer(serializers.ModelSerializer):
#     """Serializer for Sales Order"""
#     
#     class Meta:
#         # model = CustomerSalesOrder
#         fields = [
#             'id', 'tenant_id', 'customer_id', 'order_number',
#             'order_date', 'expected_delivery_date',
#             'quotation_reference', 'po_number',
#             'subtotal', 'tax_amount', 'discount_amount', 'shipping_charges', 'total_amount',
#             'status', 'notes',
#             'created_at', 'updated_at'
#         ]
#         read_only_fields = ['id', 'created_at', 'updated_at']


# ============================================================================
# LONG-TERM CONTRACTS SERIALIZERS
# ============================================================================

class CustomerMasterLongTermContractProductServiceSerializer(serializers.ModelSerializer):
    """Serializer for Long-term Contract Products/Services"""
    
    class Meta:
        model = CustomerMasterLongTermContractProductService
        fields = [
            'id', 'tenant_id', 'contract_basic_detail', 'item_code', 'item_name',
            'customer_item_name', 'uom', 'qty_min', 'qty_max', 'price_min', 'price_max',
            'acceptable_price_deviation', 'created_at', 'updated_at', 'created_by'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class CustomerMasterLongTermContractTermsConditionSerializer(serializers.ModelSerializer):
    """Serializer for Long-term Contract Terms & Conditions"""
    
    class Meta:
        model = CustomerMasterLongTermContractTermsCondition
        fields = [
            'id', 'tenant_id', 'contract_basic_detail', 'payment_terms', 'penalty_terms',
            'force_majeure', 'termination_clause', 'dispute_terms', 'others',
            'created_at', 'updated_at', 'created_by'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class CustomerMasterLongTermContractBasicDetailSerializer(serializers.ModelSerializer):
    """Serializer for Long-term Contract Basic Details"""
    products_services = CustomerMasterLongTermContractProductServiceSerializer(many=True, read_only=True)
    terms_conditions = CustomerMasterLongTermContractTermsConditionSerializer(read_only=True)
    branch_name = serializers.SerializerMethodField()
    
    class Meta:
        model = CustomerMasterLongTermContractBasicDetail
        fields = [
            'id', 'tenant_id', 'contract_number', 'customer_id', 'customer_name',
            'branch_id', 'branch_name', 'contract_type', 'contract_validity_from', 'contract_validity_to',
            'contract_document', 'automate_billing', 'bill_start_date', 'billing_frequency',
            'bill_period_from', 'bill_period_to',
            'is_active', 'is_deleted', 'created_at', 'updated_at', 'created_by',
            'products_services', 'terms_conditions'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_by', 'created_at', 'updated_at']

    def get_branch_name(self, obj):
        """Get the branch reference name for display"""
        if not obj.branch_id:
            return "Main Branch"
            
        try:
            from .models import CustomerMasterCustomerGSTDetails
            branch = CustomerMasterCustomerGSTDetails.objects.filter(id=obj.branch_id).first()
            if branch:
                return branch.branch_reference_name or "Main Branch"
            return "Unknown Branch"
        except Exception:
            return "Unknown Branch"


class CustomerTransactionSalesQuotationGeneralSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerTransactionSalesQuotationGeneral
        fields = '__all__'
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']


class CustomerTransactionSalesQuotationSpecificSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerTransactionSalesQuotationSpecific
        fields = '__all__'
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at']


class CustomerTransactionSalesOrderItemDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerTransactionSalesOrderItemDetails
        fields = ['id', 'item_code', 'item_name', 'quantity', 'uom', 'price', 'taxable_value', 'gst_rate', 'gst', 'net_value', 'packing_notes']


class CustomerTransactionSalesOrderDeliveryTermsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerTransactionSalesOrderDeliveryTerms
        fields = ['id', 'deliver_at', 'delivery_date', 'third_party_address']


class CustomerTransactionSalesOrderPaymentAndSalespersonSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerTransactionSalesOrderPaymentAndSalesperson
        fields = ['id', 'credit_period', 'salesperson_in_charge', 'employee_id', 'employee_name']


class CustomerTransactionSalesOrderQuotationDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerTransactionSalesOrderQuotationDetails
        fields = ['id', 'quotation_type', 'quotation_number']


class CustomerTransactionSalesOrderSerializer(serializers.ModelSerializer):
    """
    Serializer for Sales Order
    Handles saving data to all 5 separate tables when 'Save' is clicked
    """
    items = CustomerTransactionSalesOrderItemDetailsSerializer(many=True, required=False)
    delivery_terms = CustomerTransactionSalesOrderDeliveryTermsSerializer(required=False)
    payment_and_salesperson = CustomerTransactionSalesOrderPaymentAndSalespersonSerializer(required=False)
    quotation_details = CustomerTransactionSalesOrderQuotationDetailsSerializer(required=False)

    class Meta:
        model = CustomerTransactionSalesOrderBasicDetails
        fields = [
            'id', 'tenant_id', 'so_series_name', 'so_number', 'date', 
            'customer_po_number', 'customer_name', 'gst_no', 'branch', 'address', 
            'email', 'contact_number', 'status',
            'is_active', 'is_deleted', 'created_at', 'updated_at', 
            'created_by', 'updated_by', 'items', 'delivery_terms', 
            'payment_and_salesperson', 'quotation_details'
        ]
        read_only_fields = ['id', 'tenant_id', 'created_at', 'updated_at', 'status']

    def to_representation(self, instance):
        repr = super().to_representation(instance)
        
        # If address is missing, fallback to Customer master's branch address
        if not repr.get('address'):
            try:
                from .models import CustomerMasterCustomerBasicDetails, CustomerMasterCustomerGSTDetails
                customer = CustomerMasterCustomerBasicDetails.objects.filter(
                    tenant_id=instance.tenant_id, 
                    customer_name=instance.customer_name
                ).first()
                
                if customer:
                    branch_qs = CustomerMasterCustomerGSTDetails.objects.filter(
                        customer_basic_detail=customer
                    )
                    branch_match = None
                    if instance.branch:
                        branch_match = branch_qs.filter(branch_reference_name=instance.branch).first()
                    
                    if not branch_match:
                        branch_match = branch_qs.first()
                        
                    if branch_match:
                        # Return address, either from address_line_1 or parse legacy JSON branch_address
                        address_val = branch_match.address_line_1
                        if not address_val and branch_match.branch_address:
                            import json
                            try:
                                parsed = json.loads(branch_match.branch_address)
                                address_val = parsed.get("addressLine1") or parsed.get("address") or branch_match.branch_address
                            except:
                                address_val = branch_match.branch_address
                                
                        repr['address'] = address_val or ''
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error fetching address fallback for SO: {str(e)}")
                
        return repr

    def create(self, validated_data):
        """
        Create sales order and save data to all 5 separate tables
        """
        from django.db import transaction
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info("=== Creating Sales Order ===")
        
        # Extract nested data
        # Extract nested data
        items_data = validated_data.pop('items', [])
        delivery_terms_data = validated_data.pop('delivery_terms', None)
        payment_and_salesperson_data = validated_data.pop('payment_and_salesperson', None)
        quotation_details_data = validated_data.pop('quotation_details', None)
        
        try:
            with transaction.atomic():
                # 1. Create Basic Details
                sales_order = CustomerTransactionSalesOrderBasicDetails.objects.create(**validated_data)
                logger.info(f"[OK] Basic Details created: ID={sales_order.id}, SO Number={sales_order.so_number}")
                
                # 2. Create Items
                for item_data in items_data:
                    item_data['tenant_id'] = sales_order.tenant_id
                    CustomerTransactionSalesOrderItemDetails.objects.create(
                        so_basic_detail=sales_order, 
                        **item_data
                    )
                logger.info(f"[OK] Created {len(items_data)} items")
                
                # 3. Create Delivery Terms (if provided)
                if delivery_terms_data:
                    delivery_terms_data['tenant_id'] = sales_order.tenant_id
                    CustomerTransactionSalesOrderDeliveryTerms.objects.create(
                        so_basic_detail=sales_order, 
                        **delivery_terms_data
                    )
                    logger.info("[OK] Delivery Terms created")
                
                # 4. Create Payment and Salesperson (if provided)
                if payment_and_salesperson_data:
                    payment_and_salesperson_data['tenant_id'] = sales_order.tenant_id
                    CustomerTransactionSalesOrderPaymentAndSalesperson.objects.create(
                        so_basic_detail=sales_order, 
                        **payment_and_salesperson_data
                    )
                    logger.info("[OK] Payment and Salesperson created")
                
                # 5. Create Quotation Details (if provided)
                if quotation_details_data:
                    quotation_details_data['tenant_id'] = sales_order.tenant_id
                    CustomerTransactionSalesOrderQuotationDetails.objects.create(
                        so_basic_detail=sales_order, 
                        **quotation_details_data
                    )
                    logger.info("[OK] Quotation Details created")
                
                logger.info("=== Sales Order Creation Completed ===")
                return sales_order
                
                
        except Exception as e:
            logger.error(f"[ERROR] Error creating sales order: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            raise

    def update(self, instance, validated_data):
        """
        Update sales order and related data in all 5 separate tables
        """
        from django.db import transaction
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"=== Updating Sales Order {instance.id} ===")
        
        # Extract nested data
        items_data = validated_data.pop('items', None)
        delivery_terms_data = validated_data.pop('delivery_terms', None)
        payment_and_salesperson_data = validated_data.pop('payment_and_salesperson', None)
        quotation_details_data = validated_data.pop('quotation_details', None)
        
        try:
            with transaction.atomic():
                # 1. Update Basic Details
                for attr, value in validated_data.items():
                    setattr(instance, attr, value)
                instance.save()
                logger.info(f"[OK] Basic Details updated: ID={instance.id}")
                
                # 2. Update Items
                if items_data is not None:
                    # Delete existing items and recreate
                    CustomerTransactionSalesOrderItemDetails.objects.filter(so_basic_detail=instance).delete()
                    for item_data in items_data:
                        item_data['tenant_id'] = instance.tenant_id
                        CustomerTransactionSalesOrderItemDetails.objects.create(
                            so_basic_detail=instance, 
                            **item_data
                        )
                    logger.info(f"[OK] Updated {len(items_data)} items")
                
                # 3. Update Delivery Terms
                if delivery_terms_data is not None:
                    CustomerTransactionSalesOrderDeliveryTerms.objects.filter(so_basic_detail=instance).delete()
                    delivery_terms_data['tenant_id'] = instance.tenant_id
                    CustomerTransactionSalesOrderDeliveryTerms.objects.create(
                        so_basic_detail=instance, 
                        **delivery_terms_data
                    )
                    logger.info("[OK] Delivery Terms updated")
                
                # 4. Update Payment and Salesperson
                if payment_and_salesperson_data is not None:
                    CustomerTransactionSalesOrderPaymentAndSalesperson.objects.filter(so_basic_detail=instance).delete()
                    payment_and_salesperson_data['tenant_id'] = instance.tenant_id
                    CustomerTransactionSalesOrderPaymentAndSalesperson.objects.create(
                        so_basic_detail=instance, 
                        **payment_and_salesperson_data
                    )
                    logger.info("[OK] Payment and Salesperson updated")
                
                # 5. Update Quotation Details
                if quotation_details_data is not None:
                    CustomerTransactionSalesOrderQuotationDetails.objects.filter(so_basic_detail=instance).delete()
                    quotation_details_data['tenant_id'] = instance.tenant_id
                    CustomerTransactionSalesOrderQuotationDetails.objects.create(
                        so_basic_detail=instance, 
                        **quotation_details_data
                    )
                    logger.info("[OK] Quotation Details updated")
                
                logger.info("=== Sales Order Update Completed ===")
                return instance
                
        except Exception as e:
            logger.error(f"[ERROR] Error updating sales order: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            raise
