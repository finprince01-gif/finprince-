"""
bank_upload/views.py
====================

Endpoints:
  POST   /api/bank-upload/upload/         — upload file, extract, save to staging
  GET    /api/bank-upload/sessions/<sid>/ — list rows for a session
  PATCH  /api/bank-upload/rows/<id>/      — update ledger mapping / type
  POST   /api/bank-upload/sessions/<sid>/post/ — finalize: post all mapped rows to vouchers
  DELETE /api/bank-upload/sessions/<sid>/ — clean up staging data

STRICT:
  - Gemini is ONLY called inside upload() via extraction_service
  - Voucher creation delegates 100% to existing PaymentVoucherSerializer /
    ReceiptVoucherSerializer — no voucher logic is duplicated here
  - No accounting logic in this file
"""

import uuid
import re
import logging
import hashlib
from decimal import Decimal
from datetime import timedelta

from django.db import transaction as db_transaction
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt

from rest_framework.views     import APIView           # type: ignore
from rest_framework.response  import Response          # type: ignore
from rest_framework           import status            # type: ignore
from rest_framework.permissions import IsAuthenticated  # type: ignore

from .models      import BankStatementTemp, BankStatementStagingFile
from .serializers import (
    BankStatementTempSerializer,
    BankStatementRowUpdateSerializer,
    BankStatementStagingFileSerializer,
    BankStatementStagingFileDetailSerializer,
)
# Extraction is the ONLY place Gemini is called
from .services.extraction_service import extract_transactions

logger = logging.getLogger('bank_upload.views')


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_tenant_id(request) -> str | None:
    """Resolve tenant_id from the authenticated user (mirrors masters/flow.py)."""
    user = request.user
    # Try attribute set by TenantMiddleware
    tenant_id = getattr(user, 'tenant_id', None)
    if not tenant_id:
        from core.tenant import get_tenant_from_request  # type: ignore
        tenant_id = get_tenant_from_request(request)
    return str(tenant_id) if tenant_id else None


def _require_tenant(request):
    """Return (tenant_id, error_response). error_response is None on success."""
    tid = _get_tenant_id(request)
    if not tid:
        return None, Response(
            {'error': 'Tenant context not found. Please log in again.'},
            status=status.HTTP_403_FORBIDDEN
        )
    return tid, None


def _cleanup_staging(tenant_id):
    """
    AUTO CLEANUP (MANDATORY):
    - Delete records where uploaded_at > 24 hours.
    - Enforce maximum 15 records (FIFO).
    """
    try:
        # 1. Delete older than 15 days
        cutoff = timezone.now() - timedelta(days=15)
        deleted_old, _ = BankStatementStagingFile.objects.filter(
            tenant_id=tenant_id,
            uploaded_at__lt=cutoff
        ).delete()
        if deleted_old:
            logger.info(f"🧹 Cleanup: Deleted {deleted_old} expired staging records.")

        # 2. Enforce max 100 records (FIFO)
        staged_files = BankStatementStagingFile.objects.filter(
            tenant_id=tenant_id
        ).order_by('-uploaded_at')

        count = staged_files.count()
        if count > 100:
            # Get IDs of all but the most recent 100
            to_delete_ids = list(staged_files[100:].values_list('id', flat=True))
            deleted_fifo, _ = BankStatementStagingFile.objects.filter(id__in=to_delete_ids).delete()
            logger.info(f"🧹 Cleanup: Deleted {deleted_fifo} records to enforce max limit (FIFO).")
    except Exception as e:
        logger.error(f"❌ Cleanup failed: {e}")


# ---------------------------------------------------------------------------
# View 1 — Upload & Extract
# ---------------------------------------------------------------------------

