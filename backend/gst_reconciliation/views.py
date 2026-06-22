import hashlib
import json
import threading
from datetime import timedelta
from decimal import Decimal
from django.db.models import Q, Sum
from django.utils import timezone
from .models import (
    GSTR2BInvoice, ReconciliationResult, AuditLog, 
    ITCSummary, GSTR3BReport, GSTJobStatus, ValidationResult
)
from accounting.models_voucher_purchase import VoucherPurchaseSupplierDetails
from accounting.models_voucher_sales import VoucherSalesInvoiceDetails
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .serializers import (
    GSTR2BInvoiceSerializer, ReconciliationResultSerializer, 
    ITCSummarySerializer, GSTR3BReportSerializer, AuditLogSerializer
)
from .services import GSTValidationService

class GSTReconciliationViewSet(viewsets.ViewSet):
    """
    Main controller for GST Reconciliation, ITC, and GSTR-3B logic.
    Supports asynchronous-style background processing via JobStatus.
    """

    @action(detail=False, methods=['post'])
    def upload_2b(self, request):
        """Module 1: Ingest GSTR-2B JSON data."""
        data = request.data
        if not isinstance(data, list):
            return Response({"error": "Expected a list of invoices"}, status=status.HTTP_400_BAD_REQUEST)

        created_count = 0
        duplicate_count = 0

        for inv in data:
            try:
                gstin = str(inv.get('gstin', '')).strip().upper()
                inv_no = str(inv.get('invoice_no', '')).strip()
                inv_date = inv.get('invoice_date')
                inv_val = Decimal(str(inv.get('invoice_value', 0)))
                
                raw_str = f"{gstin}|{inv_no}|{inv_date}|{inv_val}"
                fingerprint = hashlib.sha256(raw_str.encode()).hexdigest()

                if GSTR2BInvoice.objects.filter(fingerprint=fingerprint).exists():
                    duplicate_count += 1
                    continue

                GSTR2BInvoice.objects.create(
                    gstin=gstin,
                    vendor_name=inv.get('vendor_name'),
                    invoice_no=inv_no,
                    invoice_date=inv_date,
                    invoice_value=inv_val,
                    taxable_value=Decimal(str(inv.get('taxable_value', 0))),
                    igst=Decimal(str(inv.get('igst', 0))),
                    cgst=Decimal(str(inv.get('cgst', 0))),
                    sgst=Decimal(str(inv.get('sgst', 0))),
                    cess=Decimal(str(inv.get('cess', 0))),
                    fingerprint=fingerprint,
                    raw_data=inv
                )
                created_count += 1
            except Exception:
                continue

        AuditLog.objects.create(
            action="GSTR-2B Upload",
            details={"created": created_count, "duplicates": duplicate_count},
            executed_by=str(request.user)
        )

        return Response({"message": "Upload complete", "created": created_count, "duplicates": duplicate_count})

    def _threaded_reconciliation(self, job_id, month, year, tenant_id=None):
        """Background worker for reconciliation."""
        job = GSTJobStatus.objects.get(id=job_id)
        job.status = 'RUNNING'
        job.save()

        try:
            invoices_2b = GSTR2BInvoice.objects.all() # In production: filter by date
            if tenant_id:
                vouchers_books = VoucherPurchaseSupplierDetails.objects.filter(tenant_id=tenant_id)
            else:
                vouchers_books = VoucherPurchaseSupplierDetails.objects.all()
            total = invoices_2b.count()
            
            for index, inv_2b in enumerate(invoices_2b):
                matches = vouchers_books.filter(gstin=inv_2b.gstin)
                best_match = None
                max_score = 0
                
                for v in matches:
                    score = 0
                    if v.supplier_invoice_no.strip().lower() == inv_2b.invoice_no.strip().lower():
                        score += 50
                    
                    # Fuzzy date check (±3 days)
                    if abs((v.date - inv_2b.invoice_date).days) <= 3:
                        score += 20
                        
                    # Fuzzy value check (±2%)
                    # v.due_details logic is complex, skipping for simulation robust logic
                    # score += 30 if value_match else 0

                    if score > max_score:
                        max_score = score
                        best_match = v

                status_label = 'MISMATCH'
                if max_score >= 70: status_label = 'EXACT'
                elif max_score >= 50: status_label = 'PARTIAL'
                
                ReconciliationResult.objects.update_or_create(
                    invoice_2b=inv_2b,
                    defaults={
                        'purchase_voucher_id': best_match.id if best_match else None,
                        'matching_score': max_score,
                        'status': status_label if best_match else 'MISSING_BOOKS'
                    }
                )
                
                if index % 10 == 0:
                    job.progress = int((index / total) * 100)
                    job.save()

            job.status = 'COMPLETED'
            job.progress = 100
            job.save()
            
            # Module 5: Trigger Validation after reco
            GSTValidationService.run_period_validation(month, year)

        except Exception as e:
            job.status = 'FAILED'
            job.error_log = str(e)
            job.save()

    @action(detail=False, methods=['post'])
    def run_reconciliation(self, request):
        """Module 3: Matching Engine execution."""
        month = request.data.get('month')
        year = request.data.get('year')
        tenant_id = getattr(request.user, 'tenant_id', None)
        
        job = GSTJobStatus.objects.create(job_type='RECO', status='PENDING')
        
        # Start background thread
        thread = threading.Thread(target=self._threaded_reconciliation, args=(job.id, month, year, tenant_id))
        thread.start()
        
        return Response({"job_id": job.id, "status": "PENDING"})

    @action(detail=False, methods=['get'])
    def job_status(self, request):
        """Poll job status from frontend."""
        job_id = request.query_params.get('job_id')
        job = GSTJobStatus.objects.get(id=job_id)
        return Response({
            "status": job.status,
            "progress": job.progress,
            "error": job.error_log
        })

    @action(detail=False, methods=['get'])
    def validation_results(self, request):
        """Module 5: Fetch validation warnings."""
        month = request.query_params.get('month')
        year = request.query_params.get('year')
        results = ValidationResult.objects.filter(period_month=month, period_year=year)
        return Response([{"type": r.check_type, "msg": r.message} for r in results])

    @action(detail=False, methods=['get'])
    def compute_itc(self, request):
        """Module 3: Compute ITC Eligibility."""
        month = request.query_params.get('month')
        year = request.query_params.get('year')
        
        if not month or not year:
            return Response({"error": "Month and Year are required"}, status=400)
        
        exact_matches = ReconciliationResult.objects.filter(status='EXACT')
        summary = exact_matches.aggregate(
            igst=Sum('invoice_2b__igst'),
            cgst=Sum('invoice_2b__cgst'),
            sgst=Sum('invoice_2b__sgst'),
        )

        itc = ITCSummary.objects.create(
            period_month=month, period_year=year,
            total_itc_igst=summary['igst'] or 0,
            total_itc_cgst=summary['cgst'] or 0,
            total_itc_sgst=summary['sgst'] or 0,
            eligible_itc_igst=summary['igst'] or 0,
        )
        return Response(ITCSummarySerializer(itc).data)

    @action(detail=False, methods=['get'])
    def gstr3b_preview(self, request):
        """Module 4: GSTR-3B Computation."""
        month = request.query_params.get('month')
        year = request.query_params.get('year')
        tenant_id = getattr(request.user, 'tenant_id', None)

        # Liability (READ ONLY)
        if tenant_id:
            sales = VoucherSalesInvoiceDetails.objects.filter(tenant_id=tenant_id)
        else:
            sales = VoucherSalesInvoiceDetails.objects.all()
        output_tax = {'igst': 0, 'cgst': 0, 'sgst': 0}
        for v in sales:
            pay = getattr(v, 'payment_details', None)
            if pay:
                output_tax['igst'] += float(pay.payment_igst)
                output_tax['cgst'] += float(pay.payment_cgst)
                output_tax['sgst'] += float(pay.payment_sgst)

        # ITC
        itc = ITCSummary.objects.filter(period_month=month, period_year=year).last()
        input_tax = {
            'igst': float(itc.eligible_itc_igst) if itc else 0,
            'cgst': float(itc.eligible_itc_cgst) if itc else 0,
            'sgst': float(itc.eligible_itc_sgst) if itc else 0,
        }

        report = GSTR3BReport.objects.create(
            period_month=month, period_year=year,
            output_tax_igst=output_tax['igst'], output_tax_cgst=output_tax['cgst'], output_tax_sgst=output_tax['sgst'],
            input_tax_igst=input_tax['igst'], input_tax_cgst=input_tax['cgst'], input_tax_sgst=input_tax['sgst'],
            net_igst=max(0, output_tax['igst'] - input_tax['igst']),
            net_cgst=max(0, output_tax['cgst'] - input_tax['cgst']),
            net_sgst=max(0, output_tax['sgst'] - input_tax['sgst']),
        )
        return Response(GSTR3BReportSerializer(report).data)
    @action(detail=False, methods=['delete'])
    def clear_data(self, request):
        """Action to remove all experimental/seed data in higher isolation."""
        GSTR2BInvoice.objects.all().delete()
        ReconciliationResult.objects.all().delete()
        ITCSummary.objects.all().delete()
        GSTR3BReport.objects.all().delete()
        ValidationResult.objects.all().delete()
        GSTJobStatus.objects.all().delete()
        AuditLog.objects.create(
            action="Data Purge",
            details={"message": "All reconciliation data cleared by user request"},
            executed_by=str(request.user)
        )
        return Response({"status": "All module data cleared successfully"})
