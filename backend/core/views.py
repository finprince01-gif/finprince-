import os
import logging
logger = logging.getLogger(__name__)
from rest_framework import viewsets, status, generics, views  # type: ignore
from rest_framework.response import Response  # type: ignore
from rest_framework.permissions import IsAuthenticated, AllowAny  # type: ignore
from rest_framework.decorators import api_view, permission_classes  # type: ignore
from django.utils.decorators import method_decorator  # type: ignore
from django.views.decorators.csrf import csrf_exempt  # type: ignore
from django.utils import timezone  # type: ignore
from datetime import timedelta
from django.contrib.auth import get_user_model  # type: ignore
from django.db import models

User = get_user_model()

from .models import CompanyFullInfo
from .serializers import (
    UserSignupSerializer,
    CompanySettingsSerializer
)
from .utils import TenantQuerysetMixin, IsTenantMember

class SignupView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = UserSignupSerializer

from rest_framework.parsers import MultiPartParser, FormParser, JSONParser  # type: ignore

class CompanySettingsViewSet(TenantQuerysetMixin, viewsets.ModelViewSet):
    serializer_class = CompanySettingsSerializer
    permission_classes = [IsAuthenticated, IsTenantMember]
    required_permission = 'SETTINGS_COMPANY'
    queryset = CompanyFullInfo.objects.all()
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def perform_create(self, serializer):
        tid = self.request.user.tenant_id
        serializer.save(tenant_id=tid)

@api_view(['GET'])
@permission_classes([AllowAny]) # Or IsAuthenticated depending on need
def health_check(request):
    return Response({
        'status': 'ok',
        'timestamp': timezone.now().isoformat()
    })

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def check_status(request):
    return Response({'isActive': True})

from .ai_proxy import ai_service

@method_decorator(csrf_exempt, name='dispatch')
class AgentMessageView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        msg = request.data.get('message', '').strip()
        use_grounding = request.data.get('useGrounding', False)

        if not msg:
            return Response({'error': 'AI service busy. Please try again later.'}, status=429)

        # Extract user and tenant info
        user_id = str(request.user.id)
        tenant_id = getattr(request.user, 'tenant_id', None)
        if tenant_id:
            tenant_id = str(tenant_id)

        # Prepare request data
        request_data = {
            'message': msg,
            'contextData': request.data.get('contextData', ''),
            'useGrounding': use_grounding
        }

        # Use AI proxy
        result = ai_service.make_request('agent', request_data, user_id, tenant_id)

        if 'error' in result:
            return Response(result, status=429)

        return Response({'reply': result['reply']})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def ai_metrics(request):
    """Get comprehensive AI service metrics for monitoring"""
    stats = ai_service.get_stats()

    # Add additional metrics
    import redis
    redis_client = redis.from_url(os.getenv('REDIS_URL', 'redis://127.0.0.1:6379/0'))

    # Calculate real-time metrics
    now = timezone.now().timestamp()
    five_min_ago = now - 300

    total_requests_5min = redis_client.zcount('ai_requests', five_min_ago, now)
    successful_requests_5min = redis_client.zcount('ai_successes', five_min_ago, now)
    failed_requests_5min = redis_client.zcount('ai_failures', five_min_ago, now)
    rate_limited_requests_5min = redis_client.zcount('rate_limited', five_min_ago, now)
    provider_429_5min = redis_client.zcount('provider_429', five_min_ago, now)

    # Cost tracking (simulated)
    cost_per_request = 0.0001  # $0.0001 per request (adjust based on actual Gemini pricing)
    estimated_cost_5min = successful_requests_5min * cost_per_request

    enhanced_stats = {
        **stats,
        'metrics_5min': {
            'total_requests': total_requests_5min,
            'successful_requests': successful_requests_5min,
            'failed_requests': failed_requests_5min,
            'rate_limited_requests': rate_limited_requests_5min,
            'provider_429_errors': provider_429_5min,
            'success_rate_percent': (successful_requests_5min / max(total_requests_5min, 1)) * 100,
            'estimated_cost_usd': estimated_cost_5min
        },
        'alerts': {
            'high_429_rate': provider_429_5min > 50,  # More than 50 429s in 5 min
            'queue_too_deep': stats.get('queue_size', 0) > 20,
            'low_success_rate': ((successful_requests_5min / max(total_requests_5min, 1)) * 100) < 95
        }
    }

    return Response(enhanced_stats)


@api_view(['GET'])
@permission_classes([AllowAny])
def health_with_metrics(request):
    """Enhanced health check with basic metrics"""
    from django.db import connections  # type: ignore
    from django.core.cache import cache  # type: ignore

    # Check database
    db_status = 'ok'
    try:
        with connections['default'].cursor() as cursor:
            cursor.execute("SELECT 1")
    except:
        db_status = 'error'

    # Check cache
    cache_status = 'ok'
    try:
        cache.set('health_test', 'ok', 1)
        if cache.get('health_test') != 'ok':
            cache_status = 'error'
    except:
        cache_status = 'error'

    # Basic AI stats (without authentication)
    ai_stats = {
        'total_requests': ai_service.stats.get('total_requests', 0),
        'cache_hits': ai_service.stats.get('cache_hit', 0),
        'queue_size': ai_service.request_queue.size(),
        'active_flights': len(ai_service.single_flight)
    }

    return Response({
        'status': 'ok' if db_status == 'ok' and cache_status == 'ok' else 'error',
        'timestamp': timezone.now().isoformat(),
        'services': {
            'database': db_status,
            'cache': cache_status,
            'ai_service': 'ok'
        },
        'ai_metrics': ai_stats
    })


