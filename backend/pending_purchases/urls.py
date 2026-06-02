from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PendingPurchaseViewSet

router = DefaultRouter()
router.register(r'', PendingPurchaseViewSet, basename='pending-purchases')

urlpatterns = [
    path('', include(router.urls)),
]
