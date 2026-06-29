import finpixeLogo from '../../assets/finpixe with empty bg.png';
import React, { useState, useEffect } from 'react';
import type { Voucher, Ledger, Page } from '../../types';
import { Widget } from '../../store/dashboardStore';
import Icon from '../../components/Icon';
import { useDashboardData } from '../../hooks/useDashboardData';
import StatCard from '../../components/StatCard';
import { formatCurrency } from '../../utils/formatting';
import WidgetRenderer from '../DashboardBuilder/WidgetRenderer';
import { ChevronRight } from 'lucide-react';
import {
    PieChart, Pie, Cell, Tooltip as ReTooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Area, AreaChart
} from 'recharts';


interface DashboardPageProps {
    onNavigate: (page: Page) => void;
    companyName: string;
    vouchers: Voucher[];
    ledgers: Ledger[];
    isAdmin?: boolean;
}

const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate, companyName, vouchers, ledgers, isAdmin = false }) => {
    const [customWidgets, setCustomWidgets] = useState<Widget[]>([]);

    const {
        revenueData,
        expenseBreakdown,
        totalSales,
        totalPurchases,
        totalReceivables,
        totalPayables
    } = useDashboardData(vouchers, ledgers);

    const recentVouchers = vouchers.slice(0, 8);

    useEffect(() => {
        const loadWidgets = () => {
            const saved = sessionStorage.getItem('bi_dashboard_config_v2') || localStorage.getItem('bi_dashboard_config_v2');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed)) {
                        setCustomWidgets(parsed);
                        if (!sessionStorage.getItem('bi_dashboard_config_v2')) {
                            sessionStorage.setItem('bi_dashboard_config_v2', saved);
                            localStorage.removeItem('bi_dashboard_config_v2');
                        }
                    }
                } catch (e) {
                    console.error("Failed to load dashboard layout");
                }
            }
        };

        loadWidgets();
        window.addEventListener('dashboard-layout-updated', loadWidgets);
        return () => window.removeEventListener('dashboard-layout-updated', loadWidgets);
    }, []);

    const getWidgetData = (widget: Widget) => {
        if (widget.dataset === 'Sales') return revenueData.map(d => ({ Date: d.period, Amount: d.revenue, name: d.period, value: d.revenue }));
        if (widget.dataset === 'Expenses') return expenseBreakdown.map(e => ({ Category: e.name, Amount: e.value, name: e.name, value: e.value }));
        return [];
    };

    const getVoucherDisplay = (v: Voucher) => {
        let party = '';
        let amount = 0;
        if ('party' in v) party = v.party;
        if ('total' in v) amount = v.total;
        else if ('amount' in v) amount = v.amount;
        return { party, amount, type: v.type, date: v.date };
    };

    const greeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    };

    // Pre-compute canvas size from widget positions so nothing is clipped
    const canvasW = customWidgets.length > 0
        ? Math.max(900, ...customWidgets.map(w => (w.x || 0) + (w.width || 300) + 60))
        : 900;
    const canvasH = customWidgets.length > 0
        ? Math.max(500, ...customWidgets.map(w => (w.y || 0) + (w.height || 200) + 60))
        : 500;

    return (
        <div className="flex flex-col gap-6 animate-in fade-in duration-700">

            {/* Header */}
            <div className="erp-section-title flex justify-between items-center mb-6">
                <div>
                    <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-white border border-[#E0E2FF] shadow-[0_8px_16px_rgba(75,60,255,0.08)] flex items-center justify-center overflow-hidden shrink-0">
            <img src={finpixeLogo} alt="Finpixe logo" className="w-9 h-9 object-contain drop-shadow-sm" />
          </div>
          <div>
<h1 className="page-title text-2xl font-bold tracking-tight">
                        {greeting()}, <span className="text-indigo-600 dark:text-indigo-400">Chief</span>
                    </h1>
                    <p className="helper-text text-sm font-medium mt-1">
                        Here's your financial overview for {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
                    </p>
                          </div>
        </div></div>
                <button
                    onClick={() => onNavigate('Dashboard Builder' as any)}
                    className="erp-button-primary"
                >
                    <Icon name="edit" className="w-3.5 h-3.5 mr-2" />
                    Edit Dashboard
                </button>
            </div>

            {/* Row 1: Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-5">
                <StatCard
                    title="Total Sales"
                    value={formatCurrency(totalSales)}
                    icon="arrow-up-right"
                    trend="+12.5%"
                    trendLabel="vs last period"
                    color="emerald"
                />
                <StatCard
                    title="Total Purchase"
                    value={formatCurrency(totalPurchases)}
                    icon="arrow-down-left"
                    trend="-2.4%"
                    trendLabel="vs last period"
                    color="rose"
                />
                <StatCard
                    title="Receivables"
                    value={formatCurrency(totalReceivables)}
                    icon="users"
                    color="cyan"
                />
                <StatCard
                    title="Payables"
                    value={formatCurrency(totalPayables || 0)}
                    icon="wallet"
                    color="amber"
                />
            </div>

            {/* Row 2: Layout container containing Revenue Analysis and Recent Activity side-by-side */}
            <div className="flex flex-col lg:flex-row gap-6 items-start">

                {/* Revenue Analysis (Takes up main space) */}
                <div className="erp-container flex flex-col p-0 flex-1 min-w-0">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="section-title">Revenue Analysis</h3>
                    </div>

                    <div className="bg-slate-50/30 dark:bg-slate-900/50 bg-grid-pattern rounded-b-2xl">
                        {customWidgets.length > 0 ? (
                            /* Custom widget canvas — dynamically sized so all widgets are visible matching builder exact layout */
                            <div className="overflow-auto custom-scrollbar" style={{ maxHeight: 700 }}>
                                <div className="relative" style={{ width: canvasW, minHeight: canvasH }}>
                                    {customWidgets.map(widget => (
                                        <div
                                            key={widget.id}
                                            className="absolute animate-in fade-in zoom-in duration-500 rounded-2xl overflow-hidden bg-white shadow-sm border border-slate-100"
                                            style={{
                                                left: Math.max(0, widget.x || 0),
                                                top: Math.max(0, widget.y || 0),
                                                width: widget.width,
                                                height: widget.height
                                            }}
                                        >
                                            <WidgetRenderer widget={widget} data={getWidgetData(widget)} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            /* Default chart view */
                            <div className="w-full p-6 flex flex-col gap-5">

                                {/* Three charts in a row */}
                                <div className="grid grid-cols-3 gap-4">

                                    {/* Pie 1 — Sales vs Purchases */}
                                    <div className="erp-container p-4 flex flex-col items-center" style={{ minHeight: 240 }}>
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Sales vs Purchases</p>
                                        <ResponsiveContainer width="100%" height={180}>
                                            <PieChart>
                                                <Pie
                                                    data={[
                                                        { name: 'Sales', value: totalSales },
                                                        { name: 'Purchases', value: totalPurchases }
                                                    ]}
                                                    dataKey="value" nameKey="name"
                                                    cx="50%" cy="50%"
                                                    innerRadius={50} outerRadius={72}
                                                    paddingAngle={4} cornerRadius={4} stroke="none"
                                                >
                                                    <Cell fill="#10b981" />
                                                    <Cell fill="#f43f5e" />
                                                </Pie>
                                                <ReTooltip formatter={(v: number) => [formatCurrency(v), '']} contentStyle={{ borderRadius: 10, fontSize: 11, border: '1px solid #f1f5f9', padding: '6px 10px' }} />
                                                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>

                                    {/* Pie 2 — Expense Breakdown */}
                                    <div className="erp-container p-4 flex flex-col items-center" style={{ minHeight: 240 }}>
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Expense Breakdown</p>
                                        <ResponsiveContainer width="100%" height={180}>
                                            <PieChart>
                                                <Pie
                                                    data={expenseBreakdown.length > 0 ? expenseBreakdown : [{ name: 'No Data', value: 1 }]}
                                                    dataKey="value" nameKey="name"
                                                    cx="50%" cy="50%"
                                                    innerRadius={50} outerRadius={72}
                                                    paddingAngle={4} cornerRadius={4} stroke="none"
                                                >
                                                    {['#6366f1', '#f59e0b', '#3b82f6', '#ec4899', '#14b8a6', '#64748b'].map((c, i) => (
                                                        <Cell key={i} fill={c} />
                                                    ))}
                                                </Pie>
                                                <ReTooltip formatter={(v: number) => [formatCurrency(v), '']} contentStyle={{ borderRadius: 10, fontSize: 11, border: '1px solid #f1f5f9', padding: '6px 10px' }} />
                                                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>

                                    {/* Bar Chart — Revenue vs Target */}
                                    <div className="erp-container p-4 flex flex-col" style={{ minHeight: 240 }}>
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Revenue vs Target</p>
                                        <ResponsiveContainer width="100%" height={180}>
                                            <BarChart data={revenueData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="30%" barGap={3}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="period" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v / 1000}k`} />
                                                <ReTooltip formatter={(v: number, name: string) => [formatCurrency(v), name === 'revenue' ? 'Revenue' : 'Target']} contentStyle={{ borderRadius: 10, fontSize: 11, border: '1px solid #f1f5f9', padding: '6px 10px' }} />
                                                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 6 }} formatter={(v) => v === 'revenue' ? 'Revenue' : 'Target'} />
                                                <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={18} />
                                                <Bar dataKey="target" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={18} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>

                                </div>

                                {/* Full-width Revenue Trend line chart */}
                                <div className="erp-container p-4" style={{ height: 250 }}>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Revenue Trend</p>
                                    <ResponsiveContainer width="100%" height={190}>
                                        <AreaChart data={revenueData} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.18} />
                                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                                </linearGradient>
                                                <linearGradient id="gradTarget" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.12} />
                                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} dy={6} />
                                            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v / 1000}k`} />
                                            <ReTooltip
                                                formatter={(v: number, name: string) => [formatCurrency(v), name === 'revenue' ? 'Revenue' : 'Target']}
                                                contentStyle={{ borderRadius: 10, fontSize: 11, border: '1px solid #f1f5f9', padding: '6px 12px' }}
                                                cursor={{ stroke: '#e2e8f0', strokeWidth: 1, strokeDasharray: '4 4' }}
                                            />
                                            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} formatter={(v) => v === 'revenue' ? 'Revenue' : 'Target'} />
                                            <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2.5} fill="url(#gradRevenue)" dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: '#6366f1' }} />
                                            <Area type="monotone" dataKey="target" stroke="#10b981" strokeWidth={2} strokeDasharray="5 4" fill="url(#gradTarget)" dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: '#10b981' }} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>

                            </div>
                        )}
                    </div>
                </div>

                {/* Recent Activity — Side Panel */}
                <div className="erp-container flex flex-col p-0 overflow-hidden shrink-0 w-[320px] sticky top-6 bg-white shadow-xl h-[800px] z-10">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="section-title">Recent Activity</h3>
                        <button onClick={() => onNavigate('Reports')} className="text-[10px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-800 transition-colors">
                            View All
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
                        {recentVouchers.map((v, i) => {
                            const display = getVoucherDisplay(v);
                            return (
                                <div key={i} className="group flex items-center gap-3 p-3 hover:bg-slate-50 rounded-2xl transition-all cursor-pointer border border-transparent hover:border-slate-100 bg-white">
                                    <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${display.type === 'Sales' ? 'bg-emerald-50 text-emerald-500' : display.type === 'Purchase' ? 'bg-rose-50 text-rose-500' : 'bg-blue-50 text-blue-500'}`}>
                                        <Icon name={display.type === 'Sales' ? 'arrow-up-right' : 'arrow-down-left'} className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start">
                                            <p className="text-[11px] font-bold text-slate-700 truncate uppercase tracking-tight">{display.party || 'System'}</p>
                                            <p className="text-[11px] font-black text-slate-900">₹{display.amount.toLocaleString()}</p>
                                        </div>
                                        <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{display.type} • {display.date}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <style>{`
            .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #CBD5E1; }
        `}</style>
        </div>
    );
};

export default DashboardPage;
