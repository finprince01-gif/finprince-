"""
Business flow logic for Vendor management.
This module contains business logic and workflows for vendors.
"""

from decimal import Decimal
from django.db import transaction
from .vendor_database import VendorDatabase
from .models import Vendor


class VendorFlow:
    """
    Business flow logic for Vendor management.
    This class contains complex business logic and workflows.
    """
    
    @staticmethod
    def create_vendor_with_validation(tenant_id, vendor_data, created_by=None):
        """
        Create a vendor with comprehensive business validation.
        
        Args:
            tenant_id: Tenant identifier
            vendor_data: Dictionary containing vendor data
            created_by: Username of creator
            
        Returns:
            Tuple of (success: bool, vendor or error_message)
        """
        try:
            # Business rule: Vendor name is mandatory
            if not vendor_data.get('vendor_name'):
                return False, "Vendor name is required"
            
            # Business rule: Email validation if provided
            email = vendor_data.get('email')
            if email:
                if VendorDatabase.check_duplicate_email(tenant_id, email):
                    return False, f"Email {email} is already registered"
            
            # Business rule: Vendor code uniqueness
            vendor_code = vendor_data.get('vendor_code')
            if vendor_code:
                if VendorDatabase.check_duplicate_vendor_code(vendor_code):
                    return False, f"Vendor code {vendor_code} already exists"
            
            # Business rule: Credit limit validation
            credit_limit = vendor_data.get('credit_limit')
            if credit_limit and credit_limit < 0:
                return False, "Credit limit cannot be negative"
            
            # Create vendor
            vendor = VendorDatabase.create_vendor(
                tenant_id=tenant_id,
                vendor_data=vendor_data,
                created_by=created_by
            )
            
            return True, vendor
            
        except Exception as e:
            return False, str(e)
    
    @staticmethod
    def update_vendor_with_validation(vendor_id, update_data, updated_by=None):
        """
        Update a vendor with business validation.
        
        Args:
            vendor_id: ID of the vendor to update
            update_data: Dictionary of fields to update
            updated_by: Username of updater
            
        Returns:
            Tuple of (success: bool, vendor or error_message)
        """
        try:
            # Get existing vendor
            vendor = VendorDatabase.get_vendor_by_id(vendor_id)
            if not vendor:
                return False, "Vendor not found"
            
            # Business rule: Email uniqueness (excluding current vendor)
            email = update_data.get('email')
            if email:
                if VendorDatabase.check_duplicate_email(
                    vendor.tenant_id, email, exclude_id=vendor_id
                ):
                    return False, f"Email {email} is already registered"
            
            # Business rule: Credit limit validation
            credit_limit = update_data.get('credit_limit')
            if credit_limit is not None and credit_limit < 0:
                return False, "Credit limit cannot be negative"
            
            # Update vendor
            updated_vendor = VendorDatabase.update_vendor(
                vendor_id=vendor_id,
                update_data=update_data,
                updated_by=updated_by
            )
            
            if updated_vendor:
                return True, updated_vendor
            else:
                return False, "Failed to update vendor"
                
        except Exception as e:
            return False, str(e)
    
    @staticmethod
    def process_vendor_payment(vendor_id, payment_amount, payment_reference=None):
        """
        Process a payment to a vendor and update balance.
        
        Args:
            vendor_id: ID of the vendor
            payment_amount: Amount being paid
            payment_reference: Optional payment reference
            
        Returns:
            Tuple of (success: bool, vendor or error_message)
        """
        try:
            with transaction.atomic():
                vendor = VendorDatabase.get_vendor_by_id(vendor_id)
                if not vendor:
                    return False, "Vendor not found"
                
                # Business rule: Payment amount must be positive
                if payment_amount <= 0:
                    return False, "Payment amount must be greater than zero"
                
                # Business rule: Cannot pay more than outstanding balance
                if payment_amount > vendor.current_balance:
                    return False, f"Payment amount ({payment_amount}) exceeds outstanding balance ({vendor.current_balance})"
                
                # Update vendor balance
                updated_vendor = VendorDatabase.update_vendor_balance(
                    vendor_id=vendor_id,
                    amount=payment_amount,
                    operation='subtract'
                )
                
                # TODO: Create payment transaction record
                # This would link to a payment voucher or transaction table
                
                return True, updated_vendor
                
        except Exception as e:
            return False, str(e)
    
    @staticmethod
    def process_vendor_purchase(vendor_id, purchase_amount, purchase_reference=None):
        """
        Process a purchase from a vendor and update balance.
        
        Args:
            vendor_id: ID of the vendor
            purchase_amount: Amount of purchase
            purchase_reference: Optional purchase reference (PO number, etc.)
            
        Returns:
            Tuple of (success: bool, vendor or error_message)
        """
        try:
            with transaction.atomic():
                vendor = VendorDatabase.get_vendor_by_id(vendor_id)
                if not vendor:
                    return False, "Vendor not found"
                
                # Business rule: Purchase amount must be positive
                if purchase_amount <= 0:
                    return False, "Purchase amount must be greater than zero"
                
                # Business rule: Check credit limit
                if vendor.credit_limit:
                    new_balance = vendor.current_balance + purchase_amount
                    if new_balance > vendor.credit_limit:
                        return False, f"Purchase would exceed credit limit. Current: {vendor.current_balance}, Limit: {vendor.credit_limit}"
                
                # Update vendor balance
                updated_vendor = VendorDatabase.update_vendor_balance(
                    vendor_id=vendor_id,
                    amount=purchase_amount,
                    operation='add'
                )
                
                # TODO: Create purchase transaction record
                # This would link to a purchase order or invoice
                
                return True, updated_vendor
                
        except Exception as e:
            return False, str(e)
    
    @staticmethod
    def verify_vendor(vendor_id, verified_by=None):
        """
        Verify a vendor after validation checks.
        
        Args:
            vendor_id: ID of the vendor
            verified_by: Username of verifier
            
        Returns:
            Tuple of (success: bool, vendor or error_message)
        """
        try:
            vendor = VendorDatabase.get_vendor_by_id(vendor_id)
            if not vendor:
                return False, "Vendor not found"
            
            # Business rule: Check if vendor has minimum required information
            if not vendor.email and not vendor.phone:
                return False, "Vendor must have at least email or phone number to be verified"
            
            if not vendor.billing_address_line1:
                return False, "Vendor must have billing address to be verified"
            
            # Update vendor verification status
            updated_vendor = VendorDatabase.update_vendor(
                vendor_id=vendor_id,
                update_data={'is_verified': True},
                updated_by=verified_by
            )
            
            if updated_vendor:
                return True, updated_vendor
            else:
                return False, "Failed to verify vendor"
                
        except Exception as e:
            return False, str(e)
    
    @staticmethod
    def can_delete_vendor(vendor_id):
        """
        Check if a vendor can be deleted based on business rules.
        
        Args:
            vendor_id: ID of the vendor
            
        Returns:
            Tuple of (can_delete: bool, reason: str)
        """
        try:
            vendor = VendorDatabase.get_vendor_by_id(vendor_id)
            if not vendor:
                return False, "Vendor not found"
            
            # Business rule: Cannot delete vendor with outstanding balance
            if vendor.current_balance > 0:
                return False, f"Cannot delete vendor with outstanding balance of {vendor.current_balance}"
            
            # TODO: Check if vendor has any transactions
            # has_transactions = check_vendor_transactions(vendor_id)
            # if has_transactions:
            #     return False, "Cannot delete vendor with existing transactions"
            
            return True, "Vendor can be deleted"
            
        except Exception as e:
            return False, str(e)
    
    @staticmethod
    def get_vendor_aging_report(tenant_id, days_buckets=None):
        """
        Generate vendor aging report.
        
        Args:
            tenant_id: Tenant identifier
            days_buckets: List of day ranges for aging (default: [30, 60, 90])
            
        Returns:
            Dictionary with aging analysis
        """
        if days_buckets is None:
            days_buckets = [30, 60, 90]
        
        # TODO: Implement aging analysis based on transaction dates
        # This would require integration with transaction/invoice tables
        
        vendors = VendorDatabase.get_vendors_with_outstanding_balance(tenant_id)
        
        aging_report = {
            'total_vendors': vendors.count(),
            'total_outstanding': sum(v.current_balance for v in vendors),
            'vendors': []
        }
        
        for vendor in vendors:
            aging_report['vendors'].append({
                'vendor_id': vendor.id,
                'vendor_code': vendor.vendor_code,
                'vendor_name': vendor.vendor_name,
                'outstanding_balance': vendor.current_balance,
                'credit_limit': vendor.credit_limit,
                'payment_terms': vendor.payment_terms
            })
        
        return aging_report
    
    @staticmethod
    def bulk_import_vendors(tenant_id, vendors_data, created_by=None):
        """
        Bulk import vendors with validation.
        
        Args:
            tenant_id: Tenant identifier
            vendors_data: List of dictionaries containing vendor data
            created_by: Username of creator
            
        Returns:
            Dictionary with import results
        """
        results = {
            'success': [],
            'failed': [],
            'total': len(vendors_data)
        }
        
        for idx, vendor_data in enumerate(vendors_data):
            try:
                success, result = VendorFlow.create_vendor_with_validation(
                    tenant_id=tenant_id,
                    vendor_data=vendor_data,
                    created_by=created_by
                )
                
                if success:
                    results['success'].append({
                        'row': idx + 1,
                        'vendor_code': result.vendor_code,
                        'vendor_name': result.vendor_name
                    })
                else:
                    results['failed'].append({
                        'row': idx + 1,
                        'data': vendor_data,
                        'error': result
                    })
            except Exception as e:
                results['failed'].append({
                    'row': idx + 1,
                    'data': vendor_data,
                    'error': str(e)
                })
        
        results['success_count'] = len(results['success'])
        results['failed_count'] = len(results['failed'])
        
        return results
    
    @staticmethod
    def calculate_vendor_credit_utilization(vendor_id):
        """
        Calculate credit utilization percentage for a vendor.
        
        Args:
            vendor_id: ID of the vendor
            
        Returns:
            Dictionary with credit utilization details
        """
        vendor = VendorDatabase.get_vendor_by_id(vendor_id)
        if not vendor:
            return None
        
        if not vendor.credit_limit or vendor.credit_limit == 0:
            return {
                'vendor_id': vendor_id,
                'credit_limit': 0,
                'current_balance': vendor.current_balance,
                'available_credit': 0,
                'utilization_percentage': 0,
                'status': 'No credit limit set'
            }
        
        utilization_percentage = (vendor.current_balance / vendor.credit_limit) * 100
        available_credit = vendor.credit_limit - vendor.current_balance
        
        # Determine status
        if utilization_percentage >= 100:
            status = 'Exceeded'
        elif utilization_percentage >= 90:
            status = 'Critical'
        elif utilization_percentage >= 75:
            status = 'High'
        elif utilization_percentage >= 50:
            status = 'Moderate'
        else:
            status = 'Good'
        
        return {
            'vendor_id': vendor_id,
            'vendor_code': vendor.vendor_code,
            'vendor_name': vendor.vendor_name,
            'credit_limit': vendor.credit_limit,
            'current_balance': vendor.current_balance,
            'available_credit': available_credit,
            'utilization_percentage': round(utilization_percentage, 2),
            'status': status
        }
