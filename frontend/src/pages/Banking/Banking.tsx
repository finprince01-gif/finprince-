import React, { useState } from 'react';
import BankStatementUpload from './BankStatementUpload';
import BankReconciliation from './BankReconciliation';
import UnmatchedBankTransactions from './UnmatchedBankTransactions';
import ReconciliationReport from './ReconciliationReport';

type BankingTab = 'Upload' | 'Reconciliation' | 'Unmatched' | 'Report';

const Banking: React.FC = () => {
    const [activeTab, setActiveTab] = useState<BankingTab>('Reconciliation');
    const [uploadSummary, setUploadSummary] = useState<any>(null);
    const [selectedBankLedger, setSelectedBankLedger] = useState<string>('');

    const handleUploadSuccess = (summary: any) => {
        setUploadSummary(summary);
        setActiveTab('Reconciliation');
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case 'Upload':
                return (
                    <BankStatementUpload 
                        onSuccess={handleUploadSuccess} 
                        selectedBankLedger={selectedBankLedger}
                        onBankLedgerChange={setSelectedBankLedger}
                    />
                );
            case 'Reconciliation':
                return (
                    <BankReconciliation 
                        initialSummary={uploadSummary} 
                        selectedBankLedgerProp={selectedBankLedger}
                        onBankLedgerChange={setSelectedBankLedger}
                    />
                );
            case 'Unmatched':
                return (
                    <UnmatchedBankTransactions 
                        selectedBankLedgerProp={selectedBankLedger}
                        onBankLedgerChange={setSelectedBankLedger}
                    />
                );
            case 'Report':
                return (
                    <ReconciliationReport 
                        selectedBankLedgerProp={selectedBankLedger}
                        onBankLedgerChange={setSelectedBankLedger}
                    />
                );
            default:
                return (
                    <BankReconciliation 
                        selectedBankLedgerProp={selectedBankLedger}
                        onBankLedgerChange={setSelectedBankLedger}
                    />
                );
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200 shadow-inner">
                    <button
                        onClick={() => setActiveTab('Upload')}
                        className={`px-6 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${
                            activeTab === 'Upload'
                                ? 'bg-white text-indigo-600 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                        }`}
                    >
                        Bank Statement Upload
                    </button>
                    <button
                        onClick={() => setActiveTab('Reconciliation')}
                        className={`px-6 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${
                            activeTab === 'Reconciliation'
                                ? 'bg-white text-indigo-600 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                        }`}
                    >
                        Bank Reconciliation
                    </button>
                    <button
                        onClick={() => setActiveTab('Unmatched')}
                        className={`px-6 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${
                            activeTab === 'Unmatched'
                                ? 'bg-white text-indigo-600 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                        }`}
                    >
                        Unmatched Bank Transactions
                    </button>
                    <button
                        onClick={() => setActiveTab('Report')}
                        className={`px-6 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${
                            activeTab === 'Report'
                                ? 'bg-white text-indigo-600 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                        }`}
                    >
                        Reconciliation Report
                    </button>
                </div>
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                {renderTabContent()}
            </div>
        </div>
    );
};

export default Banking;
