

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from core.auth_views import CookieTokenObtainPairView, CookieTokenRefreshView, LogoutView
from core.token import MyTokenObtainPairSerializer
from admin_api import SubscriptionsListView
import threading
import sys

def check_db_connection():
    from django.db import connection
    try:
        connection.ensure_connection()
        print("[OK] Database connected successfully!")
    except Exception as e:
        print(f"[ERROR] Database connection failed: {e}")

# Run only once on startup (prevent partial execution during autoreload)
if 'runserver' in sys.argv and threading.current_thread() is threading.main_thread():
    # Only run in the main thread to avoid duplicates
    pass
# Hack: Use AppConfig.ready() is better, but this is a quick spot for urls.py
check_db_connection()



urlpatterns = [
    path('admin/', admin.site.urls),
    
    # Admin API (for admin-subscription-panel) - accept both with/without trailing slash
    path('api/admin/subscriptions', SubscriptionsListView.as_view(), name='admin-subscriptions-no-slash'),
    path('api/admin/subscriptions/', SubscriptionsListView.as_view(), name='admin-subscriptions'),
    path('api/admin/payments', SubscriptionsListView.as_view(), name='admin-payments-no-slash'),
    path('api/admin/payments/', SubscriptionsListView.as_view(), name='admin-payments'),
    
    # Login - NEW refactored module
    path('api/auth/', include('login.urls')),
    
    # Registration - Using registration module
    path('api/auth/', include('registration.urls')),
    
    # Core (Company, Health, Agent) - mapped to /api/
    path('api/', include('core.urls')),
    
    # Masters - NEW refactored module
    path('api/masters/', include('masters.urls')),
    # path('api/', include('masters.urls')),  # For hierarchy endpoint
    

    
    # Inventory - NEW refactored module
    path('api/inventory/', include('inventory.urls')),

    # Vendors - Vendor Portal
    path('api/vendors/', include('vendors.urls')),
    
    # Customer Portal
    path('api/customerportal/', include('customerportal.urls')),
    
    # Payroll Management
    path('api/payroll/', include('payroll.urls')),
    
    # Services Management
    path('api/services/', include('services.urls')),
    
    # Vouchers - NEW refactored module
    # path('api/', include('vouchers.urls')),  # Commented out - vouchers module being rebuilt
    
    # Settings - NEW refactored module
    path('api/', include('settings.urls')),
    


    # Reports
    path('api/reports/', include('reports.urls')),
    
    # Questions API (from accounting module)
    path('api/', include('accounting.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
