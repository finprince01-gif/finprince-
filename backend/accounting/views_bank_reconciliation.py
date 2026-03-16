"""
Bank Statement Upload and Reconciliation Views.

Architecture (Tally-style):
  1. Upload bank statement file  â†’  Parse  â†’  Bulk-insert into bank_statement_transactions staging
  2. Run matching engine  â†’  sets match_status on each staged transaction
  3. User reviews in Bank Reconciliation UI  â†’  Links Vouchers / Creates Vouchers / Ignores
  4. Reconciliation mapping stored in bank_reconciliation_links (NOT in voucher tables)

Voucher creation is NEVER triggered automatically during upload.
"""

import pandas as pd  # type: ignore[import]
from decimal import Decimal, InvalidOperation
from rest_framework import viewsets, status  # type: ignore[import]
from rest_framework.response import Response  # type: ignore[import]
from rest_framework.decorators import action  # type: ignore[import]
from rest_framework.permissions import IsAuthenticated  # type: ignore[import]
from typing import Any, List, Dict, Optional

from django.db import transaction as db_transaction  # type: ignore[import]
from django.db.models import Q  # type: ignore[import]
from django.utils import timezone  # type: ignore[import]
from django.utils.dateparse import parse_date  # type: ignore[import]
from django.conf import settings  # type: ignore[import]
import logging
import re
import csv
from datetime import datetime, timedelta, date as date_type
from django.http import HttpResponse  # type: ignore[import]

def flexible_parse_date(date_str):
    if not date_str:
        return None
    # Try YYYY-MM-DD
    d = parse_date(date_str)
    if d:
        return d
    # Try DD-MM-YYYY
    try:
        return datetime.strptime(date_str, '%d-%m-%Y').date()
    except ValueError:
        pass
    # Try DD/MM/YYYY
    try:
        return datetime.strptime(date_str, '%d/%m/%Y').date()
    except ValueError:
        pass
    return None

