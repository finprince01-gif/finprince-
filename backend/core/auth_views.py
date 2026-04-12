import logging
from django.db import models
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status
from django.conf import settings
from .token import MyTokenObtainPairSerializer
from .exceptions import BusinessException

from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

@method_decorator(csrf_exempt, name='dispatch')
class CookieTokenObtainPairView(TokenObtainPairView):
    serializer_class = MyTokenObtainPairSerializer
    authentication_classes = []  # Disable auth check for login

    def post(self, request, *args, **kwargs):
        try:
            serializer = self.get_serializer(data=request.data)
            try:
                serializer.is_valid(raise_exception=True)
            except Exception as e:
                # If is_valid crashed, errors might not be available.
                # Safe fallback: return the exception message.
                msg = str(e)
                if hasattr(e, 'detail'):
                    msg = e.detail
                raise BusinessException(msg)
                
            token_data = serializer.validated_data

            access_token = token_data.pop('access', None)
            refresh_token = token_data.pop('refresh', None)

            response_data = {
                'access': access_token,
                'refresh': refresh_token,
                'username': token_data.get('username'),
                'email': token_data.get('email'),
                'tenant_id': token_data.get('tenant_id'),
                'company_id': token_data.get('company_id'),
                'company_name': token_data.get('company_name'),
                'branch_name': token_data.get('branch_name'),
                'user_role': token_data.get('role'),
            }

            response = Response(response_data, status=status.HTTP_200_OK)

            response.set_cookie(
                key='access_token',
                value=access_token,
                httponly=True,
                secure=settings.SIMPLE_JWT.get('AUTH_COOKIE_SECURE', False),
                samesite=settings.SIMPLE_JWT.get('AUTH_COOKIE_SAMESITE', 'Lax'),
                max_age=settings.SIMPLE_JWT.get('ACCESS_TOKEN_LIFETIME').total_seconds(),
                path='/'
            )
            response.set_cookie(
                key='refresh_token',
                value=refresh_token,
                httponly=True,
                secure=settings.SIMPLE_JWT.get('AUTH_COOKIE_SECURE', False),
                samesite=settings.SIMPLE_JWT.get('AUTH_COOKIE_SAMESITE', 'Lax'),
                max_age=settings.SIMPLE_JWT.get('REFRESH_TOKEN_LIFETIME').total_seconds(),
                path='/api/auth/refresh/'
            )

            # 5. Log login event
            import logging
            from django.utils import timezone
            logger = logging.getLogger('core.auth_views')
            
            log_msg = (
                f"🔐 LOGIN SUCCESS - {timezone.localtime().strftime('%Y-%m-%d %H:%M:%S')} | "
                f"Branch: {response_data.get('tenant_id')} ({response_data.get('company_name')}) | "
                f"User: {response_data.get('username')} ({response_data.get('email')})"
            )
            logger.info(log_msg)

            return response
        except Exception as e:
            raise e # Let global handler handle 500


