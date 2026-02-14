from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.utils import timezone
from datetime import timedelta
import uuid
from django.core.files.storage import default_storage
import logging

from .models import User, Tenant
# REMOVED: Role - no longer using roles table
from .serializers import RegisterInitiateSerializer, CreateUserSerializer

logger = logging.getLogger(__name__)


class RegisterInitiateView(APIView):
    """
    Step 1: Validate registration data and send OTP
    POST /api/auth/register-initiate
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = RegisterInitiateSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        data = serializer.validated_data
        phone = data['phone']
        
        # Handle logo upload if present
        logo_path_str = None
        logo_file = data.get('logo')
        if logo_file:
            temp_filename = f"temp_logos/{uuid.uuid4()}_{logo_file.name}"
            file_path = default_storage.save(temp_filename, logo_file)
            logo_path_str = file_path
        
        # Store pending registration
        # Delete any expired pending registrations for this phone/username
        PendingRegistration.objects.filter(
            phone=phone,
            expires_at__lt=timezone.now()
        ).delete()
        
        # Hash password before storing
        from django.contrib.auth.hashers import make_password
        password_hash = make_password(data['password'])
        
        # Create or update pending registration
        pending, created = PendingRegistration.objects.update_or_create(
            phone=phone,
            defaults={
                'username': data['username'],
                'email': data.get('email', ''),
                'password_hash': password_hash,
                'company_name': data['company_name'],
                'selected_plan': data['selected_plan'],
                'logo_path': logo_path_str,
                'expires_at': timezone.now() + timedelta(minutes=30)
            }
        )
        
        
        # Mask phone for logging
        if len(phone) > 4:
            masked_phone = phone[:2] + '*' * (len(phone) - 4) + phone[-2:]
        else:
            masked_phone = '*' * len(phone)

        logger.info(f"📝 Registration initiated for {data['username']} - Phone: {masked_phone}")
        
        return Response({
            'success': True,
            'message': f'Registration data saved for {masked_phone}',
            'phone': phone,
        }, status=status.HTTP_200_OK)


class CreateUserView(APIView):
    """
    Create user account directly without OTP verification
    POST /api/auth/create-account
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = CreateUserSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        phone = serializer.validated_data['phone']
        
        from django.db import transaction

        try:
            with transaction.atomic():
                # Get pending registration
                try:
                    pending = PendingRegistration.objects.get(
                        phone=phone,
                        expires_at__gt=timezone.now()
                    )
                except PendingRegistration.DoesNotExist:
                    return Response({
                        'error': 'Registration session expired. Please start registration again.'
                    }, status=status.HTTP_400_BAD_REQUEST)
                
                # Create tenant
                tenant_uuid = str(uuid.uuid4())
                tenant = Tenant.objects.create(id=tenant_uuid, name=pending.company_name, created_at=timezone.now())
                
                # Move logo to permanent location if exists
                final_logo_path = None
                if pending.logo_path:
                    import os
                    temp_path = pending.logo_path
                    final_filename = f"logos/{tenant_uuid}_{os.path.basename(temp_path)}"
                    # Copy from temp to final location
                    if default_storage.exists(temp_path):
                        try:
                            with default_storage.open(temp_path, 'rb') as temp_file:
                                final_logo_path = default_storage.save(final_filename, temp_file)
                            default_storage.delete(temp_path)
                        except Exception as e:
                            logger.error(f"Error moving logo file: {e}")
                
                # Create user account
                now = timezone.now()
                user = User.objects.create(
                    username=pending.username,
                    email=pending.email,
                    password=pending.password_hash,  # Already hashed
                    company_name=pending.company_name,
                    phone=pending.phone,
                    phone_verified=True,
                    selected_plan=pending.selected_plan,
                    tenant_id=tenant_uuid,
                    logo_path=final_logo_path,
                    is_active=True,
                    created_at=now,
                    updated_at=now
                )
                
                # REMOVED: Role creation - Owner gets all permissions automatically
                # No need to create or assign roles anymore
                
                # Seed default account groups (Essential for creating Ledgers/Vouchers)
                self._seed_default_groups(tenant_uuid)
                
                # Delete pending registration
                pending.delete()
                
                # Log successful registration
                logger.info(f"✅ [{timezone.now()}] New user registered - Tenant: {tenant_uuid} ({pending.company_name}) - User: {user.username}")







                
                # Auto-login: Generate JWT tokens for the newly registered user
                from rest_framework_simplejwt.tokens import RefreshToken
                from .token import MyTokenObtainPairSerializer
                
                # Generate tokens
                refresh = MyTokenObtainPairSerializer.get_token(user)
                access_token = str(refresh.access_token)
                
                logger.info(f"✅ Auto-login: Generated JWT token")
                
                return Response({
                    'success': True,
                    'message': 'Registration successful! You are now logged in.',
                    'access': access_token,
                    'refresh': str(refresh),
                    'user': {
                        'id': user.id,
                        'username': user.username,
                        'email': user.email,
                        'company_name': user.company_name,
                        'phone': user.phone,
                        'tenant_id': user.tenant_id,
                        'selected_plan': user.selected_plan,
                    },
                }, status=status.HTTP_201_CREATED)
        
        except Exception as e:
            logger.error(f"Error during user creation: {e}")
            import traceback
            traceback.print_exc()
            return Response({
                'error': f'An error occurred during account creation: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
    def _seed_default_groups(self, tenant_id):
        """Seed default account groups for the new tenant."""
        try:
            from accounting.models import MasterLedgerGroup
            
            default_groups = [
                # Assets
                {'name': 'Current Assets'},
                {'name': 'Fixed Assets'},
                {'name': 'Sundry Debtors', 'parent': 'Current Assets'},
                {'name': 'Bank Accounts', 'parent': 'Current Assets'},
                {'name': 'Cash-in-Hand', 'parent': 'Current Assets'},
                
                # Liabilities
                {'name': 'Current Liabilities'},
                {'name': 'Sundry Creditors', 'parent': 'Current Liabilities'},
                {'name': 'Duties & Taxes', 'parent': 'Current Liabilities'},
                
                # Income
                {'name': 'Sales Accounts'},
                {'name': 'Direct Incomes'},
                {'name': 'Indirect Incomes'},
                
                # Expenses
                {'name': 'Purchase Accounts'},
                {'name': 'Direct Expenses'},
                {'name': 'Indirect Expenses'},
            ]
            
            for group_data in default_groups:
                group_kwargs = {
                    'tenant_id': tenant_id,
                    'name': group_data['name'],
                }
                
                if 'parent' in group_data:
                    group_kwargs['parent'] = group_data['parent']
                    
                try:
                    MasterLedgerGroup.objects.create(**group_kwargs)
                except Exception as e:
                    logger.warning(f"Failed to seed group {group_data['name']}: {e}")
        except ImportError as e:
            logger.warning(f"Could not import MasterLedgerGroup, skipping default groups: {e}")
        except Exception as e:
            logger.warning(f"Error seeding default groups: {e}")

    # REMOVED: _seed_tenant_permissions method - no longer using permission tables
    # def _seed_tenant_permissions(self, tenant_id):
    #     ...
