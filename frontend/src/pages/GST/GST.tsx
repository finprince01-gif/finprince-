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
        <div className="space-y-6">
            {/* Page Header */}
            <div className="erp-section-title">
                <div>
                    <h1 className="page-title">GST Returns</h1>
                    <p className="helper-text mb-0">Taxation and compliance management</p>
                </div>
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
                    <GSTR1Page />
                )}

                {activeTab === 'GSTR2' && (
                    <div className="erp-container py-20 text-center">
                        <h3 className="section-title border-none pb-0">GSTR2 - Inward Supplies</h3>
                        <p className="helper-text">Automated inward supplies reconciliation module is coming soon.</p>
                    </div>
                )}

                {activeTab === 'GSTR3B' && (
                    <div className="erp-container py-20 text-center">
                        <h3 className="section-title border-none pb-0">GSTR3B - Monthly Summary</h3>
                        <p className="helper-text">Monthly summary return and auto-computation from GSTR1/2 is coming soon.</p>
                    </div>
                )}
            </div>
        </div>
    );
}


