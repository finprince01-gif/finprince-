from rest_framework import viewsets
from .models_voucher_credit_note import VoucherCreditNoteInvoiceDetails
from .serializers_voucher_credit_note import VoucherCreditNoteInvoiceDetailsSerializer
from core.tenant import get_tenant_from_request

class VoucherCreditNoteViewSet(viewsets.ModelViewSet):
    """
    CRUD for Credit Note Vouchers.
    """
    serializer_class = VoucherCreditNoteInvoiceDetailsSerializer

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        if not tenant_id:
            return VoucherCreditNoteInvoiceDetails.objects.none()
        
        return VoucherCreditNoteInvoiceDetails.objects.filter(
            tenant_id=tenant_id
        ).select_related('item_details', 'due_details', 'transit_details')

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        serializer.save(tenant_id=tenant_id)
