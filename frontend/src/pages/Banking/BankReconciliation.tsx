import React, { useState, useEffect, useCallback } from 'react';
import { apiService } from '../../services';
import { showError, showSuccess } from '../../utils/toast';
import { Ledger } from '../../types';
import Icon from '../../components/Icon';
import SearchableSelect from '../../components/SearchableSelect';
import BankReconciliationTable from '../../components/BankReconciliationTable';
import CreateVoucherModal from '../../components/CreateVoucherModal';

interface BankReconciliationProps {
    initialSummary?: any;
    selectedBankLedgerProp?: string;
    onBankLedgerChange?: (ledgerName: string) => void;
}

const BankReconciliation: React.FC<BankReconciliationProps> = ({ 
    initialSummary, 
    selectedBankLedgerProp, 
    onBankLedgerChange 
}) => {
    const [transactions, setTransactions] = useState<any[]>([]);
    const [bankLedgers, setBankLedgers] = useState<Ledger[]>([]);
    const selectedBankLedger = selectedBankLedgerProp || '';
    const setSelectedBankLedger = onBankLedgerChange || (() => {});
    const [isLoading, setIsLoading] = useState(false);
    const [summary, setSummary] = useState<any>(initialSummary || null);

    // Filters
    const [statusFilter, setStatusFilter] = useState<string>('UNMATCHED');
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');

    // Pagination
    const [showHistorical, setShowHistorical] = useState(false);
    const [page, setPage] = useState(1);
    const pageSize = 50;

    // Modal state
    const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
    const [selectedTxn, setSelectedTxn] = useState<any>(null);
    const [isCreatingVoucher, setIsCreatingVoucher] = useState(false);

    const [allLedgers, setAllLedgers] = useState<Ledger[]>([]);

    useEffect(() => {
        const fetchLedgers = async () => {
            try {
                const ledgers = await apiService.getLedgers();
                setAllLedgers(ledgers);
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

    const fetchTransactions = useCallback(async () => {
        if (!selectedBankLedger) return;

        const ledger = bankLedgers.find((l) => l.name === selectedBankLedger);
        if (!ledger || !ledger.id) return;

        setIsLoading(true);
        try {
            const params: any = {
                status: statusFilter,
                page: page,
                page_size: pageSize,
                show_historical: showHistorical,
            };
            if (dateFrom) params.date_from = dateFrom;
            if (dateTo) params.date_to = dateTo;

            const data = await apiService.getPendingBankMatches(ledger.id, params);
            setTransactions(data);
        } catch (error) {
            showError('Failed to load transactions');
        } finally {
            setIsLoading(false);
        }
    }, [selectedBankLedger, bankLedgers, statusFilter, dateFrom, dateTo, page, showHistorical]);

    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]);

    // ── Actions ──────────────────────────────────────────────────────────────

    const handleLink = async (txnId: number, voucherId: number, type?: string) => {
        try {
            await apiService.linkBankVoucher(txnId, voucherId, type || 'payment');
            showSuccess('Voucher linked successfully');
            // Update row in-place
            setTransactions((prev) =>
                prev.map((t) =>
                    t.id === txnId ? { ...t, match_status: 'MANUAL_MATCHED' } : t
                )
            );
        } catch (error) {
            showError('Failed to link voucher');
        }
    };

    const handleIgnore = async (txnId: number) => {
        try {
            await apiService.ignoreBankTransaction(txnId);
            // Toggle ignored state in-place
            setTransactions((prev) =>
                prev.map((t) =>
                    t.id === txnId
                        ? {
                              ...t,
                              is_ignored: !t.is_ignored,
                              match_status: !t.is_ignored ? 'IGNORED' : 'UNMATCHED',
                          }
                        : t
                )
            );
        } catch (error) {
            showError('Failed to update transaction');
        }
    };

    /**
     * Open the Create Voucher modal.
     * Attach bank_ledger_id so the modal can show the correct bank name.
     */
    const handleCreate = (txn: any) => {
        const ledger = bankLedgers.find((l) => l.name === selectedBankLedger);
        setSelectedTxn({
            ...txn,
            bank_ledger_id: ledger?.id ?? txn.bank_ledger_id,
        });
        setIsVoucherModalOpen(true);
    };

    /**
     * Called by CreateVoucherModal when the user clicks "Finalize & Post Voucher".
     * Sends { party, narration, bank_ledger_id } to the backend.
     * On success, updates the row in-place to show "Reconciled ✓".
     */
    const handleVoucherSuccess = async (data: any) => {
        if (!selectedTxn) return;
        setIsCreatingVoucher(true);
        try {
            const amount = selectedTxn.debit > 0 || selectedTxn.debit_amount > 0 ? selectedTxn.debit_amount || selectedTxn.debit : selectedTxn.credit_amount || selectedTxn.credit;
            const voucherType = selectedTxn.debit > 0 || selectedTxn.debit_amount > 0 ? 'payment' : 'receipt';
            const counterpartyLedger = allLedgers.find((l) => 
                l.name.trim().toLowerCase() === data.party.trim().toLowerCase()
            );
            if (!counterpartyLedger) {
                console.error("Ledger not found for:", data.party, "Available:", allLedgers.map(l => l.name));
                throw new Error(`Ledger "${data.party}" not found. Please select a valid ledger from the list.`);
            }

            const response = await apiService.createBankVoucher(selectedTxn.id, {
                voucher_type: data.voucher_type || voucherType,
                bank_ledger_id: data.bank_ledger_id ?? selectedTxn.bank_ledger_id,
                counterparty_ledger_id: counterpartyLedger.id,
                amount: amount,
                reference: selectedTxn.reference_number || '',
                narration: data.narration,
                voucher_date: data.voucher_date,
                bank_transaction_id: selectedTxn.id
            });

            const finalVoucherTypeLabel = data.voucher_type || (voucherType === 'payment' ? 'Payment' : 'Receipt');

            showSuccess(`${finalVoucherTypeLabel} created & reconciled — ${response?.voucher_number || ''}`);

            // Update row in-place: mark as MANUAL_MATCHED and close modal
            setTransactions((prev) =>
                prev.map((t) =>
                    t.id === selectedTxn.id
                        ? { ...t, match_status: 'MANUAL_MATCHED', is_ignored: false }
                        : t
                )
            );

            setIsVoucherModalOpen(false);
            setSelectedTxn(null);
        } catch (error: any) {
            showError(error.message || 'Failed to create voucher');
        } finally {
            setIsCreatingVoucher(false);
        }
    };

    const handleRunMatching = async () => {
        const ledger = bankLedgers.find((l) => l.name === selectedBankLedger);
        if (!ledger?.id) return;

        setIsLoading(true);
        try {
            await apiService.runBankMatching(ledger.id);
            showSuccess('Matching engine finished');
            fetchTransactions();
        } catch (error) {
            showError('Failed to run matching');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAutoReconcile = async () => {
        const ledger = bankLedgers.find((l) => l.name === selectedBankLedger);
        if (!ledger?.id) return;

        setIsLoading(true);
        try {
            const result = await apiService.autoReconcileBank(ledger.id);
            setSummary(result);
            showSuccess(`Auto-reconciled ${result.auto_applied_count} transactions`);
            fetchTransactions();
        } catch (error) {
            showError('Failed to auto-reconcile');
        } finally {
            setIsLoading(false);
        }
    };

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">
            {/* Summary Banner */}
            {summary && (
                <div className="bg-indigo-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-100 flex items-center justify-between animate-in zoom-in duration-500">
                    <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
                            <Icon name="check" className="w-8 h-8" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black tracking-tight">Processing Complete</h3>
                            <div className="flex gap-4 mt-1 opacity-90">
                                <span className="text-[11px] font-black uppercase tracking-widest bg-white/20 px-2 py-0.5 rounded-lg">
                                    {summary.inserted || 0} Imported
                                </span>
                                <span className="text-[11px] font-black uppercase tracking-widest bg-emerald-400/40 px-2 py-0.5 rounded-lg">
                                    {summary.auto_applied || summary.auto_applied_count || 0} Auto-Matched
                                </span>
                                <span className="text-[11px] font-black uppercase tracking-widest bg-amber-400/40 px-2 py-0.5 rounded-lg">
                                    {summary.suggested || summary.suggested_count || 0} Suggestions
                                </span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => setSummary(null)}
                        className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors"
                    >
                        <Icon name="close" className="w-5 h-5" />
                    </button>
                </div>
            )}

            {/* Filters Bar */}
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 flex flex-wrap items-end justify-between gap-6">
                <div className="flex flex-wrap items-end gap-6">
                    <div className="space-y-2 min-w-[240px]">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                            Bank Account
                        </label>
                        <SearchableSelect
                            options={bankLedgers.map((l) => l.name)}
                            value={selectedBankLedger}
                            onChange={setSelectedBankLedger}
                            placeholder="Select bank..."
                        />
                    </div>

                    <div className="space-y-2 min-w-[180px]">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                            Match Status
                        </label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full h-[46px] px-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all cursor-pointer"
                        >
                            <option value="ALL">All Transactions</option>
                            <option value="UNMATCHED">Requires Action</option>
                            <option value="AUTO_MATCHED">Auto Matched</option>
                            <option value="MANUAL_MATCHED">Manually Reconciled</option>
                            <option value="IGNORED">Ignored</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                Date Range
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="h-[46px] px-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none"
                                />
                                <span className="text-slate-300 font-bold">to</span>
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="h-[46px] px-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 mb-1">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={showHistorical}
                                onChange={(e) => setShowHistorical(e.target.checked)}
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-all"
                            />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-slate-600 transition-colors">
                                Show Historical
                            </span>
                        </label>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={handleRunMatching}
                        disabled={isLoading}
                        className="px-6 h-[46px] bg-white border border-slate-200 rounded-2xl text-[11px] font-black text-slate-600 uppercase tracking-widest hover:bg-slate-50 active:scale-95 transition-all shadow-sm flex items-center gap-2"
                    >
                        <Icon name="refresh" className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        Run Matching
                    </button>
                    <button
                        onClick={handleAutoReconcile}
                        disabled={isLoading}
                        className="px-6 h-[46px] bg-indigo-600 rounded-2xl text-[11px] font-black text-white uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all shadow-xl shadow-indigo-100 flex items-center gap-2"
                    >
                        <Icon name="check" className="w-4 h-4" />
                        Auto Reconcile
                    </button>
                </div>
            </div>

            {/* Table */}
            {isLoading && transactions.length === 0 ? (
                <div className="bg-white rounded-[32px] p-20 flex flex-col items-center justify-center border border-slate-100">
                    <div className="w-12 h-12 border-4 border-slate-100 border-t-indigo-500 rounded-full animate-spin mb-4" />
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">
                        Loading transactions...
                    </p>
                </div>
            ) : (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <BankReconciliationTable
                        transactions={transactions}
                        onLink={handleLink}
                        onIgnore={handleIgnore}
                        onCreate={handleCreate}
                    />
                </div>
            )}

            {/* Pagination */}
            {transactions.length > 0 && (
                <div className="flex items-center justify-between px-8 py-4 bg-white rounded-[24px] border border-slate-100 shadow-sm">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                        Showing {transactions.length} transactions
                    </span>
                    <div className="flex gap-2">
                        <button
                            className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 transition-colors disabled:opacity-30"
                            disabled={page === 1}
                            onClick={() => setPage(page - 1)}
                        >
                            <Icon name="chevron-left" className="w-5 h-5" />
                        </button>
                        <button
                            className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 transition-colors"
                            onClick={() => setPage(page + 1)}
                        >
                            <Icon name="chevron-right" className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Create Voucher Modal */}
            <CreateVoucherModal
                isOpen={isVoucherModalOpen}
                onClose={() => {
                    setIsVoucherModalOpen(false);
                    setSelectedTxn(null);
                }}
                transaction={selectedTxn}
                ledgers={allLedgers}
                onSuccess={handleVoucherSuccess}
                onIgnore={handleIgnore}
                loading={isCreatingVoucher}
            />
        </div>
    );
};

export default BankReconciliation;
