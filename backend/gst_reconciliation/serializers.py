from rest_framework import serializers
from .models import GSTR2BInvoice, ReconciliationResult, ITCSummary, GSTR3BReport, AuditLog

class GSTR2BInvoiceSerializer(serializers.ModelSerializer):
    class Mirror:
        model = GSTR2BInvoice
        fields = '__all__'
    
    class Meta:
        model = GSTR2BInvoice
        fields = '__all__'

class ReconciliationResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReconciliationResult
        fields = '__all__'

class ITCSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = ITCSummary
        fields = '__all__'

class GSTR3BReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = GSTR3BReport
        fields = '__all__'

class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = '__all__'
