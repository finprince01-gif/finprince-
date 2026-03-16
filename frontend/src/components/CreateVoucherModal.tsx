import React, { useState, useEffect, useMemo } from 'react';
import Icon from './Icon';
import SearchableSelect from './SearchableSelect';
import { Ledger } from '../types';
import { apiService } from '../services/api';

interface Transaction {
  id: number;
  transaction_date: string;
  narration?: string;
  description?: string;
  debit?: number;
  credit?: number;
  debit_amount?: number;
  credit_amount?: number;
  reference_number?: string;
  suggested_party?: string;
  extracted_party?: string;
  bank_ledger_id?: number;
}

interface CreateVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  ledgers: Ledger[];
  onSuccess: (voucherData: any) => void;
  onIgnore: (txnId: number) => void;
  loading: boolean;
}

const CreateVoucherModal: React.FC<CreateVoucherModalProps> = ({
  isOpen,
  onClose,
  transaction,
  ledgers,
  onSuccess,
  onIgnore,
  loading: externalLoading,
}) => {
  const [party, setParty] = useState('');
  const [narration, setNarration] = useState('');
  const [voucherDate, setVoucherDate] = useState('');
  const [internalLoading, setInternalLoading] = useState(false);

  // Voucher configurations state
  const [voucherConfigs, setVoucherConfigs] = useState<any[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<string>('');
  const [generatedVoucherNumber, setGeneratedVoucherNumber] = useState('');

  // Resolve debit/credit from either alias form the serializer provides
  const debitVal = Number(transaction?.debit || transaction?.debit_amount || 0);
  const creditVal = Number(transaction?.credit || transaction?.credit_amount || 0);

  const isPayment = debitVal > 0;
  const voucherType = isPayment ? 'Payment' : 'Receipt';

  // Fetch configurations based on voucher type (Payment/Receipt)
  useEffect(() => {
    if (isOpen && transaction) {
      const fetchConfigs = async () => {
        try {
          const type = isPayment ? 'payments' : 'receipts';
          const configs = await apiService.getVoucherConfigs(type);
          setVoucherConfigs(configs || []);

          if (configs && configs.length > 0) {
            // Default to first active config
            const activeConfig = configs.find((c: any) => c.is_active) || configs[0];
            setSelectedConfig(activeConfig.voucher_name);
          }
        } catch (error) {
          console.error('Error fetching voucher configurations:', error);
        }
      };
      fetchConfigs();
    }
  }, [isOpen, transaction, isPayment]);

  // Generate voucher number when configuration is selected or configs change
  useEffect(() => {
    if (selectedConfig && voucherConfigs.length > 0) {
      const config = voucherConfigs.find(c => c.voucher_name === selectedConfig);
      if (config && config.enable_auto_numbering) {
        const paddedNum = String(config.current_number).padStart(config.required_digits, '0');
        const generatedNumber = `${config.prefix || ''}${paddedNum}${config.suffix || ''}`;
        setGeneratedVoucherNumber(generatedNumber);
      } else {
        setGeneratedVoucherNumber('Manual Input');
      }
    } else {
      setGeneratedVoucherNumber('');
    }
  }, [selectedConfig, voucherConfigs]);

  useEffect(() => {
    if (transaction) {
      setParty(transaction.suggested_party || transaction.extracted_party || '');
      setNarration(transaction.narration || transaction.description || '');
      setVoucherDate(transaction.transaction_date || '');
      setInternalLoading(false);
    }
  }, [transaction]);

  if (!isOpen || !transaction) return null;

  const amount = isPayment ? debitVal : creditVal;

  // Guard: opening balance entries must not become vouchers
  const narrationText = (transaction.narration || transaction.description || '').toLowerCase();
  const isOpeningBalance = narrationText.includes('opening balance');

  // Guard: no amount
  const hasInvalidAmount = amount <= 0;

  const bankLedger = ledgers.find((l) => l.id === transaction.bank_ledger_id);
  const bankLedgerName = bankLedger ? bankLedger.name : 'Bank Account';

  const isValidParty = ledgers.some(l => l.name.trim().toLowerCase() === party.trim().toLowerCase());

  const handleSave = () => {
    if (!party || !voucherDate || isOpeningBalance || hasInvalidAmount || !isValidParty) return;
    setInternalLoading(true);
    onSuccess({
      party,
      narration,
      bank_ledger_id: transaction.bank_ledger_id,
      voucher_date: voucherDate,
      voucher_type: selectedConfig || voucherType, // Pass specific config name
    });
  };

  const handleIgnore = () => {
    setInternalLoading(true);
    onIgnore(transaction.id);
    onClose();
  };

  const loading = externalLoading || internalLoading;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />

      <div
        className="relative bg-white rounded-[32px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] w-full max-w-[480px] max-h-[90vh] flex flex-col overflow-hidden transform transition-all animate-in zoom-in-95 slide-in-from-bottom-12 duration-500 ease-out"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative top stripe */}
        <div
          className={`absolute top-0 left-0 right-0 h-32 opacity-10 pointer-events-none ${isOpeningBalance ? 'bg-slate-500' : isPayment ? 'bg-rose-500' : 'bg-emerald-500'
            }`}
          style={{ clipPath: 'polygon(0 0, 100% 0, 100% 60%, 0 100%)' }}
        />

        {/* Header */}
        <div className="relative px-8 pt-8 pb-6 flex items-start justify-between">
          <div className="flex gap-4">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${isOpeningBalance
                  ? 'bg-slate-100 text-slate-500'
                  : isPayment
                    ? 'bg-rose-50 text-rose-600'
                    : 'bg-emerald-50 text-emerald-600'
                }`}
            >
              <Icon
                name={isOpeningBalance ? 'bank' : isPayment ? 'arrow-up-right' : 'arrow-down-left'}
                className="w-7 h-7"
              />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tighter leading-none mb-1">
                {isOpeningBalance ? 'System Entry' : `Quick ${voucherType}`}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${isOpeningBalance
                      ? 'bg-slate-100 text-slate-500'
                      : isPayment
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                >
                  {isOpeningBalance ? 'Opening Balance' : voucherType}
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 border-l border-slate-200">
                  {generatedVoucherNumber || '(Auto-Generated)'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-slate-600 active:scale-90"
          >
            <Icon name="close" className="w-5 h-5" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="px-8 pb-8 space-y-6 overflow-y-auto flex-1">
          {/* Stats Card */}
          <div className="bg-slate-50 rounded-[24px] p-6 border border-slate-100 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <Icon name="bank" className="w-20 h-20" />
            </div>

            <div className="relative flex justify-between items-start">
              <div className="space-y-3 flex-1 mr-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Amount
                  </p>
                  {hasInvalidAmount ? (
                    <div className="text-sm font-black text-rose-500">
                      ⚠ Invalid bank transaction amount
                    </div>
                  ) : (
                    <div
                      className={`text-3xl font-black tracking-tighter leading-none ${isPayment ? 'text-rose-600' : 'text-emerald-600'
                        }`}
                    >
                      ₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Bank Account
                    </p>
                    <p className="text-[11px] font-black text-indigo-600 truncate max-w-[140px]">
                      {bankLedgerName}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Txn Date
                    </p>
                    <p className="text-[11px] font-bold text-slate-700">
                      {transaction.transaction_date}
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-right space-y-3">
                <div className="space-y-0.5">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    Bank Reference
                  </p>
                  <p className="text-[11px] font-black text-slate-700">
                    {transaction.reference_number || '---'}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    ID
                  </p>
                  <p className="text-[11px] font-bold text-slate-400">
                    #{transaction.id}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Opening Balance Warning — replaces the form */}
          {isOpeningBalance ? (
            <div className="bg-amber-50 border border-amber-200 rounded-[20px] p-5 flex gap-4 items-start">
              <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                <Icon name="warning" className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-black text-amber-900">Opening Balance — System Entry</p>
                <p className="text-[11px] font-semibold text-amber-700/80 mt-1">
                  This entry represents the starting balance of the bank account and cannot be
                  converted into a voucher. Please use <strong>Ignore</strong> to exclude it from reconciliation.
                </p>
              </div>
            </div>
          ) : (
            /* Input Section */
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">
                    <Icon name="calendar" className="w-3 h-3 text-indigo-400" />
                    Voucher Date
                  </label>
                  <input
                    type="date"
                    value={voucherDate}
                    onChange={(e) => setVoucherDate(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-[13px] font-bold text-slate-700 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all shadow-sm"
                  />
                </div>
                {/* Voucher Configuration Selection */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">
                    <Icon name="settings" className="w-3 h-3 text-indigo-400" />
                    Voucher Type
                  </label>
                  <select
                    value={selectedConfig}
                    onChange={(e) => setSelectedConfig(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-[13px] font-bold text-slate-700 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all shadow-sm"
                  >
                    {voucherConfigs.map((config) => (
                      <option key={config.id} value={config.voucher_name}>
                        {config.voucher_name}
                      </option>
                    ))}
                    {voucherConfigs.length === 0 && (
                      <option value={voucherType}>{voucherType}</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="flex items-center gap-2 text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    {isPayment ? 'Pay To (Party / Expense)' : 'Received From (Party / Income)'}
                  </label>
                  {(transaction.suggested_party || transaction.extracted_party) &&
                    party === (transaction.suggested_party || transaction.extracted_party) && (
                      <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase tracking-tighter animate-in fade-in zoom-in duration-300">
                        Auto Suggested
                      </span>
                    )}
                </div>
                <div className="group transition-all">
                  <SearchableSelect
                    options={ledgers.map((l) => l.name)}
                    value={party}
                    onChange={setParty}
                    placeholder="Type to search ledger..."
                    className={`w-full !rounded-2xl !border-slate-200 !py-4 transition-all focus:!ring-4 focus:!ring-indigo-500/10 focus:!border-indigo-500 shadow-sm ${!isValidParty && party ? '!border-rose-300' : ''}`}
                  />
                  {!isValidParty && party && (
                    <p className="text-[10px] font-bold text-rose-500 mt-1.5 ml-1 animate-in slide-in-from-top-1 duration-300">
                      This ledger does not exist. Please select or create a valid ledger.
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  Narration
                </label>
                <textarea
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  placeholder="Enter transaction remarks..."
                  rows={2}
                  className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl text-[13px] font-bold text-slate-700 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300 resize-none shadow-sm"
                />
              </div>

              {/* Accounting entry preview */}
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-[18px] px-5 py-4 space-y-3">
                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">
                  Reconciliation Entry Preview
                </p>
                {isPayment ? (
                  <>
                    <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-indigo-50 shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="bg-rose-100 text-rose-700 text-[10px] font-black px-2 py-1 rounded-md uppercase">Dr</span>
                        <span className="text-[12px] font-bold text-slate-700 truncate">{party || 'Expense Ledger'}</span>
                      </div>
                      <span className="text-rose-600 text-[12px] font-black">₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-indigo-50 shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-1 rounded-md uppercase">Cr</span>
                        <span className="text-[12px] font-bold text-slate-700 truncate">{bankLedgerName}</span>
                      </div>
                      <span className="text-emerald-600 text-[12px] font-black">₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-indigo-50 shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-1 rounded-md uppercase">Dr</span>
                        <span className="text-[12px] font-bold text-slate-700 truncate">{bankLedgerName}</span>
                      </div>
                      <span className="text-emerald-600 text-[12px] font-black">₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-indigo-50 shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="bg-rose-100 text-rose-700 text-[10px] font-black px-2 py-1 rounded-md uppercase">Cr</span>
                        <span className="text-[12px] font-bold text-slate-700 truncate">{party || 'Income Ledger'}</span>
                      </div>
                      <span className="text-rose-600 text-[12px] font-black">₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          {/* spacer so last item doesn't hide behind the sticky footer shadow */}
          <div className="h-2" />
        </div>

        {/* ─── Sticky action footer ─────────────────────────────────── */}
        <div className="px-8 pb-8 pt-4 border-t border-slate-100 bg-white flex flex-col gap-3 shrink-0">
          {isOpeningBalance ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={onClose}
                className="w-full py-4 rounded-[20px] text-sm font-black text-slate-600 uppercase tracking-widest bg-slate-100 hover:bg-slate-200 transition-all active:scale-95 border border-slate-200"
              >
                Skip
              </button>
              <button
                onClick={handleIgnore}
                disabled={loading}
                className="w-full py-4 rounded-[20px] text-sm font-black text-amber-600 uppercase tracking-widest bg-amber-100 hover:bg-amber-200 transition-all active:scale-95 border border-amber-200"
              >
                Ignore
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={handleSave}
                disabled={loading || !party || !voucherDate || hasInvalidAmount}
                className="w-full py-4 rounded-[20px] text-sm font-black text-white uppercase tracking-widest shadow-[0_20px_40px_-12px_rgba(0,0,0,0.1)] transform transition-all active:scale-95 flex items-center justify-center gap-3 bg-gradient-to-tr from-indigo-600 to-indigo-500 hover:from-indigo-700 hover:to-indigo-600 shadow-indigo-200 disabled:grayscale disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Icon name="check" className="w-5 h-5" />
                    Create Voucher
                  </>
                )}
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="w-full py-3.5 rounded-[18px] text-[11px] font-black text-slate-500 uppercase tracking-widest bg-slate-100 hover:bg-slate-200 transition-all active:scale-95 flex items-center justify-center gap-2 border border-slate-200"
                >
                  <Icon name="skip-forward" className="w-4 h-4" />
                  Skip
                </button>
                <button
                  onClick={handleIgnore}
                  disabled={loading}
                  className="w-full py-3.5 rounded-[18px] text-[11px] font-black text-slate-500 hover:text-rose-600 uppercase tracking-widest bg-slate-100 hover:bg-rose-50 transition-all active:scale-95 flex items-center justify-center gap-2 border border-slate-200 hover:border-rose-100"
                >
                  <Icon name="x-circle" className="w-4 h-4" />
                  Ignore
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateVoucherModal;