class CookieTokenRefreshView(TokenRefreshView):
    authentication_classes = [] # Disable auth check for refresh
    def post(self, request, *args, **kwargs):
        # Prioritize refresh token from body (for non-cookie clients)
        if 'refresh' in request.data:
            refresh_token = request.data['refresh']
        else:
            refresh_token = request.COOKIES.get('refresh_token')
        
        if not refresh_token:
            from rest_framework.exceptions import NotAuthenticated
            raise NotAuthenticated('No refresh token provided')
            
        data = request.data.copy()
        data['refresh'] = refresh_token
        
        serializer = self.get_serializer(data=data)
        
        try:
            serializer.is_valid(raise_exception=True)
            
            # Additional Security: Check if the user is still active
            from rest_framework_simplejwt.tokens import RefreshToken
            from django.contrib.auth import get_user_model
            from rest_framework_simplejwt.settings import api_settings
            
            token = RefreshToken(refresh_token)
            user_id = token.get(api_settings.USER_ID_CLAIM)
            if user_id:
                User = get_user_model()
                try:
                    user = User.objects.get(id=user_id)
                    if not user.is_active:
                         # Clear cookies and reject
                        response = Response({
                            'error_code': 'user_inactive',
                            'message': 'Your account has been deactivated.'
                        }, status=status.HTTP_401_UNAUTHORIZED)
                        response.delete_cookie('access_token', path='/')
                        response.delete_cookie('refresh_token', path='/api/auth/refresh/')
                        response.delete_cookie('refresh_token', path='/')
                        return response
                except User.DoesNotExist:
                    response = Response({
                        'error_code': 'user_not_found',
                        'message': 'Account no longer exists.'
                    }, status=status.HTTP_401_UNAUTHORIZED)
                    response.delete_cookie('access_token', path='/')
                    response.delete_cookie('refresh_token', path='/api/auth/refresh/')
                    response.delete_cookie('refresh_token', path='/')
                    return response

        except Exception as e:
             # Clear cookies if refresh fails
            response = Response({
                'error_code': 'AUTHENTICATION_FAILED',
                'message': 'Session expired or invalidated.'
            }, status=status.HTTP_401_UNAUTHORIZED)
            response.delete_cookie('access_token', path='/')
            response.delete_cookie('refresh_token', path='/api/auth/refresh/')
            response.delete_cookie('refresh_token', path='/')
            return response

        token_data = serializer.validated_data
        access_token = token_data.get('access')
        # Some setups rotate refresh tokens too
        new_refresh = token_data.get('refresh') 

        # Return the tokens in the body as well to support Bearer auth flow
        response_data = {'success': True}
        if access_token:
            response_data['access'] = access_token
        # Always return refresh token if generated (it's in token_data)
        if new_refresh:
            response_data['refresh'] = new_refresh
        elif 'refresh' in token_data: 
             response_data['refresh'] = token_data['refresh']
            
        response = Response(response_data, status=status.HTTP_200_OK)

        # Update Access Token
        if access_token:
            response.set_cookie(
                key='access_token',
                value=access_token,
                httponly=True,
                secure=settings.SIMPLE_JWT.get('AUTH_COOKIE_SECURE', False),
                samesite=settings.SIMPLE_JWT.get('AUTH_COOKIE_SAMESITE', 'Lax'),
                max_age=settings.SIMPLE_JWT.get('ACCESS_TOKEN_LIFETIME').total_seconds(),
                path='/'
            )
        
        # Update Refresh Token if rotated
        if new_refresh:
            response.set_cookie(
                key='refresh_token',
                value=new_refresh,
                httponly=True,
                secure=settings.SIMPLE_JWT.get('AUTH_COOKIE_SECURE', False),
                samesite=settings.SIMPLE_JWT.get('AUTH_COOKIE_SAMESITE', 'Lax'),
                max_age=settings.SIMPLE_JWT.get('REFRESH_TOKEN_LIFETIME').total_seconds(),
                path='/api/auth/refresh/'
            )

        return response

class LogoutView(APIView):
    permission_classes = [AllowAny]
    def post(self, request):
        response = Response({'success': True}, status=status.HTTP_200_OK)
        # Clear cookies (ensure both are deleted with all possible path settings)
        response.delete_cookie('access_token', path='/')
        response.delete_cookie('refresh_token', path='/')
        # Clear legacy restricted cookie to prevent conflicts
        response.delete_cookie('refresh_token', path='/api/auth/refresh/')
        return response

