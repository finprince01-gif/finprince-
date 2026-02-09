import React, { useState, useEffect } from 'react';
import FilterBar from '../shared/FilterBar';
import ExportButton from '../shared/ExportButton';
import ReportTable from '../shared/ReportTable';
import ChartWidget from '../shared/ChartWidget';
import { fetchInventoryValuationSummary } from '../../../services/inventoryReportsService';
import type { InventoryValuationData, ReportFilters } from '../../../types/inventoryReports';

/**
 * Inventory Valuation Summary Report
 * 
 * Shows the value of stock for all items with:
 * - Summary cards for total inventory value
 * - Table with item details, quantities, rates, and values
 * - Bar chart showing top 10 items by value
 * - Export functionality
 */

const InventoryValuationSummary: React.FC = () => {
    const [data, setData] = useState<InventoryValuationData[]>([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState<Partial<ReportFilters>>({
        dateFrom: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        dateTo: new Date().toISOString().split('T')[0]
    });

    const loadReport = async () => {
        setLoading(true);
        try {
            const response = await fetchInventoryValuationSummary(filters);
            setData(response.data || []);
        } catch (error) {
            console.error('Failed to load inventory valuation summary:', error);
            // In production, show error toast/notification
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
    const totalValue = data.reduce((sum, item) => sum + item.inventoryAssetValue, 0);
    const totalQuantity = data.reduce((sum, item) => sum + item.quantity, 0);

    // Prepare chart data (top 10 items by value)
    const chartData = [...data]
        .sort((a, b) => b.inventoryAssetValue - a.inventoryAssetValue)
        .slice(0, 10)
        .map(item => ({
            name: item.itemName,
            value: item.inventoryAssetValue
        }));

    // Table columns
    const columns = [
        {
            key: 'itemName',
            label: 'Item Name',
            sortable: true
        },
        {
            key: 'quantity',
            label: 'Quantity',
            align: 'right' as const,
            render: (value: number) => value.toLocaleString()
        },
        {
            key: 'rate',
            label: 'Rate',
            align: 'right' as const,
            render: (value: number) => `₹${value.toFixed(2)}`
        },
        {
            key: 'inventoryAssetValue',
            label: 'Inventory Asset Value',
            align: 'right' as const,
            render: (value: number) => `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        }
    ];

    // Export columns
    const exportColumns = [
        { key: 'itemName', label: 'Item Name' },
        { key: 'quantity', label: 'Quantity' },
        { key: 'rate', label: 'Rate' },
        { key: 'inventoryAssetValue', label: 'Inventory Asset Value' }
    ];

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Inventory Valuation Summary</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Summary of the value of stock for all items in your organization
                    </p>
                </div>
                <ExportButton
                    data={data}
                    filename="inventory-valuation-summary"
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
                        <div className="text-3xl font-bold text-gray-900">{data.length}</div>
                    </div>
                    <div className="bg-white p-6 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-slate-200">
                        <div className="text-sm font-medium text-gray-500 mb-1">Total Quantity</div>
                        <div className="text-3xl font-bold text-gray-900">{totalQuantity.toLocaleString()}</div>
                    </div>
                    <div className="bg-white p-6 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-slate-200">
                        <div className="text-sm font-medium text-gray-500 mb-1">Total Inventory Value</div>
                        <div className="text-3xl font-bold text-blue-600">
                            ₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>
                </div>
            )}

            {/* Chart */}
            {!loading && chartData.length > 0 && (
                <ChartWidget
                    type="bar"
                    data={chartData}
                    xKey="name"
                    yKey="value"
                    title="Top 10 Items by Value"
                    height={300}
                />
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

export default InventoryValuationSummary;

