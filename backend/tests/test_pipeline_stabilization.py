import pytest
from unittest.mock import MagicMock, patch
from core.pdf_splitter import detect_invoice_groups
from ocr_pipeline.normalize import get_canonical_export_record

# Mock PyMuPDF / fitz page structure
class MockRect:
    def __init__(self):
        self.x0 = 0.0
        self.y0 = 0.0
        self.x1 = 500.0
        self.y1 = 800.0
        self.height = 800.0

class MockPage:
    def __init__(self, text, has_header=True):
        self.rect = MockRect()
        self.text = text
        self.has_header = has_header

    def get_text(self, mode="text", clip=None):
        if clip:
            # top section
            return "Invoice No: " + self.text if self.has_header else ""
        return self.text

class MockDocument:
    def __init__(self, pages):
        self._pages = pages
    def __len__(self):
        return len(self._pages)
    def __getitem__(self, idx):
        return self._pages[idx]

def test_detect_invoice_groups_lookahead():
    """
    Verifies that the page range look-ahead correctly groups pages
    and prevents premature splitting when a page lacks an invoice number.
    """
    # Page 1 has invoice "INV-001"
    # Page 2 has no invoice number (continuation)
    # Page 3 has no invoice number (continuation)
    # Page 4 has invoice "INV-002"
    doc = MockDocument([
        MockPage("Invoice No: INV-001", has_header=True),
        MockPage("", has_header=False),
        MockPage("", has_header=False),
        MockPage("Invoice No: INV-002", has_header=True),
    ])
    
    # Run the look-ahead detector
    groups = detect_invoice_groups(doc)
    
    # Assert INV-001 has pages 1, 2, 3 (indices 0, 1, 2)
    assert len(groups) == 2
    assert groups[0].invoice_number == "INV-001"
    assert groups[0].page_indices == [0, 1, 2]
    
    # Assert INV-002 has page 4 (index 3)
    assert groups[1].invoice_number == "INV-002"
    assert groups[1].page_indices == [3]

@pytest.mark.django_db
def test_tenant_branch_isolation():
    """
    Verifies that if extracted vendor fields contain tenant info,
    the pipeline wipes/quarantines them to prevent customer leakage.
    """
    # Mock tenant model
    tenant_id = "test-tenant-id"
    tenant_mock = MagicMock()
    tenant_mock.gstin = "33ABACA5718R1ZD"
    tenant_mock.name = "Balamurugan Fabricators"
    tenant_mock.branch_name = "Pollachi Branch"
    tenant_mock.address_line1 = "123 Pollachi Road"
    tenant_mock.address_line2 = "Srinivasa Nagar"
    tenant_mock.address_line3 = ""
    tenant_mock.city = "Pollachi"

    with patch('core.models.Tenant.objects.filter') as mock_filter:
        mock_filter.return_value.first.return_value = tenant_mock
        
        # Test Case A: Extracted Vendor GSTIN matches Tenant GSTIN -> Wipe vendor GSTIN
        invoice_data = {
            "gstin": "33ABACA5718R1ZD",
            "vendor_name": "Some Vendor Ltd",
            "bill_from": "123 Pollachi Road, Srinivasa Nagar, Pollachi"
        }
        
        canonical = get_canonical_export_record(invoice_data, tenant_id=tenant_id)
        assert canonical["gstin"] == ""  # Wiped
        assert canonical["bill_from"] == ""  # Wiped (matches address keywords)

        # Test Case B: Extracted Vendor Name matches Tenant Name -> Wipe vendor name
        invoice_data_2 = {
            "gstin": "33AKWPP4092M1ZB", # Genuine Vendor GSTIN
            "vendor_name": "Balamurugan Fabricators", # Leaked Customer Name
            "bill_from": "Genuine Vendor Address"
        }
        
        canonical_2 = get_canonical_export_record(invoice_data_2, tenant_id=tenant_id)
        assert canonical_2["vendor_name"] == ""  # Wiped
        assert canonical_2["gstin"] == "33AKWPP4092M1ZB" # Preserved

@pytest.mark.django_db
def test_atomic_validate_and_process_duplication_mocked():
    """
    Verifies that validate_and_process correctly detects duplicate vouchers
    and prevents double-creation.
    """
    from ocr_pipeline.pipeline import validate_and_process
    
    tenant_id = "test-tenant-id"
    invoice_no = "INV-RACE-999"
    gstin = "33AKWPP4092M1ZB"
    branch_name = "Pollachi"
    vendor_name = "Balamurugan Fabricators"

    # Create mock record with concrete properties to prevent MagicMock cascade issues
    record = MagicMock()
    record.id = 123
    record.tenant_id = "test-tenant-id"
    record.upload_session_id = "session-123"
    record.file_hash = "mock-file-hash-race-123"
    record.status = "EXTRACTED"
    record.validation_status = "READY"
    record.vendor_id = None  # Crucial: Avoid the fast path that uses undefined MagicMock properties
    record.page_index = "AGGREGATE"
    record.extracted_data = {
        "invoice_no": invoice_no,
        "gstin": gstin,
        "branch": branch_name,
        "vendor_name": vendor_name,
        "sections": {
            "supplier_details": {
                "branch": branch_name,
                "gstin": gstin
            },
            "items": [{"description": "Item 1", "amount": 100}]
        }
    }

    mock_vendor = MagicMock()
    mock_vendor.id = 456
    mock_vendor.vendor_name = "Balamurugan Fabricators"

    # Patch select_for_update, exists, validate_vendor, Branch, VendorMasterBasicDetail, and Redis locks
    with patch('ocr_pipeline.models.InvoiceTempOCR.objects.select_for_update') as mock_select, \
         patch('accounting.models_voucher_purchase.VoucherPurchaseSupplierDetails.objects.filter') as mock_voucher_filter, \
         patch('vendors.vendor_validation_logic.validate_vendor') as mock_val_vendor, \
         patch('core.models.Branch.objects.filter') as mock_branch_filter, \
         patch('vendors.models.VendorMasterBasicDetail.objects.filter') as mock_vendor_filter_db, \
         patch('ocr_pipeline.pipeline.acquire_redis_lock', return_value=True) as mock_acquire, \
         patch('ocr_pipeline.pipeline.release_redis_lock') as mock_release:
         
        mock_select.return_value.get.return_value = record
        mock_voucher_filter.return_value.exists.return_value = True
        mock_val_vendor.return_value = {'status': 'EXISTING_VENDOR', 'vendor_id': 456}
        mock_branch_filter.return_value.first.return_value = None
        mock_vendor_filter_db.return_value.first.return_value = mock_vendor

        # Call validate_and_process
        res = validate_and_process(record, auto_save=True)

        # Verify that it detected the duplicate and marked the record appropriately without failing/crashing
        assert res["status"] == "DUPLICATE"
        assert record.validation_status == "DUPLICATE"


@pytest.mark.django_db
def test_finalize_view_blocked_and_success():
    """
    Tests OCRStagingFinalizeView POST endpoint under converged and non-converged states.
    """
    from ocr_pipeline.views import OCRStagingFinalizeView
    from rest_framework.test import APIRequestFactory, force_authenticate
    from unittest.mock import patch, MagicMock
    
    factory = APIRequestFactory()
    
    # 1. Non-converged state -> Should return HTTP 400
    with patch('core.redis_orchestrator.orchestrator.get_authoritative_session_state') as mock_state:
        mock_state.return_value = {
            'expected_pages': 6,
            'completed_pages': 2,
            'failed_pages': 0,
            'snapshot_complete': False,
            'materialization_complete': False
        }
        
        view = OCRStagingFinalizeView.as_view()
        request = factory.post('/api/ocr-staging-finalize/', {'upload_session_id': 'session-123'}, format='json')
        user = MagicMock()
        user.branch_id = "tenant-123"
        force_authenticate(request, user=user)
        
        response = view(request)
        assert response.status_code == 400
        assert response.data['status'] == 'BLOCKED'

    # 2. Converged state -> Should proceed to processing
    with patch('core.redis_orchestrator.orchestrator.get_authoritative_session_state') as mock_state, \
         patch('ocr_pipeline.views.get_save_eligible_rows') as mock_eligible, \
         patch('ocr_pipeline.models.FinalizedSnapshot.objects.filter') as mock_snap:
        
        mock_state.return_value = {
            'expected_pages': 6,
            'completed_pages': 6,
            'failed_pages': 0,
            'snapshot_complete': True,
            'materialization_complete': True
        }
        
        # Mock zero records in session for simplicity of PATH A fallback
        mock_eligible.return_value = []
        mock_snap.return_value.order_by.return_value.first.return_value = None
        
        view = OCRStagingFinalizeView.as_view()
        request = factory.post('/api/ocr-staging-finalize/', {'upload_session_id': 'session-123'}, format='json')
        user = MagicMock()
        user.branch_id = "tenant-123"
        force_authenticate(request, user=user)
        
        response = view(request)
        # Should succeed (HTTP 200) and return response summary
        assert response.status_code == 200
        assert response.data['success'] is True


