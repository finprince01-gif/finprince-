"""
Management command: seed_default_vouchers
Creates a default voucher series for every voucher type if none exists
for each tenant already in the system.

Usage:
    python manage.py seed_default_vouchers
"""
from django.core.management.base import BaseCommand
from django.utils import timezone


def get_current_fy_suffix() -> str:
    """
    Returns Indian financial year suffix as 'YY-YY'.
    FY runs 1 April → 31 March.
    e.g. May 2026 → '26-27', Apr 2027 → '27-28'
    """
    now = timezone.now()
    year = now.year
    month = now.month
    fy_start = year if month >= 4 else year - 1
    fy_end = fy_start + 1
    return f"{str(fy_start)[-2:]}-{str(fy_end)[-2:]}"


# (model_import_path, voucher_name, prefix)
DEFAULTS = [
    ('masters.voucher_master_models.MasterVoucherSales',       'Sales Voucher',    'SAL'),
    ('masters.voucher_master_models.MasterVoucherCreditNote',  'Credit Note',      'CRN'),
    ('masters.voucher_master_models.MasterVoucherReceipts',    'Receipt Voucher',  'REC'),
    ('masters.voucher_master_models.MasterVoucherPurchases',   'Purchase Voucher', 'PUR'),
    ('masters.voucher_master_models.MasterVoucherDebitNote',   'Debit Note',       'DBN'),
    ('masters.voucher_master_models.MasterVoucherPayments',    'Payment Voucher',  'PAY'),
    ('masters.voucher_master_models.MasterVoucherExpenses',    'Expense Voucher',  'EXP'),
    ('masters.voucher_master_models.MasterVoucherJournal',     'Journal Voucher',  'JRN'),
    ('masters.voucher_master_models.MasterVoucherContra',      'Contra Voucher',   'CON'),
]


def _import_model(dotted_path: str):
    parts = dotted_path.rsplit('.', 1)
    module = __import__(parts[0], fromlist=[parts[1]])
    return getattr(module, parts[1])


class Command(BaseCommand):
    help = 'Seed default voucher series for all existing tenants'

    def handle(self, *args, **options):
        fy = get_current_fy_suffix()
        self.stdout.write(f'Financial year suffix: {fy}')

        # Collect all tenant IDs from the Sales model (it's always present)
        try:
            SalesModel = _import_model('masters.voucher_master_models.MasterVoucherSales')
            tenant_ids = list(
                SalesModel.objects.values_list('tenant_id', flat=True).distinct()
            )
        except Exception as e:
            self.stderr.write(f'Could not resolve tenants: {e}')
            return

        if not tenant_ids:
            self.stdout.write(self.style.WARNING('No tenants found. Nothing to seed.'))
            return

        for model_path, voucher_name, prefix in DEFAULTS:
            try:
                Model = _import_model(model_path)
            except AttributeError:
                self.stdout.write(self.style.WARNING(f'Model not found: {model_path} — skipping'))
                continue

            for tenant_id in tenant_ids:
                exists = Model.objects.filter(
                    tenant_id=tenant_id,
                    voucher_name=voucher_name,
                ).exists()

                if not exists:
                    Model.objects.create(
                        tenant_id=tenant_id,
                        voucher_name=voucher_name,
                        prefix=prefix,
                        suffix=fy,
                        start_from=1,
                        current_number=None,
                        required_digits=4,
                        enable_auto_numbering=True,
                        is_active=True,
                    )
                    self.stdout.write(
                        self.style.SUCCESS(f'  Created "{voucher_name}" for tenant {tenant_id}')
                    )
                else:
                    self.stdout.write(f'  Already exists: "{voucher_name}" for tenant {tenant_id}')

        self.stdout.write(self.style.SUCCESS('Done.'))
