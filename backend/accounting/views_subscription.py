
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .utils_subscription import get_invoice_usage, get_billing_cycle_start

class SubscriptionUsageView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        plan = (user.selected_plan or 'FREE').upper()
        
        LIMITS = {
            'FREE': 5,
            'STARTER': 100,
            'PRO': float('inf')
        }
        
        limit = LIMITS.get(plan, 5)
        used = get_invoice_usage(user)
        cycle_start = get_billing_cycle_start(user)
        
        return Response({
            "plan": plan,
            "used": used,
            "limit": limit if limit != float('inf') else "Unlimited",
            "cycle_start": cycle_start,
            "remaining": (limit - used) if limit != float('inf') else "Unlimited"
        })

class SubscriptionUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        plan = request.data.get('plan')
        if not plan or plan.upper() not in ['FREE', 'STARTER', 'PRO']:
            return Response({"error": "Invalid plan"}, status=400)
            
        user = request.user
        user.selected_plan = plan.upper()
        user.save()
        
        return Response({
            "success": True, 
            "plan": user.selected_plan
        })
