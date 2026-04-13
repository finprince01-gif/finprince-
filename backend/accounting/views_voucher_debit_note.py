"""
views_voucher_debit_note.py
============================
ViewSet for Debit Note Vouchers + supporting read-only API endpoints:

  GET /api/accounting/vouchers/debit-note/                   → list
  POST /api/accounting/vouchers/debit-note/                  → create (full posting)
  GET  /api/accounting/vouchers/debit-note/{id}/             → retrieve
  PUT  /api/accounting/vouchers/debit-note/{id}/             → update (re-post)
  GET  /api/accounting/vouchers/debit-note/{id}/allocation/  → bill allocation view
  GET  /api/accounting/vouchers/debit-note/applied-now/      → per-invoice applied-now calc
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models_voucher_debit_note import VoucherDebitNoteSupplierDetails
from .serializers_voucher_debit_note import VoucherDebitNoteSupplierDetailsSerializer
from core.tenant import get_tenant_from_request


# ---------------------------------------------------------------------------
# Main ViewSet
# ---------------------------------------------------------------------------

class VoucherDebitNoteViewSet(viewsets.ModelViewSet):
    """
    Full CRUD for Debit Note Vouchers.
    On create / update the full posting pipeline fires automatically
    inside the serializer.
    """

    serializer_class = VoucherDebitNoteSupplierDetailsSerializer

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        if not tenant_id:
            return VoucherDebitNoteSupplierDetails.objects.none()

        qs = VoucherDebitNoteSupplierDetails.objects.filter(
            tenant_id=tenant_id
        ).select_related("item_details", "due_details", "transit_details")

        vendor_name = self.request.query_params.get("vendor_name")
        if vendor_name:
            qs = qs.filter(vendor_name__icontains=vendor_name)

        return qs.order_by("-date", "-created_at")

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        serializer.save(tenant_id=tenant_id)

    # ------------------------------------------------------------------
    # /api/accounting/vouchers/debit-note/{id}/allocation/
    # ------------------------------------------------------------------

    @action(detail=True, methods=["get"], url_path="allocation")
    def allocation_view(self, request, pk=None):
        """
        Returns the bill allocation ledger entries for this Debit Note.
        Mirrors the spec layout:
          Date | Posted From | Reference No. | Net Amount | Voucher Applied (Date, RefNo, Amount, Pending) | Status
        """
        tenant_id = get_tenant_from_request(request)
        instance = self.get_object()

        try:
            from .models import PendingTransaction, AllocationLink
            from .models import Voucher

            dn_number  = instance.debit_note_no or f"DN-{instance.id}"
            dn_voucher = Voucher.objects.filter(
                tenant_id=tenant_id, type="debit_note", reference_id=instance.id
            ).first()

            dn_tx = PendingTransaction.objects.filter(
                tenant_id=tenant_id,
                reference_number=dn_number,
                reference_type="DEBIT_NOTE",
            ).first()

            dn_links = AllocationLink.objects.filter(
                tenant_id=tenant_id,
                source_reference_number=dn_number,
                source_reference_type="DEBIT_NOTE",
            ).order_by("created_at")

            # Build the allocation rows
            voucher_applied_rows = []
            running_balance = float(dn_tx.original_amount) if dn_tx else 0

            for link in dn_links:
                applied = float(link.amount_applied)
                running_balance -= applied
                voucher_applied_rows.append({
                    "date":           link.source_reference_date,
                    "referenceNo":    link.target_reference_number,
                    "amount":         applied,
                    "pendingBalance": running_balance,
                })

            result = {
                "debitNoteNumber": dn_number,
                "date":            str(instance.date),
                "vendor":          instance.vendor_name,
                "netAmount":       float(dn_tx.original_amount) if dn_tx else 0,
                "status":          dn_tx.status if dn_tx else "—",
                "voucherApplied":  voucher_applied_rows,
            }
            return Response(result)

        except Exception as exc:
            return Response(
                {"error": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # ------------------------------------------------------------------
    # /api/accounting/vouchers/debit-note/applied-now/
    # Query params: supplier_invoice_no, dn_taxable_value
    # ------------------------------------------------------------------

    @action(detail=False, methods=["get"], url_path="applied-now")
    def applied_now(self, request):
        """
        Returns the auto-calculated Applied Now amount for a given Supplier
        Invoice No., taking into account its TCS / TDS setup.

        Query params
        ------------
        supplier_invoice_no : str
        dn_taxable_value    : float   (taxable value returned in this debit note for that invoice)
        reverse_tcs         : 'Yes'|'No'
        reverse_tds         : 'Yes'|'No'
        """
        from .services.debit_note_service import (
            _fetch_purchase_tds_tcs,
            compute_tds_tcs_reversals,
        )
        from decimal import Decimal

        tenant_id      = get_tenant_from_request(request)
        inv_no         = request.query_params.get("supplier_invoice_no", "")
        dn_taxable     = Decimal(str(request.query_params.get("dn_taxable_value", 0) or 0))
        reverse_tcs    = request.query_params.get("reverse_tcs", "No").lower() in ("yes", "true", "1")
        reverse_tds    = request.query_params.get("reverse_tds", "No").lower() in ("yes", "true", "1")

        try:
            pinfo = _fetch_purchase_tds_tcs(inv_no, tenant_id)
            reversals = compute_tds_tcs_reversals(
                dn_taxable_value=dn_taxable,
                reverse_tcs_flag=reverse_tcs,
                reverse_tds_flag=reverse_tds,
                purchase_info=pinfo,
            )
            return Response({
                "supplierInvoiceNo": inv_no,
                "tcsReversed":       float(reversals["tcs_reversed"]),
                "tdsReversed":       float(reversals["tds_reversed"]),
                "purchaseLedger":    pinfo.get("purchase_ledger"),
                "originalTaxable":   float(pinfo.get("taxable_value", 0)),
            })
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
