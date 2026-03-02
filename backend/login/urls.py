"""
Login Module URL Configuration
"""

from django.urls import path
from .api import LoginView, TokenRefreshView, LogoutView, ForgotUserIDView, ForgotPasswordView, RequestResetOTPView, VerifyResetOTPView, VerifyOTPOnlyView

urlpatterns = [
    path('login/', LoginView.as_view(), name='auth-login'),
    path('refresh/', TokenRefreshView.as_view(), name='auth-refresh'),
    path('logout/', LogoutView.as_view(), name='auth-logout'),
    path('request-reset-otp/', RequestResetOTPView.as_view(), name='auth-request-reset-otp'),
    path('verify-otp-only/', VerifyOTPOnlyView.as_view(), name='auth-verify-otp-only'),
    path('verify-reset-otp/', VerifyResetOTPView.as_view(), name='auth-verify-reset-otp'),
]