class BankUploadView(APIView):
    """
    POST /api/bank-upload/upload/

    Accepts a bank statement file.
    1. Passes it to extraction_service (Gemini).
    2. Saves result to BankStatementStagingFile (STAGING ONLY).
    3. Enforces 15 record limit and 24h TTL.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        tenant_id, err = _require_tenant(request)
        if err:
            return err

        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        bank_ledger_id = request.data.get('bank_ledger_id')
        
        # ── Step 0: Duplicate Detection ──
        file_content = file_obj.read()
        file_obj.seek(0)
        file_hash = hashlib.md5(file_content).hexdigest()

        if BankStatementStagingFile.objects.filter(
            tenant_id=tenant_id,
            file_name=file_obj.name,
            account_id=bank_ledger_id,
            file_hash=file_hash
        ).exists():
            return Response(
                {'error': f"Duplicate upload detected: '{file_obj.name}' has already been uploaded for this account."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # ── Step 0b: Subscription Limit Check ──
        from accounting.utils_subscription import check_subscription_limit
        try:
            check_subscription_limit(request.user)
        except Exception as limit_exc:
            return Response(
                {'error': str(limit_exc), 'code': 'LIMIT_REACHED'},
                status=status.HTTP_402_PAYMENT_REQUIRED
            )

        # ── Step 1: Extract via Gemini ──
        logger.info(f"📤 BankUpload (Staging): tenant={tenant_id}, file={file_obj.name}")
        try:
            rows, metrics = extract_transactions(file_obj)
        except Exception as e:
            logger.error(f"❌ BankUpload Extraction Failed: {e}")
            return Response(
                {'error': f'Extraction Failed: {str(e)}'},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY
            )

        if not rows:
            return Response(
                {'error': 'No transactions could be extracted. Please check the file format.'},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY
            )

        # ── Step 2: Save to STAGING table ──
        try:
            staging_file = BankStatementStagingFile.objects.create(
                tenant_id=tenant_id,
                file_name=file_obj.name,
                account_id=bank_ledger_id,
                transaction_data=rows,
                file_hash=file_hash,
                status='pending',
                expires_at=timezone.now() + timedelta(days=15)
            )
            
            # Trigger cleanup
            _cleanup_staging(tenant_id)

            return Response({
                'message': 'File uploaded and staged successfully.',
                'staging_id': staging_file.id,
                'count': len(rows),
                'metrics': metrics
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"❌ Failed to save staged file: {e}")
            return Response(
                {'error': f'Failed to save staging data: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class BankStagingListView(APIView):
    """
    GET /api/bank-upload/staging/
    Lists all pending bank uploads for the tenant.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant_id, err = _require_tenant(request)
        if err: return err
        
        # Trigger cleanup on every list view to ensure data is fresh
        _cleanup_staging(tenant_id)

        staged_files = BankStatementStagingFile.objects.filter(
            tenant_id=tenant_id
        ).order_by('-uploaded_at')
        
        serializer = BankStatementStagingFileSerializer(staged_files, many=True)
        return Response(serializer.data)