class MeView(APIView):
    """
    Get current user details. 
    Supports both Master admins and Branch users.
    Used for frontend session persistence on page refresh.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        
        # 1. Check if user is a Master Admin
        from core.models import MasterUser
        if isinstance(user, MasterUser):
            return Response({
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'user_role': 'MASTER_ADMIN',
                'is_master': True
            })

        # 2. Extract Business User details
        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'tenant_id': user.branch_id,
            'company_name': user.company_name,
            'user_role': getattr(user, 'role', 'BRANCH_USER'),
            'selected_plan': getattr(user, 'selected_plan', 'Free'),
            'is_master': False
        })

@method_decorator(csrf_exempt, name='dispatch')
class ForgotUserIDView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        from .models import User
        identifier = request.data.get('identifier') # email or phone
        
        if not identifier:
            raise BusinessException('Email or Phone is required')
            
        users = User.objects.filter(models.Q(email=identifier) | models.Q(phone=identifier))
        
        if not users.exists():
            from django.http import Http404
            raise Http404("No account found with this information")
            
        # In a real app, send email/SMS. Here we return masked IDs for demo if requested.
        user_ids = [u.username for u in users]
        masked_ids = [uid[:2] + '*' * (len(uid)-2) for uid in user_ids]
        
        return Response({
            'success': True,
            'message': 'User ID(s) found. In a real system, they would be sent to your registered email/phone.',
            'identifiers': masked_ids # Returning masked IDs for demo purposes
        })

@method_decorator(csrf_exempt, name='dispatch')
class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        from .models import User
        from django.contrib.auth.hashers import make_password
        
        username = request.data.get('username')
        identifier = request.data.get('identifier') # email or phone
        new_password = request.data.get('new_password')
        
        if not all([username, identifier, new_password]):
            raise BusinessException('Username, Identifier (Email/Phone), and New Password are required')
            
        try:
            user = User.objects.get(
                models.Q(username=username) & 
                (models.Q(email=identifier) | models.Q(phone=identifier))
            )
        except User.DoesNotExist:
            from django.http import Http404
            raise Http404("No matching account found")
            
        # Simplified reset logic: Update password directly
        user.set_password(new_password)
        user.save()
        
        import logging
        logger = logging.getLogger('core.auth_views')
        logger.info(f"🔑 Password reset for user: {username}")
        
        return Response({
            'success': True,
            'message': 'Password has been reset successfully. You can now login with your new password.'
        })

class SwitchBranchView(APIView):
    """
    Switch the active tenant context for the user.
    Only authorized for COMPANY_ADMIN (within company) or MASTER_ADMIN (global).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        target_tenant_id = request.data.get('tenant_id')
        if not target_tenant_id:
            return Response({'error': 'tenant_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        from core.models import Branch, MasterUser
        from django.core.exceptions import PermissionDenied

        # 1. Identity Context
        is_master = isinstance(user, MasterUser)
        role = getattr(user, 'role', 'BRANCH_USER')

        # 2. Authorization Check
        try:
            target_tenant = Branch.objects.get(id=target_tenant_id)
        except Branch.DoesNotExist:
            return Response({'error': 'Invalid branch ID'}, status=status.HTTP_404_NOT_FOUND)

        if is_master:
            # Master admins can switch anywhere (global monitoring)
            pass
        elif role == 'COMPANY_ADMIN':
            # Company layer removed - COMPANY_ADMIN can access any branch under their tenant
            if str(user.branch_id) != str(target_tenant_id):
                return Response({'error': 'Unauthorized: Branch does not match your authorization scope'}, status=status.HTTP_403_FORBIDDEN)
        else:
            # Branch users cannot switch
            if str(user.branch_id) != str(target_tenant_id):
                return Response({'error': 'Unauthorized: Branch users cannot switch branches'}, status=status.HTTP_403_FORBIDDEN)

        # 3. Apply Switch (Update active tenant_id in Session/DB)
        user.branch_id = target_tenant_id
        user.save(update_fields=['tenant_id'])

        # 4. Generate New Tokens with updated context
        refresh = MyTokenObtainPairSerializer.get_token(user)
        access_token = str(refresh.access_token)
        
        response_data = {
            'success': True,
            'access': access_token,
            'refresh': str(refresh),
            'tenant_id': target_tenant_id,
            'branch_name': target_tenant.name,
            'user_role': role
        }

        response = Response(response_data, status=status.HTTP_200_OK)
        
        # Update Cookies
        response.set_cookie(
            key='access_token',
            value=access_token,
            httponly=True,
            secure=settings.SIMPLE_JWT.get('AUTH_COOKIE_SECURE', False),
            samesite=settings.SIMPLE_JWT.get('AUTH_COOKIE_SAMESITE', 'Lax'),
            max_age=settings.SIMPLE_JWT.get('ACCESS_TOKEN_LIFETIME').total_seconds(),
            path='/'
        )
        
        return response
