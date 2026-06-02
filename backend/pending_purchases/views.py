import logging
from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import PendingPurchase
from django.db import transaction

logger = logging.getLogger(__name__)

class PendingPurchaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = PendingPurchase
        fields = '__all__'

class PendingPurchaseViewSet(viewsets.ModelViewSet):
    queryset = PendingPurchase.objects.all()
    serializer_class = PendingPurchaseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = getattr(self.request.user, 'branch_id', None)
        if not tenant_id:
            tenant_id = getattr(self.request.user, 'tenant_id', None)
            
        logger.info(f"[PENDING_QUEUE_FETCH] Fetching pending purchases for tenant: {tenant_id}")
            
        qs = PendingPurchase.objects.filter(company_id=tenant_id)
        
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(pending_purchase_status=status_param)
            
        return qs.order_by('-created_at')

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        try:
            with transaction.atomic():
                pp = self.get_object()
                logger.info(f"[PENDING_QUEUE_RESOLVE] resolving invoice={pp.invoice_number} source_row={pp.source_scan_row_id} current_status={pp.pending_purchase_status}")
                
                # Dummy implementation to show resolve state
                pp.pending_purchase_status = 'RESOLVED'
                pp.save()
                
                logger.info(f"[PENDING_QUEUE_FINALIZED] pending purchase {pp.id} resolved and finalized.")
                return Response({'status': 'resolved'})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
