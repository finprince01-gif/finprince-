from django.urls import path, include  # type: ignore
from rest_framework import routers  # type: ignore
from .auth_views import (
    CookieTokenObtainPairView, CookieTokenRefreshView, LogoutView,
    ForgotUserIDView, ForgotPasswordView
)
from .views import (
    CompanySettingsViewSet, health_check, check_status, check_phone,
    AgentMessageView, AIProxyView,
    ai_metrics, health_with_metrics, AdminPaymentsView
)
from .admin_views import AdminSubscriptionsView, AdminUserStatusView
from .direct_registration import DirectRegisterView
from .reports_views import (
    DayBookExcelView, LedgerExcelView, TrialBalanceExcelView, 
    StockSummaryExcelView, GSTReportExcelView
)

router = routers.DefaultRouter()
router.register('company-settings', CompanySettingsViewSet, basename='company-settings')

urlpatterns = [
    # Direct Registration (no OTP)
    path('auth/register/', DirectRegisterView.as_view(), name='register'),
    
    path('auth/check-status/', check_status, name='check-status'),
    path('auth/check-phone/', check_phone, name='check-phone'),
    path('auth/forgot-userid/', ForgotUserIDView.as_view(), name='forgot-userid'),
    path('auth/forgot-password/', ForgotPasswordView.as_view(), name='forgot-password'),
    path('health/', health_check, name='health'), # /api/health

    # Reports
    path('reports/daybook/excel/', DayBookExcelView.as_view(), name='report-daybook-excel'),
    path('reports/ledger/excel/', LedgerExcelView.as_view(), name='report-ledger-excel'),
    path('reports/trialbalance/excel/', TrialBalanceExcelView.as_view(), name='report-trialbalance-excel'),
    path('reports/stocksummary/excel/', StockSummaryExcelView.as_view(), name='report-stocksummary-excel'),
    path('reports/gst/excel/', GSTReportExcelView.as_view(), name='report-gst-excel'),

    # Admin endpoints
    path('admin/subscriptions/', AdminSubscriptionsView.as_view(), name='admin-subscriptions'),
    path('admin/user-subscription/', AdminUserStatusView.as_view(), name='admin-user-subscription'),
    path('admin/payments/', AdminPaymentsView.as_view(), name='admin-payments'),

    # AI Services
    path('ai/<str:action>/', AIProxyView.as_view(), name='ai-proxy'),
    path('agent/message/', AgentMessageView.as_view()),  # Legacy endpoint, uses AI proxy internally
    path('metrics/ai/', ai_metrics, name='ai-metrics'),
    
    path('', include(router.urls)),
]
