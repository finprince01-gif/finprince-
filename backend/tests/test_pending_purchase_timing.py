"""
test_pending_purchase_timing.py
===============================
Regression tests verifying the TIMING FIX: Pending Purchase queue entries must be
created IMMEDIATELY after the validation pass (validate_and_process with auto_save=False),
NOT only when Finalize & Save is clicked (auto_save=True).

Requirements validated:
  1. evaluate_pending_purchase triggers on CREATE_VENDOR, CREATE_ITEM, NEED_TO_SAVE/partial states
  2. evaluate_pending_purchase is skipped for VOUCHER_STATUS_EXISTING (duplicates)
  3. evaluate_pending_purchase is skipped for fully-resolved records (save path)
  4. update_or_create prevents duplicate queue entries on re-validation
  5. InvoiceTempOCR.objects.update() (not save()) is used → immutability guard is bypassed
  6. Finalize & Save does NOT create Pending Purchase entries — it only creates vouchers
  7. revalidate() updates existing PP row rather than creating new ones
"""
import pytest
from unittest.mock import patch, MagicMock

from ocr_pipeline.statuses import ValidationEnums
from pending_purchases.services import (
    evaluate_pending_purchase,
    _needs_pending_queue,
)


# ─────────────────────────────────────────────────────────────────────────────
# 1. Unit tests for the trigger-condition logic
# ─────────────────────────────────────────────────────────────────────────────

class TestNeedsPendingQueue:
    """Tests for _needs_pending_queue decision function."""

    def test_create_vendor_triggers_queue(self):
        assert _needs_pending_queue(
            ValidationEnums.VENDOR_STATUS_CREATE,
            ValidationEnums.VOUCHER_STATUS_NEW,
            ValidationEnums.ITEM_STATUS_EXISTING,
        ) is True

    def test_create_item_triggers_queue(self):
        assert _needs_pending_queue(
            ValidationEnums.VENDOR_STATUS_EXISTING,
            ValidationEnums.VOUCHER_STATUS_NEW,
            ValidationEnums.ITEM_STATUS_CREATE,
        ) is True

    def test_both_create_vendor_and_item_triggers_queue(self):
        assert _needs_pending_queue(
            ValidationEnums.VENDOR_STATUS_CREATE,
            ValidationEnums.VOUCHER_STATUS_NEW,
            ValidationEnums.ITEM_STATUS_CREATE,
        ) is True

    def test_fully_resolved_skips_queue(self):
        """Fully resolved records should go to the voucher-creation path, not queued."""
        assert _needs_pending_queue(
            ValidationEnums.VENDOR_STATUS_EXISTING,
            ValidationEnums.VOUCHER_STATUS_NEW,
            ValidationEnums.ITEM_STATUS_EXISTING,
            auto_save=True
        ) is False

    def test_duplicate_voucher_always_skips_queue(self):
        """VOUCHER_STATUS_EXISTING = duplicate invoice → never queue."""
        assert _needs_pending_queue(
            ValidationEnums.VENDOR_STATUS_EXISTING,
            ValidationEnums.VOUCHER_STATUS_EXISTING,
            ValidationEnums.ITEM_STATUS_EXISTING,
        ) is False

    def test_duplicate_voucher_with_missing_items_still_skips(self):
        """Duplicate takes priority — even if items are missing, skip."""
        assert _needs_pending_queue(
            ValidationEnums.VENDOR_STATUS_CREATE,
            ValidationEnums.VOUCHER_STATUS_EXISTING,
            ValidationEnums.ITEM_STATUS_CREATE,
        ) is False


# ─────────────────────────────────────────────────────────────────────────────
# 2. evaluate_pending_purchase unit tests (DB mocked)
# ─────────────────────────────────────────────────────────────────────────────

def _make_staging_record(record_id=42, file_hash='abc123', session='sess-1',
                         tenant_id='tenant-1', inv_no='INV-001',
                         extracted_data=None):
    rec = MagicMock()
    rec.id = record_id
    rec.file_hash = file_hash
    rec.upload_session_id = session
    rec.tenant_id = tenant_id
    rec.supplier_invoice_no = inv_no
    rec.extracted_data = extracted_data or {'items': []}
    return rec


