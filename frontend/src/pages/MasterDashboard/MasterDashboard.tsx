import React, { useState, useEffect } from 'react';
import { masterApiService } from '../../services';
import { decodeJWT } from '../../services/jwtUtils';
import { getAccessToken } from '../../services/authService';
import { MasterPage } from '../../components/MasterSidebar';
import StatCard from '../../components/StatCard';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import RevenueChart from '../../components/charts/RevenueChart';
import ReportsPage from '../Reports';
import SettingsPage from '../Settings/Settings';
import BranchesPage, { CompanyBranches, BranchDetail } from '../Branches';
import type { Ledger, Voucher, LedgerGroupMaster, StockItem, CompanyDetails } from '../../types';

interface PlatformStats {
    total_branches: number;
    active_branches: number;
    total_users: number;
    total_transactions: number;
    total_revenue: number;
}

interface BranchMetricDetail {
    id: string;
    name: string;
    created_at: string;
    info: {
        branch_name: string;
        address: string;
        email: string;
        phone: string;
        gstin: string;
        pan_number?: string;
    };
    metrics: {
        total_sales: number;
        total_purchases: number;
        total_users: number;
    };
    recent_transactions: Voucher[];
}

const defaultCompanyDetails: CompanyDetails = {
    name: '',
    address: '',
    gstin: '',
    state: '',
    email: '',
    phone: '',
    website: '',
    pan: '',
    cin: ''
};

/**
 * MASTER DASHBOARD - Platform Administration Panel
 * Enhanced Reports & Settings UI to match exactly the company/business accounting layout.
 */
interface MasterDashboardPageProps {
    onLogout: () => void;
    currentPage: MasterPage | 'BranchDetail';
    setCurrentPage: (page: MasterPage | 'BranchDetail') => void;
}

