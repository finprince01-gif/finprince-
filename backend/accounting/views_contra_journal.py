from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models_voucher_contra import VoucherContra
from .models_voucher_journal import VoucherJournal
from .serializers_contra_journal import VoucherContraSerializer, VoucherJournalSerializer
from core.utils import TenantQuerysetMixin

class VoucherContraViewSet(TenantQuerysetMixin, viewsets.ModelViewSet):
    """
    ViewSet for Contra Vouchers.
    """
    serializer_class = VoucherContraSerializer
    permission_classes = [IsAuthenticated]
    queryset = VoucherContra.objects.all()

class VoucherJournalViewSet(TenantQuerysetMixin, viewsets.ModelViewSet):
    """
    ViewSet for Journal Vouchers.
    """
    serializer_class = VoucherJournalSerializer
    permission_classes = [IsAuthenticated]
    queryset = VoucherJournal.objects.all()