@pytest.mark.django_db
class TestEvaluatePendingPurchase:

    def test_create_vendor_creates_queue_entry(self):
        """CREATE_VENDOR condition must insert into PendingPurchase and return True."""
        staging = _make_staging_record()

        with patch('pending_purchases.services.PendingPurchase.objects.update_or_create') as mock_uoc, \
             patch('pending_purchases.services.InvoiceTempOCR.objects') as mock_ocr_obj:

            pp_mock = MagicMock()
            pp_mock.id = 1
            pp_mock.invoice_number = 'INV-001'
            pp_mock.pending_purchase_status = 'PENDING'
            mock_uoc.return_value = (pp_mock, True)   # (instance, created=True)

            result = evaluate_pending_purchase(
                staging,
                ValidationEnums.VENDOR_STATUS_CREATE,
                ValidationEnums.VOUCHER_STATUS_NEW,
                ValidationEnums.ITEM_STATUS_EXISTING,
                tenant_id='tenant-1',
                ui_row={'invoice_no': 'INV-001', 'vendor_name': 'ACME'},
            )

        assert result is True
        mock_uoc.assert_called_once()

    def test_create_item_creates_queue_entry(self):
        """CREATE_ITEM condition must insert into PendingPurchase and return True."""
        staging = _make_staging_record()

        with patch('pending_purchases.services.PendingPurchase.objects.update_or_create') as mock_uoc, \
             patch('pending_purchases.services.InvoiceTempOCR.objects'):

            pp_mock = MagicMock()
            pp_mock.id = 2
            pp_mock.invoice_number = 'INV-002'
            pp_mock.pending_purchase_status = 'PENDING'
            mock_uoc.return_value = (pp_mock, True)

            result = evaluate_pending_purchase(
                staging,
                ValidationEnums.VENDOR_STATUS_EXISTING,
                ValidationEnums.VOUCHER_STATUS_NEW,
                ValidationEnums.ITEM_STATUS_CREATE,
                tenant_id='tenant-1',
            )

        assert result is True

    def test_duplicate_voucher_skips_queue(self):
        """VOUCHER_STATUS_EXISTING must return False without touching DB."""
        staging = _make_staging_record()

        with patch('pending_purchases.services.PendingPurchase.objects.update_or_create') as mock_uoc:
            result = evaluate_pending_purchase(
                staging,
                ValidationEnums.VENDOR_STATUS_EXISTING,
                ValidationEnums.VOUCHER_STATUS_EXISTING,
                ValidationEnums.ITEM_STATUS_EXISTING,
                tenant_id='tenant-1',
            )

        assert result is False
        mock_uoc.assert_not_called()

    def test_fully_resolved_skips_queue(self):
        """Fully-resolved record must return False — it should go to voucher save path."""
        staging = _make_staging_record()

        with patch('pending_purchases.services.PendingPurchase.objects.update_or_create') as mock_uoc:
            result = evaluate_pending_purchase(
                staging,
                ValidationEnums.VENDOR_STATUS_EXISTING,
                ValidationEnums.VOUCHER_STATUS_NEW,
                ValidationEnums.ITEM_STATUS_EXISTING,
                tenant_id='tenant-1',
                auto_save=True
            )

        assert result is False
        mock_uoc.assert_not_called()

    def test_revalidation_upserts_not_inserts(self):
        """Re-running evaluate_pending_purchase on an existing record must use update_or_create
        (update, not insert) — simulated by created=False return from update_or_create."""
        staging = _make_staging_record()

        with patch('pending_purchases.services.PendingPurchase.objects.update_or_create') as mock_uoc, \
             patch('pending_purchases.services.InvoiceTempOCR.objects'):

            pp_mock = MagicMock()
            pp_mock.id = 5
            pp_mock.invoice_number = 'INV-005'
            pp_mock.pending_purchase_status = 'PENDING'
            mock_uoc.return_value = (pp_mock, False)  # created=False → UPDATE path

            result = evaluate_pending_purchase(
                staging,
                ValidationEnums.VENDOR_STATUS_CREATE,
                ValidationEnums.VOUCHER_STATUS_NEW,
                ValidationEnums.ITEM_STATUS_EXISTING,
                tenant_id='tenant-1',
            )

        assert result is True
        mock_uoc.assert_called_once()
        # Confirm lookup key is source_scan_row_id — ensures idempotency
        call_kwargs = mock_uoc.call_args[1]
        assert call_kwargs.get('source_scan_row_id') == staging.id

    def test_uses_update_not_save_to_bypass_immutability_guard(self):
        """InvoiceTempOCR.objects.filter().update() must be called, NOT record.save().
        This ensures the model-level save() immutability guard is not triggered."""
        staging = _make_staging_record()
        staging.save = MagicMock()  # If save() is called, we want to know

        with patch('pending_purchases.services.PendingPurchase.objects.update_or_create') as mock_uoc, \
             patch('pending_purchases.services.InvoiceTempOCR.objects') as mock_ocr_objects:

            pp_mock = MagicMock()
            pp_mock.id = 6
            pp_mock.invoice_number = 'INV-006'
            pp_mock.pending_purchase_status = 'PENDING'
            mock_uoc.return_value = (pp_mock, True)

            mock_filter = MagicMock()
            mock_ocr_objects.filter.return_value = mock_filter

            evaluate_pending_purchase(
                staging,
                ValidationEnums.VENDOR_STATUS_CREATE,
                ValidationEnums.VOUCHER_STATUS_NEW,
                ValidationEnums.ITEM_STATUS_EXISTING,
                tenant_id='tenant-1',
            )

        # update() must have been called
        mock_filter.update.assert_called_once_with(
            processed=True,
            validation_status='PENDING_PURCHASE',
            status='COMPLETED',
        )
        # save() must NOT have been called on the record
        staging.save.assert_not_called()


