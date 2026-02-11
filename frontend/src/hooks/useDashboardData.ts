import { useState, useEffect, useMemo } from 'react';
import { Voucher, Ledger } from '../types';
import { apiService } from '../services/api';

export const useDashboardData = (vouchers: Voucher[] = [], ledgers: Ledger[] = []) => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const response = await apiService.getDashboardAnalytics();
                setData(response);
            } catch (err) {
                console.error("Failed to fetch dashboard analytics", err);
                setError("Failed to load data");
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        // Listen for updates
        const handler = () => fetchData();
        window.addEventListener('dashboard-data-refresh', handler);
        return () => window.removeEventListener('dashboard-data-refresh', handler);
    }, []);

    // Memoize the derived data structure
    const dashboardData = useMemo(() => {
        // Default values if loading or error
        const defaults = {
            totalSales: 0,
            totalPurchases: 0,
            totalReceivables: 0,
            totalPayables: 0,
            chartData: [],
            revenueData: [],
            expenseBreakdown: [],
            arAging: [],
            cashFlow: [],
            budgetVsActual: [],
            profitMargin: [],
            waterfallData: []
        };

        if (!data) return defaults;

        // Backend returns: chartData, expenseBreakdown, cashFlow, budgetVsActual, profitMargin, arAging, apAging, totals

        // Derive Waterfall Data from Totals
        // Logic: Revenue -> COGS -> Gross Profit -> Expenses -> Net Profit
        const revenue = data.totalSales || 0;
        const totalCosts = data.totalPurchases || 0;
        // We don't have explicit COGS vs OpEx breakdown in totals, so we approximate or use backend if enhanced
        // For now, let's assume 60% of totalPurchases is COGS, 40% is Expenses (as per original mock logic)
        const cogs = totalCosts * 0.6;
        const expenses = totalCosts * 0.4;

        const waterfallData = [
            { name: 'Revenue', value: revenue, isTotal: true },
            { name: 'COGS', value: -cogs },
            { name: 'Gross Profit', value: revenue - cogs, isTotal: true },
            { name: 'Expenses', value: -expenses },
            { name: 'Net Profit', value: revenue - totalCosts, isTotal: true }
        ];

        return {
            totalSales: data.totalSales,
            totalPurchases: data.totalPurchases,
            totalReceivables: data.totalReceivables,
            totalPayables: data.totalPayables,

            chartData: data.chartData || [],

            // Map chartData to revenueData specific shape (if needed by component)
            revenueData: (data.chartData || []).map((d: any) => ({
                period: d.period,
                revenue: d.revenue,
                target: d.revenue * 1.1 // Mock target as 10% higher
            })),

            expenseBreakdown: data.expenseBreakdown || [],
            arAging: data.arAging || [],
            cashFlow: data.cashFlow || [],
            budgetVsActual: data.budgetVsActual || [],
            profitMargin: data.profitMargin || [],
            waterfallData,

            loading,
            error
        };
    }, [data, loading, error]);

    return dashboardData;
};

