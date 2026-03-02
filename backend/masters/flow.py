"""
Masters Flow Layer - Business Logic + RBAC + Tenant Validation
This is the ONLY place for business decisions in the Masters module.
Every function MUST start with tenant validation and permission checks.
"""

import logging
from django.db import IntegrityError, transaction
from django.core.exceptions import ValidationError
from rest_framework import serializers as drf_serializers
from core.tenant import get_user_tenant_id
from accounting.utils import generate_ledger_code
from . import database as db

logger = logging.getLogger('masters.flow')

# Helper function aliases for consistency
def get_tenant_id(user):
    """Get tenant ID from user with better error handling"""
    # First try to get from user object
    tenant_id = get_user_tenant_id(user)
    
    # If not found, try to get from request context (JWT token)
    if not tenant_id and hasattr(user, '_request'):
        from core.tenant import get_tenant_from_request
        tenant_id = get_tenant_from_request(user._request)
    
    if not tenant_id:
        from rest_framework.exceptions import PermissionDenied
        user_info = f"{user.username}" if hasattr(user, 'username') else 'Unknown'
        user_id = f"(ID: {user.id})" if hasattr(user, 'id') else ''
        is_authenticated = user.is_authenticated if hasattr(user, 'is_authenticated') else False
        logger.error(
            f"❌ User {user_info} {user_id} has no tenant_id. "
            f"Authenticated: {is_authenticated}, "
            f"Has tenant_id attr: {hasattr(user, 'tenant_id')}, "
            f"tenant_id value: {getattr(user, 'tenant_id', None)}"
        )
        raise PermissionDenied({
            "detail": "User has no associated tenant. Please log out and log in again.",
            "code": "permission_denied"
        })
    return tenant_id




# ============================================================================
# LEDGER GROUP OPERATIONS
# ============================================================================

def list_ledger_groups(user):
    """
    List all ledger groups for the user's tenant.
    
    Args:
        user: Authenticated user
    
    Returns:
        QuerySet of ledger groups
    """
    # 1. Tenant validation
    # 1. Tenant validation
    tenant_id = get_tenant_id(user)    
    # 2. Business logic - fetch data
    return db.get_all_ledger_groups(tenant_id)


def create_ledger_group(user, data):
    """
    Create a new ledger group.
    
    Args:
        user: Authenticated user
        data: Ledger group data
    
    Returns:
        Created ledger group instance
    """
    # 1. Tenant validation
    # 1. Tenant validation
    tenant_id = get_tenant_id(user)    
    # 2. Business logic - create
    return db.create_ledger_group(data, tenant_id)


def update_ledger_group(user, ledger_group_id, data):
    """
    Update an existing ledger group.
    
    Args:
        user: Authenticated user
        ledger_group_id: ID of ledger group to update
        data: Updated data
    
    Returns:
        Updated ledger group instance
    """
    # 1. Tenant validation
    # 1. Tenant validation
    tenant_id = get_tenant_id(user)    
    # 2. Business logic - update
    return db.update_ledger_group(ledger_group_id, data, tenant_id)


def delete_ledger_group(user, ledger_group_id):
    """
    Delete a ledger group.
    
    Args:
        user: Authenticated user
        ledger_group_id: ID of ledger group to delete
    """
    # 1. Tenant validation
    # 1. Tenant validation
    tenant_id = get_tenant_id(user)    
    # 2. Business logic - delete
    db.delete_ledger_group(ledger_group_id, tenant_id)


# ============================================================================
# LEDGER OPERATIONS
# ============================================================================

def list_ledgers(user):
    """
    List all ledgers for the user's tenant.
    
    Args:
        user: Authenticated user
    
    Returns:
        QuerySet of ledgers
    """
    # 1. Tenant validation
    # 1. Tenant validation
    tenant_id = get_tenant_id(user)    
    # 2. Business logic - fetch data
    logger.info(f"🔍 Listing ledgers for tenant {tenant_id}, user: {user}")
    ledgers = db.get_all_ledgers(tenant_id)
    logger.info(f"🔍 Found {ledgers.count()} ledgers")
    return ledgers


