"""
Login API Layer - HTTP Routing ONLY
NO business logic, NO RBAC, NO tenant validation.
Only HTTP handling - all logic delegated to flow.py
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from . import flow


# ============================================================================
# LOGIN VIEW
# ============================================================================

@method_decorator(csrf_exempt, name='dispatch')
class LoginView(APIView):
    """
    User login endpoint.
    All logic delegated to flow layer.
    """
    permission_classes = [AllowAny]
    authentication_classes = []
    
    def post(self, request):
        """Handle login request."""
        try:
            username = request.data.get('username')
            password = request.data.get('password')
            email = request.data.get('email')  # Optional email for disambiguation
            
            if not (username or email) or not password:
                return Response(
                    {'detail': 'Username/Email and password required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Delegate to flow layer (with optional email)
            user, result = flow.authenticate_user(username, password, email)
            
            if user is None:
                return Response(
                    {'detail': result},
                    status=status.HTTP_401_UNAUTHORIZED
                )
            
            # Create response with tokens
            response_data = {
                'access': result['access'],
                'refresh': result['refresh'],
                'username': result['username'],
                'email': result['email'],
                'tenant_id': result['tenant_id'],
                'company_name': result['company_name'],
                'selected_plan': result.get('selected_plan', 'Free'),
            }
            
            response = Response(response_data, status=status.HTTP_200_OK)
            
            # Set HTTP-only cookies
            response.set_cookie(
                key='access_token',
                value=result['access'],
                httponly=True,
                secure=settings.SIMPLE_JWT.get('AUTH_COOKIE_SECURE', False),
                samesite=settings.SIMPLE_JWT.get('AUTH_COOKIE_SAMESITE', 'Lax'),
                max_age=settings.SIMPLE_JWT.get('ACCESS_TOKEN_LIFETIME').total_seconds()
            )
            response.set_cookie(
                key='refresh_token',
                value=result['refresh'],
                httponly=True,
                secure=settings.SIMPLE_JWT.get('AUTH_COOKIE_SECURE', False),
                samesite=settings.SIMPLE_JWT.get('AUTH_COOKIE_SAMESITE', 'Lax'),
                max_age=settings.SIMPLE_JWT.get('REFRESH_TOKEN_LIFETIME').total_seconds(),
                path='/api/auth/refresh/'
            )
            
            return response
            
        except Exception as e:
            return Response(
                {'error': 'Internal Server Error', 'details': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================================
# TOKEN REFRESH VIEW
# ============================================================================

class TokenRefreshView(APIView):
    """
    Token refresh endpoint.
    All logic delegated to flow layer.
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        """Handle token refresh request."""
        # Try both 'refresh_token' (cookie name) and 'refresh' (standard JSON payload)
        refresh_token = request.COOKIES.get('refresh_token')
        
        if not refresh_token:
            refresh_token = request.data.get('refresh') or request.data.get('refresh_token')
        
        if not refresh_token:
            return Response(
                {'error': 'No refresh token provided'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        # Delegate to flow layer
        tokens = flow.refresh_access_token(refresh_token)
        
        if tokens is None:
            # Clear cookies if refresh fails
            response = Response(
                {'error': 'Token refresh failed'},
                status=status.HTTP_401_UNAUTHORIZED
            )
            response.delete_cookie('access_token')
            response.delete_cookie('refresh_token')
            return response
        
        # Return tokens in body so client can update localStorage
        response = Response({
            'success': True,
            'access': tokens['access'],
            'refresh': tokens.get('refresh')
        }, status=status.HTTP_200_OK)
        
        # Update cookies
        if tokens.get('access'):
            response.set_cookie(
                key='access_token',
                value=tokens['access'],
                httponly=True,
                secure=settings.SIMPLE_JWT.get('AUTH_COOKIE_SECURE', False),
                samesite=settings.SIMPLE_JWT.get('AUTH_COOKIE_SAMESITE', 'Lax'),
                max_age=settings.SIMPLE_JWT.get('ACCESS_TOKEN_LIFETIME').total_seconds()
            )
        
        if tokens.get('refresh'):
            response.set_cookie(
                key='refresh_token',
                value=tokens['refresh'],
                httponly=True,
                secure=settings.SIMPLE_JWT.get('AUTH_COOKIE_SECURE', False),
                samesite=settings.SIMPLE_JWT.get('AUTH_COOKIE_SAMESITE', 'Lax'),
                max_age=settings.SIMPLE_JWT.get('REFRESH_TOKEN_LIFETIME').total_seconds(),
                path='/api/auth/refresh/'
            )
        
        return response


# ============================================================================
# LOGOUT VIEW
# ============================================================================

class LogoutView(APIView):
    """Logout endpoint - clears cookies."""
    permission_classes = [AllowAny]
    
    def post(self, request):
        """Handle logout request."""
        response = Response({'success': True}, status=status.HTTP_200_OK)
        response.delete_cookie('access_token')
        response.delete_cookie('refresh_token')
        return response

class ForgotUserIDView(APIView):
    """Handle User ID recovery."""
    permission_classes = [AllowAny]
    
    def post(self, request):
        identifier = request.data.get('identifier')
        if not identifier:
            return Response({'detail': 'Email or Phone is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        result, message = flow.forgot_user_id(identifier)
        if result is None:
            return Response({'detail': message}, status=status.HTTP_404_NOT_FOUND)
            
        return Response({
            'success': True,
            'message': message,
            'identifiers': result
        })

class ForgotPasswordView(APIView):
    """Handle Password recovery/reset."""
    permission_classes = [AllowAny]
    
    def post(self, request):
        username = request.data.get('username')
        identifier = request.data.get('identifier')
        new_password = request.data.get('new_password')
        
        if not all([username, identifier, new_password]):
            return Response({'detail': 'Username, Identifier (Email/Phone), and New Password are required'}, status=status.HTTP_400_BAD_REQUEST)
            
        success, message = flow.reset_password(username, identifier, new_password)
        if not success:
            return Response({'detail': message}, status=status.HTTP_404_NOT_FOUND)
            
        return Response({
            'success': True,
            'message': message
        })

from rest_framework.throttling import AnonRateThrottle

class RequestOTPThrottle(AnonRateThrottle):
    rate = '10/hour'

class RequestResetOTPView(APIView):
    """Handle OTP request for password reset."""
    permission_classes = [AllowAny]
    throttle_classes = [RequestOTPThrottle]
    
    def post(self, request):
        email = request.data.get('email')
        if not email:
            return Response({'detail': 'Email is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        success, message = flow.request_reset_otp(email)
        if not success:
            return Response({'detail': message}, status=status.HTTP_400_BAD_REQUEST)
            
        return Response({'message': message})

class VerifyOTPOnlyView(APIView):
    """Verify OTP without changing password."""
    permission_classes = [AllowAny]
    
    def post(self, request):
        email = request.data.get('email')
        otp = request.data.get('otp')
        
        if not all([email, otp]):
            return Response(
                {'detail': 'Email and OTP are required.'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
            
        success, message = flow.verify_otp_only(email, otp)
        if not success:
            return Response({'detail': message}, status=status.HTTP_400_BAD_REQUEST)
            
        return Response({'success': True, 'message': message})

class VerifyResetOTPView(APIView):
    """Verify OTP and reset password."""
    permission_classes = [AllowAny]
    
    def post(self, request):
        email = request.data.get('email')
        otp = request.data.get('otp')
        new_password = request.data.get('new_password')
        
        if not all([email, otp, new_password]):
            return Response(
                {'detail': 'Email, OTP, and new password are required.'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Add strong password validation here if needed
        if len(new_password) < 8:
            return Response(
                {'detail': 'Password must be at least 8 characters long.'}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        success, message = flow.verify_reset_otp(email, otp, new_password)
        if not success:
            return Response({'detail': message}, status=status.HTTP_400_BAD_REQUEST)
            
        return Response({'success': True, 'message': message})
