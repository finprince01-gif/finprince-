import React, { useState, useEffect } from 'react';
import GSTR1Page from './GSTR1';
import { usePermissions } from '../../hooks/usePermissions';

export default function GSTPage() {
    const { hasTabAccess, isSuperuser } = usePermissions();

    const allTabs = [
        { id: 'GSTR1', label: 'GSTR1 - Outward Supplies' },
        { id: 'GSTR2', label: 'GSTR2 - Inward Supplies' },
        { id: 'GSTR3B', label: 'GSTR3B - Summary Return' }
    ];

    const availableTabs = isSuperuser
        ? allTabs
        : allTabs.filter(tab => hasTabAccess('GST', tab.id));

    const [activeTab, setActiveTab] = useState(availableTabs.length > 0 ? availableTabs[0].id : '');

    useEffect(() => {
        if (availableTabs.length > 0 && !availableTabs.find(t => t.id === activeTab)) {
            setActiveTab(availableTabs[0].id);
        }
    }, [availableTabs, activeTab]);

    return (
        <div className="space-y-8">
            {/* Page Header */}
            <div className="flex items-end justify-between border-b border-slate-200 pb-6">
                <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Taxation</p>
                    <h2 className="text-[20px] font-bold text-slate-900">
                        GST Returns
                    </h2>
                </div>
            </div>

            {/* Main Tabs */}
            <div className="flex space-x-8 border-b border-slate-200">
                {availableTabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`
                            whitespace-nowrap pb-4 text-[13px] font-bold uppercase tracking-wider transition-all relative
                            ${activeTab === tab.id
                                ? 'text-indigo-600'
                                : 'text-slate-400 hover:text-slate-600'}
                        `}
                    >
                        {tab.label}
                        {activeTab === tab.id && (
                            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-600" />
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">
                {activeTab === 'GSTR1' && (
                    <div className="erp-card p-0">
                        <GSTR1Page />
                    </div>
                )}

                {activeTab === 'GSTR2' && (
                    <div className="erp-card py-20 text-center">
                        <h3 className="text-[16px] font-bold text-slate-800 mb-2 uppercase tracking-wide">GSTR2 - Inward Supplies</h3>
                        <p className="text-slate-500 text-sm">Automated inward supplies reconciliation module is coming soon.</p>
                    </div>
                )}

                {activeTab === 'GSTR3B' && (
                    <div className="erp-card py-20 text-center">
                        <h3 className="text-[16px] font-bold text-slate-800 mb-2 uppercase tracking-wide">GSTR3B - Monthly Summary</h3>
                        <p className="text-slate-500 text-sm">Monthly summary return and auto-computation from GSTR1/2 is coming soon.</p>
                    </div>
                )}
            </div>
        </div>
    );
}