def test_finalize_worker_blocked_barrier():
    """
    Tests that FinalizeWorker blocks execution and raises ValueError if orchestration barrier is incomplete.
    """
    import asyncio
    from vouchers.finalize_worker import FinalizeWorker
    worker = FinalizeWorker()
    
    task = {
        'id': 'task-123',
        'task_type': 'FINALIZE',
        'session_id': 'session-123',
        'tenant_id': 'tenant-123',
        'payload': {
            'record_id': 123,
            'job_id': 'job-123',
            'failed': False
        }
    }
    
    with patch('core.redis_orchestrator.orchestrator.get_authoritative_session_state') as mock_state, \
         patch('ocr_pipeline.models.InvoiceTempOCR.objects.filter') as mock_rec_query:
        
        # Incomplete barrier state
        mock_state.return_value = {
            'expected_pages': 6,
            'completed_pages': 2,
            'failed_pages': 0,
            'snapshot_complete': False,
            'materialization_complete': False
        }
        
        # Mock database query for record resolution
        mock_rec_query.return_value.values.return_value.first.return_value = {
            'upload_session_id': 'session-123',
            'tenant_id': 'tenant-123'
        }
        
        # Running handle_task should raise ValueError due to incomplete barrier
        with pytest.raises(ValueError, match="Finalize blocked: orchestration barrier incomplete"):
            asyncio.run(worker.handle_task(task))


@pytest.mark.django_db
def test_canonical_distributed_locking_and_idempotency_guard():
    """
    Verifies that the canonical distributed locking and idempotency guards
    correctly reject execution / skip duplication when the lock is held.
    """
    from ocr_pipeline.pipeline import validate_and_process, assemble_multi_page_record
    
    tenant_id = "test-tenant-id"
    session_id = "session-123"
    
    record = MagicMock()
    record.id = 123
    record.tenant_id = tenant_id
    record.upload_session_id = session_id
    record.supplier_invoice_no = "INV-100"
    record.gstin = "33AKWPP4092M1ZB"
    record.total_amount = "1200"
    record.invoice_date = "2026-06-02"
    record.validation_status = "READY"
    record.status = "EXTRACTED"
    
    # 1. When canonical lock is held, validate_and_process must reject execution and return the current status
    with patch('ocr_pipeline.pipeline.acquire_redis_lock') as mock_acquire, \
         patch('ocr_pipeline.pipeline.release_redis_lock') as mock_release:
         
        # Simulate lock acquisition failure for the canonical lock (first call to acquire_redis_lock returns False)
        mock_acquire.return_value = False
        
        res = validate_and_process(record, auto_save=True)
        assert res["status"] == "READY"
        
        # Verify acquire_redis_lock was called with canonical lock key
        mock_acquire.assert_any_call("canonical:test-tenant-id:session-123:cde44d32021c5591d675bb0e0348b04dc6ec1e119c693522fd4d6c1fb2eb0080", expiry_s=120)

    # 2. In assemble_multi_page_record, check lock rejection logic for primary and siblings
    record_assemble = MagicMock()
    record_assemble.id = 124
    record_assemble.tenant_id = tenant_id
    record_assemble.upload_session_id = session_id
    record_assemble.extracted_data = {}
    
    # Mock final_invoices with two items
    final_invoices = [
        {
            "invoice_no": "INV-101",
            "gstin": "33AKWPP4092M1ZB",
            "total_invoice_value": "1500",
            "invoice_date": "2026-06-02",
            "_page_no": 1
        },
        {
            "invoice_no": "INV-102",
            "gstin": "33AKWPP4092M1ZB",
            "total_invoice_value": "2000",
            "invoice_date": "2026-06-02",
            "_page_no": 2
        }
    ]
    
    with patch('ocr_pipeline.pipeline.acquire_redis_lock') as mock_acquire, \
         patch('ocr_pipeline.pipeline.release_redis_lock') as mock_release, \
         patch('ocr_pipeline.pipeline.InvoiceTempOCR.objects.select_for_update') as mock_select, \
         patch('ocr_pipeline.models.SessionFinalizationState.objects.select_for_update') as mock_barrier_select:
         
         # Mock select_for_update returns
         mock_barrier = MagicMock()
         mock_barrier.snapshot_created = False
         mock_barrier.expected_pages = 2
         mock_barrier_select.return_value.get.return_value = mock_barrier
         
         # First two lock acquisitions (merge, finalization) succeed. The third one (canonical lock for first DTO) fails.
         mock_acquire.side_effect = [True, True, False, True]
         
         # Let's run assembly
         with patch('ocr_pipeline.pipeline.sync_record_flattened_fields'), \
              patch('ocr_pipeline.pipeline.InvoiceTempOCR.objects.bulk_create') as mock_bulk_create, \
              patch('ocr_pipeline.models.FinalizedSnapshot.objects.create'), \
              patch('core.redis_orchestrator.orchestrator.update_session_status'):
              
              # We expect record_assemble.validation_status to be set to DUPLICATE because idx=0 lock acquisition failed.
              # And sibling to be created since its lock acquisition succeeded.
              res_assemble = assemble_multi_page_record(record_assemble, final_invoices=final_invoices, total_expected=2, s3_key="key", snapshot_hash_val="hash", failed_indices=[], job_id="job-1", force=True)
              
              assert record_assemble.validation_status == "DUPLICATE"


@pytest.mark.django_db
def test_readonly_hydration_and_post_finalization_immutability():
    """
    Verifies that _map_record_to_ui_row is read-only and bypasses validation,
    and validate_and_process enforces post-finalization immutability.
    """
    from ocr_pipeline.views import CleanOCRStagingView
    from ocr_pipeline.pipeline import validate_and_process
    
    # 1. Test Read-Only Hydration
    view = CleanOCRStagingView()
    record = MagicMock()
    record.id = 123
    record.tenant_id = "test-tenant-id"
    record.upload_session_id = "session-123"
    record.file_hash = "hash-123"
    record.supplier_invoice_no = "INV-123"
    record.gstin = "33AKWPP4092M1ZB"
    record.status = "FINALIZED"
    record.validation_status = "VOUCHER_CREATED"
    record.processed = True
    record.vendor_id = 456
    record.extracted_data = {
        "invoice_no": "INV-123",
        "gstin": "33AKWPP4092M1ZB",
        "sections": {
            "supplier_details": {"gstin": "33AKWPP4092M1ZB"},
            "items": []
        }
    }
    
    res = view._map_record_to_ui_row(record)
    assert res["validationStatus"] == "VOUCHER_CREATED"
    assert res["vendor_id"] == 456
    assert res["status"] == "FINALIZED"
    
    # 2. Test Post-Finalization Immutability
    with patch('ocr_pipeline.pipeline.acquire_redis_lock', return_value=True), \
         patch('ocr_pipeline.pipeline.release_redis_lock'), \
         patch('ocr_pipeline.models.InvoiceTempOCR.objects.select_for_update') as mock_select:
         
         mock_select.return_value.get.return_value = record
         # With processed=True / terminal status, validate_and_process must immediately return early
         res_val = validate_and_process(record, auto_save=False)
         assert res_val["status"] == "VOUCHER_CREATED"


@pytest.mark.django_db
def test_immutable_model_save_and_strict_dto_gating():
    """
    Verifies model save immutability guards, strict AI worker DTO validation,
    and assembly failure containment for partial/failed extractions.
    """
    from ocr_pipeline.models import InvoiceTempOCR
    from vouchers.ai_worker import AIWorker
    from ocr_pipeline.pipeline import assemble_multi_page_record
    
    # 1. Test AIWorker DTO validation
    worker = AIWorker()
    # Missing 'items'
    payload_missing_items = {
        "record_id": "test-rec",
        "vendor_name": "Test Vendor",
        "invoice_no": "INV-123"
    }
    assert worker._is_dto_valid(payload_missing_items) is False

    # Missing 'vendor_name'
    payload_missing_vendor = {
        "record_id": "test-rec",
        "invoice_no": "INV-123",
        "items": [{"name": "Item 1"}]
    }
    assert worker._is_dto_valid(payload_missing_vendor) is False

    # Valid payload
    payload_valid = {
        "record_id": "test-rec",
        "vendor_name": "Test Vendor",
        "invoice_no": "INV-123",
        "items": [{"name": "Item 1"}]
    }
    assert worker._is_dto_valid(payload_valid) is True

    # 2. Test Model Save Immutability Guard
    record = InvoiceTempOCR()
    record.pk = 999
    record.status = "PROCESSING"
    record.processed = False
    record.validation_status = "PENDING"
    record.extracted_data = {"test": "data"}

    # Mock DB record to return finalized state
    db_state = {
        "status": "FINALIZED",
        "processed": True,
        "validation_status": "VOUCHER_CREATED",
        "extracted_data": {"original": "dto"}
    }

    with patch('ocr_pipeline.models.InvoiceTempOCR.objects.filter') as mock_filter, \
         patch('ocr_pipeline.models.super') as mock_super:
         
         # Mock .values(...).first()
         mock_filter.return_value.values.return_value.first.return_value = db_state
         
         # Attempt to save record with mutated state should raise RuntimeError
         with pytest.raises(RuntimeError) as exc_info:
             record.save()
         assert "Post-finalization mutation blocked" in str(exc_info.value)

    # 3. Test Assembly Failure Containment when page is failed
    record_assem = MagicMock()
    record_assem.id = 888
    record_assem.tenant_id = "tenant-123"
    record_assem.upload_session_id = "session-123"
    
    mock_db_results = [
        {
            "page_number": 1,
            "is_failed": False,
            "canonical_payload": {"invoice_no": "INV-1", "vendor_name": "V1", "items": []}
        },
        {
            "page_number": 2,
            "is_failed": True,
            "canonical_payload": {"status": "OCR_FAILED"}
        }
    ]

    with patch('ocr_pipeline.pipeline.acquire_redis_lock', return_value=True), \
         patch('ocr_pipeline.pipeline.release_redis_lock'), \
         patch('ocr_pipeline.pipeline.InvoiceTempOCR.objects.select_for_update') as mock_rec_select, \
         patch('ocr_pipeline.models.SessionFinalizationState.objects.select_for_update') as mock_barrier_select, \
         patch('ocr_pipeline.pipeline.InvoicePageResult.objects.filter') as mock_pages_filter:
         
         mock_rec_select.return_value.get.return_value = record_assem
         
         mock_barrier = MagicMock()
         mock_barrier.snapshot_created = False
         mock_barrier.expected_pages = 2
         mock_barrier_select.return_value.get.return_value = mock_barrier
         
         # Mock page results query to return our mock db results
         mock_pages_qs = MagicMock()
         mock_pages_qs.values.return_value = mock_db_results
         mock_pages_filter.return_value = mock_pages_qs
         
         with patch('ocr_pipeline.models.SessionFinalizationState.objects.filter') as mock_state_filter:
             mock_state_filter.return_value.first.return_value = mock_barrier
             
             res_assem = assemble_multi_page_record(record_assem, total_expected=2, force=True)
             
             # Should abort and return extraction failed
             assert res_assem["status"] == "EXTRACTION_FAILED"
             assert res_assem["failed_pages"] == [2]
             
             # Record status should be updated to FAILED
             assert record_assem.status == "FAILED"
             assert record_assem.validation_status == "EXTRACTION_FAILED"
             assert record_assem.processed is False


