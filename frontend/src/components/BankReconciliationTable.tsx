import React from 'react';
import Icon from './Icon';

interface BankTransaction {
  id: number;
  transaction_date: string;
  narration?: string;
  description?: string;
  // Serializer exposes both aliases and original field names
  debit?: number;
  credit?: number;
  debit_amount?: number;
  credit_amount?: number;
  reference_number?: string;
  match_status:
    | 'UNMATCHED'
    | 'AUTO_MATCHED'
    | 'MANUAL_MATCHED'
    | 'IGNORED'
    | 'DUPLICATE'
    | 'Matched'
    | 'Matched with Charge'
    | 'Suggested'
    | 'Multi Match Suggested'
    | 'Possible Match'
    | 'Unmatched'
    | 'Ignored';
  is_ignored: boolean;
  confidence_score?: number;
  extracted_party?: string;
  suggested_party?: string;
  extracted_invoice?: string;
  bank_ledger_id?: number;
  potential_matches: Array<{
    id: number;
    voucher_number: string;
    type: string;
    date: string;
    amount: number;
    narration: string;
  }>;
}

interface BankReconciliationTableProps {
  transactions: BankTransaction[];
  onLink: (txnId: number, voucherId: number, type?: string) => void;
  onIgnore: (txnId: number) => void;
  onCreate: (txn: BankTransaction) => void;
}

const RECONCILED_STATUSES = ['Matched', 'MANUAL_MATCHED', 'AUTO_MATCHED', 'Matched with Charge'];

