import React, { useState, useEffect } from 'react';
import type { Voucher, Ledger, Page } from '../../types';
import { Widget } from '../../store/dashboardStore';
import Icon from '../../components/Icon';
import { useDashboardData } from '../../hooks/useDashboardData';
import RevenueChart from '../../components/charts/RevenueChart';
import StatCard from '../../components/StatCard';
import { formatCurrency } from '../../utils/formatting';
import WidgetRenderer from '../DashboardBuilder/WidgetRenderer';
import { RotateCcw, LayoutDashboard, ChevronRight, TrendingUp, Wallet, Receipt, Users, FileText } from 'lucide-react';
import { confirm, showSuccess } from '../../utils/toast';


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
            const saved = localStorage.getItem('bi_dashboard_config_v2');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed)) setCustomWidgets(parsed);
                } catch (e) {
                    console.error("Failed to load dashboard layout");
                }
            }
        };

        loadWidgets();
        window.addEventListener('dashboard-layout-updated', loadWidgets);
        return () => window.removeEventListener('dashboard-layout-updated', loadWidgets);
    }, []);

    const handleResetDefault = async () => {
        if (await confirm("Reset to default dashboard view?")) {
            setCustomWidgets([]);
            localStorage.removeItem('bi_dashboard_config_v2');
            showSuccess('Dashboard reset to default');
            setTimeout(() => window.location.reload(), 1000);
        }
    };


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

    return (
        <div className="flex flex-col gap-6 animate-in fade-in duration-700 -m-6 p-6 min-h-screen" style={{ background: '#EEF2FF' }}>
            {/* Minimal Header */}
            <div style={{ paddingBottom: '12px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0' }}>
                <div>
                    <h1
                        style={{
                            fontSize: '15px',
                            fontWeight: 700,
                            color: '#1F2937',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            marginBottom: '4px',
                        }}
                    >
                        Dashboard
                    </h1>
                    <p style={{ fontSize: '13px', color: '#475569', fontWeight: 400 }}>
                        Welcome back — here is what's happening today.
                    </p>
                </div>
                <button
                    onClick={() => onNavigate('Dashboard Builder' as any)}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '10px 18px',
                        background: '#4F46E5',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(79,70,229,0.25)',
                        gap: '6px',
                    }}
                >
                    <Icon name="edit" className="w-3.5 h-3.5" />
                    Edit Dashboard
                </button>
            </div>


            {/* Row 1: The 5 StatCards as per screenshot */}
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

            {/* Row 2: Hybrid Content - Revenue Box (BI) + Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Left Section: Revenue Analysis (The BI "Revenbox") */}
                <div className="lg:col-span-8 space-y-4">
                    <div
                        style={{
                            background: '#FFFFFF',
                            border: '1px solid #E2E8F0',
                            borderRadius: '16px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            minHeight: '580px',
                        }}
                    >
                        <div
                            style={{
                                padding: '20px 24px',
                                borderBottom: '1px solid #E2E8F0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: '#FFFFFF',
                            }}
                        >
                            <div>
                                <h3
                                    style={{
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        color: '#1F2937',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.12em',
                                    }}
                                >
                                    Revenue Analysis
                                </h3>
                            </div>
                            {customWidgets.length > 0 && (
                                <button
                                    onClick={handleResetDefault}
                                    className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 transition-colors"
                                    title="Reset to default"
                                >
                                    <RotateCcw size={14} />
                                </button>
                            )}
                        </div>

                        <div className="flex-1 relative bg-slate-50/30 dark:bg-slate-900/50 bg-grid-pattern">

                            {customWidgets.length > 0 ? (
                                <div className="absolute inset-0 p-6 overflow-auto custom-scrollbar">
                                    <div className="relative w-full h-full min-h-[500px]">
                                        {customWidgets.map(widget => (
                                            <div
                                                key={widget.id}
                                                className="absolute animate-in fade-in zoom-in duration-500"
                                                style={{
                                                    left: widget.x - 40, // Adjusting for full-canvas scale to box-scale
                                                    top: widget.y - 40,
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
                                <div className="h-full w-full p-10 flex flex-col">
                                    <div className="flex-1 min-h-0">
                                        <RevenueChart data={revenueData} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Section: Recent Activity */}
                <div
                    style={{
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '16px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        height: '580px',
                    }}
                    className="lg:col-span-4"
                >
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0' }}>
                        <h3
                            style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                color: '#1F2937',
                                textTransform: 'uppercase',
                                letterSpacing: '0.12em',
                            }}
                        >
                            Recent Activity
                        </h3>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                        {recentVouchers.map((v, i) => {
                            const display = getVoucherDisplay(v);
                            return (
                                <div key={i} className="group flex items-center gap-4 p-4 hover:bg-slate-50 rounded-2xl transition-all cursor-pointer border border-transparent hover:border-slate-100">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${display.type === 'Sales' ? 'text-emerald-500' :
                                        display.type === 'Purchase' ? 'text-rose-500' : 'text-blue-500'
                                        }`}>
                                        <Icon name={display.type === 'Sales' ? 'arrow-up-right' : 'arrow-down-left'} className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start">
                                            <p className="text-[11px] font-black text-slate-700 truncate uppercase tracking-tight">{display.party || 'Seed Data'}</p>
                                            <p className="text-[11px] font-black text-slate-900">₹{display.amount.toLocaleString()}</p>
                                        </div>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{display.type} • {display.date}</p>
                                    </div>
                                    <ChevronRight size={12} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-all" />
                                </div>
                            );
                        })}
                    </div>

                    <div className="p-6 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800">
                        <button
                            onClick={() => onNavigate('Reports')}
                            className="w-full py-3 text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 border-2 border-dashed border-indigo-100 dark:border-indigo-900 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:border-indigo-200 transition-all"
                        >
                            View All Transactions
                        </button>
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
