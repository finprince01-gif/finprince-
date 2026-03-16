import React, { useState, useEffect, useMemo } from 'react';
import Icon from './Icon';

interface VoucherType {
    id: number;
    name: string;
    prefix: string;
    next_number: number;
    padding: number;
}

interface Ledger {
    id: number;
    name: string;
    group: string;
    category: string;
    sub_group_1: string | null;
    balance?: number;
}

interface UntaggedTransaction {
    id: number;
    date: string;
    reference_number: string;
    amount: number;
    payment?: number;
}

interface PaymentVoucherEntryProps {
    onCancel?: () => void;
    onPost?: (voucherData: any) => void;
}

export const PaymentVoucherEntry: React.FC<PaymentVoucherEntryProps> = ({ onCancel, onPost }) => {
    // State Management
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [voucherTypes, setVoucherTypes] = useState<VoucherType[]>([]);
    const [selectedVoucherType, setSelectedVoucherType] = useState<number | null>(null);
    const [voucherNumber, setVoucherNumber] = useState<string>('Auto-generated');
    const [allLedgers, setAllLedgers] = useState<Ledger[]>([]);
    const [payFromLedger, setPayFromLedger] = useState<number | null>(null);
    const [payToLedger, setPayToLedger] = useState<number | null>(null);
    const [isAdvanceMode, setIsAdvanceMode] = useState<boolean>(false);
    const [transactions, setTransactions] = useState<UntaggedTransaction[]>([]);
    const [advanceAmount, setAdvanceAmount] = useState<number>(0);
    const [advanceReference, setAdvanceReference] = useState<string>('');
    const [postingNote, setPostingNote] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);

    // Fetch initial data
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [voucherTypesRes, ledgersRes] = await Promise.all([
                    fetch('http://localhost:8000/api/masters/voucher-configurations/', { credentials: 'include' }),
                    fetch('http://localhost:8000/api/masters/ledgers/', { credentials: 'include' })
                ]);

                if (voucherTypesRes.ok) {
                    const types = await voucherTypesRes.json();
                    setVoucherTypes(types);

                    // Auto-select if only one type
                    if (types.length === 1) {
                        setSelectedVoucherType(types[0].id);
                        generateVoucherNumber(types[0]);
                    }
                }

                if (ledgersRes.ok) {
                    const ledgers = await ledgersRes.json();
                    setAllLedgers(ledgers);
                }

                setLoading(false);
            } catch (error) {
                console.error('Error fetching data:');
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    // Generate voucher number
    const generateVoucherNumber = (type: VoucherType) => {
        const paddedNumber = String(type.next_number).padStart(type.padding, '0');
        setVoucherNumber(`${type.prefix}${paddedNumber}`);
    };

    // Handle voucher type change
    const handleVoucherTypeChange = (typeId: number) => {
        setSelectedVoucherType(typeId);
        const type = voucherTypes.find(t => t.id === typeId);
        if (type) {
            generateVoucherNumber(type);
        }
    };

    // Filter ledgers for "Pay From" dropdown
    const payFromLedgers = useMemo(() => {
        return allLedgers.filter(ledger =>
            ledger.sub_group_1 === 'Cash and Cash Equivalents' ||
            ledger.sub_group_1 === 'Bank OD/CC Accounts'
        );
    }, [allLedgers]);

    // Fetch untagged transactions when Pay To ledger is selected
    useEffect(() => {
        if (payToLedger && !isAdvanceMode) {
            fetchUntaggedTransactions(payToLedger);
        } else {
            setTransactions([]);
        }
    }, [payToLedger, isAdvanceMode]);

    const fetchUntaggedTransactions = async (ledgerId: number) => {
        try {
            // TODO: Replace with actual API endpoint
            const response = await fetch(`http://localhost:8000/api/vouchers/untagged-transactions/?ledger_id=${ledgerId}`, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setTransactions(data.map((t: any) => ({ ...t, payment: 0 })));
            }
        } catch (error) {
            console.error('Error fetching transactions:');
            // Mock data for development
            setTransactions([
                { id: 1, date: '2026-01-05', reference_number: 'INV-001', amount: 5000, payment: 0 },
                { id: 2, date: '2026-01-06', reference_number: 'INV-002', amount: 3500, payment: 0 },
                { id: 3, date: '2026-01-07', reference_number: 'INV-003', amount: 7200, payment: 0 }
            ]);
        }
    };

    // Handle payment field update
    const updatePayment = (transactionId: number, paymentAmount: number) => {
        setTransactions(prev =>
            prev.map(t => t.id === transactionId ? { ...t, payment: paymentAmount } : t)
        );
    };

    // Handle "Pay" button click
    const handlePayClick = (transactionId: number) => {
        const transaction = transactions.find(t => t.id === transactionId);
        if (transaction) {
            updatePayment(transactionId, transaction.amount);
        }
    };

    // Calculate total payments
    const totalPayments = useMemo(() => {
        if (isAdvanceMode) {
            return advanceAmount;
        }
        return transactions.reduce((sum, t) => sum + (t.payment || 0), 0);
    }, [transactions, isAdvanceMode, advanceAmount]);

    // Calculate updated balances
    const payFromBalance = useMemo(() => {
        const ledger = allLedgers.find(l => l.id === payFromLedger);
        return (ledger?.balance || 0) - totalPayments;
    }, [allLedgers, payFromLedger, totalPayments]);

    const payToBalance = useMemo(() => {
        const ledger = allLedgers.find(l => l.id === payToLedger);
        return (ledger?.balance || 0) + totalPayments;
    }, [allLedgers, payToLedger, totalPayments]);

    // Handle form submission
    const handlePost = () => {
        const voucherData = {
            date,
            voucher_type_id: selectedVoucherType,
            voucher_number: voucherNumber,
            pay_from: payFromLedger,
            pay_to: payToLedger,
            is_advance: isAdvanceMode,
            transactions: isAdvanceMode ? [{ reference_number: advanceReference, amount: advanceAmount }] : transactions.filter(t => t.payment && t.payment > 0),
            total_amount: totalPayments,
            posting_note: postingNote
        };

        if (onPost) {
            onPost(voucherData);
        }
    };

    if (loading) {
        return <div className="p-8 text-center">Loading...</div>;
    }

    return (
        <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                    <Icon name="receipt" size={24} />
                    Payment Voucher
                </h2>
                <div className="flex gap-2">
                    <button className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-2">
                        <Icon name="upload" size={16} />
                        Mass Upload
                    </button>
                    <button className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-600 flex items-center gap-2">
                        <Icon name="download" size={16} />
                        Import Vouchers
                    </button>
                </div>
            </div>

            {/* Voucher Type Tabs */}
            <div className="flex gap-2 mb-6 border-b border-gray-200">
                <button className="px-6 py-2 bg-indigo-600 text-white rounded-t font-medium">
                    Payment Voucher - Single
                </button>
                <button className="px-6 py-2 text-gray-600 hover:bg-gray-100 rounded-t">
                    Payment Voucher - Bulk
                </button>
            </div>

            {/* Main Form */}
            <div className="grid grid-cols-3 gap-6 mb-6">
                {/* Date Field */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>

                {/* Voucher Number */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Voucher Number</label>
                    <input
                        type="text"
                        value={voucherNumber}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-50 text-gray-600"
                    />
                </div>

                {/* Balance */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Balance</label>
                    <input
                        type="text"
                        value={payFromBalance.toFixed(2)}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-50 text-gray-600"
                    />
                </div>
            </div>

            {/* Pay From and Pay To */}
            <div className="grid grid-cols-2 gap-6 mb-6">
                {/* Pay From */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Pay from</label>
                    <select
                        value={payFromLedger || ''}
                        onChange={(e) => setPayFromLedger(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="">Select Pay from</option>
                        {payFromLedgers.map(ledger => (
                            <option key={ledger.id} value={ledger.id}>
                                {ledger.name} ({ledger.sub_group_1})
                            </option>
                        ))}
                    </select>
                </div>

                {/* Pay To */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center justify-between">
                        <span>Pay to</span>
                        <button
                            onClick={() => setIsAdvanceMode(!isAdvanceMode)}
                            className={`px-3 py-1 text-xs rounded ${isAdvanceMode ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                        >
                            Advance
                        </button>
                    </label>
                    <select
                        value={payToLedger || ''}
                        onChange={(e) => setPayToLedger(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="">Select Pay to</option>
                        {allLedgers.map(ledger => (
                            <option key={ledger.id} value={ledger.id}>
                                {ledger.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Transactions Table or Advance Mode */}
            {payToLedger && (
                <div className="mb-6 border border-gray-200 rounded-[4px] overflow-hidden">
                    {isAdvanceMode ? (
                        // Advance Mode
                        <div className="p-4 bg-gray-50">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Supplier Inv. No.
                                    </label>
                                    <input
                                        type="text"
                                        value={advanceReference}
                                        onChange={(e) => setAdvanceReference(e.target.value)}
                                        placeholder="Enter reference number"
                                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                                    <input
                                        type="number"
                                        value={advanceAmount}
                                        onChange={(e) => setAdvanceAmount(Number(e.target.value))}
                                        placeholder="0"
                                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        // Transaction List
                        <table className="w-full">
                            <thead className="bg-gray-100 border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Date</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Reference Number</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Amount</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Payment</th>
                                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                            No untagged transactions found
                                        </td>
                                    </tr>
                                ) : (
                                    transactions.map(transaction => (
                                        <tr key={transaction.id} className="border-b border-gray-100 hover:bg-gray-50">
                                            <td className="px-4 py-3 text-sm text-gray-700">
                                                {new Date(transaction.date).toLocaleDateString()}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-700">
                                                {transaction.reference_number}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-700 text-right">
                                                ₹{transaction.amount.toFixed(2)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="number"
                                                    value={transaction.payment || ''}
                                                    onChange={(e) => updatePayment(transaction.id, Number(e.target.value))}
                                                    placeholder="0"
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => handlePayClick(transaction.id)}
                                                    className="px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-600"
                                                >
                                                    Pay
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Posting Note */}
            <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Posting Note</label>
                <textarea
                    value={postingNote}
                    onChange={(e) => setPostingNote(e.target.value)}
                    placeholder="Enter posting note..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
            </div>

            {/* Total and Balances */}
            <div className="grid grid-cols-2 gap-6 mb-6 p-4 bg-indigo-50/50 rounded-[4px] border border-slate-200">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <input type="radio" checked readOnly className="text-red-500" />
                        <label className="text-sm font-medium text-gray-700">Pay</label>
                        <input type="radio" className="ml-4" />
                        <label className="text-sm font-medium text-gray-700">Pay Partially</label>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Running Balance</label>
                    <input
                        type="text"
                        value={payToBalance.toFixed(2)}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded bg-white text-gray-600"
                    />
                </div>
            </div>

            {/* Total Payments */}
            <div className="mb-6 p-4 bg-gray-100 rounded-[4px]">
                <div className="flex items-center justify-between">
                    <span className="text-lg font-semibold text-gray-800">Total Payments:</span>
                    <span className="text-2xl font-bold text-indigo-600">₹{totalPayments.toFixed(2)}</span>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-4">
                <button
                    onClick={onCancel}
                    className="px-6 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 font-medium"
                >
                    Cancel
                </button>
                <button
                    onClick={handlePost}
                    disabled={!payFromLedger || !payToLedger || totalPayments === 0}
                    className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                    Post Payment
                </button>
            </div>
        </div>
    );
};


