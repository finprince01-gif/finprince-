from django.core.management.base import BaseCommand
from django.utils import timezone
from accounting.models import SalesVoucher, ReceiptVoucherType, MasterLedger
from core.models import Tenant
import datetime
from decimal import Decimal
import random

class Command(BaseCommand):
    help = 'Seeds sample SalesVoucher data for GSTR1 testing (Jan 2025, Feb 2025, Today)'

    def handle(self, *args, **kwargs):
        self.stdout.write("Seeding GSTR1 data...")
        
        # 1. Tenant
        # Prioritize 'Demo Company' as seen in user screenshots
        tenant = Tenant.objects.filter(name='Demo Company').first()
        if not tenant:
            self.stdout.write("Demo Company not found, falling back to first tenant.")
            tenant = Tenant.objects.first()

        if not tenant:
            self.stdout.write(self.style.ERROR("No tenant found. Please create a tenant first."))
            return

        self.stdout.write(f"Using Tenant: {tenant.name} ({tenant.id})")

        # 2. Voucher Type
        v_type, _ = ReceiptVoucherType.objects.get_or_create(
            name='Sales Invoice',
            tenant_id=tenant.id,
            defaults={'tenant_id': tenant.id}
        )

        # 3. Create B2B Customer (Registered)
        b2b_customer, _ = MasterLedger.objects.get_or_create(
            name='Tech Solutions Pvt Ltd',
            tenant_id=tenant.id,
            defaults={
                'ledger_type': 'customer', 
                'group': 'Sundry Debtors',
                'category': 'Current Assets',
                'gstin': '29AAACH7409R1Z5', # Karnataka
                'state': 'Karnataka',
            }
        )

        # 4. Create B2B Invoice (Jan 15, 2025) - For "2024-25 January"
        date_jan = datetime.date(2025, 1, 15)
        invoice_no_jan = f'INV-25-JAN-{random.randint(10000, 99999)}'
        
        SalesVoucher.objects.create(
            tenant_id=tenant.id,
            date=date_jan,
            voucher_type=v_type,
            sales_invoice_number=invoice_no_jan,
            customer=b2b_customer,
            bill_to_address='Electronic City, Bangalore',
            bill_to_gstin='29AAACH7409R1Z5',
            bill_to_state='Karnataka',
            place_of_supply='29',
            tax_type='within_state',
            total_taxable_amount=Decimal('50000.00'),
            total_cgst=Decimal('4500.00'),
            total_sgst=Decimal('4500.00'),
            total_igst=Decimal('0.00'),
            grand_total=Decimal('59000.00'),
            status='completed',
            voucher_name='Seed Jan Voucher',
            outward_slip_no=f'SLIP-{random.randint(100,999)}'
        )
        self.stdout.write(self.style.SUCCESS(f"Created B2B Invoice (Jan 2025): {invoice_no_jan}"))

        # 5. Create B2B Invoice (Feb 15, 2025) - For "2024-25 February"
        date_feb = datetime.date(2025, 2, 15)
        invoice_no_feb = f'INV-25-FEB-{random.randint(10000, 99999)}'
        
        SalesVoucher.objects.create(
            tenant_id=tenant.id,
            date=date_feb,
            voucher_type=v_type,
            sales_invoice_number=invoice_no_feb,
            customer=b2b_customer,
            bill_to_address='Electronic City, Bangalore', # Same customer
            bill_to_gstin='29AAACH7409R1Z5',
            bill_to_state='Karnataka',
            place_of_supply='29',
            tax_type='within_state',
            total_taxable_amount=Decimal('2000.00'),
            total_cgst=Decimal('180.00'),
            total_sgst=Decimal('180.00'),
            total_igst=Decimal('0.00'),
            grand_total=Decimal('2360.00'),
            status='completed',
            voucher_name='Seed Feb Voucher',
            outward_slip_no=f'SLIP-{random.randint(100,999)}'
        )
        self.stdout.write(self.style.SUCCESS(f"Created B2B Invoice (Feb 2025): {invoice_no_feb}"))

        # 6. Create B2B Invoice (Today)
        date_now = timezone.now().date()
        invoice_no_now = f'INV-NOW-{random.randint(10000, 99999)}'
        
        SalesVoucher.objects.create(
            tenant_id=tenant.id,
            date=date_now,
            voucher_type=v_type,
            sales_invoice_number=invoice_no_now,
            customer=b2b_customer,
            bill_to_address='Electronic City, Bangalore',
            bill_to_gstin='29AAACH7409R1Z5',
            bill_to_state='Karnataka',
            place_of_supply='29',
            tax_type='within_state',
            total_taxable_amount=Decimal('10000.00'),
            total_cgst=Decimal('900.00'),
            total_sgst=Decimal('900.00'),
            total_igst=Decimal('0.00'),
            grand_total=Decimal('11800.00'),
            status='completed',
            voucher_name='Seed Today Voucher',
            outward_slip_no=f'SLIP-{random.randint(100,999)}'
        )
        self.stdout.write(self.style.SUCCESS(f"Created B2B Invoice (Today): {invoice_no_now}"))

        # 7. B2CL (Inter-state)
        b2c_customer, _ = MasterLedger.objects.get_or_create(
            name='John Doe (Consumer)',
            tenant_id=tenant.id,
            defaults={
                'ledger_type': 'customer',
                'group': 'Sundry Debtors',
                'category': 'Current Assets',
                'gstin': '', 
                'state': 'Maharashtra',
            }
        )
        
        invoice_no_b2cl = f'INV-B2CL-{random.randint(10000, 99999)}'
        SalesVoucher.objects.create(
            tenant_id=tenant.id,
            date=date_jan, # Jan 2025
            voucher_type=v_type,
            sales_invoice_number=invoice_no_b2cl,
            customer=b2c_customer,
            bill_to_address='Mumbai',
            bill_to_gstin='',
            bill_to_state='Maharashtra',
            place_of_supply='27',
            tax_type='other_state',
            total_taxable_amount=Decimal('300000.00'),
            total_igst=Decimal('54000.00'),
            total_cgst=Decimal('0.00'),
            total_sgst=Decimal('0.00'),
            grand_total=Decimal('354000.00'),
            status='completed',
            voucher_name='Seed B2CL Voucher',
            invoice_type='Regular' # Ensure type is set
        )
        self.stdout.write(self.style.SUCCESS(f"Created B2CL Invoice (Jan 2025): {invoice_no_b2cl}"))

        self.stdout.write(self.style.SUCCESS("Seeding Completed Successfully."))