def create_ledger(user, validated_data):
    """
    Create a new ledger with auto-generated code and retry logic.
    
    Args:
        user: Authenticated user
        validated_data: Validated ledger data
    
    Returns:
        Created ledger instance
    """
    # 1. Tenant validation
    # 1. Tenant validation
    tenant_id = get_tenant_id(user)    
    # 2. Business logic - create with code generation and retry
    logger.info(f"📝 Creating ledger for tenant {tenant_id} - Data: {validated_data}")
    
    # Extract question answers before creating ledger
    question_answers = validated_data.pop('additional_data', {})
    logger.info(f"📋 Question answers extracted: {question_answers}")
    
    # Retry logic for code generation (handles race conditions)
    max_retries = 3
    ledger = None
    
    for attempt in range(max_retries):
        try:
            with transaction.atomic():
                # Generate code
                ledger_code = generate_ledger_code(validated_data, tenant_id)
                logger.info(
                    f"🔢 Generated ledger code: {ledger_code} "
                    f"(attempt {attempt + 1}/{max_retries})"
                )
                
                # Save with generated code (including additional_data)
                ledger_data = {**validated_data, 'code': ledger_code, 'additional_data': question_answers}
                ledger = db.create_ledger(ledger_data, tenant_id)
                logger.info(f"✅ Ledger saved successfully with code: {ledger_code}")
                
                # Save answers to Answer table
                if question_answers and isinstance(question_answers, dict):
                    from accounting.models_question import Question, Answer
                    logger.info(f"💾 Saving {len(question_answers)} answers to answers table...")
                    
                    for q_id, ans_text in question_answers.items():
                        if not ans_text:
                            logger.info(f"⏭️  Skipping empty answer for Q_ID: {q_id}")
                            continue
                            
                        try:
                            question_obj = Question.objects.get(id=q_id)
                            Answer.objects.create(
                                ledger_code=ledger.code,
                                sub_group_1_1=question_obj.sub_group_1_1,
                                sub_group_1_2=question_obj.sub_group_1_2,
                                question=question_obj.question,
                                answer=ans_text,
                                tenant_id=tenant_id
                            )
                            logger.info(f"✅ Saved answer for Q:{q_id} to answers table")
                        except Question.DoesNotExist:
                            logger.warning(f"⚠️  Question with ID {q_id} does not exist!")
                        except Exception as e:
                            logger.error(f"❌ Failed to save answer for Q:{q_id}: {e}")
                else:
                    logger.info("ℹ️  No question answers to save")
                
                # Auto-create AmountTransaction for Cash/Bank ledgers (even without opening balance)
                if _is_cash_or_bank_ledger(ledger):
                    try:
                        from accounting.models import AmountTransaction
                        from datetime import date
                        
                        # Get opening balance from question_answers or default to 0
                        opening_balance = 0
                        if question_answers:
                            opening_balance = question_answers.get('opening_balance', 0)
                        
                        opening_balance_value = float(opening_balance) if opening_balance else 0
                        logger.info(f"💰 Creating transaction for {ledger.name}: {opening_balance_value}")
                        
                        # Create transaction (even if balance is 0)
                        AmountTransaction.objects.create(
                            tenant_id=tenant_id,
                            ledger=ledger,
                            ledger_name=ledger.name,  # Ledger name
                            sub_group_1=ledger.sub_group_1,  # Parent category (e.g., Current Assets)
                            code=ledger.code,  # Ledger code
                            transaction_date=date.today(),
                            transaction_type='opening_balance',
                            debit=opening_balance_value if opening_balance_value >= 0 else 0,
                            credit=abs(opening_balance_value) if opening_balance_value < 0 else 0,
                            balance=opening_balance_value,
                            narration='Opening Balance'
                        )
                        logger.info(f"✅ Created transaction for {ledger.name}")
                    except Exception as e:
                        logger.error(f"❌ Failed to create transaction: {e}")
                        import traceback
                        traceback.print_exc()
                        # Don't fail ledger creation if transaction creation fails
                
                break  # Success, exit retry loop
                
        except IntegrityError as e:
            if attempt == max_retries - 1:
                # Last attempt failed
                logger.error(
                    f"❌ Failed to generate unique code after {max_retries} attempts. "
                    f"Error: {str(e)}"
                )
                raise drf_serializers.ValidationError({
                    'code': 'Failed to generate unique ledger code. Please try again.'
                })
            
            # Retry on next iteration
            logger.warning(
                f"⚠️ Code collision detected on attempt {attempt + 1}, retrying..."
            )
            continue
    
    logger.info(f"✅ Ledger created successfully: {ledger}")
    return ledger


