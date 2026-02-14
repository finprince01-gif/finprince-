import React, { useState, useEffect } from 'react';
import { fetchInventoryValuationDetail } from '../../../services/inventoryReportsService';
import type { InventoryValuationDetailData, ReportFilters } from '../../../types/inventoryReports';
import FilterBar from '../shared/FilterBar';
import ExportButton from '../shared/ExportButton';
import ReportTable from '../shared/ReportTable';
import ChartWidget from '../shared/ChartWidget';

/**
 * Inventory Valuation Detail Report
 * 
 * Shows detailed transaction-level inventory valuation data:
 * - Date, Transaction Type, Reference
 * - Qty In/Out, Rate, Value
 * - Running Balance
 */

const InventoryValuationDetail: React.FC = () => {
    const [data, setData] = useState<InventoryValuationDetailData[]>([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState<Partial<ReportFilters>>({
        dateFrom: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        dateTo: new Date().toISOString().split('T')[0]
    });

    const loadReport = async () => {
        setLoading(true);
        try {
            const response = await fetchInventoryValuationDetail(filters);
            setData(response.data || []);
        } catch (error) {
            console.error('Failed to load inventory valuation detail:');
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
    const totalValueIn = data.reduce((sum, item) => sum + (item.quantityIn * item.rate), 0);
    const totalValueOut = data.reduce((sum, item) => sum + (item.quantityOut * item.rate), 0);
    const netValueChange = totalValueIn - totalValueOut;

    // Chart data (Value Movement over time)
    // Fix explicit any typing for the accumulator
    const chartData = data
        .reduce((acc: { date: string; value: number }[], item) => {
            const date = item.date;
            const existing = acc.find(x => x.date === date);
            const valueChange = (item.quantityIn - item.quantityOut) * item.rate;

            if (existing) {
                existing.value += valueChange;
            } else {
                acc.push({ date, value: valueChange });
            }
            return acc;
        }, [])
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const columns = [
        { key: 'date', label: 'Date', sortable: true },
        { key: 'transactionType', label: 'Type', sortable: true },
        { key: 'reference', label: 'Reference' },
        { key: 'quantityIn', label: 'Qty In', align: 'right' as const },
        { key: 'quantityOut', label: 'Qty Out', align: 'right' as const },
        {
            key: 'rate',
            label: 'Rate',
            align: 'right' as const,
            render: (val: number) => `₹${val.toFixed(2)}`
        },
        {
            key: 'value',
            label: 'Value',
            align: 'right' as const,
            render: (val: number) => `₹${val.toFixed(2)}`
        },
        {
            key: 'runningBalance',
            label: 'Balance',
            align: 'right' as const,
            render: (val: number) => `₹${val.toFixed(2)}`
        }
    ];

    const exportColumns = columns.map(col => ({ key: col.key, label: col.label }));

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Inventory Valuation Detail</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Detailed transaction history and valuation movement
                    </p>
                </div>
                <ExportButton
                    data={data}
                    filename="inventory-valuation-detail"
                    columns={exportColumns}
                />
            </div>

            <FilterBar
                filters={filters}
                onFilterChange={setFilters}
                onRunReport={handleRunReport}
                onReset={handleReset}
                showItemFilter={true} // Detail report usually needs item filter
                showWarehouseFilter={true}
            />

            {!loading && data.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-6 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-slate-200">
                        <div className="text-sm font-medium text-gray-500 mb-1">Total Value In</div>
                        <div className="text-3xl font-bold text-green-600">
                            ₹{totalValueIn.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-slate-200">
                        <div className="text-sm font-medium text-gray-500 mb-1">Total Value Out</div>
                        <div className="text-3xl font-bold text-red-600">
                            ₹{totalValueOut.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-slate-200">
                        <div className="text-sm font-medium text-gray-500 mb-1">Net Value Change</div>
                        <div className={`text-3xl font-bold ${netValueChange >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                            ₹{netValueChange.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                    </div>
                </div>
            )}

            {!loading && chartData.length > 0 && (
                <ChartWidget
                    type="line"
                    data={chartData}
                    xKey="date"
                    yKey="value"
                    title="Daily Valuation Change"
                    height={300}
                />
            )}

            <ReportTable
                columns={columns}
                data={data}
                loading={loading}
                pageSize={25}
            />
        </div>
    );
};

export default InventoryValuationDetail;

