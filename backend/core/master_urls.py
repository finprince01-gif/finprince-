from django.urls import path  # type: ignore
from .master_views import (
    MasterRegisterView, MasterLoginView,
    MasterBranchDrilldownView,
    MasterDashboardStatsView, MasterRecentActivityView, MasterSettingsView,
    MasterReportsView, MasterBranchSettingsView,
    MasterBranchListCreateView, MasterBranchDetailView,
    MasterTokenRefreshView, MasterRequestResetOTPView, MasterVerifyOTPOnlyView, MasterResetPasswordView,
    MasterResetBranchPasswordView
)
from .auth_views import MeView

urlpatterns = [
    path('auth/me/', MeView.as_view(), name='master-me'),
    path('auth/register/', MasterRegisterView.as_view(), name='master-register'),
    path('auth/login/', MasterLoginView.as_view(), name='master-login'),
    path('auth/request-otp/', MasterRequestResetOTPView.as_view(), name='master-request-otp'),
    path('auth/verify-otp-only/', MasterVerifyOTPOnlyView.as_view(), name='master-verify-otp-only'),
    path('auth/reset-password/', MasterResetPasswordView.as_view(), name='master-reset-password'),
    path('auth/refresh/', MasterTokenRefreshView.as_view(), name='master-refresh'),
    
    path('branches/', MasterBranchListCreateView.as_view(), name='master-branches'),
    path('branches/<str:tenant_id>/', MasterBranchDetailView.as_view(), name='master-branch-detail'),
    path('branches/<str:tenant_id>/drilldown/', MasterBranchDrilldownView.as_view(), name='master-branch-drilldown'),
    path('branches/<str:tenant_id>/settings/', MasterBranchSettingsView.as_view(), name='master-branch-settings'),
    path('branches/<str:tenant_id>/reset-password/', MasterResetBranchPasswordView.as_view(), name='master-branch-reset-password'),
    
    path('stats/', MasterDashboardStatsView.as_view(), name='master-dashboard-stats'),
    path('recent-activity/', MasterRecentActivityView.as_view(), name='master-recent-activity'),
    path('settings/', MasterSettingsView.as_view(), name='master-settings'),
    path('reports/', MasterReportsView.as_view(), name='master-reports'),
]