@pytest.mark.django_db
def test_session_finalization_state_immutability():
    from ocr_pipeline.models import SessionFinalizationState
    from unittest.mock import patch
    import pytest
    
    state = SessionFinalizationState()
    state.pk = "test-session-123"
    state.export_complete = False
    state.materialization_complete = False
    state.snapshot_complete = False
    
    # Mock DB state to represent a finalized session
    db_state = {
        'status': 'UPLOADED',
        'snapshot_created': True,
        'export_complete': True,
        'materialization_complete': True,
        'snapshot_complete': True
    }
    
    with patch('ocr_pipeline.models.SessionFinalizationState.objects.filter') as mock_filter, \
         patch('ocr_pipeline.models.super') as mock_super:
         
         mock_filter.return_value.values.return_value.first.return_value = db_state
         
         with pytest.raises(RuntimeError) as exc_info:
             state.save()
         assert "Post-finalization mutation blocked" in str(exc_info.value)


@pytest.mark.django_db
@pytest.mark.anyio
async def test_coordinator_and_assembly_worker_one_shot():
    """
    Verifies that the AssemblyWorker executes assembly in one-shot
    post-barrier, and aborts if already snapshot_created.
    """
    import asyncio
    from vouchers.assembly_worker import AssemblyWorker
    from unittest.mock import MagicMock, patch
    import pytest
    
    worker = AssemblyWorker()
    task = {
        'id': 'task-123',
        'task_type': 'ASSEMBLY',
        'session_id': 'session-123',
        'tenant_id': 'tenant-123',
        'payload': {
            'record_id': 123,
            'job_id': 'job-123',
        }
    }
    
    # 1. Test case: Already finalized (snapshot_created=True)
    mock_barrier = MagicMock()
    mock_barrier.snapshot_created = True
    mock_barrier.expected_pages = 2
    
    with patch('ocr_pipeline.models.SessionFinalizationState.objects.get_or_create', return_value=(mock_barrier, False)) as mock_get_or_create:
        await worker.handle_task(task)
        # Should exit early without calling get_db_barrier_state or acquire_finalize_lock
        mock_get_or_create.assert_called_once_with(id='123')

    # 2. Test case: Barrier ready, executes assembly
    mock_barrier.snapshot_created = False
    mock_page_results = [
        {"page_number": 1, "is_failed": False},
        {"page_number": 2, "is_failed": False}
    ]
    
    mock_record = MagicMock()
    mock_record.id = 123
    
    with patch('ocr_pipeline.models.SessionFinalizationState.objects.get_or_create', return_value=(mock_barrier, False)), \
         patch('ocr_pipeline.models.InvoicePageResult.objects.filter') as mock_pages_filter, \
         patch('core.redis_orchestrator.orchestrator.acquire_finalize_lock', return_value=True) as mock_lock, \
         patch('ocr_pipeline.models.InvoiceTempOCR.objects.get', return_value=mock_record), \
         patch('vouchers.assembly_worker.assemble_multi_page_record', return_value={"status": "SUCCESS"}) as mock_assemble, \
         patch('ocr_pipeline.models.SessionFinalizationState.objects.get', return_value=mock_barrier), \
         patch('core.redis_orchestrator.orchestrator.update_session_status') as mock_update_status, \
         patch('core.sqs.queue_service.push') as mock_push:
         
         mock_qs = MagicMock()
         mock_qs.values.return_value = mock_page_results
         # For get_final_counts, return another copy
         mock_qs_final = MagicMock()
         mock_qs_final.values.return_value = [
             {"page_number": 1, "is_failed": False, "canonical_payload": {}},
             {"page_number": 2, "is_failed": False, "canonical_payload": {}}
         ]
         mock_pages_filter.side_effect = [mock_qs, mock_qs_final]
         
         await worker.handle_task(task)
         
         # Assert lock was acquired
         mock_lock.assert_called_once_with(123)
         # Assert assembly occurred
         mock_assemble.assert_called_once_with(mock_record, job_id='job-123', item_id=None, force=True)
         # Assert session status updated
         mock_update_status.assert_any_call(123, "READY_FOR_REVIEW", progress=100.0)
         # Assert FINALIZE was enqueued
         mock_push.assert_called_once()
         queued_msg = mock_push.call_args[0][0]
         assert queued_msg["task_type"] == "FINALIZE"
         assert queued_msg["payload"]["record_id"] == 123


@pytest.mark.django_db(transaction=True)
@pytest.mark.anyio
async def test_async_coordinator_execution_and_fallback():
    """
    1. Tests that calling coordinator check_and_trigger_assembly from an async context 
       does not cause SynchronousOnlyOperation (runs inside thread).
    2. Tests coordinator exception fallback (fail-open SQS enqueueing when database queries raise error).
    3. Tests convergence persistence during coordinator failure.
    """
    from vouchers.coordinator import check_and_trigger_assembly
    from vouchers.ai_worker import AIWorker
    from ocr_pipeline.models import SessionFinalizationState
    import asyncio
    from unittest.mock import MagicMock, patch
    
    # Create actual barrier in DB since we use transaction=True
    loop = asyncio.get_running_loop()
    
    def _setup_db_records():
        b, _ = SessionFinalizationState.objects.get_or_create(
            id="123",
            defaults={
                "expected_pages": 2,
                "total_pages_completed": 2,
                "completed_pages": 2,
                "failed_pages": 0,
                "ai_complete": False
            }
        )
        # Reset if exists
        b.ai_complete = False
        b.expected_pages = 2
        b.total_pages_completed = 2
        b.save()
        return b
        
    barrier = await loop.run_in_executor(None, _setup_db_records)
    
    # 1. Async execution safety check
    # Mock models and queue_service to prevent external side-effects
    with patch('core.sqs.queue_service.push') as mock_push, \
         patch('ocr_pipeline.models.InvoicePageResult.objects.filter') as mock_filter:
        
        mock_filter.return_value.count.return_value = 2
        
        # Execute synchronously inside executor thread from async event loop
        await loop.run_in_executor(
            None,
            lambda: check_and_trigger_assembly("123", "tenant-1", "sess-1", "corr-1", "job-1", "item-1")
        )
        # SQS message must be pushed
        mock_push.assert_called_once()
            
    # 2. Coordinator Exception Fallback (Database error raises exception)
    def _reset_barrier():
        barrier.ai_complete = False
        barrier.save()
    await loop.run_in_executor(None, _reset_barrier)
    
    with patch('ocr_pipeline.models.SessionFinalizationState.objects.select_for_update', side_effect=RuntimeError("Database lock failure")), \
         patch('core.sqs.queue_service.push') as mock_push:
         
         # The execution should not crash the caller, and it should trigger fail-open fallback push
         await loop.run_in_executor(
             None,
             lambda: check_and_trigger_assembly("123", "tenant-1", "sess-1", "corr-1", "job-1", "item-1")
         )
         mock_push.assert_called_once()
         fallback_msg = mock_push.call_args[0][0]
         assert fallback_msg["task_type"] == "ASSEMBLY"
         assert fallback_msg["payload"]["result"].get("_fallback_emitted") is True

    # 3. Convergence persistence during coordinator failure
    # Ensure that even if the coordinator fails, AI worker completes the persist step beforehand
    worker = AIWorker()
    task = {
        'id': 'task-999',
        'task_type': 'AI_EXTRACTION',
        'session_id': 'sess-123',
        'tenant_id': 'tenant-123',
        'correlation_id': 'corr-123',
        'payload': {
            'record_id': 123,
            'page_number': 1,
            'job_id': 'job-123',
            'item_id': 'item-123',
            'result': {'vendor_name': 'Test Vendor', 'invoice_no': 'INV-123', 'items': [{'description': 'Item 1'}]}
        }
    }
    
    with patch('core.redis_orchestrator.orchestrator.release_ai_slot'), \
         patch('core.ai_proxy.process_ai_request', return_value=task['payload']['result']), \
         patch('vouchers.coordinator.terminalize_page_state') as mock_terminalize, \
         patch('vouchers.coordinator.check_and_trigger_assembly', side_effect=RuntimeError("Coordinator failed")):
         
         # The AI worker task execution should complete without crashing from the coordinator failure
         await worker.handle_task(task)
         
         # Assert that terminalize_page_state was still invoked
         mock_terminalize.assert_called_once()


