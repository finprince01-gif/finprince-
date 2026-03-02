"""
API Views for Services Management.
Provides CRUD operations for services.
"""

from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from .models import Service, ServiceGroup
from .serializers import ServiceSerializer, ServiceGroupSerializer
import logging

logger = logging.getLogger('services.views')


class ServiceViewSet(viewsets.ModelViewSet):
    """
    API ViewSet for Service CRUD operations.
    Provides list, create, retrieve, update, and delete endpoints.
    """
    queryset = Service.objects.all()
    serializer_class = ServiceSerializer
    # permission_classes = [AllowAny]  # TEMPORARY: For development
    permission_classes = [IsAuthenticated]  # Enable in production
    
    def get_queryset(self):
        """
        Optionally filter services by status or group for the user's tenant.
        """
        # Get tenant_id from authenticated user
        tenant_id = getattr(self.request.user, 'tenant_id', None)
        if not tenant_id:
            logger.warning("⚠️ No tenant_id found for user, returning empty queryset")
            return Service.objects.none()

        queryset = Service.objects.filter(tenant_id=tenant_id)
        
        # Filter by active status
        is_active = self.request.query_params.get('is_active', None)
        if is_active is not None:
            queryset = queryset.filter(is_active=str(is_active).lower() == 'true')
        
        # Filter by service group
        service_group = self.request.query_params.get('service_group', None)
        if service_group:
            queryset = queryset.filter(service_group__icontains=service_group)
        
        return queryset.order_by('-created_at')
    
    def list(self, request, *args, **kwargs):
        """List all services with optional filters"""
        try:
            queryset = self.get_queryset()
            serializer = self.get_serializer(queryset, many=True)
            logger.info(f"✅ Listed {len(serializer.data)} services")
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"❌ Error listing services: {type(e).__name__}: {str(e)}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def create(self, request, *args, **kwargs):
        """Create a new service"""
        try:
            # Get tenant_id from authenticated user
            tenant_id = getattr(request.user, 'tenant_id', None)
            if not tenant_id:
                return Response(
                    {'error': 'Tenant ID not found for user'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            service = serializer.save(tenant_id=tenant_id)
            
            logger.info(f"✅ Created service: {service.service_code} - {service.service_name}")
            
            return Response(
                serializer.data,
                status=status.HTTP_201_CREATED
            )
        except serializers.ValidationError as e:
            logger.warning(f"⚠️ Validation error creating service: {e.detail}")
            return Response(
                {'error': e.detail},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"❌ Error creating service: {type(e).__name__}: {str(e)}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def retrieve(self, request, *args, **kwargs):
        """Retrieve a single service by ID"""
        try:
            instance = self.get_object()
            serializer = self.get_serializer(instance)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"❌ Error retrieving service: {type(e).__name__}: {str(e)}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_404_NOT_FOUND
            )
    
    def update(self, request, *args, **kwargs):
        """Update an existing service"""
        try:
            partial = kwargs.pop('partial', False)
            instance = self.get_object()
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            service = serializer.save()
            
            logger.info(f"✅ Updated service: {service.service_code} - {service.service_name}")
            
            return Response(serializer.data)
        except serializers.ValidationError as e:
            logger.warning(f"⚠️ Validation error updating service: {e.detail}")
            return Response(
                {'error': e.detail},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"❌ Error updating service: {type(e).__name__}: {str(e)}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def destroy(self, request, *args, **kwargs):
        """Delete a service (Permanently remove from database)"""
        try:
            instance = self.get_object()
            service_code = instance.service_code
            
            # Hard delete - remove from database
            instance.delete()
            
            logger.info(f"✅ Permanently deleted service: {service_code}")
            
            return Response(
                {'message': f'Service {service_code} has been permanently deleted'},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            logger.error(f"❌ Error deleting service: {type(e).__name__}: {str(e)}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get only active services"""
        try:
            active_services = Service.objects.filter(is_active=True).order_by('-created_at')
            serializer = self.get_serializer(active_services, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"❌ Error getting active services: {str(e)}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ServiceGroupViewSet(viewsets.ModelViewSet):
    """
    API ViewSet for Service Group CRUD operations.
    """
    queryset = ServiceGroup.objects.all()
    serializer_class = ServiceGroupSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Get only active service groups for the user's tenant"""
        # Get tenant_id from authenticated user
        tenant_id = getattr(self.request.user, 'tenant_id', None)
        logger.info(f"🔍 Filtering service groups for tenant: {tenant_id}")
        
        if not tenant_id:
            logger.warning("⚠️ No tenant_id found, returning empty queryset")
            return ServiceGroup.objects.none()
        
        queryset = ServiceGroup.objects.filter(
            tenant_id=tenant_id,
            is_active=True
        ).order_by('category', 'group', 'subgroup')
        
        logger.info(f"📊 Found {queryset.count()} service groups for tenant {tenant_id}")
        return queryset

    def list(self, request, *args, **kwargs):
        """List all service groups"""
        try:
            queryset = self.get_queryset()
            serializer = self.get_serializer(queryset, many=True)
            logger.info(f"📋 Listing {len(serializer.data)} service groups")
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"❌ Error listing service groups: {type(e).__name__}: {str(e)}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


    def create(self, request, *args, **kwargs):
        """Create a new service group"""
        try:
            logger.info(f"📥 Received service group creation request: {request.data}")
            
            # Get tenant_id from authenticated user
            tenant_id = getattr(request.user, 'tenant_id', None)
            logger.info(f"🔑 Tenant ID: {tenant_id}")
            
            if not tenant_id:
                logger.error("❌ No tenant_id found for user")
                return Response(
                    {'error': 'Tenant ID not found for user'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            logger.info(f"📝 Creating serializer with data: {request.data}")
            serializer = self.get_serializer(data=request.data)
            
            logger.info(f"✔️ Validating serializer...")
            serializer.is_valid(raise_exception=True)
            
            logger.info(f"💾 Saving service group with tenant_id: {tenant_id}")
            group = serializer.save(tenant_id=tenant_id)
            
            logger.info(f"✅ Created service group: {group} (ID: {group.id})")
            
            return Response(
                serializer.data,
                status=status.HTTP_201_CREATED
            )
        except serializers.ValidationError as e:
            logger.warning(f"⚠️ Validation error creating service group: {e.detail}")
            return Response(
                {'error': e.detail},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"❌ Error creating service group: {type(e).__name__}: {str(e)}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    

