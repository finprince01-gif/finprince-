from django.core.management.base import BaseCommand
from django.utils import timezone
from core.models import Tenant
from accounting.models import MasterLedger
from accounting.models_voucher_sales import (
    VoucherSalesInvoiceDetails, VoucherSalesItems, VoucherSalesPaymentDetails,
    VoucherSalesDispatchDetails, VoucherSalesEwayBill, VoucherSalesItemsForeign
)
import random
import datetime

class Command(BaseCommand):
    help = 'Seeds GSTR1 Sales Data (All Tables) for Jan 2025'

    def handle(self, *args, **kwargs):
        self.stdout.write("Seeding GSTR1 Data (All Tables)...")

        # 1. Get Tenant
        tenant = Tenant.objects.first()
        if not tenant:
            self.stdout.write(self.style.ERROR("No Tenant found. Create a tenant first."))
            return
        
        tenant_id = tenant.id
        self.stdout.write(f"Using Tenant: {tenant.name} ({tenant_id})")

        # 2. Customer Helper
        def get_or_create_customer(name, gstin, state, reg_type):
            cust, _ = MasterLedger.objects.get_or_create(
                tenant_id=tenant_id,
                name=name,
                defaults={
                    'group': 'Sundry Debtors',
                    'category': 'Assets',
                    'gstin': gstin,
                    'state': state,
                    'registration_type': reg_type
                }
            )
            if gstin and not cust.gstin: 
                cust.gstin = gstin
                cust.save()
            return cust

        b2b_cust = get_or_create_customer("Tech Solutions (B2B)", "29ABCDE1234F1Z5", "Karnataka", "Registered")
        b2cl_cust = get_or_create_customer("Mumbai Large (B2CL)", "", "Maharashtra", "Unregistered")
        b2c_cust = get_or_create_customer("Local Small (B2C)", "", "Karnataka", "Unregistered")
        exp_cust = get_or_create_customer("Foreign Client (EXP)", "", "Other Territory", "Unregistered")

        base_date = datetime.date(2025, 1, 1)

        # 3. Create Invoice Helper
        def create_invoice(inv_no, date, cust, taxable, is_interstate=False, is_export=False):
            # Check exist and delete to ensure full re-seed (with new tables)
            existing = VoucherSalesInvoiceDetails.objects.filter(tenant_id=tenant_id, sales_invoice_no=inv_no)
            if existing.exists():
                self.stdout.write(f"Re-seeding {inv_no}...")
                existing.delete()

            # Calc Tax
            rate = 18
            tax = taxable * (rate / 100)
            
            igst = 0
            cgst = 0
            sgst = 0
            cess = 0
            
            if is_export:
                igst = tax # WPAY
                state_type = 'export'
                tax_type = 'export'
                pos = '97' # Other Territory
            elif is_interstate:
                igst = tax
                state_type = 'other'
                tax_type = 'other_state'
                pos = '27' # Maharashtra
            else:
                cgst = tax/2
                sgst = tax/2
                state_type = 'within'
                tax_type = 'within_state'
                pos = '29' # Karnataka

            total = taxable + igst + cgst + sgst

            # Header
            invoice = VoucherSalesInvoiceDetails.objects.create(
                tenant_id=tenant_id,
                date=date,
                sales_invoice_no=inv_no,
                customer_name=cust.name,
                gstin=cust.gstin,
                bill_to=f"Address of {cust.name}",
                state_type=state_type,
                tax_type=tax_type,
                export_type='WPAY' if is_export else None
            )

            # Items & Foreign Items
            if is_export:
                VoucherSalesItemsForeign.objects.create(
                    tenant_id=tenant_id,
                    invoice=invoice,
                    description="Software Export",
                    quantity=1,
                    uqc="OTH",
                    rate=taxable,
                    amount=taxable # USD logic omitted for simplicity
                )
            else:
                VoucherSalesItems.objects.create(
                    tenant_id=tenant_id,
                    invoice=invoice,
                    item_name="Service Item",
                    qty=1,
                    uom="Nos",
                    item_rate=taxable,
                    taxable_value=taxable,
                    igst=igst, cgst=cgst, cess=0,
                    invoice_value=total
                )

            # Payment Details
            VoucherSalesPaymentDetails.objects.create(
                tenant_id=tenant_id,
                invoice=invoice,
                payment_taxable_value=taxable,
                payment_igst=igst,
                payment_cgst=cgst,
                payment_sgst=sgst,
                payment_invoice_value=total
            )

            # Dispatch Details (OneToOne)
            VoucherSalesDispatchDetails.objects.create(
                tenant_id=tenant_id,
                invoice=invoice,
                dispatch_from="Bangalore Warehouse",
                mode_of_transport="Road" if not is_export else "Air",
                vehicle_no="KA01AB1234" if not is_export else "",
                transporter_name="Fast Logistics",
                dispatch_date=date,
                
                # Export specific
                beyond_port_dest_country="USA" if is_export else None,
                beyond_port_port_of_discharge="New York" if is_export else None
            )

            # E-Way Bill (OneToOne) - logical for > 50k
            if taxable > 50000 and not is_export:
                VoucherSalesEwayBill.objects.create(
                    tenant_id=tenant_id,
                    invoice=invoice,
                    eway_bill_available="Yes",
                    eway_bill_no=f"EWB-{random.randint(100000, 999999)}",
                    eway_bill_date=date,
                    distance="500",
                    validity_period="5 Days"
                )

            self.stdout.write(self.style.SUCCESS(f"Created {inv_no}"))

        # 4. Generate Data for FY 2024-25 (Jan 2025)
        # B2B (Standard)
        for i in range(1, 3):
            create_invoice(
                f"INV-24-JAN-B2B-{i:03d}", 
                datetime.date(2025, 1, i*5), 
                b2b_cust, 
                60000 * i,
                is_interstate=False
            )

        # B2CS
        create_invoice(
            "INV-24-JAN-B2CS-001",
            datetime.date(2025, 1, 15),
            b2c_cust,
            5000,
            is_interstate=False
        )

        # --- Generate Data for FY 2025-26 (Jan/Feb 2026) ---
        # January 2026
        for i in range(1, 4):
            create_invoice(
                f"INV-25-JAN-B2B-{i:03d}", 
                datetime.date(2026, 1, i*8), 
                b2b_cust, 
                75000 * i,
                is_interstate=False
            )
        
        create_invoice(
            "INV-25-JAN-B2CL-001",
            datetime.date(2026, 1, 20),
            b2cl_cust,
            270000,
            is_interstate=True
        )

        # February 2026 (Present Month)
        create_invoice(
            f"INV-25-FEB-B2B-001", 
            datetime.date(2026, 2, 2), 
            b2b_cust, 
            90000,
            is_interstate=False
        )

        # Export (In 2026)
        create_invoice(
            "INV-25-JAN-EXP-001",
            datetime.date(2026, 1, 25),
            exp_cust,
            400000,
            is_export=True
        )

        self.stdout.write(self.style.SUCCESS("Full Seeding Complete (2024-25 and 2025-26 populated)"))
