from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from core.tenant import get_tenant_from_request
from .models import VendorMasterCategory
from .vendorcategory_serializers import VendorMasterCategorySerializer


class VendorMasterCategoryViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Vendor Master Category
    Provides CRUD operations for vendor categories
    """
    serializer_class = VendorMasterCategorySerializer
    
    def get_queryset(self):
        """Filter by tenant_id from request. Only filter is_active for list/tree."""
        tenant_id = get_tenant_from_request(self.request)
        qs = VendorMasterCategory.objects.filter(tenant_id=tenant_id) if tenant_id else VendorMasterCategory.objects.all()
        
        if self.action in ['list', 'tree']:
            return qs.filter(is_active=True)
        return qs
    
    def perform_create(self, serializer):
        """Set tenant_id from request"""
        tenant_id = get_tenant_from_request(self.request)
        serializer.save(tenant_id=tenant_id)

    def destroy(self, request, *args, **kwargs):
        """
        Hard delete if possible. If record is referenced by other data (IntegrityError),
        soft delete (deactivate) and rename to allow immediate reuse of the name.
        """
        from django.db import IntegrityError, transaction
        from django.db.models.deletion import ProtectedError
        import time
        
        instance = self.get_object()
        try:
            with transaction.atomic():
                instance.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except (IntegrityError, ProtectedError):
            # If referenced, perform soft delete (deactivate)
            if not instance.is_active:
                # Already deactivated, just return success
                return Response(status=status.HTTP_204_NO_CONTENT)

            timestamp = int(time.time())
            
            # 1. Rename to allow reuse of original unique identifier
            if instance.sub_subgroup:
                instance.sub_subgroup = f"{instance.sub_subgroup}_rem_{timestamp}"
            elif instance.subgroup:
                instance.subgroup = f"{instance.subgroup}_rem_{timestamp}"
            elif instance.group:
                instance.group = f"{instance.group}_rem_{timestamp}"
            else:
                instance.category = f"{instance.category}_rem_{timestamp}"
                
            # 2. Mark as inactive
            instance.is_active = False
            instance.save()
            return Response(status=status.HTTP_204_NO_CONTENT)
    
    def create(self, request, *args, **kwargs):
        """
        Create a new category with idempotency and reactivation logic.
        If a duplicate is found:
        - If is_active=False, reactivate and return 200 OK.
        - If is_active=True, just return 200 OK (exists).
        """
        tenant_id = get_tenant_from_request(request)
        category = request.data.get('category')
        group = request.data.get('group', '')
        subgroup = request.data.get('subgroup', '')
        
        # Check for existing record (including inactive ones)
        existing = VendorMasterCategory.objects.filter(
            tenant_id=tenant_id,
            category=category,
            group=group,
            subgroup=subgroup
        ).first()
        
        if existing:
            if not existing.is_active:
                existing.is_active = True
                existing.save()
            serializer = self.get_serializer(existing)
            return Response(serializer.data, status=status.HTTP_200_OK)
            
        return super().create(request, *args, **kwargs)
    
    @action(detail=False, methods=['get'])
    def tree(self, request):
        """
        Get categories in a tree structure
        Returns all categories organized by category > group > subgroup
        """
        tenant_id = get_tenant_from_request(request)
        queryset = VendorMasterCategory.objects.filter(tenant_id=tenant_id, is_active=True)
        
        # Build tree structure
        tree = {}
        for item in queryset:
            category = item.category
            group = item.group
            subgroup = item.subgroup
            sub_subgroup = item.sub_subgroup
            
            # Ensure category node exists
            if category not in tree:
                tree[category] = {
                    'groups': {}, 
                    'id': item.id if not group and not subgroup and not sub_subgroup else None
                }
            
            if group:
                # Ensure group node exists
                if group not in tree[category]['groups']:
                    tree[category]['groups'][group] = {
                        'subgroups': {}, 
                        'id': item.id if not subgroup and not sub_subgroup else None
                    }
                
                if subgroup:
                    # Ensure subgroup node exists
                    if subgroup not in tree[category]['groups'][group]['subgroups']:
                        tree[category]['groups'][group]['subgroups'][subgroup] = {
                            'items': [], 
                            'id': item.id if not sub_subgroup else None
                        }
                    
                    if sub_subgroup:
                        # Add sub-subgroup (item)
                        tree[category]['groups'][group]['subgroups'][subgroup]['items'].append({
                            'name': sub_subgroup,
                            'id': item.id
                        })
        
        
        return Response(tree)
