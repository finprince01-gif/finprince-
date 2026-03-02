"""
Customer Portal Business Flow
Handles business logic and workflows for customer portal operations
"""
from django.db import transaction
from django.utils import timezone
from decimal import Decimal
from .database import (
    CustomerMaster,
    CustomerCategory,
    CustomerTransaction,
    CustomerSalesQuotation,
    CustomerSalesOrder
)


class CustomerFlow:
    """
    Handles customer-related business flows
    """
    
    @staticmethod
    def create_customer(tenant_id, customer_data):
        """
        Create a new customer with validation
        
        Args:
            tenant_id: Tenant identifier
            customer_data: Dictionary containing customer information
            
        Returns:
            CustomerMaster instance
        """
        with transaction.atomic():
            # Generate customer code if not provided
            if 'customer_code' not in customer_data:
                customer_data['customer_code'] = CustomerFlow._generate_customer_code(tenant_id)
            
            # Set tenant_id
            customer_data['tenant_id'] = tenant_id
            
            # Create customer
            customer = CustomerMaster.objects.create(**customer_data)
            
            return customer
    
    @staticmethod
    def _generate_customer_code(tenant_id):
        """Generate unique customer code"""
        last_customer = CustomerMaster.objects.filter(
            tenant_id=tenant_id
        ).order_by('-id').first()
        
        if last_customer and last_customer.customer_code:
            try:
                last_number = int(last_customer.customer_code.split('-')[-1])
                new_number = last_number + 1
            except (ValueError, IndexError):
                new_number = 1
        else:
            new_number = 1
        
        return f"CUST-{new_number:05d}"
    
    @staticmethod
    def update_customer_balance(customer_id, amount, transaction_type):
        """
        Update customer balance based on transaction
        
        Args:
            customer_id: Customer ID
            amount: Transaction amount
            transaction_type: Type of transaction (invoice, payment, etc.)
        """
        customer = CustomerMaster.objects.get(id=customer_id)
        
        if transaction_type in ['invoice', 'debit_note']:
            customer.current_balance += Decimal(amount)
        elif transaction_type in ['payment', 'credit_note']:
            customer.current_balance -= Decimal(amount)
        
        customer.save()
        
        return customer


class QuotationFlow:
    """
    Handles quotation-related business flows
    """
    
    @staticmethod
    def create_quotation(tenant_id, customer_id, quotation_data):
        """
        Create a new sales quotation
        
        Args:
            tenant_id: Tenant identifier
            customer_id: Customer identifier
            quotation_data: Dictionary containing quotation details
            
        Returns:
            CustomerSalesQuotation instance
        """
        with transaction.atomic():
            # Generate quotation number if not provided
            if 'quotation_number' not in quotation_data:
                quotation_data['quotation_number'] = QuotationFlow._generate_quotation_number(tenant_id)
            
            quotation_data['tenant_id'] = tenant_id
            quotation_data['customer_id'] = customer_id
            
            # Calculate totals
            quotation_data = QuotationFlow._calculate_quotation_totals(quotation_data)
            
            quotation = CustomerSalesQuotation.objects.create(**quotation_data)
            
            return quotation
    
    @staticmethod
    def _generate_quotation_number(tenant_id):
        """Generate unique quotation number"""
        last_quotation = CustomerSalesQuotation.objects.filter(
            tenant_id=tenant_id
        ).order_by('-id').first()
        
        if last_quotation and last_quotation.quotation_number:
            try:
                last_number = int(last_quotation.quotation_number.split('-')[-1])
                new_number = last_number + 1
            except (ValueError, IndexError):
                new_number = 1
        else:
            new_number = 1
        
        return f"SQ-{timezone.now().year}-{new_number:05d}"
    
    @staticmethod
    def _calculate_quotation_totals(quotation_data):
        """Calculate quotation totals"""
        subtotal = Decimal(quotation_data.get('subtotal', 0))
        tax_amount = Decimal(quotation_data.get('tax_amount', 0))
        discount_amount = Decimal(quotation_data.get('discount_amount', 0))
        
        total_amount = subtotal + tax_amount - discount_amount
        quotation_data['total_amount'] = total_amount
        
        return quotation_data
    
    @staticmethod
    def convert_to_order(quotation_id):
        """
        Convert quotation to sales order
        
        Args:
            quotation_id: Quotation ID to convert
            
        Returns:
            CustomerSalesOrder instance
        """
        with transaction.atomic():
            quotation = CustomerSalesQuotation.objects.get(id=quotation_id)
            
            # Generate order number
            order_number = OrderFlow._generate_order_number(quotation.tenant_id)
            
            # Create sales order
            order = CustomerSalesOrder.objects.create(
                tenant_id=quotation.tenant_id,
                customer_id=quotation.customer_id,
                order_number=order_number,
                order_date=timezone.now().date(),
                quotation_reference=quotation.quotation_number,
                subtotal=quotation.subtotal,
                tax_amount=quotation.tax_amount,
                discount_amount=quotation.discount_amount,
                total_amount=quotation.total_amount,
                status='confirmed'
            )
            
            # Update quotation status
            quotation.status = 'converted'
            quotation.save()
            
            return order


