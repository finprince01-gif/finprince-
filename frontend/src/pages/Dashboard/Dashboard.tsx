import React, { useMemo, useState, useEffect } from 'react';
import type { Voucher, Ledger, SalesPurchaseVoucher, Page } from '../../types';
import Icon from '../../components/Icon';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface DashboardPageProps {
    onNavigate: (page: Page) => void;
    companyName: string;
    vouchers: Voucher[];
    ledgers: Ledger[];
    isAdmin?: boolean;
}

const StatCard: React.FC<{ title: string; value: string; icon: string; trend?: string; borderColor?: string }> = ({ title, value, icon, trend, borderColor = 'border-indigo-600' }) => (
    <div className={`erp-card p-4 flex flex-col gap-1 border-2 ${borderColor}`}>
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
        <div className="flex items-baseline justify-between">
            <p className="text-[22px] font-bold text-slate-800 tracking-tight">{value}</p>
            <Icon name={icon as any} className="w-4 h-4 text-slate-300" />
        </div>
        {trend && (
            <div className="flex items-center gap-1.5 mt-1">
                <span className={`text-[11px] font-bold ${trend.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
                    {trend}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">vs last period</span>
            </div>
        )}
    </div>
);

const MonthlyActivityChart: React.FC<{ data: { month: string; sales: number; purchases: number }[] }> = ({ data }) => {
    const validatedData = data.map(item => ({
        month: String(item.month),
        sales: Number(item.sales) || 0,
        purchases: Number(item.purchases) || 0
    }));

    if (!validatedData || validatedData.length === 0) {
        return (
            <div className="flex items-center justify-center h-[300px] border border-dashed border-slate-200 rounded-[4px] bg-slate-50">
                <div className="text-center">
                    <p className="text-slate-400 text-[14px] font-medium">No transaction data available yet.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={validatedData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                        dataKey="month"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
                        dy={10}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
                        tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                        contentStyle={{
                            borderRadius: '4px',
                            border: '1px solid #e2e8f0',
                            boxShadow: 'none',
                            fontSize: '12px',
                            fontWeight: '600'
                        }}
                    />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: '500', paddingBottom: '20px' }} />
                    <Line type="monotone" dataKey="sales" name="Sales" stroke="#16a34a" strokeWidth={2} dot={{ r: 3, fill: '#16a34a', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="purchases" name="Purchases" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: '#ef4444', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate, companyName, vouchers, ledgers, isAdmin = false }) => {
    const { totalSales, totalPurchases, totalReceivables, totalPayables } = useMemo(() => {
        let ts = 0, tp = 0;
        const bal: { [key: string]: number } = {};

        ledgers.forEach(l => bal[l.name] = 0);
        vouchers.forEach(v => {
            const type = v.type.toLowerCase();
            const val = Number('total' in v ? v.total : 'amount' in v ? v.amount : 0) || 0;
            if (type === 'sales') {
                ts += val;
                bal[v.party] = (bal[v.party] || 0) + val;
            } else if (type === 'purchase') {
                tp += val;
                bal[v.party] = (bal[v.party] || 0) - val;
            } else if (type === 'receipt') {
                bal[v.party] = (bal[v.party] || 0) - val;
            } else if (type === 'payment') {
                bal[v.party] = (bal[v.party] || 0) + val;
            }
        });

        const sDebtors = ledgers.filter(l => l.group === 'Sundry Debtors').map(l => l.name);
        const sCreditors = ledgers.filter(l => l.group === 'Sundry Creditors').map(l => l.name);
        const tr = sDebtors.reduce((acc, l) => acc + (bal[l] > 0 ? bal[l] : 0), 0);
        const tpay = sCreditors.reduce((acc, l) => acc + (bal[l] < 0 ? -bal[l] : 0), 0);

        return { totalSales: ts, totalPurchases: tp, totalReceivables: tr, totalPayables: tpay };
    }, [vouchers, ledgers]);

    const chartData = useMemo(() => {
        const mData: { [key: string]: { sales: number; purchases: number } } = {};
        vouchers.filter(v => ['sales', 'purchase'].includes(v.type.toLowerCase())).forEach(v => {
            const m = new Date(v.date).toLocaleString('default', { month: 'short', year: '2-digit' });
            if (!mData[m]) mData[m] = { sales: 0, purchases: 0 };
            if (v.type.toLowerCase() === 'sales') mData[m].sales += Number((v as any).total) || 0;
            else mData[m].purchases += Number((v as any).total) || 0;
        });

        const sorted = Object.keys(mData).sort((a, b) => {
            const [mA, yA] = a.split(' '), [mB, yB] = b.split(' ');
            return new Date(`1 ${mA} ${yA}`) > new Date(`1 ${mB} ${yB}`) ? 1 : -1;
        }).slice(-6);


        return sorted.length ? sorted.map(m => ({ month: m, ...mData[m] })) : [];
    }, [vouchers]);

    const recentVouchers = vouchers.slice(0, 6);

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div>
                    <h1 className="text-[18px] font-semibold text-slate-800">
                        {companyName || 'Business Dashboard'}
                    </h1>
                    <p className="text-[13px] text-slate-500">Welcome back, here is what's happening today.</p>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Total Sales" value={`₹${totalSales.toLocaleString()}`} icon="arrow-up-right" trend="+12.5%" borderColor="border-green-600" />
                <StatCard title="Total Purchase" value={`₹${totalPurchases.toLocaleString()}`} icon="arrow-down-left" trend="-2.4%" borderColor="border-red-500" />
                <StatCard title="Receivables" value={`₹${totalReceivables.toLocaleString()}`} icon="users" borderColor="border-cyan-500" />
                <StatCard title="Payables" value={`₹${totalPayables.toLocaleString()}`} icon="wallet" borderColor="border-amber-500" />
            </div>

            {/* Charts & Lists */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 erp-card p-6">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-[15px] font-bold text-slate-800 uppercase tracking-wider">Revenue Trend</h3>
                        <div className="flex gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-[4px] bg-green-600" />
                                <span className="text-[11px] font-medium text-slate-500 uppercase">Sales</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-[4px] bg-red-500" />
                                <span className="text-[11px] font-medium text-slate-500 uppercase">Purchases</span>
                            </div>
                        </div>
                    </div>
                    <MonthlyActivityChart data={chartData} />
                </div>

                <div className="erp-card overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="text-[13px] font-semibold text-slate-700 uppercase tracking-wider">Recent Activity</h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {recentVouchers.map((v, i) => (
                            <div
                                key={i}
                                onClick={() => onNavigate('Reports')}
                                className="px-4 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between group cursor-pointer"
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <Icon
                                        name={v.type.toLowerCase() === 'sales' ? 'arrow-up-right' : 'vouchers'}
                                        className={`w-3.5 h-3.5 ${v.type.toLowerCase() === 'sales' ? 'text-green-600' : 'text-slate-400'}`}
                                    />
                                    <div className="overflow-hidden">
                                        <p className="text-[13px] font-semibold text-slate-700 truncate">{v.type}</p>
                                        <p className="text-[11px] text-slate-400 truncate">
                                            {'party' in v ? v.party : 'narration' in v ? (v as any).narration : v.date}
                                        </p>
                                    </div>
                                </div>
                                <span className="text-[13px] font-semibold text-slate-800">
                                    ₹{Number('total' in v ? v.total : 'amount' in v ? (v as any).amount : 0).toLocaleString()}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="p-2.5 bg-slate-50 text-center border-t border-slate-100">
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

