import React, { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import SearchableSelect from '../../components/SearchableSelect';
import { apiService } from '../../services';
import { showError, showSuccess } from '../../utils/toast';
import { Ledger } from '../../types';

interface ReconciliationReportProps {
    selectedBankLedgerProp?: string;
    onBankLedgerChange?: (ledgerName: string) => void;
}

const ReconciliationReport: React.FC<ReconciliationReportProps> = ({
    selectedBankLedgerProp,
    onBankLedgerChange
}) => {
    const [bankLedgers, setBankLedgers] = useState<Ledger[]>([]);
    const selectedBankLedger = selectedBankLedgerProp || '';
    const setSelectedBankLedger = onBankLedgerChange || (() => {});
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const fetchLedgers = async () => {
            try {
                const ledgers = await apiService.getLedgers();
                const filtered = ledgers.filter((l) =>
                    (l.group || '').toLowerCase().includes('bank') ||
                    (l.group || '').toLowerCase().includes('cash')
                );
                setBankLedgers(filtered);
                if (filtered.length > 0 && !selectedBankLedger) {
                    setSelectedBankLedger(filtered[0].name);
                }
            } catch (error) {
                showError('Failed to load bank ledgers');
            }
        };
        fetchLedgers();
    }, []);

    const handleDownload = async (type: 'statement' | 'summary') => {
        const ledger = bankLedgers.find((l) => l.name === selectedBankLedger);
        if (!ledger || !ledger.id) {
            showError('Please select a valid bank ledger first.');
            return;
        }

        setIsLoading(true);
        try {
            let csvText = '';
            let filename = '';
            
            if (type === 'statement') {
                csvText = await apiService.downloadBankReconciliationStatement(ledger.id);
                filename = 'bank_reconciliation_statement.csv';
            } else {
                csvText = await apiService.downloadMatchedTransactionsSummary(ledger.id);
                filename = 'matched_transactions_summary.csv';
            }

            const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            showSuccess('Report downloaded successfully!');
        } catch (error: any) {
            showError(error?.message || 'Failed to download report');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-[32px] p-20 flex flex-col items-center justify-center border border-slate-100 shadow-sm relative">
            {isLoading && (
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10 rounded-[32px]">
                    <Icon name="loader" className="w-8 h-8 text-indigo-500 animate-spin" />
                </div>
            )}
            
            <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mb-6 shadow-inner">
                <Icon name="bar-chart-2" className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-black text-slate-800 tracking-tighter">Banking Reports</h3>
            <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] mt-2 text-center">Comprehensive Bank Reconciliation Statements</p>
            
            <div className="mt-8 w-full max-w-md">
                <div className="mb-6">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 ml-1">
                        Select Bank Ledger
                    </label>
                    <SearchableSelect
                        options={bankLedgers.map((l) => l.name)}
                        value={selectedBankLedger}
                        onChange={setSelectedBankLedger}
                        placeholder="Choose a bank account..."
                    />
                </div>

                <div className="space-y-3">
                    <button 
                        onClick={() => handleDownload('statement')}
                        disabled={isLoading || !selectedBankLedger}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between group hover:border-indigo-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Icon name="file-text" className="w-5 h-5 text-slate-400 group-hover:text-indigo-500" />
                            </div>
                            <div className="text-left">
                                <span className="block text-sm font-bold text-slate-700">Bank Reconciliation Statement</span>
                                <span className="block text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-0.5">Full Transaction List</span>
                            </div>
                        </div>
                        <Icon name="download" className="w-5 h-5 text-slate-300 group-hover:text-indigo-500" />
                    </button>

                    <button 
                        onClick={() => handleDownload('summary')}
                        disabled={isLoading || !selectedBankLedger}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between group hover:border-indigo-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Icon name="check-circle" className="w-5 h-5 text-emerald-400 group-hover:text-emerald-500" />
                            </div>
                            <div className="text-left">
                                <span className="block text-sm font-bold text-slate-700">Matched Transactions Summary</span>
                                <span className="block text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-0.5">Reconciled Records Only</span>
                            </div>
                        </div>
                        <Icon name="download" className="w-5 h-5 text-slate-300 group-hover:text-emerald-500" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReconciliationReport;