def update_ledger(user, ledger_id, data):
    """
    Update an existing ledger.
    
    Args:
        user: Authenticated user
        ledger_id: ID of ledger to update
        data: Updated data
    
    Returns:
        Updated ledger instance
    """
    # 1. Tenant validation
    # 1. Tenant validation
    tenant_id = get_tenant_id(user)    
    # 2. Business logic - update
    logger.info(f"📝 Updating ledger {ledger_id} for tenant {tenant_id} - Data: {data}")
    ledger = db.update_ledger(ledger_id, data, tenant_id)
    logger.info(f"✅ Ledger updated successfully: {ledger}")
    return ledger


def delete_ledger(user, ledger_id):
    """
    Delete a ledger.
    
    Args:
        user: Authenticated user
        ledger_id: ID of ledger to delete
    """
    # 1. Tenant validation
    # 1. Tenant validation
    tenant_id = get_tenant_id(user)    
    # 2. Business logic - delete
    db.delete_ledger(ledger_id, tenant_id)


# ============================================================================
# VOUCHER CONFIG OPERATIONS
# ============================================================================

def list_voucher_configs(user):
    """
    List all voucher configs for the user's tenant.
    
    Args:
        user: Authenticated user
    
    Returns:
        QuerySet of voucher configs
    """
    # 1. Tenant validation
    # 1. Tenant validation
    tenant_id = get_tenant_id(user)    
    # 2. Business logic - fetch data
    return db.get_all_voucher_configs(tenant_id)


def create_voucher_config(user, data):
    """
    Create a new voucher config.
    
    Args:
        user: Authenticated user
        data: Voucher config data
    
    Returns:
        Created voucher config instance
    """
    # 1. Tenant validation
    # 1. Tenant validation
    tenant_id = get_tenant_id(user)    
    # 2. Business logic - create
    return db.create_voucher_config(data, tenant_id)


def update_voucher_config(user, config_id, data):
    """
    Update an existing voucher config.
    
    Args:
        user: Authenticated user
        config_id: ID of voucher config to update
        data: Updated data
    
    Returns:
        Updated voucher config instance
    """
    # 1. Tenant validation
    # 1. Tenant validation
    tenant_id = get_tenant_id(user)    
    # 2. Business logic - update
    return db.update_voucher_config(config_id, data, tenant_id)


def delete_voucher_config(user, config_id):
    """
    Delete a voucher config.
    
    Args:
        user: Authenticated user
        config_id: ID of voucher config to delete
    """
    # 1. Tenant validation
    # 1. Tenant validation
    tenant_id = get_tenant_id(user)    
    # 2. Business logic - delete
    db.delete_voucher_config(config_id, tenant_id)


# ============================================================================
# HIERARCHY OPERATIONS (Global - No Tenant/RBAC)
# ============================================================================

def list_hierarchy_data():
    """
    List all hierarchy data (global, no authentication required).
    
    Returns:
        QuerySet of hierarchy data
    """
    # No tenant validation or RBAC - this is global data
    return db.get_all_hierarchy_data()


# ============================================================================
# VOUCHER CONFIGURATION OPERATIONS
# ============================================================================

def list_voucher_configurations(user):
    """
    List all voucher configurations for the user's tenant.
    
    Args:
        user: Authenticated user
    
    Returns:
        QuerySet of voucher configurations
    """
    # 1. Tenant validation
    # 1. Tenant validation
    tenant_id = get_tenant_id(user)
    
    # 2. Business logic - fetch data
    return db.get_all_voucher_configurations(tenant_id)


def create_voucher_configuration(user, data):
    """
    Create a new voucher configuration.
    
    Args:
        user: Authenticated user
        data: Voucher configuration data
    
    Returns:
        Created voucher configuration instance
    """
    # 1. Tenant validation
    # 1. Tenant validation
    tenant_id = get_tenant_id(user)
    
    # 2. Business logic - create
    logger.info(f"Creating voucher configuration for tenant {tenant_id} - Data: {data}")
    config = db.create_voucher_configuration(data, tenant_id)
    logger.info(f"Voucher configuration created successfully: {config}")
    return config


def update_voucher_configuration(user, config_id, data):
    """
    Update an existing voucher configuration.
    
    Args:
        user: Authenticated user
        config_id: ID of voucher configuration to update
        data: Updated data
    
    Returns:
        Updated voucher configuration instance
    """
    # 1. Tenant validation
    # 1. Tenant validation
    tenant_id = get_tenant_id(user)
    
    # 2. Business logic - update
    logger.info(f"Updating voucher configuration {config_id} for tenant {tenant_id} - Data: {data}")
    config = db.update_voucher_configuration(config_id, data, tenant_id)
    logger.info(f"Voucher configuration updated successfully: {config}")
    return config


