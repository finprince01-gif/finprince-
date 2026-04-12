import React, { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import { masterApiService } from '../../services/masterApi';

interface BranchDetailProps {
    branch: any;
    onBack: () => void;
}

const BranchDetail: React.FC<BranchDetailProps> = ({ branch, onBack }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'subscription' | 'advanced'>('overview');
    const [branchData, setBranchData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    
    // Modal states
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
    const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);

    // Edit form state
    const [editForm, setEditForm] = useState({ name: '', gstin: '', pan_number: '' });

    // Reset Password modal state
    const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
    const [resetForm, setResetForm] = useState({ new_password: '', confirm_password: '' });
    const [resetError, setResetError] = useState('');
    const [resetSuccess, setResetSuccess] = useState('');
    const [showPlainPassword, setShowPlainPassword] = useState(false);

    const fetchBranchData = async () => {
        setLoading(true);
        try {
            const data = await masterApiService.getBranchDetail(branch.id);
            setBranchData(data);
            setEditForm({ name: data.name, gstin: data.gstin, pan_number: data.pan_number || '' });
        } catch (err) {
            console.error("Failed to fetch exact branch data", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBranchData();
    }, [branch.id]);

    const handleUpdateDetails = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await masterApiService.updateBranchDetail(branch.id, { action: 'update_details', ...editForm });
            await fetchBranchData();
            setIsEditModalOpen(false);
            // Optionally could add a toast notification here
        } catch (err) {
            console.error("Failed to update branch", err);
        } finally {
            setSaving(false);
        }
    };

    const handleUpgradePlan = async (selectedPlan: string) => {
        setSaving(true);
        try {
            await masterApiService.updateBranchDetail(branch.id, { action: 'upgrade_plan', plan: selectedPlan });
            await fetchBranchData();
            setIsUpgradeModalOpen(false);
        } catch (err) {
            console.error("Failed to upgrade plan", err);
        } finally {
            setSaving(false);
        }
    };

    const handleToggleStatus = async () => {
        setSaving(true);
        try {
            await masterApiService.updateBranchDetail(branch.id, { action: 'toggle_status' });
            await fetchBranchData();
            setIsDeactivateDialogOpen(false);
            setActiveTab('overview');
        } catch (err) {
            console.error("Failed to toggle branch status", err);
        } finally {
            setSaving(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setResetError('');
        setResetSuccess('');

        if (resetForm.new_password.length < 8) {
            setResetError('Password must be at least 8 characters long.');
            return;
        }

        if (resetForm.new_password !== resetForm.confirm_password) {
            setResetError('Passwords do not match.');
            return;
        }

        setSaving(true);
        try {
            await masterApiService.resetBranchPassword(branch.id, { 
                new_password: resetForm.new_password 
            });
            setResetSuccess('Password updated successfully! Branch admin can now login with new credentials.');
            setResetForm({ new_password: '', confirm_password: '' });
            setTimeout(() => {
                setIsResetPasswordModalOpen(false);
                setResetSuccess('');
            }, 2000);
        } catch (err: any) {
            setResetError(err?.response?.data?.message || err?.message || 'Failed to reset password.');
        } finally {
            setSaving(false);
        }
    };

    const displayPlan = branchData?.plan || 'Loading...';
    const sub = branchData?.subscription;

    // Helper percent calculations
    const getPercent = (used: number, limit: string | number) => {
        if (limit === 'Unlimited') return 100;
        const lim = typeof limit === 'string' ? parseInt(limit, 10) : limit;
        if (!lim || isNaN(lim)) return 0;
        return Math.min(100, Math.max(0, (used / lim) * 100));
    };

    return (
        <div className="w-full max-w-6xl mx-auto pb-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Header Section */}
            <div className="mb-8">
                <button 
                    onClick={onBack}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black text-slate-500 uppercase tracking-widest hover:bg-slate-100 transition-colors mb-6"
                >
                    <Icon name="arrow-left" size={12} />
                    Back to Branches
                </button>
                
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-3xl">
                            📍
                        </div>
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h1 className="text-2xl font-black text-slate-900 tracking-tight">{branch.name}</h1>
                                <span className={`px-2.5 py-0.5 border text-[10px] font-black uppercase tracking-widest rounded-full ${branchData?.status === 'ACTIVE' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                    {branchData?.status || 'Loading...'}
                                </span>
                            </div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                BRANCH IDENTIFIER: {branch.id.split('-')[0]}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex gap-3">
                        <button 
                            onClick={() => setIsEditModalOpen(true)}
                            disabled={branchData?.status === 'INACTIVE'}
                            className={`h-10 px-4 flex items-center gap-2 bg-white border border-slate-200 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors ${branchData?.status === 'INACTIVE' ? 'opacity-50 cursor-not-allowed text-slate-400' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                            <Icon name="edit-3" size={14} />
                            Edit details
                        </button>
                        <button 
                            onClick={() => {
                                setResetError('');
                                setResetSuccess('');
                                setResetForm({ new_password: '', confirm_password: '' });
                                setIsResetPasswordModalOpen(true);
                            }}
                            disabled={branchData?.status === 'INACTIVE'}
                            className={`h-10 px-4 flex items-center gap-2 bg-white border border-slate-200 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors ${branchData?.status === 'INACTIVE' ? 'opacity-50 cursor-not-allowed text-slate-400' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                            <Icon name="key" size={14} />
                            Reset Password
                        </button>
                        <button 
                            onClick={() => setIsUpgradeModalOpen(true)}
                            disabled={branchData?.status === 'INACTIVE'}
                            className={`h-10 px-4 flex items-center gap-2 rounded-xl text-[11px] font-black uppercase tracking-widest text-white shadow-lg transition-all ${branchData?.status === 'INACTIVE' ? 'bg-indigo-300 opacity-50 cursor-not-allowed shadow-none' : 'bg-indigo-600 shadow-indigo-200 hover:bg-slate-900'}`}
                        >
                            <Icon name="tag" size={14} />
                            Upgrade Plan
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content Card */}
            <div className="bg-white rounded-[24px] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden">
                {/* Tabs */}
                <div className="flex px-8 border-b border-slate-100">
                    <button 
                        onClick={() => setActiveTab('overview')}
                        className={`px-6 py-5 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'overview' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300'}`}
                    >
                        Overview
                    </button>
                    <button 
                        onClick={() => setActiveTab('subscription')}
                        className={`px-6 py-5 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'subscription' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300'}`}
                    >
                        Subscription & Usage
                    </button>
                    <button 
                        onClick={() => setActiveTab('advanced')}
                        className={`px-6 py-5 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'advanced' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300'}`}
                    >
                        Advanced Settings
                    </button>
                </div>

                {/* Tab Content */}
                <div className="p-8">
                    
                    {/* OVERVIEW TAB */}
                    {activeTab === 'overview' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-8">
                            <div>
                                <h3 className="text-sm font-black text-slate-900 tracking-tight mb-4">Tax & Legal Identity</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Company PAN</p>
                                        <p className="text-lg font-bold text-slate-800 uppercase space-x-1">
                                            {branch.pan_number ? branch.pan_number : 'N/A'}
                                        </p>
                                    </div>
                                    <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100/50">
                                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Branch GSTIN</p>
                                        <p className="text-lg font-bold text-indigo-900 uppercase tracking-wide">
                                            {branch.gstin || branchData?.gstin}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-sm font-black text-slate-900 tracking-tight">Contact Information</h3>
                                <div className="p-5 border border-slate-100 rounded-2xl bg-white space-y-4">
                                    <div className="grid grid-cols-2 gap-8">
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Primary Email</label>
                                            <p className="text-sm font-bold text-slate-800">{branch.name.toLowerCase().replace(' ', '')}@finpixe.com</p>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Contact Phone</label>
                                            <p className="text-sm font-bold text-slate-800">+91 98765 43210</p>
                                        </div>
                                        <div className="col-span-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Registered Address</label>
                                            <p className="text-sm font-bold text-slate-800">123 Business Avenue, Tech Park Building, Phase 1</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SUBSCRIPTION TAB */}
                    {activeTab === 'subscription' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {loading && !branchData ? (
                                <div className="py-20 text-center animate-pulse flex flex-col items-center">
                                    <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">FETCHING LIVE DATA...</p>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="text-sm font-black text-slate-900 tracking-tight">Current Plan Details</h3>
                                        <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest rounded-lg">
                                            Next Billing: 01 Oct 2026
                                        </span>
                                    </div>

                                    <div className={`bg-gradient-to-br ${displayPlan === 'PRO' ? 'from-slate-900 to-slate-800 text-white' : 'from-indigo-600 to-indigo-500 text-white'} rounded-2xl p-8 mb-8 relative overflow-hidden`}>
                                        <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full blur-[80px] opacity-10 -translate-y-1/2 translate-x-1/2"></div>
                                        <div className="relative z-10 flex justify-between items-center">
                                            <div>
                                                <p className="text-[11px] font-black text-indigo-200 uppercase tracking-[0.2em] mb-2">Active Tier</p>
                                                <h2 className="text-3xl font-black mb-1">{displayPlan} {displayPlan === 'PRO' ? 'Enterprise' : ''}</h2>
                                                <p className="text-sm text-indigo-100/70">{displayPlan === 'PRO' ? 'Unlimited invoicing and priority AI processing.' : 'Standard operational limits applied.'}</p>
                                            </div>
                                            <div className="text-right">
                                                <h2 className="text-3xl font-black">{sub?.price || '₹0/mo'}<span className="text-sm opacity-60 font-medium"></span></h2>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <h3 className="text-sm font-black text-slate-900 tracking-tight">Usage Metrics</h3>
                                        {sub && (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="p-5 border border-slate-100 rounded-2xl">
                                                    <div className="flex justify-between items-center mb-3">
                                                        <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Invoices Generated</p>
                                                        <p className="text-[11px] font-black text-slate-900">{sub.invoices.used} / {sub.invoices.limit}</p>
                                                    </div>
                                                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className={`h-full ${getPercent(sub.invoices.used, sub.invoices.limit) >= 90 ? 'bg-rose-500' : 'bg-emerald-500'} rounded-full transition-all duration-1000 w-[${getPercent(sub.invoices.used, sub.invoices.limit)}%]`} style={{ width: `${getPercent(sub.invoices.used, sub.invoices.limit)}%`}}></div>
                                                    </div>
                                                </div>
                                                <div className="p-5 border border-slate-100 rounded-2xl">
                                                    <div className="flex justify-between items-center mb-3">
                                                        <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">AI Processing Credits</p>
                                                        <p className="text-[11px] font-black text-slate-900">{sub.aiCredits.used} / {sub.aiCredits.limit}</p>
                                                    </div>
                                                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className={`h-full ${getPercent(sub.aiCredits.used, sub.aiCredits.limit) >= 90 ? 'bg-rose-500' : 'bg-indigo-500'} rounded-full transition-all duration-1000 w-[${getPercent(sub.aiCredits.used, sub.aiCredits.limit)}%]`} style={{ width: `${getPercent(sub.aiCredits.used, sub.aiCredits.limit)}%`}}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* ADVANCED TAB */}
                    {activeTab === 'advanced' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
                            <div className="p-6 border border-slate-100 rounded-2xl flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-black text-slate-900 mb-1">API Integrations</h4>
                                    <p className="text-xs text-slate-500">Configure external Webhooks and API keys for this branch.</p>
                                </div>
                                <button className="px-4 py-2 bg-slate-50 text-slate-700 text-[10px] font-black uppercase tracking-widest rounded-lg border border-slate-200 hover:bg-slate-100">
                                    Manage Keys
                                </button>
                            </div>
                            
                            <div className="p-6 border border-slate-100 rounded-2xl flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-black text-slate-900 mb-1">Data Export</h4>
                                    <p className="text-xs text-slate-500">Download complete ledger and transaction history for this branch.</p>
                                </div>
                                <button className="px-4 py-2 bg-slate-50 text-slate-700 text-[10px] font-black uppercase tracking-widest rounded-lg border border-slate-200 hover:bg-slate-100">
                                    Initiate Export
                                </button>
                            </div>

                            {branchData?.status !== 'INACTIVE' ? (
                                <div className="p-6 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-between mt-8">
                                    <div>
                                        <h4 className="text-sm font-black text-rose-700 mb-1">Deactivate Branch</h4>
                                        <p className="text-xs font-semibold text-rose-500">Temporarily lock out users and halt processing for this branch.</p>
                                    </div>
                                    <button 
                                        onClick={() => setIsDeactivateDialogOpen(true)}
                                        className="px-4 py-2 bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow hover:bg-rose-700"
                                    >
                                        Deactivate
                                    </button>
                                </div>
                            ) : (
                                <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-between mt-8">
                                    <div>
                                        <h4 className="text-sm font-black text-emerald-700 mb-1">Activate Branch</h4>
                                        <p className="text-xs font-semibold text-emerald-500">Restore user access and resume all AI processing for this branch.</p>
                                    </div>
                                    <button 
                                        onClick={() => setIsDeactivateDialogOpen(true)}
                                        className="px-4 py-2 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow hover:bg-emerald-700"
                                    >
                                        Activate Branch
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>

            {/* Edit Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-lg font-black text-slate-900 tracking-tight">Edit Branch Details</h3>
                            <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <Icon name="x" size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleUpdateDetails} className="p-6 space-y-5">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Branch Name</label>
                                <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="erp-input w-full h-10 px-3 bg-slate-50 border-slate-200 text-sm font-bold rounded-xl" required />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Branch GSTIN</label>
                                <input type="text" value={editForm.gstin} onChange={e => setEditForm({...editForm, gstin: e.target.value})} className="erp-input w-full h-10 px-3 bg-slate-50 border-slate-200 text-sm font-bold uppercase rounded-xl" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Company PAN Link</label>
                                <input type="text" value={editForm.pan_number} onChange={e => setEditForm({...editForm, pan_number: e.target.value})} className="erp-input w-full h-10 px-3 bg-slate-50 border-slate-200 text-sm font-bold uppercase rounded-xl" />
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setIsEditModalOpen(false)} className="flex-1 h-11 bg-white border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-widest rounded-xl hover:bg-slate-50">Cancel</button>
                                <button type="submit" disabled={saving} className="flex-1 h-11 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Upgrade Modal */}
            {isUpgradeModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-lg font-black text-slate-900 tracking-tight">Upgrade Branch Plan</h3>
                            <button onClick={() => setIsUpgradeModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <Icon name="x" size={20} />
                            </button>
                        </div>
                        <div className="p-6">
                            <p className="text-sm text-slate-500 mb-6">Select a new subscription tier for {branchData?.name}. The change will be applied immediately without impacting current active sessions.</p>
                            
                            <div className="grid grid-cols-3 gap-4 mb-8">
                                {[
                                    { id: 'FREE', name: 'Free', price: '₹0', invoices: '5 limit' },
                                    { id: 'STARTER', name: 'Starter', price: '₹1,200', invoices: '100 limit' },
                                    { id: 'PRO', name: 'Pro Enterprise', price: '₹5,000', invoices: 'Unlimited' }
                                ].map(plan => (
                                    <button 
                                        key={plan.id}
                                        onClick={() => handleUpgradePlan(plan.id)}
                                        disabled={saving || displayPlan === plan.id}
                                        className={`p-5 rounded-2xl border text-left flex flex-col transition-all ${displayPlan === plan.id ? 'border-indigo-600 bg-indigo-50 shadow-inner' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}`}
                                    >
                                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-1">{plan.name}</span>
                                        <span className="text-xl font-black text-slate-900 mb-2">{plan.price}</span>
                                        <span className="text-[10px] font-bold text-slate-500">{plan.invoices}</span>
                                        {displayPlan === plan.id && <span className="mt-4 text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-100 px-2 py-1 rounded inline-block w-fit">Current</span>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Status Toggle Dialog */}
            {isDeactivateDialogOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6 text-center">
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${branchData?.status === 'INACTIVE' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                <Icon name={branchData?.status === 'INACTIVE' ? 'check-circle' : 'alert-circle'} size={24} />
                            </div>
                            <h3 className="text-lg font-black text-slate-900 tracking-tight mb-2">
                                {branchData?.status === 'INACTIVE' ? 'Activate Branch?' : 'Deactivate Branch?'}
                            </h3>
                            <p className="text-sm text-slate-500 mb-8">
                                {branchData?.status === 'INACTIVE' 
                                    ? `Are you sure you want to restore access for users in ${branchData?.name}?` 
                                    : `Are you sure you want to completely deactivate ${branchData?.name}? Users will lose access.`}
                            </p>
                            
                            <div className="flex gap-3">
                                <button onClick={() => setIsDeactivateDialogOpen(false)} className="flex-1 h-10 bg-slate-100 text-slate-700 text-xs font-black uppercase tracking-widest rounded-xl hover:bg-slate-200">Cancel</button>
                                <button 
                                    onClick={handleToggleStatus} 
                                    disabled={saving} 
                                    className={`flex-1 h-10 text-white text-xs font-black uppercase tracking-widest rounded-xl disabled:opacity-50 ${branchData?.status === 'INACTIVE' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                                >
                                    {saving ? 'Processing...' : (branchData?.status === 'INACTIVE' ? 'Activate' : 'Deactivate')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Reset Password Modal */}
            {isResetPasswordModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-lg font-black text-slate-900 tracking-tight">Reset Branch Password</h3>
                            <button onClick={() => setIsResetPasswordModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <Icon name="x" size={20} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleResetPassword} className="p-6 space-y-5">
                            <p className="text-xs font-semibold text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100 italic">
                                This will forcibly update the login credentials for all administrative accounts associated with <span className="text-indigo-600 font-bold">{branch.name}</span>.
                            </p>

                            {resetError && (
                                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-[10px] font-bold animate-in slide-in-from-top-2">
                                    {resetError}
                                </div>
                            )}

                            {resetSuccess && (
                                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-600 text-[10px] font-bold animate-in slide-in-from-top-2">
                                    {resetSuccess}
                                </div>
                            )}

                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">New Password</label>
                                <div className="relative">
                                    <input 
                                        type={showPlainPassword ? "text" : "password"} 
                                        value={resetForm.new_password} 
                                        onChange={e => setResetForm({...resetForm, new_password: e.target.value})} 
                                        className="erp-input w-full h-10 px-3 pr-10 bg-slate-50 border-slate-200 text-sm font-bold rounded-xl focus:bg-white transition-all" 
                                        placeholder="Min. 8 characters"
                                        required 
                                        autoFocus
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => setShowPlainPassword(!showPlainPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600"
                                    >
                                        <Icon name={showPlainPassword ? "eye-off" : "eye"} size={14} />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Confirm New Password</label>
                                <input 
                                    type={showPlainPassword ? "text" : "password"} 
                                    value={resetForm.confirm_password} 
                                    onChange={e => setResetForm({...resetForm, confirm_password: e.target.value})} 
                                    className="erp-input w-full h-10 px-3 bg-slate-50 border-slate-200 text-sm font-bold rounded-xl focus:bg-white transition-all" 
                                    placeholder="Verify password"
                                    required 
                                />
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button 
                                    type="button" 
                                    onClick={() => setIsResetPasswordModalOpen(false)} 
                                    className="flex-1 h-11 bg-white border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-widest rounded-xl hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={saving || !!resetSuccess} 
                                    className="flex-1 h-11 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-slate-900 shadow-lg shadow-indigo-100 transition-all disabled:opacity-50"
                                >
                                    {saving ? 'Processing...' : 'Update Password'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BranchDetail;