class OrderFlow:
    """
    Handles sales order-related business flows
    """
    
    @staticmethod
    def create_order(tenant_id, customer_id, order_data):
        """
        Create a new sales order
        
        Args:
            tenant_id: Tenant identifier
            customer_id: Customer identifier
            order_data: Dictionary containing order details
            
        Returns:
            CustomerSalesOrder instance
        """
        with transaction.atomic():
            # Generate order number if not provided
            if 'order_number' not in order_data:
                order_data['order_number'] = OrderFlow._generate_order_number(tenant_id)
            
            order_data['tenant_id'] = tenant_id
            order_data['customer_id'] = customer_id
            
            # Calculate totals
            order_data = OrderFlow._calculate_order_totals(order_data)
            
            order = CustomerSalesOrder.objects.create(**order_data)
            
            return order
    
    @staticmethod
    def _generate_order_number(tenant_id):
        """Generate unique order number"""
        last_order = CustomerSalesOrder.objects.filter(
            tenant_id=tenant_id
        ).order_by('-id').first()
        
        if last_order and last_order.order_number:
            try:
                last_number = int(last_order.order_number.split('-')[-1])
                new_number = last_number + 1
            except (ValueError, IndexError):
                new_number = 1
        else:
            new_number = 1
        
        return f"SO-{timezone.now().year}-{new_number:05d}"
    
    @staticmethod
    def _calculate_order_totals(order_data):
        """Calculate order totals"""
        subtotal = Decimal(order_data.get('subtotal', 0))
        tax_amount = Decimal(order_data.get('tax_amount', 0))
        discount_amount = Decimal(order_data.get('discount_amount', 0))
        shipping_charges = Decimal(order_data.get('shipping_charges', 0))
        
        total_amount = subtotal + tax_amount - discount_amount + shipping_charges
        order_data['total_amount'] = total_amount
        
        return order_data
    
    @staticmethod
    def update_order_status(order_id, new_status):
        """
        Update order status
        
        Args:
            order_id: Order ID
            new_status: New status value
            
        Returns:
            Updated CustomerSalesOrder instance
        """
        order = CustomerSalesOrder.objects.get(id=order_id)
        order.status = new_status
        order.save()
        
        return order


class TransactionFlow:
    """
    Handles customer transaction flows
    """
    
    @staticmethod
    def create_transaction(tenant_id, customer_id, transaction_data):
        """
        Create a customer transaction and update balance
        
        Args:
            tenant_id: Tenant identifier
            customer_id: Customer identifier
            transaction_data: Dictionary containing transaction details
            
        Returns:
            CustomerTransaction instance
        """
        with transaction.atomic():
            # Generate transaction number if not provided
            if 'transaction_number' not in transaction_data:
                transaction_data['transaction_number'] = TransactionFlow._generate_transaction_number(
                    tenant_id,
                    transaction_data.get('transaction_type', 'invoice')
                )
            
            transaction_data['tenant_id'] = tenant_id
            transaction_data['customer_id'] = customer_id
            
            # Create transaction
            customer_transaction = CustomerTransaction.objects.create(**transaction_data)
            
            # Update customer balance
            CustomerFlow.update_customer_balance(
                customer_id,
                transaction_data['total_amount'],
                transaction_data['transaction_type']
            )
            
            return customer_transaction
    
    @staticmethod
    def _generate_transaction_number(tenant_id, transaction_type):
        """Generate unique transaction number"""
        prefix_map = {
            'invoice': 'INV',
            'payment': 'PAY',
            'credit_note': 'CN',
            'debit_note': 'DN'
        }
        
        prefix = prefix_map.get(transaction_type, 'TXN')
        
        last_transaction = CustomerTransaction.objects.filter(
            tenant_id=tenant_id,
            transaction_type=transaction_type
        ).order_by('-id').first()
        
        if last_transaction and last_transaction.transaction_number:
            try:
                last_number = int(last_transaction.transaction_number.split('-')[-1])
                new_number = last_number + 1
            except (ValueError, IndexError):
                new_number = 1
        else:
            new_number = 1
        
        return f"{prefix}-{timezone.now().year}-{new_number:05d}"
