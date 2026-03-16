import re
import sys

file_path = r"c:\108\muthu\AI-accounting-0.03\backend\accounting\views_bank_reconciliation.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Extract stage_transactions
upload_method_pattern = r"(@action\(detail=False, methods=\['post'\], url_path='upload'\)\n\s+def upload_statement\(self, request\):.*?)(\n\s+# ------------------------------------------------------------------\n\s+# 2\. MATCHING ENGINE)"
match = re.search(upload_method_pattern, content, re.DOTALL)
if not match:
    print("Could not find upload_statement method!")
    sys.exit(1)

upload_body = match.group(1)
rest_of_file = match.group(2)

# Rewrite upload_statement and create stage_transactions
new_upload_and_stage = """    @action(detail=False, methods=['post'], url_path='upload')
    def upload_statement(self, request):
        tenant_id = self._get_tenant_id(request)
        file_obj = request.FILES.get('file')
        bank_ledger_id = request.data.get('bank_ledger_id')

        # ── Validation ────────────────────────────────────────────────
        if not file_obj:
            return Response({'error': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        if not bank_ledger_id:
            return Response({'error': 'bank_ledger_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        filename = (file_obj.name or '').lower()
        if not filename.endswith(('.csv', '.xlsx', '.xls')):
            return Response({'error': 'Invalid file type. Please upload a CSV or Excel file.'}, status=status.HTTP_400_BAD_REQUEST)

        if not _validate_bank_ledger(tenant_id, bank_ledger_id):
            return Response({'error': 'Bank ledger not found or does not belong to your account.'}, status=status.HTTP_403_FORBIDDEN)

        # 1. Stage Transactions
        inserted_ids, duplicate_count = self.stage_transactions(tenant_id, bank_ledger_id, file_obj, filename)

        # 2 & 3. Match Transactions & Create Links
        counts = {}
        if inserted_ids:
            counts = self.auto_reconcile_transactions(tenant_id, bank_ledger_id, transaction_ids=inserted_ids)

        return Response({
            'message': 'Upload Completed',
            'inserted': len(inserted_ids),
            'duplicates': duplicate_count,
            'auto_applied': counts.get('auto_applied_count', 0),
            'suggested': counts.get('suggested_count', 0),
            'unmatched': counts.get('unmatched_count', 0),
        }, status=status.HTTP_201_CREATED if inserted_ids else status.HTTP_200_OK)

    def stage_transactions(self, tenant_id, bank_ledger_id, file_obj, filename):
        try:
            import pandas as pd
            if filename.endswith('.csv'):
                try:
                    df = pd.read_csv(file_obj)
                except UnicodeDecodeError:
                    file_obj.seek(0)
                    df = pd.read_csv(file_obj, encoding='latin1')
            else:
                df = pd.read_excel(file_obj, engine='openpyxl')

            max_check = min(10, len(df))
            for i in range(max_check):
                row_vals = df.iloc[i].astype(str).tolist()
                row_str = " ".join(row_vals).lower()
                if ('date' in row_str) and any(kw in row_str for kw in ['debit', 'credit', 'amount', 'balance', 'particulars']):
                    if i > 0:
                        df.columns = row_vals
                        df = df.iloc[i+1:].reset_index(drop=True)
                    break
        except Exception as exc:
            return [], 0

        if df.empty:
            return [], 0

        detected_map = _smart_detect_columns(df)
        date_col = detected_map['date']
        narration_col = detected_map['narration']
        debit_col = detected_map['debit']
        credit_col = detected_map['credit']
        ref_col = detected_map['reference']

        if not date_col or (not debit_col and not credit_col):
            return [], 0

        existing_txns = BankStatementTransaction.objects.filter(
            tenant_id=tenant_id,
            bank_ledger_id=bank_ledger_id
        ).values_list('transaction_date', 'reference_number', 'debit_amount', 'credit_amount')
        
        existing_signatures = set()
        for txn_date, ref, deb, cred in existing_txns:
            existing_signatures.add((bank_ledger_id, txn_date, str(ref).strip() if ref else '', deb, cred))

        staged_objects = []
        skipped = 0

        for _, row in df.iterrows():
            try:
                raw_date = row[date_col]
                import pandas as pd
                t_date = pd.to_datetime(raw_date, dayfirst=True).date()

                t_debit = _safe_decimal(row.get(debit_col) if debit_col else None)
                t_credit = _safe_decimal(row.get(credit_col) if credit_col else None)

                if t_debit == 0 and t_credit == 0:
                    skipped += 1
                    continue

                t_narration = ''
                if narration_col:
                    raw_nar = row.get(narration_col)
                    if raw_nar is not None and not pd.isna(raw_nar):
                        t_narration = str(raw_nar).strip()

                t_ref = ''
                if ref_col:
                    raw_ref = row.get(ref_col)
                    if raw_ref is not None and not pd.isna(raw_ref):
                        t_ref = str(raw_ref).strip()

                sig = (bank_ledger_id, t_date, t_ref, t_debit, t_credit)
                if sig in existing_signatures:
                    skipped += 1
                    continue
                existing_signatures.add(sig)

                staged_objects.append(
                    BankStatementTransaction(
                        tenant_id=tenant_id,
                        bank_ledger_id=bank_ledger_id,
                        transaction_date=t_date,
                        narration=t_narration,
                        debit_amount=t_debit,
                        credit_amount=t_credit,
                        reference_number=t_ref,
                        match_status='Unmatched',
                    )
                )
            except Exception:
                skipped += 1
                continue

        created_txns = []
        if staged_objects:
            with db_transaction.atomic():
                created_txns = BankStatementTransaction.objects.bulk_create(
                    staged_objects, batch_size=500, ignore_conflicts=True
                )

        return [txn.id for txn in created_txns], skipped"""