class BankStagingDetailView(APIView):
    """
    GET    /api/bank-upload/staging/<id>/
    DELETE /api/bank-upload/staging/<id>/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        tenant_id, err = _require_tenant(request)
        if err: return err
        
        try:
            staging = BankStatementStagingFile.objects.get(pk=pk, tenant_id=tenant_id)
        except BankStatementStagingFile.DoesNotExist:
            return Response({'error': 'Staging record not found.'}, status=status.HTTP_404_NOT_FOUND)
            
        serializer = BankStatementStagingFileDetailSerializer(staging)
        return Response(serializer.data)

    def delete(self, request, pk):
        tenant_id, err = _require_tenant(request)
        if err: return err
        
        try:
            staging = BankStatementStagingFile.objects.get(pk=pk, tenant_id=tenant_id)
            staging.delete()
            return Response({'message': 'Staging record deleted.'}, status=status.HTTP_200_OK)
        except BankStatementStagingFile.DoesNotExist:
            return Response({'error': 'Staging record not found.'}, status=status.HTTP_404_NOT_FOUND)


class BankStagingProcessView(APIView):
    """
    POST /api/bank-upload/staging/<id>/process/
    
    Processes the staged transactions into the main BankStatementTemp (rows) flow.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        tenant_id, err = _require_tenant(request)
        if err: return err
        
        try:
            staging = BankStatementStagingFile.objects.get(pk=pk, tenant_id=tenant_id)
        except BankStatementStagingFile.DoesNotExist:
            return Response({'error': 'Staging record not found.'}, status=status.HTTP_404_NOT_FOUND)

        if staging.status == 'processed' and staging.session_id:
            # RETURN EXISTING DATA — no need to re-extract or re-create rows
            existing_rows = BankStatementTemp.objects.filter(
                tenant_id=tenant_id,
                session_id=staging.session_id
            ).order_by('date', 'id')
            
            if existing_rows.exists():
                serializer = BankStatementTempSerializer(existing_rows, many=True)
                return Response({
                    'session_id': staging.session_id,
                    'count':      existing_rows.count(),
                    'rows':       serializer.data,
                    'status':     'resumed'
                }, status=status.HTTP_200_OK)
            else:
                # If rows were lost/deleted but file marked processed, reset status to allow re-processing
                staging.status = 'pending'
                staging.session_id = None
                staging.save()

        # ── Step 1: Resolve Bank Ledger ──
        # If not stored in staging, try to get from request
        bank_ledger_id = staging.account_id or request.data.get('bank_ledger_id')
        bank_ledger_name = request.data.get('bank_ledger_name', '')
        
        if not bank_ledger_id:
            # Fallback: look for it if we have a name
            if bank_ledger_name:
                from accounting.models import MasterLedger
                l = MasterLedger.objects.filter(name=bank_ledger_name, tenant_id=tenant_id).first()
                if l: bank_ledger_id = l.id

        # ── Step 2: Push to main flow (BankStatementTemp rows) ──
        session_id = uuid.uuid4().hex
        rows = staging.transaction_data
        staging_rows = []

        try:
            with db_transaction.atomic():
                # Re-use the existing logic for row creation but adapted for the staged data
                # Pre-load existing posted/staged rows for duplicate detection
                existing_keys = self._get_existing_keys(tenant_id)
                batch_keys = set()

                for row in rows:
                    row_obj = self._create_row_from_staged_data(
                        tenant_id, session_id, row, bank_ledger_id, bank_ledger_name, 
                        existing_keys, batch_keys
                    )
                    staging_rows.append(row_obj)
                
                # Mark as processed and store session_id
                staging.status = 'processed'
                staging.session_id = session_id
                staging.save()

            serializer = BankStatementTempSerializer(staging_rows, many=True)
            logger.info(f"✅ BankProcess: session={session_id}, {len(staging_rows)} rows saved")

            return Response({
                'session_id': session_id,
                'count':      len(staging_rows),
                'rows':       serializer.data,
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"❌ Processing failed: {e}")
            return Response({'error': f'Processing failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _get_existing_keys(self, tenant_id):
        existing_qs = BankStatementTemp.objects.filter(
            tenant_id=tenant_id,
        ).exclude(status__in=['draft', 'failed']
        ).values('date', 'amount', 'ref_no')

        keys = set()
        for ex in existing_qs:
            keys.add(self._make_dup_key(ex['date'], ex['amount'], ex['ref_no']))
        return keys

    def _make_dup_key(self, date_val, amount_val, ref_no_val):
        date_s  = str(date_val) if date_val else ''
        amount_s = f"{float(amount_val):.2f}" if amount_val else '0.00'
        ref_s = str(ref_no_val).strip().upper() if ref_no_val else 'NOREFERENCE'
        return (date_s, amount_s, ref_s)

    def _create_row_from_staged_data(self, tenant_id, session_id, row, bank_ledger_id, bank_ledger_name, existing_keys, batch_keys):
        debit  = row.get('debit')
        credit = row.get('credit')

        if debit and float(debit) > 0:
            inferred_type = 'payment'
            amount        = Decimal(str(debit))
        elif credit and float(credit) > 0:
            inferred_type = 'receipt'
            amount        = Decimal(str(credit))
        else:
            inferred_type = 'payment'
            amount        = Decimal('0')

        narration = row.get('narration', '')
        ref_no = row.get('ref_no') or row.get('cheque_no') or row.get('reference_number')
        if ref_no: ref_no = str(ref_no).strip()[:150]

        row_key = self._make_dup_key(row.get('date'), amount, ref_no)
        is_dup = (row_key in existing_keys) or (row_key in batch_keys)
        if not is_dup: batch_keys.add(row_key)

        return BankStatementTemp.objects.create(
            tenant_id        = tenant_id,
            session_id       = session_id,
            date             = row.get('date'),
            narration        = narration,
            voucher_number   = row.get('voucher_number') or row.get('cheque_no'),
            ref_no           = ref_no,
            debit            = Decimal(str(debit))  if debit  else None,
            credit           = Decimal(str(credit)) if credit else None,
            amount           = amount,
            inferred_type    = inferred_type,
            bank_ledger_id   = bank_ledger_id,
            bank_ledger_name = bank_ledger_name,
            status           = 'duplicate' if is_dup else 'draft',
            error_message    = 'Duplicate transaction detected' if is_dup else None,
            raw_data         = row,
            raw_text         = row.get('narration'),
            balance          = row.get('balance'),
        )





# ---------------------------------------------------------------------------
# View 2 — List / Delete session rows
# ---------------------------------------------------------------------------

class BankSessionView(APIView):
    """
    GET    /api/bank-upload/sessions/<session_id>/  — list staging rows
    DELETE /api/bank-upload/sessions/<session_id>/  — delete all staging rows
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, session_id, *args, **kwargs):
        tenant_id, err = _require_tenant(request)
        if err:
            return err

        rows = BankStatementTemp.objects.filter(
            tenant_id=tenant_id,
            session_id=session_id
        ).order_by('date', 'id')

        serializer = BankStatementTempSerializer(rows, many=True)
        return Response({'session_id': session_id, 'rows': serializer.data})

    def delete(self, request, session_id, *args, **kwargs):
        tenant_id, err = _require_tenant(request)
        if err:
            return err

        deleted_count, _ = BankStatementTemp.objects.filter(
            tenant_id=tenant_id,
            session_id=session_id
        ).delete()

        logger.info(f"🗑️  BankSession deleted: session={session_id}, rows={deleted_count}")
        return Response({'deleted': deleted_count}, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# View 3 — Update a single row (ledger mapping / type override)
# ---------------------------------------------------------------------------

class BankRowUpdateView(APIView):
    """
    PATCH /api/bank-upload/rows/<row_id>/

    Allows the user to:
      - Set ledger_id / ledger_name
      - Override inferred_type (payment ↔ receipt)
      - Set bank_ledger_id / bank_ledger_name

    Updates status → 'mapped' when ledger_id is provided.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, row_id, *args, **kwargs):
        tenant_id, err = _require_tenant(request)
        if err:
            return err

        try:
            row = BankStatementTemp.objects.get(pk=row_id, tenant_id=tenant_id)
        except BankStatementTemp.DoesNotExist:
            return Response({'error': 'Row not found.'}, status=status.HTTP_404_NOT_FOUND)

        if row.status == 'posted':
            return Response(
                {'error': 'This row has already been posted. It cannot be modified.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        ser = BankStatementRowUpdateSerializer(data=request.data, partial=True)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        data = ser.validated_data

        if 'ledger_id'       in data: row.ledger_id       = data['ledger_id']
        if 'ledger_name'     in data: row.ledger_name     = data['ledger_name']
        if 'inferred_type'   in data: row.inferred_type   = data['inferred_type']
        if 'bank_ledger_id'  in data: row.bank_ledger_id  = data['bank_ledger_id']
        if 'bank_ledger_name' in data: row.bank_ledger_name = data['bank_ledger_name']
        if 'ref_no'          in data: row.ref_no          = data['ref_no'] or None
        if 'posting_note'    in data: row.posting_note    = data['posting_note'] or ''
        if 'date'            in data: row.date            = data['date']
        if 'narration'       in data: row.narration       = data['narration'] or ''
        if 'amount'          in data: row.amount          = data['amount']

        # Synchronize debit/credit based on inferred_type and amount
        if row.inferred_type == 'payment':
            row.debit = row.amount
            row.credit = None
        else:
            row.credit = row.amount
            row.debit = None

        # Allow manual status override (e.g. un-mark a false-positive duplicate)
        if 'status' in data:
            new_status = data['status']
            # Cannot downgrade an already-posted row
            if row.status != 'posted':
                row.status = new_status
                if new_status in ('draft', 'mapped'):
                    row.error_message = None  # clear duplicate/error message
        elif row.ledger_id and row.status in ('draft', 'duplicate'):
            # Auto-promote to mapped only when user assigns a ledger
            # (don't auto-promote duplicates unless user explicitly re-sets status)
            if row.status == 'draft':
                row.status = 'mapped'

        row.save()
        return Response(BankStatementTempSerializer(row).data)


# ---------------------------------------------------------------------------
# View 4 — Finalize & Post to voucher system
# ---------------------------------------------------------------------------

class BankPostView(APIView):
    """
    POST /api/bank-upload/sessions/<session_id>/post/

    For each staging row WHERE status != 'posted':
      - Skip rows without ledger_id (log warning)
      - IF inferred_type == 'payment'  → PaymentVoucherSerializer
      - IF inferred_type == 'receipt'  → ReceiptVoucherSerializer
      - On success  → status = 'posted',  voucher_id = <id>
      - On failure  → status = 'failed',  error_message = <str>

    DELEGATES 100% to existing voucher serializers.
    No voucher logic lives here.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, session_id, *args, **kwargs):
        tenant_id, err = _require_tenant(request)
        if err:
            return err

        rows = BankStatementTemp.objects.filter(
            tenant_id=tenant_id,
            session_id=session_id,
        ).exclude(status='posted')

        if not rows.exists():
            return Response(
                {'message': 'No rows to post (all are already posted or session is empty).'},
                status=status.HTTP_200_OK
            )

        allocations_data = request.data.get('allocations', [])
        allocations_map  = { a['row_id']: a['allocation'] for a in allocations_data if 'row_id' in a }

        posted  = 0
        failed  = 0
        skipped = 0
        results = []

        for row in rows:
            # 1. Use allocation from request (latest UI state), fallback to saved row data
            allocation = allocations_map.get(row.id) or row.allocation_data
            
            # 2. Validation guards
            if not row.ledger_id:
                skipped += 1
                results.append({
                    'id': row.id, 'status': 'skipped',
                    'reason': 'No ledger mapped'
                })
                continue

            if not row.amount or row.amount <= 0:
                skipped += 1
                results.append({
                    'id': row.id, 'status': 'skipped',
                    'reason': 'Zero or missing amount'
                })
                continue

            if row.status == 'duplicate':
                skipped += 1
                results.append({
                    'id': row.id, 'status': 'skipped',
                    'reason': 'Duplicate transaction — not posted'
                })
                continue

            if row.status == 'posted':
                results.append({'id': row.id, 'status': 'already_posted'})
                continue

            try:
                voucher = _post_row_to_voucher(row, request, tenant_id, allocation)
                row.status     = 'posted'
                row.voucher_id = voucher.id
                row.error_message = None
                if allocation:
                    row.allocation_data = allocation
                    if 'posting_note' in allocation:
                        row.posting_note = allocation['posting_note']
                row.save(update_fields=['status', 'voucher_id', 'error_message', 'allocation_data', 'posting_note', 'updated_at'])
                posted += 1
                results.append({'id': row.id, 'status': 'posted', 'voucher_id': voucher.id})
                logger.info(f"✅ Posted row {row.id} → voucher {voucher.id}")

            except Exception as exc:
                err_str = str(exc)
                row.status        = 'failed'
                row.error_message = err_str
                row.save(update_fields=['status', 'error_message', 'updated_at'])
                failed += 1
                results.append({'id': row.id, 'status': 'failed', 'error': err_str})
                logger.error(f"❌ Failed to post row {row.id}: {exc}", exc_info=True)

        return Response({
            'session_id': session_id,
            'posted':     posted,
            'failed':     failed,
            'skipped':    skipped,
            'results':    results,
        }, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Internal — delegate to existing voucher serializers
# ---------------------------------------------------------------------------

def _post_row_to_voucher(row: BankStatementTemp, request, tenant_id: str, allocation=None):
    """
    Build the complex voucher payload and call the existing serializer.
    If 'allocation' is provided, it maps pending transactions and advances.
    """
    # Ensure tenant_id is on the user object for the serializer to find it
    if not hasattr(request.user, 'tenant_id') or not request.user.tenant_id:
        request.user.tenant_id = tenant_id
    if not hasattr(request.user, 'branch_id') or not request.user.branch_id:
        request.user.branch_id = tenant_id

        from rest_framework.test import APIRequestFactory, force_authenticate
        factory = APIRequestFactory()
        
        is_payment = row.inferred_type == 'payment'
        path = '/api/vouchers/payment-single/save-amount-only/' if is_payment else '/api/vouchers/receipt-single/save-amount-only/'
        
        payload = {
            'amount': str(row.amount),
            'date': row.date.isoformat() if row.date else timezone.now().date().isoformat(),
            'narration': row.narration or f"Bank Posting: {row.bank_ledger_name}",
            'ref_no': row.ref_no,
            'posting_note': (allocation.get('posting_note') if allocation else None) or row.narration,
            'voucher_number': row.voucher_number,
        }
        
        if is_payment:
            payload['pay_from'] = str(row.bank_ledger_id)
            payload['pay_to'] = str(row.ledger_id)
            from accounting.views_payment import PaymentVoucherViewSet
            view = PaymentVoucherViewSet.as_view({'post': 'save_amount_only'})
        else:
            payload['receive_in'] = str(row.bank_ledger_id)
            payload['receive_from'] = str(row.ledger_id)
            from accounting.views_receipt import ReceiptVoucherViewSet
            view = ReceiptVoucherViewSet.as_view({'post': 'save_amount_only'})
            
        mock_request = factory.post(path, payload, format='json')
        # CRITICAL: Force authenticate the internal request
        force_authenticate(mock_request, user=request.user)
        
        response = view(mock_request)
        if response.status_code >= 400:
            raise Exception(f"Amount Only Save Failed: {response.data}")
            
        class DummyVoucher: pass
        v = DummyVoucher()
        v.id = response.data['id']
        return v

    # 1. Prepare Basic Data
    narration = row.narration or f"Bank Posting: {row.bank_ledger_name}"
    date_str  = row.date.isoformat() if row.date else timezone.now().date().isoformat()
    amount    = str(row.amount)

    # ─── Resolve Ledger (Handle Stale/Hierarchy IDs) ───
    from accounting.models import MasterLedger
    resolved_ledger_id = row.ledger_id
    
    if resolved_ledger_id:
        ledger_exists = MasterLedger.objects.filter(id=resolved_ledger_id, tenant_id=tenant_id).exists()
        if not ledger_exists:
            # Fallback 1: Find by Name in this branch
            existing = MasterLedger.objects.filter(name=row.ledger_name, tenant_id=tenant_id).first()
            if existing:
                resolved_ledger_id = existing.id
                logger.info(f"🔄 Resolved broken LedgerID {row.ledger_id} to existing {existing.id} by name '{row.ledger_name}'")
            else:
                # Fallback 2: Auto-create as generic ledger
                try:
                    # Determine a safe category/group
                    # In this system, 'Advertisement expense' etc usually fall under Indirect Expenses
                    new_l = MasterLedger.objects.create(
                        tenant_id=tenant_id,
                        name=row.ledger_name,
                        category='Indirect Expenses',
                        group='Indirect Expenses'
                    )
                    resolved_ledger_id = new_l.id
                    logger.info(f"✨ Auto-created missing ledger '{row.ledger_name}' (ID: {resolved_ledger_id})")
                except Exception as l_err:
                    logger.error(f"❌ Could not auto-create ledger '{row.ledger_name}': {l_err}")

    # Update the row with the resolved ID to prevent repeated failures
    if resolved_ledger_id != row.ledger_id:
        row.ledger_id = resolved_ledger_id
        row.save(update_fields=['ledger_id'])

    party_type = 'ledger'
    party_id_ref = resolved_ledger_id

    logger.info(f"📤 Posting Row {row.id}: LedgerID={resolved_ledger_id}, PartyType={party_type}, IDRef={party_id_ref}")

    if row.inferred_type == 'payment':
        from accounting.serializers_payment import PaymentVoucherSerializer  # type: ignore

        # ─── Build Items List ───
        items = []
        if allocation:
            # 1. Allocated Pending Transactions (Bills/Invoices)
            for txn in allocation.get('pendingTransactions', []):
                pay_amt = txn.get('payment', 0)
                if pay_amt > 0:
                    items.append({
                        'type':           party_type,
                        'id_ref':         party_id_ref,
                        'pay_to_ledger':  resolved_ledger_id,
                        'amount':         str(pay_amt),
                        'amount_applied': str(pay_amt),
                        'reference_type': 'INVOICE',
                        'reference_id':   txn.get('id'),
                        'reference_number': txn.get('referenceNumber'),
                        'narration':      row.narration,
                        'posting_note':   (allocation.get('posting_note') if allocation else None) or narration,
                        'transaction_details': {
                            'reference_number': txn.get('referenceNumber'),
                            'date': txn.get('date'),
                            'status': txn.get('dueStatus'),
                        }
                    })
            
            # 2. Advance Allocation
            adv_amt = allocation.get('advanceAmount', 0)
            if adv_amt > 0:
                items.append({
                    'type':           party_type,
                    'id_ref':         party_id_ref,
                    'pay_to_ledger':  resolved_ledger_id,
                    'amount':         str(adv_amt),
                    'amount_applied': str(adv_amt),
                    'reference_type': 'ADVANCE',
                    'advance_ref_no': allocation.get('advanceRefNo'),
                    'narration':      row.narration,
                    'posting_note':   (allocation.get('posting_note') if allocation else None) or narration,
                })
        
        # 3. Fallback: If no specific allocation, treat as a single ledger entry (unallocated)
        if not items:
            items = [{
                'type':           party_type,
                'id_ref':         party_id_ref,
                'pay_to_ledger':  resolved_ledger_id,
                'amount':         amount,
                'amount_applied': amount,
                'reference_type': 'ON_ACCOUNT',
                'narration':      row.narration,
                'posting_note':   (allocation.get('posting_note') if allocation else None) or narration,
            }]

        payload = {
            'type':           'payment',
            'voucher_type':   allocation.get('voucher_type_id') if allocation else None,
            'voucher_number': allocation.get('voucher_number') if (allocation and 'voucher_number' in allocation) else row.voucher_number,
            'date':           date_str,
            'narration':      narration,
            'ref_no':         row.ref_no,
            'posting_note':   (allocation.get('posting_note') if allocation else None) or narration,
            'pay_from':       str(row.bank_ledger_id) if row.bank_ledger_id else None,
            'amount':         amount,
            'total_amount':   amount,
            'vouch_amount':   amount,
            'items':          items,
        }
        ser = PaymentVoucherSerializer(data=payload, context={'request': request})

    else:  # receipt
        from accounting.serializers_receipt import ReceiptVoucherSerializer  # type: ignore

        # ─── Build Items List ───
        items = []
        if allocation:
            for txn in allocation.get('pendingTransactions', []):
                rcv_amt = txn.get('receipt', 0) or txn.get('payment', 0) # field names vary between P/R
                if rcv_amt > 0:
                    items.append({
                        'customer':       str(resolved_ledger_id),
                        'amount':         str(rcv_amt),
                        'amount_applied': str(rcv_amt),
                        'reference_type': 'INVOICE',
                        'reference_id':   txn.get('id'),
                        'reference_no':   txn.get('referenceNumber'),
                        'narration':      row.narration,
                        'posting_note':   allocation.get('posting_note') or narration,
                        'pending_transaction': {
                            'reference_no': txn.get('referenceNumber'),
                            'date': txn.get('date'),
                            'status': txn.get('dueStatus'),
                        }
                    })
            
            adv_amt = allocation.get('advanceAmount', 0)
            if adv_amt > 0:
                items.append({
                    'customer':       str(resolved_ledger_id),
                    'amount':         str(adv_amt),
                    'amount_applied': str(adv_amt),
                    'reference_type': 'ADVANCE',
                    'advance_ref_no': allocation.get('advanceRefNo'),
                    'narration':      row.narration,
                    'posting_note':   allocation.get('posting_note') or narration,
                })

        # Fallback
        if not items:
            items = [{
                'customer':       str(resolved_ledger_id),
                'amount':         amount,
                'amount_applied': amount,
                'reference_type': 'ON_ACCOUNT',
                'narration':      row.narration,
                'posting_note':   (allocation.get('posting_note') if allocation else None) or narration,
            }]

        payload = {
            'type':           'receipt',
            'voucher_type':   allocation.get('voucher_type_id') if allocation else None,
            'voucher_number': allocation.get('voucher_number') if (allocation and 'voucher_number' in allocation) else row.voucher_number,
            'date':           date_str,
            'narration':      narration,
            'ref_no':         row.ref_no,
            'posting_note':   (allocation.get('posting_note') if allocation else None) or narration,
            'receive_in':     str(row.bank_ledger_id) if row.bank_ledger_id else None,
            'customer':       str(resolved_ledger_id),
            'amount':         amount,
            'total_amount':   amount,
            'vouch_amount':   amount,
            'items':          items,
        }
        ser = ReceiptVoucherSerializer(data=payload, context={'request': request})

    if not ser.is_valid():
        raise ValueError(f"Voucher validation failed: {ser.errors}")

    with db_transaction.atomic():
        voucher = ser.save()


    return voucher
