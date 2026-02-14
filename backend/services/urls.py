"""
Services Module URL Configuration
"""

from django.urls import path, include
from rest_framework import routers
from .views import ServiceViewSet, ServiceGroupViewSet

router = routers.DefaultRouter()

# Service Group endpoints (Must be registered before generic service endpoint)
router.register('groups', ServiceGroupViewSet, basename='service-groups')

# Service endpoints
router.register('', ServiceViewSet, basename='services')


urlpatterns = [
    path('', include(router.urls)),
]
