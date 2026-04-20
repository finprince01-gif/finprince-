from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import GSTReconciliationViewSet

router = DefaultRouter()
router.register(r'reconciliation', GSTReconciliationViewSet, basename='gst-reconciliation')

urlpatterns = [
    path('', include(router.urls)),
]
