import React, { useState, useEffect, useMemo } from 'react';
import type { Voucher, Ledger, Page } from '../../types';
import { Widget } from '../DashboardBuilder';
import Icon from '../../components/Icon';
import { useDashboardData } from '../../hooks/useDashboardData';
import RevenueChart from '../../components/charts/RevenueChart';
import ExpenseBreakdownChart from '../../components/charts/ExpenseBreakdownChart';
import ProfitMarginChart from '../../components/charts/ProfitMarginChart';
import ARAgingChart from '../../components/charts/ARAgingChart';
import CashFlowChart from '../../components/charts/CashFlowChart';
import BudgetVsActualChart from '../../components/charts/BudgetVsActualChart';
import WaterfallChart from '../../components/charts/WaterfallChart';
import StatCard from '../../components/StatCard';
import { useSubscriptionUsage } from '../../hooks/useSubscriptionUsage';
import { formatCurrency } from '../../utils/formatting';

interface DashboardPageProps {
    onNavigate: (page: Page) => void;
    companyName: string;
    vouchers: Voucher[];
    ledgers: Ledger[];
    isAdmin?: boolean;
}

const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate, companyName, vouchers, ledgers, isAdmin = false }) => {
    const [customWidgets, setCustomWidgets] = useState<Widget[]>([]);
    const { subscriptionUsage, isLimitReached } = useSubscriptionUsage();

    // Hook
    const {
        chartData,
        revenueData,
        expenseBreakdown,
        arAging,
        cashFlow,
        budgetVsActual,
        profitMargin,
        waterfallData,
        totalSales,
        totalPurchases,
        totalReceivables,
        totalPayables
    } = useDashboardData(vouchers, ledgers);

    const recentVouchers = vouchers.slice(0, 6);

    // Initial Load & Listeners
    useEffect(() => {
        const loadWidgets = () => {
            const saved = localStorage.getItem('dashboard_builder_layout');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed)) {
                        setCustomWidgets(parsed);
                    } else {
                        setCustomWidgets([]);
                    }
                } catch (e) {
                    console.error("Failed to load dashboard layout", e);
                    setCustomWidgets([]);
                }
            } else {
                setCustomWidgets([]);
            }
        };

        loadWidgets();
        window.addEventListener('storage', loadWidgets);
        window.addEventListener('dashboard-layout-updated', loadWidgets);

        return () => {
            window.removeEventListener('storage', loadWidgets);
            window.removeEventListener('dashboard-layout-updated', loadWidgets);
        };
    }, []);

    const handleResetDefault = () => {
        if (confirm("Switch back to default dashboard view?")) {
            setCustomWidgets([]);
            localStorage.removeItem('dashboard_builder_layout');
            window.dispatchEvent(new Event('dashboard-layout-updated'));
        }
    };

    const renderWidget = (widget: Widget) => {
        const { type, settings } = widget;
        switch (type) {
            case 'revenue-chart': return <div className="h-full w-full p-2 flex flex-col"><div className="flex-1 w-full min-h-0"><RevenueChart data={revenueData} /></div></div>;
            case 'expenses-breakdown': return <div className="h-full w-full p-2 flex flex-col"><div className="flex-1 w-full min-h-0 relative"><ExpenseBreakdownChart data={expenseBreakdown} /></div></div>;
            case 'profit-gauge': return <div className="h-full w-full p-2 flex flex-col"><div className="flex-1 w-full min-h-0"><ProfitMarginChart data={profitMargin} /></div></div>;
            case 'accounts-receivable': return <div className="h-full w-full p-2 flex flex-col"><div className="flex-1 w-full min-h-0"><ARAgingChart data={arAging} /></div></div>;
            case 'cash-flow-chart': return <div className="h-full w-full p-2 flex flex-col"><div className="flex-1 w-full min-h-0"><CashFlowChart data={cashFlow} /></div></div>;
            case 'sales-vs-purchase': return <div className="h-full w-full p-2 flex flex-col"><div className="flex-1 w-full min-h-0"><BudgetVsActualChart data={budgetVsActual} /></div></div>;

            case 'outstanding-receivables-card': return <StatCard title="Outstanding Receivables" value={formatCurrency(totalReceivables)} icon="exclamation-circle" color="amber" />;
            case 'total-sales-card': return <StatCard title="Total Revenue" value={formatCurrency(totalSales)} icon="arrow-up-right" trend="+12.5%" color="emerald" />;
            case 'total-purchase-card': return <StatCard title="Total Expenses" value={formatCurrency(totalPurchases)} icon="arrow-down-left" trend="-2.4%" color="rose" />;
            case 'profit-loss-card': return <StatCard title="Net Profit" value={formatCurrency(totalSales - totalPurchases)} icon="currency-rupee" color="blue" />;
            case 'cash-balance-card': return <StatCard title="Cash Balance" value={formatCurrency(totalSales - totalPurchases - totalReceivables * 0.1)} icon="wallet" color="purple" />;

            case 'accounts-payable': return <div className="h-full w-full p-2 flex flex-col"><div className="flex-1 w-full min-h-0"><ARAgingChart data={[{ range: '0-30 days', amount: totalPayables * 0.4 }, { range: '31-60 days', amount: totalPayables * 0.3 }, { range: '61-90 days', amount: totalPayables * 0.2 }, { range: '90+ days', amount: totalPayables * 0.1 }]} /></div></div>;

            case 'aging-receivables': return <div className="h-full w-full p-2 flex flex-col"><div className="flex-1 w-full min-h-0"><WaterfallChart data={waterfallData} /></div></div>;

            case 'text-block': return <div className="h-full overflow-auto p-1"><p className="text-gray-600 text-sm whitespace-pre-wrap font-sans leading-relaxed">{settings?.content || 'This is a customizable text block. Edit me!'}</p></div>;

            case 'bar-chart':
            case 'line-chart':
                if (settings?.dataSource === 'revenue' || settings?.dataSource === 'expenses') return <div className="h-full w-full p-2 flex flex-col"><div className="flex-1 w-full min-h-0"><RevenueChart data={revenueData} /></div></div>;
                if (settings?.dataSource === 'profit') return <div className="h-full w-full p-2 flex flex-col"><div className="flex-1 w-full min-h-0"><ProfitMarginChart data={profitMargin} /></div></div>;
                if (settings?.dataSource === 'cashflow') return <div className="h-full w-full p-2 flex flex-col"><div className="flex-1 w-full min-h-0"><CashFlowChart data={cashFlow} /></div></div>;
                if (settings?.dataSource === 'receivables') return <div className="h-full w-full p-2 flex flex-col"><div className="flex-1 w-full min-h-0"><ARAgingChart data={arAging} /></div></div>;
                if (settings?.dataSource === 'payables') return <div className="h-full w-full p-2 flex flex-col"><div className="flex-1 w-full min-h-0"><ARAgingChart data={[{ range: '0-30 days', amount: totalPayables * 0.4 }, { range: '31-60 days', amount: totalPayables * 0.3 }, { range: '61-90 days', amount: totalPayables * 0.2 }, { range: '90+ days', amount: totalPayables * 0.1 }]} /></div></div>;

                return (
                    <div className="h-full w-full flex flex-col items-center justify-center bg-slate-50 rounded text-slate-400 p-4 text-center">
                        <span className="mb-2 text-2xl">📊</span>
                        <span className="text-sm font-medium">Generic Chart Placeholder</span>
                    </div>
                );

            case 'pie-chart':
                if (settings?.dataSource === 'expenses') return <div className="h-full w-full p-2 flex flex-col"><div className="flex-1 w-full min-h-0 relative"><ExpenseBreakdownChart data={expenseBreakdown} /></div></div>;
                if (settings?.dataSource === 'revenue') return <div className="h-full w-full p-2 flex flex-col"><div className="flex-1 w-full min-h-0 relative"><ExpenseBreakdownChart data={revenueData.map(d => ({ name: d.period, value: d.revenue }))} /></div></div>;
                if (settings?.dataSource === 'profit') return <div className="h-full w-full p-2 flex flex-col"><div className="flex-1 w-full min-h-0 relative"><ExpenseBreakdownChart data={[{ name: 'Net Profit', value: Math.max(0, totalSales - totalPurchases) }, { name: 'Expenses', value: totalPurchases }]} /></div></div>;
                if (settings?.dataSource === 'cashflow') {
                    const totalIn = cashFlow.reduce((acc, curr) => acc + (curr.inflow || 0), 0);
                    const totalOut = cashFlow.reduce((acc, curr) => acc + (curr.outflow || 0), 0);
                    return <div className="h-full w-full p-2 flex flex-col"><div className="flex-1 w-full min-h-0 relative"><ExpenseBreakdownChart data={[{ name: 'Inflow', value: totalIn }, { name: 'Outflow', value: totalOut }]} /></div></div>;
                }
                if (settings?.dataSource === 'receivables') return <div className="h-full w-full p-2 flex flex-col"><div className="flex-1 w-full min-h-0 relative"><ExpenseBreakdownChart data={arAging.map(x => ({ name: x.range, value: x.amount }))} /></div></div>;
                if (settings?.dataSource === 'payables') return <div className="h-full w-full p-2 flex flex-col"><div className="flex-1 w-full min-h-0 relative"><ExpenseBreakdownChart data={[{ name: '0-30 days', value: totalPayables * 0.4 }, { name: '31-60 days', value: totalPayables * 0.3 }, { name: '61-90 days', value: totalPayables * 0.2 }, { name: '90+ days', value: totalPayables * 0.1 }]} /></div></div>;

                return (
                    <div className="h-full w-full flex flex-col items-center justify-center bg-slate-50 rounded text-slate-400 p-4 text-center">
                        <span className="mb-2 text-2xl">🥧</span>
                        <span className="text-sm font-medium">Generic Chart Placeholder</span>
                    </div>
                );

            case 'data-table':
            case 'top-customers':
            case 'top-vendors':
            case 'pl-summary':
            case 'balance-sheet-summary':
            case 'gst-summary':
            case 'bank-reconciliation':
                return (
                    <div className="h-full w-full flex items-center justify-center bg-white border border-slate-100 rounded">
                        <p className="text-sm text-slate-500 font-medium">{type.replace(/-/g, ' ').toUpperCase()}</p>
                    </div>
                );

            default: return <div className="flex items-center justify-center h-full text-slate-300 text-sm">Widget: {type}</div>;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div>
                    <h1 className="text-[18px] font-semibold text-slate-800">
                        {companyName || 'Business Dashboard'}
                    </h1>
                    <p className="text-[13px] text-slate-500">
                        {customWidgets.length > 0 ? 'Customized Analytics View' : "Welcome back, here is what's happening today."}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {customWidgets.length > 0 && (
                        <button
                            onClick={handleResetDefault}
                            className="flex items-center px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-[4px] hover:bg-slate-50 transition-colors"
                        >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            Reset Default
                        </button>
                    )}
                    <button
                        onClick={() => onNavigate('Dashboard Builder')}
                        className="flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-[4px] hover:bg-indigo-700 shadow-sm transition-colors"
                    >
                        <Icon name="edit" className="w-4 h-4 mr-2" />
                        Edit Dashboard
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard title="Total Sales" value={formatCurrency(totalSales)} icon="arrow-up-right" trend="+12.5%" color="emerald" />
                <StatCard title="Total Purchase" value={formatCurrency(totalPurchases)} icon="arrow-down-left" trend="-2.4%" color="rose" />
                <StatCard title="Receivables" value={formatCurrency(totalReceivables)} icon="users" color="cyan" />
                <StatCard title="Payables" value={formatCurrency(totalPayables)} icon="wallet" color="amber" />
                <StatCard
                    title="Invoice Usage"
                    value={`${subscriptionUsage?.used ?? 0} / ${subscriptionUsage?.limit ?? '...'}`}
                    icon="document"
                    color={isLimitReached ? "rose" : "indigo"}
                    subValue={subscriptionUsage?.plan ?? "Loading..."}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 erp-card flex flex-col relative overflow-hidden h-[500px]">
                    {customWidgets.length > 0 ? (
                        <div className="w-full h-full overflow-auto bg-slate-50/50 relative">
                            <div className="relative w-full h-full min-w-[800px] min-h-[600px] bg-grid-pattern">
                                {customWidgets.map(widget => (
                                    <div
                                        key={widget.id}
                                        className="dashboard-widget absolute bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col overflow-hidden hover:border-blue-300 transition-all"
                                        style={{ left: widget.x, top: widget.y, width: widget.width, height: widget.height }}
                                    >
                                        <div className="h-8 border-b border-slate-100 flex items-center justify-between px-3 bg-white">
                                            <span className="text-xs font-semibold text-slate-700">{widget.title}</span>
                                        </div>
                                        <div className="flex-1 relative">
                                            {renderWidget(widget)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 h-full flex flex-col">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Revenue Analysis</h3>
                            </div>
                            <div className="flex-1 min-h-0">
                                <RevenueChart data={revenueData} />
                            </div>
                        </div>
                    )}
                </div>

                <div className="erp-card overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="text-[13px] font-semibold text-slate-700 uppercase tracking-wider">Recent Activity</h3>
                    </div>
                    <div className="divide-y divide-slate-100 overflow-auto flex-1">
                        {recentVouchers.map((v, i) => (
                            <div
                                key={i}
                                onClick={() => onNavigate('Reports')}
                                className="px-4 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between group cursor-pointer"
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <Icon
                                        name={v.type.toLowerCase() === 'sales' ? 'arrow-up-right' : 'vouchers' as any}
                                        className={`w-3.5 h-3.5 ${v.type.toLowerCase() === 'sales' ? 'text-green-600' : 'text-slate-400'}`}
                                    />
                                    <div className="overflow-hidden">
                                        <p className="text-[13px] font-semibold text-slate-700 truncate">{v.type}</p>
                                        <p className="text-[11px] text-slate-400 truncate">
                                            {'party' in v ? (v as any).party : 'narration' in v ? (v as any).narration : v.date}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-[13px] font-semibold text-slate-800">
                                        ₹{Number('total' in v ? (v as any).total : 'amount' in v ? (v as any).amount : 0).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="p-3 bg-slate-50 text-center border-t border-slate-100 mt-auto">
                        <button
                            onClick={() => onNavigate('Reports')}
                            className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest hover:underline"
                        >
                            View all transactions
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardPage;
