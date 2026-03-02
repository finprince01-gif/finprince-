/**
 * TypeScript Type Definitions for Inventory Reports
 */

// Common filter interface
export interface ReportFilters {
    dateFrom: string;
    dateTo: string;
    itemId?: string;
    warehouseId?: string;
    category?: string;
    vendorId?: string;
    customerId?: string;
}

// Stock Summary Report
export interface StockSummaryData {
    itemId: string;
    itemName: string;
    sku: string;
    reorderLevel: number;
    quantityOrdered: number;
    quantityIn: number;
    quantityOut: number;
    stockOnHand: number;
    committedStock: number;
    availableForSale: number;
}

// Inventory Valuation
export interface InventoryValuationData {
    itemId: string;
    itemName: string;
    quantity: number;
    rate: number;
    inventoryAssetValue: number;
}

export interface InventoryValuationDetailData {
    date: string;
    transactionType: string;
    reference: string;
    quantityIn: number;
    quantityOut: number;
    rate: number;
    value: number;
    runningBalance: number;
}

// Inventory Aging
export interface InventoryAgingData {
    itemId: string;
    itemName: string;
    days0to30: number;
    days31to60: number;
    days61to90: number;
    days90Plus: number;
    total: number;
}

// Item Details
export interface ItemDetailsData {
    itemId: string;
    itemName: string;
    sku: string;
    category: string;
    unit: string;
    hsn: string;
    gstRate: number;
    currentStock: number;
    value: number;
}

// Sales by Item
export interface SalesByItemData {
    itemId: string;
    itemName: string;
    quantitySold: number;
    salesAmount: number;
    averagePrice: number;
}

// Purchases by Item
export interface PurchasesByItemData {
    itemId: string;
    itemName: string;
    quantityPurchased: number;
    purchaseAmount: number;
    averageCost: number;
}

// Inventory Adjustment
export interface InventoryAdjustmentData {
    date: string;
    itemId: string;
    itemName: string;
    adjustmentType: 'increase' | 'decrease';
    quantityAdjusted: number;
    reason: string;
    reference: string;
}

// Warehouse Summary
export interface WarehouseSummaryData {
    warehouseId: string;
    warehouseName: string;
    totalItems: number;
    totalQuantity: number;
    totalValue: number;
}

// Warehouse Detail
export interface WarehouseDetailData {
    itemId: string;
    itemName: string;
    warehouseId: string;
    warehouseName: string;
    quantity: number;
    value: number;
}

// API Response wrapper
export interface ReportApiResponse<T> {
    success: boolean;
    data: T[];
    message?: string;
    summary?: {
        totalItems?: number;
        totalValue?: number;
        lowStockItems?: number;
        outOfStockItems?: number;
        [key: string]: any;
    };
}

// Report types enum
export enum ReportType {
    STOCK_SUMMARY = 'stock-summary',
    INVENTORY_VALUATION_SUMMARY = 'inventory-valuation-summary',
    INVENTORY_VALUATION_DETAIL = 'inventory-valuation-detail',
    INVENTORY_AGING = 'inventory-aging',
    ITEM_DETAILS = 'item-details',
    SALES_BY_ITEM = 'sales-by-item',
    PURCHASES_BY_ITEM = 'purchases-by-item',
    INVENTORY_ADJUSTMENT = 'inventory-adjustment',
    WAREHOUSE_SUMMARY = 'warehouse-summary',
    WAREHOUSE_DETAIL = 'warehouse-detail'
}
