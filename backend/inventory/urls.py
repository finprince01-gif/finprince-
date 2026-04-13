from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    InventoryMasterCategoryViewSet, 
    InventoryLocationViewSet,
    InventoryItemViewSet,
    InventoryUnitViewSet,
    InventoryMasterGRNViewSet,
    InventoryMasterIssueSlipViewSet,
    InventoryOperationJobWorkViewSet,
    InventoryOperationInterUnitViewSet,
    InventoryOperationLocationChangeViewSet,
    InventoryOperationProductionViewSet,
    InventoryOperationConsumptionViewSet,
    InventoryOperationScrapViewSet,
    InventoryOperationOutwardViewSet,
    InventoryOperationNewGRNViewSet,
    PendingGRNListView,
    StockMovementSummaryViewSet
)

router = DefaultRouter()
router.register('master-categories', InventoryMasterCategoryViewSet, basename='inventory-master-category')
router.register('locations', InventoryLocationViewSet, basename='inventory-location')
router.register('items', InventoryItemViewSet, basename='inventory-item')
router.register('units', InventoryUnitViewSet, basename='inventory-unit')
router.register('master-voucher-grn', InventoryMasterGRNViewSet, basename='inventory-master-grn')
router.register('master-voucher-issue-slip', InventoryMasterIssueSlipViewSet, basename='inventory-master-issue-slip')

# Operation URLs
router.register('operations/job-work', InventoryOperationJobWorkViewSet, basename='inventory-operation-job-work')
router.register('operations/inter-unit', InventoryOperationInterUnitViewSet, basename='inventory-operation-inter-unit')
router.register('operations/location-change', InventoryOperationLocationChangeViewSet, basename='inventory-operation-location-change')
router.register('operations/production', InventoryOperationProductionViewSet, basename='inventory-operation-production')
router.register('operations/consumption', InventoryOperationConsumptionViewSet, basename='inventory-operation-consumption')
router.register('operations/scrap', InventoryOperationScrapViewSet, basename='inventory-operation-scrap')
# Old GRN endpoint removed - use 'operations/new-grn' instead
router.register('operations/outward', InventoryOperationOutwardViewSet, basename='inventory-operation-outward')
router.register('operations/new-grn', InventoryOperationNewGRNViewSet, basename='inventory-operation-new-grn')
router.register('reports/stock-movement', StockMovementSummaryViewSet, basename='inventory-report-stock-movement')

urlpatterns = [
    path('', include(router.urls)),
    path('operations/pending-grns/', PendingGRNListView.as_view(), name='pending-grns-list'),
    path('operations/next-grn-number/', InventoryOperationNewGRNViewSet.as_view({'get': 'next_grn_number'}), name='next-grn-number'),
]
