import React, { useState, useMemo } from 'react';
import { X } from 'lucide-react';

interface NetoffProcessModalProps {
    isOpen: boolean;
    onClose: () => void;
    vendorName: string;
    runningBalance: number;
}

interface Voucher {
    id: string;
    type: 'Purchase' | 'Sales' | 'Payment' | 'Receipt';
    date: string;
    refNo: string;
    amount: number;
    pendingAmount: number;
    selected: boolean; // TRUE = In Dispute (Excluded from Net-off)
    netoffAmount: number;
    status: string;
}

const applyChronologicalAllocation = (currentVouchers: Voucher[]): Voucher[] => {
    const eligibleVouchers = currentVouchers.map(v => ({ ...v, netoffAmount: 0 }));

    const eligibleDebits = eligibleVouchers.filter(v => !v.selected && ['Sales', 'Payment'].includes(v.type));
    const eligibleCredits = eligibleVouchers.filter(v => !v.selected && ['Purchase', 'Receipt'].includes(v.type));
    
    const totalEligibleDebits = eligibleDebits.reduce((sum, v) => sum + v.pendingAmount, 0);
    const totalEligibleCredits = eligibleCredits.reduce((sum, v) => sum + v.pendingAmount, 0);
    
    const netoffAmount = Math.min(totalEligibleDebits, totalEligibleCredits);
    
    // Sort oldest first
    eligibleDebits.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    eligibleCredits.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let debitRemaining = netoffAmount;
    for (const v of eligibleDebits) {
        if (debitRemaining <= 0) break;
        const apply = Math.min(v.pendingAmount, debitRemaining);
        v.netoffAmount = apply;
        debitRemaining -= apply;
    }

    let creditRemaining = netoffAmount;
    for (const v of eligibleCredits) {
        if (creditRemaining <= 0) break;
        const apply = Math.min(v.pendingAmount, creditRemaining);
        v.netoffAmount = apply;
        creditRemaining -= apply;
    }

    return currentVouchers.map(v => {
        if (v.selected) return { ...v, netoffAmount: 0 };
        const allocated = [...eligibleDebits, ...eligibleCredits].find(ev => ev.id === v.id);
        return allocated ? { ...v, netoffAmount: allocated.netoffAmount } : v;
    });
};

const initialVouchers: Voucher[] = [
    { id: 'p1', type: 'Purchase', date: '2025-12-15', refNo: 'PINV-001', amount: 10000.00, pendingAmount: 10000.00, selected: false, netoffAmount: 0, status: 'Not Due' },
    { id: 'p2', type: 'Purchase', date: '2026-01-02', refNo: 'PINV-005', amount: 5000.00, pendingAmount: 2000.00, selected: false, netoffAmount: 0, status: 'Not Due' },
    { id: 'p3', type: 'Purchase', date: '2026-01-10', refNo: 'PINV-008', amount: 12000.00, pendingAmount: 12000.00, selected: false, netoffAmount: 0, status: 'Not Due' },
    { id: 's1', type: 'Sales', date: '2025-12-20', refNo: 'INV-2025-050', amount: 15000.00, pendingAmount: 15000.00, selected: false, netoffAmount: 0, status: 'Not Received' },
    { id: 's2', type: 'Sales', date: '2026-01-05', refNo: 'INV-2026-001', amount: 6000.00, pendingAmount: 6000.00, selected: false, netoffAmount: 0, status: 'Not Received' },
    { id: 'pay1', type: 'Payment', date: '2026-01-15', refNo: 'PAY-001', amount: 3000.00, pendingAmount: 3000.00, selected: false, netoffAmount: 0, status: 'Not Utilized' },
    { id: 'rec1', type: 'Receipt', date: '2026-01-18', refNo: 'REC-001', amount: 4000.00, pendingAmount: 4000.00, selected: false, netoffAmount: 0, status: 'Not Utilized' },
];

