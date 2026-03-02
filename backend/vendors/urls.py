from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .posettings_api import VendorMasterPOSettingsViewSet
from .vendor_api import VendorViewSet
from .vendorbasicdetail_api import VendorBasicDetailViewSet
from .vendorgstdetails_api import VendorGSTDetailsViewSet
from .vendorproduct_api import VendorProductServiceViewSet
from .vendortds_api import VendorMasterTDSViewSet
from .vendorbanking_api import VendorMasterBankingViewSet
from .vendorterms_api import VendorMasterTermsViewSet
from .vendorpo_api import VendorPOViewSet
from .vendorcategory_api import VendorMasterCategoryViewSet

router = DefaultRouter()
router.register(r'categories', VendorMasterCategoryViewSet, basename='vendor-categories')
router.register(r'po-settings', VendorMasterPOSettingsViewSet, basename='po-settings')
router.register(r'vendors', VendorViewSet, basename='vendors')
router.register(r'basic-details', VendorBasicDetailViewSet, basename='vendor-basic-details')
router.register(r'gst-details', VendorGSTDetailsViewSet, basename='vendor-gst-details')
router.register(r'product-services', VendorProductServiceViewSet, basename='vendor-product-services')
router.register(r'tds-details', VendorMasterTDSViewSet, basename='vendor-tds-details')
router.register(r'banking-details', VendorMasterBankingViewSet, basename='vendor-banking-details')
router.register(r'terms', VendorMasterTermsViewSet, basename='vendor-terms')
router.register(r'purchase-orders', VendorPOViewSet, basename='vendor-purchase-orders')

urlpatterns = [
    path('', include(router.urls)),
]
