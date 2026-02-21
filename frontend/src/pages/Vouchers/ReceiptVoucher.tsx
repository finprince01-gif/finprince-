import React, { useState, useEffect, useMemo } from 'react';
import { httpClient, apiService } from '../../services';
import { showError, showSuccess } from '../../utils/toast';


import { Ledger, ExtractedInvoiceData } from '../../types';
import SearchableSelect from '../../components/SearchableSelect';

interface PendingTransaction {
    date: string;
    referenceNumber: string;
    amount: number;
    receipt: number;
}

interface ReceiptRow {
    id: string;
    receiveFrom: string;
    amount: number;
}

interface BulkTransaction {
    id: string;
    date: string;
    invoiceNo: string;
    amount: number;
    receiveNow: number;
    selected: boolean;
}

interface ReceiptVoucherProps {
    prefilledData?: ExtractedInvoiceData | null;
    clearPrefilledData?: () => void;
    isLimitReached?: boolean;
    onLimitReached?: () => void;
}

const ReceiptVoucher: React.FC<ReceiptVoucherProps> = ({ prefilledData, clearPrefilledData, isLimitReached, onLimitReached }) => {
    // Tab state
    const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');

    // Common state
    const getCurrentDate = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [date, setDate] = useState(getCurrentDate());
    const [voucherType, setVoucherType] = useState('Receipt');
    const [voucherNumber, setVoucherNumber] = useState('');

    // "Receive In" (Debit Account - Bank/Cash) matches PayFrom (Credit Account) visually in the single form
    const [receiveIn, setReceiveIn] = useState('');
    const [receiveInBalance, setReceiveInBalance] = useState('₹0 Dr');

    // "Receive From" (Credit Account - Customer) matches PayTo (Debit Account) visually
    const [receiveFrom, setReceiveFrom] = useState('');

    const [totalReceipt, setTotalReceipt] = useState(0);

    // Ledgers state
    const [allLedgers, setAllLedgers] = useState<Ledger[]>([]);

    // Fetch ledgers on mount
    useEffect(() => {
        const fetchLedgers = async () => {
            try {
                const ledgersData = await apiService.getLedgers();
                setAllLedgers(ledgersData || []);
            } catch (error) {
                console.error('Error fetching ledgers:', error);
                showError('Failed to fetch ledgers');
            }
        };
        fetchLedgers();
    }, []);

    // Filter Receive In (Debit) options: Cash and Bank accounts
    const receiveInLedgers = useMemo(() => {
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

    // Filter Receive From (Credit) options: All ledgers EXCEPT Receive In accounts
    const receiveFromOptions = useMemo(() => {
        const receiveInIds = new Set(receiveInLedgers.map(l => l.id));
        return allLedgers.filter(l => !receiveInIds.has(l.id));
    }, [allLedgers, receiveInLedgers]);

    // Receipt Voucher Configuration state
    const [receiptVoucherConfigs, setReceiptVoucherConfigs] = useState<any[]>([]);
    const [selectedReceiptConfig, setSelectedReceiptConfig] = useState<string>('');

    // Single mode state
    const [pendingTransactions, setPendingTransactions] = useState<PendingTransaction[]>([
        { date: '31-12-2025', referenceNumber: 'Adc/005', amount: 20000.00, receipt: 0 },
        { date: '02-01-2026', referenceNumber: 'Abc/008', amount: 45000.00, receipt: 0 }
    ]);

    // Bulk mode state
    const [receiptRows, setReceiptRows] = useState<ReceiptRow[]>([
        { id: '1', receiveFrom: '', amount: 0 },
        { id: '2', receiveFrom: '', amount: 0 },
        { id: '3', receiveFrom: '', amount: 0 }
    ]);
    const [selectedCustomer, setSelectedCustomer] = useState<string>('');
    const [bulkTransactions, setBulkTransactions] = useState<BulkTransaction[]>([]);
    const [showAdvanceSection, setShowAdvanceSection] = useState<boolean>(false);
    const [advanceRefNo, setAdvanceRefNo] = useState<string>('');
    const [advanceAmount, setAdvanceAmount] = useState<number>(0);
    const [postingNote, setPostingNote] = useState<string>('');
    const [runningBalance, setRunningBalance] = useState<number>(0);

    // Single Advance state
    const [showSingleAdvanceSection, setShowSingleAdvanceSection] = useState<boolean>(false);
    const [singleAdvanceRefNo, setSingleAdvanceRefNo] = useState<string>('');
    const [singleAdvanceAmount, setSingleAdvanceAmount] = useState<number>(0);

    // Populate from AI Extraction
    useEffect(() => {
        if (prefilledData) {

            if (prefilledData.invoiceDate) {
                setDate(prefilledData.invoiceDate);
            }
            if (prefilledData.sellerName) {
                // Map to Receive From (Customer) - assuming mocked/select field. 
                // We won't force set it unless we can match ID.
            }
            if (clearPrefilledData) clearPrefilledData();
        }
    }, [prefilledData, clearPrefilledData]);

    // Fetch receipt voucher configurations on mount
    useEffect(() => {
        const fetchReceiptConfigs = async () => {
            try {

                const data = await httpClient.get<any[]>('/api/masters/voucher-configurations/?voucher_type=receipts');


                const receiptConfigs = data?.filter(config => config.voucher_type === 'receipts') || [];

                setReceiptVoucherConfigs(receiptConfigs);
                if (receiptConfigs && receiptConfigs.length === 1) {
                    setSelectedReceiptConfig(receiptConfigs[0].voucher_name);
                }
            } catch (error) {
                console.error('Error fetching receipt voucher configurations:');
                setReceiptVoucherConfigs([]);
            }
        };
        fetchReceiptConfigs();
    }, []);

    // Generate voucher number when receipt configuration is selected
    useEffect(() => {
        if (selectedReceiptConfig && receiptVoucherConfigs.length > 0) {
            const config = receiptVoucherConfigs.find(c => c.voucher_name === selectedReceiptConfig);
            if (config && config.enable_auto_numbering) {
                const paddedNum = String(config.current_number).padStart(config.required_digits, '0');
                const generatedNumber = `${config.prefix || ''}${paddedNum}${config.suffix || ''}`;
                setVoucherNumber(generatedNumber);
            } else {
                setVoucherNumber('Manual Input');
            }
        } else {
            setVoucherNumber('');
        }
    }, [selectedReceiptConfig, receiptVoucherConfigs]);

    // Single mode handlers
    const handleReceive = (index: number) => {
        const updatedTransactions = [...pendingTransactions];
        updatedTransactions[index].receipt = updatedTransactions[index].amount;
        setPendingTransactions(updatedTransactions);
        calculateTotalReceipt(updatedTransactions);
    };

    const handleReceiptChange = (index: number, value: number) => {
        const updatedTransactions = [...pendingTransactions];
        updatedTransactions[index].receipt = value;
        setPendingTransactions(updatedTransactions);
        calculateTotalReceipt(updatedTransactions);
    };

    const calculateTotalReceipt = (transactions: PendingTransaction[], advance: number = singleAdvanceAmount) => {
        const total = transactions.reduce((sum, txn) => sum + txn.receipt, 0);
        setTotalReceipt(total + advance);
    };

    // Update total when advance amount changes
    useEffect(() => {
        calculateTotalReceipt(pendingTransactions, singleAdvanceAmount);
    }, [singleAdvanceAmount]);

    // Bulk Mode: Auto-calculate Amount based on Receive Now + Advance for selected customer
    useEffect(() => {
        if (!selectedCustomer) return;

        const totalReceiveNow = bulkTransactions.reduce((sum, t) => sum + (t.receiveNow || 0), 0);
        const totalAdvance = advanceAmount || 0;
        const total = totalReceiveNow + totalAdvance;

        setReceiptRows(prev => prev.map(row =>
            row.receiveFrom === selectedCustomer ? { ...row, amount: total } : row
        ));
    }, [bulkTransactions, advanceAmount, selectedCustomer]);

    // Bulk Mode: Calculate Grand Total
    const bulkTotalReceipt = useMemo(() => {
        return receiptRows.reduce((sum, row) => sum + (row.amount || 0), 0);
    }, [receiptRows]);

    // Bulk mode handlers
    const handleReceiptRowChange = (id: string, field: keyof ReceiptRow, value: string | number) => {
        setReceiptRows(prev => prev.map(row =>
            row.id === id ? { ...row, [field]: value } : row
        ));

        if (field === 'receiveFrom' && typeof value === 'string' && value) {
            handleCustomerSelect(value);
        }
    };

    const handleCustomerSelect = async (customerName: string) => {
        setSelectedCustomer(customerName);
        if (!customerName) {
            setBulkTransactions([]);
            return;
        }

        try {
            // Determine if selected ledger is a Customer (Sundry Debtors)
            // const ledger = allLedgers.find(l => l.name === customerName);
            // const isCustomer = ledger?.group === 'Sundry Debtors';

            // Fetch transactions (Sales Invoices)
            const response = await apiService.getCustomerSalesInvoices(customerName);

            if (response && Array.isArray(response)) {
                // Map API response to BulkTransaction format
                const mappedTransactions: BulkTransaction[] = response.map((item: any) => ({
                    id: item.id?.toString() || Math.random().toString(),
                    date: item.date || getCurrentDate(),
                    invoiceNo: item.invoice_number || item.voucher_number || 'N/A',
                    // Use balance if available (pending amount), otherwise total
                    amount: typeof item.balance !== 'undefined' ? Number(item.balance) : (Number(item.total_amount) || 0),
                    receiveNow: 0,
                    selected: false
                }));

                // Filter for positive outstanding balance
                const validTransactions = mappedTransactions.filter(t => t.amount > 0);
                setBulkTransactions(validTransactions);
            } else {
                setBulkTransactions([]);
            }
        } catch (error) {
            console.error('Error fetching customer transactions:', error);
            setBulkTransactions([]);
        }
    };

    const handleAddReceiptRow = () => {
        const newRow: ReceiptRow = {
            id: Date.now().toString(),
            receiveFrom: '',
            amount: 0
        };
        setReceiptRows(prev => [...prev, newRow]);
    };

    const handleTransactionSelect = (transactionId: string, checked: boolean) => {
        setBulkTransactions(prev => prev.map(t =>
            t.id === transactionId ? { ...t, selected: checked } : t
        ));
    };

    const handleReceiveNowChange = (transactionId: string, value: number) => {
        setBulkTransactions(prev => prev.map(t =>
            t.id === transactionId ? { ...t, receiveNow: value } : t
        ));
    };

    const handleCancel = () => {
        setDate(getCurrentDate());
        setReceiveIn('');
        setReceiveFrom('');
        setPendingTransactions(pendingTransactions.map(txn => ({ ...txn, receipt: 0 })));
        setReceiptRows([
            { id: '1', receiveFrom: '', amount: 0 },
            { id: '2', receiveFrom: '', amount: 0 },
            { id: '3', receiveFrom: '', amount: 0 }
        ]);
        setBulkTransactions([]);
        setSelectedCustomer('');
        setPostingNote('');
        setShowAdvanceSection(false);
        setAdvanceRefNo('');
        setAdvanceAmount(0);
        setSingleAdvanceRefNo('');
        setSingleAdvanceAmount(0);
        setShowSingleAdvanceSection(false);
        setTotalReceipt(0);
    };

    const handlePostReceipt = async () => {
        try {
            if (activeTab === 'single') {
                const payload = {
                    date: date,
                    voucher_type: selectedReceiptConfig || voucherType,
                    voucher_number: voucherNumber,
                    receive_in: receiveIn,
                    receive_from: receiveFrom,
                    total_receipt: totalReceipt,
                    transaction_details: pendingTransactions.map(t => ({
                        ...t,
                        pending: Math.max(0, t.amount - t.receipt),
                        advance: Math.max(0, t.receipt - t.amount)
                    })),
                    advance_ref_no: singleAdvanceRefNo,
                    advance_amount: singleAdvanceAmount
                };


                const response = await httpClient.post('/api/vouchers/receipt-single/', payload);

                showSuccess('Single Receipt Voucher posted successfully!');

                handleCancel();
            } else {
                const payload = {
                    date: date,
                    voucher_number: voucherNumber,
                    receive_in: receiveIn,
                    receipt_rows: receiptRows,
                    posting_note: postingNote,
                    advance_ref_no: advanceRefNo,
                    advance_amount: advanceAmount,
                    transaction_details: bulkTransactions
                        .filter(t => t.selected || t.receiveNow > 0)
                        .map(t => ({
                            ...t,
                            pending: Math.max(0, t.amount - t.receiveNow),
                            advance: Math.max(0, t.receiveNow - t.amount)
                        }))
                };


                const response = await httpClient.post('/api/vouchers/receipt-bulk/', payload);

                showSuccess('Bulk Receipt Voucher posted successfully!');

                handleCancel();
            }
        } catch (error) {
            console.error('Error posting receipt voucher:');
            showError('Failed to post receipt voucher. Please try again.');

        }
    };

    return (
        <div className="space-y-6">
            {/* Tab Buttons */}
            <div className="flex justify-center gap-2">
                <button
                    onClick={() => setActiveTab('single')}
                    className={`px-6 py-2 text-sm font-medium rounded-[4px] transition-colors ${activeTab === 'single'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-indigo-500'
                        }`}
                >
                    Receipt Voucher - Single
                </button>
                <button
                    onClick={() => setActiveTab('bulk')}
                    className={`px-6 py-2 text-sm font-medium rounded-[4px] transition-colors ${activeTab === 'bulk'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-indigo-500'
                        }`}
                >
                    Receipt Voucher - Bulk
                </button>
            </div>

            {/* Single Tab Content */}
            {activeTab === 'single' && (
                <>
                    {/* Top Row */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                            <input
                                type="date"
                                value={date}
                                min={getCurrentDate()}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Type</label>
                            <select
                                value={selectedReceiptConfig}
                                onChange={(e) => setSelectedReceiptConfig(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">Select</option>
                                {receiptVoucherConfigs.map((config) => (
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

                    {/* Receive In and Receive From Row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Receive In</label>
                            <div className="flex gap-2">
                                <SearchableSelect
                                    value={receiveIn}
                                    onChange={(val) => setReceiveIn(val)}
                                    options={receiveInLedgers.map(l => l.name)}
                                    placeholder="Select Receive In"
                                    className="flex-1"
                                />
                                <div className="px-4 py-2 bg-gray-50 border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 min-w-[80px] text-center">
                                    {receiveInBalance}
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Receive From</label>
                            <div className="flex gap-2">
                                <SearchableSelect
                                    value={receiveFrom}
                                    onChange={(val) => setReceiveFrom(val)}
                                    options={receiveFromOptions.map(l => l.name)}
                                    placeholder="Select Receive From"
                                    className="flex-1"
                                />

                                <button
                                    onClick={() => setShowSingleAdvanceSection(!showSingleAdvanceSection)}
                                    className={`px-4 py-2 border rounded-[4px] text-sm font-medium transition-colors ${showSingleAdvanceSection
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                        }`}
                                >
                                    Advance
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Advance Receipt Section (Single) */}
                    {showSingleAdvanceSection && (
                        <div className="bg-indigo-50 border border-indigo-100 rounded-[4px] p-4 mb-4">
                            <h4 className="text-sm font-semibold text-indigo-800 mb-3">Advance Receipt Details</h4>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-indigo-700 mb-1">Reference No.</label>
                                    <input
                                        type="text"
                                        value={singleAdvanceRefNo}
                                        onChange={(e) => setSingleAdvanceRefNo(e.target.value)}
                                        className="w-full px-3 py-2 border border-indigo-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                        placeholder="Enter Reference No"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-indigo-700 mb-1">Amount</label>
                                    <input
                                        type="number"
                                        value={singleAdvanceAmount || ''}
                                        onChange={(e) => setSingleAdvanceAmount(parseFloat(e.target.value) || 0)}
                                        className="w-full px-3 py-2 border border-indigo-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Pending Transactions */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-800 mb-4">Pending Transactions</h3>
                        {receiveFrom ? (
                            <div className="border-2 border-gray-200 rounded-[4px] overflow-hidden">
                                <table className="w-full">
                                    <thead className="bg-gray-50 border-b-2 border-gray-200">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">DATE</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">REFERENCE NUMBER</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 uppercase">AMOUNT</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 uppercase">PENDING</th>
                                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase">ACTION</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 uppercase">RECEIPT</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 uppercase">ADVANCE</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {pendingTransactions.map((txn, index) => (
                                            <tr key={index} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 text-sm text-gray-700">{txn.date}</td>
                                                <td className="px-6 py-4 text-sm text-gray-700">{txn.referenceNumber}</td>
                                                <td className="px-6 py-4 text-sm text-gray-700 text-right">
                                                    ₹{txn.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-700 text-right font-medium text-red-600">
                                                    ₹{Math.max(0, txn.amount - txn.receipt).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button
                                                        onClick={() => handleReceive(index)}
                                                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-600 text-white text-xs font-medium rounded"
                                                    >
                                                        Receive
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <input
                                                        type="number"
                                                        value={txn.receipt || ''}
                                                        onChange={(e) => handleReceiptChange(index, parseFloat(e.target.value) || 0)}
                                                        placeholder="0"
                                                        className="w-24 px-3 py-1.5 text-right border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                                    />
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-700 text-right font-medium text-indigo-600">
                                                    ₹{Math.max(0, txn.receipt - txn.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className="border-t-2 border-gray-200 bg-white px-6 py-4 flex justify-end items-center gap-4">
                                    <span className="text-sm font-semibold text-gray-700">Total Receipt</span>
                                    <div className="px-4 py-2 bg-gray-50 border border-gray-300 rounded-[4px] text-sm font-bold text-gray-900 min-w-[120px] text-right">
                                        {totalReceipt}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-16 text-gray-500 border-2 border-gray-200 rounded-[4px] bg-gray-50">
                                <p className="text-sm">Please select a "Receive From" account to view pending transactions.</p>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-center gap-4">
                        <button
                            onClick={handleCancel}
                            className="px-8 py-2 bg-white hover:bg-gray-50 border-2 border-gray-300 rounded-[4px] text-gray-700 font-medium text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handlePostReceipt}
                            className="px-8 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-[4px] text-sm"
                        >
                            Post Receipt
                        </button>
                    </div>
                </>
            )
            }

            {/* Bulk Tab Content */}
            {
                activeTab === 'bulk' && (
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
                                        min={getCurrentDate()}
                                        onChange={e => setDate(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
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

                            {/* Receive In and Running Balance */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Receive In</label>
                                    <SearchableSelect
                                        value={receiveIn}
                                        onChange={(val) => setReceiveIn(val)}
                                        options={receiveInLedgers.map(l => l.name)}
                                        placeholder="Select Receive In"
                                        className="w-full"
                                    />
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

                            {/* Receive From and Amount Section */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Receive From</label>
                                    <div className="space-y-2">
                                        {receiptRows.map((row) => (
                                            <SearchableSelect
                                                key={row.id}
                                                value={row.receiveFrom}
                                                onChange={val => handleReceiptRowChange(row.id, 'receiveFrom', val)}
                                                options={receiveFromOptions.map(l => l.name)}
                                                placeholder="Select Receive From"
                                                className="w-full"
                                            />
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddReceiptRow}
                                        className="mt-2 text-indigo-600 hover:text-slate-700 text-3xl font-bold"
                                    >
                                        +
                                    </button>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                                    <div className="space-y-2">
                                        {receiptRows.map((row) => (
                                            <input
                                                key={`amount-${row.id}`}
                                                type="number"
                                                value={row.amount || ''}
                                                onChange={e => handleReceiptRowChange(row.id, 'amount', parseFloat(e.target.value) || 0)}
                                                placeholder="Receive now/Advance total"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Total Receipt */}
                            <div className="flex justify-center">
                                <button className="px-8 py-2 bg-indigo-600 text-white rounded-[4px] font-medium">
                                    Total Receipt: ₹{bulkTotalReceipt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
                                    onClick={handleCancel}
                                    className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-[4px] hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handlePostReceipt}
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
                                    {selectedCustomer || 'Customer Name'}
                                </h4>
                            </div>

                            {!showAdvanceSection ? (
                                <div className="bg-white rounded-[4px] p-4 min-h-[400px]">
                                    {bulkTransactions.length > 0 ? (
                                        <table className="w-full text-sm">
                                            <thead className="border-b-2 border-gray-300">
                                                <tr>
                                                    <th className="text-left py-2 px-2 font-semibold text-gray-700">Date</th>
                                                    <th className="text-left py-2 px-2 font-semibold text-gray-700">Invoice No.</th>
                                                    <th className="text-right py-2 px-2 font-semibold text-gray-700">Amount</th>
                                                    <th className="text-right py-2 px-2 font-semibold text-gray-700">Pending</th>
                                                    <th className="text-center py-2 px-2 font-semibold text-gray-700">Receive Now</th>
                                                    <th className="text-right py-2 px-2 font-semibold text-gray-700">Advance</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {bulkTransactions.map(transaction => (
                                                    <tr key={transaction.id} className="border-b border-gray-200">
                                                        <td className="py-3 px-2">
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={transaction.selected}
                                                                    onChange={e => handleTransactionSelect(transaction.id, e.target.checked)}
                                                                    className="w-4 h-4"
                                                                />
                                                                <span>{transaction.date}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-2">{transaction.invoiceNo}</td>
                                                        <td className="py-3 px-2 text-right">{transaction.amount}</td>
                                                        <td className="py-3 px-2 text-right text-red-600 font-medium">
                                                            {(Math.max(0, transaction.amount - transaction.receiveNow)).toFixed(2)}
                                                        </td>
                                                        <td className="py-3 px-2">
                                                            <input
                                                                type="number"
                                                                value={transaction.receiveNow || ''}
                                                                onChange={e => handleReceiveNowChange(transaction.id, parseFloat(e.target.value) || 0)}
                                                                className="w-full px-2 py-1 border border-gray-300 rounded text-center"
                                                            />
                                                        </td>
                                                        <td className="py-3 px-2 text-right text-indigo-600 font-medium">
                                                            {(Math.max(0, transaction.receiveNow - transaction.amount)).toFixed(2)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div className="flex items-center justify-center h-full min-h-[350px]">
                                            <p className="text-sm text-gray-500 italic text-center">
                                                Select a customer to view transactions
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="bg-white rounded-[4px] p-6 min-h-[400px]">
                                    <h5 className="text-sm font-semibold text-gray-700 mb-4 text-center">Advance Receipt</h5>
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <input type="checkbox" className="w-4 h-4" />
                                            <div className="flex-1">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Advance Ref. No.</label>
                                                <input
                                                    type="text"
                                                    value={advanceRefNo}
                                                    onChange={e => setAdvanceRefNo(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                                                <input
                                                    type="number"
                                                    value={advanceAmount || ''}
                                                    onChange={e => setAdvanceAmount(parseFloat(e.target.value) || 0)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 text-center">
                                <button
                                    onClick={() => setShowAdvanceSection(!showAdvanceSection)}
                                    className={`px-8 py-2 text-sm font-medium rounded-[4px] ${showAdvanceSection
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-white text-gray-700 border-2 border-gray-300'
                                        }`}
                                >
                                    Advance
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default ReceiptVoucher;


