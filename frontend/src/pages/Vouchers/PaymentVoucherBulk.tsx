import React, { useState, useEffect } from 'react';

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

  // Transaction list state (right panel)
  const [selectedVendor, setSelectedVendor] = useState<string>('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showAdvanceSection, setShowAdvanceSection] = useState<boolean>(false);

  // Advance section state
  const [advanceRefNo, setAdvanceRefNo] = useState<string>('');
  const [advanceAmount, setAdvanceAmount] = useState<number>(0);

  // Posting note
  const [postingNote, setPostingNote] = useState<string>('');

  // Ledgers
  const [cashBankLedgers, setCashBankLedgers] = useState<any[]>([]);
  const [allLedgers, setAllLedgers] = useState<any[]>([]);

  // Fetch data
  useEffect(() => {
    fetchCashBankLedgers();
    fetchAllLedgers();
  }, []);

  const fetchCashBankLedgers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/ledgers/cash-bank/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setCashBankLedgers(data);
      }
    } catch (error) {
      console.error('Error fetching cash/bank ledgers:', error);
    }
  };

  const fetchAllLedgers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/ledgers/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAllLedgers(data);
      }
    } catch (error) {
      console.error('Error fetching ledgers:', error);
    }
  };

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
    setPostingNote('');
    setShowAdvanceSection(false);
    setAdvanceRefNo('');
    setAdvanceAmount(0);
    setDate(getTodayDate());
  };

  // Handle Post
  const handlePost = () => {
    if (!payFrom) {
      alert('Please select Pay From account');
      return;
    }

    if (showAdvanceSection) {
      if (!advanceRefNo || advanceAmount <= 0) {
        alert('Please enter advance reference number and amount');
        return;
      }
    } else {
      if (totalPayment <= 0) {
        alert('Please enter payment amounts');
        return;
      }
    }

    console.log('Posting payment voucher:', {
      date,
      payFrom,
      paymentRows,
      totalPayment,
      postingNote,
      advance: showAdvanceSection ? { refNo: advanceRefNo, amount: advanceAmount } : null
    });

    alert('Payment voucher posted successfully!');
    handleCancel();
  };

  return (
    <div className="space-y-6">
      {/* Main Grid Layout - 2 Columns */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left Panel */}
        <div className="space-y-6">
          {/* Top Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Number</label>
              <input
                type="text"
                value={voucherNumber}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Select</option>
                {cashBankLedgers.map(ledger => (
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 text-right"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                  >
                    <option value="">Vendor Name</option>
                    {allLedgers.map(ledger => (
                      <option key={ledger.id} value={ledger.name}>{ledger.name}</option>
                    ))}
                  </select>
                ))}
              </div>

              {/* Add Button */}
              <button
                type="button"
                onClick={handleAddPaymentRow}
                className="mt-2 text-orange-600 hover:text-orange-700 text-3xl font-bold leading-none"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Total Payment */}
          <div className="flex justify-center">
            <button
              type="button"
              className="px-8 py-2 bg-orange-600 text-white rounded-md font-medium hover:bg-orange-700"
            >
              Total Payment
            </button>
          </div>

          {/* Posting Note */}
          <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Posting Note</label>
            <textarea
              value={postingNote}
              onChange={e => setPostingNote(e.target.value)}
              placeholder="Enter posting note..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none text-sm"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center gap-4">
            <button
              type="button"
              onClick={handleCancel}
              className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePost}
              className="px-6 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700"
            >
              Post
            </button>
          </div>
        </div>

        {/* Right Panel - Transaction List */}
        <div className="bg-blue-500 rounded-lg p-6">
          <div className="text-center mb-4">
            <h4 className="text-white font-semibold text-sm">
              {selectedVendor || 'Vendor Name'} (Whose data is displayed below)
            </h4>
          </div>

          {/* Transaction Table or Advance Section */}
          {!showAdvanceSection ? (
            <div className="bg-white rounded-lg p-4 min-h-[400px]">
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
                              className="w-4 h-4 text-orange-600 focus:ring-orange-500 rounded"
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
                            className="w-full px-2 py-1 border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-orange-500"
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
            <div className="bg-white rounded-lg p-6 min-h-[400px]">
              <h5 className="text-sm font-semibold text-gray-700 mb-4 text-center">Advance Payment</h5>
              <div className="space-y-4 max-w-md mx-auto">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-orange-600 focus:ring-orange-500 rounded"
                  />
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Advance Ref. No.</label>
                    <input
                      type="text"
                      value={advanceRefNo}
                      onChange={e => setAdvanceRefNo(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                    <input
                      type="number"
                      value={advanceAmount || ''}
                      onChange={e => setAdvanceAmount(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
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
              className={`px-8 py-2 text-sm font-medium rounded-lg transition-colors ${showAdvanceSection
                ? 'bg-orange-600 text-white hover:bg-orange-700'
                : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-orange-500'
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