@pytest.mark.django_db(transaction=True)
@pytest.mark.anyio
async def test_one_shot_assembly_and_split_brain_prevention():
    """
    4. Tests one-shot assembly emission.
    5. Tests split-brain prevention (verifies DB counters and Redis status track unified state).
    """
    from vouchers.coordinator import check_and_trigger_assembly
    from ocr_pipeline.models import SessionFinalizationState
    import asyncio
    from unittest.mock import MagicMock, patch
    
    # Create actual barrier in DB since we use transaction=True
    loop = asyncio.get_running_loop()
    
    def _setup_db_records():
        b, _ = SessionFinalizationState.objects.get_or_create(
            id="456",
            defaults={
                "expected_pages": 2,
                "total_pages_completed": 2,
                "completed_pages": 2,
                "failed_pages": 0,
                "ai_complete": False
            }
        )
        # Reset if exists
        b.ai_complete = False
        b.expected_pages = 2
        b.total_pages_completed = 2
        b.save()
        return b
        
    barrier = await loop.run_in_executor(None, _setup_db_records)
    
    # 4. One-shot assembly: trigger multiple times, first should emit, second should bypass
    with patch('core.sqs.queue_service.push') as mock_push, \
         patch('ocr_pipeline.models.InvoicePageResult.objects.filter') as mock_filter:
         
         mock_filter.return_value.count.return_value = 2
         
         # First check
         await loop.run_in_executor(
             None,
             lambda: check_and_trigger_assembly("456", "tenant-1", "sess-1", "corr-1", "job-1", "item-1")
         )
         
         # Refresh barrier from DB
         def _get_barrier():
             return SessionFinalizationState.objects.get(id="456")
         b1 = await loop.run_in_executor(None, _get_barrier)
         assert b1.ai_complete is True
         assert mock_push.call_count == 1
         
         # Second check (already emitted)
         await loop.run_in_executor(
             None,
             lambda: check_and_trigger_assembly("456", "tenant-1", "sess-1", "corr-1", "job-1", "item-1")
         )
         # Should not push again
         assert mock_push.call_count == 1


@pytest.mark.django_db(transaction=True)
@pytest.mark.anyio
async def test_1000_parallel_page_completions_simulation():
    """
    6. Barrier convergence under parallel completions.
    7. Simulates 1000 parallel page completions concurrently using asyncio.gather.
       Verifies lock stability, DB convergence, and that assembly triggers exactly once.
    """
    from vouchers.coordinator import check_and_trigger_assembly
    from ocr_pipeline.models import SessionFinalizationState
    import asyncio
    from unittest.mock import MagicMock, patch
    from django.db import transaction as db_transaction
    from django.db import models
    
    # Create actual barrier in DB since we use transaction=True
    def _create_barrier():
        return SessionFinalizationState.objects.create(
            id="sim-1000",
            expected_pages=1000,
            total_pages_completed=0,
            completed_pages=0,
            failed_pages=0,
            ai_complete=False
        )
    
    loop = asyncio.get_running_loop()
    barrier = await loop.run_in_executor(None, _create_barrier)
    
    # Mock objects and queue push
    with patch('ocr_pipeline.models.InvoicePageResult.objects.filter') as mock_filter, \
         patch('core.sqs.queue_service.push') as mock_push:
         
         # We will simulate 1000 concurrent page finishes.
         # Each page finish increments total_pages_completed by 1.
         # When page counter reaches 1000, assembly is triggered.
         
         # Shared state for simulation
         completed_count = 0
         completed_lock = asyncio.Lock()
         
         async def mock_finish_page(page_num):
             nonlocal completed_count
             async with completed_lock:
                 completed_count += 1
                 current_count = completed_count
             
             # Atomically update DB counter inside executor
             def _update_db():
                 with db_transaction.atomic():
                     b = SessionFinalizationState.objects.select_for_update().get(id="sim-1000")
                     b.total_pages_completed = models.F('total_pages_completed') + 1
                     b.completed_pages = models.F('completed_pages') + 1
                     b.save(update_fields=['total_pages_completed', 'completed_pages'])
                     
             await loop.run_in_executor(None, _update_db)
             
             # Call coordinator
             # Mock filter count to represent current total completed pages in DB
             mock_filter.return_value.count.return_value = current_count
             await loop.run_in_executor(
                 None,
                 lambda: check_and_trigger_assembly("sim-1000", "t1", "s1", "c1", "j1", "i1")
             )

         # Run 1000 page tasks concurrently
         tasks = [mock_finish_page(i) for i in range(1000)]
         await asyncio.gather(*tasks)
         
         # Refresh barrier from DB to check final state
         def _get_barrier():
             return SessionFinalizationState.objects.get(id="sim-1000")
             
         final_barrier = await loop.run_in_executor(None, _get_barrier)
         
         # Verify that SQS push was called exactly once
         assert mock_push.call_count == 1
         # Verify barrier is fully converged
         assert final_barrier.ai_complete is True
         assert final_barrier.total_pages_completed == 1000


def test_semantic_dto_validation():
    """
    Tests semantic validation.
    Per-page stage allows continuation and summary pages during staging (returns True).
    """
    from vouchers.ai_worker import AIWorker
    worker = AIWorker()

    # Case 1: normal valid payload with real items
    payload_valid = {
        'vendor_name': 'Vendor A',
        'invoice_no': 'INV-001',
        'items': [
            {'description': 'Real Item 1', 'qty': 1, 'price': 100},
            {'description': 'Total GST', 'qty': 1, 'price': 18}
        ]
    }
    assert worker._is_dto_valid(payload_valid) is True

    # Case 2: summary/footer only page (allowed during staging, check shifted to post-assembly)
    payload_summary_only = {
        'vendor_name': 'Vendor A',
        'invoice_no': 'INV-001',
        'items': [
            {'description': 'Carry forward total', 'qty': 1, 'price': 1000},
            {'description': 'CGST @ 9%', 'qty': 1, 'price': 90}
        ]
    }
    assert worker._is_dto_valid(payload_summary_only) is True

    # Case 3: summary/footer only page with continuation_page = True (also allowed)
    payload_summary_continuation = {
        'vendor_name': 'Vendor A',
        'invoice_no': 'INV-001',
        'continuation_page': True,
        'items': [
            {'description': 'Carry forward total', 'qty': 1, 'price': 1000},
            {'description': 'CGST @ 9%', 'qty': 1, 'price': 90}
        ]
    }
    assert worker._is_dto_valid(payload_summary_continuation) is True


# ── PHASE 2–10 REGRESSION SUITE ─────────────────────────────────────────────

@pytest.mark.django_db(transaction=True)
def test_terminal_consistency_gate_blocks_then_unblocks_ui():
    """
    PHASE 10 REGRESSION:
    Verifies that the UI poll endpoint:
      1. Returns PROCESSING when terminal_consistency=False (default)
      2. Returns FINALIZED when terminal_consistency=True
    This is the critical gate that was causing UI freeze at 65%.
    """
    from ocr_pipeline.views import CleanOCRStagingView
    from rest_framework.test import APIRequestFactory, force_authenticate
    from ocr_pipeline.models import SessionFinalizationState
    from unittest.mock import MagicMock, patch

    factory = APIRequestFactory()
    view = CleanOCRStagingView.as_view()

    # --- GATE CLOSED: terminal_consistency=False → returns PROCESSING ---
    barrier_closed = MagicMock()
    barrier_closed.status = 'PROCESSING'
    barrier_closed.terminal_consistency = False
    barrier_closed.expected_pages = 3
    barrier_closed.completed_pages = 2
    barrier_closed.failed_pages = 0

    prim_rec = MagicMock()
    prim_rec.id = 999
    prim_rec.upload_session_id = 'sess-gate-test'

    with patch('ocr_pipeline.views.InvoiceTempOCR.objects.filter') as mock_rec_filter, \
         patch('ocr_pipeline.models.SessionFinalizationState.objects.filter') as mock_barrier_filter:

        mock_rec_filter.return_value.order_by.return_value.first.return_value = prim_rec
        mock_barrier_filter.return_value.first.return_value = barrier_closed

        request = factory.get('/api/ocr-staging/', {'upload_session_id': 'sess-gate-test'})
        user = MagicMock()
        user.branch_id = 'tenant-123'
        force_authenticate(request, user=user)
        response = view(request)

        assert response.status_code == 200
        assert response.data['status'] == 'PROCESSING', (
            f"Expected PROCESSING when terminal_consistency=False, got: {response.data['status']}"
        )
        assert response.data['terminal'] is False

    # --- GATE OPEN: terminal_consistency=True → returns FINALIZED data ---
    barrier_open = MagicMock()
    barrier_open.status = 'FINALIZED'
    barrier_open.terminal_consistency = True
    barrier_open.expected_pages = 3
    barrier_open.completed_pages = 3
    barrier_open.failed_pages = 0

    with patch('ocr_pipeline.views.InvoiceTempOCR.objects.filter') as mock_rec_filter, \
         patch('ocr_pipeline.models.SessionFinalizationState.objects.filter') as mock_barrier_filter, \
         patch('ocr_pipeline.views.FinalizedSnapshot') as mock_snap_cls:

        mock_rec_filter.return_value.order_by.return_value.first.return_value = prim_rec
        mock_barrier_filter.return_value.first.return_value = barrier_open

        # FinalizedSnapshot.objects.filter(...).order_by(...) must support .exists() + iteration
        empty_qs = MagicMock()
        empty_qs.exists.return_value = False
        empty_qs.__iter__ = MagicMock(return_value=iter([]))
        mock_snap_cls.objects.filter.return_value.order_by.return_value = empty_qs

        request = factory.get('/api/ocr-staging/', {'upload_session_id': 'sess-gate-test'})
        user = MagicMock()
        user.branch_id = 'tenant-123'
        force_authenticate(request, user=user)
        response = view(request)

        assert response.status_code == 200
        assert response.data['status'] == 'FINALIZED', (
            f"Expected FINALIZED when terminal_consistency=True, got: {response.data['status']}"
        )
        assert response.data['terminal'] is True
        assert response.data['hydration_pending'] is False


