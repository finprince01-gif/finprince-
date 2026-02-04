from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RoleViewSet, UserRoleViewSet, UserManagementViewSet

router = DefaultRouter()
router.register(r'roles', RoleViewSet, basename='role')
router.register(r'user-roles', UserRoleViewSet, basename='user-role')
router.register(r'users', UserManagementViewSet, basename='user')

urlpatterns = [
    path('', include(router.urls)),
]