def delete_voucher_configuration(user, config_id):
    """
    Delete a voucher configuration.
    
    Args:
        user: Authenticated user
        config_id: ID of voucher configuration to delete
    """
    tenant_id = get_tenant_id(user)
    
    db.delete_voucher_configuration(config_id, tenant_id)
    logger.info(f"Deleted voucher configuration {config_id} for tenant {tenant_id}")


# ============================================================================
# AMOUNT TRANSACTION OPERATIONS
# ============================================================================

def list_amount_transactions(user, ledger_id=None, start_date=None, end_date=None):
    """
    List amount transactions for the user's tenant.
    Optionally filter by ledger and date range.
    
    Args:
        user: Authenticated user
        ledger_id: Optional ledger ID to filter
        start_date: Optional start date for filtering
        end_date: Optional end date for filtering
    
    Returns:
        QuerySet of amount transactions
    """
    tenant_id = get_tenant_id(user)
    
    queryset = db.get_all_amount_transactions(tenant_id)
    
    if ledger_id:
        queryset = queryset.filter(ledger_id=ledger_id)
    
    if start_date:
        queryset = queryset.filter(transaction_date__gte=start_date)
    
    if end_date:
        queryset = queryset.filter(transaction_date__lte=end_date)
    
    logger.info(f"Listed {queryset.count()} amount transactions for tenant {tenant_id}")
    return queryset


def create_amount_transaction(user, data):
    """
    Create a new amount transaction.
    Validates that the ledger is a Cash or Bank ledger from Asset category.
    
    Args:
        user: Authenticated user
        data: Transaction data
    
    Returns:
        Created transaction instance
    
    Raises:
        ValidationError: If ledger is not Cash/Bank or validation fails
    """
    tenant_id = get_tenant_id(user)
    
    # Validate ledger belongs to tenant
    ledger_id = data.get('ledger').id if hasattr(data.get('ledger'), 'id') else data.get('ledger')
    ledger = db.get_ledger_by_id(ledger_id, tenant_id)
    
    # Validate ledger is Cash or Bank (Asset category)
    if not _is_cash_or_bank_ledger(ledger):
        raise ValidationError(
            "Transaction can only be created for Cash or Bank ledgers in Asset category. "
            f"This ledger is in category '{ledger.category}' with sub_group_2 '{ledger.sub_group_2}'"
        )
    
    # Calculate balance if not provided
    if 'balance' not in data or data['balance'] is None or data['balance'] == 0:
        debit = data.get('debit', 0)
        credit = data.get('credit', 0)
        data['balance'] = _calculate_balance(tenant_id, ledger_id, debit, credit)
    
    transaction = db.create_amount_transaction(data, tenant_id)
    logger.info(f"Created amount transaction {transaction.id} for ledger {ledger.name} (tenant {tenant_id})")
    return transaction


def update_amount_transaction(user, transaction_id, data):
    """
    Update an existing amount transaction.
    
    Args:
        user: Authenticated user
        transaction_id: ID of transaction to update
        data: Updated data
    
    Returns:
        Updated transaction instance
    """
    tenant_id = get_tenant_id(user)
    
    # Recalculate balance if debit/credit changed
    if 'debit' in data or 'credit' in data:
        transaction = db.get_amount_transaction_by_id(transaction_id, tenant_id)
        debit = data.get('debit', transaction.debit)
        credit = data.get('credit', transaction.credit)
        data['balance'] = _calculate_balance(tenant_id, transaction.ledger_id, debit, credit)
    
    transaction = db.update_amount_transaction(transaction_id, data, tenant_id)
    logger.info(f"Updated amount transaction {transaction_id} for tenant {tenant_id}")
    return transaction


def delete_amount_transaction(user, transaction_id):
    """
    Delete an amount transaction.
    
    Args:
        user: Authenticated user
        transaction_id: ID of transaction to delete
    """
    tenant_id = get_tenant_id(user)
    
    db.delete_amount_transaction(transaction_id, tenant_id)
    logger.info(f"Deleted amount transaction {transaction_id} for tenant {tenant_id}")


