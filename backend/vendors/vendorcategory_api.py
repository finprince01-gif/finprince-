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
        """Filter by tenant_id from request"""
        tenant_id = get_tenant_from_request(self.request)
        if tenant_id:
            return VendorMasterCategory.objects.filter(tenant_id=tenant_id, is_active=True)
        return VendorMasterCategory.objects.filter(is_active=True)
    
    def perform_create(self, serializer):
        """Set tenant_id from request"""
        tenant_id = get_tenant_from_request(self.request)
        serializer.save(tenant_id=tenant_id)
    
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
            
            if category not in tree:
                tree[category] = {'groups': {}, 'id': None}
            
            # If this is just a category (no group/subgroup)
            if not group and not subgroup:
                tree[category]['id'] = item.id
            
            # If this has a group
            if group:
                if group not in tree[category]['groups']:
                    tree[category]['groups'][group] = {'subgroups': [], 'id': None}
                
                # If this is just category + group (no subgroup)
                if not subgroup:
                    tree[category]['groups'][group]['id'] = item.id
                
                # If this has a subgroup
                if subgroup:
                    tree[category]['groups'][group]['subgroups'].append({
                        'name': subgroup,
                        'id': item.id
                    })
        
        return Response(tree)