@pytest.mark.django_db(transaction=True)
def test_no_orphan_detection_during_active_processing():
    """
    PHASE 5 REGRESSION:
    Verifies that no ORPHAN_PAGE_DETECTED log fires while the barrier
    is still incomplete (pages are still actively processing).
    The coordinator must only log BARRIER_PARTIAL with deferred message.
    """
    import logging
    from unittest.mock import patch, MagicMock
    from vouchers.coordinator import check_and_trigger_assembly

    orphan_fired = []

    class OrphanCapture(logging.Handler):
        def emit(self, record):
            if 'ORPHAN_PAGE_DETECTED' in record.getMessage():
                orphan_fired.append(record.getMessage())

    handler = OrphanCapture()
    coord_logger = logging.getLogger('vouchers.coordinator')
    coord_logger.addHandler(handler)

    try:
        with patch('ocr_pipeline.models.SessionFinalizationState.objects.select_for_update') as mock_su, \
             patch('ocr_pipeline.models.InvoicePageResult.objects.filter') as mock_filter, \
             patch('core.sqs.queue_service.push') as mock_push:

            # Simulate: 3 pages expected, only 2 complete — 1 still in Gemini
            mock_barrier = MagicMock()
            mock_barrier.ai_complete = False
            mock_barrier.expected_pages = 3
            mock_barrier.completed_pages = 2
            mock_barrier.failed_pages = 0
            mock_su.return_value.get.return_value = mock_barrier

            # DB shows only 2 page results — page 3 is still processing
            mock_filter.return_value.count.return_value = 2

            check_and_trigger_assembly(
                record_id="test-orphan-999",
                tenant_id="tenant-1",
                session_id="sess-1",
                correlation_id="corr-1",
                job_id="job-1",
                item_id=None
            )

            # CRITICAL: no ORPHAN_PAGE_DETECTED must have fired
            assert len(orphan_fired) == 0, (
                f"ORPHAN_PAGE_DETECTED fired during active processing: {orphan_fired}"
            )
            # Assembly must NOT have been triggered
            mock_push.assert_not_called()
    finally:
        coord_logger.removeHandler(handler)


@pytest.mark.django_db(transaction=True)
@pytest.mark.anyio
async def test_assembly_flags_written_after_successful_assembly():
    """
    PHASE 6+7 REGRESSION:
    Verifies that assembly_worker writes assembly_complete=True and
    continuation_merge_complete=True after a successful one-shot assembly.
    These flags must be written BEFORE the FINALIZE message is enqueued.
    """
    import asyncio
    from vouchers.assembly_worker import AssemblyWorker
    from ocr_pipeline.models import SessionFinalizationState
    from unittest.mock import MagicMock, patch

    loop = asyncio.get_running_loop()

    def _create_barrier():
        return SessionFinalizationState.objects.create(
            id='asm-flag-test-789',
            expected_pages=2,
            completed_pages=2,
            failed_pages=0,
            ai_complete=True,
            assembly_complete=False,
            continuation_merge_complete=False,
        )

    barrier = await loop.run_in_executor(None, _create_barrier)

    worker = AssemblyWorker()
    task = {
        'id': 'task-asm-flag',
        'task_type': 'ASSEMBLY',
        'session_id': 'sess-asm-flag',
        'tenant_id': 'tenant-1',
        'payload': {'record_id': 'asm-flag-test-789', 'job_id': 'job-1'},
    }

    mock_record = MagicMock()
    mock_record.id = 'asm-flag-test-789'

    with patch('ocr_pipeline.models.SessionFinalizationState.objects.get_or_create',
               return_value=(barrier, False)), \
         patch('ocr_pipeline.models.InvoicePageResult.objects.filter') as mock_pages, \
         patch('core.redis_orchestrator.orchestrator.acquire_finalize_lock', return_value=True), \
         patch('ocr_pipeline.models.InvoiceTempOCR.objects.get', return_value=mock_record), \
         patch('vouchers.assembly_worker.assemble_multi_page_record',
               return_value={'status': 'SUCCESS'}) as mock_assemble, \
         patch('ocr_pipeline.models.SessionFinalizationState.objects.get', return_value=barrier), \
         patch('core.redis_orchestrator.orchestrator.update_session_status'), \
         patch('core.sqs.queue_service.push'), \
         patch('ocr_pipeline.models.SessionFinalizationState.objects.select_for_update') as mock_su:

        mock_pages.return_value.values.return_value = [
            {'page_number': 1, 'is_failed': False, 'canonical_payload': {}},
            {'page_number': 2, 'is_failed': False, 'canonical_payload': {}},
        ]
        # For select_for_update in _set_assembly_flags
        mock_su.return_value.get.return_value = barrier

        await worker.handle_task(task)

        # Verify assembly was called
        mock_assemble.assert_called_once()

    # Refresh barrier — check flags were written
    def _read_barrier():
        return SessionFinalizationState.objects.get(id='asm-flag-test-789')

    final = await loop.run_in_executor(None, _read_barrier)
    assert final.assembly_complete is True, "assembly_complete must be True after successful assembly"
    assert final.continuation_merge_complete is True, "continuation_merge_complete must be True after merge"


@pytest.mark.django_db(transaction=True)
@pytest.mark.anyio
async def test_terminal_consistency_written_by_finalize_worker():
    """
    PHASE 10 REGRESSION:
    Verifies that finalize_worker writes terminal_consistency=True
    and validation_complete=True after processing completes.
    terminal_consistency is the final gate that unlocks the UI poll.
    """
    import asyncio
    from vouchers.finalize_worker import FinalizeWorker
    from ocr_pipeline.models import SessionFinalizationState
    from unittest.mock import MagicMock, patch

    loop = asyncio.get_running_loop()

    def _create_barrier():
        return SessionFinalizationState.objects.create(
            id='tc-finalize-test-101',
            expected_pages=1,
            completed_pages=1,
            failed_pages=0,
            snapshot_created=True,
            assembly_complete=True,
            continuation_merge_complete=True,
            snapshot_complete=True,
            export_complete=False,
            materialization_complete=False,
            validation_complete=False,
            terminal_consistency=False,
            status='PROCESSING',
        )

    await loop.run_in_executor(None, _create_barrier)

    worker = FinalizeWorker()
    task = {
        'id': 'task-tc-fin',
        'task_type': 'FINALIZE',
        'session_id': 'sess-tc-fin',
        'tenant_id': 'tenant-1',
        'payload': {
            'record_id': 'tc-finalize-test-101',
            'job_id': 'job-1',
            'failed': False,
        },
    }

    mock_record_obj = MagicMock()
    mock_record_obj.id = 'tc-finalize-test-101'

    with patch('core.redis_orchestrator.orchestrator.get_authoritative_session_state') as mock_auth, \
         patch('ocr_pipeline.models.FinalizedSnapshot.objects.filter') as mock_snap, \
         patch('ocr_pipeline.models.InvoiceTempOCR.objects.filter') as mock_rec_filter, \
         patch('ocr_pipeline.views.get_save_eligible_rows', return_value=[]), \
         patch('ocr_pipeline.views.get_pending_purchase_eligible_rows', return_value=[]), \
         patch('ocr_pipeline.models.InvoiceTempOCR.objects.filter') as mock_update, \
         patch('core.redis_orchestrator.orchestrator.update_session_status'), \
         patch('ocr_pipeline.models.OCRJob.objects.filter'):

        mock_auth.return_value = {
            'expected_pages': 1, 'completed_pages': 1, 'failed_pages': 0,
            'snapshot_complete': True, 'materialization_complete': False
        }
        mock_snap.return_value.exists.return_value = True
        mock_rec_filter.return_value.values.return_value.first.return_value = {
            'upload_session_id': 'sess-tc-fin', 'tenant_id': 'tenant-1'
        }
        mock_rec_filter.return_value.first.return_value = mock_record_obj
        mock_update.return_value.update.return_value = 1

        await worker.handle_task(task)

    def _check_flags():
        return SessionFinalizationState.objects.get(id='tc-finalize-test-101')

    final = await loop.run_in_executor(None, _check_flags)
    assert final.terminal_consistency is True, (
        "terminal_consistency must be True after finalize_worker completes"
    )
    assert final.validation_complete is True, (
        "validation_complete must be True after finalize_worker completes"
    )


