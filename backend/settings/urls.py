"""
Settings Module URL Configuration
"""

from django.urls import path, include
from rest_framework import routers
from .api import CompanySettingsViewSet, UserTablesViewSet

router = routers.DefaultRouter()

# Settings endpoints
router.register('company-settings', CompanySettingsViewSet, basename='company-settings')
router.register('user-tables', UserTablesViewSet, basename='user-tables')

urlpatterns = [
    path('', include(router.urls)),
]