const NetoffProcessModal: React.FC<NetoffProcessModalProps> = ({ isOpen, onClose, vendorName, runningBalance }) => {
    const [activeTab, setActiveTab] = useState<'dispute' | 'netoff' | 'edit'>('dispute');
    const [vouchers, setVouchers] = useState<Voucher[]>(() => applyChronologicalAllocation(initialVouchers));
    
    const todayStr = new Date().toISOString().split('T')[0];
    const [netoffDate, setNetoffDate] = useState(todayStr);

    if (!isOpen) return null;

    const toggleSelection = (id: string, isSelected: boolean) => {
        setVouchers(prev => {
            const next = prev.map(v => v.id === id ? { ...v, selected: isSelected } : v);
            return applyChronologicalAllocation(next);
        });
    };

    const updateNetoffAmount = (id: string, val: string) => {
        // Manual override triggers
        const numVal = parseFloat(val);
        const amount = isNaN(numVal) ? 0 : numVal;
        setVouchers(prev => prev.map(v => {
            if (v.id === id) {
                return { ...v, netoffAmount: Math.min(Math.max(amount, 0), v.pendingAmount) }; 
            }
            return v;
        }));
    };

    const totalDebits = vouchers.filter(v => ['Sales', 'Payment'].includes(v.type) && !v.selected).reduce((sum, v) => sum + v.netoffAmount, 0);
    const totalCredits = vouchers.filter(v => ['Purchase', 'Receipt'].includes(v.type) && !v.selected).reduce((sum, v) => sum + v.netoffAmount, 0);

    const handleEditNext = () => {
        if (totalDebits === 0 && totalCredits === 0) {
            alert("Total debits & credits are not tallied. Please reenter the amount to tally.");
            return;
        }
        if (Math.abs(totalDebits - totalCredits) > 0.01) {
            alert("Total debits & credits are not tallied. Please reenter the amount to tally.");
            return;
        }
        setActiveTab('netoff');
    };

    const handleFinalSave = () => {
        // In reality, triggers backend mapping defined in Step 4
        onClose();
    };

    // Dispute Tab lists
    const purchaseVouchers = vouchers.filter(v => v.type === 'Purchase');
    const salesVouchers = vouchers.filter(v => v.type === 'Sales');
    const paymentVouchers = vouchers.filter(v => v.type === 'Payment');
    const receiptVouchers = vouchers.filter(v => v.type === 'Receipt');

    // Net-off Tab lists
    const nettedOffList = vouchers.filter(v => !v.selected && v.netoffAmount > 0);
    const pendingList = vouchers.filter(v => v.selected || (!v.selected && v.pendingAmount - v.netoffAmount > 0));

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
                <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={onClose} />
                <div className="relative inline-block w-full max-w-6xl p-6 overflow-hidden text-left align-middle transition-all transform bg-white rounded-lg shadow-xl outline-none">
                    {/* Header Controls */}
                    <div className="flex items-center justify-between pb-4 mb-4 border-b">
                        <h3 className="text-lg font-semibold text-gray-900">Invoices Under Dispute - Net-off</h3>
                        <button onClick={onClose} className="p-1 text-gray-400 rounded-full hover:text-gray-500 hover:bg-gray-100">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Master Inputs Header */}
                    <div className="p-4 mb-6 rounded-lg bg-gray-50 grid grid-cols-4 gap-6">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Net-off No.</label>
                            <input
                                type="text"
                                className="w-full text-sm font-medium border-0 bg-transparent p-0 focus:ring-0"
                                value="NO-2026-001"
                                readOnly
                                title="System generated appropriately"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Net-off Date</label>
                            <div className="relative">
                                <input
                                    type="date"
                                    className="w-full text-sm bg-white border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-indigo-500 transition"
                                    value={netoffDate}
                                    max={todayStr}
                                    onChange={(e) => setNetoffDate(e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Customer / Vendor Name</label>
                            <input
                                type="text"
                                className="w-full text-sm font-medium border-0 bg-transparent p-0 focus:ring-0"
                                value={vendorName || 'demo'}
                                readOnly
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Running Balance</label>
                            <span className="text-base font-bold text-indigo-600 block">
                                ₹{Math.abs(runningBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })} {runningBalance >= 0 ? 'Cr' : 'Dr'}
                            </span>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex space-x-6 border-b border-gray-200 mb-6">
                        {['dispute', 'netoff', 'edit'].map((tabItem) => (
                            <button
                                key={tabItem}
                                onClick={() => setActiveTab(tabItem as any)}
                                className={`pb-3 text-sm font-medium uppercase tracking-wide border-b-2 transition-colors ${
                                    activeTab === tabItem
                                        ? 'border-indigo-600 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                            >
                                {tabItem === 'dispute' && 'INVOICES UNDER DISPUTE'}
                                {tabItem === 'netoff' && 'NET-OFF'}
                                {tabItem === 'edit' && 'EDIT NET-OFF'}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="min-h-[400px]">
                        {activeTab === 'dispute' && (
                            <div className="space-y-6">
                                <p className="text-sm text-gray-600 font-medium">Select invoices below to classify them as "under dispute". These will be excluded from the Net-off.</p>
                                <div className="grid grid-cols-2 gap-6">
                                    {/* Purchase Vouchers */}
                                    <div className="border border-gray-200 rounded">
                                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                                            <h4 className="text-sm font-semibold text-gray-700">Purchase Vouchers</h4>
                                        </div>
                                        <div className="overflow-auto max-h-[250px]">
                                            <table className="w-full text-sm text-left">
                                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b sticky top-0 shadow-sm">
                                                    <tr>
                                                        <th className="px-4 py-2">Select</th>
                                                        <th className="px-4 py-2">Date</th>
                                                        <th className="px-4 py-2">Supplier Inv No</th>
                                                        <th className="px-4 py-2 text-right">Amount</th>
                                                        <th className="px-4 py-2 text-right">Pending Amount</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {purchaseVouchers.map(v => (
                                                        <tr key={v.id} className={`border-b last:border-0 hover:bg-gray-50 transition ${v.selected ? 'bg-red-50/50' : ''}`}>
                                                            <td className="px-4 py-2"><input type="checkbox" checked={v.selected} onChange={(e) => toggleSelection(v.id, e.target.checked)} className="rounded text-red-500 cursor-pointer" /></td>
                                                            <td className="px-4 py-2">{v.date}</td>
                                                            <td className="px-4 py-2">{v.refNo}</td>
                                                            <td className="px-4 py-2 text-right text-gray-600">₹{v.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                            <td className="px-4 py-2 text-right font-medium text-gray-900">₹{v.pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                    ))}
                                                    {purchaseVouchers.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-center text-gray-400">No data found</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    
                                    {/* Sales Vouchers */}
                                    <div className="border border-gray-200 rounded">
                                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                                            <h4 className="text-sm font-semibold text-gray-700">Sales Vouchers</h4>
                                        </div>
                                        <div className="overflow-auto max-h-[250px]">
                                            <table className="w-full text-sm text-left">
                                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b sticky top-0 shadow-sm">
                                                    <tr>
                                                        <th className="px-4 py-2">Select</th>
                                                        <th className="px-4 py-2">Date</th>
                                                        <th className="px-4 py-2">Sales Vch No</th>
                                                        <th className="px-4 py-2 text-right">Amount</th>
                                                        <th className="px-4 py-2 text-right">Pending Amount</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {salesVouchers.map(v => (
                                                        <tr key={v.id} className={`border-b last:border-0 hover:bg-gray-50 transition ${v.selected ? 'bg-red-50/50' : ''}`}>
                                                            <td className="px-4 py-2"><input type="checkbox" checked={v.selected} onChange={(e) => toggleSelection(v.id, e.target.checked)} className="rounded text-red-500 cursor-pointer" /></td>
                                                            <td className="px-4 py-2">{v.date}</td>
                                                            <td className="px-4 py-2">{v.refNo}</td>
                                                            <td className="px-4 py-2 text-right text-gray-600">₹{v.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                            <td className="px-4 py-2 text-right font-medium text-gray-900">₹{v.pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                    ))}
                                                    {salesVouchers.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-center text-gray-400">No data found</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Payment Vouchers */}
                                    <div className="border border-gray-200 rounded">
                                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                                            <h4 className="text-sm font-semibold text-gray-700">Payment Vouchers</h4>
                                        </div>
                                        <div className="overflow-auto max-h-[250px]">
                                            <table className="w-full text-sm text-left">
                                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b sticky top-0 shadow-sm">
                                                    <tr>
                                                        <th className="px-4 py-2">Select</th>
                                                        <th className="px-4 py-2">Date</th>
                                                        <th className="px-4 py-2">Payment Vch No</th>
                                                        <th className="px-4 py-2 text-right">Amount</th>
                                                        <th className="px-4 py-2 text-right">Pending Amount</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paymentVouchers.map(v => (
                                                        <tr key={v.id} className={`border-b last:border-0 hover:bg-gray-50 transition ${v.selected ? 'bg-red-50/50' : ''}`}>
                                                            <td className="px-4 py-2"><input type="checkbox" checked={v.selected} onChange={(e) => toggleSelection(v.id, e.target.checked)} className="rounded text-red-500 cursor-pointer" /></td>
                                                            <td className="px-4 py-2">{v.date}</td>
                                                            <td className="px-4 py-2">{v.refNo}</td>
                                                            <td className="px-4 py-2 text-right text-gray-600">₹{v.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                            <td className="px-4 py-2 text-right font-medium text-gray-900">₹{v.pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                    ))}
                                                    {paymentVouchers.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-center text-gray-400">No data found</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Receipt Vouchers */}
                                    <div className="border border-gray-200 rounded">
                                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                                            <h4 className="text-sm font-semibold text-gray-700">Receipt Vouchers</h4>
                                        </div>
                                        <div className="overflow-auto max-h-[250px]">
                                            <table className="w-full text-sm text-left">
                                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b sticky top-0 shadow-sm">
                                                    <tr>
                                                        <th className="px-4 py-2">Select</th>
                                                        <th className="px-4 py-2">Date</th>
                                                        <th className="px-4 py-2">Receipt Vch No</th>
                                                        <th className="px-4 py-2 text-right">Amount</th>
                                                        <th className="px-4 py-2 text-right">Pending Amount</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {receiptVouchers.map(v => (
                                                        <tr key={v.id} className={`border-b last:border-0 hover:bg-gray-50 transition ${v.selected ? 'bg-red-50/50' : ''}`}>
                                                            <td className="px-4 py-2"><input type="checkbox" checked={v.selected} onChange={(e) => toggleSelection(v.id, e.target.checked)} className="rounded text-red-500 cursor-pointer" /></td>
                                                            <td className="px-4 py-2">{v.date}</td>
                                                            <td className="px-4 py-2">{v.refNo}</td>
                                                            <td className="px-4 py-2 text-right text-gray-600">₹{v.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                            <td className="px-4 py-2 text-right font-medium text-gray-900">₹{v.pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                    ))}
                                                    {receiptVouchers.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-center text-gray-400">No data found</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-end mt-4">
                                    <button 
                                        onClick={() => setActiveTab('netoff')}
                                        className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 transition font-medium shadow-sm"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'netoff' && (
                            <div className="space-y-6">
                                <div className="flex items-center gap-4 bg-indigo-50 p-4 rounded-lg border border-indigo-100 shadow-sm">
                                    <label className="text-sm font-semibold text-indigo-900">Amount Netted-off:</label>
                                    <span className="text-2xl font-bold text-indigo-700">₹{totalDebits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    {/* List of Pending Invoices */}
                                    <div className="border border-gray-200 rounded">
                                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                                            <h4 className="text-sm font-semibold text-gray-700">List of Pending Invoices</h4>
                                        </div>
                                        <div className="overflow-auto max-h-[300px]">
                                            <table className="w-full text-sm text-left">
                                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b sticky top-0 shadow-sm">
                                                    <tr>
                                                        <th className="px-4 py-2">Vch Type</th>
                                                        <th className="px-4 py-2">Date</th>
                                                        <th className="px-4 py-2">Ref No</th>
                                                        <th className="px-4 py-2 text-right">Amount</th>
                                                        <th className="px-4 py-2 text-right">Pending</th>
                                                        <th className="px-4 py-2">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {pendingList.map(v => (
                                                        <tr key={v.id} className="border-b last:border-0 hover:bg-gray-50">
                                                            <td className="px-4 py-2">{v.type}</td>
                                                            <td className="px-4 py-2">{v.date}</td>
                                                            <td className="px-4 py-2">{v.refNo}</td>
                                                            <td className="px-4 py-2 text-right text-gray-600">₹{v.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                            <td className="px-4 py-2 text-right font-medium text-gray-900">₹{Math.max(0, v.pendingAmount - (v.selected ? 0 : v.netoffAmount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                            <td className="px-4 py-2 text-xs">
                                                                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{v.selected ? 'In Dispute' : v.status}</span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {pendingList.length === 0 && <tr><td colSpan={6} className="px-4 py-4 text-center text-gray-400">No pending invoices</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    
                                    {/* List of Invoices Netted-off */}
                                    <div className="border border-gray-200 rounded">
                                        <div className="bg-green-50 px-4 py-2 border-b border-green-100">
                                            <h4 className="text-sm font-semibold text-green-900">List of Invoices Netted-off</h4>
                                        </div>
                                        <div className="overflow-auto max-h-[300px]">
                                            <table className="w-full text-sm text-left">
                                                <thead className="text-xs text-green-800 uppercase bg-green-50/50 border-b border-green-100 sticky top-0 shadow-sm">
                                                    <tr>
                                                        <th className="px-4 py-2">Vch Type</th>
                                                        <th className="px-4 py-2">Date</th>
                                                        <th className="px-4 py-2">Ref No</th>
                                                        <th className="px-4 py-2 text-right">Applied Amnt</th>
                                                        <th className="px-4 py-2 text-right">Pending</th>
                                                        <th className="px-4 py-2">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {nettedOffList.map(v => (
                                                        <tr key={v.id} className="border-b border-green-50 last:border-0 hover:bg-green-50/30 transition">
                                                            <td className="px-4 py-2">{v.type}</td>
                                                            <td className="px-4 py-2">{v.date}</td>
                                                            <td className="px-4 py-2">{v.refNo}</td>
                                                            <td className="px-4 py-2 text-right font-bold text-green-600">₹{v.netoffAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                            <td className="px-4 py-2 text-right font-medium text-gray-900">₹{(v.pendingAmount - v.netoffAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                            <td className="px-4 py-2 text-xs">
                                                                <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded font-medium">Netted</span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {nettedOffList.length === 0 && <tr><td colSpan={6} className="px-4 py-4 text-center text-gray-400">No invoices netted off yet</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3 mt-4">
                                     <button 
                                        onClick={() => setActiveTab('dispute')}
                                        className="bg-white border border-gray-300 text-gray-700 px-6 py-2 rounded-md hover:bg-gray-50 transition font-medium"
                                    >
                                        Back
                                    </button>
                                    <button 
                                        onClick={() => setActiveTab('edit')}
                                        className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 transition font-medium shadow-sm"
                                    >
                                        Edit Net-off
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'edit' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="bg-red-50 p-4 rounded-lg border border-red-100 flex justify-between items-center shadow-sm">
                                        <span className="text-sm font-semibold text-red-900">Total Debits</span>
                                        <span className="text-xl font-bold text-red-700">₹{totalDebits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="bg-green-50 p-4 rounded-lg border border-green-100 flex justify-between items-center shadow-sm">
                                        <span className="text-sm font-semibold text-green-900">Total Credits</span>
                                        <span className="text-xl font-bold text-green-700">₹{totalCredits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 italic">Autofilled chronologically based on selections. Verify or override the amount for partial net-off.</p>

                                <div className="grid grid-cols-2 gap-6">
                                    {/* Sales Vouchers (Debit) */}
                                    <div className="border border-gray-200 rounded">
                                        <div className="bg-red-50 px-4 py-2 border-b border-red-100">
                                            <h4 className="text-sm font-semibold text-red-800">Sales Vouchers (Debit)</h4>
                                        </div>
                                        <div className="overflow-auto max-h-[200px]">
                                            <table className="w-full text-sm text-left">
                                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b sticky top-0 shadow-sm">
                                                    <tr>
                                                        <th className="px-4 py-2">Date</th>
                                                        <th className="px-4 py-2">Sales Vch No</th>
                                                        <th className="px-4 py-2 text-right">Amount (Pending)</th>
                                                        <th className="px-4 py-2 text-right">Amount for Net-off</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {salesVouchers.filter(v => !v.selected).map(v => (
                                                        <tr key={v.id} className="border-b last:border-0 hover:bg-gray-50 transition">
                                                            <td className="px-4 py-2">{v.date}</td>
                                                            <td className="px-4 py-2">{v.refNo}</td>
                                                            <td className="px-4 py-2 text-right">₹{v.pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                            <td className="px-4 py-2 text-right">
                                                                <input 
                                                                    type="number" 
                                                                    min="0" 
                                                                    max={v.pendingAmount}
                                                                    value={v.netoffAmount || ''}
                                                                    onChange={(e) => updateNetoffAmount(v.id, e.target.value)}
                                                                    className="w-24 px-2 py-1 text-right border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                                                                />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {salesVouchers.filter(v => !v.selected).length === 0 && <tr><td colSpan={4} className="px-4 py-4 text-center text-gray-400">---</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Purchase Vouchers (Credit) */}
                                    <div className="border border-gray-200 rounded">
                                        <div className="bg-green-50 px-4 py-2 border-b border-green-100">
                                            <h4 className="text-sm font-semibold text-green-800">Purchase Vouchers (Credit)</h4>
                                        </div>
                                        <div className="overflow-auto max-h-[200px]">
                                            <table className="w-full text-sm text-left">
                                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b sticky top-0 shadow-sm">
                                                    <tr>
                                                        <th className="px-4 py-2">Date</th>
                                                        <th className="px-4 py-2">Supplier Inv No</th>
                                                        <th className="px-4 py-2 text-right">Amount (Pending)</th>
                                                        <th className="px-4 py-2 text-right">Amount for Net-off</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {purchaseVouchers.filter(v => !v.selected).map(v => (
                                                        <tr key={v.id} className="border-b last:border-0 hover:bg-gray-50 transition">
                                                            <td className="px-4 py-2">{v.date}</td>
                                                            <td className="px-4 py-2">{v.refNo}</td>
                                                            <td className="px-4 py-2 text-right">₹{v.pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                            <td className="px-4 py-2 text-right">
                                                                <input 
                                                                    type="number" 
                                                                    min="0" 
                                                                    max={v.pendingAmount}
                                                                    value={v.netoffAmount || ''}
                                                                    onChange={(e) => updateNetoffAmount(v.id, e.target.value)}
                                                                    className="w-24 px-2 py-1 text-right border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                                                                />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {purchaseVouchers.filter(v => !v.selected).length === 0 && <tr><td colSpan={4} className="px-4 py-4 text-center text-gray-400">---</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Payment (Debit) */}
                                    <div className="border border-gray-200 rounded">
                                        <div className="bg-red-50 px-4 py-2 border-b border-red-100">
                                            <h4 className="text-sm font-semibold text-red-800">Payment (Debit)</h4>
                                        </div>
                                        <div className="overflow-auto max-h-[200px]">
                                            <table className="w-full text-sm text-left">
                                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b sticky top-0 shadow-sm">
                                                    <tr>
                                                        <th className="px-4 py-2">Date</th>
                                                        <th className="px-4 py-2">Payment Vch No</th>
                                                        <th className="px-4 py-2 text-right">Amount (Pending)</th>
                                                        <th className="px-4 py-2 text-right">Amount for Net-off</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paymentVouchers.filter(v => !v.selected).map(v => (
                                                        <tr key={v.id} className="border-b last:border-0 hover:bg-gray-50 transition">
                                                            <td className="px-4 py-2">{v.date}</td>
                                                            <td className="px-4 py-2">{v.refNo}</td>
                                                            <td className="px-4 py-2 text-right">₹{v.pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                            <td className="px-4 py-2 text-right">
                                                                <input 
                                                                    type="number" 
                                                                    min="0" 
                                                                    max={v.pendingAmount}
                                                                    value={v.netoffAmount || ''}
                                                                    onChange={(e) => updateNetoffAmount(v.id, e.target.value)}
                                                                    className="w-24 px-2 py-1 text-right border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                                                                />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {paymentVouchers.filter(v => !v.selected).length === 0 && <tr><td colSpan={4} className="px-4 py-4 text-center text-gray-400">---</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Receipt (Credit) */}
                                    <div className="border border-gray-200 rounded">
                                        <div className="bg-green-50 px-4 py-2 border-b border-green-100">
                                            <h4 className="text-sm font-semibold text-green-800">Receipt (Credit)</h4>
                                        </div>
                                        <div className="overflow-auto max-h-[200px]">
                                            <table className="w-full text-sm text-left">
                                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b sticky top-0 shadow-sm">
                                                    <tr>
                                                        <th className="px-4 py-2">Date</th>
                                                        <th className="px-4 py-2">Receipt Vch No</th>
                                                        <th className="px-4 py-2 text-right">Amount (Pending)</th>
                                                        <th className="px-4 py-2 text-right">Amount for Net-off</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {receiptVouchers.filter(v => !v.selected).map(v => (
                                                        <tr key={v.id} className="border-b last:border-0 hover:bg-gray-50 transition">
                                                            <td className="px-4 py-2">{v.date}</td>
                                                            <td className="px-4 py-2">{v.refNo}</td>
                                                            <td className="px-4 py-2 text-right">₹{v.pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                            <td className="px-4 py-2 text-right">
                                                                <input 
                                                                    type="number" 
                                                                    min="0" 
                                                                    max={v.pendingAmount}
                                                                    value={v.netoffAmount || ''}
                                                                    onChange={(e) => updateNetoffAmount(v.id, e.target.value)}
                                                                    className="w-24 px-2 py-1 text-right border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                                                                />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {receiptVouchers.filter(v => !v.selected).length === 0 && <tr><td colSpan={4} className="px-4 py-4 text-center text-gray-400">---</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3 mt-4">
                                    <button 
                                        onClick={() => setActiveTab('dispute')}
                                        className="bg-white border border-gray-300 text-gray-700 px-6 py-2 rounded-md hover:bg-gray-50 transition font-medium"
                                    >
                                        Back
                                    </button>
                                    <button 
                                        onClick={handleEditNext}
                                        className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 transition font-medium disabled:opacity-50 shadow-sm"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                    {activeTab === 'netoff' && (
                        <div className="flex justify-end gap-3 mt-4 pt-4 border-t">
                            <button 
                                onClick={handleFinalSave}
                                className="bg-emerald-600 text-white px-8 py-2 rounded-md hover:bg-emerald-700 transition font-semibold shadow-sm"
                            >
                                Save & Close
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NetoffProcessModal;
