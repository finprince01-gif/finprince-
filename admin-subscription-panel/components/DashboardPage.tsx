
import React, { useState, useMemo, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { MenuIcon } from './icons/MenuIcon';
import { DollarSignIcon } from './icons/DollarSignIcon';
import { UsersIcon } from './icons/UsersIcon';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://127.0.0.1:8000';

interface DashboardPageProps {
    onLogout: () => void;
    navigateTo: (page: string) => void;
    currentPage: string;
}

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color: string }> = ({ title, value, icon, color }) => (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 flex items-center">
        <div className={`p-3 rounded-full mr-4 ${color}`}>
            {icon}
        </div>
        <div>
            <p className="text-sm text-gray-500 font-medium">{title}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
    </div>
);

const DashboardPage: React.FC<DashboardPageProps> = ({ onLogout, navigateTo, currentPage }) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [subscriptions, setSubscriptions] = useState([]);
    const [payments, setPayments] = useState([]);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            // Fetch subscriptions
            fetch(`${API_BASE_URL}/api/admin/subscriptions`, {
                headers: { Authorization: `Bearer ${token}` }
            })
                .then(res => {
                    if (res.ok) {
                        return res.json();
                    } else {
                        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                    }
                })
                .then(data => {
                    if (Array.isArray(data)) {
                        setSubscriptions(data);
                    } else {
                        console.error('Invalid subscriptions data:', data);
                        setSubscriptions([]);
                    }
                })
                .catch(err => {
                    console.error('Failed to fetch subscriptions:', err);
                    setSubscriptions([]);
                });

            // Fetch payments
            fetch(`${API_BASE_URL}/api/admin/payments`, {
                headers: { Authorization: `Bearer ${token}` }
            })
                .then(res => {
                    if (res.ok) {
                        return res.json();
                    } else {
                        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                    }
                })
                .then(data => {
                    if (Array.isArray(data)) {
                        setPayments(data);
                    } else {
                        console.error('Invalid payments data:', data);
                        setPayments([]);
                    }
                })
                .catch(err => {
                    console.error('Failed to fetch payments:', err);
                    setPayments([]);
                });
        }
    }, []);

    const stats = useMemo(() => {
        const totalRevenue = payments.reduce((sum, payment: any) => sum + payment.totalAmountPaid, 0);
        const activeUsers = subscriptions.filter((sub: any) => sub.isActive).length;
        const totalUsers = subscriptions.length;
        // Fix: Explicitly type the accumulator in the `reduce` function to ensure correct type inference.
        const planCounts = subscriptions.reduce((acc: Record<string, number>, sub: any) => {
            acc[sub.subscriptionPlan] = (acc[sub.subscriptionPlan] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return {
            totalRevenue,
            activeUsers,
            totalUsers,
            planCounts
        };
    }, [subscriptions, payments]);

    return (
        <div className="min-h-screen bg-gray-100">
            <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} navigateTo={navigateTo} currentPage={currentPage} />
            <div className="lg:pl-64">
                <header className="flex justify-between items-center p-4 sm:p-6 lg:p-8 bg-white border-b border-gray-200">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="lg:hidden text-gray-500 hover:text-gray-900"
                            aria-label="Open sidebar"
                        >
                            <MenuIcon className="h-6 w-6" />
                        </button>
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onLogout}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200"
                        >
                            Logout
                        </button>
                    </div>
                </header>
                <main className="p-4 sm:p-6 lg:p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-6">
                        <StatCard
                            title="Total Revenue"
                            value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(stats.totalRevenue)}
                            icon={<DollarSignIcon className="h-6 w-6 text-white" />}
                            color="bg-green-500"
                        />
                        <StatCard
                            title="Active Users"
                            value={stats.activeUsers}
                            icon={<UsersIcon className="h-6 w-6 text-white" />}
                            color="bg-blue-500"
                        />
                        <StatCard
                            title="Total Users"
                            value={stats.totalUsers}
                            icon={<UsersIcon className="h-6 w-6 text-white" />}
                            color="bg-purple-500"
                        />
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">Subscription Plans</h2>
                        <div className="space-y-4">
                            {Object.entries(stats.planCounts).map(([plan, count]) => (
                                <div key={plan}>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-base font-medium text-gray-700">{plan}</span>
                                        <span className="text-sm font-medium text-gray-500">{count} of {stats.totalUsers} users</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                                        {/* FIX: The left-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type. Explicitly cast count to Number. */}
                                        <div className="bg-indigo-500 h-2.5 rounded-full" style={{ width: `${(Number(count) / stats.totalUsers) * 100}%` }}></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default DashboardPage;
