from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from vouchers.schema_config import get_voucher_schema_view
# REMOVED LEGACY OCR IMPORTS
from ocr_pipeline.views import CleanOCRStagingView, OCRStagingFinalizeView, OCRStagingRescanView, OCRStagingRescanUploadView # NEW IMPORT
from core.auth_views import CookieTokenObtainPairView, CookieTokenRefreshView, LogoutView
from core.token import MyTokenObtainPairSerializer
from core.views import AdminSubscriptionsView, AdminPaymentsView
from accounting.sales_excel_api import (
    SalesVoucherColumnSchemaView, SalesExcelTemplateDownloadView, 
    SalesExcelErrorReportView, SalesExcelUploadView,
    SalesExcelWorkflowUploadView, SalesExcelWorkflowUpdateView, SalesExcelWorkflowFinalizeView
)
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from vendors.vendorpo_api import get_pending_pos
from vendors.vendor_api import PurchaseVendorValidateView, PurchaseVendorCreateView, PurchaseVendorResolveConflictView
from inventory.views import HsnDetailsAPIView
import threading
import sys

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # Pendings POs for Vendor
    path('api/get_pending_pos', get_pending_pos, name='get_pending_pos'),
    
    # API Documentation
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
    
    # Admin API
    path('api/admin/subscriptions', AdminSubscriptionsView.as_view(), name='admin-subscriptions-no-slash'),
    path('api/admin/subscriptions/', AdminSubscriptionsView.as_view(), name='admin-subscriptions'),
    path('api/admin/payments', AdminPaymentsView.as_view(), name='admin-payments-no-slash'),
    path('api/admin/payments/', AdminPaymentsView.as_view(), name='admin-payments'),
    
    # Core (Company, Health, Agent, Auth recovery)
    path('api/', include('core.urls')),

    # Login
    path('api/auth/', include('login.urls')),
    
    # Registration - DISABLED (PUBLIC SIGNUP REMOVED)
    # path('api/auth/', include('registration.urls')),
    
    # Master Admin Domain
    path('api/master/', include('core.master_urls')),
    
    # Masters
    path('api/masters/', include('masters.urls')),

    # Inventory
    path('api/inventory/', include('inventory.urls')),

    # Vendors 
    path('api/vendors/', include('vendors.urls')),
    
    # Custom Vendor Validation for Purchase
    path('api/purchase/vendors/validate/', PurchaseVendorValidateView.as_view(), name='purchase-vendors-validate'),
    path('api/purchase/vendors/create/', PurchaseVendorCreateView.as_view(), name='purchase-vendors-create'),
    path('api/purchase/vendors/resolve-conflict/', PurchaseVendorResolveConflictView.as_view(), name='purchase-vendors-resolve-conflict'),
    
    # Customer Portal
    path('api/customerportal/', include('customerportal.urls')),
    
    # Payroll Management
    path('api/payroll/', include('payroll.urls')),
    
    # Role-Based Access Control
    path('api/rbac/', include('rbac.urls')),
    
    # Services Management
    path('api/services/', include('services.urls')),
    
    # Vouchers
    path('api/', include('vouchers.urls')),
    
    # Settings
    path('api/', include('settings.urls')),

    # Reports
    path('api/reports/', include('reports.urls')),
    
    # Questions API
    path('api/', include('accounting.urls')),

    # OCR Staging Workflow (CONSOLIDATED TO NEW MODULE)
    path('api/ocr-staging/', CleanOCRStagingView.as_view(), name='ocr-staging-list-upload'),
    path('api/ocr-staging/<str:file_hash>/', CleanOCRStagingView.as_view(), name='ocr-staging-remove'),
    path('api/ocr-staging-finalize/', OCRStagingFinalizeView.as_view(), name='ocr-staging-finalize'),
    path('api/ocr-staging-rescan/', OCRStagingRescanView.as_view(), name='ocr-staging-rescan'),
    path('api/ocr-staging-rescan-upload/', OCRStagingRescanUploadView.as_view(), name='ocr-staging-rescan-upload'),

    # Voucher Schema Dynamic API
    path('api/voucher-schema/', get_voucher_schema_view, name='voucher-schema-dynamic'),

    # Sales Excel Upload Workflow
    path('api/sales-excel/workflow/template/', SalesExcelTemplateDownloadView.as_view(), name='sales-excel-workflow-template'),
    path('api/sales-excel/workflow/upload/', SalesExcelWorkflowUploadView.as_view(), name='sales-excel-workflow-upload'),
    path('api/sales-excel/workflow/update/', SalesExcelWorkflowUpdateView.as_view(), name='sales-excel-workflow-update'),
    path('api/sales-excel/workflow/finalize/', SalesExcelWorkflowFinalizeView.as_view(), name='sales-excel-workflow-finalize'),

    # Hsn Details API
    path('api/hsn-details/', HsnDetailsAPIView.as_view(), name='hsn-details'),

    # GST Reconciliation & Computation (New Module)
    path('api/gst/', include('gst_reconciliation.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
