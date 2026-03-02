import React, { useState, useEffect } from 'react';
import FilterBar from '../shared/FilterBar';
import ExportButton from '../shared/ExportButton';
import ReportTable from '../shared/ReportTable';
import { fetchStockSummary } from '../../../services/inventoryReportsService';
import type { StockSummaryData, ReportFilters } from '../../../types/inventoryReports';

/**
 * Stock Summary Report
 * 
 * Summary of item movement in and out of the organization with:
 * - Quantities ordered, in, out
 * - Stock on hand, committed stock, available for sale
 * - Summary cards for key metrics
 */

const StockSummaryReport: React.FC = () => {
    const [data, setData] = useState<StockSummaryData[]>([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState<Partial<ReportFilters>>({
        dateFrom: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        dateTo: new Date().toISOString().split('T')[0]
    });

    const loadReport = async () => {
        setLoading(true);
        try {
            const response = await fetchStockSummary(filters);
            setData(response.data || []);
        } catch (error) {
            console.error('Failed to load stock summary:');
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReport();
    }, []);

    const handleRunReport = () => {
        loadReport();
    };

    const handleReset = () => {
        setFilters({
            dateFrom: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
            dateTo: new Date().toISOString().split('T')[0]
        });
    };

    // Calculate summary metrics
    const lowStockItems = data.filter(item => item.stockOnHand <= item.reorderLevel).length;
    const outOfStockItems = data.filter(item => item.stockOnHand === 0).length;
    const totalItems = data.length;

    // Table columns
    const columns = [
        { key: 'itemName', label: 'Item Name', sortable: true },
        { key: 'sku', label: 'SKU' },
        { key: 'reorderLevel', label: 'Reorder Level', align: 'right' as const },
        { key: 'quantityOrdered', label: 'Qty Ordered', align: 'right' as const },
        { key: 'quantityIn', label: 'Qty In', align: 'right' as const },
        { key: 'quantityOut', label: 'Qty Out', align: 'right' as const },
        { key: 'stockOnHand', label: 'Stock On Hand', align: 'right' as const },
        { key: 'committedStock', label: 'Committed', align: 'right' as const },
        { key: 'availableForSale', label: 'Available', align: 'right' as const }
    ];

    const exportColumns = columns.map(col => ({ key: col.key, label: col.label }));

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Stock Summary</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Summary of item movement in and out of your organization
                    </p>
                </div>
                <ExportButton
                    data={data}
                    filename="stock-summary"
                    columns={exportColumns}
                />
            </div>

            {/* Filters */}
            <FilterBar
                filters={filters}
                onFilterChange={setFilters}
                onRunReport={handleRunReport}
                onReset={handleReset}
                showItemFilter={false}
                showWarehouseFilter={false}
            />

            {/* Summary Cards */}
            {!loading && data.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-6 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-slate-200">
                        <div className="text-sm font-medium text-gray-500 mb-1">Total Items</div>
                        <div className="text-3xl font-bold text-gray-900">{totalItems}</div>
                    </div>
                    <div className="bg-white p-6 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-slate-200">
                        <div className="text-sm font-medium text-gray-500 mb-1">Low Stock Items</div>
                        <div className="text-3xl font-bold text-yellow-600">{lowStockItems}</div>
                    </div>
                    <div className="bg-white p-6 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-slate-200">
                        <div className="text-sm font-medium text-gray-500 mb-1">Out of Stock</div>
                        <div className="text-3xl font-bold text-red-600">{outOfStockItems}</div>
                    </div>
                </div>
            )}

            {/* Table */}
            <ReportTable
                columns={columns}
                data={data}
                loading={loading}
                pageSize={25}
            />
        </div>
    );
};

export default StockSummaryReport;