content = content[:match.start()] + new_upload_and_stage + content[match.end(1):]

# 2. Rewrite _run_matching_engine and auto_reconcile_transactions
start_reconcile = content.find("def auto_reconcile_transactions")
end_reconcile = content.find("    # ------------------------------------------------------------------\n    # 3. GET MATCHES", start_reconcile)

if start_reconcile == -1 or end_reconcile == -1:
    print("Could not find auto_reconcile_transactions or 3. GET MATCHES!")
    sys.exit(1)

new_matching_logic = """def auto_reconcile_transactions(self, tenant_id, bank_ledger_id, transaction_ids=None) -> dict:
        self._run_matching_engine(tenant_id, bank_ledger_id, transaction_ids=transaction_ids)
        
        query = BankStatementTransaction.objects.filter(
            tenant_id=tenant_id,
            bank_ledger_id=bank_ledger_id,
            match_status__in=['Matched', 'Matched with Charge'],
            is_ignored=False,
            reconciled_at__isnull=True
        )
        if transaction_ids is not None:
            query = query.filter(id__in=transaction_ids)
            
        confident_matches = query
        
        ac_mc = 0
        with db_transaction.atomic():
            for st_txn in confident_matches:
                if st_txn.matched_voucher_id:
                    if not BankReconciliationLink.objects.filter(bank_transaction_id=st_txn.id).exists():
                        BankReconciliationLink.objects.create(
                            tenant_id=tenant_id,
                            bank_transaction=st_txn,
                            voucher_id=st_txn.matched_voucher_id,
                            reconciliation_type='automatic',
                            reconciliation_date=date_type.today(),
                            reconciliation_status='Reconciled'
                        )
                        st_txn.reconciled_at = timezone.now()
                        st_txn.save(update_fields=['reconciled_at'])
                        ac_mc += 1

        unreconciled_query = BankStatementTransaction.objects.filter(
            tenant_id=tenant_id,
            bank_ledger_id=bank_ledger_id,
            is_ignored=False,
            reconciled_at__isnull=True
        )
        if transaction_ids is not None:
            unreconciled_query = unreconciled_query.filter(id__in=transaction_ids)
        
        counts = {
            'matched_count': unreconciled_query.filter(match_status__in=['Matched', 'Matched with Charge']).count(),
            'suggested_count': unreconciled_query.filter(match_status__in=['Suggested', 'Multi Match Suggested']).count(),
            'unmatched_count': unreconciled_query.filter(match_status='Unmatched').count(),
            'auto_applied_count': ac_mc
        }
        return counts

    def _run_matching_engine(self, tenant_id, bank_ledger_id, transaction_ids=None) -> dict:
        TOLERANCE = float(getattr(settings, 'BANK_MATCH_TOLERANCE', 1.0))
        
        query = BankStatementTransaction.objects.filter(
            tenant_id=tenant_id,
            bank_ledger_id=bank_ledger_id,
            is_ignored=False,
            reconciled_at__isnull=True
        ).exclude(match_status='Matched')
        
        if transaction_ids is not None:
            query = query.filter(id__in=transaction_ids)
        unmatched = query

        all_amount_txns = list(AmountTransaction.objects.filter(
            tenant_id=tenant_id,
            ledger_id=bank_ledger_id,
            voucher__isnull=False
        ).select_related('voucher'))

        all_vouchers = list(Voucher.objects.filter(tenant_id=tenant_id))
        all_ledgers = list(MasterLedger.objects.filter(tenant_id=tenant_id).values_list('name', flat=True))
        sorted_ledgers = sorted([l for l in all_ledgers if l], key=len, reverse=True)
        
        payments_single = list(VoucherPaymentSingle.objects.filter(tenant_id=tenant_id))
        receipts_single = list(VoucherReceiptSingle.objects.filter(tenant_id=tenant_id))
        
        bank_ledger = MasterLedger.objects.get(id=bank_ledger_id, tenant_id=tenant_id)
        bank_ledger_name = bank_ledger.name

        heuristics = {
            "salary": "Salary Expense",
            "bank charges": "Bank Charges Expense",
            "interest": "Interest Income",
            "upi payment": "Expense Payment"
        }

        with db_transaction.atomic():
            for st_txn in unmatched.select_for_update():
                st_date = st_txn.transaction_date
                narration = str(st_txn.narration or '').lower()
                st_amount = float(st_txn.credit_amount or st_txn.debit_amount)
                ref_str = str(st_txn.reference_number or '').lower()

                # --- P1. EXISTING VOUCHER MATCH ---
                matched = False
                if st_txn.debit_amount > 0:
                    for vp in payments_single:
                        if (abs(float(vp.total_payment) - float(st_txn.debit_amount)) <= TOLERANCE and 
                            str(vp.pay_from).lower() == bank_ledger_name.lower() and 
                            abs((vp.date - st_date).days) <= 3):
                            st_txn.match_status = 'Matched'
                            st_txn.matched_voucher_id = vp.id
                            matched = True
                            break
                if not matched and st_txn.credit_amount > 0:
                    for vr in receipts_single:
                        if (abs(float(vr.total_receipt) - float(st_txn.credit_amount)) <= TOLERANCE and 
                            str(vr.receive_in).lower() == bank_ledger_name.lower() and 
                            abs((vr.date - st_date).days) <= 3):
                            st_txn.match_status = 'Matched'
                            st_txn.matched_voucher_id = vr.id
                            matched = True
                            break
                if matched:
                    st_txn.save()
                    continue

                # --- P2. REFERENCE NUMBER MATCH ---
                if ref_str:
                    for cand in all_amount_txns:
                        cand_code = str(cand.code or '').lower()
                        cand_vn = str(cand.voucher.voucher_number or '').lower() if cand.voucher else ''
                        if cand_code == ref_str or cand_vn == ref_str:
                            st_txn.match_status = 'Matched'
                            st_txn.matched_voucher_id = cand.voucher_id
                            matched = True
                            break
                if matched:
                    st_txn.save()
                    continue

                # --- P3. INVOICE NUMBER DETECTION ---
                import re
                invoice_match = re.search(r'(?i)inv-?\\d+', narration) or re.search(r'(?i)invoice\\s*#?\\d+', narration)
                if invoice_match:
                    found_inv = invoice_match.group(0).lower().replace(' ', '').replace('#', '').replace('-', '')
                    for v in all_vouchers:
                        if v.type in ['sales', 'purchase'] and v.voucher_number:
                            clean_vn = str(v.voucher_number).lower().replace(' ', '').replace('#', '').replace('-', '')
                            if found_inv in clean_vn or clean_vn in found_inv:
                                st_txn.match_status = 'Suggested'
                                st_txn.suggested_invoice = v.voucher_number
                                st_txn.suggested_party = v.party
                                matched = True
                                break
                if matched:
                    st_txn.save()
                    continue

                # --- P4. PARTY NAME MATCH ---
                for ledger in sorted_ledgers:
                    if len(str(ledger)) > 3 and str(ledger).lower() in narration:
                        st_txn.match_status = 'Possible Match'
                        st_txn.suggested_party = ledger
                        matched = True
                        break
                if matched:
                    st_txn.save()
                    continue

                # --- P5. NARRATION HEURISTICS ---
                for keyword, target_ledger in heuristics.items():
                    if keyword in narration:
                        st_txn.match_status = 'Suggested'
                        st_txn.suggested_party = target_ledger
                        matched = True
                        break
                if matched:
                    st_txn.save()
                    continue

                # Ensure it remains unmatched if no rules matched
                st_txn.match_status = 'Unmatched'
                st_txn.save()

        return {}
"""

content = content[:start_reconcile] + new_matching_logic + "\n" + content[end_reconcile:]

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Refactor complete!")
