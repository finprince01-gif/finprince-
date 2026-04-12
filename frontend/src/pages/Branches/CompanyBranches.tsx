import React, { useState, useEffect } from 'react';
import { masterApiService } from '../../services/masterApi';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';

interface Branch {
    id: string;
    name: string;
    gstin: string;
    pan_number?: string;
}

interface Company {
    id: string;
    name: string;
}

interface CompanyBranchesProps {
    company: Company;
    onBack: () => void;
    onSelectBranch?: (branch: Branch) => void;
}

const CompanyBranches: React.FC<CompanyBranchesProps> = ({ company, onBack, onSelectBranch }) => {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
    const [actionModal, setActionModal] = useState<{ type: 'reset-password' | 'edit-branch' | 'disable-branch' | null, branch: Branch | null }>({ type: null, branch: null });
    const [isActionProcessing, setIsActionProcessing] = useState(false);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element;
            if (!target.closest('.branch-action-menu')) {
                setOpenDropdownId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        loadBranches();
    }, [company.id]);

    const loadBranches = async () => {
        setLoading(true);
        setError(null);
        try {
            // GET /api/master/branches/?company_id=<id>  → grouped endpoint filtered by name
            // We use the grouped endpoint and pull the correct company's branches
            const grouped = await masterApiService.getGroupedBranches();
            const companyBranches: Branch[] = grouped[company.name] || [];
            setBranches(companyBranches);
        } catch {
            setError('Failed to load branches for this company.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: '8px 0' }}>

            {/* ── Breadcrumb ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
                <button
                    onClick={onBack}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 14px',
                        background: '#f1f5f9', border: '1px solid #e2e8f0',
                        borderRadius: 8, cursor: 'pointer',
                        fontSize: 11, fontWeight: 700, color: '#64748b',
                        textTransform: 'uppercase', letterSpacing: '0.1em',
                        transition: 'all 0.12s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#1e293b'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b'; }}
                >
                    ← Back
                </button>
                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Branches</span>
                <span style={{ fontSize: 12, color: '#cbd5e1' }}>/</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#4f46e5', textTransform: 'capitalize' }}>
                    {company.name}
                </span>
            </div>

            {/* ── Page Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
                <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: 'linear-gradient(135deg, #4f46e5, #818cf8)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, boxShadow: '0 6px 16px rgba(79,70,229,0.25)'
                }}>🏢</div>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px', margin: 0 }}>
                        {company.name}
                    </h1>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 3 }}>
                        {loading ? '...' : `${branches.length} ${branches.length === 1 ? 'branch' : 'branches'}`}
                    </p>
                </div>
            </div>

            {/* ── Branch List ── */}
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
                    <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : error ? (
                <div style={{
                    padding: '20px 24px', background: '#fef2f2',
                    border: '1px solid #fecaca', borderRadius: 16,
                    color: '#dc2626', fontSize: 13, fontWeight: 600
                }}>
                    {error}
                </div>
            ) : branches.length === 0 ? (
                <div style={{
                    textAlign: 'center', padding: '60px 24px',
                    background: '#f8fafc', borderRadius: 20,
                    border: '2px dashed #e2e8f0'
                }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>📍</div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#475569', margin: 0 }}>No branches yet</p>
                    <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                        Use "Create New Branch" to add a branch to {company.name}
                    </p>
                </div>
            ) : (
                <div style={{
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 20,
                    overflow: 'hidden',
                    boxShadow: '0 2px 12px rgba(15,23,42,0.05)'
                }}>
                    {/* Left border tree accent */}
                    <div style={{
                        padding: '12px 24px',
                        background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
                        borderBottom: '1px solid #e2e8f0',
                        display: 'flex', alignItems: 'center', gap: 10
                    }}>
                        <div style={{ width: 3, height: 20, background: '#4f46e5', borderRadius: 4 }} />
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                            GSTIN Branches
                        </span>
                    </div>

                    {branches.map((branch, idx) => {
                        const isLast = idx === branches.length - 1;
                        return (
                            <div
                                key={branch.id}
                                onClick={() => onSelectBranch && onSelectBranch(branch)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 16,
                                    padding: '18px 24px',
                                    borderBottom: isLast ? 'none' : '1px solid #f1f5f9',
                                    transition: 'background 0.1s',
                                    cursor: 'pointer'
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                {/* 📍 icon */}
                                <div style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    background: '#f0fdf4', border: '1px solid #bbf7d0',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 16, flexShrink: 0
                                }}>
                                    📍
                                </div>

                                {/* Branch name */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                                        {branch.name}
                                    </div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>
                                        GSTIN Branch
                                    </div>
                                </div>

                                {/* GSTIN & PAN badges & Actions */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <span style={{
                                            fontSize: 10, fontWeight: 800,
                                            color: '#64748b', background: '#f1f5f9',
                                            padding: '5px 10px', borderRadius: 8,
                                            textTransform: 'uppercase', letterSpacing: '0.08em',
                                            fontFamily: 'monospace'
                                        }}>
                                            PAN: {branch.pan_number || 'N/A'}
                                        </span>
                                        <span style={{
                                            fontSize: 11, fontWeight: 800,
                                            color: '#4f46e5', background: '#eef2ff',
                                            padding: '5px 12px', borderRadius: 8,
                                            textTransform: 'uppercase', letterSpacing: '0.08em',
                                            fontFamily: 'monospace'
                                        }}>
                                            GST: {branch.gstin}
                                        </span>
                                    </div>
                                    
                                    {/* Action Menu Container */}
                                    <div className="branch-action-menu" style={{ position: 'relative' }}>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenDropdownId(openDropdownId === branch.id ? null : branch.id);
                                            }}
                                            style={{
                                                width: 32, height: 32, display: 'flex', alignItems: 'center',
                                                justifyContent: 'center', background: openDropdownId === branch.id ? '#e2e8f0' : 'transparent',
                                                border: '1px solid transparent', borderRadius: 8,
                                                cursor: 'pointer', color: openDropdownId === branch.id ? '#0f172a' : '#64748b', transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = openDropdownId === branch.id ? '#e2e8f0' : 'transparent'; e.currentTarget.style.color = openDropdownId === branch.id ? '#0f172a' : '#64748b'; }}
                                        >
                                            <Icon name="more-vertical" size={16} />
                                        </button>
                                        
                                        {/* Dropdown Box */}
                                        {openDropdownId === branch.id && (
                                            <div 
                                                style={{
                                                    position: 'absolute', right: 0, top: '100%', marginTop: 8,
                                                    width: 170, background: '#fff',
                                                    border: '1px solid #e2e8f0', borderRadius: 12,
                                                    boxShadow: '0 10px 25px rgba(15,23,42,0.1)',
                                                    zIndex: 50, padding: 6,
                                                    display: 'flex', flexDirection: 'column', gap: 2
                                                }}
                                                className="animate-in fade-in zoom-in-95 duration-200 origin-top-right whitespace-nowrap"
                                            >
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setOpenDropdownId(null); setActionModal({ type: 'reset-password', branch }); }}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#475569', background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'all 0.1s' }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#0f172a'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; }}
                                                >
                                                    <Icon name="key" size={14} className="text-slate-400" /> Reset Password
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setOpenDropdownId(null); setActionModal({ type: 'edit-branch', branch }); }}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#475569', background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'all 0.1s' }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#0f172a'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; }}
                                                >
                                                    <Icon name="edit-3" size={14} className="text-slate-400" /> Edit Branch
                                                </button>
                                                <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setOpenDropdownId(null); setActionModal({ type: 'disable-branch', branch }); }}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#ef4444', background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'all 0.1s' }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#ef4444'; }}
                                                >
                                                    <Icon name="slash" size={14} className="opacity-70" /> Disable Branch
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ACTION MODALS */}
            {actionModal.type === 'reset-password' && actionModal.branch && (
                <Modal 
                    isOpen={true} 
                    onClose={() => setActionModal({ type: null, branch: null })} 
                    title="Reset Admin Password" 
                    type="warning"
                >
                    <div className="space-y-4 pt-2">
                        <p className="text-[12px] font-bold text-slate-600">
                            You are about to reset the administrator password for <strong className="text-indigo-600">{actionModal.branch.name}</strong>.
                        </p>
                        <div className="space-y-2 mt-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">New Password</label>
                            <input type="password" placeholder="Enter new password" className="border border-slate-200 rounded-lg w-full h-[42px] px-4 text-sm font-bold focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none" />
                        </div>
                        <div className="flex gap-3 pt-6 mt-2 border-t border-slate-100">
                            <button onClick={() => setActionModal({ type: null, branch: null })} className="flex-1 py-3 bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-all">Cancel</button>
                            <button onClick={() => setActionModal({ type: null, branch: null })} className="flex-1 py-3 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-[0.1em] rounded-xl shadow-[0_8px_16px_rgba(79,70,229,0.25)] hover:bg-slate-900 transition-all">Update Password</button>
                        </div>
                    </div>
                </Modal>
            )}

            {actionModal.type === 'edit-branch' && actionModal.branch && (
                <Modal 
                    isOpen={true} 
                    onClose={() => setActionModal({ type: null, branch: null })} 
                    title="Edit Branch Configuration" 
                    type="success"
                >
                    <div className="space-y-5 pt-2">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Branch Name</label>
                            <input type="text" defaultValue={actionModal.branch.name} className="border border-slate-200 rounded-lg w-full h-[42px] px-4 text-sm font-bold focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PAN Number</label>
                            <input type="text" defaultValue={actionModal.branch.pan_number} className="border border-slate-200 rounded-lg w-full h-[42px] px-4 text-sm font-bold text-slate-500 uppercase bg-slate-50 cursor-not-allowed outline-none" readOnly />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">GSTIN Number</label>
                            <input type="text" defaultValue={actionModal.branch.gstin} className="border border-slate-200 rounded-lg w-full h-[42px] px-4 text-sm font-bold uppercase focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none" />
                        </div>
                        <div className="flex gap-3 pt-6 mt-2 border-t border-slate-100">
                            <button onClick={() => setActionModal({ type: null, branch: null })} className="flex-1 py-3 bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-all">Cancel</button>
                            <button onClick={() => setActionModal({ type: null, branch: null })} className="flex-1 py-3 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-[0.1em] rounded-xl shadow-[0_8px_16px_rgba(16,185,129,0.25)] hover:bg-slate-900 transition-all">Save Changes</button>
                        </div>
                    </div>
                </Modal>
            )}

            {actionModal.type === 'disable-branch' && actionModal.branch && (
                <Modal 
                    isOpen={true} 
                    onClose={() => setActionModal({ type: null, branch: null })} 
                    title="Disable Branch Entity" 
                    type="error"
                >
                    <div className="space-y-5 pt-2">
                        <div className="text-[12px] font-bold text-rose-700 bg-rose-50 p-4 rounded-xl border border-rose-200">
                            WARNING: Disabling <span className="font-black underline">{actionModal.branch.name}</span> will instantly lock all associated users out of the system. Are you absolutely sure you want to proceed?
                        </div>
                        <div className="space-y-2 mt-4">
                            <label className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Type branch name to confirm</label>
                            <input type="text" placeholder={`Type "${actionModal.branch.name}"`} className="border border-rose-200 rounded-lg w-full h-[42px] px-4 text-sm font-bold focus:border-rose-600 focus:ring-2 focus:ring-rose-100 outline-none placeholder:opacity-50" />
                        </div>
                        <div className="flex gap-3 pt-6 mt-2 border-t border-slate-100">
                            <button onClick={() => setActionModal({ type: null, branch: null })} className="flex-[0.6] py-3 bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-all">Keep Active</button>
                            <button onClick={() => setActionModal({ type: null, branch: null })} className="flex-[1.4] py-3 bg-rose-600 text-white text-[10px] font-black uppercase tracking-[0.1em] rounded-xl shadow-[0_8px_16px_rgba(225,29,72,0.25)] hover:bg-rose-900 transition-all">Force Disable Branch</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default CompanyBranches;
