import os
import logging
logger = logging.getLogger(__name__)
from rest_framework import viewsets, status, generics, views  # type: ignore
from rest_framework.response import Response  # type: ignore
from rest_framework.permissions import IsAuthenticated, AllowAny  # type: ignore
from rest_framework.decorators import api_view, permission_classes, authentication_classes  # type: ignore
from django.utils.decorators import method_decorator  # type: ignore
from django.views.decorators.csrf import csrf_exempt  # type: ignore
from django.utils import timezone  # type: ignore
from datetime import timedelta
# User model imported inside views to avoid AppRegistryNotReady

from .models import CompanyFullInfo
from .serializers import (
    UserSignupSerializer,
    CompanySettingsSerializer
)
from .utils import TenantQuerysetMixin, IsTenantMember
from .exceptions import UsageLimitExceeded, BusinessException, ExternalServiceError

class SignupView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
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
@permission_classes([AllowAny])
@authentication_classes([])
def health_check(request):
    return Response({
        'status': 'ok',
        'timestamp': timezone.now().isoformat()
    })

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def check_status(request):
    return Response({'isActive': True})

@api_view(['GET'])
@permission_classes([AllowAny])
@authentication_classes([])
def check_phone(request):
    """Check if a phone number is already registered."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    phone = request.query_params.get('phone', '').strip()
    if not phone:
        return Response({'error': 'Phone number required'}, status=status.HTTP_400_BAD_REQUEST)
    
    exists = User.objects.filter(phone=phone).exists()
    return Response({'exists': exists})

from .ai_proxy import ai_service

@method_decorator(csrf_exempt, name='dispatch')
class AgentMessageView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        msg = request.data.get('message', '').strip()
        use_grounding = request.data.get('useGrounding', False)

        if not msg:
            raise BusinessException('Message is required.')

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
            raise ExternalServiceError(result.get('error', 'AI service is temporarily unavailable.'))

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
@authentication_classes([])
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
    stats = ai_service.get_stats()
    ai_stats = {
        'total_requests': stats.get('total_requests', 0),
        'cache_hits': stats.get('cache_hits', 0),
        'circuit_breaker_open': stats.get('circuit_breaker_open', False),
        'api_keys_unhealthy': stats.get('api_keys_unhealthy', 0)
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
        from django.contrib.auth import get_user_model
        User = get_user_model()
        users = User.objects.filter(is_superuser=False).order_by('-created_at')
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
        from django.contrib.auth import get_user_model
        User = get_user_model()
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
            from django.http import Http404
            raise Http404("Requested resource not found.")


class AdminPaymentsView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.contrib.auth import get_user_model
        User = get_user_model()
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
            # Handle file upload for invoice extraction
            if 'file' not in request.FILES:
                return Response({'error': 'No file provided.'}, status=400)

            # Check AI Usage Limit
            from .usage_service import check_and_increment_usage

            # Determine limit based on plan (default to FREE)
            plan = getattr(request.user, 'selected_plan', 'FREE') or 'FREE'
            plan = plan.upper()

            # Basic limits - can be moved to a configuration file later
            LIMITS = {
                'FREE': 5,
                'STARTER': 100,
                'PRO': 1000,
                'ENTERPRISE': 10000
            }
            limit = LIMITS.get(plan, 5)

            if not check_and_increment_usage(tenant_id, limit):
                raise UsageLimitExceeded(f"Monthly AI extraction limit of {limit} has been reached.")

            file_obj = request.FILES['file']

            # Use updated invoice processing — returns {'reply': json_string} or {'error': ...}
            from .ai_service import create_invoice_processing_request
            result = create_invoice_processing_request(
                file_obj,
                mime_type=file_obj.content_type,
                user_id=user_id,
                tenant_id=tenant_id
            )

            if 'error' in result:
                raise ExternalServiceError(result.get('error', 'AI service is temporarily unavailable.'))

            # ── Parse the raw AI text into {header, line_items} ────────────────
            import json as _json
            raw_text = result.get('reply', '').strip()

            # Strip markdown code fences if present
            if raw_text.startswith('```json'):
                raw_text = raw_text[7:]
            if raw_text.startswith('```'):
                raw_text = raw_text[3:]
            if raw_text.endswith('```'):
                raw_text = raw_text[:-3]
            raw_text = raw_text.strip()

            try:
                extracted = _json.loads(raw_text)
            except Exception:
                # Try to salvage by finding the outermost {} block
                import re
                match = re.search(r'\{[\s\S]*\}', raw_text)
                if match:
                    extracted = _json.loads(match.group(0))
                else:
                    return Response({'error': 'Failed to parse AI response as JSON.'}, status=500)

            # Support both {header, line_items} and legacy flat/array formats
            if isinstance(extracted, dict) and 'header' in extracted:
                header = extracted.get('header', {})
                line_items = extracted.get('line_items', [])
            elif isinstance(extracted, list) and extracted:
                # Legacy: array of flat objects — treat first element as header, no line items
                header = extracted[0] if extracted else {}
                line_items = []
            else:
                header = extracted if isinstance(extracted, dict) else {}
                line_items = []

            # Ensure line_items is a list
            if isinstance(line_items, dict):
                line_items = [line_items]

            # ── Post-processing: normalise every line item ─────────────────────
            import re as _re

            # Numeric-only fields — strip currency symbols, commas, stray units
            NUMERIC_FIELDS = {
                'Item Rate', 'Taxable Amount', 'IGST Amount', 'CGST Amount',
                'SGST Amount', 'Item Amount', 'Disc%',
            }

            for idx, item in enumerate(line_items, start=1):
                # 1. Re-assign sequential S.No
                item['S.No'] = str(idx)

                # 2. Convert Python None / JSON null → empty string on every field
                for k, v in item.items():
                    if v is None:
                        item[k] = ''

                # 3. Auto-split Quantity + UOM if still combined (e.g. "8 NOS", "2.5 KG")
                qty_raw = str(item.get('Quantity', '')).strip()
                uom_raw = str(item.get('Quantity UOM', '')).strip()
                if qty_raw and not uom_raw:
                    # Try to split "8 NOS" or "2.500 KGS"
                    m = _re.match(r'^([\d.,]+)\s*([A-Za-z]+)$', qty_raw)
                    if m:
                        item['Quantity'] = m.group(1)
                        item['Quantity UOM'] = m.group(2).upper()

                # 4. GST Rate — must be a plain percentage number, not a rupee amount
                gst_rate = str(item.get('GST Rate', '')).strip()
                if gst_rate:
                    # Strip % symbol and spaces
                    gst_rate = gst_rate.replace('%', '').strip()
                    # If it looks like a rupee amount (>100 or has decimals suggesting amount)
                    # and doesn't match a normal GST slab, clear it to avoid confusion
                    try:
                        gst_val = float(gst_rate.replace(',', ''))
                        # Valid GST slabs: 0, 0.1, 0.25, 1.5, 3, 5, 6, 7.5, 9, 12, 14, 18, 28
                        valid_slabs = {0, 0.1, 0.25, 1.5, 3, 5, 6, 7.5, 9, 12, 14, 18, 28}
                        if gst_val > 28:
                            # Likely a rupee amount misplaced — clear it
                            item['GST Rate'] = ''
                        else:
                            item['GST Rate'] = str(gst_val) if gst_val not in valid_slabs else gst_rate
                    except ValueError:
                        item['GST Rate'] = ''

                # 5. Numeric amount fields — strip commas, currency symbols, stray text
                for field in NUMERIC_FIELDS:
                    val = str(item.get(field, '')).strip()
                    if val:
                        # Keep only digits, dot, minus
                        cleaned = _re.sub(r'[^\d.\-]', '', val.replace(',', ''))
                        item[field] = cleaned if cleaned else ''

                # 6. HSN/SAC — must be digits only (4-8 digit code), not a price
                hsn = str(item.get('HSN/SAC', '')).strip()
                if hsn:
                    hsn_digits = _re.sub(r'[^\d]', '', hsn)
                    item['HSN/SAC'] = hsn_digits if 4 <= len(hsn_digits) <= 8 else ''

            return Response({
                'success': True,
                'data': {
                    'header': header,
                    'line_items': line_items,
                }
            })


        elif action == 'agent-message':
            # Handle agent messages
            msg = request.data.get('message', '').strip()
            if not msg:
                raise BusinessException('Message is required.')

            request_data = {
                'message': msg,
                'contextData': request.data.get('contextData', ''),
                'useGrounding': request.data.get('useGrounding', False)
            }
            result = ai_service.make_request('agent', request_data, user_id, tenant_id)
        else:
            raise BusinessException('Invalid action.')

        if 'error' in result:
            raise ExternalServiceError(result.get('error', 'AI service is temporarily unavailable.'))

        return Response(result)

    def get(self, request, action):
        """Get AI service stats"""
        if action == 'stats':
            if not request.user.is_staff:  # Only staff can see stats
                return Response({'error': 'Unauthorized'}, status=403)
            return Response(ai_service.get_stats())
        return Response({'error': 'Unknown action'}, status=400)
