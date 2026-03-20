"""
Sales Voucher Database Access Layer
Handles all database operations for sales vouchers.
"""

from typing import List, Dict, Optional
from django.db.models import QuerySet


def get_voucher_types(tenant_id: str) -> QuerySet:
    """
    Fetch all active receipt voucher types for a tenant.
    
    Args:
        tenant_id: Tenant ID
        
    Returns:
        QuerySet: Active receipt voucher types
    """
    from masters.voucher_master_models import MasterVoucherReceipts as ReceiptVoucherType
    
    return ReceiptVoucherType.objects.filter(
        tenant_id=tenant_id,
        is_active=True
    ).order_by('id') # display_order missing in MasterVoucherReceipts?


def get_voucher_configurations(tenant_id: str, voucher_type: Optional[str] = None) -> QuerySet:
    """
    Fetch active voucher configurations.
    Used for populating voucher type dropdown based on configurations.
    
    Args:
        tenant_id: Tenant ID
        voucher_type: Optional type filter (e.g. 'sales')
        
    Returns:
        QuerySet: VoucherConfiguration objects
    """
    from masters.voucher_master_models import MasterVoucherSales as VoucherConfiguration
    
    queryset = VoucherConfiguration.objects.filter(
        tenant_id=tenant_id,
        is_active=True
    )
    
    # MasterVoucherSales does NOT have voucher_type field. It is strictly 'sales' implicitly.
    # So if voucher_type 'sales' is requested, we return all. 
    # If other types requested, we return none from this model?
    # This function seems legacy.
    
    return queryset.order_by('voucher_name')


def get_customers(tenant_id: str) -> QuerySet:
    """
    Fetch all customer ledgers for a tenant.
    Customers are ledgers from specific groups (Sundry Debtors, etc.)
    
    Args:
        tenant_id: Tenant ID
        
    Returns:
        QuerySet: Customer ledgers
    """
    from accounting.models import MasterLedger
    
    # Filter for customer groups
    # Adjust group names based on your chart of accounts
    customer_groups = ['Sundry Debtors', 'Customers', 'Debtors']
    
    return MasterLedger.objects.filter(
        tenant_id=tenant_id,
        group__in=customer_groups
    ).order_by('name')


def get_sales_voucher(voucher_id: int, tenant_id: str) -> Optional['SalesVoucher']:
    """
    Fetch a single sales voucher with related items and documents.
    
    Args:
        voucher_id: Sales voucher ID
        tenant_id: Tenant ID
        
    Returns:
        SalesVoucher or None
    """
    from accounting.models import SalesVoucher
    
    try:
        return SalesVoucher.objects.prefetch_related('items', 'documents').get(
            id=voucher_id,
            tenant_id=tenant_id
        )
    except SalesVoucher.DoesNotExist:
        return None


def get_sales_vouchers(tenant_id: str, filters: Optional[Dict] = None, prefetch: bool = True) -> QuerySet:
    """
    Fetch all sales vouchers for a tenant with optional filters.
    """
    from accounting.models import SalesVoucher, MasterLedger
    
    queryset = SalesVoucher.objects.filter(tenant_id=tenant_id)
    
    if filters:
        if filters.get('date_from'):
            queryset = queryset.filter(date__gte=filters['date_from'])
        if filters.get('date_to'):
            queryset = queryset.filter(date__lte=filters['date_to'])
            
        if filters.get('customer_id'):
            # Schema uses customer_name, API passes customer_id
            # We must look up the name first
            try:
                # Try MasterLedger first (Sundry Debtors)
                c = MasterLedger.objects.filter(id=filters['customer_id'], tenant_id=tenant_id).first()
                if c:
                    queryset = queryset.filter(customer_name=c.name)
                else:
                    # Try Customer Portal master
                    from customerportal.models import CustomerMasterCustomerBasicDetails
                    c_portal = CustomerMasterCustomerBasicDetails.objects.filter(id=filters['customer_id'], tenant_id=tenant_id).first()
                    if c_portal:
                        queryset = queryset.filter(customer_name=c_portal.customer_name)
                    else:
                        return SalesVoucher.objects.none()
            except Exception:
                return SalesVoucher.objects.none()

        if filters.get('customer_name'):
            queryset = queryset.filter(customer_name=filters['customer_name'])

        # Schema does not have status column in header?
        # if filters.get('status'):
        #    queryset = queryset.filter(status=filters['status'])
    
    # Prefetch items? 'items' is related_name for VoucherSalesItems
    if prefetch:
        queryset = queryset.prefetch_related('items')
    
    # FKs removed, so no select_related
    # queryset = queryset.select_related('customer', 'voucher_type')
        
    return queryset.order_by('-date', '-id')


def save_voucher_document(voucher_id: int, tenant_id: str, file_data: Dict) -> 'SalesVoucherDocument':
    """
    Save a supporting document for a sales voucher.
    NOTE: Schema only supports SINGLE document in 'supporting_document' field.
    We overwite it.
    """
    from accounting.models import SalesVoucher
    
    # Mock return object to satisfy type hint/signature if needed
    # But function returns 'SalesVoucherDocument' which is aliased/commented out?
    # Actually SalesVoucherDocument is commented out in models.py
    # So this return type hint is invalid if strict.
    # But Python runtime might be lenient if imported inside function.
    
    try:
        voucher = SalesVoucher.objects.get(id=voucher_id, tenant_id=tenant_id)
        # We just update the supporting_document field with the path
        voucher.supporting_document = file_data['file_path']
        voucher.save()
        
        # We return a dict or similar structure to mimic the serializer input
        class MockDocument:
            def __init__(self, **kwargs):
                for k, v in kwargs.items():
                    setattr(self, k, v)
        
        return MockDocument(
            id=0,
            file_name=file_data['file_name'],
            file_path=file_data['file_path'],
            file_type=file_data['file_type'],
            file_size=file_data['file_size'],
            uploaded_at=None
        )
    except Exception as e:
        raise e


def update_sales_voucher_step(voucher_id: int, tenant_id: str, step: int, data: Optional[Dict] = None) -> 'SalesVoucher':
    """
    Update sales voucher current step and optional data.
    Fields missing in schema are ignored.
    """
    from accounting.models import SalesVoucher
    
    voucher = SalesVoucher.objects.get(id=voucher_id, tenant_id=tenant_id)
    # voucher.current_step = step # Not in schema
    
    if data:
        pass
        # If schema supported related tables for payment/dispatch, we would update them here.
        
    return voucher


def complete_sales_voucher(voucher_id: int, tenant_id: str) -> 'SalesVoucher':
    """
    Mark sales voucher as completed.
    Schema lacks status, so this is a no-op or just returns the voucher.
    """
    from accounting.models import SalesVoucher
    
    voucher = SalesVoucher.objects.get(id=voucher_id, tenant_id=tenant_id)
    # voucher.status = 'completed' # Not in schema
    # voucher.save()
    
    return voucher


def delete_sales_voucher(voucher_id: int, tenant_id: str) -> bool:
    """
    Delete a sales voucher.
    Hard delete since schema lacks status for soft delete.
    """
    from accounting.models import SalesVoucher
    
    voucher = SalesVoucher.objects.get(id=voucher_id, tenant_id=tenant_id)
    voucher.delete()
    
    return True
