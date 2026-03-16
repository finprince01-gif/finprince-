import React, { useState, useEffect, useCallback } from 'react';
import { apiService } from '../../services';
import { showError } from '../../utils/toast';
import { Ledger } from '../../types';
import Icon from '../../components/Icon';
import SearchableSelect from '../../components/SearchableSelect';
import BankReconciliationTable from '../../components/BankReconciliationTable';
import CreateVoucherModal from '../../components/CreateVoucherModal';
import { showSuccess } from '../../utils/toast';
interface UnmatchedBankTransactionsProps {
    selectedBankLedgerProp?: string;
    onBankLedgerChange?: (ledgerName: string) => void;
}

const UnmatchedBankTransactions: React.FC<UnmatchedBankTransactionsProps> = ({
    selectedBankLedgerProp,
    onBankLedgerChange
}) => {
    const [transactions, setTransactions] = useState<any[]>([]);
    const [bankLedgers, setBankLedgers] = useState<Ledger[]>([]);
    const selectedBankLedger = selectedBankLedgerProp || '';
    const setSelectedBankLedger = onBankLedgerChange || (() => {});
    const [allLedgers, setAllLedgers] = useState<Ledger[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
    const [selectedTxn, setSelectedTxn] = useState<any>(null);
    const [isCreatingVoucher, setIsCreatingVoucher] = useState(false);

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
            } catch {
                showError('Failed to load ledgers');
            }
        };
        fetchLedgers();
    }, []);

    const fetchUnmatched = useCallback(async () => {
        if (!selectedBankLedger) return;
        const ledger = bankLedgers.find((l) => l.name === selectedBankLedger);
        if (!ledger?.id) return;
        setIsLoading(true);
        try {
            const data = await apiService.getPendingBankMatches(ledger.id, {
                status: 'UNMATCHED',
                page: 1,
                page_size: 100,
            });
            setTransactions(data);
        } catch {
            showError('Failed to load unmatched transactions');
        } finally {
            setIsLoading(false);
        }
    }, [selectedBankLedger, bankLedgers]);

    useEffect(() => {
        fetchUnmatched();
    }, [fetchUnmatched]);

    const handleLink = async (txnId: number, voucherId: number, type?: string) => {
        try {
            await apiService.linkBankVoucher(txnId, voucherId, type || 'payment');
            showSuccess('Voucher linked successfully');
            setTransactions((prev) =>
                prev.map((t) => (t.id === txnId ? { ...t, match_status: 'MANUAL_MATCHED' } : t))
            );
        } catch {
            showError('Failed to link voucher');
        }
    };

    const handleIgnore = async (txnId: number) => {
        try {
            await apiService.ignoreBankTransaction(txnId);
            setTransactions((prev) =>
                prev.map((t) =>
                    t.id === txnId
                        ? { ...t, is_ignored: !t.is_ignored, match_status: !t.is_ignored ? 'IGNORED' : 'UNMATCHED' }
                        : t
                )
            );
        } catch {
            showError('Failed to update transaction');
        }
    };

    const handleCreate = (txn: any) => {
        const ledger = bankLedgers.find((l) => l.name === selectedBankLedger);
        setSelectedTxn({ ...txn, bank_ledger_id: ledger?.id ?? txn.bank_ledger_id });
        setIsVoucherModalOpen(true);
    };

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
                voucher_type: voucherType,
                bank_ledger_id: data.bank_ledger_id ?? selectedTxn.bank_ledger_id,
                counterparty_ledger_id: counterpartyLedger.id,
                amount: amount,
                reference: selectedTxn.reference_number || '',
                narration: data.narration,
                voucher_date: data.voucher_date,
                bank_transaction_id: selectedTxn.id
            });
            const voucherTypeLabel = voucherType === 'payment' ? 'Payment' : 'Receipt';
            showSuccess(`${voucherTypeLabel} voucher created — ${response?.voucher_number || ''}`);
            setTransactions((prev) =>
                prev.map((t) =>
                    t.id === selectedTxn.id ? { ...t, match_status: 'MANUAL_MATCHED' } : t
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

    const unmatchedCount = transactions.filter(
        (t) => !['MANUAL_MATCHED', 'AUTO_MATCHED', 'Matched', 'IGNORED'].includes(t.match_status)
    ).length;

    return (
        <div className="space-y-6">
            {/* Header Banner */}
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 flex items-start gap-5">
                <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center shrink-0">
                    <Icon name="warning" className="w-6 h-6" />
                </div>
                <div className="flex-1">
                    <h3 className="text-sm font-black text-amber-900 uppercase tracking-widest">
                        Pending Review
                    </h3>
                    <p className="text-xs font-semibold text-amber-700/80 mt-1">
                        These transactions could not be automatically matched. Review and create
                        vouchers or link existing ones to reconcile them.
                    </p>
                </div>
                {unmatchedCount > 0 && (
                    <div className="shrink-0 flex flex-col items-center bg-amber-200/60 rounded-2xl px-4 py-2">
                        <span className="text-2xl font-black text-amber-800">{unmatchedCount}</span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-amber-700">
                            Pending
                        </span>
                    </div>
                )}
            </div>

            {/* Bank Selector */}
            <div className="bg-white rounded-[28px] p-5 border border-slate-100 shadow-sm flex items-end gap-6">
                <div className="space-y-2 min-w-[260px]">
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
                <button
                    onClick={fetchUnmatched}
                    disabled={isLoading}
                    className="h-[46px] px-6 bg-white border border-slate-200 rounded-2xl text-[11px] font-black text-slate-600 uppercase tracking-widest hover:bg-slate-50 active:scale-95 transition-all shadow-sm flex items-center gap-2"
                >
                    <Icon name="refresh" className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Table */}
            {isLoading ? (
                <div className="bg-white rounded-[32px] p-20 flex flex-col items-center justify-center border border-slate-100">
                    <div className="w-12 h-12 border-4 border-slate-100 border-t-amber-500 rounded-full animate-spin mb-4" />
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">
                        Loading unmatched transactions...
                    </p>
                </div>
            ) : transactions.length === 0 ? (
                <div className="bg-white rounded-[32px] p-20 flex flex-col items-center justify-center border border-slate-100">
                    <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mb-6">
                        <Icon name="check-circle" className="w-10 h-10 text-emerald-500" />
                    </div>
                    <h3 className="text-lg font-black text-slate-800 tracking-tight">All Clear!</h3>
                    <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest mt-2">
                        No unmatched transactions for this account
                    </p>
                </div>
            ) : (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <BankReconciliationTable
                        transactions={transactions}
                        onLink={handleLink}
                        onIgnore={handleIgnore}
                        onCreate={handleCreate}
                    />
                </div>
            )}

            {/* Create Voucher Modal */}
            <CreateVoucherModal
                isOpen={isVoucherModalOpen}
                onClose={() => { setIsVoucherModalOpen(false); setSelectedTxn(null); }}
                transaction={selectedTxn}
                ledgers={allLedgers}
                onSuccess={handleVoucherSuccess}
                onIgnore={handleIgnore}
                loading={isCreatingVoucher}
            />
        </div>
    );
};

export default UnmatchedBankTransactions;
