import React, { useState, useEffect, useMemo } from 'react';
import { showError, showSuccess } from '../../utils/toast';
import { httpClient } from '../../services/httpClient';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5003';

interface PaymentRow {
  id: string;
  payTo: string;
  amount: number;
}

interface Transaction {
  id: string;
  date: string;
  invoiceNo: string;
  amount: number;
  payNow: number;
  selected: boolean;
}

const PaymentVoucherBulk: React.FC = () => {
  // Helper function to get today's date
  function getTodayDate(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Top section state
  const [date, setDate] = useState<string>(getTodayDate());
  const [voucherNumber, setVoucherNumber] = useState<string>('Auto-generated');
  const [payFrom, setPayFrom] = useState<string>('');
  const [runningBalance, setRunningBalance] = useState<number>(0);

  // Payment grid state (left panel) - 3 rows initially
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([
    { id: '1', payTo: '', amount: 0 },
    { id: '2', payTo: '', amount: 0 },
    { id: '3', payTo: '', amount: 0 }
  ]);

  // Payment Voucher Configuration state
  const [paymentVoucherConfigs, setPaymentVoucherConfigs] = useState<any[]>([]);
  const [selectedPaymentConfig, setSelectedPaymentConfig] = useState<string>('');

  // Fetch payment voucher configurations on mount
  useEffect(() => {
    const fetchPaymentConfigs = async () => {
      try {
        const data = await httpClient.get<any[]>('/api/masters/master-voucher-payments/');
        const paymentConfigs = data || [];
        setPaymentVoucherConfigs(paymentConfigs);
        if (paymentConfigs && paymentConfigs.length === 1) {
          setSelectedPaymentConfig(paymentConfigs[0].voucher_name);
        }
      } catch (error) {
        console.error('Error fetching payment voucher configurations:', error);
        setPaymentVoucherConfigs([]);
      }
    };
    fetchPaymentConfigs();
  }, []);

  // Generate voucher number when payment configuration is selected
  useEffect(() => {
    if (selectedPaymentConfig && paymentVoucherConfigs.length > 0) {
      const config = paymentVoucherConfigs.find(c => c.voucher_name === selectedPaymentConfig);
      if (config) {
        if (config.enable_auto_numbering) {
          // Fetch the correctly formatted next number from the backend
          httpClient.get<any>(`/api/masters/master-voucher-payments/${config.id}/next-number/`)
            .then((res) => {
              setVoucherNumber(res.invoice_number || '');
            })
            .catch(() => {
              setVoucherNumber('');
            });
        } else {
          setVoucherNumber('Manual Input');
        }
      }
    } else {
      setVoucherNumber('');
    }
  }, [selectedPaymentConfig, paymentVoucherConfigs]);

  // Transaction list state (right panel)
  const [selectedVendor, setSelectedVendor] = useState<string>('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showAdvanceSection, setShowAdvanceSection] = useState<boolean>(false);

  // Advance section state
  const [advanceRefNo, setAdvanceRefNo] = useState<string>('');
  const [advanceAmount, setAdvanceAmount] = useState<number>(0);

  // Posting note
  const [postingNote, setPostingNote] = useState<string>('');

  // Ledgers state
  const [payFromLedgers, setPayFromLedgers] = useState<any[]>([]);
  const [payToOptions, setPayToOptions] = useState<any[]>([]);
  const [allLedgers, setAllLedgers] = useState<any[]>([]);

  // Filter Pay From options (Cash and Bank accounts)
  const payFromLedgers = useMemo(() => {
    return allLedgers.filter(l => {
      const group = (l.group || '').toLowerCase();
      return (
        group.includes('cash') ||
        group.includes('bank') ||
        group.includes('od') ||
        group.includes('cc')
      );
    });
  }, [allLedgers]);

  // Filter Pay To options: All ledgers (allowing transfers)
  const payToOptions = useMemo(() => {
    return allLedgers;
  }, [allLedgers]);

  // Fetch data
  useEffect(() => {
    fetchAllLedgers();
  }, []);

  const fetchAllLedgers = async () => {
    try {
      const [payFromData, payToData, allData] = await Promise.all([
        httpClient.get<any[]>('/api/ledgers/pay-from/'),
        httpClient.get<any[]>('/api/ledgers/pay-to/'),
        httpClient.get<any[]>('/api/ledgers/')
      ]);
      setPayFromLedgers(payFromData || []);
      setPayToOptions(payToData || []);
      setAllLedgers(allData || []);
    } catch (error) {
      console.error('Error fetching ledgers:', error);
    }
  };

  // Sync Running Balance for Pay From
  useEffect(() => {
    const ledger = allLedgers.find(l => l.name === payFrom);
    setRunningBalance(ledger?.balance || 0);
  }, [payFrom, allLedgers]);

  // Handle vendor selection - fetch transactions
  const handleVendorSelect = async (vendorName: string) => {
    if (!vendorName) {
      setSelectedVendor('');
      setTransactions([]);
      return;
    }

    setSelectedVendor(vendorName);

    // Mock transaction data - replace with actual API call
    const mockTransactions: Transaction[] = [
      { id: '1', date: 'xxx', invoiceNo: 'xxxxx', amount: 0, payNow: 0, selected: false },
      { id: '2', date: 'xxx', invoiceNo: 'xxxxx', amount: 0, payNow: 0, selected: false },
      { id: '3', date: 'xxx', invoiceNo: 'xxxxx', amount: 0, payNow: 0, selected: false }
    ];

    setTransactions(mockTransactions);
  };

  // Handle payment row changes
  const handlePaymentRowChange = (id: string, field: keyof PaymentRow, value: string | number) => {
    setPaymentRows(prev => prev.map(row =>
      row.id === id ? { ...row, [field]: value } : row
    ));

    if (field === 'payTo' && typeof value === 'string') {
      handleVendorSelect(value);
    }
  };

  // Handle transaction checkbox
  const handleTransactionSelect = (transactionId: string, checked: boolean) => {
    setTransactions(prev => prev.map(t =>
      t.id === transactionId ? { ...t, selected: checked } : t
    ));
  };

  // Handle pay now change
  const handlePayNowChange = (transactionId: string, value: number) => {
    setTransactions(prev => prev.map(t =>
      t.id === transactionId ? { ...t, payNow: value } : t
    ));
  };

  // Add new payment row
  const handleAddPaymentRow = () => {
    const newRow: PaymentRow = {
      id: Date.now().toString(),
      payTo: '',
      amount: 0
    };
    setPaymentRows(prev => [...prev, newRow]);
  };

  // Calculate total payment
  const totalPayment = paymentRows.reduce((sum, row) => sum + (row.amount || 0), 0);

  // Handle Cancel
  const handleCancel = () => {
    setPaymentRows([
      { id: '1', payTo: '', amount: 0 },
      { id: '2', payTo: '', amount: 0 },
      { id: '3', payTo: '', amount: 0 }
    ]);
    setTransactions([]);
    setSelectedVendor('');
    setPayFrom('');
    setRunningBalance(0);
    setPostingNote('');
    setShowAdvanceSection(false);
    setAdvanceRefNo('');
    setAdvanceAmount(0);
    setDate(getTodayDate());
  };

  // Handle Post
  const handlePost = async () => {
    const payFromId = allLedgers.find(l => l.name === payFrom)?.id;

    if (!payFromId) {
      showError('Please select Pay From account');

      return;
    }

    if (showAdvanceSection) {
      if (!advanceRefNo || advanceAmount <= 0) {
        showError('Please enter advance reference number and amount');

        return;
      }
    } else {
      if (totalPayment <= 0) {
        showError('Please enter payment amounts');

        return;
      }
    }

    // Map paymentRows to contain payTo IDs instead of names
    const mappedPaymentRows = paymentRows.map(row => {
        const rowPayToId = allLedgers.find(l => l.name === row.payTo)?.id;
        return {
            ...row,
            payTo: rowPayToId || row.payTo
        };
    });

    const payload = {
      date,
      pay_from: payFromId,
      payment_rows: mappedPaymentRows,
      total_payment: totalPayment,
      posting_note: postingNote,
      advance_ref_no: showAdvanceSection ? advanceRefNo : null,
      advance_amount: showAdvanceSection ? advanceAmount : 0
    };

    console.log('Posting payment voucher:', payload);

    try {
        const token = httpClient.getToken();
        const response = await fetch(`${API_BASE_URL}/api/vouchers/payment-bulk/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            showSuccess('Payment voucher posted successfully!');
            
            // Increment the voucher series counter so the next number is ready
            const savedConfig = paymentVoucherConfigs.find(c => c.voucher_name === selectedPaymentConfig);
            if (savedConfig && savedConfig.enable_auto_numbering) {
                try {
                    const res = await httpClient.post<any>(`/api/masters/master-voucher-payments/${savedConfig.id}/increment-number/`, {});
                    // Update local state with the next formatted number
                    setVoucherNumber(res.next_invoice_number || '');
                } catch (e) {
                    console.error('Failed to increment voucher number:', e);
                }
            }

            handleCancel();
        } else {
            const err = await response.json();
            showError(err.error || 'Failed to post payment voucher');
        }
    } catch (e) {
        console.error(e);
        showError('Failed to post payment voucher');
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Grid Layout - 2 Columns */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left Panel */}
        <div className="space-y-6">
          {/* Top Fields */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={date}
                max={getTodayDate()}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Series</label>
              <select
                value={selectedPaymentConfig}
                onChange={(e) => setSelectedPaymentConfig(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select</option>
                {paymentVoucherConfigs.map((config) => (
                  <option key={config.id} value={config.voucher_name}>
                    {config.voucher_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Number</label>
              <input
                type="text"
                value={voucherNumber}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500"
              />
            </div>
          </div>

          {/* Pay From and Running Balance */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pay from</label>
              <select
                value={payFrom}
                onChange={e => setPayFrom(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select</option>
                {payFromLedgers.map(ledger => (
                  <option key={ledger.id} value={ledger.name}>{ledger.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Running Balance</label>
              <input
                type="number"
                value={runningBalance}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500 text-right"
              />
            </div>
          </div>

          {/* Pay To and Amount Section */}
          <div className="grid grid-cols-2 gap-4">
            {/* Pay To Column */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Pay to</label>
              <div className="space-y-2">
                {paymentRows.map((row) => (
                  <select
                    key={row.id}
                    value={row.payTo}
                    onChange={e => handlePaymentRowChange(row.id, 'payTo', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  >
                    <option value="">Vendor Name</option>
                    {payToOptions.map(ledger => (
                      <option key={ledger.id} value={ledger.name}>{ledger.name}</option>
                    ))}
                  </select>
                ))}
              </div>

              {/* Add Button */}
              <button
                type="button"
                onClick={handleAddPaymentRow}
                className="mt-2 text-indigo-600 hover:text-slate-700 text-3xl font-bold leading-none"
              >
                +
              </button>
            </div>

            {/* Amount Column */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
              <div className="space-y-2">
                {paymentRows.map((row) => (
                  <input
                    key={`amount-${row.id}`}
                    type="number"
                    value={row.amount || ''}
                    onChange={e => handlePaymentRowChange(row.id, 'amount', parseFloat(e.target.value) || 0)}
                    placeholder="Pay now/Advance total"
                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Total Payment */}
          <div className="flex justify-center">
            <button
              type="button"
              className="px-8 py-2 bg-indigo-600 text-white rounded-[4px] font-medium hover:bg-indigo-700"
            >
              Total Payment
            </button>
          </div>

          {/* Posting Note */}
          <div className="bg-indigo-50/50 border-2 border-slate-200 rounded-[4px] p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Posting Note</label>
            <textarea
              value={postingNote}
              onChange={e => setPostingNote(e.target.value)}
              placeholder="Enter posting note..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none text-sm"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center gap-4">
            <button
              type="button"
              onClick={handleCancel}
              className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-[4px] hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePost}
              className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-[4px] hover:bg-indigo-700"
            >
              Post
            </button>
          </div>
        </div>

        {/* Right Panel - Transaction List */}
        <div className="bg-indigo-600 rounded-[4px] p-6">
          <div className="text-center mb-4">
            <h4 className="text-white font-semibold text-sm">
              {selectedVendor || 'Vendor Name'} (Whose data is displayed below)
            </h4>
          </div>

          {/* Transaction Table or Advance Section */}
          {!showAdvanceSection ? (
            <div className="bg-white rounded-[4px] p-4 min-h-[400px]">
              {transactions.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="border-b-2 border-gray-300">
                    <tr>
                      <th className="text-left py-2 px-2 font-semibold text-gray-700">Date</th>
                      <th className="text-left py-2 px-2 font-semibold text-gray-700">Invoice No.</th>
                      <th className="text-right py-2 px-2 font-semibold text-gray-700">Amount</th>
                      <th className="text-center py-2 px-2 font-semibold text-gray-700">Pay Now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(transaction => (
                      <tr key={transaction.id} className="border-b border-gray-200">
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={transaction.selected}
                              onChange={e => handleTransactionSelect(transaction.id, e.target.checked)}
                              className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 rounded"
                            />
                            <span>{transaction.date}</span>
                          </div>
                        </td>
                        <td className="py-3 px-2">{transaction.invoiceNo}</td>
                        <td className="py-3 px-2 text-right">{transaction.amount}</td>
                        <td className="py-3 px-2">
                          <input
                            type="number"
                            value={transaction.payNow || ''}
                            onChange={e => handlePayNowChange(transaction.id, parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex items-center justify-center h-full min-h-[350px]">
                  <p className="text-sm text-gray-500 italic text-center">
                    Select a vendor from "Pay to" dropdown<br />to view pending transactions
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Advance Section */
            <div className="bg-white rounded-[4px] p-6 min-h-[400px]">
              <h5 className="text-sm font-semibold text-gray-700 mb-4 text-center">Advance Payment</h5>
              <div className="space-y-4 max-w-md mx-auto">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 rounded"
                  />
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Advance Ref. No.</label>
                    <input
                      type="text"
                      value={advanceRefNo}
                      onChange={e => setAdvanceRefNo(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                    <input
                      type="number"
                      value={advanceAmount || ''}
                      onChange={e => setAdvanceAmount(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Advance Button */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setShowAdvanceSection(!showAdvanceSection)}
              className={`px-8 py-2 text-sm font-medium rounded-[4px] transition-colors ${showAdvanceSection
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-indigo-500'
                }`}
            >
              Advance
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentVoucherBulk;


