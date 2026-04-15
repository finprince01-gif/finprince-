from rest_framework import status, generics  # type: ignore
from rest_framework.response import Response  # type: ignore
from rest_framework.views import APIView  # type: ignore
from rest_framework.permissions import AllowAny  # type: ignore
from django.contrib.auth.hashers import check_password, make_password  # type: ignore
from django.core.mail import send_mail  # type: ignore
from django.core.cache import cache  # type: ignore
from django.db import transaction  # type: ignore
import random
import threading
from django.utils import timezone  # type: ignore
from rest_framework_simplejwt.tokens import RefreshToken  # type: ignore
from .models import MasterUser, Branch, User
from accounting.models import Voucher, MasterLedger, MasterLedgerGroup
from .master_serializers import (
    MasterRegisterSerializer, MasterLoginSerializer, MasterTokenRefreshSerializer
)
from rest_framework_simplejwt.views import TokenRefreshView  # type: ignore
from .permissions import IsMaster
import uuid

class MasterTokenRefreshView(TokenRefreshView):
    """
    Custom Refresh View for Master Admins.
    Ensures the refresh logic looks up MasterUser (UUID-based) 
    instead of the regular User model.
    """
    serializer_class = MasterTokenRefreshSerializer

class MasterRegisterView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = MasterRegisterSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        master = serializer.save()
        
        # Auto login after register
        refresh = RefreshToken.for_user(master)
        refresh['master_id'] = str(master.id)
        refresh['type'] = 'master'
        
        # Send Welcome Email
        try:
            send_mail(
                'Welcome to FinPixe Platform Admin',
                f'Hello {master.username},\n\nYour Master Platform Account has been created successfully.\nManage all your companies and branches from one place.',
                'no-reply@finpixe.com',
                [master.email],
                fail_silently=True,
            )
        except Exception as e:
            print(f"Failed to send welcome email: {e}")
            
        return Response({
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'master': {
                'id': master.id,
                'username': master.username,
                'email': master.email
            }
        }, status=status.HTTP_201_CREATED)

class MasterRequestResetOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email')
        
        if not email:
            return Response({'message': 'Email is required'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            master = MasterUser.objects.get(email=email, is_active=True)
            otp = f"{random.randint(100000, 999999)}"
            
            # Save OTP to cache tightly scoped to master users for 15 minutes
            cache.set(f"master_reset_otp_{email}", otp, timeout=900)
            
            def send_otp_email():
                try:
                    send_mail(
                        'Your Password Reset OTP - FinPixe Platform Admin',
                        f'Hello {master.username},\n\nYou requested a password reset. Here is your 6-digit OTP:\n\n{otp}\n\nThis OTP is valid for 15 minutes.\nIf you did not request this, please ignore this email.',
                        'no-reply@finpixe.com',
                        [master.email],
                        fail_silently=False,
                    )
                except Exception as e:
                    print(f"Failed to send OTP email: {e}")
                    
            threading.Thread(target=send_otp_email, daemon=True).start()
                
            return Response({'success': True, 'message': 'OTP sent to your email.'})
            
        except MasterUser.DoesNotExist:
            return Response({'success': True, 'message': 'If an account exists, an OTP was sent.'})

class MasterVerifyOTPOnlyView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email')
        otp = request.data.get('otp')
        
        if not all([email, otp]):
            return Response({'message': 'Email and OTP are required.'}, status=status.HTTP_400_BAD_REQUEST)
            
        stored_otp = cache.get(f"master_reset_otp_{email}")
        
        if not stored_otp or stored_otp != otp:
            return Response({'message': 'Invalid or expired OTP.'}, status=status.HTTP_400_BAD_REQUEST)
            
        # We don't delete the OTP yet, we just confirm it's valid
        # Alternatively we can issue a short-lived reset token, but keeping OTP in cache is fine for this flow.
        return Response({'success': True, 'message': 'OTP verified successfully.'})

class MasterResetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email')
        otp = request.data.get('otp')
        new_password = request.data.get('new_password')
        
        if not all([email, otp, new_password]):
            return Response({'message': 'Email, OTP, and new password are required.'}, status=status.HTTP_400_BAD_REQUEST)
            
        stored_otp = cache.get(f"master_reset_otp_{email}")
        
        if not stored_otp or stored_otp != otp:
            return Response({'message': 'OTP verification expired or invalid. Please request a new one.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            # Re-verify user existence
            master = MasterUser.objects.get(email=email, is_active=True)
            
            # Reset Password
            master.set_password(new_password)
            master.save()
            
            # Invalidate OTP
            cache.delete(f"master_reset_otp_{email}")
            
            return Response({'success': True, 'message': 'Password has been successfully reset.'})
            
        except MasterUser.DoesNotExist:
            return Response({'message': 'User no longer valid.'}, status=status.HTTP_400_BAD_REQUEST)

def authenticate_master(email, username, password):
    """
    Dedicated Master authentication function.
    Validates only against the MasterUser table.
    Ensures 100% isolation from company user authentication.
    """
    try:
        # Email and username are unique at the database level
        # We find the specific master record
        master = MasterUser.objects.get(email=email, username=username, is_active=True)
    except MasterUser.DoesNotExist:
        return None

    if not check_password(password, master.password):
        return None

    return master

class MasterLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email')
        username = request.data.get('username')
        password = request.data.get('password')
        
        # 8. DEBUG LOGGING: Confirm correct data reception
        print(f"MASTER LOGIN ATTEMPT: {email}, {username}")
        
        # 2. SEPARATE AUTHENTICATION FUNCTION
        master = authenticate_master(email, username, password)

        if not master:
            # 3. 401 UNAUTHORIZED on invalid credentials
            return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)
        
        # 4. TOKEN HANDLING: master_id and type are required in the JWT
        # Using for_user ensures standard claims (exp, user_id) are correctly set
        refresh = RefreshToken.for_user(master)
        refresh['master_id'] = str(master.id)
        refresh['type'] = 'master'
        
        return Response({
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user_role': 'MASTER_ADMIN',
            'master': {
                'id': master.id,
                'username': master.username,
                'email': master.email
            }
        })





class MasterBranchListCreateView(APIView):
    permission_classes = [IsMaster]

    def get(self, request):
        """List all branches owned by the authenticated master"""
        branches = Branch.objects.filter(master=request.user)
        data = [{
            'id': b.id,
            'name': b.branch_name or b.name,  # Use branch_name for display
            'gstin': b.gstin,
            'created_at': b.created_at
        } for b in branches]
        return Response(data)

    def post(self, request):
        """Provision a new Branch for the platform"""
        from .tenant_seed import seed_tenant_data
        
        data = request.data
        branch_name = data.get('name')
        business_type = data.get('business_type')
        branch_gstin = data.get('gstin')
        email = data.get('email')
        phone = data.get('phone')
        owner_data = data.get('owner', {})
        
        if not all([branch_name, business_type, branch_gstin, owner_data.get('username'), owner_data.get('password'), owner_data.get('name')]):
            return Response({'error': 'Missing required fields for branch provisioning (Business Name, Type of Business, GSTIN, Admin Name, Username, Password).'}, status=status.HTTP_400_BAD_REQUEST)

        # Conflict Checks
        if branch_gstin:
            branch_gstin = branch_gstin.upper()
            if Branch.objects.filter(gstin=branch_gstin).exists():
                return Response({'error': f'GSTIN {branch_gstin} is already registered to an existing branch.'}, status=status.HTTP_400_BAD_REQUEST)

        admin_email = owner_data.get('email', email)
        if admin_email and User.objects.filter(email=admin_email).exists():
            return Response({'error': f'Administrator email {admin_email} is already registered to an existing account.'}, status=status.HTTP_400_BAD_REQUEST)

        admin_username = owner_data.get('username')
        if admin_username and User.objects.filter(username=admin_username).exists():
            # While usernames aren't strictly unique at the top level in some models,
            # this specific platform logic requires unique admin handles per branch.
            return Response({'error': f'Username {admin_username} is already taken.'}, status=status.HTTP_400_BAD_REQUEST)

        # Generate unique name for tenant (name field is unique)
        unique_tenant_name = branch_name
        if Branch.objects.filter(name=branch_name).exists():
            unique_tenant_name = f"{branch_name}-{branch_gstin}" if branch_gstin else f"{branch_name}-{uuid.uuid4().hex[:8]}"

        try:
            with transaction.atomic():
                tenant_id = str(uuid.uuid4())
                
                # 1. Create Branch
                branch = Branch.objects.create(
                    id=tenant_id,
                    name=unique_tenant_name,
                    branch_name=branch_name,
                    business_type=business_type,
                    gstin=branch_gstin,
                    email=email,
                    phone=phone,
                    address_line1=data.get('address_line1'),
                    address_line2=data.get('address_line2'),
                    address_line3=data.get('address_line3'),
                    country=data.get('country', 'India'),
                    state=data.get('state'),
                    district=data.get('district'),
                    city=data.get('city'),
                    pincode=data.get('pincode'),
                    master=request.user
                )

                # 2. Create Initial Branch Administrator
                selected_plan = data.get('selected_plan', 'Free')
                user = User.objects.create(
                    username=owner_data['username'],
                    full_name=owner_data.get('name'),
                    email=owner_data.get('email', email),
                    password=make_password(owner_data['password']),
                    company_name=branch_name,
                    phone=phone,
                    tenant_id=tenant_id,
                    role='COMPANY_ADMIN',
                    selected_plan=selected_plan,
                    is_active=True,
                    is_superuser=True
                )

            # Seed data outside atomic
            seed_tenant_data(tenant_id)

            return Response({
                'id': branch.id,
                'name': branch.name,
                'message': 'Branch Provisioned Successfully'
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({'error': f'Branch Provisioning Error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)



class MasterBranchDetailView(APIView):
    permission_classes = [IsMaster]

    def get(self, request, tenant_id):
        try:
            branch = Branch.objects.get(id=tenant_id, master=request.user)
            owner = User.objects.filter(tenant_id=branch.id, role='COMPANY_ADMIN', is_superuser=True).first()
            if not owner:
                owner = User.objects.filter(tenant_id=branch.id).first()
                
            plan = owner.selected_plan if owner else 'FREE'
            plan = plan.upper() if plan else 'FREE'

            # Calculate actual invoice usage (proxy for exact data)
            invoices_generated = Voucher.objects.filter(tenant_id=branch.id).count()

            # Arbitrary logic for AI credits (since we mock real AI token usage in DB anyway)
            ai_credits_used = int(invoices_generated * 1.5)

            # Determine plan limits
            LIMITS = {'FREE': 5, 'STARTER': 100, 'PRO': 'Unlimited', 'ENTERPRISE': 'Unlimited'}
            plan_limit = LIMITS.get(plan, 5)
            ai_limit = LIMITS.get(plan, 5) if isinstance(LIMITS.get(plan, 5), str) else int(LIMITS.get(plan, 5) * 2)

            # Determine status based on owner active state
            is_active = owner.is_active if owner else True

            return Response({
                'id': branch.id,
                'name': branch.name,
                'pan_number': branch.pan_number,
                'status': 'ACTIVE' if is_active else 'INACTIVE',
                'plan': plan,
                'subscription': {
                    'planName': plan,
                    'price': '₹0/mo' if plan == 'FREE' else ('₹1,200/mo' if plan == 'STARTER' else '₹5,000/mo'),
                    'invoices': {
                        'used': invoices_generated,
                        'limit': plan_limit
                    },
                    'aiCredits': {
                        'used': ai_credits_used,
                        'limit': ai_limit
                    }
                }
            })
        except Branch.DoesNotExist:
            return Response({'error': 'Branch not found or access denied'}, status=status.HTTP_404_NOT_FOUND)

    def put(self, request, tenant_id):
        try:
            branch = Branch.objects.get(id=tenant_id, master=request.user)
            action = request.data.get('action')
            
            if action == 'update_details':
                branch.name = request.data.get('name', branch.name)
                branch.pan_number = request.data.get('pan_number', branch.pan_number)
                branch.save()
                return Response({'success': True, 'message': 'Branch details updated successfully'})
                
            elif action == 'upgrade_plan':
                new_plan = request.data.get('plan')
                if not new_plan:
                    return Response({'error': 'Plan is required'}, status=status.HTTP_400_BAD_REQUEST)
                    
                users = User.objects.filter(tenant_id=branch.id)
                for u in users:
                    u.selected_plan = new_plan
                    u.save()
                return Response({'success': True, 'message': f'Branch upgraded to {new_plan}'})
                
            elif action == 'toggle_status':
                # Map toggle to all users under tenant
                users = User.objects.filter(tenant_id=branch.id)
                
                # Check current status from tenant itself (more authoritative)
                new_status = not branch.is_active
                
                # Update Branch
                branch.is_active = new_status
                branch.save()
                
                # Update All Users
                for u in users:
                    u.is_active = new_status
                    u.save()
                    
                msg = 'Branch has been reactivated successfully' if new_status else 'Branch has been deactivated'
                return Response({'success': True, 'message': msg})
                
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
            
        except Branch.DoesNotExist:
            return Response({'error': 'Branch not found or access denied'}, status=status.HTTP_404_NOT_FOUND)


class MasterResetBranchPasswordView(APIView):
    permission_classes = [IsMaster]

    def post(self, request, tenant_id):
        """Securely reset all user passwords for a specific branch"""
        new_password = request.data.get('new_password')
        
        if not new_password:
            return Response({'error': 'New password is required'}, status=status.HTTP_400_BAD_REQUEST)
            
        if len(new_password) < 8:
            return Response({'error': 'Password must be at least 8 characters long'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Ensure branch belongs to the master admin
            branch = Branch.objects.get(id=tenant_id, master=request.user)
            
            # Update all users managed under this branch
            users = User.objects.filter(tenant_id=branch.id)
            
            if not users.exists():
                return Response({'error': 'No user accounts found for this branch'}, status=status.HTTP_404_NOT_FOUND)
                
            for user in users:
                user.set_password(new_password)
                user.save()
                
            return Response({
                'success': True, 
                'message': f'Password updated successfully for {users.count()} account(s)'
            })
            
        except Branch.DoesNotExist:
            return Response({'error': 'Branch not found or access denied'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MasterDashboardStatsView(APIView):
    permission_classes = [IsMaster]

    def get(self, request):
        """Get aggregated stats across all branches owned by the master"""
        branch_ids = Branch.objects.filter(master=request.user).values_list("id", flat=True)
        
        total_branches = len(branch_ids)
        total_users = User.objects.filter(tenant_id__in=branch_ids).count()
        
        total_transactions = Voucher.objects.filter(tenant_id__in=branch_ids).count()
        
        # Calculate approximate revenue (total sales)
        total_revenue = sum(
            Voucher.objects.filter(tenant_id__in=branch_ids, type='sales').values_list('total', flat=True)
        )
        
        return Response({
            'total_branches': total_branches,
            'total_users': total_users,
            'total_transactions': total_transactions,
            'total_revenue': float(total_revenue)
        })

class MasterRecentActivityView(APIView):
    permission_classes = [IsMaster]

    def get(self, request):
        """Get recent branch creations and activity"""
        branches = Branch.objects.filter(master=request.user).order_by('-created_at')[:5]
        
        activity = []
        for b in branches:
            activity.append({
                'type': 'branch_created',
                'name': b.name,
                'timestamp': b.created_at,
                'details': f"New branch '{b.name}' provisioned"
            })

            
        return Response(activity)

class MasterBranchDrilldownView(APIView):
    permission_classes = [IsMaster]

    def get(self, request, tenant_id):
        """Get branch details with drill-down metrics, enforcing ownership"""
        try:
            branch = Branch.objects.get(id=tenant_id, master=request.user)
            
            from accounting.models import Voucher
            total_sales = sum(Voucher.objects.filter(tenant_id=tenant_id, type='sales').values_list('total', flat=True))
            total_purchases = sum(Voucher.objects.filter(tenant_id=tenant_id, type='purchase').values_list('total', flat=True))
            total_users = User.objects.filter(tenant_id=tenant_id).count()
            
            recent_vouchers = Voucher.objects.filter(tenant_id=tenant_id).order_by('-date')[:10]
            vouchers_data = [{
                'id': v.id if hasattr(v, 'id') else None,
                'date': v.date,
                'type': v.type,
                'party': v.party,
                'amount': float(v.total) if v.total else (float(v.amount) if v.amount else 0)
            } for v in recent_vouchers]

            return Response({
                'id': branch.id,
                'name': branch.name,
                'created_at': branch.created_at,
                'info': {
                    'branch_name': branch.name,
                    'address': branch.address_line1,
                    'email': branch.email,
                    'phone': branch.phone,
                    'pan_number': branch.pan_number
                },
                'metrics': {
                    'total_sales': float(total_sales),
                    'total_purchases': float(total_purchases),
                    'total_users': total_users
                },
                'recent_transactions': vouchers_data
            })
        except Branch.DoesNotExist:
            return Response({'error': 'Branch not found or access denied'}, status=status.HTTP_404_NOT_FOUND)

class MasterSettingsView(APIView):
    permission_classes = [IsMaster]

    def get(self, request):
        """Get Master Admin profile settings with full registration data"""
        from .master_serializers import MasterUserSerializer
        serializer = MasterUserSerializer(request.user)
        return Response(serializer.data)

    def put(self, request):
        """Update Master Admin profile settings including address and tax info"""
        master = request.user
        data = request.data
        
        # Primary Identity
        master.name = data.get('name', master.name)
        master.email = data.get('email', master.email)
        master.username = data.get('username', master.username)
        master.phone = data.get('phone', master.phone)
        master.pan_number = data.get('pan_number', data.get('pan', master.pan_number))
        master.gstin = data.get('gstin', master.gstin)
        master.cin = data.get('cin', master.cin)
        
        # Address
        master.address_line1 = data.get('address_line1', data.get('address', master.address_line1))
        master.address_line2 = data.get('address_line2', master.address_line2)
        master.address_line3 = data.get('address_line3', master.address_line3)
        master.city = data.get('city', master.city)
        master.state = data.get('state', master.state)
        master.pincode = data.get('pincode', master.pincode)
        
        password = data.get('password')
        if password:
            master.set_password(password)
            
        master.save()
        return Response({'message': 'Master settings updated successfully'})

class MasterReportsView(APIView):
    permission_classes = [IsMaster]

    def get(self, request):
        """
        Get accounting data for a specific tenant or aggregated for all tenants.
        Master Admin uses X-Tenant-ID header or query param.
        """
        tenant_id = request.headers.get('X-Tenant-ID') or request.query_params.get('tenant_id')
        
        # Enforce Ownership: Get tenants owned by this master
        my_branch_ids = list(Branch.objects.filter(master=request.user).values_list('id', flat=True))
        
        target_ids = []
        if tenant_id and tenant_id != 'all':
            if str(tenant_id) in [str(tid) for tid in my_branch_ids]:
                target_ids = [tenant_id]
            else:
                return Response({'error': 'Unauthorized focus'}, status=status.HTTP_403_FORBIDDEN)
        else:
            target_ids = my_branch_ids

        # Fetch data for the identified tenants
        vouchers = Voucher.objects.filter(tenant_id__in=target_ids).order_by('-date')
        ledgers = MasterLedger.objects.filter(tenant_id__in=target_ids)
        ledger_groups = MasterLedgerGroup.objects.filter(tenant_id__in=target_ids)
        
        # Also fetch entries for Ledger Report drill-down
        from accounting.models import JournalEntry
        entries = JournalEntry.objects.filter(tenant_id__in=target_ids).select_related('ledger').order_by('transaction_date')
        
        # Format payloads (Standard company structure)
        return Response({
            'vouchers': [{
                'id': v.id, 'date': v.date, 'type': v.type, 'party': v.party, 'total': float(v.total or 0),
                'invoiceNo': v.invoice_no, 'account': v.account, 'narration': v.narration,
                'entries': [
                    {'ledger': e.ledger.name if e.ledger else e.ledger_name, 'debit': float(e.debit), 'credit': float(e.credit)}
                    for e in entries.filter(voucher_id=v.id, voucher_type=v.type.upper())
                ]
            } for v in vouchers],
            'entries': [{
                'id': e.id, 'date': e.transaction_date, 'ledger': e.ledger.name if e.ledger else e.ledger_name,
                'ledger_id': e.ledger_id,
                'debit': float(e.debit), 'credit': float(e.credit), 'type': e.voucher_type, 'voucher_id': e.voucher_id
            } for e in entries],
            'ledgers': [{
                'id': l.id, 'name': l.name, 'group': l.group, 'category': l.category
            } for l in ledgers],
            'ledger_groups': [{
                'id': g.id, 'name': g.name, 'parent': g.parent
            } for g in ledger_groups]
        })

class MasterBranchSettingsView(APIView):
    permission_classes = [IsMaster]

    def get(self, request, tenant_id):
        """Get individual branch profile settings for Master Admin drill-down"""
        try:
            branch = Branch.objects.get(id=tenant_id, master=request.user)
            
            return Response({
                'name': branch.name,
                'address': branch.address_line1,
                'email': branch.email,
                'phone': branch.phone,
                'website': branch.website,
                'pan': branch.pan_number,
                'cin': branch.cin,
                'city': branch.city,
                'state': branch.state,
                'pincode': branch.pincode,
                'logo': branch.logo_path
            })
        except Branch.DoesNotExist:
            return Response({'error': 'Unauthorized focus or branch not found'}, status=status.HTTP_403_FORBIDDEN)

    def put(self, request, tenant_id):
        """Update branch-specific settings via Master Admin dashboard"""
        try:
            branch = Branch.objects.get(id=tenant_id, master=request.user)
            
            data = request.data
            branch.name = data.get('name', branch.name)
            branch.address_line1 = data.get('address', branch.address_line1)
            branch.email = data.get('email', branch.email)
            branch.phone = data.get('phone', branch.phone)
            branch.website = data.get('website', branch.website)
            branch.pan_number = data.get('pan', branch.pan_number)
            branch.cin = data.get('cin', branch.cin)
            branch.city = data.get('city', branch.city)
            branch.state = data.get('state', branch.state)
            branch.pincode = data.get('pincode', branch.pincode)
            
            branch.save()

            return Response({'message': 'Branch settings updated successfully'})
        except Branch.DoesNotExist:
            return Response({'error': 'Unauthorized focus'}, status=status.HTTP_403_FORBIDDEN)
