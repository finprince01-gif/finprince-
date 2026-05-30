/**
 * BankAllocationPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Right-side slide panel that opens when a party is selected in BankUpload.
 * Shows EXACTLY the same pending-transactions + advance UI as
 * PaymentVoucherSingle (single mode) and ReceiptVoucher.
 *
 * Props:
 *  - row            : the StagingRow being allocated
 *  - voucherType    : 'payment' | 'receipt'
 *  - partyOption    : the resolved party (name, ledger_id, type)
 *  - savedState     : any previously saved allocation for this row
 *  - onClose        : close panel without saving
 *  - onSave         : persist allocation state back to BankUpload
 */

import React, { useState, useEffect, useRef } from 'react';
import { httpClient, apiService } from '../../services';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PendingTransaction {
  id?: number | string;
  date: string;
  referenceNumber: string;
  amount: number;
  payment: number;
  postingNote?: string;
  dueStatus?: string;
  dueDate?: string;
  daysToDue?: number;
}

export interface AllocationState {
  pendingTransactions: PendingTransaction[];
  advanceAmount: number;
  advanceRefNo: string;
  showAdvance: boolean;
  availableAdvances: any[];
  totalAllocated: number;
}

interface StagingRow {
  id: number;
  narration: string;
  amount: string;
  date: string;
  ledger_name: string;
  ledger_id: number | null;
  inferred_type: 'payment' | 'receipt';
}

interface PartyOptionLike {
  label: string;
  value: string;
  ledger_id: number | string | null;
  id: number | string | null;
  name: string;
  type?: 'vendor' | 'customer' | 'ledger';
  category?: 'vendor' | 'customer';
}

