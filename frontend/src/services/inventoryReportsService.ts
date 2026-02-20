/**
 * Inventory Reports API Service
 * 
 * Service layer for fetching inventory report data from backend APIs.
 * All functions return promises with typed data.
 */


import { httpClient } from './httpClient';
import type {
    ReportFilters,
    ReportApiResponse,
    StockSummaryData,
    InventoryValuationData,
    InventoryValuationDetailData,
    InventoryAgingData,
    ItemDetailsData,
    SalesByItemData,
    PurchasesByItemData,
    InventoryAdjustmentData,
    WarehouseSummaryData,
    WarehouseDetailData
} from '../types/inventoryReports';

const API_BASE_URL = '/api/inventory/reports';

/**
 * Fetch Stock Summary Report
 */
export const fetchStockSummary = async (
    filters: Partial<ReportFilters>
): Promise<ReportApiResponse<StockSummaryData>> => {
    return httpClient.get<ReportApiResponse<StockSummaryData>>(
        `${API_BASE_URL}/stock-summary`,
        filters
    );
};

/**
 * Fetch Inventory Valuation Summary
 */
export const fetchInventoryValuationSummary = async (
    filters: Partial<ReportFilters>
): Promise<ReportApiResponse<InventoryValuationData>> => {
    return httpClient.get<ReportApiResponse<InventoryValuationData>>(
        `${API_BASE_URL}/inventory-valuation-summary`,
        filters
    );
};

/**
 * Fetch Inventory Valuation Detail
 */
export const fetchInventoryValuationDetail = async (
    filters: Partial<ReportFilters>
): Promise<ReportApiResponse<InventoryValuationDetailData>> => {
    return httpClient.get<ReportApiResponse<InventoryValuationDetailData>>(
        `${API_BASE_URL}/inventory-valuation-detail`,
        filters
    );
};

/**
 * Fetch Inventory Aging Report
 */
export const fetchInventoryAging = async (
    filters: Partial<ReportFilters>
): Promise<ReportApiResponse<InventoryAgingData>> => {
    return httpClient.get<ReportApiResponse<InventoryAgingData>>(
        `${API_BASE_URL}/inventory-aging`,
        filters
    );
};

/**
 * Fetch Item Details Report
 */
export const fetchItemDetails = async (
    filters: Partial<ReportFilters>
): Promise<ReportApiResponse<ItemDetailsData>> => {
    return httpClient.get<ReportApiResponse<ItemDetailsData>>(
        `${API_BASE_URL}/item-details`,
        filters
    );
};

/**
 * Fetch Sales by Item Report
 */
export const fetchSalesByItem = async (
    filters: Partial<ReportFilters>
): Promise<ReportApiResponse<SalesByItemData>> => {
    return httpClient.get<ReportApiResponse<SalesByItemData>>(
        `${API_BASE_URL}/sales-by-item`,
        filters
    );
};

/**
 * Fetch Purchases by Item Report
 */
export const fetchPurchasesByItem = async (
    filters: Partial<ReportFilters>
): Promise<ReportApiResponse<PurchasesByItemData>> => {
    return httpClient.get<ReportApiResponse<PurchasesByItemData>>(
        `${API_BASE_URL}/purchases-by-item`,
        filters
    );
};

/**
 * Fetch Inventory Adjustment Report
 */
export const fetchInventoryAdjustment = async (
    filters: Partial<ReportFilters>
): Promise<ReportApiResponse<InventoryAdjustmentData>> => {
    return httpClient.get<ReportApiResponse<InventoryAdjustmentData>>(
        `${API_BASE_URL}/inventory-adjustment`,
        filters
    );
};

/**
 * Fetch Warehouse Summary Report
 */
export const fetchWarehouseSummary = async (
    filters: Partial<ReportFilters>
): Promise<ReportApiResponse<WarehouseSummaryData>> => {
    return httpClient.get<ReportApiResponse<WarehouseSummaryData>>(
        `${API_BASE_URL}/warehouse-summary`,
        filters
    );
};

/**
 * Fetch Warehouse Detail Report
 */
export const fetchWarehouseDetail = async (
    filters: Partial<ReportFilters>
): Promise<ReportApiResponse<WarehouseDetailData>> => {
    return httpClient.get<ReportApiResponse<WarehouseDetailData>>(
        `${API_BASE_URL}/warehouse-detail`,
        filters
    );
};
