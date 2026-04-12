import React, { useState, useEffect, useMemo } from 'react';
import { masterApiService } from '../../services/masterApi';
import Modal from '../../components/Modal';
import Icon from '../../components/Icon';
import { getAccessToken } from '../../services/authService';
import { decodeJWT } from '../../services/jwtUtils';

interface Branch {
    id: string;
    name: string;
    gstin: string;
    country?: string;
    state?: string;
    district?: string;
    city?: string;
    address_line1?: string;
    address_line2?: string;
    address_line3?: string;
    pincode?: string;
    created_at: string;
}

const SUBSCRIPTION_PLANS = [
    { value: 'FREE', label: 'Free — Up to 5 AI extractions / month' },
    { value: 'STARTER', label: 'Starter — Up to 100 AI extractions / month' },
    { value: 'PRO', label: 'Pro — Unlimited AI extractions' },
];

const BranchesPage: React.FC = () => {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Geograhpical Data
    const [geoData, setGeoData] = useState<any[]>([]);

    // Form states
    const [currentStep, setCurrentStep] = useState(1);
    const [selectedPlan, setSelectedPlan] = useState('FREE');
    const [branchName, setBranchName] = useState('');
    const [adminName, setAdminName] = useState('');
    const [branchGstin, setBranchGstin] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    // Address states
    const [addressLine1, setAddressLine1] = useState('');
    const [addressLine2, setAddressLine2] = useState('');
    const [addressLine3, setAddressLine3] = useState('');
    const [selectedCountry, setSelectedCountry] = useState('India');
    const [selectedState, setSelectedState] = useState('');
    const [selectedDistrict, setSelectedDistrict] = useState('');
    const [pincode, setPincode] = useState('');

    const [isProcessing, setIsProcessing] = useState(false);
    const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
    const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState('');

    useEffect(() => {
        loadData();
        fetchGeoData();
    }, []);

    const fetchGeoData = async () => {
        try {
            const resp = await fetch('/data/geo.json');
            const data = await resp.json();
            setGeoData(data);
        } catch (err) {
            console.error("Failed to fetch geo data", err);
        }
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await masterApiService.getBranches();
            setBranches(data || []);
        } catch {
            setError('Failed to load branches');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateBranch = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsProcessing(true);
        setError(null);

        try {
            await masterApiService.createBranch({
                name: branchName,
                gstin: branchGstin,
                phone,
                email,
                address_line1: addressLine1,
                address_line2: addressLine2,
                address_line3: addressLine3,
                country: selectedCountry,
                state: selectedState,
                district: selectedDistrict,
                pincode: pincode,
                selected_plan: selectedPlan,
                owner: { name: adminName, username, password }
            });
            setIsCreateModalOpen(false);
            resetForm();
            loadData();
        } catch (err: any) {
            setError(err.message || 'Failed to create branch');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedBranchId || !newPassword) return;

        setIsProcessing(true);
        setError(null);

        try {
            await masterApiService.resetBranchPassword(selectedBranchId, { new_password: newPassword });
            setIsResetPasswordModalOpen(false);
            setNewPassword('');
            setSelectedBranchId(null);
            alert('Password reset successfully!');
        } catch (err: any) {
            setError(err.message || 'Failed to reset password');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleEnter = (e: React.KeyboardEvent, nextId: string) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById(nextId)?.focus();
        }
    };

    const resetForm = () => {
        setCurrentStep(1);
        setSelectedPlan('FREE'); setBranchName('');
        setAdminName(''); setBranchGstin(''); setPhone(''); setEmail(''); setUsername(''); setPassword('');
        setAddressLine1(''); setAddressLine2(''); setAddressLine3('');
        setSelectedCountry('India'); setSelectedState(''); setSelectedDistrict('');
        setPincode('');
    };

    // Derived geo options
    const currentCountry = geoData.find(c => c.name === selectedCountry);
    const currentState = currentCountry?.states.find((s: any) => s.name === selectedState);
    const districtOptions = currentState?.districts || [];

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="py-2">
            {/* Header */}
            <div className="flex items-start justify-between mb-8">
                <div>
                    <h1 className="text-[22px] font-black text-slate-900 tracking-tight m-0">
                        Branches
                    </h1>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.12em] mt-1">
                        Manage all platform branches directly
                    </p>
                </div>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="h-11 px-5 bg-indigo-600 text-white border-none rounded-xl text-[11px] font-black uppercase tracking-[0.12em] cursor-pointer flex items-center gap-2 shadow-lg shadow-indigo-100 hover:bg-slate-900 transition-all font-outfit"
                >
                    <Icon name="plus" className="w-4 h-4" />
                    Provision New Branch
                </button>
            </div>

            {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-bold flex items-center gap-3 animate-headshake">
                    <Icon name="x" className="w-4 h-4" />
                    {error}
                </div>
            )}

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {branches.map((branch) => (
                    <div
                        key={branch.id}
                        className="bg-white border border-slate-200 rounded-[28px] p-6 cursor-pointer transition-all shadow-sm relative overflow-hidden group hover:border-indigo-500 hover:shadow-2xl hover:-translate-y-1"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/20 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />

                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-14 h-14 rounded-[20px] bg-gradient-to-br from-indigo-700 to-indigo-500 flex items-center justify-center text-2xl shrink-0 shadow-lg shadow-indigo-100 transform group-hover:scale-110 transition-transform">
                                🏢
                            </div>
                            <div className="min-w-0">
                                <div className="text-[17px] font-black text-slate-900 tracking-tight truncate">
                                    {branch.name}
                                </div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                    GSTIN: {branch.gstin || 'N/A'}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 mb-6 pt-4 border-t border-slate-50">
                            <div className="flex items-start gap-3">
                                <Icon name="location" className="w-3.5 h-3.5 text-slate-400 mt-0.5" />
                                <div className="min-w-0">
                                    <p className="text-[11px] font-bold text-slate-600 truncate leading-tight">
                                        {branch.address_line1} {branch.address_line2}
                                    </p>
                                    <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                                        {branch.city}, {branch.state}, {branch.country}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                            <div className="flex -space-x-2">
                                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-[10px] font-bold text-emerald-700 border-2 border-white">A</div>
                                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-[10px] font-bold text-amber-700 border-2 border-white">B</div>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => {
                                        setSelectedBranchId(branch.id);
                                        setIsResetPasswordModalOpen(true);
                                    }}
                                    className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                    title="Reset Password"
                                >
                                    <Icon name="key" className="w-4 h-4" />
                                </button>
                                <button className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                                    <Icon name="reports" className="w-4 h-4" />
                                </button>
                                <button className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-900 hover:text-white transition-all shadow-sm">
                                    <Icon name="settings" className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                {branches.length === 0 && !loading && (
                    <div className="col-span-full text-center py-24 bg-white rounded-[40px] border-2 border-dashed border-slate-200">
                        <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-6">🏜️</div>
                        <p className="text-lg font-black text-slate-900 m-0">No branches found</p>
                        <p className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-[0.2em]">Platform branch directory is empty</p>
                    </div>
                )}
            </div>

            {/* Modal */}
            <Modal
                isOpen={isCreateModalOpen}
                onClose={() => { setIsCreateModalOpen(false); resetForm(); setError(null); }}
                title="Provision New Branch"
                type="success"
                fullScreen={true}
            >
                <div className="flex bg-slate-50 border-b border-slate-200">
                    <div className={`flex-1 py-4 text-center text-[10px] font-black uppercase tracking-widest ${currentStep === 1 ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}>1. Branch Info</div>
                    <div className={`flex-1 py-4 text-center text-[10px] font-black uppercase tracking-widest ${currentStep === 2 ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}>2. Admin Access</div>
                    <div className={`flex-1 py-4 text-center text-[10px] font-black uppercase tracking-widest ${currentStep === 3 ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}>3. Subscription</div>
                </div>

                <form onSubmit={handleCreateBranch} className="space-y-8 max-h-[65vh] overflow-y-auto px-6 py-4 custom-scrollbar">
                    
                    {currentStep === 1 && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                            {/* Basic Info */}
                            <div className="space-y-5">
                                <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <span className="w-4 h-[2px] bg-indigo-600" /> General Identification
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Branch Legal Name</label>
                                        <input 
                                            id="branch-name" 
                                            type="text" 
                                            value={branchName} 
                                            onChange={e => setBranchName(e.target.value)} 
                                            onKeyDown={e => handleEnter(e, 'branch-gstin')}
                                            className="erp-input w-full h-12 text-sm font-bold shadow-sm" 
                                            placeholder="e.g. Acme Mumbai" 
                                            autoFocus
                                            required 
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Branch GSTIN</label>
                                        <input 
                                            id="branch-gstin" 
                                            type="text" 
                                            value={branchGstin} 
                                            onChange={e => setBranchGstin(e.target.value.toUpperCase())} 
                                            onKeyDown={e => handleEnter(e, 'address-1')}
                                            className="erp-input w-full h-12 text-sm font-bold shadow-sm" 
                                            placeholder="15-digit GSTIN" 
                                            required 
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Address */}
                            <div className="space-y-5">
                                <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <span className="w-4 h-[2px] bg-indigo-600" /> Physical Location
                                </h4>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 gap-4">
                                        <input 
                                            id="address-1" 
                                            type="text" 
                                            value={addressLine1} 
                                            onChange={e => setAddressLine1(e.target.value)} 
                                            onKeyDown={e => handleEnter(e, 'address-2')}
                                            className="erp-input w-full h-12 text-sm font-bold shadow-sm" 
                                            placeholder="Address Line 1" 
                                            required 
                                        />
                                        <input 
                                            id="address-2" 
                                            type="text" 
                                            value={addressLine2} 
                                            onChange={e => setAddressLine2(e.target.value)} 
                                            onKeyDown={e => handleEnter(e, 'address-3')}
                                            className="erp-input w-full h-12 text-sm font-bold shadow-sm" 
                                            placeholder="Address Line 2 (Optional)" 
                                        />
                                        <input 
                                            id="address-3" 
                                            type="text" 
                                            value={addressLine3} 
                                            onChange={e => setAddressLine3(e.target.value)} 
                                            onKeyDown={e => handleEnter(e, 'country')}
                                            className="erp-input w-full h-12 text-sm font-bold shadow-sm" 
                                            placeholder="Address Line 3 (Optional)" 
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Country</label>
                                            <select 
                                                id="country" 
                                                value={selectedCountry} 
                                                onChange={e => { setSelectedCountry(e.target.value); setSelectedState(''); }} 
                                                onKeyDown={e => handleEnter(e, 'state')}
                                                className="erp-input w-full h-12 text-sm font-bold shadow-sm" 
                                                required
                                            >
                                                {geoData.map(c => <option key={c.code} value={c.name}>{c.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">State / Province</label>
                                            <select 
                                                id="state" 
                                                value={selectedState} 
                                                onChange={e => { setSelectedState(e.target.value); setSelectedDistrict(''); }} 
                                                onKeyDown={e => handleEnter(e, 'district')}
                                                className="erp-input w-full h-12 text-sm font-bold shadow-sm" 
                                                required
                                            >
                                                <option value="">Select State</option>
                                                {currentCountry?.states.map((s: any) => <option key={s.name} value={s.name}>{s.name}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">District</label>
                                            {selectedCountry === 'India' ? (
                                                <select 
                                                    id="district" 
                                                    value={selectedDistrict} 
                                                    onChange={e => setSelectedDistrict(e.target.value)} 
                                                    onKeyDown={e => handleEnter(e, 'pincode')}
                                                    className="erp-input w-full h-12 text-sm font-bold shadow-sm" 
                                                    required
                                                >
                                                    <option value="">Select District</option>
                                                    {districtOptions.map((d: string) => <option key={d} value={d}>{d}</option>)}
                                                </select>
                                            ) : (
                                                <input id="district" type="text" value={selectedDistrict} onChange={e => setSelectedDistrict(e.target.value)} onKeyDown={e => handleEnter(e, 'pincode')} className="erp-input w-full h-12 text-sm font-bold shadow-sm" placeholder="District / County" />
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pincode / ZIP</label>
                                            <input 
                                                id="pincode" 
                                                type="text" 
                                                value={pincode} 
                                                onChange={e => setPincode(e.target.value)} 
                                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setCurrentStep(2); } }}
                                                className="erp-input w-full h-12 text-sm font-bold shadow-sm" 
                                                placeholder="e.g. 400001" 
                                                required 
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4 sticky bottom-0 bg-white pb-2 border-t border-slate-100">
                                <button type="button" onClick={() => setCurrentStep(2)} className="flex-[2] h-14 bg-indigo-600 text-white border-none rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-indigo-200 hover:bg-slate-900 transition-all active:scale-95">
                                    Next: Administrative Access <Icon name="arrow-right" className="inline w-4 h-4 ml-1" />
                                </button>
                            </div>
                        </div>
                    )}

                    {currentStep === 2 && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                            {/* Admin Info */}
                            <div className="space-y-5">
                                <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <span className="w-4 h-[2px] bg-indigo-600" /> Administrative Access
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Admin Full Name</label>
                                        <input 
                                            id="admin-name" 
                                            type="text" 
                                            value={adminName} 
                                            onChange={e => setAdminName(e.target.value)} 
                                            onKeyDown={e => handleEnter(e, 'admin-email')}
                                            className="erp-input w-full h-12 text-sm font-bold shadow-sm" 
                                            placeholder="John Doe" 
                                            autoFocus
                                            required 
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Admin Email</label>
                                        <input 
                                            id="admin-email" 
                                            type="email" 
                                            value={email} 
                                            onChange={e => setEmail(e.target.value)} 
                                            onKeyDown={e => handleEnter(e, 'admin-phone')}
                                            className="erp-input w-full h-12 text-sm font-bold shadow-sm" 
                                            placeholder="contact@branch.com" 
                                            required 
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-5">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact Phone (Admin)</label>
                                        <input 
                                            id="admin-phone" 
                                            type="tel" 
                                            value={phone} 
                                            onChange={e => setPhone(e.target.value)} 
                                            onKeyDown={e => handleEnter(e, 'username')}
                                            className="erp-input w-full h-12 text-sm font-bold shadow-sm" 
                                            placeholder="Phone number" 
                                            required 
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Login Username</label>
                                        <input 
                                            id="username" 
                                            type="text" 
                                            value={username} 
                                            onChange={e => setUsername(e.target.value)} 
                                            onKeyDown={e => handleEnter(e, 'password')}
                                            className="erp-input w-full h-12 text-sm font-bold shadow-sm" 
                                            placeholder="Login username" 
                                            required 
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Login Password</label>
                                        <input 
                                            id="password" 
                                            type="password" 
                                            value={password} 
                                            onChange={e => setPassword(e.target.value)} 
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setCurrentStep(3); } }}
                                            className="erp-input w-full h-12 text-sm font-bold shadow-sm" 
                                            placeholder="Initial access password" 
                                            required 
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4 sticky bottom-0 bg-white pb-2 border-t border-slate-100">
                                <button type="button" onClick={() => setCurrentStep(1)} className="flex-1 h-14 bg-slate-50 border border-slate-200 text-slate-600 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all shadow-sm">
                                    <Icon name="arrow-left" className="inline w-4 h-4 mr-1" /> Back
                                </button>
                                <button type="button" onClick={() => setCurrentStep(3)} className="flex-[2] h-14 bg-indigo-600 text-white border-none rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-indigo-200 hover:bg-slate-900 transition-all active:scale-95">
                                    Next: Subscription Plan <Icon name="arrow-right" className="inline w-4 h-4 ml-1" />
                                </button>
                            </div>
                        </div>
                    )}

                    {currentStep === 3 && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                            {/* Subscription */}
                            <div className="space-y-5">
                                <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <span className="w-4 h-[2px] bg-indigo-600" /> Subscription Plan Selection
                                </h4>
                                <div className="space-y-3">
                                    {SUBSCRIPTION_PLANS.map(plan => (
                                        <label key={plan.value} className={`flex items-center gap-4 p-4 border rounded-2xl cursor-pointer transition-all ${selectedPlan === plan.value ? 'border-indigo-600 bg-indigo-50/50 shadow-md' : 'border-slate-200 hover:border-indigo-300'}`}>
                                            <input type="radio" value={plan.value} checked={selectedPlan === plan.value} onChange={() => setSelectedPlan(plan.value)} className="w-5 h-5 accent-indigo-600" />
                                            <span className="text-sm font-bold text-slate-800">{plan.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4 sticky bottom-0 bg-white pb-2 border-t border-slate-100">
                                <button type="button" onClick={() => setCurrentStep(2)} className="flex-1 h-14 bg-slate-50 border border-slate-200 text-slate-600 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all shadow-sm">
                                    <Icon name="arrow-left" className="inline w-4 h-4 mr-1" /> Back
                                </button>
                                <button type="submit" disabled={isProcessing} className="flex-[2] h-14 bg-emerald-600 text-white border-none rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-emerald-200 hover:bg-emerald-700 transition-all disabled:opacity-50 active:scale-95">
                                    {isProcessing ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Provisioning...
                                        </span>
                                    ) : 'Create Branch Account directly'}
                                </button>
                            </div>
                        </div>
                    )}
                </form>
            </Modal>

            {/* Reset Password Modal */}
            <Modal
                isOpen={isResetPasswordModalOpen}
                onClose={() => { setIsResetPasswordModalOpen(false); setNewPassword(''); setError(null); }}
                title="Reset Branch Password"
                type="warning"
            >
                <form onSubmit={handleResetPassword} className="p-6 space-y-6">
                    <div className="text-center">
                        <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">🔑</div>
                        <h3 className="text-lg font-black text-slate-800">Security Override</h3>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2 border-b border-slate-100 pb-4">
                            Branch ID: {selectedBranchId?.split('-')[0]}...
                        </p>
                        <p className="text-sm text-slate-500 mt-4 leading-relaxed font-medium">
                            This will reset the password for <span className="text-indigo-600 font-bold">ALL user accounts</span> associated with this branch. This action is immediate and cannot be undone.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">New Secure Password</label>
                        <input 
                            type="password" 
                            value={newPassword} 
                            onChange={e => setNewPassword(e.target.value)}
                            className="erp-input w-full h-12 text-center text-lg tracking-widest font-black bg-slate-50 border-2 focus:border-indigo-500 transition-all rounded-xl"
                            placeholder="••••••••"
                            required
                            minLength={8}
                            autoFocus
                        />
                        <p className="text-[10px] font-bold text-slate-400 text-center mt-2">Minimum 8 characters required</p>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button 
                            type="button" 
                            onClick={() => setIsResetPasswordModalOpen(false)}
                            className="flex-1 h-12 bg-white border border-slate-200 text-slate-600 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={isProcessing || newPassword.length < 8}
                            className="flex-[2] h-12 bg-slate-900 text-white border-none rounded-xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-slate-200 hover:bg-black transition-all disabled:opacity-50 active:scale-95"
                        >
                            {isProcessing ? 'Updating Access...' : 'Reset All Passwords'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default BranchesPage;