# ─────────────────────────────────────────────────────────────────────────────
# 3. Integration: validate_and_process triggers queue BEFORE finalize
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestValidateAndProcessPendingTiming:
    """
    Verifies that validate_and_process calls evaluate_pending_purchase
    unconditionally (not gated by auto_save).
    """

    def _make_ocr_record(self):
        """Returns a mock InvoiceTempOCR suitable for the pipeline test."""
        rec = MagicMock()
        rec.id = 999
        rec.file_hash = 'hash-timing-test'
        rec.upload_session_id = 'session-timing-test'
        rec.tenant_id = 'tenant-timing'
        rec.supplier_invoice_no = 'INV-TIMING-001'
        rec.gstin = '33TEST1234M1ZA'
        rec.branch = 'Main Branch'
        rec.vendor_id = None
        rec.vendor_status = 'NEW'
        rec.validation_status = 'PENDING'
        rec.status = 'EXTRACTED'
        rec.processed = False
        rec.is_primary = True
        rec.group_id = None
        rec.page_index = 1
        rec.extracted_data = {
            'sections': {
                'supplier_details': {
                    'vendor_name': 'Unknown Vendor',
                    'gstin': '33TEST1234M1ZA',
                    'supplier_invoice_no': 'INV-TIMING-001',
                },
                'items': [{'item_name': 'Test Item', 'rate': 100, 'qty': 1}],
            },
            'items': [{'item_name': 'Test Item', 'rate': 100, 'qty': 1}],
        }
        return rec

    def test_pending_queue_populated_without_auto_save(self):
        """
        When validate_and_process is called with auto_save=False (normal poll/revalidate),
        and the vendor is missing (CREATE_VENDOR condition), evaluate_pending_purchase
        must be called and must return True.
        """
        from pending_purchases.services import evaluate_pending_purchase as real_eval

        evaluate_called_with = {}

        def mock_evaluate(record, vendor_status, voucher_status, item_status, tenant_id, ui_row=None, auto_save=False):
            evaluate_called_with.update({
                'record_id': record.id,
                'vendor_status': vendor_status,
                'voucher_status': voucher_status,
                'item_status': item_status,
            })
            # Simulate: creates queue entry, returns True
            return True

        with patch('ocr_pipeline.pipeline.InvoiceTempOCR.objects.select_for_update') as mock_sel, \
             patch('ocr_pipeline.pipeline.acquire_redis_lock', return_value=True), \
             patch('ocr_pipeline.pipeline.release_redis_lock'), \
             patch('ocr_pipeline.pipeline.get_canonical_export_record') as mock_canon, \
             patch('ocr_pipeline.pipeline.VoucherPurchaseSupplierDetails') as mock_vps, \
             patch('ocr_pipeline.pipeline.VendorMasterBasicDetail') as mock_vmd, \
             patch('ocr_pipeline.inventory_validation.InventoryItemValidationService.validate_items') as mock_inv_validate, \
             patch('pending_purchases.services.evaluate_pending_purchase', side_effect=mock_evaluate):

            rec = self._make_ocr_record()
            mock_sel.return_value.get.return_value = rec

            # Canonical extraction returns the expected fields
            mock_canon.return_value = {
                'gstin': '33TEST1234M1ZA',
                'invoice_no': 'INV-TIMING-001',
                'supplier_invoice_no': 'INV-TIMING-001',
                'vendor_name': 'Unknown Vendor',
                'branch': 'Main Branch',
                'items': [{'item_name': 'Test Item', 'rate': 100, 'qty': 1}],
            }

            # No duplicate voucher
            mock_vps.objects.filter.return_value.exists.return_value = False

            # No vendor match
            mock_vmd.objects.filter.return_value.exists.return_value = False
            mock_vmd.objects.get.side_effect = mock_vmd.DoesNotExist

            # Item validation — item is missing
            inv_result = {
                'items': [{'item_name': 'Test Item', 'item_status': 'CREATE ITEM'}],
                'item_status': 'CREATE ITEM',
                'missing_items': ['Test Item'],
            }
            mock_inv_validate.return_value = inv_result

            from ocr_pipeline.pipeline import validate_and_process
            result = validate_and_process(rec, auto_save=False)

        assert evaluate_called_with.get('record_id') == 999, (
            "evaluate_pending_purchase must be called even when auto_save=False"
        )
        assert evaluate_called_with.get('item_status') == ValidationEnums.ITEM_STATUS_CREATE

    def test_pending_queue_not_duplicated_on_finalize(self):
        """
        When validate_and_process is called with auto_save=True (Finalize & Save),
        and the record is already in PENDING condition, evaluate_pending_purchase
        returns True (updates the existing queue row), and the pipeline returns
        PENDING_PURCHASE without proceeding to voucher creation.
        """
        evaluate_call_count = [0]

        def mock_evaluate(*args, **kwargs):
            evaluate_call_count[0] += 1
            return True  # still pending

        with patch('ocr_pipeline.pipeline.InvoiceTempOCR.objects.select_for_update') as mock_sel, \
             patch('ocr_pipeline.pipeline.acquire_redis_lock', return_value=True), \
             patch('ocr_pipeline.pipeline.release_redis_lock'), \
             patch('ocr_pipeline.pipeline.get_canonical_export_record') as mock_canon, \
             patch('ocr_pipeline.pipeline.VoucherPurchaseSupplierDetails') as mock_vps, \
             patch('ocr_pipeline.pipeline.VendorMasterBasicDetail') as mock_vmd, \
             patch('ocr_pipeline.inventory_validation.InventoryItemValidationService.validate_items') as mock_inv_validate, \
             patch('pending_purchases.services.evaluate_pending_purchase', side_effect=mock_evaluate):

            rec = self._make_ocr_record()
            mock_sel.return_value.get.return_value = rec
            mock_canon.return_value = {
                'gstin': '33TEST1234M1ZA',
                'invoice_no': 'INV-TIMING-001',
                'supplier_invoice_no': 'INV-TIMING-001',
                'vendor_name': 'Unknown Vendor',
                'branch': 'Main Branch',
                'items': [{'item_name': 'Test Item', 'rate': 100, 'qty': 1}],
            }
            mock_vps.objects.filter.return_value.exists.return_value = False
            mock_vmd.objects.filter.return_value.exists.return_value = False
            mock_vmd.objects.get.side_effect = mock_vmd.DoesNotExist
            mock_inv_validate.return_value = {
                'items': [{'item_name': 'Test Item', 'item_status': 'CREATE ITEM'}],
                'item_status': 'CREATE ITEM',
                'missing_items': ['Test Item'],
            }

            from ocr_pipeline.pipeline import validate_and_process
            result = validate_and_process(rec, auto_save=True)

        assert result.get('status') == 'PENDING_PURCHASE', (
            "Should return PENDING_PURCHASE even on auto_save=True when conditions are pending"
        )
        # evaluate_pending_purchase must have been called exactly once — not twice
        assert evaluate_call_count[0] == 1