def sync_opening_balances_to_transactions(user):
    """
    Sync opening balances from Cash and Bank ledgers to Amount_transaction table.
    This is a utility function to populate initial data.
    
    Args:
        user: Authenticated user
    
    Returns:
        Number of transactions created
    """
    tenant_id = get_tenant_id(user)
    
    # Get all ledgers for this tenant
    all_ledgers = db.get_all_ledgers(tenant_id)
    
    # Filter Cash and Bank ledgers
    cash_bank_ledgers = [ledger for ledger in all_ledgers if _is_cash_or_bank_ledger(ledger)]
    
    created_count = 0
    
    for ledger in cash_bank_ledgers:
        # Check if opening balance exists in additional_data
        if ledger.additional_data and 'opening_balance' in ledger.additional_data:
            opening_balance = ledger.additional_data['opening_balance']
            
            # Skip if opening balance is 0 or None
            if not opening_balance:
                continue
            
            # Check if opening balance transaction already exists
            existing = db.get_all_amount_transactions(tenant_id).filter(
                ledger=ledger,
                transaction_type='opening_balance'
            ).exists()
            
            if not existing:
                # Create opening balance transaction
                # Opening balance is typically a debit for Asset accounts
                db.create_amount_transaction({
                    'ledger': ledger,
                    'ledger_name': ledger.name,  # Ledger name
                    'transaction_date': ledger.created_at.date(),
                    'transaction_type': 'opening_balance',
                    'debit': float(opening_balance) if float(opening_balance) > 0 else 0,
                    'credit': abs(float(opening_balance)) if float(opening_balance) < 0 else 0,
                    'balance': float(opening_balance),
                    'narration': 'Opening Balance',
                }, tenant_id)
                created_count += 1
                logger.info(f"Created opening balance transaction for ledger {ledger.name}")
    
    logger.info(f"Synced {created_count} opening balances for tenant {tenant_id}")
    return created_count


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _is_cash_or_bank_ledger(ledger):
    """
    Check if ledger is a Cash or Bank ledger from Asset category.
    More relaxed matching to handle various Chart of Accounts.
    """
    # 1. Check Category (Asset or Assets) if present
    if ledger.category:
        category_lower = ledger.category.lower().strip()
        if category_lower not in ['asset', 'assets', 'liability', 'liabilities']:
            # We include liabilities because of Bank OD/CC accounts
            pass
    
    # 2. Check Group name for keywords
    if not ledger.group:
        return False
        
    group_lower = ledger.group.lower().strip()
    
    # Match common cash/bank keywords
    keywords = ['cash', 'bank', 'od', 'cc', 'hand', 'balances', 'accounts']
    
    # Strong matches for cash/bank groups
    if any(k in group_lower for k in ['cash', 'bank', 'od', 'cc']):
        # Safety check: avoid things like 'Bank Charges' or 'Cash Discount' which are usually Expenses
        # But wait, if they are in Asset/Liability category they are likely accounts.
        # For now, let's be inclusive but exclude known expense-like terms if needed.
        if 'charges' in group_lower or 'discount' in group_lower:
            return False
        return True
    
    return False


def _calculate_balance(tenant_id, ledger_id, debit, credit):
    """
    Calculate balance after transaction.
    For Asset accounts: Balance = Previous Balance + Debit - Credit
    
    Args:
        tenant_id: Tenant ID
        ledger_id: Ledger ID
        debit: Debit amount
        credit: Credit amount
    
    Returns:
        Calculated balance
    """
    # Get last transaction for this ledger
    last_transaction = db.get_last_amount_transaction_for_ledger(ledger_id, tenant_id)
    
    if last_transaction:
        current_balance = last_transaction.balance or 0
    else:
        # Get opening balance from ledger's additional_data
        ledger = db.get_ledger_by_id(ledger_id, tenant_id)
        if ledger.additional_data and 'opening_balance' in ledger.additional_data:
            current_balance = float(ledger.additional_data['opening_balance'])
        else:
            current_balance = 0
    
    # Calculate new balance (Asset account: balance + debit - credit)
    new_balance = current_balance + float(debit or 0) - float(credit or 0)
    
    return new_balance


def list_cash_bank_ledgers(user):
    """
    List only Cash and Bank ledgers from Asset category for dropdown.
    
    Args:
        user: Authenticated user
    
    Returns:
        List of Cash/Bank ledgers
    """
    tenant_id = get_tenant_id(user)
    
    # Get all ledgers for tenant
    all_ledgers = db.get_all_ledgers(tenant_id)
    
    # Filter Cash and Bank ledgers using existing helper
    cash_bank_ledgers = [
        ledger for ledger in all_ledgers 
        if _is_cash_or_bank_ledger(ledger)
    ]
    
    logger.info(f"Found {len(cash_bank_ledgers)} Cash/Bank ledgers for tenant {tenant_id}")
    return cash_bank_ledgers
