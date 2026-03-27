import React, { useState, useEffect } from 'react';
import { apiService } from '../../services';
import { showError, showSuccess } from '../../utils/toast';
import { Ledger } from '../../types';
import Icon from '../../components/Icon';
import SearchableSelect from '../../components/SearchableSelect';

interface BankStatementUploadProps {
    onSuccess: (summary: any) => void;
    selectedBankLedger: string;
    onBankLedgerChange: (ledgerName: string) => void;
}

const BankStatementUpload: React.FC<BankStatementUploadProps> = ({ 
    onSuccess, 
    selectedBankLedger, 
    onBankLedgerChange 
}) => {
    const [file, setFile] = useState<File | null>(null);
    const [bankLedgers, setBankLedgers] = useState<Ledger[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [uploadStep, setUploadStep] = useState<1 | 2 | 3 | 4 | 5>(1);

    useEffect(() => {
        const fetchLedgers = async () => {
            try {
                const ledgers = await apiService.getLedgers();
                const filtered = ledgers.filter(l => 
                    (l.group || '').toLowerCase().includes('bank') || 
                    (l.group || '').toLowerCase().includes('cash')
                );
                setBankLedgers(filtered.length > 0 ? filtered : ledgers);
            } catch (error) {
                showError('Failed to load bank ledgers');
            }
        };
        fetchLedgers();
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!file || !selectedBankLedger) {
            showError('Please select both a file and a bank ledger');
            return;
        }

        const ledger = bankLedgers.find(l => l.name === selectedBankLedger);
        if (!ledger || !ledger.id) {
            showError('Invalid bank ledger selected');
            return;
        }

        setIsLoading(true);
        try {
            // Step 1: Parse the file (Handled by backend in upload_statement)
            // Step 2: Normalize columns (Handled by backend)
            // Step 3: Insert rows into bank_statement_staging (Handled by backend)
            // Step 4: Automatically run matching engine (Handled by backend)
            setUploadStep(2);
            
            const response = await apiService.uploadBankStatement(file, ledger.id);
            setUploadStep(4);
            
            showSuccess('Bank statement uploaded and processed successfully');
            
            // Step 5: Redirect handled via callback
            onSuccess(response);
        } catch (error: any) {
            showError(error.message || 'Failed to upload bank statement');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
            <div className="space-y-8">
                <div className="text-center">
                    <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-inner">
                        <Icon name="upload" className="w-10 h-10" />
                    </div>
                    <h2 className="text-3xl font-black text-slate-800 tracking-tight">Upload Bank Statement</h2>
                    <p className="text-slate-500 font-medium mt-2">Import your CSV or Excel bank transactions</p>
                </div>

                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                            Select Bank Account
                        </label>
                        <SearchableSelect
                            options={bankLedgers.map(l => l.name)}
                            value={selectedBankLedger}
                            onChange={onBankLedgerChange}
                            placeholder="Search for bank ledger..."
                            className="w-full"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                            Select Statement File
                        </label>
                        <div className="relative group">
                            <input
                                type="file"
                                onChange={handleFileChange}
                                accept=".csv,.xlsx,.xls"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            <div className={`w-full p-8 border-2 border-dashed rounded-3xl transition-all flex flex-col items-center justify-center gap-4 ${
                                file ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 group-hover:border-indigo-300 group-hover:bg-slate-50/50'
                            }`}>
                                <Icon name={file ? "check" : "document"} className={`w-12 h-12 ${file ? 'text-emerald-500' : 'text-slate-300'}`} />
                                <div className="text-center">
                                    <p className={`text-sm font-bold ${file ? 'text-emerald-700' : 'text-slate-500'}`}>
                                        {file ? file.name : 'Click to browse or drag & drop'}
                                    </p>
                                    {!file && <p className="text-[11px] text-slate-400 font-medium mt-1 uppercase tracking-wider">CSV, XLS, or XLSX up to 10MB</p>}
                                </div>
                                {file && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setFile(null); }}
                                        className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:text-rose-600 transition-colors"
                                    >
                                        Remove File
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="pt-4">
                        <button
                            onClick={handleUpload}
                            disabled={isLoading || !file || !selectedBankLedger}
                            className={`w-full py-4 rounded-2xl text-sm font-black text-white uppercase tracking-widest shadow-xl shadow-indigo-100 transform transition-all active:scale-95 flex items-center justify-center gap-3 bg-gradient-to-tr from-indigo-600 to-indigo-500 hover:from-indigo-700 hover:to-indigo-600 disabled:grayscale disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            {isLoading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    {uploadStep === 2 ? 'Analyzing Columns...' : 'Running Matching...'}
                                </>
                            ) : (
                                <>
                                    <Icon name="upload" className="w-5 h-5" />
                                    Import & Match Transactions
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">How it works</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex gap-3">
                            <div className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[10px] font-black text-indigo-600 shrink-0 shadow-sm">1</div>
                            <p className="text-[11px] text-slate-600 font-medium leading-relaxed">Our AI parses headers automatically (No templates needed!)</p>
                        </div>
                        <div className="flex gap-3">
                            <div className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[10px] font-black text-indigo-600 shrink-0 shadow-sm">2</div>
                            <p className="text-[11px] text-slate-600 font-medium leading-relaxed">Transactions are matched against existing vouchers by Date, Amount & Ref</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BankStatementUpload;
