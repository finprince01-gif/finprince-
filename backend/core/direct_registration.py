from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.utils import timezone
import uuid
from django.core.files.storage import default_storage
import logging
from django.db import transaction

from .models import User, Branch
from .serializers import CreateUserSerializer

logger = logging.getLogger(__name__)


class DirectRegisterView(APIView):
    """
    Direct user registration - creates user immediately without OTP
    POST /api/auth/register/
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        # Validate input data
        data = request.data
        
        # Debug: log incoming registration data
        logger.info(f"📩 Registration request data keys: {list(data.keys())}")
        logger.info(f"📩 state received: '{data.get('state', 'NOT_PRESENT')}'")

        # Basic validation
        required_fields = ['username', 'password', 'company_name', 'selected_plan']
        for field in required_fields:
            if not data.get(field):
                return Response({
                    'error': f'{field} is required'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        username = data['username']
        password = data['password']
        company_name = data['company_name']
        selected_plan = data['selected_plan']
        email = data.get('email', '')
        phone = data.get('phone', '')
        state = data.get('state', '')
        
        # Check if username already exists
        if User.objects.filter(username=username).exists():
            return Response({
                'error': 'Username already exists'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if company name already exists
        if User.objects.filter(company_name=company_name).exists():
            return Response({
                'error': 'Company name already exists'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Check if phone already exists
        if phone and User.objects.filter(phone=phone).exists():
            return Response({
                'error': 'Phone number already registered'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Build response data inside transaction, return it outside
            response_data = None
            
            # Create tenant and user in atomic transaction
            with transaction.atomic():
                # Create tenant
                tenant_uuid = str(uuid.uuid4())
                tenant = Branch.objects.create(id=tenant_uuid, name=company_name)
                
                # Handle logo upload if present
                final_logo_path = None
                logo_file = request.FILES.get('logo')
                if logo_file:
                    final_filename = f"logos/{tenant_uuid}_{logo_file.name}"
                    final_logo_path = default_storage.save(final_filename, logo_file)
                
                # Hash password
                from django.contrib.auth.hashers import make_password
                password_hash = make_password(password)
                
                logger.info(f"🔧 About to create user: {username}")

                
                # Create user account
                user = User.objects.create(
                    username=username,
                    email=email,
                    password=password_hash,
                    company_name=company_name,
                    phone=phone,
                    state=state,
                    phone_verified=True,  # No OTP, so mark as verified
                    selected_plan=selected_plan,
                    tenant_id=tenant_uuid,
                    logo_path=final_logo_path,
                    is_active=True,
                    is_superuser=True,  # Owner account
                    is_staff=True
                )
                
                logger.info(f"✅ User created with ID: {user.id}")

                
                # Seed default account groups (inside transaction)
                try:
                    self._seed_default_groups(tenant_uuid)
                    logger.info(f"✅ Default groups seeded for tenant {tenant_uuid}")
                except Exception as e:
                    logger.warning(f"⚠️ Failed to seed default groups: {e}")
                    # Continue anyway
                
                # Log successful registration
                logger.info(f"✅ [{timezone.now()}] New user registered - Branch: {tenant_uuid} ({company_name}) - User: {username}")






                
                # Auto-login: Generate JWT tokens (inside transaction)
                from rest_framework_simplejwt.tokens import RefreshToken
                from .token import MyTokenObtainPairSerializer
                
                # Generate tokens
                refresh = MyTokenObtainPairSerializer.get_token(user)
                access_token = str(refresh.access_token)
                
                # Get permissions (Owner gets all)
                from .rbac import get_all_permission_ids, get_permission_codes_from_ids
                all_ids = get_all_permission_ids()
                permissions = get_permission_codes_from_ids(all_ids)
                
                logger.info(f"✅ Auto-login: Generated JWT token with {len(permissions)} permissions")
                
                # Build response data (but don't return yet!)
                response_data = {
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
                        'tenant_id': user.branch_id,
                        'selected_plan': user.selected_plan,
                    },
                    'permissions': permissions
                }
            
            # Transaction committed! Now return the response
            logger.info(f"✅ Transaction committed - User {response_data['user']['id']} saved to database")

            
            return Response(response_data, status=status.HTTP_201_CREATED)
        
        except Exception as e:
            logger.error(f"Error during user creation: {e}")
            import traceback
            traceback.print_exc()
            return Response({
                'error': f'An error occurred during registration: {str(e)}'
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
