import pytest
from datetime import date, timedelta
from django.utils import timezone
from django.db.models import Q
from core.models import Tenant, User, AIUsage
from ocr_pipeline.models import InvoiceTempOCR
from bank_upload.models import BankStatementStagingFile
from accounting.models import Voucher
from accounting.utils_subscription import get_invoice_usage, get_billing_cycle_start
from core.usage_service import check_and_increment_usage

@pytest.mark.django_db
def test_dynamic_subscription_usage():
    # 1. Create a dummy tenant and user
    tenant = Tenant.objects.create(id="test-subscription-tenant", name="Test Subscription Tenant")
    user = User.objects.create(
        username="testsubuser",
        email="testsubuser@example.com",
        tenant_id=tenant.id,
        subscription_start_date=date.today() - timedelta(days=5)
    )

    cycle_start = get_billing_cycle_start(user)
    assert cycle_start == date.today() - timedelta(days=5)

    # 2. Initially, usage should be 0
    assert get_invoice_usage(user) == 0

    # 3. Create a primary and a sibling InvoiceTempOCR
    InvoiceTempOCR.objects.create(
        tenant_id=tenant.id,
        file_hash="hash1",
        file_path="/path/1",
        is_primary=True,
        voucher_type="purchase",
        status="FINALIZED",
        validation_status="VOUCHER_CREATED"
    )
    # Sibling (should NOT be counted)
    InvoiceTempOCR.objects.create(
        tenant_id=tenant.id,
        file_hash="hash1_2",
        file_path="/path/1_2",
        is_primary=False,
        group_id="group1",
        voucher_type="purchase",
        status="FINALIZED",
        validation_status="VOUCHER_CREATED"
    )
    # Failed primary (should NOT be counted)
    InvoiceTempOCR.objects.create(
        tenant_id=tenant.id,
        file_hash="hash2",
        file_path="/path/2",
        is_primary=True,
        voucher_type="purchase",
        status="FAILED",
        validation_status="EXTRACTION_FAILED"
    )

    # Usage should be 1 (only the first primary counts)
    assert get_invoice_usage(user) == 1

    # 4. Create an Excel upload voucher (Voucher with source="excel")
    Voucher.objects.create(
        tenant_id=tenant.id,
        type="sales",
        voucher_number="INV-EXCEL-001",
        source="excel",
        date=date.today()
    )
    # Standard manual sales voucher (should NOT be counted)
    Voucher.objects.create(
        tenant_id=tenant.id,
        type="sales",
        voucher_number="INV-MANUAL-001",
        source="manual",
        date=date.today()
    )

    # Usage should be 2 (1 OCR + 1 Excel)
    assert get_invoice_usage(user) == 2

    # 5. Create a Bank Statement upload file
    BankStatementStagingFile.objects.create(
        tenant_id=tenant.id,
        file_name="bank.csv",
        status="processed",
        transaction_data={},
        expires_at=timezone.now() + timedelta(days=1)
    )
    # Deleted bank statement (should NOT be counted)
    BankStatementStagingFile.objects.create(
        tenant_id=tenant.id,
        file_name="bank_deleted.csv",
        status="deleted",
        transaction_data={},
        expires_at=timezone.now() + timedelta(days=1)
    )

    # Usage should be 3 (1 OCR + 1 Excel + 1 Bank)
    assert get_invoice_usage(user) == 3

    # 6. Test check_and_increment_usage integration
    # Plan limit is 2 (e.g. mock limit of 2)
    # Since current usage is 3, it should return False
    assert check_and_increment_usage(tenant.id, limit=2) is False

    # Mock limit of 5, should succeed and sync to AIUsage model
    assert check_and_increment_usage(tenant.id, limit=5) is True
    
    # Verify AIUsage model was updated
    ai_usage = AIUsage.objects.filter(tenant=tenant, year=date.today().year, month=date.today().month).first()
    assert ai_usage is not None
    assert ai_usage.used_count == 4 # usage (3) + 1
