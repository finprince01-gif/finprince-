"""
Management command to backfill missing journal entries for all Payment and Receipt vouchers.
Run: python manage.py backfill_journal_entries
"""
from django.core.management.base import BaseCommand
from decimal import Decimal
from accounting.models import Transaction, JournalEntry
from accounting.services.ledger_service import post_transaction


class Command(BaseCommand):
    help = 'Backfill missing double-entry journal records for all Payment/Receipt vouchers.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Print what would be done without writing to DB.'
        )
        parser.add_argument(
            '--all', action='store_true',
            help='Re-post ALL transactions, not just those missing journal entries.'
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        force_all = options['all']
        ok = 0
        skipped = 0
        failed = 0

        transactions = Transaction.objects.all().order_by('id')

        for txn in transactions:
            # Skip if already has journal entries (unless --all)
            has_entries = JournalEntry.objects.filter(
                voucher_type=txn.transaction_type,
                voucher_id=txn.id
            ).exists()
            if has_entries and not force_all:
                skipped += 1
                continue

            try:
                entries = self._build_entries(txn)
                if not entries:
                    self.stdout.write(
                        self.style.WARNING(
                            f'  SKIP txn {txn.id} ({txn.transaction_type} {txn.voucher_number}) '
                            f'- could not resolve ledgers'
                        )
                    )
                    skipped += 1
                    continue

                if dry_run:
                    self.stdout.write(
                        f'  DRY-RUN: would post {len(entries)} entries for txn '
                        f'{txn.id} ({txn.transaction_type} {txn.voucher_number})'
                    )
                    ok += 1
                    continue

                post_transaction(
                    voucher_type=txn.transaction_type,
                    voucher_id=txn.id,
                    tenant_id=txn.tenant_id,
                    entries=entries,
                    transaction_date=txn.date,
                    voucher_number=txn.voucher_number
                )
                self.stdout.write(
                    self.style.SUCCESS(
                        f'  OK: txn {txn.id} ({txn.transaction_type} {txn.voucher_number}) '
                        f'- {len(entries)} journal entries posted'
                    )
                )
                ok += 1
            except Exception as e:
                import traceback
                self.stdout.write(
                    self.style.ERROR(
                        f'  FAIL: txn {txn.id} ({txn.transaction_type} {txn.voucher_number}) '
                        f'- {e}\n{traceback.format_exc()}'
                    )
                )
                failed += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'\nDone. Posted: {ok}, Skipped: {skipped}, Failed: {failed}'
            )
        )

    def _build_entries(self, txn):
        """
        Build the list of double-entry dicts for a Transaction.
        Returns [] if the ledger data is insufficient.
        """
        total = Decimal(str(txn.total_amount or 0))
        if total <= 0:
            return []

        items = list(txn.get_items())

        if txn.transaction_type == 'PAYMENT':
            return self._build_payment_entries(txn, items, total)
        elif txn.transaction_type == 'RECEIPT':
            return self._build_receipt_entries(txn, items, total)
        return []

    def _build_payment_entries(self, txn, items, total):
        """
        PAYMENT:
          Debit  → each pay_to_ledger (who we paid)
          Credit → pay_from_ledger   (our bank/cash goes out)
        """
        entries = []
        total_debit = Decimal('0')

        for item in items:
            lid = (
                item.pay_to_ledger_id
                or item.pay_to_ledger_id_val
                or (item.pay_to_ledger.id if item.pay_to_ledger else None)
            )
            amt = Decimal(str(item.amount or 0))
            if lid and amt > 0:
                total_debit += amt
                entries.append({
                    'ledger_id': lid,
                    'debit': float(amt),
                    'credit': 0,
                })

        # Fallback: if no items resolved, use header-level pay_to_ledger
        if not entries and txn.pay_to_ledger_id:
            entries.append({
                'ledger_id': txn.pay_to_ledger_id,
                'debit': float(total),
                'credit': 0,
            })
            total_debit = total

        pay_from_id = (
            txn.pay_from_ledger_id
            or txn.pay_from_ledger_id_val
        )
        if total_debit > 0 and pay_from_id:
            entries.append({
                'ledger_id': pay_from_id,
                'debit': 0,
                'credit': float(total_debit),
            })

        return entries if len(entries) >= 2 else []

    def _build_receipt_entries(self, txn, items, total):
        """
        RECEIPT:
          Debit  → pay_to_ledger (our bank/cash account receives money)
          Credit → pay_from_ledger / item customer ledger (the party who paid us)
        """
        entries = []

        # Debit: receive_in = pay_to_ledger on Transaction
        receive_in_id = (
            txn.pay_to_ledger_id
            or txn.receive_in_ledger_id_val
        )
        if not receive_in_id:
            return []

        entries.append({
            'ledger_id': receive_in_id,
            'debit': float(total),
            'credit': 0,
        })

        # Credit: party side
        credit_map = {}
        for item in items:
            lid = (
                item.ledger_id_val
                or (item.pay_from_ledger.id if item.pay_from_ledger else None)
                or item.receive_from_ledger_id_val
            )
            amt = Decimal(str(item.amount or 0))
            if lid and amt > 0:
                credit_map[lid] = credit_map.get(lid, Decimal('0')) + amt

        # Fallback to header pay_from_ledger
        if not credit_map and txn.pay_from_ledger_id:
            credit_map[txn.pay_from_ledger_id] = total

        for lid, amt in credit_map.items():
            entries.append({
                'ledger_id': lid,
                'debit': 0,
                'credit': float(amt),
            })

        return entries if len(entries) >= 2 else []
