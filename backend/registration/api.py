"""
Registration API Layer - HTTP Routing ONLY
NO business logic, NO RBAC, NO tenant validation.
Only HTTP handling - all logic delegated to flow.py
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status
from core.serializers import RegisterInitiateSerializer, CreateUserSerializer
from . import flow
from core.exceptions import BusinessError


# ============================================================================
# DIRECT REGISTRATION VIEW (NO OTP)
# ============================================================================

class DirectRegisterView(APIView):
    """
    Direct registration endpoint - creates user immediately without OTP.
    All logic delegated to flow layer.
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        """Handle direct registration."""
        # Get data from request
        data = request.data
        
        # Basic validation
        required_fields = ['username', 'password', 'company_name', 'selected_plan']
        for field in required_fields:
            if not data.get(field):
                raise BusinessError(f'{field} is required')
        
        try:
            # Delegate to flow layer
            # Delegate to flow layer
            # Pack data into dictionary as expected by register_user
            registration_data = {
                'username': data['username'],
                'email': data.get('email', ''),
                'password': data['password'],
                'company_name': data['company_name'],
                'phone': data.get('phone', ''),
                'selected_plan': data['selected_plan'],
                # Logo file handling not currently in register_user, but can be added later
            }
            
            result = flow.register_user(registration_data)
            
            return Response(result, status=status.HTTP_201_CREATED)
            
        except ValueError as e:
            raise BusinessError(str(e))
        # Remove manual 500 handling, let global handler do it