const MasterDashboardPage: React.FC<MasterDashboardPageProps> = ({
    onLogout,
    currentPage,
    setCurrentPage
}) => {
    const adminToken = getAccessToken();
    const adminPayload = decodeJWT(adminToken);
    const adminName = adminPayload?.username || 'Master Admin';
    const [branches, setBranches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<PlatformStats | null>(null);
    const [recentActivity, setRecentActivity] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Branch drill-down state
    const [selectedBranchForDetail, setSelectedBranchForDetail] = useState<any | null>(null);

    // Reporting & Filtering states
    const [selectedBranchId, setSelectedBranchId] = useState<string>('all');

    // Accounting Data State (for ReportsPage)
    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [entries, setEntries] = useState<any[]>([]); // New state for journal entries
    const [ledgers, setLedgers] = useState<Ledger[]>([]);
    const [ledgerGroups, setLedgerGroups] = useState<LedgerGroupMaster[]>([]);
    const [stockItems, setStockItems] = useState<StockItem[]>([]);
    const [companyDetails, setCompanyDetails] = useState<CompanyDetails>(defaultCompanyDetails);
    const [isDataLoading, setIsDataLoading] = useState(false);

    const [isProcessing, setIsProcessing] = useState(false);
    const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);


    useEffect(() => {
        loadDashboardData();
    }, []);

    // Load accounting data whenever branch selection changes
    useEffect(() => {
        if (currentPage === 'Reports' || currentPage === 'Settings') {
            loadTenantAccountingData(selectedBranchId);
        }
    }, [selectedBranchId, currentPage]);

    const loadDashboardData = async () => {
        setLoading(true);
        try {
            const [branchesData, statsData, activityData] = await Promise.all([
                masterApiService.getBranches(),
                masterApiService.getStats(),
                masterApiService.getRecentActivity()
            ]);
            setBranches(branchesData);
            setStats(statsData);
            setRecentActivity(activityData);
            setError(null);
        } catch (err: any) {
            console.error('Failed to load dashboard data:', err);
            setError(err.message || 'Failed to load master data');
        } finally {
            setLoading(false);
        }
    };

    const loadBranchDetail = async (tenantId: string) => {
        setLoading(true);
        try {
            const data = await masterApiService.getBranchDetail(tenantId);
            setSelectedBranchForDetail(data);
            setCurrentPage('BranchDetail');
        } catch (err: any) {
            console.error('Failed to load branch detail:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadTenantAccountingData = async (tenantId: string) => {
        setIsDataLoading(true);
        try {
            // Master Admin uses dedicated reports endpoint
            const data = await masterApiService.getReports(tenantId === 'all' ? undefined : tenantId);

            setVouchers(data.vouchers || []);
            setEntries(data.entries || []); // Handle entries from new backend response
            setLedgers(data.ledgers || []);
            setLedgerGroups(data.ledger_groups || []);
            setStockItems(data.stock_items || []);
            // Set name to current focus
            setCompanyDetails(prev => ({ ...prev, name: getSelectedBranchName() }));
        } catch (err) {
            console.error('Failed to load tenant accounting data:', err);
        } finally {
            setIsDataLoading(false);
        }
    };


    const handleViewBranchLedger = (branchId: string) => {
        setSelectedBranchId(branchId);
        setCurrentPage('Reports');
    };

    const getSelectedBranchName = () => {
        if (selectedBranchId === 'all') return 'All Branches (Aggregated)';
        const branch = branches.find(b => b.id === selectedBranchId);
        return branch ? branch.name : 'Unknown Branch';
    };

    // ─── DASHBOARD VIEW ───────────────────────────────────────────────
    const renderDashboard = () => (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total Branches" value={stats?.total_branches.toString() || '0'} icon="vendor-portal" color="indigo" />
                <StatCard title="Active Users" value={stats?.total_users.toString() || '0'} icon="users" color="emerald" />
                <StatCard title="Gross Transactions" value={stats?.total_transactions.toString() || '0'} icon="ledger" color="blue" />
                <StatCard title="Total Platform Revenue" value={`₹${stats?.total_revenue.toLocaleString() || '0'}`} icon="bank" color="slate" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-6">
                        <h3 className="text-[13px] font-bold text-slate-900 uppercase tracking-widest mb-6">Growth Trends</h3>
                        <div className="h-[300px]">
                            <RevenueChart data={[{ period: 'Jan', revenue: 0 }, { period: 'Feb', revenue: 0 }, { period: 'Mar', revenue: 0 }, { period: 'Apr', revenue: stats?.total_branches || 0 }]} />
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-6">
                        <h3 className="text-[13px] font-bold text-slate-900 uppercase tracking-widest mb-6">Quick Actions</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <button onClick={() => setCurrentPage('Branches')} className="flex flex-col items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-100 hover:bg-slate-900 hover:text-white transition-all group">
                                <Icon name="ledger" className="w-5 h-5 text-emerald-600 group-hover:text-white" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Add Branch</span>
                            </button>
                            <button onClick={() => setCurrentPage('Reports')} className="flex flex-col items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100 hover:bg-slate-900 hover:text-white transition-all group">
                                <Icon name="reports" className="w-5 h-5 text-blue-600 group-hover:text-white" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Reports</span>
                            </button>
                            <button onClick={() => setCurrentPage('Settings')} className="flex flex-col items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-900 hover:text-white transition-all group">
                                <Icon name="settings" className="w-5 h-5 text-slate-600 group-hover:text-white" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Settings</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-6">
                    <h3 className="text-[13px] font-bold text-slate-900 uppercase tracking-widest mb-6">Recent Platform Activity</h3>
                    <div className="space-y-4">
                        {recentActivity.map((act, idx) => (
                            <div key={idx} className="flex items-start gap-3 p-3 hover:bg-slate-50 transition-colors rounded-lg cursor-pointer">
                                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                                    <Icon name={act.type === 'company_created' ? 'bank' : 'ledger'} className="w-4 h-4 text-indigo-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-800 truncate">{act.name}</p>
                                    <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{act.details}</p>
                                    <p className="text-[9px] text-slate-400 mt-1 uppercase font-semibold">{new Date(act.timestamp).toLocaleString()}</p>
                                </div>
                            </div>
                        ))}
                        {recentActivity.length === 0 && (
                            <div className="text-center py-10 opacity-50 grayscale">
                                <Icon name="ledger" className="w-10 h-10 mx-auto mb-3" />
                                <p className="text-[10px] font-bold uppercase tracking-widest">No recent activity detected</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    // Removed renderCompanies and related logic

    // Removed renderCompanyDetail

    // ─── REPORTS VIEW (EXACT CLONE OF COMPANY REPORTS + CONNECTED DATA) ───
    const renderReports = () => {
        return (
            <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto">
                {/* Navigation Header */}
                <div className="flex items-center gap-4 mb-2">
                    <button
                        onClick={() => setCurrentPage('Dashboard')}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                    >
                        <Icon name="plus" className="w-3 h-3 rotate-45" />
                        Back to Dashboard
                    </button>
                    <div className="h-4 w-[1px] bg-slate-300 mx-2" />
                    <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Platform Reporting Explorer</h2>
                </div>

                <div className="bg-white px-8 py-4 rounded-2xl border border-gray-100 shadow-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Icon name="users" className="w-5 h-5 text-indigo-600" />
                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Active Focus:</span>
                        <span className="text-sm font-black text-slate-900 uppercase tracking-tight">{getSelectedBranchName()}</span>
                        {isDataLoading && (
                            <div className="ml-4 flex items-center gap-2">
                                <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce"></div>
                                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Syncing Records...</span>
                            </div>
                        )}
                    </div>
                    <select
                        value={selectedBranchId}
                        onChange={(e) => setSelectedBranchId(e.target.value)}
                        className="erp-input h-10 px-4 pr-10 text-[10px] font-black uppercase tracking-widest bg-slate-50 border-transparent hover:bg-white min-w-[280px]"
                    >
                        <option value="all">ALL BRANCHES (AGGREGATED)</option>
                        {branches.map(b => (
                            <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>
                        ))}
                    </select>
                </div>
                <div className="bg-white rounded-[32px] border border-gray-100 shadow-2xl overflow-hidden min-h-[800px]">
                    <ReportsPage vouchers={vouchers} entries={entries} ledgers={ledgers} ledgerGroups={ledgerGroups} stockItems={stockItems} />
                </div>
            </div>
        );
    };

    // ─── SETTINGS VIEW (EXACT CLONE OF COMPANY SETTINGS + CONNECTED DATA) ───
    const renderSettings = () => (
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">

            <div className="bg-white rounded-[32px] border border-gray-100 shadow-2xl overflow-hidden min-h-[600px] p-8">
                <SettingsPage
                    companyDetails={companyDetails}
                    onSave={(updated) => setCompanyDetails(updated)}
                    tenantId={selectedBranchId}
                />
            </div>
        </div>
    );

    return (
        <React.Fragment>
            {currentPage === 'Dashboard' && renderDashboard()}
            {currentPage === 'Branches' && (
                <BranchesPage />
            )}
            {currentPage === 'BranchDetail' && selectedBranchForDetail && (
                <BranchDetail
                    branch={selectedBranchForDetail}
                    onBack={() => {
                        setCurrentPage('Branches');
                        setSelectedBranchForDetail(null);
                    }}
                />
            )}
            {currentPage === 'Reports' && renderReports()}
            {currentPage === 'Settings' && renderSettings()}
        </React.Fragment>
    );
};

export default MasterDashboardPage;
