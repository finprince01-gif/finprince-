from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
import random

from accounting.models_voucher_sales import VoucherSalesInvoiceDetails, VoucherSalesItems
from core.models import Tenant

class Command(BaseCommand):
    help = 'Seed sales vouchers for current and previous month'

    def handle(self, *args, **kwargs):
        tenant = Tenant.objects.first()
        if not tenant:
            self.stdout.write(self.style.ERROR('No tenant found. Cannot seed.'))
            return

        today = timezone.now().date()
        
        # Calculate dates for current and previous month
        current_month_dates = [today - timedelta(days=i) for i in range(0, 10)]
        
        # Getting dates from previous month
        first_day_current = today.replace(day=1)
        last_day_prev = first_day_current - timedelta(days=1)
        prev_month_dates = [last_day_prev - timedelta(days=i) for i in range(0, 10)]

        customers = [
            {'name': 'ABC Corp Pvt Ltd', 'gstin': '07AABCU9603R1ZX'},
            {'name': 'XYZ Traders Ltd', 'gstin': '27AABCT3518Q1ZD'},
            {'name': 'Acme Solutions Inc', 'gstin': '29AADCB2230M1ZV'},
            {'name': 'Global Tech Enterprises', 'gstin': '33AAACG2115N1ZN'},
            {'name': 'Modern Industries', 'gstin': '24AAACM2894G1ZP'},
        ]

        items = [
            'Software License',
            'Consulting Services',
            'Hardware Equipment',
            'Annual Maintenance',
            'Cloud Hosting Services',
        ]

        def create_voucher(date, prefix, invoice_num):
            customer = random.choice(customers)
            item_name = random.choice(items)
            invoice_no = f"{prefix}-INV-{invoice_num:04d}"
            
            voucher = VoucherSalesInvoiceDetails.objects.create(
                tenant_id=tenant.id,
                date=date,
                sales_invoice_no=invoice_no,
                voucher_name='Sales Voucher',
                customer_name=customer['name'],
                gstin=customer['gstin'],
                place_of_supply='29',
                state_type='within',
                status='completed',
                gst_registered=''
            )
            
            # Create a sample item
            taxable_value = random.choice([5000, 10000, 15000, 25000, 50000])
            cgst = round(taxable_value * 0.09, 2)
            sgst = round(taxable_value * 0.09, 2)
            
            VoucherSalesItems.objects.create(
                tenant_id=tenant.id,
                invoice=voucher,
                item_name=item_name,
                qty=random.randint(1, 5),
                item_rate=taxable_value,
                taxable_value=taxable_value,
                cgst=cgst,
                sgst=sgst,
                invoice_value=taxable_value + cgst + sgst
            )
            return invoice_no

        counter = 1
        self.stdout.write(self.style.WARNING(f'Seeding for tenant: {tenant.name} ({tenant.id})'))
        
        self.stdout.write('Creating previous month vouchers...')
        for i in range(5):
            date = random.choice(prev_month_dates)
            inv = create_voucher(date, 'PREV', counter)
            counter += 1
            self.stdout.write(f'  ✓ Created {inv} on {date}')

        self.stdout.write('Creating current month vouchers...')
        for i in range(5):
            date = random.choice(current_month_dates)
            inv = create_voucher(date, 'CURR', counter)
            counter += 1
            self.stdout.write(f'  ✓ Created {inv} on {date}')

        self.stdout.write(self.style.SUCCESS('Successfully seeded 10 sales vouchers (5 previous month + 5 current month)!'))