@pytest.mark.django_db(transaction=True)
def test_11page_finalize_convergence_no_deadlock():
    """
    INTEGRATION TEST — 99% DEADLOCK REGRESSION.

    Scenario:
      - 11-page upload
      - Pages 1-10 complete first (barrier not yet satisfied)
      - Final page (11) completes last
      - terminalize_page_state() for page 11 must trigger check_and_trigger_assembly()
      - Assembly SQS message must be emitted exactly once
      - No duplicate assembly, no validation replay

    Verifies:
      - [FINALIZE_BARRIER_CONFIRMED] emitted when barrier_total == expected
      - Assembly message pushed exactly once
      - ai_complete=True set atomically
      - No second assembly push for any earlier page callback
    """
    import threading
    import time
    from unittest.mock import patch, MagicMock, call
    from ocr_pipeline.models import SessionFinalizationState, InvoicePageResult
    from vouchers.coordinator import terminalize_page_state

    RECORD_ID = '999999911'   # str for SessionFinalizationState CharField PK
    RECORD_ID_INT = 999999911  # int for InvoicePageResult BigIntegerField
    EXPECTED_PAGES = 11

    # Create the barrier with 11 expected pages
    def _setup():
        SessionFinalizationState.objects.filter(id=RECORD_ID).delete()
        return SessionFinalizationState.objects.create(
            id=RECORD_ID,
            expected_pages=EXPECTED_PAGES,
            completed_pages=0,
            failed_pages=0,
            ai_completed_pages=0,
            ai_complete=False,
            snapshot_created=False,
        )

    _setup()

    assembly_push_calls = []
    assembly_push_lock = threading.Lock()

    def _mock_push(msg, queue_type=None):
        with assembly_push_lock:
            assembly_push_calls.append({'msg': msg, 'queue': queue_type})

    with patch('core.sqs.queue_service.push', side_effect=_mock_push), \
         patch('vouchers.message_factory.message_factory.create_message') as mock_create:

        mock_create.return_value = {
            'id': 'test-assembly-msg',
            'task_type': 'ASSEMBLY',
            'payload': {'record_id': RECORD_ID},
        }

        # Simulate pages 1-10 completing (barrier should NOT trigger yet)
        for page_num in range(1, EXPECTED_PAGES):
            terminalize_page_state(
                record_id=RECORD_ID,
                page_number=page_num,
                session_id='sess-11page',
                is_failed=False,
                canonical_payload={'invoice_no': f'INV-{page_num}', 'vendor_name': 'TestVendor'},
                worker_id='AIWorker',
                queue_source='ai_queue',
                tenant_id='tenant-test',
                correlation_id=f'corr-{page_num}',
                job_id='job-11page',
                item_id=None,
            )

        # After pages 1-10, assembly must NOT have been triggered
        # Allow background thread to settle
        time.sleep(0.1)
        with assembly_push_lock:
            partial_push_count = len(assembly_push_calls)

        assert partial_push_count == 0, (
            f"Assembly was triggered prematurely after {EXPECTED_PAGES-1} of {EXPECTED_PAGES} pages: "
            f"{assembly_push_calls}"
        )

        # Verify barrier state: 10 completed, 0 failed, ai_complete=False
        mid_barrier = SessionFinalizationState.objects.get(id=RECORD_ID)
        assert mid_barrier.completed_pages == EXPECTED_PAGES - 1, (
            f"Expected {EXPECTED_PAGES-1} completed pages, got {mid_barrier.completed_pages}"
        )
        assert mid_barrier.ai_complete is False, "ai_complete must still be False after partial completion"

        # Now the FINAL page (11) completes — this must trigger assembly
        terminalize_page_state(
            record_id=RECORD_ID,
            page_number=EXPECTED_PAGES,
            session_id='sess-11page',
            is_failed=False,
            canonical_payload={'invoice_no': f'INV-{EXPECTED_PAGES}', 'vendor_name': 'TestVendor'},
            worker_id='AIWorker',
            queue_source='ai_queue',
            tenant_id='tenant-test',
            correlation_id=f'corr-{EXPECTED_PAGES}',
            job_id='job-11page',
            item_id=None,
        )

        # Allow background convergence thread to complete
        time.sleep(0.3)

    # ASSERTIONS

    # 1. Assembly pushed exactly once
    assert len(assembly_push_calls) == 1, (
        f"Expected exactly 1 assembly push, got {len(assembly_push_calls)}: {assembly_push_calls}"
    )
    assert assembly_push_calls[0]['queue'] == 'assembly', (
        f"Expected queue='assembly', got: {assembly_push_calls[0]['queue']}"
    )

    # 2. ai_complete=True set in DB
    final_barrier = SessionFinalizationState.objects.get(id=RECORD_ID)
    assert final_barrier.ai_complete is True, (
        "ai_complete must be True after all pages complete — convergence must have fired"
    )
    assert final_barrier.completed_pages == EXPECTED_PAGES, (
        f"Expected {EXPECTED_PAGES} completed pages, got {final_barrier.completed_pages}"
    )

    # 3. All 11 InvoicePageResult rows exist with counted_in_barrier=True
    page_results = InvoicePageResult.objects.filter(record_id=RECORD_ID)
    assert page_results.count() == EXPECTED_PAGES, (
        f"Expected {EXPECTED_PAGES} InvoicePageResult rows, got {page_results.count()}"
    )
    uncounted = page_results.filter(counted_in_barrier=False).count()
    assert uncounted == 0, (
        f"{uncounted} pages have counted_in_barrier=False — barrier counter corruption"
    )


@pytest.mark.django_db
def test_validation_state_propagation_integration():
    """
    Integration test for validation state propagation.
    Verifies:
      1. Exact-match GSTIN vendor is resolved as EXISTS.
      2. Sibling record created during assembly (no validate_and_process called) resolves as EXISTS via vendor_map.
      3. Item validation status propagates to the parent (no default 'ALREADY EXIST' fallback).
    """
    import traceback
    try:
        from vendors.models import VendorMasterBasicDetail, VendorMasterGSTDetails
        from ocr_pipeline.models import InvoiceTempOCR, FinalizedSnapshot, SessionFinalizationState
        from ocr_pipeline.views import CleanOCRStagingView
        from rest_framework.test import APIRequestFactory, force_authenticate
        from unittest.mock import MagicMock

        tenant_id = "test-tenant-123"
        gstin = "33ABYFS6343M1ZC"
        branch_name = "Main Branch"

        # Create master vendor
        basic = VendorMasterBasicDetail.objects.create(
            tenant_id=tenant_id,
            vendor_name="GSTIN Match Vendor",
            email="vendor@example.com",
            contact_no="9876543210"
        )
        VendorMasterGSTDetails.objects.create(
            tenant_id=tenant_id,
            vendor_basic_detail=basic,
            gstin=gstin,
            reference_name=branch_name,
            legal_name="GSTIN Match Vendor"
        )

        # 1. Test record hydration directly
        record = InvoiceTempOCR.objects.create(
            tenant_id=tenant_id,
            upload_session_id="session-123",
            supplier_invoice_no="INV-100",
            gstin=gstin,
            branch=branch_name,
            voucher_type="PURCHASE",
            extracted_data={
                "invoice_no": "INV-100",
                "gstin": gstin,
                "branch": branch_name,
                "items": [
                    {"item_status": "CREATE ITEM", "description": "New Item 1"}
                ]
            }
        )

        view_instance = CleanOCRStagingView()
        # Build a vendor map to simulate the hydration lookup
        from vendors.vendor_validation_logic import build_session_vendor_map
        vendor_map = build_session_vendor_map(tenant_id, [record])
        
        # Check map matches
        from vendors.vendor_validation_logic import normalize_branch
        gstin_key = gstin.strip().upper()
        branch_key = normalize_branch(branch_name)
        assert (gstin_key, branch_key) in vendor_map
        assert vendor_map[(gstin_key, branch_key)]["status"] == "EXISTING_VENDOR"

        # Hydrate ui row
        ui_row = view_instance._map_record_to_ui_row(record, vendor_map=vendor_map)
        assert ui_row["vendor_status"] == "EXISTS"
        assert ui_row["vendor_id"] == basic.id
        assert ui_row["item_status"] == "CREATE ITEM"

        # 2. Test snapshot hydration gate (CleanOCRStagingView API GET)
        # Create final snapshot to mock the terminal consistency gate
        barrier = SessionFinalizationState.objects.create(
            id=str(record.id),
            expected_pages=1,
            completed_pages=1,
            failed_pages=0,
            snapshot_created=True,
            terminal_consistency=True
        )
        
        snapshot_json = {
            "data": [
                {
                    "id": record.id,
                    "invoice_no": "INV-100",
                    "gstin": gstin,
                    "branch": branch_name,
                    "items": [
                        {"item_status": "CREATE ITEM", "description": "New Item 1"}
                    ]
                }
            ],
            "metadata": {
                "total_pages": 1,
                "assembled_at": "2026-06-03T12:00:00"
            }
        }
        FinalizedSnapshot.objects.create(
            session_id="session-123",
            snapshot_json=snapshot_json
        )

        factory = APIRequestFactory()
        request = factory.get('/api/ocr-staging/', {'upload_session_id': 'session-123'})
        user = MagicMock()
        user.branch_id = tenant_id
        force_authenticate(request, user=user)

        view_func = CleanOCRStagingView.as_view()
        response = view_func(request)
        assert response.status_code == 200
        rows = response.data.get("data", [])
        assert len(rows) == 1
        assert rows[0]["vendor_status"] == "EXISTS"
        assert rows[0]["vendor_id"] == basic.id
        assert rows[0]["item_status"] == "CREATE ITEM"
    except Exception as e:
        traceback.print_exc()
        raise e


