import re
from decimal import Decimal
from .models import ValidationResult, GSTR3BReport, ITCSummary
from accounting.models_voucher_sales import VoucherSalesInvoiceDetails

class GSTValidationService:
    @staticmethod
    def validate_gstin(gstin):
        """Simple GSTIN pattern check."""
        pattern = r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'
        return bool(re.match(pattern, gstin))

    @staticmethod
    def run_period_validation(month, year):
        """Module 5: Validation Layer logic."""
        results = []
        
        # 1. Invalid GSTIN Check in 2B Invoices
        from .models import GSTR2BInvoice
        invalid_gstins = GSTR2BInvoice.objects.all().filter(invoice_date__year=2024) # Placeholder filter
        for inv in invalid_gstins:
            if not GSTValidationService.validate_gstin(inv.gstin):
                results.append(ValidationResult.objects.create(
                    period_month=month, period_year=year,
                    check_type="GSTIN_VALIDATION",
                    message=f"Invalid GSTIN '{inv.gstin}' found in invoice {inv.invoice_no}"
                ))

        # 2. GSTR-1 vs 3B Mismatch
        report_3b = GSTR3BReport.objects.filter(period_month=month, period_year=year).last()
        if report_3b:
            # Re-sum GSTR-1 (Mock logic for comparison)
            # In real system, we'd pull direct from GSTR1ViewSet logic
            sales = VoucherSalesInvoiceDetails.objects.all()
            total_sales_igst = sum([getattr(v.payment_details, 'payment_igst', 0) for v in sales])
            
            if abs(total_sales_igst - float(report_3b.output_tax_igst)) > 1:
                 results.append(ValidationResult.objects.create(
                    period_month=month, period_year=year,
                    check_type="TAX_MISMATCH",
                    message=f"GSTR-1 Liability (₹{total_sales_igst}) differs from 3B (₹{report_3b.output_tax_igst})"
                ))

        # 3. Negative Value Check
        # ... logic ...

        return results