interface BankAllocationPanelProps {
  row: StagingRow;
  voucherType: 'payment' | 'receipt';
  partyOption: PartyOptionLike;
  savedState?: AllocationState | null;
  onClose: (isCancel?: boolean) => void;
  onSave: (rowId: number, state: AllocationState) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
const BankAllocationPanel: React.FC<BankAllocationPanelProps> = ({
  row, voucherType, partyOption, savedState, onClose, onSave
}) => {
  const rowAmount = parseFloat(row.amount || '0');
  const actionLabel      = voucherType === 'payment' ? 'Pay' : 'Receive';
  const totalLabel       = voucherType === 'payment' ? 'Total Payment' : 'Total Receipt';
  const actionFieldLabel = voucherType === 'payment' ? 'PAYMENT' : 'RECEIPT';

  const [pendingTransactions, setPendingTransactions] = useState<PendingTransaction[]>([]);
  const [availableAdvances, setAvailableAdvances]     = useState<any[]>([]);
  const [advanceAmount, setAdvanceAmount]             = useState(0);
  const [advanceRefNo, setAdvanceRefNo]               = useState('');
  const [showAdvance, setShowAdvance]                 = useState(false);
  const [loading, setLoading]                         = useState(true);  // always starts loading

  const uniquenessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [invalidRefNos, setInvalidRefNos]             = useState<Set<string>>(new Set());

  // ── Load pending transactions + advances ─────────────────────────────────
  // Re-runs whenever the party changes (partyOption.id / type change)
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Reset existing data when party changes
      setPendingTransactions([]);
      setAvailableAdvances([]);
      setAdvanceAmount(0);
      setAdvanceRefNo('');
      setShowAdvance(false);

      // If there's a saved state for this exact party, restore it instead of re-fetching
      if (savedState && savedState.pendingTransactions) {
        setPendingTransactions(savedState.pendingTransactions);
        setAvailableAdvances(savedState.availableAdvances || []);
        setAdvanceAmount(savedState.advanceAmount || 0);
        setAdvanceRefNo(savedState.advanceRefNo || '');
        setShowAdvance(savedState.showAdvance || false);
        setLoading(false);
        return;
      }

      try {
        const ledgerId = partyOption.ledger_id ? Number(partyOption.ledger_id) : null;
        const today    = new Date();
        let txns: PendingTransaction[] = [];

        // Fetch pending expenses first so we can merge them regardless of type
        let mappedExpenses: PendingTransaction[] = [];
        if (ledgerId) {
          try {
            const expenseData = await apiService.getPendingInvoices(ledgerId);
            mappedExpenses = (expenseData || [])
              .filter((item: any) => (item.type || '').toLowerCase() === 'expense')
              .map((item: any) => ({
                id: item.id || Math.random(),
                date: item.date,
                referenceNumber: item.reference_number,
                amount: Number(item.amount) || 0,
                payment: 0,
                postingNote: '',
                dueStatus: item.due_status || 'Due',
                dueDate: item.due_date,
                daysToDue: item.days_to_due,
              }));
          } catch (e) {
            console.error("Failed to fetch pending expenses in BankAllocationPanel:", e);
          }
        }

        if (partyOption.type === 'vendor') {
          // If in Receipt mode, skip vendor pending bills (only customer allowed)
          if (voucherType === 'receipt') {
             setPendingTransactions([]);
             setLoading(false);
             return;
          }

          const res: any = await httpClient.get(
            `/api/vendors/transactions/by_vendor/?vendor_id=${partyOption.id}`
          );
          const transactions = Array.isArray(res) ? res : (res.results || []);
          const mappedVendorTxns = transactions
            .filter((t: any) => {
              const type = t.transaction_type?.toLowerCase();
              const s    = (t.due_status || '').toLowerCase();
              return type === 'purchase' &&
                (s === 'due' || s === 'due today' || s === 'partially paid' || s === 'partially received');
            })
            .map((t: any) => {
              const pending = typeof t.payment_balance === 'number'
                ? t.payment_balance : Number(t.total_amount || 0);
              const statusRaw = (t.due_status || '').toString().trim().toLowerCase();
              const status = statusRaw === 'partially paid' ? 'Partially Paid'
                           : statusRaw === 'partially received' ? 'Partially Received'
                           : t.due_status;
              return {
                id: t.id,
                date: t.transaction_date,
                referenceNumber: t.reference_number || `PUR-${t.id}`,
                amount: pending,
                payment: 0,
                postingNote: '',
                dueStatus: status,
                dueDate: t.due_date,
                daysToDue: t.credit_period_days,
              };
            });

          txns = [...mappedVendorTxns, ...mappedExpenses];

        } else if (partyOption.type === 'customer') {
          // If in Payment mode, skip customer pending bills (only vendor allowed)
          if (voucherType === 'payment') {
             setPendingTransactions([]);
             setLoading(false);
             return;
          }

          const data = await apiService.getRichCustomerSalesInvoices(partyOption.name);
          const mappedCustomerTxns = data
            .map((item: any) => {
              const invDate  = new Date(item.date || '');
              const d1       = new Date(invDate.getFullYear(), invDate.getMonth(), invDate.getDate());
              const d2       = new Date(today.getFullYear(), today.getMonth(), today.getDate());
              const diffDays = Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));

              const statusRaw = (item.status || '').toString().trim().toLowerCase();
              let status = 'Not Due';
              if (statusRaw.includes('partially received') || statusRaw.includes('partially paid')) {
                status = statusRaw.includes('received') ? 'Partially Received' : 'Partially Paid';
              } else if (diffDays > 30) {
                status = 'Due';
              } else if (diffDays === 30) {
                status = 'Due Today';
              }

              return {
                id: item.id,
                date: item.date,
                referenceNumber: item.sales_invoice_no || item.invoice_number || `SAL-${item.id}`,
                amount: Number(item.payment_details?.payment_balance ?? item.payment_details?.payment_payable ?? item.total ?? 0),
                payment: 0,
                postingNote: '',
                dueStatus: status,
                daysToDue: Math.max(0, 30 - diffDays),
              };
            })
            .filter((t: any) => t.amount > 0 && t.dueStatus !== 'Not Due');

          txns = [...mappedCustomerTxns, ...mappedExpenses];

        } else if (ledgerId) {
          const data = await apiService.getPendingInvoices(ledgerId);
          txns = data
            .map((item: any) => ({
              id: item.id,
              date: item.date,
              referenceNumber: item.reference_number,
              amount: Number(item.amount) || 0,
              payment: 0,
              postingNote: '',
              dueStatus: item.due_status,
              dueDate: item.due_date,
              daysToDue: item.days_to_due,
              type: item.type,
            }))
            .filter((t: any) => {
              const s = (t.dueStatus || '').toLowerCase();
              const isExp = (t.type || '').toLowerCase() === 'expense';
              return s === 'due' || s === 'due today' || s === 'partially paid' || s === 'partially received' || isExp;
            });
        }

        setPendingTransactions(txns);

