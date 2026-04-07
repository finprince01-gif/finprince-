from rest_framework import viewsets
from .models_voucher_debit_note import VoucherDebitNoteSupplierDetails
from .serializers_voucher_debit_note import VoucherDebitNoteSupplierDetailsSerializer
from core.tenant import get_tenant_from_request

class VoucherDebitNoteViewSet(viewsets.ModelViewSet):
    """
    ViewSet for handling Debit Note Vouchers.
    """
    serializer_class = VoucherDebitNoteSupplierDetailsSerializer

    def get_queryset(self):
        tenant_id = get_tenant_from_request(self.request)
        if not tenant_id:
            return VoucherDebitNoteSupplierDetails.objects.none()

        queryset = VoucherDebitNoteSupplierDetails.objects.filter(tenant_id=tenant_id).select_related(
            'supply_details', 'due_details', 'transit_details'
        )

        vendor_name = self.request.query_params.get('vendor_name')
        if vendor_name:
            queryset = queryset.filter(vendor_name=vendor_name)
            
        return queryset.order_by('-date', '-created_at')

    def perform_create(self, serializer):
        tenant_id = get_tenant_from_request(self.request)
        serializer.save(tenant_id=tenant_id)