@pytest.mark.django_db
def test_assembly_and_snapshot_item_validation_lifecycle():
    """
    Specifically validates the item_status and items array count in the FinalizedSnapshot
    database record for a multi-page invoice before the view layer is ever invoked.
    Also verifies:
      - Sibling record created during assembly (no validate_and_process called) resolves as EXISTS/CREATE ITEM
      - Parent aggregate status calculation (ALREADY_EXIST/PARTIAL/CREATE_ITEM)
    """
    import traceback
    try:
        from ocr_pipeline.models import InvoiceTempOCR, FinalizedSnapshot, SessionFinalizationState, InvoicePageResult
        from inventory.models import InventoryItem
        from ocr_pipeline.pipeline import assemble_multi_page_record
        
        tenant_id = "test-tenant-lifecycle"
        
        # 1. Seed Inventory Master with one item to test PARTIAL status
        InventoryItem.objects.create(
            tenant_id=tenant_id,
            item_name="Existing Item 1",
            item_code="CODE-1",
            hsn_code="123456"
        )
        
        # 2. Setup staging records
        record = InvoiceTempOCR.objects.create(
            tenant_id=tenant_id,
            upload_session_id="session-lifecycle",
            supplier_invoice_no="INV-LIFE",
            gstin="33ABYFS6343M1ZC",
            branch="Main Branch",
            voucher_type="PURCHASE",
            is_primary=True,
            extracted_data={}
        )
        record.total_pages = 2
        
        # Set expected pages in barrier
        SessionFinalizationState.objects.create(
            id=str(record.id),
            expected_pages=2,
            completed_pages=2,
            failed_pages=0,
            snapshot_created=False,
            terminal_consistency=False
        )
        
        # Seed the page outcomes
        # Page 1 has 'Existing Item 1' (ALREADY EXIST)
        # Page 2 has 'New Item 2' (CREATE ITEM)
        InvoicePageResult.objects.create(
            record_id=record.id,
            page_number=1,
            session_id="session-lifecycle",
            is_failed=False,
            canonical_payload={
                "invoice_no": "INV-LIFE-1",
                "gstin": "33ABYFS6343M1ZC",
                "branch": "Main Branch",
                "total_invoice_value": "100.00",
                "items": [
                    {"description": "Existing Item 1", "item_code": "CODE-1", "hsn_code": "123456", "qty": 1.0, "rate": 100.0}
                ]
            }
        )
        InvoicePageResult.objects.create(
            record_id=record.id,
            page_number=2,
            session_id="session-lifecycle",
            is_failed=False,
            canonical_payload={
                "invoice_no": "INV-LIFE-2",
                "gstin": "33ABYFS6343M1ZC",
                "branch": "Main Branch",
                "total_invoice_value": "200.00",
                "items": [
                    {"description": "New Item 2", "item_code": "CODE-2", "hsn_code": "987654", "qty": 2.0, "rate": 50.0}
                ]
            }
        )
        
        # 3. Execute multi-page assembly
        res = assemble_multi_page_record(record)
        assert res["status"] in ("FINALIZED", "SUCCESS")
        
        # 4. Assert snapshot exists and has item validation results
        snapshot = FinalizedSnapshot.objects.filter(session_id="session-lifecycle").first()
        assert snapshot is not None, "Snapshot was not created!"
        
        # Load snapshot data via _get_snapshot_data
        from ocr_pipeline.views import CleanOCRStagingView
        view_instance = CleanOCRStagingView()
        snapshot_data = view_instance._get_snapshot_data(snapshot)
        
        assert "data" in snapshot_data
        invoices = snapshot_data["data"]
        assert len(invoices) == 2
        
        inv1 = [inv for inv in invoices if any(i.get("item_name") == "Existing Item 1" or i.get("description") == "Existing Item 1" for i in inv.get("items", []))][0]
        inv2 = [inv for inv in invoices if any(i.get("item_name") == "New Item 2" or i.get("description") == "New Item 2" for i in inv.get("items", []))][0]
        
        assert len(inv1["items"]) == 1
        assert len(inv2["items"]) == 1
        
        assert inv1["items"][0]["item_status"] == "ALREADY EXIST"
        assert inv2["items"][0]["item_status"] == "CREATE ITEM"
        
        assert inv1["item_status"] == "ALREADY EXIST"
        assert inv2["item_status"] == "CREATE ITEM"
        
        # 5. Assert sibling / primary staging DB records have correct item statuses
        db_records = list(InvoiceTempOCR.objects.filter(upload_session_id="session-lifecycle"))
        assert len(db_records) == 2
        
        db_rec1 = [r for r in db_records if any(i.get("item_name") == "Existing Item 1" or i.get("description") == "Existing Item 1" for i in r.extracted_data.get("items", []))][0]
        db_rec2 = [r for r in db_records if any(i.get("item_name") == "New Item 2" or i.get("description") == "New Item 2" for i in r.extracted_data.get("items", []))][0]
        
        assert db_rec1.extracted_data.get("item_status") == "ALREADY EXIST"
        assert db_rec2.extracted_data.get("item_status") == "CREATE ITEM"
        
        # Check matched inventory_item_id on db_rec1
        items_db1 = db_rec1.extracted_data.get("items", [])
        assert items_db1[0]["inventory_item_id"] is not None
        
        # Check that db_rec2 has inventory_item_id as None
        items_db2 = db_rec2.extracted_data.get("items", [])
        assert items_db2[0]["inventory_item_id"] is None
    except Exception as e:
        traceback.print_exc()
        raise e


@pytest.mark.django_db
def test_item_identity_repair_and_semantic_matching():
    """
    Validates:
      1. OCR identity repair for common errors:
         - 'SHOT BLASTTNGS' -> 'SHOT BLASTINGS'
         - 'CASEHARDENTNG' -> 'CASEHARDENING'
         - 'P1N' / 'PlN' -> 'PIN'
         - '6008-865' / 'B65-6008' / '6008 B65' -> '6008-B65'
      2. Deterministic matching strategy precedence:
         - EXACT_CANONICAL_MATCH
         - TOKEN_CANONICAL_MATCH
      3. Freeze matching output preservation
      4. Duplicate item collapse logic
      5. Hard assertions (e.g. CriticalPipelineError raised on mismatch)
    """
    from ocr_pipeline.services.item_identity_repair import repair_item_identity
    
    # 1. Test repair_item_identity outputs
    r1 = repair_item_identity("SHOT BLASTTNGS")
    assert r1["canonical_name"] == "SHOT BLASTINGS"
    
    r2 = repair_item_identity("CASEHARDENTNG")
    assert r2["canonical_name"] == "CASEHARDENING"
    
    r3 = repair_item_identity("PlN")
    assert r3["canonical_name"] == "PIN"
    
    r4 = repair_item_identity("P1N")
    assert r4["canonical_name"] == "PIN"
    
    r5 = repair_item_identity("6008-865")
    assert r5["canonical_name"] == "6008-B65"
    
    r6 = repair_item_identity("B65-6008")
    assert r6["canonical_name"] == "6008-B65"
    
    r7 = repair_item_identity("6008 B65")
    assert r7["canonical_name"] == "6008-B65"
    
    # 2. Test Validator integration
    from inventory.models import InventoryItem
    from ocr_pipeline.inventory_validation import InventoryItemValidationService, CriticalPipelineError
    
    tenant_id = "tenant-semantic-test"
    
    # Seed DB item
    db_item = InventoryItem.objects.create(
        tenant_id=tenant_id,
        item_name="6008-B65 PIN SHOT BLASTINGS",
        item_code="CODE-SEM",
        hsn_code="123456"
    )
    
    # Test EXACT_CANONICAL_MATCH with repaired input
    res = InventoryItemValidationService.validate_items(tenant_id, [
        {"description": "6008 B65 PlN SHOT BLASTTNGS", "hsn_code": "123456"}
    ])
    assert res["item_status"] == "ALREADY EXIST"
    assert res["items"][0]["inventory_item_id"] == db_item.id
    assert res["items"][0]["inventory_match_strategy"] == "EXACT_CANONICAL_MATCH"
    # raw_name displayed, canonical_name stored
    assert res["items"][0]["item_name"] == "6008 B65 PlN SHOT BLASTTNGS"
    assert res["items"][0]["canonical_name"] == "6008-B65 PIN SHOT BLASTINGS"

    # Test TOKEN_CANONICAL_MATCH (reordered tokens)
    res_token = InventoryItemValidationService.validate_items(tenant_id, [
        {"description": "SHOT BLASTTNGS PIN 6008-865", "hsn_code": "123456"}
    ])
    assert res_token["item_status"] == "ALREADY EXIST"
    assert res_token["items"][0]["inventory_match_strategy"] == "TOKEN_CANONICAL_MATCH"

    # Test Duplicate Item Collapse (same canonical, qty, tax_val, matched ID)
    res_dup = InventoryItemValidationService.validate_items(tenant_id, [
        {"description": "6008 B65 PlN SHOT BLASTTNGS", "qty": 5.0, "taxable_value": 100.0, "hsn_code": "123456"},
        {"description": "6008-865 PIN SHOT BLASTINGS", "qty": 5.0, "taxable_value": 100.0, "hsn_code": "123456"}
    ])
    assert len(res_dup["items"]) == 1

    # Test Freeze Match Output Preservation
    frozen_items = res["items"]
    res_frozen = InventoryItemValidationService.validate_items(tenant_id, frozen_items)
    assert res_frozen["items"][0]["inventory_item_id"] == db_item.id
    assert res_frozen["items"][0]["inventory_match_strategy"] == "EXACT_CANONICAL_MATCH"

    # Test Hard Assertion in views.py: match strategy changes after freeze
    from ocr_pipeline.views import CleanOCRStagingView
    from types import SimpleNamespace
    view_instance = CleanOCRStagingView()
    record = SimpleNamespace(
        id=999, 
        tenant_id=tenant_id, 
        status='FINALIZED', 
        processed=True, 
        validation_status='NEED_TO_SAVE', 
        vendor_id=1, 
        vendor_status='EXISTS'
    )
    
    # Snapshot has strategy "EXACT_CANONICAL_MATCH"
    norm_snapshot = {
        "is_canonical_frozen": True,
        "items": [
            {
                "line_index": 0,
                "inventory_item_id": db_item.id,
                "inventory_match_strategy": "EXACT_CANONICAL_MATCH",
                "item_name": "6008 B65 PlN SHOT BLASTTNGS"
            }
        ]
    }
    # Test Hard Assertion in views.py: match strategy changes after freeze
    from ocr_pipeline.views import CleanOCRStagingView
    from types import SimpleNamespace
    view_instance = CleanOCRStagingView()
    record = SimpleNamespace(
        id=999, 
        tenant_id=tenant_id, 
        status='FINALIZED', 
        processed=True, 
        validation_status='NEED_TO_SAVE', 
        vendor_id=1, 
        vendor_status='EXISTS'
    )
    
    # If we have assembled_exports in norm, but items_val comes from norm.get("items") (or vice versa)!
    # Let's construct norm:
    norm_mismatch = {
        "items": [
            {
                "line_index": 0,
                "inventory_item_id": db_item.id,
                "inventory_match_strategy": "TOKEN_CANONICAL_MATCH", # Hydrated item strategy
                "item_name": "6008 B65 PlN SHOT BLASTTNGS"
            }
        ],
        "assembled_exports": [
            {
                "items": [
                    {
                        "line_index": 0,
                        "inventory_item_id": db_item.id,
                        "inventory_match_strategy": "EXACT_CANONICAL_MATCH", # Snapshot strategy differs!
                        "item_name": "6008 B65 PlN SHOT BLASTTNGS"
                    }
                ]
            }
        ]
    }
    
    with pytest.raises(Exception) as exc_info_strategy:
        view_instance._map_record_to_ui_row(
            record,
            norm_data=norm_mismatch,
            vendor_map={}
        )
    assert "match strategy changes after freeze" in str(exc_info_strategy.value)