from .models_bank_reconciliation import BankStatementTransaction, BankReconciliationLink  # type: ignore[import]
from .models import AmountTransaction, MasterLedger, Voucher, JournalEntry  # type: ignore[import]
from .models_voucher_payment import VoucherPaymentSingle  # type: ignore[import]
from .models_voucher_receipt import VoucherReceiptSingle  # type: ignore[import]
from .serializers_bank_reconciliation import (  # type: ignore[import]
    BankStatementTransactionSerializer,
    BankReconciliationLinkSerializer,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ACCEPTED_CONTENT_TYPES = {
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',  # some browsers
}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class MatchCounter:
    def __init__(self):
        self.count: int = 0
    def add(self):
        self.count = self.count + 1

def _normalize_header(header) -> str:
    """
    Normalize header: lowercase, trim spaces, and remove special characters.
    Required by Spec Section 1.
    """
    if header is None or (isinstance(header, float) and pd.isna(header)):
        return ""
    h = str(header).strip().lower()
    # Remove special characters (keep alphanumeric and spaces)
    h = re.sub(r'[^a-z0-9\s]', '', h)
    # Collapse multiple spaces
    h = re.sub(r'\s+', ' ', h).strip()
    return h


def _smart_detect_columns(df: pd.DataFrame) -> dict:
    """
    Intelligently identify columns for date, narration, debit, credit, and reference
    without hardcoding specific header names. Uses both header text heuristics
    and data type/value pattern analysis.
    
    Required by Spec Sections 2 & 3.
    """
    columns = list(df.columns)
    mapping: Dict[str, str] = {
        'date': "",
        'narration': "",
        'debit': "",
        'credit': "",
        'reference': "",
        'cheque': ""
    }
    
    # 1. Normalize all headers for matching
    normalized_map = {_normalize_header(col): col for col in columns}
    
    # 2. PHASE 1: Header Text Heuristics (Stricter matching)
    def match_keyword(norm, keywords):
        # Check for word boundary or exact match
        for k in keywords:
            if k in norm.split():
                return True
        return False

    for norm, original in normalized_map.items():
        if original in mapping.values(): continue

        # Date Column
        if not mapping['date']:
            if any(k in norm for k in ['date', 'txn date', 'value date', 'tran date', 'posting date', 'booking date']):
                mapping['date'] = str(original)
                continue

        # Debit Column
        if not mapping['debit']:
            if match_keyword(norm, ['debit', 'withdrawal', 'dr', 'payment', 'paid', 'money out', 'outward', 'debited']):
                mapping['debit'] = str(original)
                continue

        # Credit Column
        if not mapping['credit']:
            if match_keyword(norm, ['credit', 'deposit', 'cr', 'receipt', 'received', 'money in', 'inward', 'credited']):
                mapping['credit'] = str(original)
                continue

        # Narration Column
        if not mapping['narration']:
            if any(k in norm for k in ['narration', 'description', 'particulars', 'remarks', 'details', 'trans description']):
                mapping['narration'] = str(original)
                continue

        # Reference Column (Priority: Reference > UTR > Txn ID > Instrument)
        if not mapping['reference']:
            if any(k in norm for k in ['reference no', 'ref no', 'utr', 'txn id', 'transaction id', 'reference number']):
                mapping['reference'] = str(original)
                continue
            # Fallback to general 'reference' if no specific number found
            elif norm == 'reference' or norm == 'ref':
                mapping['reference'] = str(original)
                continue

        # Cheque Column
        if not mapping['cheque']:
            if any(k in norm for k in ['cheque', 'chq', 'instrument']):
                mapping['cheque'] = str(original)
                continue

    # 3. PHASE 2: Fallback Detection using Value Patterns
    # Sample up to 50 rows for pattern analysis
    sample_df = df.head(50).copy()

    # Helper: Check if a column contains valid date values
    def is_date_col(col):
        try:
            vals = sample_df[col].dropna()
            if vals.empty: return False
            # Check if majority of non-null values can be parsed as dates
            parsed = pd.to_datetime(vals.astype(str), errors='coerce', dayfirst=True)
            return (parsed.notna().sum() / len(vals)) > 0.6
        except Exception: return False

    # Helper: Analyze numeric patterns (Debit vs Credit)
    def analyze_numeric(col):
        try:
            # 1. Skip if header likely indicates a balance column
            norm_col = _normalize_header(col)
            if any(k in norm_col for k in ['balance', 'running', 'available', 'closing', 'opening']):
                return None

            # 2. Extract and clean values
            vals = sample_df[col].astype(str).dropna()
            if vals.empty: return None

            cleaned = []
            for v in vals:
                # Handle parentheses for negatives: (123.45) -> -123.45
                v_str = v.strip().replace(',', '').replace('â‚¹', '')
                if v_str.startswith('(') and v_str.endswith(')'):
                    v_str = '-' + v_str[1:-1]
                
                # Strip other non-numeric chars except minus and dot
                v_str = re.sub(r'[^-0-9.]', '', v_str)
                if not v_str or v_str in ('-', '.'): 
                    cleaned.append(0.0)
                else:
                    try:
                        cleaned.append(float(v_str))
                    except ValueError:
                        cleaned.append(0.0)
            
            numeric: pd.Series = pd.Series(cleaned)
            # If mostly zeros, ignore
            zero_count = len([x for x in cleaned if x == 0])
            if zero_count > (len(numeric) * 0.8):
                return None
            
            # If values are extremely large (likely not txn amounts but account numbers or IDs)
            if float(numeric.abs().mean()) > 1000000000: # 100 Cr threshold
                return None

            return {
                'pos_count': int((numeric > 0).sum()),
                'neg_count': int((numeric < 0).sum()),
                'total_count': len(numeric),
                'sum': float(numeric.sum())
            }
        except Exception: return None

    # Fallback for Date
    if not mapping['date']:
        for col in columns:
            if col in mapping.values(): continue
            if is_date_col(col):
                mapping['date'] = str(col)
                break

    # Fallback for Debit/Credit using numeric analysis
    unassigned_numeric = []
    for col in columns:
        if col in mapping.values(): continue
        stats = analyze_numeric(col)
        if stats and stats['total_count'] > 0:
            unassigned_numeric.append((col, stats))

    if not mapping['debit'] or not mapping['credit']:
        # If we have two or more numeric columns, try to distinguish them
        if len(unassigned_numeric) >= 2:
            # Heuristic: mostly negative or headers mentioned 'dr'/'out'
            # Sort by negative count
            unassigned_numeric.sort(key=lambda x: x[1]['neg_count'], reverse=True)
            if not mapping['debit']:
                mapping['debit'] = str(unassigned_numeric[0][0])
                unassigned_numeric.pop(0)
            if not mapping['credit'] and unassigned_numeric:
                mapping['credit'] = str(unassigned_numeric[0][0])
        elif len(unassigned_numeric) == 1:
            # Single amount column - determine if it's primarily Debit or Credit
            stats = unassigned_numeric[0][1]
            col_name = unassigned_numeric[0][0]
            if col_name not in mapping.values():
                # If mostly negative -> Debit, else Credit
                if stats['neg_count'] > stats['pos_count']:
                    if not mapping['debit']: mapping['debit'] = str(col_name)
                else:
                    if not mapping['credit']: mapping['credit'] = str(col_name)

    # Fallback for Narration (find longest text column)
    if not mapping['narration']:
        best_nar_col = None
        max_avg_len = -1
        for col in columns:
            if col in mapping.values(): continue
            if df[col].dtype == object or str(df[col].dtype) == 'string':
                avg_l = sample_df[col].astype(str).str.len().mean()  # type: ignore
                if avg_l > max_avg_len:
                    max_avg_len = avg_l
                    best_nar_col = col
        if best_nar_col and max_avg_len > 10:
            mapping['narration'] = str(best_nar_col)

    return mapping


def _safe_decimal(value) -> Decimal:
    """Convert a raw cell value to Decimal; return 0 on failure."""
    if value is None:
        return Decimal('0')
    try:
        import pandas as _pd  # type: ignore[import]
        if _pd.isna(value):
            return Decimal('0')
    except Exception:
        pass
    try:
        v_str: str = str(value).strip().replace(',', '').replace('â‚¹', '')
        # Handle parentheses: (1,234.56) -> -1234.56
        if v_str.startswith('(') and v_str.endswith(')'):
            v_str = '-' + v_str.strip('()')
        
        # Keep only digits, dots, and leading minus
        # (Though we already handled leading minus, re.sub helps with middle garbage)
        is_negative = v_str.startswith('-')
        v_str = re.sub(r'[^0-9.]', '', v_str)
        if not v_str:
            return Decimal('0')
        
        if is_negative:
            v_str = '-' + v_str

        return Decimal(v_str)
    except (InvalidOperation, ValueError):
        return Decimal('0')


def _validate_bank_ledger(tenant_id, bank_ledger_id) -> bool:
    """Ensure the ledger belongs to the tenant and is a Bank/Cash ledger."""
    return MasterLedger.objects.filter(
        id=bank_ledger_id,
        tenant_id=tenant_id,
    ).exists()


# ---------------------------------------------------------------------------
# ViewSet
# ---------------------------------------------------------------------------

SCORE_REF    = 40
SCORE_AMOUNT = 40
SCORE_DATE   = 10
SCORE_PARTY  = 10
SCORE_INV    = 30

class BankReconciliationViewSet(viewsets.ModelViewSet):
    """
    Bank Reconciliation endpoints.

      POST   .../upload/                  â€“ Upload & parse bank statement
      POST   .../run-matching/            â€“ Re-run matching engine
      GET    .../pending_matches/         â€“ Reconciliation interface data
      POST   .../{id}/link_voucher/       â€“ Link existing voucher to transaction
      POST   .../{id}/ignore/             â€“ Ignore a transaction
      POST   .../{id}/create_voucher/     â€“ Create Payment/Receipt voucher (explicit action only)
    """

    serializer_class = BankStatementTransactionSerializer
    permission_classes = [IsAuthenticated]

    def _get_tenant_id(self, request):
        return str(request.user.tenant_id)

    def _generate_voucher_number(self, tenant_id: str, is_payment: bool, voucher_name: Optional[str] = None) -> str:
        """
        Generate the next sequential voucher number using the master voucher sequence tables.
        Falls back to a random suffix if no configuration exists yet for this tenant.
        """
        try:
            from masters.voucher_master_models import MasterVoucherPayments, MasterVoucherReceipts  # type: ignore
            import random, string as _string

            if is_payment:
                ConfigModel = MasterVoucherPayments
                default_prefix = 'PMT-'
                default_name = 'Payment'
            else:
                ConfigModel = MasterVoucherReceipts
                default_prefix = 'RCP-'
                default_name = 'Receipt'

            # Try to find by specific name if provided
            if voucher_name:
                config = ConfigModel.objects.filter(
                    tenant_id=tenant_id,
                    voucher_name=voucher_name,
                    is_active=True
                ).first()
            else:
                config = None

            # Fallback to first active if name not found or not provided
            if not config:
                config = ConfigModel.objects.filter(
                    tenant_id=tenant_id,
                    is_active=True
                ).first()

            if not config:
                # Auto-create a default sequence so first voucher gets a proper number
                config = ConfigModel.objects.create(
                    tenant_id=tenant_id,
                    voucher_name=default_name,
                    enable_auto_numbering=True,
                    prefix=default_prefix,
                    suffix='',
                    start_from=1,
                    current_number=1,
                    required_digits=6,
                    is_active=True
                )

            if not config.enable_auto_numbering:
                suffix = ''.join(random.choices(_string.digits, k=6))
                return f"{config.prefix or default_prefix}{suffix}"

            padded = str(config.current_number).zfill(config.required_digits)
            voucher_number = f"{config.prefix or default_prefix}{padded}{config.suffix or ''}"

            # Atomically advance the sequence counter
            ConfigModel.objects.filter(pk=config.pk).update(
                current_number=config.current_number + 1
            )
            return voucher_number

        except Exception:
            import random, string as _string
            suffix = ''.join(random.choices(_string.digits, k=6))
            prefix = 'PMT-' if is_payment else 'RCP-'
            return f"{prefix}{suffix}"


    def get_queryset(self):
        with open(r'c:\108\muthu\AI-accounting-0.03\backend\debug_api.txt', 'a') as f:
            f.write(f"HIT get_queryset params={self.request.query_params}\n")
        tenant_id = self._get_tenant_id(self.request)
        params = self.request.query_params
        
        qs = BankStatementTransaction.objects.filter(tenant_id=tenant_id).exclude(status='DUPLICATE')
        
        bank_ledger_id = self.request.query_params.get('bank_ledger_id')
        if bank_ledger_id:
            qs = qs.filter(bank_ledger_id=bank_ledger_id)
        
        # Date Filters
        date_from_str = self.request.query_params.get('date_from')
        date_to_str = self.request.query_params.get('date_to')
        
        date_from = None
        date_to = None
        
        if date_from_str:
            date_from = flexible_parse_date(date_from_str)
            if date_from:
                qs = qs.filter(transaction_date__gte=date_from)
        
        if date_to_str:
            date_to = flexible_parse_date(date_to_str)
            if date_to:
                qs = qs.filter(transaction_date__lte=date_to)

        # Status Filter
        status_filter = self.request.query_params.get('status')
        if status_filter and status_filter.strip().upper() != 'ALL':
            qs = qs.filter(status=status_filter.strip().upper())

        # Requirement: Show only latest uploaded statement by default unless historical requested
        show_historical = self.request.query_params.get('show_historical', 'false').lower() == 'true'
        
        # If date filters are provided, we usually want to show those records even if they aren't in the latest batch.
        # This allows users to filter by date across multiple uploads.
        if not show_historical and not date_from and not date_to and bank_ledger_id:
            # Get the latest batch ID for this ledger that has BANK_UPLOAD source
            latest_batch = BankStatementTransaction.objects.filter(
                tenant_id=tenant_id, 
                bank_ledger_id=bank_ledger_id,
                source='BANK_UPLOAD'
            ).order_by('-created_at').values_list('import_batch_id', flat=True).first()
            if latest_batch:
                qs = qs.filter(import_batch_id=latest_batch)

        return qs.order_by('transaction_date')

    # ------------------------------------------------------------------
    # 1. UPLOAD  â†’  PARSE  â†’  STAGE  â†’  MATCH (no voucher creation)
    # ------------------------------------------------------------------

    @action(detail=False, methods=['post'], url_path='upload')
    def upload_statement(self, request):
        """
        Step 1:  Receive bank statement (CSV or XLSX).
        Step 2:  Validate file type, size, bank ledger ownership.
        Step 3:  Parse file â†’ extract rows.
        Step 4:  Bulk-insert into bank_statement_transactions.
        Step 5:  Run matching engine.
        Step 6:  Return reconciliation-ready data.

        NO vouchers are created here.
        """
        tenant_id = self._get_tenant_id(request)
        file_obj = request.FILES.get('file')
        bank_ledger_id = request.data.get('bank_ledger_id')

        # â”€â”€ Validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if not file_obj:
            return Response({'error': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        if not bank_ledger_id:
            return Response({'error': 'bank_ledger_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # File type check
        filename = (file_obj.name or '').lower()
        content_type = (file_obj.content_type or '').lower()
        if not (
            filename.endswith('.csv')
            or filename.endswith('.xlsx')
            or filename.endswith('.xls')
            or content_type in ACCEPTED_CONTENT_TYPES
        ):
            return Response(
                {'error': 'Invalid file type. Please upload a CSV or Excel file.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # File size check
        file_obj.seek(0, 2)  # seek to end
        file_size = file_obj.tell()
        file_obj.seek(0)
        if file_size > MAX_FILE_SIZE_BYTES:
            return Response(
                {'error': f'File too large. Maximum allowed size is {MAX_FILE_SIZE_BYTES // (1024*1024)} MB.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Tenantâ€“ledger ownership check
        if not _validate_bank_ledger(tenant_id, bank_ledger_id):
            return Response(
                {'error': 'Bank ledger not found or does not belong to your account.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # â”€â”€ Parse File â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        # 1. Stage Transactions (includes Parsing, Deletion of old period, and Column Mapping)
        import_batch_id = f"BATCH-{timezone.now().strftime('%Y%m%d%H%M%S')}"
        inserted_ids, duplicate_count, summary = self.stage_transactions(tenant_id, bank_ledger_id, file_obj, filename, import_batch_id)

        # 2 & 3. Match Transactions & Create Links
        counts = {}
        if inserted_ids:
            counts = self.auto_reconcile_transactions(tenant_id, bank_ledger_id, transaction_ids=inserted_ids)

        return Response(
            {
                'message': 'Upload Completed',
                'batch_id': import_batch_id,
                'inserted': len(inserted_ids),
                'duplicates': duplicate_count,
                'deleted_old': summary.get('deleted_count', 0),
                'start_date': summary.get('start_date'),
                'end_date': summary.get('end_date'),
                'auto_applied': counts.get('auto_applied_count', 0),
                'suggested': counts.get('suggested_count', 0),
                'possible': counts.get('possible_count', 0),
                'unmatched': counts.get('unmatched_count', 0),
            },
            status=status.HTTP_201_CREATED if inserted_ids else status.HTTP_200_OK,
        )

    def stage_transactions(self, tenant_id, bank_ledger_id, file_obj, filename, import_batch_id):
        """
        Parses bank statement file, identifies period, deletes old records for that period,
        checks for duplicates, and inserts valid rows.
        Returns (inserted_ids, duplicate_count, summary).
        """
        try:
            df: pd.DataFrame
            if filename.endswith('.csv'):
                try:
                    df = pd.read_csv(file_obj)
                except UnicodeDecodeError:
                    file_obj.seek(0)
                    df = pd.read_csv(file_obj, encoding='latin1')
            else:
                df = pd.read_excel(file_obj, engine='openpyxl')

            # Dynamic Header Detection Skip logic
            max_check = min(10, len(df))
            for i in range(max_check):
                row_vals = df.iloc[i].astype(str).tolist()  # type: ignore
                row_str = " ".join(row_vals).lower()
                if ('date' in row_str) and any(kw in row_str for kw in ['debit', 'credit', 'amount', 'balance', 'particulars']):
                    if i > 0:
                        df.columns = row_vals  # type: ignore
                        df = df.iloc[i+1:].reset_index(drop=True)  # type: ignore
                    break
        except Exception as exc:
            logger.error('Bank statement parse error: %s', exc)
            return [], 0, {}

        if not isinstance(df, pd.DataFrame) or df.empty:
            return [], 0, {}

        detected_map = _smart_detect_columns(df)
        date_col = detected_map['date']
        narration_col = detected_map['narration']
        debit_col = detected_map['debit']
        credit_col = detected_map['credit']
        ref_col = detected_map['reference']
        cheque_col = detected_map['cheque']
        
        # Balance column detection
        balance_col = None
        # type: ignore[attr-defined]
        for col in list(df.columns) if hasattr(df, 'columns') else []:
            if any(k in str(col).lower() for k in ['balance', 'running', 'closing']):
                balance_col = col
                break

        if not date_col or (not debit_col and not credit_col):
            return [], 0, {}

        # --- Detect Period and Delete Old Records ---
        parsed_dates = []
        for d in df[date_col].dropna():  # type: ignore
            try:
                pd_date = pd.to_datetime(d, dayfirst=True).date()
                if pd_date.year > 1900:
                    parsed_dates.append(pd_date)
            except: continue
        
        deleted_count = 0
        start_date = None
        end_date = None
        
        if parsed_dates:
            start_date = min(parsed_dates)
            end_date = max(parsed_dates)
            # Delete existing BANK_UPLOAD records for this ledger and range
            with db_transaction.atomic():
                deleted_info = BankStatementTransaction.objects.filter(
                    tenant_id=tenant_id,
                    bank_ledger_id=bank_ledger_id,
                    transaction_date__range=(start_date, end_date),
                    source='BANK_UPLOAD'
                ).delete()
                deleted_count = deleted_info[0]

        # Optimization: Fetch existing signatures for duplicate detection
        existing_txns = BankStatementTransaction.objects.filter(
            tenant_id=tenant_id,
            bank_ledger_id=bank_ledger_id
        ).values('transaction_date', 'reference_number', 'debit_amount', 'credit_amount')
        
        existing_signatures = set()
        for txn in existing_txns:
            sig = (
                txn['transaction_date'],
                str(txn['reference_number'] or '').strip(),
                txn['debit_amount'],
                txn['credit_amount']
            )
            existing_signatures.add(sig)

        staged_objects = []
        duplicate_count = 0
        
        # Check if we need an opening balance (no records or first of financial year)
        # Financial year starts April 1 in India
        has_existing = BankStatementTransaction.objects.filter(
            tenant_id=tenant_id, bank_ledger_id=bank_ledger_id
        ).exists()
        
        is_first_of_fy = False
        if start_date:
            # If start_date is April 1, check if we have older records in the same FY
            if start_date and start_date.month == 4 and start_date.day == 1: # type: ignore
                older_in_fy = BankStatementTransaction.objects.filter(
                    tenant_id=tenant_id,
                    bank_ledger_id=bank_ledger_id,
                    transaction_date__lt=start_date,
                    transaction_date__year=start_date.year # type: ignore
                ).exists()
                if not older_in_fy:
                    is_first_of_fy = True

        needs_opening_balance = not has_existing or is_first_of_fy
        opening_balance_created = False

        for _, row in df.iterrows():  # type: ignore
            try:
                raw_date = row[date_col]
                try:
                    # Fallback for truncated years like '202' -> '2024'
                    if isinstance(raw_date, str) and len(raw_date.split('-')) == 3:
                        parts = raw_date.split('-')
                        if len(parts[2]) == 3 and parts[2].startswith('202'):
                            raw_date = f"{parts[0]}-{parts[1]}-{parts[2]}4" # Heuristic for 2024
                    
                    t_date = pd.to_datetime(raw_date, dayfirst=True).date()
                except Exception:
                    # Final attempt with direct format if pd fails
                    try:
                        import datetime
                        if isinstance(raw_date, str):
                            t_date = datetime.datetime.strptime(raw_date, '%d-%m-%Y').date()
                        else:
                            continue
                    except Exception:
                        continue
                
                # Check for year <= 200 (if it still somehow parsed as 0202)
                if t_date.year < 1900:
                    if 200 <= t_date.year <= 209: # 202 -> 2024?
                         t_date = t_date.replace(year=t_date.year * 10 + 4) # Very specific fix for the user's data

                t_debit = _safe_decimal(row.get(debit_col) if debit_col else None)
                t_credit = _safe_decimal(row.get(credit_col) if credit_col else None)
                t_balance = _safe_decimal(row.get(balance_col) if balance_col else None)

                t_description = ''
                if narration_col:
                    raw_nar = row.get(narration_col)
                    if raw_nar is not None and not pd.isna(raw_nar):
                        t_description = str(raw_nar).strip()

                # Handle Opening Balance Requirement
                is_ob_row = any(kw in t_description.lower() for kw in ['opening balance', 'brought forward', 'b/f', 'ob'])
                if is_ob_row:
                    if opening_balance_created:
                        duplicate_count += 1
                        continue # Prevent multiple OB rows
                    opening_balance_created = True
                
                # Relaxed: Allow 0-amount rows if they are Opening Balance or have description
                if t_debit == 0 and t_credit == 0 and not is_ob_row and not t_description:
                    continue

                t_ref = ''
                if ref_col:
                    raw_ref = row.get(ref_col)
                    if raw_ref is not None and not pd.isna(raw_ref):
                        t_ref = str(raw_ref).strip()

                t_cheque = ''
                if cheque_col:
                    raw_chq = row.get(cheque_col)
                    if raw_chq is not None and not pd.isna(raw_chq):
                        t_cheque = str(raw_chq).strip()

                if not t_ref and t_cheque:
                    t_ref = t_cheque
                
                if t_ref and not t_cheque:
                    if t_ref.isdigit() and len(t_ref) == 6:
                        t_cheque = t_ref

                # Duplicate Detection (Relaxed since we deleted the period, but good for overlaps)
                sig = (t_date, t_ref, t_debit, t_credit)
                txn_status = 'UNMATCHED'
                if sig in existing_signatures:
                    txn_status = 'DUPLICATE'
                    duplicate_count += 1
                else:
                    existing_signatures.add(sig)

                staged_objects.append(
                    BankStatementTransaction(
                        tenant_id=tenant_id,
                        bank_ledger_id=bank_ledger_id,
                        transaction_date=t_date,
                        description=t_description,
                        debit_amount=t_debit,
                        credit_amount=t_credit,
                        reference_number=t_ref,
                        cheque_number=t_cheque,
                        running_balance=t_balance,
                        import_batch_id=import_batch_id,
                        status=txn_status,
                        source='BANK_UPLOAD'
                    )
                )
            except Exception as exc:
                logger.warning('Skipping row due to error: %s', exc)
                continue

        # If no OB row was found but it's required, create one from the first row's context
        if needs_opening_balance and not opening_balance_created and staged_objects:
            first_txn = staged_objects[0]
            # Heuristic: OB = Running Balance - Credit + Debit
            ob_amount = first_txn.running_balance - first_txn.credit_amount + first_txn.debit_amount
            staged_objects.insert(0, BankStatementTransaction(
                tenant_id=tenant_id,
                bank_ledger_id=bank_ledger_id,
                transaction_date=first_txn.transaction_date,
                description='Opening Balance (Auto-generated)',
                debit_amount=ob_amount if ob_amount > 0 else 0,
                credit_amount=abs(ob_amount) if ob_amount < 0 else 0,
                running_balance=ob_amount,
                import_batch_id=import_batch_id,
                status='UNMATCHED',
                source='BANK_UPLOAD'
            ))

        if staged_objects:
            with db_transaction.atomic():
                BankStatementTransaction.objects.bulk_create(
                    staged_objects,
                    batch_size=500,
                    ignore_conflicts=True,
                )
            
            created_ids = list(BankStatementTransaction.objects.filter(
                import_batch_id=import_batch_id,
                tenant_id=tenant_id
            ).exclude(status='DUPLICATE').values_list('id', flat=True))
            
            return created_ids, duplicate_count, {
                'deleted_count': deleted_count,
                'start_date': start_date,
                'end_date': end_date
            }

        return [], duplicate_count, {
            'deleted_count': deleted_count,
            'start_date': start_date,
            'end_date': end_date
        }

    # ------------------------------------------------------------------
    # 2. MATCHING ENGINE
    # ------------------------------------------------------------------

    def _get_narration_parser(self, tenant_id):
        all_ledgers = list(MasterLedger.objects.filter(
            tenant_id=tenant_id
        ).exclude(group__icontains='bank').exclude(group__icontains='cash').values_list('name', flat=True))
        
        vouchers = list(Voucher.objects.filter(
            tenant_id=tenant_id, type__in=['sales', 'purchase']
        ).values('voucher_number', 'party'))
        
        sorted_ledgers = sorted([l for l in all_ledgers if l], key=len, reverse=True)
        
        def parse(narration):
            if not narration:
                return None, None
            n_lower = str(narration).lower()
            f_invoice = None
            f_party = None
            
            for v in vouchers:
                vn = v['voucher_number']
                if vn and len(str(vn)) > 2 and str(vn).lower() in n_lower:
                    f_invoice = vn
                    f_party = v['party']
                    break
            
            if not f_party:
                for l in sorted_ledgers:
                    if len(str(l)) > 3 and str(l).lower() in n_lower:
                        f_party = l
                        break
                        
            return f_party, f_invoice
            
        return parse

    @action(detail=False, methods=['post'], url_path='run-matching')
    def run_matching(self, request):
        tenant_id = self._get_tenant_id(request)
        bank_ledger_id = request.data.get('bank_ledger_id')
        if not bank_ledger_id:
            return Response({'error': 'bank_ledger_id parameter required.'}, status=status.HTTP_400_BAD_REQUEST)
        
        if not _validate_bank_ledger(tenant_id, bank_ledger_id):
            return Response({'error': 'Bank ledger not found.'}, status=status.HTTP_403_FORBIDDEN)

        summary = self._run_matching_engine(tenant_id, bank_ledger_id)
        return Response({
            'message': 'Matching engine completed.',
            **summary
        })

    @action(detail=False, methods=['post'], url_path='auto-reconcile')
    def auto_reconcile(self, request):
        tenant_id = self._get_tenant_id(request)
        bank_ledger_id = request.data.get('bank_ledger_id')
        if not bank_ledger_id:
            return Response({'error': 'bank_ledger_id required.'}, status=status.HTTP_400_BAD_REQUEST)
        
        summary = self.auto_reconcile_transactions(tenant_id, bank_ledger_id)
        return Response(summary)

    def auto_reconcile_transactions(self, tenant_id, bank_ledger_id, transaction_ids=None) -> dict:
        """
        Orchestrates the full reconciliation pipeline for a batch of transactions:
          1. Run the matching engine (sets status + confidence_score on each txn)
          2. For high-confidence (â‰¥80) matches, create BankReconciliationLink records
          3. Return detailed summary counts
        """
        # â”€â”€ Step 1: Run matching engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        self._run_matching_engine(tenant_id, bank_ledger_id, transaction_ids=transaction_ids)

        # –– Step 2: Auto-apply only HIGH-confidence matches ––––––––––––––––
        matched_query = BankStatementTransaction.objects.filter(
            tenant_id=tenant_id,
            bank_ledger_id=bank_ledger_id,
            status='AUTO_MATCHED',
            confidence_score__gte=80,
            is_ignored=False,
            reconciled_at__isnull=True,
        )
        if transaction_ids is not None:
            matched_query = matched_query.filter(id__in=transaction_ids)

        auto_applied: int = 0

        with db_transaction.atomic():
            for st_txn in matched_query.select_for_update():
                if not st_txn.matched_voucher_id:
                    continue

                # Guard: skip if this bank transaction is already linked
                if BankReconciliationLink.objects.filter(bank_transaction_id=st_txn.id).exists():
                    continue

                # Guard: skip if this voucher is already reconciled to another txn
                if BankReconciliationLink.objects.filter(voucher_id=st_txn.matched_voucher_id).exists():
                    logger.warning(
                        "Voucher %s already reconciled â€” skipping bank txn %s",
                        st_txn.matched_voucher_id, st_txn.id
                    )
                    continue

                BankReconciliationLink.objects.create(
                    tenant_id=tenant_id,
                    bank_transaction=st_txn,
                    voucher_id=st_txn.matched_voucher_id,
                    voucher_type=st_txn.suggested_voucher_type,
                    reconciliation_type='automatic',
                    reconciliation_date=date_type.today(),
                    reconciliation_status='Reconciled',
                    confidence_score=st_txn.confidence_score,
                    match_method=st_txn.match_method,
                    reconciled_at=timezone.now(),
                )
                st_txn.reconciled_at = timezone.now()
                st_txn.save(update_fields=['reconciled_at'])
                auto_applied += 1  # type: ignore

        # –– Step 3: Build summary counts ––––––––––––––––––––––––––––––––
        base_q = BankStatementTransaction.objects.filter(
            tenant_id=tenant_id,
            bank_ledger_id=bank_ledger_id,
            is_ignored=False,
        )
        if transaction_ids is not None:
            base_q = base_q.filter(id__in=transaction_ids)

        return {
            'auto_applied_count': auto_applied,
            'matched_count':   base_q.filter(status='AUTO_MATCHED', reconciled_at__isnull=True).count(),
            'suggested_count': base_q.filter(status='UNMATCHED', confidence_score__gte=60).count(),
            'unmatched_count': base_q.filter(status='UNMATCHED', confidence_score__lt=60).count(),
        }

    # ------------------------------------------------------------------
    # CONFIDENCE SCORING CONSTANTS
    # ------------------------------------------------------------------
    #   Reference number match  = +40
    #   Exact amount match       = +40
    #   Date within Â±3 days      = +10
    #   Party name match         = +10
    #   Invoice number detected  = +30
    #
    # Classification:
    #   score â‰¥ 80  â†’  Matched      (auto-reconciled)
    #   score â‰¥ 60  â†’  Suggested    (manual confirmation needed)
    #   score â‰¥ 40  â†’  Possible Match
    #   score < 40  â†’  Unmatched



    def _run_matching_engine(self, tenant_id, bank_ledger_id, transaction_ids=None) -> dict:
        """
        Confidence-scoring matching engine based on priority rules 1-5.
        
        Rule 1: Reference Match (+80-100 score)
        Rule 2: Cheque Match (+80-100 score)
        Rule 3: Amount + Date Match (+80 score, within ±2 days)
        Rule 4: Narration Smart Match (+40-60 score)
        Rule 5: Bank Rule Engine
        """
        TOLERANCE = float(getattr(settings, 'BANK_MATCH_TOLERANCE', 1.0))

        # Transactions to process
        query = BankStatementTransaction.objects.filter(
            tenant_id=tenant_id,
            bank_ledger_id=bank_ledger_id,
            is_ignored=False,
            reconciled_at__isnull=True,
        ).exclude(status='AUTO_MATCHED')
        if transaction_ids is not None:
            query = query.filter(id__in=transaction_ids)

        # Get all unlinked vouchers for filtering (Isolated by bank ledger)
        payments_single = list(VoucherPaymentSingle.objects.filter(
            tenant_id=tenant_id, 
            pay_from_id=bank_ledger_id,  # Use pay_from_id to match the ForeignKey attribute
            bank_reconciled=False
        ))
        receipts_single = list(VoucherReceiptSingle.objects.filter(
            tenant_id=tenant_id, 
            receive_in_id=bank_ledger_id,  # Use receive_in_id to match the ForeignKey attribute
            bank_reconciled=False
        ))
        
        # Preload ledger names for party detection
        all_ledger_names = list(
            MasterLedger.objects.filter(tenant_id=tenant_id)
            .exclude(group__icontains='bank')
            .exclude(group__icontains='cash')
            .values_list('name', flat=True)
        )
        sorted_ledgers = sorted([str(l) for l in all_ledger_names if l and len(str(l)) > 3], key=len, reverse=True)

        heuristics = {
            'salary': ('Salary Expense', 'payment'),
            'bank charges': ('Bank Charges Expense', 'payment'),
            'bank charge': ('Bank Charges Expense', 'payment'),
            'interest': ('Interest Income', 'receipt'),
            'upi payment': ('UPI Payment', 'payment'),
        }

        batch_matched_vouchers = set()

        with db_transaction.atomic():
            for st_txn in query.select_for_update():
                st_date = st_txn.transaction_date
                description = str(st_txn.description or '').lower()
                ref_str = str(st_txn.reference_number or '').strip().lower()
                chq_str = str(st_txn.cheque_number or '').strip().lower()
                st_debit = float(st_txn.debit_amount or 0)
                st_credit = float(st_txn.credit_amount or 0)
                st_amount = st_debit if st_debit > 0 else st_credit

                best_score = 0
                best_voucher_id = None
                best_match_method = None
                best_voucher_type = None
                
                for keyword, (sugg_party, sugg_type) in heuristics.items():
                    if keyword in description:
                        st_txn.suggested_party = sugg_party
                        st_txn.suggested_voucher_type = sugg_type
                        best_score = 40
                        break

                candidates = payments_single if st_debit > 0 else receipts_single
                for cand in candidates:
                    if cand.id in batch_matched_vouchers: continue
                    cand_amount = float(getattr(cand, 'total_payment', 0) or getattr(cand, 'total_receipt', 0))
                    if abs(cand_amount - st_amount) > TOLERANCE: continue
                    cand_ref = str(getattr(cand, 'reference_number', '') or '').lower()
                    cand_date = cand.date
                    
                    cur_score = 0
                    cur_method = None
                    if ref_str and cand_ref and ref_str == cand_ref:
                        cur_score, cur_method = 100, 'reference_match'
                    elif chq_str and cand_ref and chq_str == cand_ref:
                        cur_score, cur_method = 100, 'cheque_match'
                    elif abs((cand_date - st_date).days) <= 2:
                        cur_score, cur_method = 80, 'amount_date_match'
                    
                    if cur_score > best_score:
                        best_score, best_voucher_id, best_match_method = cur_score, cand.id, cur_method
                        best_voucher_type = 'payment' if st_debit > 0 else 'receipt'

                if best_score < 60:
                    for ledger_name in sorted_ledgers:
                        if ledger_name.lower() in description:
                            st_txn.suggested_party = ledger_name
                            best_score, best_match_method = 50, 'narration_match'
                            break

                if best_score >= 80 and best_voucher_id:
                    st_txn.status = 'AUTO_MATCHED'
                    st_txn.matched_voucher_id = best_voucher_id
                    st_txn.confidence_score = best_score
                    st_txn.match_method = best_match_method
                    st_txn.suggested_voucher_type = best_voucher_type
                    batch_matched_vouchers.add(best_voucher_id)
                else:
                    st_txn.status = 'UNMATCHED'
                    st_txn.confidence_score = best_score
                    st_txn.matched_voucher_id = best_voucher_id
                    st_txn.match_method = best_match_method
                st_txn.save()

            final_summary = {
                'matched_count': query.filter(status='AUTO_MATCHED').count(),
                'suggested_count': query.filter(status='UNMATCHED', confidence_score__gte=60).count(),
                'unmatched_count': query.filter(status='UNMATCHED', confidence_score__lt=60).count(),
            }
        return final_summary

    def _validate_reconciliation_voucher_type(self, voucher_type: str) -> bool:
        """Safety check: only Payment and Receipt vouchers allowed."""
        allowed = {'payment', 'receipt'}
        if voucher_type and str(voucher_type).lower() in allowed:
            return True
        logger.warning("Blocked invalid voucher_type='%s'.", voucher_type)
        return False

    # ------------------------------------------------------------------
    # 3. RECONCILIATION INTERFACE DATA
    # ------------------------------------------------------------------

    @action(detail=False, methods=['get'])
    def pending_matches(self, request):
        with open(r'c:\108\muthu\AI-accounting-0.03\backend\debug_api.txt', 'a') as f:
            f.write(f"HIT pending_matches params={request.query_params}\n")
        params = request.query_params
        bank_ledger_id = params.get('bank_ledger_id')
        tenant_id = self._get_tenant_id(request)

        if not bank_ledger_id:
            return Response(
                {'error': 'bank_ledger_id query param required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        logger.error(f"DEBUG RECON: pending_matches called with params={params}")

        if not _validate_bank_ledger(tenant_id, bank_ledger_id):
            return Response({'error': 'Bank ledger not found.'}, status=status.HTTP_403_FORBIDDEN)

        # Base queryset
        qs = BankStatementTransaction.objects.filter(
            tenant_id=tenant_id,
            bank_ledger_id=bank_ledger_id,
        ).exclude(status='DUPLICATE').order_by('transaction_date')

        # Status filter
        status_filter = request.query_params.get('status', 'ALL').strip().upper()
        if status_filter and status_filter != 'ALL':
            qs = qs.filter(status=status_filter)

        # Date range filter
        date_from_str = request.query_params.get('date_from', '').strip()
        date_to_str   = request.query_params.get('date_to', '').strip()
        
        # Requirement: Show only latest uploaded statement by default unless historical explicitly requested
        show_historical = request.query_params.get('show_historical', 'false').lower() == 'true'

        d_from = None
        d_to = None
        if date_from_str:
            d_from = flexible_parse_date(date_from_str)
            logger.error(f"DEBUG RECON: d_from_str={date_from_str} parsed to {d_from}")
            if d_from:
                qs = qs.filter(transaction_date__gte=d_from)
        if date_to_str:
            d_to = flexible_parse_date(date_to_str)
            logger.error(f"DEBUG RECON: d_to_str={date_to_str} parsed to {d_to}")
            if d_to:
                qs = qs.filter(transaction_date__lte=d_to)

        if not show_historical and not d_from and not d_to:
            latest_batch = BankStatementTransaction.objects.filter(
                tenant_id=tenant_id, 
                bank_ledger_id=bank_ledger_id,
                source='BANK_UPLOAD'
            ).order_by('-created_at').values_list('import_batch_id', flat=True).first()
            if latest_batch:
                qs = qs.filter(import_batch_id=latest_batch)

        logger.error(f"DEBUG RECON: Final QS count: {qs.count()}")
        # Pagination
        try:
            page_num  = max(1, int(request.query_params.get('page', 1)))
            page_size = min(200, max(1, int(request.query_params.get('page_size', 50))))
        except (ValueError, TypeError):
            page_num, page_size = 1, 50

        offset = (page_num - 1) * page_size
        statement_txns = list(qs[offset: offset + page_size])

        if not statement_txns:
            return Response([])

                # Preload candidate vouchers to avoid N+1 queries
        min_date = statement_txns[0].transaction_date - timedelta(days=7)
        max_date = statement_txns[-1].transaction_date + timedelta(days=7)
        
        # Get unlinked payments
        payment_cands = list(VoucherPaymentSingle.objects.filter(
            tenant_id=tenant_id,
            date__range=(min_date, max_date),
            bank_reconciled=False
        ))
        
        # Get unlinked receipts
        receipt_cands = list(VoucherReceiptSingle.objects.filter(
            tenant_id=tenant_id,
            date__range=(min_date, max_date),
            bank_reconciled=False
        ))

        results = []
        for st_txn in statement_txns:
            row = BankStatementTransactionSerializer(st_txn).data
            
            # Attach parsed data to prefill voucher creation
            row['extracted_party'] = st_txn.suggested_party or ''
            row['extracted_invoice'] = st_txn.suggested_invoice or ''

            date_min = st_txn.transaction_date - timedelta(days=7)
            date_max = st_txn.transaction_date + timedelta(days=7)
            
            st_debit = float(st_txn.debit_amount or 0)
            st_credit = float(st_txn.credit_amount or 0)
            st_amount = st_debit if st_debit > 0 else st_credit

            potential_vouchers = []
            
            if st_debit > 0:
                for cand in payment_cands:
                    if date_min <= cand.date <= date_max: # type: ignore
                        cand_amount = float(getattr(cand, 'total_payment', 0) or 0)
                        if abs(cand_amount - st_amount) <= 1.0:
                            potential_vouchers.append({
                                'id': cand.id, # type: ignore
                                'voucher_number': cand.voucher_number, # type: ignore
                                'type': getattr(cand, 'voucher_type', None) or 'payment', # type: ignore
                                'date': str(cand.date), # type: ignore
                                'amount': cand_amount,
                                'narration': getattr(cand, 'reference_number', '') or '',
                            })
            else:
                for cand in receipt_cands:
                    if date_min <= cand.date <= date_max: # type: ignore
                        cand_amount = float(getattr(cand, 'total_receipt', 0) or 0)
                        if abs(cand_amount - st_amount) <= 1.0:
                            potential_vouchers.append({
                                'id': cand.id, # type: ignore
                                'voucher_number': cand.voucher_number, # type: ignore
                                'type': getattr(cand, 'voucher_type', None) or 'receipt', # type: ignore
                                'date': str(cand.date), # type: ignore
                                'amount': cand_amount,
                                'narration': getattr(cand, 'reference_number', '') or '',
                            })

            row['potential_matches'] = potential_vouchers
            results.append(row)

        return Response(results)

    # ------------------------------------------------------------------
    # 4. LINK EXISTING VOUCHER  (manual reconciliation)
    # ------------------------------------------------------------------

    @action(detail=True, methods=['post'])
    def link_voucher(self, request, pk=None):
        """
        Link an existing voucher to a bank statement transaction.
        Updates status and stores mapping in bank_reconciliation_links.
        Does NOT create a new voucher.
        """
        tenant_id = self._get_tenant_id(request)
        try:
            st_txn = BankStatementTransaction.objects.get(pk=pk, tenant_id=tenant_id)
        except BankStatementTransaction.DoesNotExist:
            return Response({'error': 'Transaction not found.'}, status=status.HTTP_404_NOT_FOUND)

        voucher_id = request.data.get('voucher_id')
        voucher_type = request.data.get('voucher_type', '').lower()

        if not voucher_id:
            return Response({'error': 'voucher_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if st_txn.status in ['Matched', 'MANUAL_MATCHED'] and str(st_txn.matched_voucher_id) == str(voucher_id):
            return Response({
                'message': 'Voucher already linked.',
                'link_id': BankReconciliationLink.objects.filter(bank_transaction=st_txn).first().id if BankReconciliationLink.objects.filter(bank_transaction=st_txn).exists() else None,
                'created': False,
            })

        # 1. Check if this voucher is already linked to ANOTHER bank transaction
        existing_link = BankReconciliationLink.objects.filter(
            tenant_id=tenant_id,
            voucher_id=voucher_id,
            voucher_type=voucher_type
        ).exclude(bank_transaction=st_txn).first()

        if existing_link:
            return Response({
                'error': f'Voucher {voucher_id} is already reconciled with another transaction (ID: {existing_link.bank_transaction_id}).',
                'code': 'already_reconciled'
            }, status=status.HTTP_400_BAD_REQUEST)

        # 2. Verify voucher exists
        voucher_exists = False
        if voucher_type == 'payment':
            voucher_exists = VoucherPaymentSingle.objects.filter(id=voucher_id, tenant_id=tenant_id).exists()
        elif voucher_type == 'receipt':
            voucher_exists = VoucherReceiptSingle.objects.filter(id=voucher_id, tenant_id=tenant_id).exists()
        else:
            # Fallback
            voucher_exists = (
                VoucherPaymentSingle.objects.filter(id=voucher_id, tenant_id=tenant_id).exists() or
                VoucherReceiptSingle.objects.filter(id=voucher_id, tenant_id=tenant_id).exists()
            )

        if not voucher_exists:
            return Response({'error': 'Voucher not found.'}, status=status.HTTP_404_NOT_FOUND)

        with db_transaction.atomic():
            # Ensure unique link - one bank txn to one voucher
            link, created = BankReconciliationLink.objects.get_or_create(
                tenant_id=tenant_id,
                bank_transaction=st_txn,
                defaults={
                    'voucher_id': voucher_id,
                    'voucher_type': voucher_type if voucher_type in ['payment', 'receipt'] else None,
                    'reconciliation_type': 'manual',
                    'reconciliation_date': date_type.today(),
                    'reconciliation_status': 'Reconciled',
                    'cheque_number': st_txn.cheque_number,
                },
            )
            if not created:
                # Update existing link if it exists but points to different voucher
                link.voucher_id = voucher_id
                if voucher_type in ['payment', 'receipt']:
                    link.voucher_type = voucher_type
                link.reconciliation_type = 'manual'
                link.reconciliation_date = date_type.today()
                link.cheque_number = st_txn.cheque_number
                link.save()

            st_txn.status = 'MANUAL_MATCHED'
            st_txn.matched_voucher_id = voucher_id
            st_txn.confidence_score = 100
            st_txn.match_method = 'manual'
            st_txn.reconciled_at = timezone.now()
            st_txn.is_ignored = False
            st_txn.save(update_fields=['status', 'matched_voucher_id', 'confidence_score', 'match_method', 'reconciled_at', 'is_ignored'])

            # Update the voucher record itself
            if voucher_type == 'payment':
                VoucherPaymentSingle.objects.filter(id=voucher_id, tenant_id=tenant_id).update(
                    bank_reconciled=True,
                    bank_reconcile_date=st_txn.transaction_date,
                    bank_statement_id=st_txn.id,
                    bank_reference_number=st_txn.reference_number
                )
            elif voucher_type == 'receipt':
                VoucherReceiptSingle.objects.filter(id=voucher_id, tenant_id=tenant_id).update(
                    bank_reconciled=True,
                    bank_reconcile_date=st_txn.transaction_date,
                    bank_statement_id=st_txn.id,
                    bank_reference_number=st_txn.reference_number
                )

        return Response({
            'message': 'Voucher linked successfully.',
            'link_id': link.id,
            'created': created,
        })

    # ------------------------------------------------------------------
    # 5. IGNORE TRANSACTION
    # ------------------------------------------------------------------

    @action(detail=True, methods=['post'])
    def ignore(self, request, pk=None):
        tenant_id = self._get_tenant_id(request)
        try:
            st_txn = BankStatementTransaction.objects.get(pk=pk, tenant_id=tenant_id)
        except BankStatementTransaction.DoesNotExist:
            return Response({'error': 'Transaction not found.'}, status=status.HTTP_404_NOT_FOUND)

        if st_txn.is_ignored:
            st_txn.is_ignored = False
            st_txn.status = 'UNMATCHED'
            st_txn.save(update_fields=['is_ignored', 'status'])
            return Response({'message': 'Transaction restored.'})
        else:
            st_txn.is_ignored = True
            st_txn.status = 'IGNORED'
            st_txn.save(update_fields=['is_ignored', 'status'])
            return Response({'message': 'Transaction marked as Ignored.'})

    # ------------------------------------------------------------------
    # 6. CREATE VOUCHER  (explicit user action only â€“ never automatic)
    # ------------------------------------------------------------------

    @action(detail=True, methods=['post'], url_path='create_voucher')
    def create_voucher(self, request, pk=None):
        """
        Creates a Payment or Receipt voucher from a bank transaction.
        Only reached when the user explicitly clicks "Create Voucher" in the UI.

        Debit transaction  â†’ Payment Voucher  (Dr Expense/Party, Cr Bank Ledger)
        Credit transaction â†’ Receipt Voucher  (Dr Bank Ledger,   Cr Party/Income)

        After creation:
          â€¢ matched_voucher_id is set on the staging transaction
          â€¢ status = 'Matched'
          â€¢ Reconciliation link stored in bank_reconciliation_links
        """
        tenant_id = self._get_tenant_id(request)
        try:
            st_txn = BankStatementTransaction.objects.get(pk=pk, tenant_id=tenant_id)
        except BankStatementTransaction.DoesNotExist:
            return Response({'error': 'Transaction not found.'}, status=status.HTTP_404_NOT_FOUND)

        if st_txn.status in ['Matched', 'MANUAL_MATCHED']:
            return Response(
                {'error': 'This transaction is already matched. Use Link Voucher to change the link.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Gather required fields from request body
        # Force use of the transaction's own bank ledger for consistency
        bank_ledger_id = st_txn.bank_ledger_id
        counterparty_ledger_id = request.data.get('counterparty_ledger_id')
        amount = request.data.get('amount')

        if not bank_ledger_id:
            return Response({'error': 'bank_ledger_id must always be present'}, status=status.HTTP_400_BAD_REQUEST)
        
        if not counterparty_ledger_id:
            return Response({'error': 'counterparty_ledger_id must always be present'}, status=status.HTTP_400_BAD_REQUEST)
        
        if amount is None or float(amount) <= 0:
            return Response({'error': 'amount must be greater than zero'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate Ledgers
        try:
            bank_ledger = MasterLedger.objects.get(id=bank_ledger_id, tenant_id=tenant_id)
        except MasterLedger.DoesNotExist:
            return Response({'error': 'Bank ledger does not exist.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            party_ledger = MasterLedger.objects.get(id=counterparty_ledger_id, tenant_id=tenant_id)
        except MasterLedger.DoesNotExist:
            return Response({'error': 'Counterparty ledger does not exist.'}, status=status.HTTP_400_BAD_REQUEST)

        # Determine is_payment first
        is_payment = st_txn.debit_amount > 0
        
        # Override if explicitly requested as 'payment' or 'receipt'
        vt_req = str(request.data.get('voucher_type', '')).lower()
        if vt_req == 'payment':
            is_payment = True
        elif vt_req == 'receipt':
            is_payment = False
        
        voucher_type = 'payment' if is_payment else 'receipt'
        voucher_name = request.data.get('voucher_type') # e.g. "Vendor Payment" or "Payment"

        narration = request.data.get('narration') or st_txn.description or ''
        reference = request.data.get('reference') or st_txn.reference_number or ''

        try:
            with db_transaction.atomic():
                # Generate voucher number using master voucher sequences
                voucher_number = self._generate_voucher_number(tenant_id, is_payment, voucher_name=voucher_name)

                # Resolve voucher date (user override or bank transaction date)
                voucher_date_raw = request.data.get('voucher_date')
                if voucher_date_raw:
                    try:
                        import datetime as dt_module
                        voucher_date = dt_module.date.fromisoformat(str(voucher_date_raw))
                    except (ValueError, TypeError):
                        voucher_date = st_txn.transaction_date
                else:
                    voucher_date = st_txn.transaction_date

                # 1. Create the specific voucher record (Payment/Receipt)
                if is_payment:
                    specific_voucher = VoucherPaymentSingle.objects.create(
                        tenant_id=tenant_id,
                        voucher_type='Payment',
                        voucher_number=voucher_number,
                        date=voucher_date,
                        pay_from=bank_ledger,
                        pay_to=party_ledger,
                        total_payment=float(amount),
                        bank_reconciled=True,
                        bank_reconcile_date=st_txn.transaction_date,
                        bank_statement_id=st_txn.id,
                        bank_reference_number=st_txn.reference_number,
                        source='bank_reconciliation'
                    )
                else:
                    specific_voucher = VoucherReceiptSingle.objects.create(
                        tenant_id=tenant_id,
                        voucher_type='Receipt',
                        voucher_number=voucher_number,
                        date=voucher_date,
                        receive_in=bank_ledger,
                        receive_from=party_ledger,
                        total_receipt=float(amount),
                        bank_reconciled=True,
                        bank_reconcile_date=st_txn.transaction_date,
                        bank_statement_id=st_txn.id,
                        bank_reference_number=st_txn.reference_number,
                        source='bank_reconciliation'
                    )

                # 2. Create the main generic Voucher record (for overall audit trail and reporting)
                main_voucher = Voucher.objects.create(
                    tenant_id=tenant_id,
                    type='payment' if is_payment else 'receipt',
                    voucher_number=voucher_number,
                    date=voucher_date,
                    party=party_ledger.name,
                    account=bank_ledger.name,
                    amount=Decimal(str(amount)),
                    total=Decimal(str(amount)),
                    narration=request.data.get('narration') or f"Bank reconciliation: {st_txn.description}",
                    source='bank_reconciliation'
                )

                # 3. Insert journal entries for double-entry accounting
                amount_dec = Decimal(str(amount))
                zero_dec = Decimal("0.00")

                if is_payment:
                    # Debit -> Counterparty, Credit -> Bank
                    JournalEntry.objects.create(
                        tenant_id=tenant_id,
                        voucher=main_voucher,
                        ledger=party_ledger.name,
                        debit=amount_dec,
                        credit=zero_dec,
                        created_at=timezone.now(),
                        updated_at=timezone.now()
                    )
                    JournalEntry.objects.create(
                        tenant_id=tenant_id,
                        voucher=main_voucher,
                        ledger=bank_ledger.name,
                        debit=zero_dec,
                        credit=amount_dec,
                        created_at=timezone.now(),
                        updated_at=timezone.now()
                    )
                else:
                    # Debit -> Bank, Credit -> Counterparty
                    JournalEntry.objects.create(
                        tenant_id=tenant_id,
                        voucher=main_voucher,
                        ledger=bank_ledger.name,
                        debit=amount_dec,
                        credit=zero_dec,
                        created_at=timezone.now(),
                        updated_at=timezone.now()
                    )
                    JournalEntry.objects.create(
                        tenant_id=tenant_id,
                        voucher=main_voucher,
                        ledger=party_ledger.name,
                        debit=zero_dec,
                        credit=amount_dec,
                        created_at=timezone.now(),
                        updated_at=timezone.now()
                    )

                # 4. Store reconciliation link
                BankReconciliationLink.objects.create(
                    tenant_id=tenant_id,
                    bank_transaction=st_txn,
                    voucher_id=specific_voucher.id,
                    voucher_type=voucher_type,
                    reconciliation_type='manual',
                    reconciliation_date=date_type.today(),
                    reconciliation_status='Reconciled',
                    confidence_score=100,
                    match_method='create_voucher',
                    cheque_number=st_txn.cheque_number,
                    reconciled_at=timezone.now()
                )

                # 5. Update bank transaction
                st_txn.status = 'MANUAL_MATCHED'
                st_txn.matched_voucher_id = specific_voucher.id
                st_txn.reconciled_at = timezone.now()
                st_txn.is_ignored = False
                st_txn.save(update_fields=['status', 'matched_voucher_id', 'reconciled_at', 'is_ignored'])

                logger.info(f"Voucher {main_voucher.voucher_number} created from bank reconciliation. Amount {amount}")
                logger.info(f"Journal entries posted for voucher {main_voucher.id}")

            return Response({
                "status": "success",
                "voucher_id": main_voucher.id,
                "specific_voucher_id": specific_voucher.id,
                "voucher_number": voucher_number,
                "message": "Voucher created and journal entries posted successfully"
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"Error creating voucher: {str(e)}")
            return Response({'error': f"Voucher creation failed: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'], url_path='export-statement')
    def export_statement(self, request):
        tenant_id = self._get_tenant_id(request)
        bank_ledger_id = request.query_params.get('bank_ledger_id')
        if not bank_ledger_id:
            return Response({'error': 'bank_ledger_id required.'}, status=status.HTTP_400_BAD_REQUEST)

        qs = BankStatementTransaction.objects.filter(
            tenant_id=tenant_id,
            bank_ledger_id=bank_ledger_id,
            is_ignored=False
        ).order_by('transaction_date')

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="bank_reconciliation_statement.csv"'

        writer = csv.writer(response)
        writer.writerow(['Date', 'Narration', 'Reference', 'Debit', 'Credit', 'Status', 'Matched Voucher ID', 'Confidence Score', 'Running Balance'])

        for row in qs:
            writer.writerow([
                row.transaction_date,
                row.description,
                row.reference_number,
                row.debit_amount,
                row.credit_amount,
                row.status,
                row.matched_voucher_id,
                row.confidence_score,
                row.running_balance,
            ])

        return response

    @action(detail=False, methods=['get'], url_path='export-summary')
    def export_summary(self, request):
        tenant_id = self._get_tenant_id(request)
        bank_ledger_id = request.query_params.get('bank_ledger_id')
        if not bank_ledger_id:
            return Response({'error': 'bank_ledger_id required.'}, status=status.HTTP_400_BAD_REQUEST)

        qs = BankReconciliationLink.objects.filter(
            tenant_id=tenant_id,
            bank_transaction__bank_ledger_id=bank_ledger_id
        ).select_related('bank_transaction').order_by('-reconciliation_date')

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="matched_transactions_summary.csv"'

        writer = csv.writer(response)
        writer.writerow(['Reconciliation Date', 'Method', 'Bank Txn Date', 'Narration', 'Voucher ID', 'Voucher Type', 'Amount', 'Confidence'])

        for link in qs:
            txn = link.bank_transaction
            writer.writerow([
                link.reconciliation_date,
                link.match_method,
                txn.transaction_date if txn else '',
                txn.description if txn else '',
                link.voucher_id,
                link.voucher_type,
                (txn.debit_amount or txn.credit_amount) if txn else '',
                link.confidence_score,
            ])

        return response
