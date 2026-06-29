import finpixeLogo from '../../assets/finpixe with empty bg.png';
import React, { useState, useEffect } from 'react';
import GSTR1Page from './GSTR1';
import GSTR2Reconciliation from './GSTR2Reconciliation';
import GSTR3BPreview from './GSTR3BPreview';
import { usePermissions } from '../../hooks/usePermissions';

export default function GSTPage({ onNavigate, setViewVoucherData, vouchers }: { onNavigate?: (page: string, params?: any) => void, setViewVoucherData?: (data: any) => void, vouchers?: any[] }) {
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
        <div className="space-y-6">
            {/* Page Header */}
            <div className="erp-section-title">
                <div>
                    <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-white border border-[#E0E2FF] shadow-[0_8px_16px_rgba(75,60,255,0.08)] flex items-center justify-center overflow-hidden shrink-0">
            <img src={finpixeLogo} alt="Finpixe logo" className="w-9 h-9 object-contain drop-shadow-sm" />
          </div>
          <div>
<h1 className="page-title">GST Returns</h1>
                    <p className="helper-text mb-0">Taxation and compliance management</p>
                          </div>
        </div></div>
            </div>

            {/* Main Tabs */}
            <div className="erp-tab-container">
                {availableTabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`erp-tab ${activeTab === tab.id ? 'active' : ''}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="animate-in fade-in duration-300">
                {activeTab === 'GSTR1' && (
                    <GSTR1Page onNavigate={onNavigate} setViewVoucherData={setViewVoucherData} vouchers={vouchers} />
                )}

                {activeTab === 'GSTR2' && (
                    <GSTR2Reconciliation />
                )}

                {activeTab === 'GSTR3B' && (
                    <GSTR3BPreview />
                )}
            </div>
        </div>
    );
}
