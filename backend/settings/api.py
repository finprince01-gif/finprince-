"""
Settings API Layer - HTTP Routing ONLY
NO business logic, NO RBAC, NO tenant validation.
Only HTTP handling - all logic delegated to flow.py
"""

from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from core.models import CompanyFullInfo
from core.serializers import CompanySettingsSerializer
from . import flow


# ============================================================================
# COMPANY SETTINGS VIEWSET
# ============================================================================

class CompanySettingsViewSet(viewsets.ModelViewSet):
    """
    API endpoints for company settings.
    All logic delegated to flow layer.
    """
    queryset = CompanyFullInfo.objects.all()
    serializer_class = CompanySettingsSerializer
    permission_classes = [IsAuthenticated]

    parser_classes = (MultiPartParser, FormParser, JSONParser)
    
    def get_queryset(self):
        """Delegate to flow layer."""
        return flow.list_company_settings(self.request.user)
    
    def create(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        settings = flow.create_company_settings(request.user, serializer.validated_data)
        
        response_serializer = self.get_serializer(settings)
        headers = self.get_success_headers(response_serializer.data)
        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED,
            headers=headers
        )
    
    def update(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        
        settings = flow.update_company_settings(
            request.user,
            instance.id,
            serializer.validated_data
        )
        
        response_serializer = self.get_serializer(settings)
        return Response(response_serializer.data)
    
    def destroy(self, request, *args, **kwargs):
        """Delegate to flow layer."""
        instance = self.get_object()
        flow.delete_company_settings(request.user, instance.id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserTablesViewSet(viewsets.ViewSet):
    """
    API endpoint for user tables schema/metadata for AI.
    Currently returns empty list as models are not fully defined.
    """
    permission_classes = [AllowAny]
    
    def list(self, request):
        # Return empty list or mock data
        return Response([])
