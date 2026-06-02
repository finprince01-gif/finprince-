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

    # Patch select_for_update, exists, validate_vendor, Branch, and VendorMasterBasicDetail to mock DB
    with patch('ocr_pipeline.models.InvoiceTempOCR.objects.select_for_update') as mock_select, \
         patch('accounting.models_voucher_purchase.VoucherPurchaseSupplierDetails.objects.filter') as mock_voucher_filter, \
         patch('vendors.vendor_validation_logic.validate_vendor') as mock_val_vendor, \
         patch('core.models.Branch.objects.filter') as mock_branch_filter, \
         patch('vendors.models.VendorMasterBasicDetail.objects.filter') as mock_vendor_filter_db:
         
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






