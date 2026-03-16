import React, { useState, useEffect, useMemo } from 'react';
import { httpClient, apiService } from '../../services';
import { showError, showSuccess } from '../../utils/toast';
import { Ledger } from '../../types';
import SearchableSelect from '../../components/SearchableSelect';


import { ExtractedInvoiceData } from '../../types';

interface PendingTransaction {
    date: string;
    referenceNumber: string;
    amount: number;
    payment: number;
}

interface PaymentRow {
    id: string;
    payTo: string;
    amount: number;
}

interface BulkTransaction {
    id: string;
    date: string;
    invoiceNo: string;
    amount: number;
    payNow: number;
    selected: boolean;
}


import Icon from '../../components/Icon';

interface PaymentVoucherSingleProps {
    prefilledData?: ExtractedInvoiceData | null;
    clearPrefilledData?: () => void;
    isLimitReached?: boolean;
    onLimitReached?: () => void;
}

const PaymentVoucherSingle: React.FC<PaymentVoucherSingleProps> = ({ 
    prefilledData, 
    clearPrefilledData, 
    isLimitReached, 
    onLimitReached
}) => {
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
    const [voucherType, setVoucherType] = useState('Payment');
    const [voucherNumber, setVoucherNumber] = useState('');
    const [bankTransactionId, setBankTransactionId] = useState<number | null>(null);
    const [payFrom, setPayFrom] = useState('');
    const [payFromBalance, setPayFromBalance] = useState('₹0 Cr');
    const [payTo, setPayTo] = useState('');

    const [totalPayment, setTotalPayment] = useState(0);

    // Payment Voucher Configuration state
    const [paymentVoucherConfigs, setPaymentVoucherConfigs] = useState<any[]>([]);
    const [selectedPaymentConfig, setSelectedPaymentConfig] = useState<string>('');

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

    // Filter Pay To options: All ledgers EXCEPT those in Pay From
    const payToOptions = useMemo(() => {
        const payFromIds = new Set(payFromLedgers.map(l => l.id));
        return allLedgers.filter(l => !payFromIds.has(l.id));
    }, [allLedgers, payFromLedgers]);

    // Single mode state
    const [pendingTransactions, setPendingTransactions] = useState<PendingTransaction[]>([
        { date: '31-12-2025', referenceNumber: 'Adc/005', amount: 20000.00, payment: 0 },
        { date: '02-01-2026', referenceNumber: 'Abc/008', amount: 45000.00, payment: 0 }
    ]);

    // Bulk mode state
    const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([
        { id: '1', payTo: '', amount: 0 },
        { id: '2', payTo: '', amount: 0 },
        { id: '3', payTo: '', amount: 0 }
    ]);
    const [selectedVendor, setSelectedVendor] = useState<string>('');
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

    // Sync balances
    useEffect(() => {
        const normalized = (payFrom || '').trim().toLowerCase();
        const ledger = allLedgers.find(l => l.name.trim().toLowerCase() === normalized);
        if (ledger) {
            const bal = ledger.balance || 0;
            const sign = bal >= 0 ? 'Dr' : 'Cr';
            setPayFromBalance(`₹${Math.abs(bal).toLocaleString('en-IN', { minimumFractionDigits: 2 })} ${sign}`);
            setRunningBalance(bal);
        } else {
            setPayFromBalance('₹0 Cr');
            setRunningBalance(0);
        }
    }, [payFrom, allLedgers]);

    // Populate from AI Extraction
    useEffect(() => {
        if (prefilledData && allLedgers.length > 0) {

            // Assuming prefilledData.invoiceDate is YYYY-MM-DD
            if (prefilledData.invoiceDate) {
                setDate(prefilledData.invoiceDate);
            }
            
            // Helper to find exact ledger name from allLedgers (case-insensitive)
            const findLedgerName = (name: string) => {
                if (!name) return '';
                const normalized = name.trim().toLowerCase();
                const found = allLedgers.find(l => l.name.trim().toLowerCase() === normalized);
                return found ? found.name : '';
            };

            if (prefilledData.sellerName) {
                setPayTo(findLedgerName(prefilledData.sellerName));
            }
            if ((prefilledData as any).account) {
                setPayFrom(findLedgerName((prefilledData as any).account));
            }
            if (prefilledData.totalAmount) {
                setSingleAdvanceAmount(prefilledData.totalAmount);
                setShowSingleAdvanceSection(true);
                if (prefilledData.invoiceNumber) {
                    setSingleAdvanceRefNo(prefilledData.invoiceNumber);
                } else if ((prefilledData as any).reference_number) {
                    setSingleAdvanceRefNo((prefilledData as any).reference_number);
                }
            }
            if ((prefilledData as any).narration) {
                setPostingNote((prefilledData as any).narration);
            }
            if ((prefilledData as any).bank_transaction_id) {
                setBankTransactionId((prefilledData as any).bank_transaction_id);
            }
            if (clearPrefilledData) clearPrefilledData();
        }
    }, [prefilledData, clearPrefilledData, allLedgers]);

    // Fetch payment voucher configurations on mount
    useEffect(() => {
        const fetchPaymentConfigs = async () => {
            try {

                const data = await httpClient.get<any[]>('/api/masters/voucher-configurations/?voucher_type=payments');


                const paymentConfigs = data?.filter(config => config.voucher_type === 'payments') || [];


                setPaymentVoucherConfigs(paymentConfigs);
                if (paymentConfigs && paymentConfigs.length === 1) {
                    setSelectedPaymentConfig(paymentConfigs[0].voucher_name);
                }
            } catch (error) {
                console.error('Error fetching payment voucher configurations:');
                setPaymentVoucherConfigs([]);
            }
        };
        fetchPaymentConfigs();
    }, []);

    // Generate voucher number when payment configuration is selected
    useEffect(() => {
        if (selectedPaymentConfig && paymentVoucherConfigs.length > 0) {
            const config = paymentVoucherConfigs.find(c => c.voucher_name === selectedPaymentConfig);
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
    }, [selectedPaymentConfig, paymentVoucherConfigs]);

    // Single mode handlers
    const handlePay = (index: number) => {
        const updatedTransactions = [...pendingTransactions];
        updatedTransactions[index].payment = updatedTransactions[index].amount;
        setPendingTransactions(updatedTransactions);
        calculateTotalPayment(updatedTransactions);
    };

    const handlePaymentChange = (index: number, value: number) => {
        const updatedTransactions = [...pendingTransactions];
        updatedTransactions[index].payment = value;
        setPendingTransactions(updatedTransactions);
        calculateTotalPayment(updatedTransactions);
    };

    const calculateTotalPayment = (transactions: PendingTransaction[], advance: number = singleAdvanceAmount) => {
        const total = transactions.reduce((sum, txn) => sum + txn.payment, 0);
        setTotalPayment(total + advance);
    };

    // Update total when advance amount changes
    useEffect(() => {
        calculateTotalPayment(pendingTransactions, singleAdvanceAmount);
    }, [singleAdvanceAmount]);

    // Bulk Mode: Auto-calculate Amount based on Pay Now + Advance for selected vendor
    useEffect(() => {
        if (!selectedVendor) return;

        const totalPayNow = bulkTransactions.reduce((sum, t) => sum + (t.payNow || 0), 0);
        const totalAdvance = advanceAmount || 0;
        const total = totalPayNow + totalAdvance;

        setPaymentRows(prev => prev.map(row =>
            row.payTo === selectedVendor ? { ...row, amount: total } : row
        ));
    }, [bulkTransactions, advanceAmount, selectedVendor]);

    // Bulk Mode: Calculate Grand Total
    const bulkTotalPayment = useMemo(() => {
        return paymentRows.reduce((sum, row) => sum + (row.amount || 0), 0);
    }, [paymentRows]);

    // Bulk mode handlers
    const handlePaymentRowChange = (id: string, field: keyof PaymentRow, value: string | number) => {
        setPaymentRows(prev => prev.map(row =>
            row.id === id ? { ...row, [field]: value } : row
        ));

        if (field === 'payTo' && typeof value === 'string' && value) {
            handleVendorSelect(value);
        }
    };

    const handleVendorSelect = async (vendorName: string) => {
        setSelectedVendor(vendorName);
        if (!vendorName) {
            setBulkTransactions([]);
            return;
        }

        try {
            // Determine if selected ledger is a Vendor
            const ledger = allLedgers.find(l => l.name === vendorName);
            const isVendor = ledger?.group === 'Sundry Creditors';

            // Fetch transactions using the available endpoint
            // Note: For Vendors this fetches Supplier Invoices. 
            // For others, we assume the same endpoint can return relevant credit transactions 
            // or we would need a dedicated 'getLedgerOutstanding' endpoint.
            const response = await apiService.getVendorPurchaseInvoices(vendorName);

            if (response && Array.isArray(response)) {
                // Map API response to BulkTransaction format
                const mappedTransactions: BulkTransaction[] = response.map((item: any) => ({
                    id: item.id?.toString() || Math.random().toString(),
                    date: item.date || getCurrentDate(),
                    invoiceNo: item.invoice_number || item.voucher_number || 'N/A',
                    // Use balance if available (pending amount), otherwise total
                    amount: typeof item.balance !== 'undefined' ? Number(item.balance) : (Number(item.total_amount) || 0),
                    payNow: 0,
                    selected: false
                }));

                // Filter logic based on requirements:
                // 1. If Vendor: Display "Pending" invoices (Balance > 0 implies pending/partial)
                // 2. If Other: Display "credit transactions not tagged" (Balance > 0)
                // We filter for positive outstanding balance.
                const validTransactions = mappedTransactions.filter(t => t.amount > 0);

                setBulkTransactions(validTransactions);
            } else {
                setBulkTransactions([]);
            }
        } catch (error) {
            console.error('Error fetching transactions:', error);
            setBulkTransactions([]);
        }
    };

    const handleAddPaymentRow = () => {
        const newRow: PaymentRow = {
            id: Date.now().toString(),
            payTo: '',
            amount: 0
        };
        setPaymentRows(prev => [...prev, newRow]);
    };

    const handleTransactionSelect = (transactionId: string, checked: boolean) => {
        setBulkTransactions(prev => prev.map(t =>
            t.id === transactionId ? { ...t, selected: checked } : t
        ));
    };

    const handlePayNowChange = (transactionId: string, value: number) => {
        setBulkTransactions(prev => prev.map(t =>
            t.id === transactionId ? { ...t, payNow: value } : t
        ));
    };

    const handleCancel = () => {
        setDate(getCurrentDate());
        setPayFrom('');
        setPayFromBalance('₹0 Cr');
        setRunningBalance(0);
        setPayTo('');
        setPendingTransactions(pendingTransactions.map(txn => ({ ...txn, payment: 0 })));
        setPaymentRows([
            { id: '1', payTo: '', amount: 0 },
            { id: '2', payTo: '', amount: 0 },
            { id: '3', payTo: '', amount: 0 }
        ]);
        setBulkTransactions([]);
        setSelectedVendor('');
        setPostingNote('');
        setShowAdvanceSection(false);
        setAdvanceRefNo('');
        setAdvanceAmount(0);
        setSingleAdvanceRefNo('');
        setSingleAdvanceAmount(0);
        setShowSingleAdvanceSection(false);
        setTotalPayment(0);
    };

    const handlePostPayment = async () => {
        try {
            const findLedgerId = (name: string) => {
                if (!name) return null;
                const normalized = name.trim().toLowerCase();
                return allLedgers.find(l => l.name.trim().toLowerCase() === normalized)?.id;
            };

            const payFromId = findLedgerId(payFrom);
            const payToId = findLedgerId(payTo);

            if (activeTab === 'single') {
                if (!payFromId) {
                    showError(`'Pay From' account '${payFrom || 'None'}' is invalid or not selected. Please select from the dropdown.`);
                    return;
                }
                if (!payToId) {
                    showError(`'Pay To' account '${payTo || 'None'}' is invalid or not selected. Please select from the dropdown.`);
                    return;
                }

                const payload = {
                    date: date,
                    voucher_type: selectedPaymentConfig || voucherType,
                    voucher_number: voucherNumber,
                    pay_from: payFromId,
                    pay_to: payToId,
                    total_payment: totalPayment,
                    transaction_details: pendingTransactions.map(t => ({
                        ...t,
                        pending: Math.max(0, t.amount - t.payment),
                        advance: Math.max(0, t.payment - t.amount)
                    })),
                    advance_ref_no: singleAdvanceRefNo,
                    advance_amount: singleAdvanceAmount,
                    bank_transaction_id: bankTransactionId
                };

                await httpClient.post('/api/vouchers/payment-single/', payload);
                showSuccess('Single Payment Voucher posted successfully!');
                handleCancel();
            } else {
                if (!payFromId) {
                    showError('Please select a Pay From account.');
                    return;
                }
                
                // Map paymentRows to contain payTo IDs instead of names
                const mappedPaymentRows = paymentRows.map(row => {
                    const normalized = (row.payTo || '').trim().toLowerCase();
                    const rowPayToId = allLedgers.find(l => l.name.trim().toLowerCase() === normalized)?.id;
                    return {
                        ...row,
                        payTo: rowPayToId || row.payTo
                    };
                });

                const payload = {
                    date: date,
                    voucher_number: voucherNumber,
                    pay_from: payFromId,
                    payment_rows: mappedPaymentRows,
                    posting_note: postingNote,
                    advance_ref_no: advanceRefNo,
                    advance_amount: advanceAmount,
                    transaction_details: bulkTransactions
                        .filter(t => t.selected || t.payNow > 0)
                        .map(t => ({
                            ...t,
                            pending: Math.max(0, t.amount - t.payNow),
                            advance: Math.max(0, t.payNow - t.amount)
                        }))
                };


                const response = await httpClient.post('/api/vouchers/payment-bulk/', payload);

                showSuccess('Bulk Payment Voucher posted successfully!');

                handleCancel();
            }
        } catch (error) {
            console.error('Error posting payment voucher:');
            showError('Failed to post payment voucher. Please try again.');

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
                    Payment Voucher - Single
                </button>
                <button
                    onClick={() => setActiveTab('bulk')}
                    className={`px-6 py-2 text-sm font-medium rounded-[4px] transition-colors ${activeTab === 'bulk'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-indigo-500'
                        }`}
                >
                    Payment Voucher - Bulk
                </button>
            </div>

            {/* Single Tab Content */}
            {activeTab === 'single' && (
                <>
                    {/* Top Row: Date, Voucher Type, Voucher Number */}
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

                    {/* Pay From and Pay To Row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Pay From</label>
                            <div className="flex gap-2">
                                <SearchableSelect
                                    value={payFrom}
                                    onChange={(val) => setPayFrom(val)}
                                    options={payFromLedgers.map(l => l.name)}
                                    placeholder="Select Pay From"
                                    className="flex-1"
                                />
                                <div className="px-4 py-2 bg-gray-50 border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 min-w-[80px] text-center">
                                    {payFromBalance}
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Pay To</label>
                            <div className="flex gap-2">
                                <SearchableSelect
                                    value={payTo}
                                    onChange={(val) => setPayTo(val)}
                                    options={payToOptions.map(l => l.name)}
                                    placeholder="Select Pay To"
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

                    {/* Advance Payment Section (Single) */}
                    {showSingleAdvanceSection && (
                        <div className="bg-indigo-50 border border-indigo-100 rounded-[4px] p-4 mb-4">
                            <h4 className="text-sm font-semibold text-indigo-800 mb-3">Advance Payment Details</h4>
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
                        <div className="flex justify-between items-end mb-4">
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                                    Pending Transactions
                                </h3>
                            </div>
                        </div>

                        {payTo ? (
                            <div className="border-2 border-gray-200 rounded-[4px] overflow-hidden">
                                <table className="w-full">
                                    <thead className="bg-gray-50 border-b-2 border-gray-200">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">DATE</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">REFERENCE NUMBER</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 uppercase">AMOUNT</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 uppercase">PENDING</th>
                                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase">ACTION</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 uppercase">PAYMENT</th>
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
                                                    ₹{Math.max(0, txn.amount - txn.payment).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button
                                                        onClick={() => handlePay(index)}
                                                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-600 text-white text-xs font-medium rounded"
                                                    >
                                                        Pay
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <input
                                                        type="number"
                                                        value={txn.payment || ''}
                                                        onChange={(e) => handlePaymentChange(index, parseFloat(e.target.value) || 0)}
                                                        placeholder="0"
                                                        className="w-24 px-3 py-1.5 text-right border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                                    />
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-700 text-right font-medium text-indigo-600">
                                                    ₹{Math.max(0, txn.payment - txn.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className="border-t-2 border-gray-200 bg-white px-6 py-4 flex justify-end items-center gap-4">
                                    <span className="text-sm font-semibold text-gray-700">Total Payment</span>
                                    <div className="px-4 py-2 bg-gray-50 border border-gray-300 rounded-[4px] text-sm font-bold text-gray-900 min-w-[120px] text-right">
                                        ₹{totalPayment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-16 text-gray-500 border-2 border-gray-200 rounded-[4px] bg-gray-50">
                                <p className="text-sm">Please select a "Pay To" account to view pending transactions.</p>
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
                            onClick={handlePostPayment}
                            className="px-8 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-[4px] text-sm"
                        >
                            Post Payment
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

                            {/* Pay From and Running Balance */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Pay from</label>
                                    <SearchableSelect
                                        value={payFrom}
                                        onChange={(val) => setPayFrom(val)}
                                        options={payFromLedgers.map(l => l.name)}
                                        placeholder="Select Pay From"
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

                            {/* Pay To and Amount Section */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Pay to</label>
                                    <div className="space-y-2">
                                        {paymentRows.map((row) => (
                                            <SearchableSelect
                                                key={row.id}
                                                value={row.payTo}
                                                onChange={val => handlePaymentRowChange(row.id, 'payTo', val)}
                                                options={payToOptions.map(l => l.name)}
                                                placeholder="Select Pay To"
                                                className="w-full"
                                            />
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddPaymentRow}
                                        className="mt-2 text-indigo-600 hover:text-slate-700 text-3xl font-bold"
                                    >
                                        +
                                    </button>
                                </div>

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
                                <button className="px-8 py-2 bg-indigo-600 text-white rounded-[4px] font-medium">
                                    Total Payment: ₹{bulkTotalPayment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
                                    onClick={handlePostPayment}
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
                                    {selectedVendor || 'Vendor Name'}
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
                                                    <th className="text-center py-2 px-2 font-semibold text-gray-700">Pay Now</th>
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
                                                            {(Math.max(0, transaction.amount - transaction.payNow)).toFixed(2)}
                                                        </td>
                                                        <td className="py-3 px-2">
                                                            <input
                                                                type="number"
                                                                value={transaction.payNow || ''}
                                                                onChange={e => handlePayNowChange(transaction.id, parseFloat(e.target.value) || 0)}
                                                                className="w-full px-2 py-1 border border-gray-300 rounded text-center"
                                                            />
                                                        </td>
                                                        <td className="py-3 px-2 text-right text-indigo-600 font-medium">
                                                            {(Math.max(0, transaction.payNow - transaction.amount)).toFixed(2)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div className="flex items-center justify-center h-full min-h-[350px]">
                                            <p className="text-sm text-gray-500 italic text-center">
                                                Select a vendor to view transactions
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="bg-white rounded-[4px] p-6 min-h-[400px]">
                                    <h5 className="text-sm font-semibold text-gray-700 mb-4 text-center">Advance Payment</h5>
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
        </div>
    );
};

export default PaymentVoucherSingle;


