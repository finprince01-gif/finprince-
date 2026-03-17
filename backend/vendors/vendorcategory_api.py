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
            category_name = item.category or "Unknown"
            group_name = item.group
            subgroup_name = item.subgroup
            
            # Ensure category node exists
            if category_name not in tree:
                tree[category_name] = {'groups': {}, 'id': None}
            
            cat_node = tree[category_name]
            
            # If this is purely a category record (no group or subgroup)
            if not group_name and not subgroup_name:
                cat_node['id'] = item.id
                continue
            
            # Process groups and subgroups
            groups_dict = cat_node.get('groups')
            if groups_dict is None:
                groups_dict = {}
                cat_node['groups'] = groups_dict

            if group_name:
                if group_name not in groups_dict:
                    groups_dict[group_name] = {'subgroups': [], 'id': None}
                
                group_node = groups_dict[group_name]
                if group_node:
                    if not subgroup_name:
                        # This record defines the group itself
                        group_node['id'] = item.id
                    else:
                        # This record defines a subgroup under the group
                        subgroups_list = group_node.get('subgroups')
                        if isinstance(subgroups_list, list):
                            subgroups_list.append({
                                'name': subgroup_name,
                                'id': item.id
                            })
            elif subgroup_name:
                # Edge case: subgroup exists without a group
                if "Direct Subgroups" not in groups_dict:
                    groups_dict["Direct Subgroups"] = {'subgroups': [], 'id': None}
                
                direct_node = groups_dict["Direct Subgroups"]
                if direct_node:
                    subgroups_list = direct_node.get('subgroups')
                    if isinstance(subgroups_list, list):
                        subgroups_list.append({
                            'name': subgroup_name,
                            'id': item.id
                        })
        
        return Response(tree)