class AdminSubscriptionsView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Get all users as subscriptions
        users = User.objects.all().order_by('-created_at')
        subscriptions = []
        for user in users:
            # Determine Online status dynamically using last_login
            is_online = False
            if user.last_login:
                # Online if login within last 1 hour say? Or just show logged in time
                # Without last_activity, real-time presence is harder.
                # Just fallback to 'Offline' or base it on recent login?
                # For now simplify to Offline unless recently created/logged in
                time_threshold = timezone.now() - timedelta(minutes=60)
                if user.last_login > time_threshold:
                    is_online = True
            
            login_status = 'Online' if is_online else 'Offline'

            # Map user to subscription format
            subscription = {
                'id': user.id,
                'username': user.username,
                'companyName': user.company_name,
                'registrationDate': user.created_at.isoformat(),
                'subscriptionPlan': user.selected_plan,
                'subscriptionStartDate': user.created_at.isoformat(),  # Default to created
                'subscriptionEndDate': (user.created_at.replace(year=user.created_at.year + 1)).isoformat(),  # 1 year later
                'totalUploads': 1000,  # Default quota
                'uploadsUsed': 0,  # TODO: track actual usage
                'isActive': user.is_active,
                'tenantId': user.tenant_id,
                'lastLogin': user.last_login.isoformat() if user.last_login else user.created_at.isoformat(),
                'loginStatus': login_status,
            }
            subscriptions.append(subscription)
        return Response(subscriptions)

    def put(self, request):
        user_id = request.data.get('userId')
        is_active = request.data.get('isActive')
        if user_id is None or is_active is None:
            return Response({'error': 'userId and isActive required'}, status=400)
        try:
            user = User.objects.get(id=user_id)
            user.is_active = is_active
            user.save()
            return Response({'success': True})
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=404)


class AdminPaymentsView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        users = User.objects.all().order_by('-created_at')
        payments = []
        for user in users:
            # Mock payment data based on user plan
            amount = 0
            if user.selected_plan == 'Pro':
                amount = 2999
            elif user.selected_plan == 'Enterprise':
                amount = 9999
            
            payments.append({
                'id': user.id,
                'username': user.username,
                'companyName': user.company_name,
                'totalAmountPaid': amount,
            })
        return Response(payments)


@method_decorator(csrf_exempt, name='dispatch')
class AIProxyView(views.APIView):
    """Unified AI proxy endpoint for all AI operations"""

    def post(self, request, action):
        # Require authentication for AI services
        if not request.user.is_authenticated:
            return Response({'error': 'AI service busy. Please try again later.'}, status=429)

        # Extract user and tenant info
        user_id = str(request.user.id)
        tenant_id = getattr(request.user, 'tenant_id', None)
        if tenant_id:
            tenant_id = str(tenant_id)
        else:
            tenant_id = 'default' # Fallback to default tenant if not set

        if action == 'extract-invoice':
            # Check Limits
            from accounting.utils_subscription import check_subscription_limit
            check_subscription_limit(request.user)

            # Handle file upload for invoice extraction
            if 'file' not in request.FILES:
                return Response({'error': 'No file provided.'}, status=400)

            file_obj = request.FILES['file']

            # Use updated invoice processing
            from .ai_service import create_invoice_processing_request
            result = create_invoice_processing_request(
                file_obj,
                mime_type=file_obj.content_type,
                user_id=user_id,
                tenant_id=tenant_id
            )

            # Record the extraction event for usage tracking
            if result and isinstance(result, dict) and 'reply' in result:
                try:
                    from accounting.models import ExtractedInvoice
                    # Backend returns a JSON string in 'reply'
                    import json
                    reply_text = result['reply']
                    # Simple clean of markdown
                    clean_json = reply_text.replace('```json', '').replace('```', '').strip()
                    parsed_data = json.loads(clean_json)
                    
                    if isinstance(parsed_data, list) and len(parsed_data) > 0:
                        data = parsed_data[0]
                    else:
                        data = parsed_data

                    if data and isinstance(data, dict):
                        ExtractedInvoice.objects.create(
                            tenant_id=tenant_id,
                            invoice_number=data.get('Invoice Number') or data.get('invoiceNumber'),
                            supplier_name=data.get('Supplier Name') or data.get('sellerName'),
                            invoice_value=str(data.get('Invoice Value') or data.get('totalAmount') or ''),
                            additional_fields=data
                        )
                        logger.info(f"✅ Recorded extraction for tenant {tenant_id}")
                except Exception as e:
                    logger.error(f"❌ Failed to record extraction: {str(e)}")


        elif action == 'agent-message':
            # Handle agent messages
            msg = request.data.get('message', '').strip()
            if not msg:
                return Response({'error': 'AI service busy. Please try again later.'}, status=429)

            request_data = {
                'message': msg,
                'contextData': request.data.get('contextData', ''),
                'useGrounding': request.data.get('useGrounding', False)
            }
            result = ai_service.make_request('agent', request_data, user_id, tenant_id)
        else:
            return Response({'error': 'AI service busy. Please try again later.'}, status=429)

        if 'error' in result:
            return Response(result, status=429)

        return Response(result)

    def get(self, request, action):
        """Get AI service stats"""
        if action == 'stats':
            if not request.user.is_staff:  # Only staff can see stats
                return Response({'error': 'Unauthorized'}, status=403)
            return Response(ai_service.get_stats())
        return Response({'error': 'Unknown action'}, status=400)
