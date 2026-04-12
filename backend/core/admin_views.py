from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from core.models import User, Branch
from django.utils import timezone
from datetime import timedelta

from core.permissions import IsMaster

class AdminSubscriptionsView(APIView):
    """
    Admin panel endpoint to list all users/subscriptions for tenants owned by this master
    """
    permission_classes = [IsMaster]
    
    def get(self, request):
        """Get all users with their subscription data, scoped to master's tenants"""
        my_tenants = Branch.objects.filter(master=request.user)
        my_tenant_ids = my_tenants.values_list('id', flat=True)
        
        # Include all users belonging to these tenants
        users = User.objects.filter(tenant_id__in=my_tenant_ids)
        
        subscriptions = []
        for user in users:
            # Calculate subscription dates (1 year from registration)
            start_date = user.created_at
            end_date = start_date + timedelta(days=365)
            
            # Get company name from user or use username as fallback
            company_name = user.company_name if hasattr(user, 'company_name') and user.company_name else user.username
            
            # Format last login date/time
            last_login = user.last_login.isoformat() if user.last_login else 'Never'
            
            subscriptions.append({
                'id': user.id,
                'username': user.username,
                'companyName': company_name,
                'registrationDate': user.created_at.isoformat(),
                'subscriptionPlan': user.selected_plan if hasattr(user, 'selected_plan') and user.selected_plan else 'Basic',
                'isActive': user.is_active,
                'lastLogin': last_login,  # Changed from loginStatus to lastLogin
                'subscriptionStartDate': start_date.isoformat(),
                'subscriptionEndDate': end_date.isoformat(),
                'uploadsUsed': 0,  # TODO: Track actual uploads
                'totalUploads': 1000,  # Default limit
                'tenantId': user.branch_id if hasattr(user, 'tenant_id') else 'N/A',
            })
        
        return Response(subscriptions)


class AdminUserStatusView(APIView):
    """
    Admin panel endpoint to activate/deactivate users
    """
    permission_classes = [IsMaster]
    
    def put(self, request):
        """Update user active status"""
        user_id = request.data.get('userId')
        is_active = request.data.get('isActive')
        
        try:
            user = User.objects.get(id=user_id)
            user.is_active = is_active
            user.save()
            return Response({'success': True})
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=404)
