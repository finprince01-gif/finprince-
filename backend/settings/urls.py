"""
Settings Module URL Configuration
"""

from django.urls import path, include
from rest_framework import routers
from .api import BranchSettingsViewSet, UserTablesViewSet

router = routers.DefaultRouter()

# Settings endpoints
router.register('branch-settings', BranchSettingsViewSet, basename='branch-settings')
router.register('user-tables', UserTablesViewSet, basename='user-tables')

urlpatterns = [
    path('', include(router.urls)),
]
