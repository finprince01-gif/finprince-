import React, { useState } from 'react';
import GSTR1Page from './GSTR1';

export default function GSTPage() {
    const [activeTab, setActiveTab] = useState('GSTR1');

    const tabs = [
        { id: 'GSTR1', label: 'GSTR1 - Outward Supplies' },
        { id: 'GSTR2', label: 'GSTR2 - Inward Supplies' },
        { id: 'GSTR3B', label: 'GSTR3B - Summary Return' }
    ];

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-full mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-gray-900">GST Returns</h1>
                    <p className="text-gray-600 mt-1">Generate and manage GST return filings</p>
                </div>

                {/* Primary Tabs */}
                <div className="bg-white rounded-lg shadow-sm mb-6">
                    <div className="border-b border-gray-200">
                        <div className="flex gap-8 px-6">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`py-4 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
                                            ? 'border-blue-600 text-blue-700'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tab Content */}
                    <div className="p-6">
                        {activeTab === 'GSTR1' && <GSTR1Page />}

                        {activeTab === 'GSTR2' && (
                            <div className="text-center py-12">
                                <h3 className="text-lg font-semibold text-gray-700 mb-2">GSTR2 - Coming Soon</h3>
                                <p className="text-gray-500">Purchase returns module will be available soon.</p>
                            </div>
                        )}

                        {activeTab === 'GSTR3B' && (
                            <div className="text-center py-12">
                                <h3 className="text-lg font-semibold text-gray-700 mb-2">GSTR3B - Coming Soon</h3>
                                <p className="text-gray-500">Monthly summary return will be auto-computed from GSTR1 and GSTR2.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