        // Load advances
        if (ledgerId) {
          const advances = await apiService.getAdvances(ledgerId, partyOption.category);
          setAvailableAdvances(advances || []);
        }

      } catch (e) {
        console.error('BankAllocationPanel: load failed', e);
      } finally {
        setLoading(false);
      }
    };

    load();
  // Re-run whenever the party OR the bank row changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [String(partyOption.id), partyOption.type, row.id]);

  // ── Allocation handlers ───────────────────────────────────────────────────
  const handlePay = (index: number) => {
    setPendingTransactions(prev => prev.map((t, i) =>
      i === index ? { ...t, payment: t.amount } : t
    ));
  };

  const handlePaymentChange = (index: number, value: number) => {
    setPendingTransactions(prev => prev.map((t, i) =>
      i === index ? { ...t, payment: value } : t
    ));
  };

  const handleTxnNoteChange = (index: number, value: string) => {
    setPendingTransactions(prev => prev.map((t, i) =>
      i === index ? { ...t, postingNote: value } : t
    ));
  };

  const totalAllocated =
    pendingTransactions.reduce((s, t) => s + (t.payment || 0), 0) + (advanceAmount || 0);

  const difference = rowAmount - totalAllocated;
  const isExactMatch = Math.abs(difference) < 0.01;
  const isOverAllocated = difference < -0.01;
  const isUnderAllocated = difference > 0.01;

  const getRowStatus = (payment: number, pending: number) => {
    if (payment === 0) return { label: 'Not Allocated', color: 'slate', status: 'NOT_ALLOCATED', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' };
    if (payment > pending + 0.01) return { label: `Over by ₹${(payment - pending).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, color: 'red', status: 'OVER', bg: 'bg-red-100', text: 'text-red-600', border: 'border-red-200' };
    if (payment < pending - 0.01) return { label: `Remaining ₹${(pending - payment).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, color: 'orange', status: 'PARTIAL', bg: 'bg-orange-100', text: 'text-orange-600', border: 'border-orange-200' };
    return { label: 'Full', color: 'green', status: 'FULL', bg: 'bg-green-100', text: 'text-green-600', border: 'border-green-200' };
  };

  const hasAnyOverAllocation = pendingTransactions.some(t => (t.payment || 0) > t.amount + 0.01);
  const canSave = isExactMatch && !hasAnyOverAllocation;

  const checkRefUniqueness = (refNo: string, isVoucherNum = false) => {
    if (!refNo.trim()) return;
    if (uniquenessTimerRef.current) clearTimeout(uniquenessTimerRef.current);
    uniquenessTimerRef.current = setTimeout(async () => {
      try {
        const typePath = voucherType === 'payment' ? 'payment' : 'receipt';
        const endpoint = isVoucherNum
          ? `/api/vouchers/${typePath}/check-uniqueness/?ref_no=${encodeURIComponent(refNo)}`
          : `/api/vouchers/${typePath}/check-uniqueness/?ref_no=${encodeURIComponent(refNo)}`; // same for now
        const data = await httpClient.get<{ is_unique: boolean }>(endpoint);
        setInvalidRefNos(prev => {
          const next = new Set(prev);
          data.is_unique ? next.delete(refNo) : next.add(refNo);
          return next;
        });
      } catch {}
    }, 500);
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!canSave) {
      if (isUnderAllocated) {
        alert(`₹${difference.toLocaleString('en-IN', { minimumFractionDigits: 2 })} still needs to be allocated`);
      } else if (hasAnyOverAllocation) {
        alert("One or more rows exceed pending amount.");
      } else if (isOverAllocated) {
        alert(`Over allocated by ₹${Math.abs(difference).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
      }
      return;
    }
    onSave(row.id, {
      pendingTransactions,
      advanceAmount,
      advanceRefNo,
      showAdvance,
      availableAdvances,
      totalAllocated,
    });
  };

  const handleAmountOnly = () => {
    onSave(row.id, {
      pendingTransactions: [],
      advanceAmount: 0,
      advanceRefNo: '',
      showAdvance: false,
      availableAdvances: [],
      totalAllocated: rowAmount,
      save_amount_only: true, // Special flag for backend
    } as any);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-white">

      {/* Header — party name + amount */}
      <div className="bg-indigo-600 px-6 py-4 shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-white font-semibold text-sm">{partyOption.label}</h4>
            <div className="text-indigo-200 text-xs mt-0.5">
              {row.date ? row.date.split('-').reverse().join('-') : '—'} · {row.narration?.slice(0, 60)}
            </div>
          </div>
          <div className="text-right">
            <div className={`text-lg font-bold ${voucherType === 'payment' ? 'text-orange-300' : 'text-green-300'}`}>
              ₹{rowAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-indigo-200 text-[10px] uppercase tracking-wider">
              {voucherType === 'payment' ? 'Payment (Dr)' : 'Receipt (Cr)'}
            </div>
          </div>
        </div>
      </div>

      {/* Allocation summary strip */}
      <div className={`border-b px-6 py-3 flex items-center justify-between shrink-0 ${isExactMatch ? 'bg-emerald-50 border-emerald-100' : isOverAllocated ? 'bg-red-50 border-red-100' : 'bg-orange-50 border-orange-100'}`}>
        <div className="flex flex-col">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${isExactMatch ? 'text-emerald-700' : isOverAllocated ? 'text-red-700' : 'text-orange-700'}`}>
            Balance Status
          </span>
          <span className={`text-xs font-black ${isExactMatch ? 'text-emerald-600' : isOverAllocated ? 'text-red-600' : 'text-orange-600'}`}>
            {isExactMatch ? '₹0.00 (Balanced)' : isUnderAllocated ? `₹${difference.toLocaleString('en-IN', { minimumFractionDigits: 2 })} remaining` : `₹${difference.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Over allocated)`}
          </span>
        </div>
        <div className="flex items-center gap-6 text-xs">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-gray-400 uppercase font-bold">Total Allocated</span>
            <span className={`font-bold text-sm ${isOverAllocated ? 'text-red-600' : isUnderAllocated ? 'text-orange-600' : 'text-emerald-600'}`}>
              ₹{totalAllocated.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="h-8 w-px bg-gray-200"></div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-gray-400 uppercase font-bold">Entered Amount</span>
            <span className="font-bold text-sm text-gray-700">
              ₹{rowAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-sm text-gray-500 animate-pulse">Loading transactions…</div>
          </div>
        ) : (
          <>
            {/* Pending Transactions Table */}
            <div className="p-4">
              <div className="flex justify-between items-end mb-3">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                  Pending Transactions
                </h3>
                <button
                  onClick={() => setShowAdvance(!showAdvance)}
                  className={`px-4 py-1.5 text-xs font-medium rounded-[4px] border transition-colors ${
                    showAdvance
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Advance
                </button>
              </div>

              {pendingTransactions.length > 0 ? (
                <div className="border-2 border-gray-200 rounded-[4px] overflow-x-auto">
                  <table className="w-full text-sm min-w-[650px]">
                    <thead className="bg-indigo-600 border-b-2 border-indigo-700 text-white">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase">DATE</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase">REFERENCE NUMBER</th>
                        <th className="px-3 py-3 text-center text-xs font-semibold uppercase">BILL STATUS</th>
                        <th className="px-3 py-3 text-center text-xs font-semibold uppercase">ALLOCATION</th>
                        <th className="px-3 py-3 text-right text-xs font-semibold uppercase">PENDING</th>
                        <th className="px-3 py-3 text-center text-xs font-semibold uppercase">ACTION</th>
                        <th className="px-3 py-3 text-right text-xs font-semibold uppercase">{actionFieldLabel}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {pendingTransactions.map((txn, index) => {
                        const status = getRowStatus(txn.payment || 0, txn.amount);
                        const isProblemRow = (isUnderAllocated && (txn.payment === 0 || txn.payment < txn.amount - 0.01)) || (isOverAllocated && txn.payment > txn.amount + 0.01);
                        
                        return (
                          <tr key={index} className={`transition-colors ${isProblemRow ? 'bg-red-50/30' : 'hover:bg-gray-50'}`}>
                            <td className="px-6 py-4 text-sm text-gray-700">{txn.date ? txn.date.split('-').reverse().join('-') : '—'}</td>
                            <td className="px-6 py-4 text-sm text-gray-700">
                              <div className="font-medium">{txn.referenceNumber}</div>
                              {txn.dueDate && (
                                <div className="text-[10px] text-gray-400">Due: {txn.dueDate}</div>
                              )}
                            </td>
                            <td className="px-3 py-4 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                txn.dueStatus === 'Due' || txn.dueStatus === 'Due Today'
                                  ? 'bg-red-100 text-red-600 border border-red-200'
                                  : (txn.dueStatus === 'Partially Received' || txn.dueStatus === 'Partially Paid')
                                    ? 'bg-orange-100 text-orange-600 border border-orange-200'
                                    : 'bg-green-100 text-green-600 border border-green-200'
                              }`}>
                                {txn.dueStatus}
                              </span>
                            </td>
                            <td className="px-3 py-4 text-center">
                              <div className={`px-2 py-1 rounded-[4px] border text-[10px] font-black uppercase tracking-tight ${status.bg} ${status.text} ${status.border}`}>
                                {status.label}
                              </div>
                            </td>
                            <td className="px-3 py-4 text-sm text-right font-medium text-red-600">
                              ₹{Math.max(0, txn.amount - txn.payment).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-4 text-center">
                              <button
                                onClick={() => handlePay(index)}
                                className="px-4 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold uppercase rounded-[4px] transition-colors shadow-sm"
                              >
                                {actionLabel}
                              </button>
                            </td>
                            <td className="px-3 py-4 text-right">
                              <input
                                type="number" onWheel={(e) => e.currentTarget.blur()}
                                value={txn.payment || ''}
                                onChange={e => handlePaymentChange(index, parseFloat(e.target.value) || 0)}
                                placeholder="0"
                                className={`w-20 px-2 py-1.5 text-right border rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold ${
                                  status.status === 'OVER' ? 'border-red-500 bg-red-50 text-red-700' : 
                                  status.status === 'PARTIAL' ? 'border-orange-300 bg-orange-50 text-orange-700' : 
                                  status.status === 'FULL' ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-300 text-gray-700'
                                }`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="border-t-2 border-gray-200 bg-white px-6 py-4 flex justify-end items-center gap-4">
                    <span className="text-sm font-semibold text-gray-700">
                      {totalLabel}
                    </span>
                    <div className="px-4 py-2 bg-gray-50 border border-gray-300 rounded-[4px] text-sm font-bold text-gray-900 min-w-[120px] text-right">
                      ₹{totalAllocated.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500 border-2 border-gray-200 rounded-[4px] bg-gray-50">
                  <p className="text-sm">No pending transactions found.</p>
                </div>
              )}
            </div>

            {/* Advance Section */}
            {showAdvance && (
              <div className="mx-4 mb-4 bg-indigo-50 border border-indigo-100 rounded-[4px] p-4">
                <h4 className="text-sm font-semibold text-indigo-800 mb-3">
                  Advance {actionLabel === 'Pay' ? 'Payment' : 'Receipt'} Details
                </h4>

                {availableAdvances.length > 0 && (
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-indigo-700 mb-2">
                      Select from existing advances:
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {availableAdvances.map((adv, idx) => (
                        <button
                          key={idx}
                          onClick={() => { setAdvanceRefNo(adv.reference_no); setAdvanceAmount(adv.amount); }}
                          className="px-3 py-1 bg-white border border-indigo-200 rounded text-xs text-indigo-600 hover:bg-indigo-100 transition-colors"
                        >
                          {adv.reference_no} (₹{adv.amount})
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-indigo-700 mb-1">Reference No.</label>
                    <input
                      type="text"
                      value={advanceRefNo}
                      onChange={(e) => { setAdvanceRefNo(e.target.value); checkRefUniqueness(e.target.value); }}
                      placeholder="Enter Reference No"
                      className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm ${
                        invalidRefNos.has(advanceRefNo) ? 'border-red-500 bg-red-50' : 'border-indigo-200'
                      }`}
                    />
                    {invalidRefNos.has(advanceRefNo) && (
                      <p className="text-[10px] text-red-500 mt-1">Reference already exists</p>
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-indigo-700 mb-1">Amount</label>
                    <input
                      type="number" onWheel={(e) => e.currentTarget.blur()}
                      value={advanceAmount || ''}
                      onChange={(e) => setAdvanceAmount(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-indigo-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 flex justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <button 
            onClick={handleAmountOnly}
            className="px-6 py-2 text-sm font-bold text-indigo-600 bg-white border-2 border-indigo-200 rounded-[4px] hover:bg-indigo-50 transition-all uppercase tracking-wider"
          >
            {actionLabel} Amount Only
          </button>
          <button 
            onClick={() => onClose(true)} 
            className="px-6 py-2 text-sm font-bold text-slate-500 bg-white border-2 border-slate-200 rounded-[4px] hover:bg-slate-50 transition-all uppercase tracking-wider"
          >
            Cancel
          </button>
        </div>
        <div className="flex items-center gap-2">
          {totalAllocated > 0 && (
            <span className="text-xs text-gray-500 mr-2">
              ₹{totalAllocated.toLocaleString('en-IN', { minimumFractionDigits: 2 })} allocated
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`px-6 py-2 text-sm font-bold text-emerald-600 bg-white border-2 border-emerald-200 rounded-[4px] hover:bg-emerald-50 transition-all uppercase tracking-wider disabled:opacity-50`}
          >
            {isExactMatch ? 'Save Allocation' : 'Complete Allocation'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BankAllocationPanel;