const BankReconciliationTable: React.FC<BankReconciliationTableProps> = ({
  transactions,
  onLink,
  onIgnore,
  onCreate,
}) => {
  const formatCurrency = (val: any) => {
    if (val === null || val === undefined) return '-';
    const num = typeof val === 'string' ? parseFloat(val) : Number(val);
    if (isNaN(num) || num === 0) return '-';
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getDebit = (txn: BankTransaction) =>
    Number(txn.debit ?? txn.debit_amount ?? 0);
  const getCredit = (txn: BankTransaction) =>
    Number(txn.credit ?? txn.credit_amount ?? 0);

  const isOpeningBalance = (txn: BankTransaction) => {
    const text = (txn.narration || txn.description || '').toLowerCase();
    return text.includes('opening balance');
  };

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-lg bg-white overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-[#f8fafc]">
          <tr>
            <th className="px-5 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest border-b border-gray-100">
              Date
            </th>
            <th className="px-5 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest border-b border-gray-100">
              Narration
            </th>
            <th className="px-5 py-4 text-right text-[11px] font-bold text-slate-500 uppercase tracking-widest border-b border-gray-100">
              Debit
            </th>
            <th className="px-5 py-4 text-right text-[11px] font-bold text-slate-500 uppercase tracking-widest border-b border-gray-100">
              Credit
            </th>
            <th className="px-5 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest border-b border-gray-100">
              Status &amp; Score
            </th>
            <th className="px-5 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest border-b border-gray-100">
              Reference
            </th>
            <th className="px-5 py-4 text-center text-[11px] font-bold text-slate-500 uppercase tracking-widest border-b border-gray-100">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {transactions.map((txn) => {
            const debit = getDebit(txn);
            const credit = getCredit(txn);
            const opening = isOpeningBalance(txn);
            const isReconciled = RECONCILED_STATUSES.includes(txn.match_status);

            return (
              <tr
                key={txn.id}
                className={`hover:bg-slate-50/50 transition-colors ${txn.is_ignored ? 'opacity-50' : ''} ${opening ? 'bg-slate-50/60' : ''}`}
              >
                {/* Date */}
                <td className="px-5 py-4 whitespace-nowrap text-sm text-slate-600 font-medium">
                  {txn.transaction_date}
                </td>

                {/* Narration */}
                <td className="px-5 py-4 text-sm text-slate-700 max-w-sm">
                  <div className="line-clamp-2" title={txn.narration || txn.description}>
                    {txn.narration || txn.description}
                  </div>
                  {opening && (
                    <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-widest rounded-full">
                      System Entry
                    </span>
                  )}
                  {!opening && txn.extracted_party && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded ring-1 ring-inset ring-indigo-100 uppercase tracking-tight">
                        Party
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium italic">
                        {txn.extracted_party}
                      </span>
                    </div>
                  )}
                </td>

                {/* Debit */}
                <td className="px-5 py-4 whitespace-nowrap text-right text-sm font-semibold text-rose-600 tracking-tight">
                  {debit > 0 ? `₹${formatCurrency(debit)}` : '-'}
                </td>

                {/* Credit */}
                <td className="px-5 py-4 whitespace-nowrap text-right text-sm font-semibold text-emerald-600 tracking-tight">
                  {credit > 0 ? `₹${formatCurrency(credit)}` : '-'}
                </td>

                {/* Status */}
                <td className="px-5 py-4 whitespace-nowrap">
                  <div className="flex flex-col gap-1.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border-2 ${
                        isReconciled
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          : ['Suggested', 'Multi Match Suggested'].includes(txn.match_status)
                          ? 'bg-blue-50 text-blue-700 border-blue-100'
                          : txn.match_status === 'Possible Match'
                          ? 'bg-amber-50 text-amber-700 border-amber-100'
                          : ['IGNORED', 'Ignored'].includes(txn.match_status)
                          ? 'bg-slate-100 text-slate-400 border-slate-200'
                          : txn.match_status === 'DUPLICATE'
                          ? 'bg-rose-50 text-rose-600 border-rose-100'
                          : 'bg-slate-50 text-slate-500 border-slate-100'
                      }`}
                    >
                      {isReconciled && <Icon name="check" className="w-3 h-3 mr-1" />}
                      {txn.match_status === 'MANUAL_MATCHED'
                        ? 'Reconciled'
                        : txn.match_status === 'AUTO_MATCHED'
                        ? 'Auto Matched'
                        : txn.match_status === 'UNMATCHED'
                        ? 'Unmatched'
                        : txn.match_status === 'IGNORED'
                        ? 'Ignored'
                        : txn.match_status === 'DUPLICATE'
                        ? 'Duplicate'
                        : txn.match_status.replace(/_/g, ' ')}
                    </span>

                    {txn.confidence_score !== undefined && txn.confidence_score > 0 && (
                      <div className="flex items-center gap-1 w-24">
                        <div className="h-1 flex-1 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              txn.confidence_score >= 80
                                ? 'bg-emerald-500'
                                : txn.confidence_score >= 50
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                            style={{ width: `${txn.confidence_score}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-slate-400">
                          {txn.confidence_score}%
                        </span>
                      </div>
                    )}
                  </div>
                </td>

                {/* Reference */}
                <td className="px-5 py-4 whitespace-nowrap text-sm text-slate-500 font-medium tracking-tight">
                  {txn.reference_number || '-'}
                </td>

                {/* Action */}
                <td className="px-5 py-4 whitespace-nowrap text-center align-middle">
                  <div className="flex items-center justify-center gap-2">
                    {isReconciled ? (
                      <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-100 shadow-sm">
                        <Icon name="check" className="w-5 h-5" />
                        <span className="text-xs font-black uppercase tracking-wider">
                          Reconciled ✓
                        </span>
                      </div>
                    ) : opening ? (
                      /* Opening balance — only ignore is allowed */
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          System Entry — Ignore only
                        </span>
                        <button
                          onClick={() => onIgnore(txn.id)}
                          className="px-3 py-1.5 text-[11px] font-black uppercase tracking-widest bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 transition-all active:scale-95"
                          title="Ignore opening balance entry"
                        >
                          Ignore
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Link Voucher dropdown */}
                        {txn.potential_matches && txn.potential_matches.length > 0 && (
                          <div className="relative inline-block group">
                            <button className="flex items-center gap-1 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-bold px-3 py-2 border border-slate-200 rounded-lg shadow-sm transition-all hover:scale-105 active:scale-95">
                              <Icon name="link" className="w-3.5 h-3.5 mr-0.5 text-slate-400" />
                              Link Voucher
                            </button>
                            <div className="absolute hidden group-hover:block right-0 bottom-full mb-2 w-80 bg-white border border-gray-200 rounded-xl shadow-2xl z-[100] animate-in fade-in slide-in-from-bottom-2 duration-200">
                              <div className="p-3 border-b border-gray-100">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                  Potential Matches Found
                                </div>
                              </div>
                              <div className="max-h-64 overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-slate-200">
                                {txn.potential_matches.map((v) => (
                                  <button
                                    key={v.id}
                                    onClick={() => onLink(txn.id, v.id, v.type)}
                                    className="w-full text-left p-3 hover:bg-indigo-50/50 rounded-lg transition-colors group/item"
                                  >
                                    <div className="flex justify-between items-start mb-1">
                                      <span className="text-sm font-bold text-slate-700 group-hover/item:text-indigo-600">
                                        {v.voucher_number}
                                      </span>
                                      <span className="text-sm font-black text-emerald-600 tracking-tight">
                                        ₹{formatCurrency(v.amount)}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                                      <div className="flex items-center gap-2">
                                        <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 group-hover/item:bg-indigo-100 group-hover/item:text-indigo-700">
                                          {v.type}
                                        </span>
                                        <span>•</span>
                                        <span>{v.date}</span>
                                      </div>
                                      <Icon name="check" className="w-4 h-4 text-emerald-500 opacity-0 group-hover/item:opacity-100 transition-opacity" />
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Create Voucher */}
                        <button
                          onClick={() => onCreate(txn)}
                          className={`flex items-center gap-1 text-[11px] font-black uppercase tracking-widest px-4 py-2 border rounded-lg shadow-sm transition-all hover:scale-105 active:scale-95 ${
                            ['Suggested', 'Multi Match Suggested'].includes(txn.match_status)
                              ? 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-700 shadow-indigo-100'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {['Suggested', 'Multi Match Suggested'].includes(txn.match_status) ? (
                            <>
                              <Icon name="edit" className="w-3.5 h-3.5 mr-0.5" />
                              Review &amp; Create
                            </>
                          ) : (
                            <>
                              <Icon name="plus" className="w-3.5 h-3.5 mr-0.5 text-slate-400" />
                              Create Voucher
                            </>
                          )}
                        </button>

                        {/* Ignore button */}
                        <button
                          onClick={() => onIgnore(txn.id)}
                          className={`p-2 rounded-lg transition-all active:scale-90 ${
                            txn.is_ignored
                              ? 'text-indigo-600 hover:bg-indigo-50'
                              : 'text-slate-300 hover:text-rose-500 hover:bg-rose-50'
                          }`}
                          title={txn.is_ignored ? 'Restore Transaction' : 'Ignore Transaction'}
                        >
                          <Icon name={txn.is_ignored ? 'refresh' : 'close'} className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}

          {transactions.length === 0 && (
            <tr>
              <td colSpan={7} className="px-5 py-16 text-center">
                <p className="text-slate-400 text-[11px] font-black uppercase tracking-widest">
                  No transactions found
                </p>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default BankReconciliationTable;
