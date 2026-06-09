import pytest
from unittest.mock import patch, MagicMock
from django.test import TestCase

from ocr_pipeline.statuses import ValidationEnums
from pending_purchases.models import PendingPurchase
from ocr_pipeline.models import InvoiceTempOCR
from ocr_pipeline.pipeline import validate_and_process
from ocr_pipeline.inventory_validation import InventoryItemValidationService

@pytest.mark.django_db
class TestRevalidateSynchronization(TestCase):
    def setUp(self):
        # Create a sample staging record
        self.tenant_id = "test-tenant-reval"
        self.staging = InvoiceTempOCR.objects.create(
            tenant_id=self.tenant_id,
            file_hash="reval-hash-123",
            upload_session_id="reval-session-123",
            supplier_invoice_no="INV-REVAL-001",
            gstin="33TEST1234M1ZA",
            branch="Main Branch",
            vendor_id=None,
            vendor_status="NEW",
            validation_status="PENDING",
            status="FINALIZED",
            processed=False,
            is_primary=True,
            voucher_type="PURCHASE",
            extracted_data={
                "sections": {
                    "supplier_details": {
                        "vendor_name": "Test Vendor",
                        "gstin": "33TEST1234M1ZA",
                        "supplier_invoice_no": "INV-REVAL-001",
                        "branch": "Main Branch"
                    }
                },
                "items": [
                    {
                        "line_index": 0,
                        "item_name": "Test Item",
                        "rate": 100.0,
                        "qty": 1.0,
                        "is_canonical_frozen": True,
                        "inventory_item_id": None,
                        "inventory_match_strategy": "CREATE_ITEM",
                        "inventory_match_confidence": 0.0,
                        "inventory_match_level": "New"
                    }
                ]
            }
        )

        # Create a sample PendingPurchase row
        self.pp = PendingPurchase.objects.create(
            company_id=self.tenant_id,
            branch_id=self.tenant_id,
            scan_session_id="reval-session-123",
            source_scan_row_id=self.staging.id,
            source_document_hash="reval-hash-123",
            invoice_number="INV-REVAL-001",
            vendor_status="VENDOR_STATUS_CREATE",
            voucher_status="VOUCHER_STATUS_NEW",
            item_status="ITEM_STATUS_CREATE",
            pending_purchase_status="PENDING"
        )

    def test_revalidate_updates_existing_pp_row_when_resolved(self):
        """
        Verify that manual revalidation resets staging status, executes the pipeline,
        updates record.vendor_id/vendor_status in the DB, and correctly synchronizes
        the PendingPurchase row with new statuses.
        """
        # 1. Setup mock returns for validation engines
        # Assume vendor is now resolved
        mock_vendor = MagicMock()
        mock_vendor.id = 77
        mock_vendor.vendor_name = "Test Vendor"

        # Item is now resolved (matched with an ID)
        inv_result = {
            "items": [
                {
                    "line_index": 0,
                    "item_name": "Test Item",
                    "rate": 100.0,
                    "qty": 1.0,
                    "inventory_item_id": 99,
                    "inventory_match_strategy": "TOKEN_CANONICAL_MATCH",
                    "inventory_match_confidence": 95.0,
                    "inventory_match_level": "Master",
                    "is_canonical_frozen": True
                }
            ],
            "item_status": "ALREADY EXIST",
            "missing_items": []
        }

        with patch('ocr_pipeline.pipeline.InvoiceTempOCR.objects.select_for_update') as mock_sel, \
             patch('ocr_pipeline.pipeline.acquire_redis_lock', return_value=True), \
             patch('ocr_pipeline.pipeline.release_redis_lock'), \
             patch('ocr_pipeline.pipeline.get_canonical_export_record') as mock_canon, \
             patch('ocr_pipeline.pipeline.VoucherPurchaseSupplierDetails') as mock_vps, \
             patch('ocr_pipeline.pipeline.VendorMasterBasicDetail') as mock_vmd, \
             patch('ocr_pipeline.inventory_validation.InventoryItemValidationService.validate_items', return_value=inv_result) as mock_inv:

            # Make select_for_update return our staging record
            mock_sel.return_value.get.return_value = self.staging

            mock_canon.return_value = {
                "gstin": "33TEST1234M1ZA",
                "invoice_no": "INV-REVAL-001",
                "supplier_invoice_no": "INV-REVAL-001",
                "vendor_name": "Test Vendor",
                "branch": "Main Branch",
                "items": [{"item_name": "Test Item", "rate": 100.0, "qty": 1.0}]
            }

            # Mock duplicate check -> False
            mock_vps.objects.filter.return_value.exists.return_value = False

            # Mock vendor master check -> found
            mock_vmd.objects.filter.return_value.first.return_value = mock_vendor
            # Mock get() for fast path
            mock_vmd.objects.get.return_value = mock_vendor

            # We mock build_session_vendor_map to return EXISTING_VENDOR
            with patch('vendors.vendor_validation_logic.build_session_vendor_map') as mock_build_map:
                mock_build_map.return_value = {
                    ("33TEST1234M1ZA", "main branch"): {
                        "status": "EXISTING_VENDOR",
                        "vendor_id": 77
                    }
                }

                # 2. Run validate_and_process
                result = validate_and_process(self.staging, auto_save=False)

        # 3. Assertions
        # Staging vendor_id and vendor_status must be persisted to the DB
        self.staging.refresh_from_db()
        assert self.staging.vendor_id == 77
        assert self.staging.vendor_status == "EXISTS"

        # Staging record should be marked as completed pending purchase
        assert self.staging.processed is True
        assert self.staging.status == "COMPLETED"
        assert self.staging.validation_status == "PENDING_PURCHASE"

        # PendingPurchase row must be updated with the fresh statuses
        self.pp.refresh_from_db()
        assert self.pp.vendor_status == "VENDOR_STATUS_EXISTING"
        assert self.pp.item_status == "ITEM_STATUS_EXISTING"
        assert self.pp.voucher_status == "VOUCHER_STATUS_NEW"
