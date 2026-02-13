import logging
from django.db import models
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status
from django.conf import settings
from .token import MyTokenObtainPairSerializer

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
                return Response({'detail': msg}, status=status.HTTP_401_UNAUTHORIZED)
                
            token_data = serializer.validated_data

            access_token = token_data.pop('access', None)
            refresh_token = token_data.pop('refresh', None)

            response_data = {
                'access': access_token,
                'refresh': refresh_token,
                'username': token_data.get('username'),
                'email': token_data.get('email'),
                'tenant_id': token_data.get('tenant_id'),
                'company_name': token_data.get('company_name'),
            }

            response = Response(response_data, status=status.HTTP_200_OK)

            response.set_cookie(
                key='access_token',
                value=access_token,
                httponly=True,
                secure=settings.SIMPLE_JWT.get('AUTH_COOKIE_SECURE', False),
                samesite=settings.SIMPLE_JWT.get('AUTH_COOKIE_SAMESITE', 'Lax'),
                max_age=settings.SIMPLE_JWT.get('ACCESS_TOKEN_LIFETIME').total_seconds()
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
                f"Tenant: {response_data.get('tenant_id')} ({response_data.get('company_name')}) | "
                f"User: {response_data.get('username')} ({response_data.get('email')})"
            )
            logger.info(log_msg)

            return response
        except Exception as e:
            return Response({'error': 'Internal Server Error', 'details': str(e)}, status=500)


class CookieTokenRefreshView(TokenRefreshView):
    def post(self, request, *args, **kwargs):
        refresh_token = request.COOKIES.get('refresh_token')
        
        if not refresh_token:
            return Response({'error': 'No refresh token provided'}, status=status.HTTP_401_UNAUTHORIZED)
            
        # Copy logic to be safe with immutable querydicts if needed, 
        # though request.data is usually mutable dict in DRF unless using MultiPart
        data = request.data.copy()
        data['refresh'] = refresh_token
        
        serializer = self.get_serializer(data=data)
        
        try:
            serializer.is_valid(raise_exception=True)
        except Exception as e:
             # Clear cookies if refresh fails
            res = Response({'error': 'Token refresh failed'}, status=status.HTTP_401_UNAUTHORIZED)
            res.delete_cookie('access_token')
            res.delete_cookie('refresh_token')
            return res

        token_data = serializer.validated_data
        access_token = token_data.get('access')
        # Some setups rotate refresh tokens too
        new_refresh = token_data.get('refresh') 

        # Return the tokens in the body as well to support Bearer auth flow
        response_data = {'success': True}
        if access_token:
            response_data['access'] = access_token
        if new_refresh:
            response_data['refresh'] = new_refresh
            
        response = Response(response_data, status=status.HTTP_200_OK)

        # Update Access Token
        if access_token:
            response.set_cookie(
                key='access_token',
                value=access_token,
                httponly=True,
                secure=settings.SIMPLE_JWT.get('AUTH_COOKIE_SECURE', False),
                samesite=settings.SIMPLE_JWT.get('AUTH_COOKIE_SAMESITE', 'Lax'),
                max_age=settings.SIMPLE_JWT.get('ACCESS_TOKEN_LIFETIME').total_seconds()
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
        # Clear cookies
        response.delete_cookie('access_token')
        response.delete_cookie('refresh_token')
        return response

@method_decorator(csrf_exempt, name='dispatch')
class ForgotUserIDView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        from .models import User
        identifier = request.data.get('identifier') # email or phone
        
        if not identifier:
            return Response({'error': 'Email or Phone is required'}, status=status.HTTP_400_BAD_REQUEST)
            
        users = User.objects.filter(models.Q(email=identifier) | models.Q(phone=identifier))
        
        if not users.exists():
            # For security, we might want to return 200 even if not found to prevent user enumeration
            # but usually for "Forgot" it's better to be explicit.
            return Response({'error': 'No account found with this information'}, status=status.HTTP_404_NOT_FOUND)
            
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
            return Response({'error': 'Username, Identifier (Email/Phone), and New Password are required'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            user = User.objects.get(
                models.Q(username=username) & 
                (models.Q(email=identifier) | models.Q(phone=identifier))
            )
        except User.DoesNotExist:
            return Response({'error': 'No matching account found'}, status=status.HTTP_404_NOT_FOUND)
            
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
