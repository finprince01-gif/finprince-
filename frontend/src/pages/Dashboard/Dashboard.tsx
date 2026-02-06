import React, { useMemo, useState, useEffect } from 'react';
import type { Voucher, Ledger, SalesPurchaseVoucher } from '../../types';
import Icon from '../../components/Icon';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface DashboardPageProps {
    companyName: string;
    vouchers: Voucher[];
    ledgers: Ledger[];
    isAdmin?: boolean;
}

const StatCard: React.FC<{ title: string; value: string; icon: React.ReactElement; color: string }> = ({ title, value, icon, color }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200">
        <div className={`w-12 h-12 flex items-center justify-center rounded-xl ${color} mb-4`}>
            {icon}
        </div>
        <div>
            <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
            <p className="text-3xl font-bold text-gray-900">{value}</p>
        </div>
    </div>
);

const MonthlyActivityChart: React.FC<{ data: { month: string; sales: number; purchases: number }[] }> = ({ data }) => {
    // Validate data: ensure all values are numbers and labels are strings
    const validatedData = data.map(item => ({
        month: String(item.month),
        sales: Number(item.sales) || 0,
        purchases: Number(item.purchases) || 0
    }));

    // If no valid data, show fallback message
    if (!validatedData || validatedData.length === 0) {
        return (
            <div className="flex items-center justify-center h-80 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <div className="text-center">
                    <Icon name="chart-line" className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg font-medium">No data available</p>
                    <p className="text-gray-400 text-sm">Add some sales or purchase transactions to see the chart</p>
                </div>
            </div>
        );
    }

    // Calculate totals for display
    const totalSales = validatedData.reduce((sum, d) => sum + d.sales, 0);
    const totalPurchases = validatedData.reduce((sum, d) => sum + d.purchases, 0);

    return (
        <div className="w-full">
            <div className="text-center mb-4">
                <h4 className="text-lg font-semibold text-gray-800">Sales vs Purchases Trend</h4>
                <p className="text-sm text-gray-600">Last {validatedData.length} months</p>
            </div>

            {/* Fixed height container as required */}
            <div style={{ width: '100%', height: 340 }} className="relative block">
                {validatedData.length > 0 && (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={validatedData}
                            margin={{
                                top: 20,
                                right: 30,
                                left: 20,
                                bottom: 20,
                            }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis
                                dataKey="month"
                                stroke="#6b7280"
                                fontSize={12}
                                fontWeight={500}
                            />
                            <YAxis
                                stroke="#6b7280"
                                fontSize={11}
                                tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
                            />
                            <Tooltip
                                formatter={(value: number, name: string) => [
                                    `₹${value.toLocaleString()}`,
                                    name === 'sales' ? 'Sales' : 'Purchases'
                                ]}
                                labelStyle={{ color: '#374151' }}
                                contentStyle={{
                                    backgroundColor: 'white',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                                }}
                            />
                            <Legend
                                wrapperStyle={{ paddingTop: '20px' }}
                            />
                            <Line
                                type="monotone"
                                dataKey="sales"
                                stroke="#0d9488"
                                strokeWidth={3}
                                dot={{ fill: '#0d9488', strokeWidth: 2, r: 5 }}
                                activeDot={{ r: 7, stroke: '#0d9488', strokeWidth: 2 }}
                                name="Sales"
                            />
                            <Line
                                type="monotone"
                                dataKey="purchases"
                                stroke="#ef4444"
                                strokeWidth={3}
                                dot={{ fill: '#ef4444', strokeWidth: 2, r: 5 }}
                                activeDot={{ r: 7, stroke: '#ef4444', strokeWidth: 2 }}
                                name="Purchases"
                            />
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Data summary */}
            <div className="grid grid-cols-2 gap-4 mt-6 text-center">
                <div className="bg-teal-50 p-3 rounded-lg">
                    <p className="text-xs text-teal-600 font-medium">Total Sales</p>
                    <p className="text-lg font-bold text-teal-800">₹{(totalSales / 1000).toFixed(1)}k</p>
                </div>
                <div className="bg-red-50 p-3 rounded-lg">
                    <p className="text-xs text-red-600 font-medium">Total Purchases</p>
                    <p className="text-lg font-bold text-red-800">₹{(totalPurchases / 1000).toFixed(1)}k</p>
                </div>
            </div>
        </div>
    );
};

const DashboardPage: React.FC<DashboardPageProps> = ({ companyName, vouchers, ledgers, isAdmin = false }) => {

    const [permissions, setPermissions] = useState<string[]>([]);
    const [isPermissionsLoaded, setIsPermissionsLoaded] = useState(false);

    useEffect(() => {
        try {
            const saved = localStorage.getItem('userPermissions');
            if (saved) {
                setPermissions(JSON.parse(saved));
            }
        } catch (e) {
            console.error('Failed to load permissions', e);
        } finally {
            setIsPermissionsLoaded(true);
        }
    }, []);

    const hasPermission = (code: string) => {
        if (isAdmin) return true;
        if (!isPermissionsLoaded) return false;
        // Check for specific code. 'OWNER' is assigned all codes by backend, but we check just in case.
        return permissions.includes(code) || permissions.includes('OWNER') || permissions.includes('ALL');
    };

    const { totalSales, totalPurchases, totalReceivables, totalPayables } = useMemo(() => {
        let totalSales = 0;
        let totalPurchases = 0;
        const accountBalances: { [key: string]: number } = {};

        ledgers.forEach(l => accountBalances[l.name] = 0);

        vouchers.forEach(v => {
            const amount = Number(v.total || ('amount' in v ? v.amount : 0)) || 0;
            switch (v.type) {
                case 'Sales':
                    totalSales += amount;
                    accountBalances[v.party] = (accountBalances[v.party] || 0) + amount;
                    break;
                case 'Purchase':
                    totalPurchases += amount;
                    accountBalances[v.party] = (accountBalances[v.party] || 0) - amount;
                    break;
                case 'Receipt':
                    // Receipts usually have 'amount', handled by the fallback above or specific field check
                    // But wait, v is Voucher union. Receipt has 'amount', Sales has 'total'.
                    // Let's be explicit based on type.
                    break;
            }
        });

        // Re-iterating for explicit safety based on type
        totalSales = 0;
        totalPurchases = 0;

        vouchers.forEach(v => {
            const type = v.type.toLowerCase();
            if (type === 'sales') {
                const val = Number(v.total) || 0;
                totalSales += val;
                accountBalances[v.party] = (accountBalances[v.party] || 0) + val;
            } else if (type === 'purchase') {
                const val = Number(v.total) || 0;
                totalPurchases += val;
                accountBalances[v.party] = (accountBalances[v.party] || 0) - val;
            } else if (type === 'receipt') {
                const val = Number((v as any).amount) || 0;
                accountBalances[v.party] = (accountBalances[v.party] || 0) - val;
            } else if (type === 'payment') {
                const val = Number((v as any).amount) || 0;
                accountBalances[v.party] = (accountBalances[v.party] || 0) + val;
            }
        });

        const sundryDebtorLedgers = ledgers.filter(l => l.group === 'Sundry Debtors').map(l => l.name);
        const sundryCreditorLedgers = ledgers.filter(l => l.group === 'Sundry Creditors').map(l => l.name);

        const totalReceivables = sundryDebtorLedgers.reduce((acc, l) => acc + (accountBalances[l] > 0 ? accountBalances[l] : 0), 0);
        const totalPayables = sundryCreditorLedgers.reduce((acc, l) => acc + (accountBalances[l] < 0 ? -accountBalances[l] : 0), 0);

        return { totalSales, totalPurchases, totalReceivables, totalPayables };
    }, [vouchers, ledgers]);

    const chartData = useMemo(() => {
        const monthlyData: { [key: string]: { sales: number; purchases: number } } = {};
        const salesAndPurchases = vouchers.filter(v => v.type.toLowerCase() === 'sales' || v.type.toLowerCase() === 'purchase') as SalesPurchaseVoucher[];

        salesAndPurchases.forEach(v => {
            const month = new Date(v.date).toLocaleString('default', { month: 'short', year: '2-digit' });
            if (!monthlyData[month]) {
                monthlyData[month] = { sales: 0, purchases: 0 };
            }
            if (v.type.toLowerCase() === 'sales') monthlyData[month].sales += Number(v.total) || 0;
            else monthlyData[month].purchases += Number(v.total) || 0;
        });

        // Sort data chronologically
        const sortedMonths = Object.keys(monthlyData).sort((a, b) => {
            const [monA, yearA] = a.split(' ');
            const [monB, yearB] = b.split(' ');
            return new Date(`1 ${monA} ${yearA}`) > new Date(`1 ${monB} ${yearB}`) ? 1 : -1;
        }).slice(-6); // Last 6 months

        const data = sortedMonths.map(month => ({
            month,
            ...monthlyData[month]
        }));

        // Handle empty data case - provide fallback data to prevent rendering issues
        if (data.length === 0) {
            return [
                { month: 'Jan 25', sales: 0, purchases: 0 },
                { month: 'Feb 25', sales: 0, purchases: 0 },
                { month: 'Mar 25', sales: 0, purchases: 0 }
            ];
        }

        return data;

    }, [vouchers]);

    const recentVouchers = vouchers.slice(0, 5);

    return (
        <div className="bg-gray-50 min-h-screen p-6">
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold text-gray-900">
                    {(companyName || 'Company').replace('AI-Accounting', 'AI Accounting')} Dashboard
                </h2>
                {isAdmin && (
                    <div className="flex items-center space-x-2 bg-purple-100 text-purple-800 px-4 py-2 rounded-lg">
                        <Icon name="shield" className="w-5 h-5" />
                        <span className="text-sm font-medium">Admin View - All Tenants</span>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard title="Total Sales" value={`₹${(totalSales / 1000).toFixed(1)}k`} icon={<Icon name="arrow-up-right" className="w-6 h-6 text-teal-600" />} color="bg-green-100" />
                <StatCard title="Total Purchases" value={`₹${(totalPurchases / 1000).toFixed(1)}k`} icon={<Icon name="arrow-down-left" className="w-6 h-6 text-red-600" />} color="bg-red-100" />
                <StatCard title="Receivables" value={`₹${(totalReceivables / 1000).toFixed(1)}k`} icon={<Icon name="users" className="w-6 h-6 text-teal-600" />} color="bg-teal-100" />
                <StatCard title="Payables" value={`₹${(totalPayables / 1000).toFixed(1)}k`} icon={<Icon name="wallet" className="w-6 h-6 text-teal-600" />} color="bg-teal-100" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="lg:col-span-3 bg-white p-8 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-xl font-bold text-gray-900 mb-6">
                        Monthly Activity {isAdmin && <span className="text-sm font-normal text-gray-600">(All Tenants)</span>}
                    </h3>
                    <MonthlyActivityChart data={chartData} />
                </div>
                <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-xl font-bold text-gray-900 mb-6">
                        Recent Transactions {isAdmin && <span className="text-sm font-normal text-gray-600">(All Tenants)</span>}
                    </h3>
                    <ul className="space-y-4">
                        {recentVouchers.map((v, idx) => (
                            <li key={`${v.type}-${v.date}-${v.id || idx}`} className="flex justify-between items-center py-3 border-b border-gray-100 last:border-b-0">
                                <div className="flex-1">
                                    <p className="font-semibold text-gray-900 text-sm">{v.type}</p>
                                    <p className="text-xs text-gray-500 mt-1 truncate">
                                        {'party' in v ? v.party : 'narration' in v && v.narration ? v.narration.substring(0, 25) + '...' : v.type}
                                    </p>
                                </div>
                                ₹{Number('total' in v ? v.total : 'amount' in v ? v.amount : 0).toFixed(2)}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default DashboardPage;

