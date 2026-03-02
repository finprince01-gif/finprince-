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

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        if queryset.exists():
            instance = queryset.first()
            serializer = self.get_serializer(instance)
            data = serializer.data
            # User model might have the correct data while CompanyFullInfo has empty strings or nulls
            if not data.get('email') or str(data.get('email')).strip() in ('', 'None'):
                if getattr(request.user, 'email', None):
                    data['email'] = request.user.email
            if not data.get('phone') or str(data.get('phone')).strip() in ('', 'None'):
                if getattr(request.user, 'phone', None):
                    data['phone'] = request.user.phone
            return Response(data)
            
        return Response({
            'name': getattr(request.user, 'company_name', ''),
            'email': getattr(request.user, 'email', ''),
            'phone': getattr(request.user, 'phone', '')
        })

    def create(self, request, *args, **kwargs):
        tid = request.user.tenant_id
        instance = CompanyFullInfo.objects.filter(tenant_id=tid).first()
        serializer = self.get_serializer(instance, data=request.data, partial=True) if instance else self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        logo_file = request.FILES.get('logo')
        if logo_file:
            from django.core.files.storage import default_storage
            file_path = default_storage.save(f"logos/{tid}_{logo_file.name}", logo_file)
            logo_path_str = default_storage.url(file_path)
            serializer.save(tenant_id=tid, logo_path=logo_path_str)
        else:
            serializer.save(tenant_id=tid)
            
        return Response(serializer.data)

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
        import time
        start_time = time.time()
        
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
            voucher_type = request.data.get('voucher_type', 'Purchase')
            table_name = request.data.get('table_name', voucher_type)
            
            import json as _json
            columns_data = request.data.get('columns', '[]')
            try:
                columns_list = _json.loads(columns_data)
            except Exception:
                columns_list = []

            # Use updated invoice processing — returns {'reply': json_string} or {'error': ...}
            from .ai_service import create_dynamic_voucher_extraction_request
            result = create_dynamic_voucher_extraction_request(
                file_obj,
                voucher_type=voucher_type,
                table_name=table_name,
                columns=columns_list,
                mime_type=file_obj.content_type,
                user_id=user_id,
                tenant_id=tenant_id
            )

            if 'error' in result:
                raise ExternalServiceError(result.get('error', 'AI service is temporarily unavailable.'))

            # ── Parse the raw AI text into {header, line_items} ────────────────
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

            # Support both dynamic output {data: {..., items: []}} and legacy formats
            if isinstance(extracted, dict) and 'data' in extracted:
                data_obj = extracted['data']
                if isinstance(data_obj, list) and len(data_obj) > 0 and isinstance(data_obj[0], dict):
                    # AI wrapped the object in an array instead of returning a singular dict
                    data_obj = data_obj[0]

                if isinstance(data_obj, dict):
                    items = data_obj.pop('items', [])
                    invoice_data = data_obj
                elif isinstance(data_obj, list):
                    # Fallback flat list
                    invoice_data = {}
                    items = data_obj
                else:
                    invoice_data = {}
                    items = []
            elif isinstance(extracted, dict) and ('invoice' in extracted or 'header' in extracted):
                invoice_data = extracted.get('invoice', extracted.get('header', {}))
                items = extracted.get('items', extracted.get('line_items', []))
            elif isinstance(extracted, list) and extracted:
                # Legacy: array of flat objects — treat first element as header, no line items
                invoice_data = extracted[0] if extracted else {}
                items = []
            else:
                invoice_data = extracted if isinstance(extracted, dict) else {}
                items = []

            # Ensure items is a list
            if not items:
                items = []
            elif isinstance(items, dict):
                items = [items]
            elif not isinstance(items, list):
                items = []

            if not isinstance(invoice_data, dict):
                invoice_data = {}

            # ── Post-processing: normalise every line item and header ──────────
            import re as _re

            # Numeric-only fields — strip currency symbols, commas, stray units
            NUMERIC_FIELDS = {
                'Rate', 'Item Rate', 'Taxable Value', 'Taxable Amount',
                'Integrated Tax (IGST)', 'Central Tax (CGST)', 'State Tax (SGST)', 
                'IGST', 'CGST', 'SGST/UTGST', 'Cess', 'Item Amount', 'Amount', 
                'Disc %', 'Disc%', 'Disc Amount', 'GST %', 'GST Rate',
                'Total Taxable Value', 'Total IGST', 'Total CGST', 'Total SGST', 'Total Cess', 
                'Total State Cess', 'Total Invoice Value', 'Invoice Value',
                'TDS Income Tax', 'TDS GST', 'TDS/TCS under GST', 'TDS/TCS under Income Tax',
                'Advance Paid', 'To Pay', 'IGST Rate', 'CGST Rate', 'SGST/UTGST Rate', 
                'Cess Rate', 'Cess Rate Per Unit', 'State Cess Rate',
                'Quantity', 'Qty', 'Billed Quantity', 'Actual Quantity',
                'Advance Payment/Receipt/Refund Details - IGST Rate',
                'Advance Payment/Receipt/Refund Details - IGST Amount',
                'Advance Payment/Receipt/Refund Details - SGST Rate',
                'Advance Payment/Receipt/Refund Details - SGST Amount',
                'Advance Payment/Receipt/Refund Details - CGST Rate',
                'Advance Payment/Receipt/Refund Details - CGST Amount',
                'Tax Type Allocations - IGST Liability',
                'Tax Type Allocations - CGST Liability',
                'Tax Type Allocations - SGST/UTGST Liability',
                'GST Advance Details - GST Rate',
                'GST Advance Details - Cess Rate',
                'GST Advance Details - Advance Amount',
                'TDS - Assessable Value', 'TCS - Assessable Value',
                'Amount'
            }

            def clean_numeric_fields(obj: dict):
                for k, v in list(obj.items()):
                    if v is None:
                        obj[k] = ''
                        continue
                        
                    # 1. Normalize strings to UPPERCASE and clean noise
                    if isinstance(v, str):
                        v = ' '.join(v.split()).upper()
                        obj[k] = v

                    # 2. Extract numeric values rigorously
                    if k in NUMERIC_FIELDS:
                        val = str(v).strip()
                        if val:
                            # Remove commas and non-numeric except dot and minus
                            cleaned = _re.sub(r'[^\d.\-]', '', val.replace(',', ''))
                            obj[k] = cleaned if cleaned else '0'
                        else:
                            obj[k] = '0'

            # Clean header data
            clean_numeric_fields(invoice_data)

            # --- Financial Consistency Validation ---
            total_taxable_items = 0.0
            total_tax_items = 0.0
            
            for idx, item in enumerate(items, start=1):
                if not isinstance(item, dict): continue
                
                item['S.No'] = str(idx)
                clean_numeric_fields(item)

                # 1. Qty + UOM split
                qty_raw = str(item.get('Quantity') or item.get('Qty') or item.get('Billed Quantity') or '').strip()
                uom_raw = str(item.get('UOM') or item.get('Quantity UOM') or '').strip()
                if qty_raw and not uom_raw:
                    m = _re.match(r'^([\d.]+)\s*([A-Z]+)$', qty_raw)
                    if m:
                        # Attempt to assign back to whichever field was present
                        if 'Quantity' in item: item['Quantity'] = m.group(1)
                        if 'Qty' in item: item['Qty'] = m.group(1)
                        if 'UOM' in item: item['UOM'] = m.group(2)
                        if 'Quantity UOM' in item: item['Quantity UOM'] = m.group(2)

                # 2. Per-Row Validation: Rate * Qty ≈ Taxable Value
                try:
                    q = float(item.get('Quantity') or item.get('Qty') or item.get('Billed Quantity') or 0)
                    r = float(item.get('Item Rate') or item.get('Rate') or item.get('Ledger Rate') or 0)
                    t = float(item.get('Taxable Value') or item.get('Taxable Amount') or 0)
                    if q > 0 and r > 0 and t > 0:
                        expected_t = q * r
                        if abs(expected_t - t) > 2.0: # allow tolerance
                            logger.warning(f"Row {idx} calculation mismatch: {q} * {r} = {expected_t} but found {t}")
                except (ValueError, TypeError): pass

                # 3. Aggregate for validation
                try:
                    total_taxable_items += float(item.get('Taxable Value') or item.get('Taxable Amount') or 0)
                    total_tax_items += float(item.get('IGST') or item.get('Integrated Tax (IGST)') or 0) + \
                                       float(item.get('CGST') or item.get('Central Tax (CGST)') or 0) + \
                                       float(item.get('SGST/UTGST') or item.get('State Tax (SGST)') or 0) + \
                                       float(item.get('Cess') or 0)
                except (ValueError, TypeError): pass

                # 4. HSN normalization
                hsn = _re.sub(r'[^\d]', '', str(item.get('HSN/SAC', '')))
                item['HSN/SAC'] = hsn if 4 <= len(hsn) <= 8 else ''
            
            # --- Cross-check Totals & Prevent Numeric Drift ---
            try:
                header_taxable = float(invoice_data.get('Total Taxable Value') or 0)
                header_total = float(invoice_data.get('Total Invoice Value') or 0)
                total_tax_header = float(invoice_data.get('Total IGST') or 0) + \
                                  float(invoice_data.get('Total CGST') or 0) + \
                                  float(invoice_data.get('Total SGST') or 0)

                # If item-level aggregation is strong but header is zero/missing, promote items
                if total_taxable_items > 0 and header_taxable == 0:
                    invoice_data['Total Taxable Value'] = str(total_taxable_items)
                
                # Verify taxable subtotal
                if abs(total_taxable_items - header_taxable) > 2.0 and total_taxable_items > 0:
                    logger.warning(f"Consistency Check Failed: Items Sum ({total_taxable_items}) != Header Subtotal ({header_taxable})")
                
                # Verify Grand Total Integrity: Subtotal + Taxes ≈ Total
                computed_total = total_taxable_items + (total_tax_header if total_tax_header > 0 else total_tax_items)
                if abs(computed_total - header_total) > 5.0 and header_total > 0:
                     logger.warning(f"Grand Total Integrity Mismatch: Found {header_total}, expected approx {computed_total}")
            except Exception: pass

            # Store extraction performance
            end_time = time.time()
            from .models import ExtractionPerformance
            ExtractionPerformance.objects.create(
                file_count=1,
                processing_time_seconds=end_time - start_time
            )

            return Response({
                'success': True,
                'data': {
                    'invoice': invoice_data,
                    'items': items,
                }
            })


        elif action == 'extract-master':
            # Handle file upload for Tally Master data extraction
            if 'file' not in request.FILES:
                return Response({'error': 'No file provided.'}, status=400)

            # Check AI Usage Limit (same as extract-invoice)
            from .usage_service import check_and_increment_usage

            plan = getattr(request.user, 'selected_plan', 'FREE') or 'FREE'
            plan = plan.upper()

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

            from .ai_service import create_master_processing_request
            result = create_master_processing_request(
                file_obj,
                mime_type=file_obj.content_type,
                user_id=user_id,
                tenant_id=tenant_id
            )

            if 'error' in result:
                raise ExternalServiceError(result.get('error', 'AI service is temporarily unavailable.'))

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
                master_data = _json.loads(raw_text)
            except Exception:
                import re
                match = re.search(r'\{[\s\S]*\}', raw_text)
                if match:
                    master_data = _json.loads(match.group(0))
                else:
                    return Response({'error': 'Failed to parse AI response as JSON.'}, status=500)

            # Ensure it's a flat dict, not nested
            if not isinstance(master_data, dict):
                master_data = {}

            # Convert any null values to empty string
            for k, v in master_data.items():
                if v is None:
                    master_data[k] = ''

            return Response({
                'success': True,
                'data': {
                    'master': master_data,
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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def extraction_average_time(request):
    from .models import ExtractionPerformance
    from django.db.models import Avg
    
    avg_data = ExtractionPerformance.objects.aggregate(Avg('processing_time_seconds'))
    avg_time = avg_data['processing_time_seconds__avg']
    
    if avg_time is None:
        avg_time = 3.85  # Fallback to a default if absolutely no records exist
        
    return Response({
        'average_time_per_invoice': round(avg_time, 2)
    })
