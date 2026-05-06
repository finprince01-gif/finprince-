from django.urls import path, include  # type: ignore
from rest_framework import routers  # type: ignore
from .auth_views import (
    CookieTokenObtainPairView, CookieTokenRefreshView, LogoutView, MeView,
    ForgotUserIDView, ForgotPasswordView, SwitchBranchView
)
from .views import (
    health_check, check_status, check_phone,
    AgentMessageView, AIProxyView, ai_job_status,
    ai_metrics, health_with_metrics, AdminPaymentsView,
    extraction_average_time, OCRCacheUpdateView,
    BranchViewSet
)
from .admin_views import AdminSubscriptionsView, AdminUserStatusView
from .direct_registration import DirectRegisterView
from .company_settings_views import CompanySettingsView
from .reports_views import (
    DayBookExcelView, LedgerExcelView, TrialBalanceExcelView, 
    StockSummaryExcelView, GSTReportExcelView
)

router = routers.DefaultRouter()
router.register('branches', BranchViewSet, basename='branches')

urlpatterns = [
    path('auth/me/', MeView.as_view(), name='auth-me'),
    path('auth/check-status/', check_status, name='check-status'),
    path('auth/check-phone/', check_phone, name='check-phone'),
    path('auth/forgot-userid/', ForgotUserIDView.as_view(), name='forgot-userid'),
    path('auth/forgot-password/', ForgotPasswordView.as_view(), name='forgot-password'),
    path('auth/forgot-userid/', ForgotUserIDView.as_view(), name='forgot-userid'),
    path('auth/forgot-password/', ForgotPasswordView.as_view(), name='forgot-password'),
    path('auth/switch-branch/', SwitchBranchView.as_view(), name='switch-branch'),
    path('health/', health_with_metrics, name='health'), # /api/health
    path('company-settings/', CompanySettingsView.as_view(), name='company-settings'),

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
    path('ai/ocr-cache/<int:record_id>/update/', OCRCacheUpdateView.as_view(), name='ocr-cache-update'),
    path('agent/message/', AgentMessageView.as_view()),  # Legacy endpoint, uses AI proxy internally
    path('metrics/ai/', ai_metrics, name='ai-metrics'),
    path('ai/job-status/<str:job_id>/', ai_job_status, name='ai-job-status'),
    path('extraction-average-time/', extraction_average_time, name='extraction-average-time'),
    
    path('', include(router.urls)),
]