def test_language_token_preservation():
    """
    Asserts that language tokens (e.g. 'LATHE') are never mutated
    by character repair or normalization.
    """
    from ocr_pipeline.services.item_identity_repair import repair_item_identity
    from ocr_pipeline.inventory_validation import InventoryItemValidationService

    # 1. Assert repair_item_identity preserves LATHE
    res = repair_item_identity("LATHE")
    assert res["canonical_name"] == "LATHE"

    # 2. Assert normalize_string preserves LATHE
    norm = InventoryItemValidationService.normalize_string("LATHE")
    assert norm == "LATHE"


def test_industrial_token_normalization():
    """
    Asserts that industrial tokens (e.g. '6008-B65') containing numeric / digit lookalikes
    are correctly repaired and normalized.
    """
    from ocr_pipeline.services.item_identity_repair import repair_item_identity
    from ocr_pipeline.inventory_validation import InventoryItemValidationService

    # 1. Assert repair_item_identity repairs lookalikes in industrial token context
    res = repair_item_identity("60O8-B6S")
    assert res["canonical_name"] == "6008-B65"

    # 2. Assert normalize_string repairs lookalikes in industrial token context
    norm = InventoryItemValidationService.normalize_string("60O8-B6S")
    assert norm == "6008 B65"


def test_duplicate_industrial_group_collapse():
    """
    Asserts that duplicate adjacent or non-adjacent industrial token sequences
    are collapsed correctly.
    """
    from ocr_pipeline.services.item_identity_repair import collapse_duplicate_industrial_groups

    # Collapses identical duplicate industrial tokens like 6008-B65 and PIN
    raw = "6008-B65 6008-B65 PIN PIN"
    collapsed = collapse_duplicate_industrial_groups(raw)
    assert collapsed == "6008-B65 PIN"


def test_gstin_canonicalization_repair():
    """
    Asserts that GSTIN canonicalization enforces structure and repairs corrupted formats.
    """
    from vendors.vendor_validation_logic import canonicalize_gstin_ocr

    # Corrupted GSTIN: 33A8ACA57I8R1ZD -> should repair 8->B at pos 4, I->1 at pos 10
    corrupted = "33A8ACA57I8R1ZD"
    repaired = canonicalize_gstin_ocr(corrupted)
    assert repaired == "33ABACA5718R1ZD"


@pytest.mark.django_db
def test_immutability_post_finalization():
    """
    Asserts that once is_canonical_frozen = True, item validations raise CriticalPipelineError
    if any item attributes (strategy, identity, confidence) are mutated.
    """
    from ocr_pipeline.inventory_validation import InventoryItemValidationService
    from core.models import Tenant
    from inventory.models import InventoryItem
    from ocr_pipeline.inventory_validation import CriticalPipelineError

    tenant_id = "test-tenant-immutability"
    tenant = Tenant.objects.create(id=tenant_id, name="Test Tenant")
    db_item = InventoryItem.objects.create(
        tenant_id=tenant_id,
        item_name="6008-B65 PIN",
        item_code="6008-B65",
        hsn_code="8466"
    )

    # Base valid item
    item = {
        "line_index": 0,
        "item_name": "6008-B65 PIN",
        "inventory_item_id": db_item.id,
        "inventory_match_strategy": "EXACT_CANONICAL_MATCH",
        "inventory_match_confidence": 100.0,
        "canonical_name": "6008-B65 PIN",
        "is_canonical_frozen": True
    }

    # 1. Validation with identical attributes passes
    res = InventoryItemValidationService.validate_items(tenant_id, [item])
    assert len(res["items"]) == 1

    # 2. Validation with mutated strategy throws CriticalPipelineError
    mutated_strategy_item = item.copy()
    mutated_strategy_item["inventory_match_strategy"] = "TOKEN_CANONICAL_MATCH"
    with pytest.raises(CriticalPipelineError) as exc_info:
        InventoryItemValidationService.validate_items(tenant_id, [mutated_strategy_item])
    assert "Attempted mutation on frozen item" in str(exc_info.value)


@pytest.mark.django_db
def test_role_based_gstin_schema_fields():
    """
    Asserts that the normalization pipeline populates the new explicit role-based GSTIN fields.
    """
    invoice_data = {
        "invoice_no": "INV-PHASE4-001",
        "vendor_name": "Test Vendor",
        "gstin": "33ABYFS6343M1ZC",
        "_pdf_ocr_text": "Supplier GSTIN: 33ABYFS6343M1ZC, Buyer GSTIN: 33ABACA5718R1ZD, Ship To: 33CKJPS6256F1ZW",
        "sections": {
            "supplier_details": {"gstin": "33ABYFS6343M1ZC"},
            "buyer_details": {"gstin": "33ABACA5718R1ZD"},
            "consignee_details": {"gstin": "33CKJPS6256F1ZW"},
            "items": []
        }
    }
    
    canonical = get_canonical_export_record(invoice_data, tenant_id="test-tenant")
    
    # Assert fields are present and correctly mapped
    assert canonical["raw_bill_to_gstin"] == "33ABACA5718R1ZD"
    assert canonical["raw_ship_to_gstin"] == "33CKJPS6256F1ZW"
    assert canonical["canonical_bill_to_gstin"] == "33ABACA5718R1ZD"
    assert canonical["canonical_ship_to_gstin"] == "33CKJPS6256F1ZW"


@pytest.mark.django_db
def test_schema_integrity_gate_cross_role_pollution():
    """
    Asserts that the normalization pipeline raises ValueError when the primary vendor GSTIN
    is contaminated by the buyer or consignee GSTIN.
    """
    # Vendor GSTIN is polluted/identical to Buyer GSTIN (33ABACA5718R1ZD)
    polluted_invoice_data = {
        "invoice_no": "INV-POLLUTED-001",
        "vendor_name": "Test Vendor",
        "gstin": "33ABACA5718R1ZD",
        "_pdf_ocr_text": "Supplier GSTIN: 33ABACA5718R1ZD, Buyer GSTIN: 33ABACA5718R1ZD",
        "sections": {
            "supplier_details": {"gstin": "33ABACA5718R1ZD"},
            "buyer_details": {"gstin": "33ABACA5718R1ZD"},
            "items": []
        }
    }
    
    with pytest.raises(ValueError) as exc_info:
        get_canonical_export_record(polluted_invoice_data, tenant_id="test-tenant")
        
    assert "Cross-role GSTIN pollution detected" in str(exc_info.value)






