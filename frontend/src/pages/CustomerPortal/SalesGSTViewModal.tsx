import React, { useEffect, useState } from 'react';
import { X, FileText, CheckCircle, Clock } from 'lucide-react';
import { httpClient } from '../../services/httpClient';

interface SalesGSTViewModalProps {
    isOpen: boolean;
    onClose: () => void;
    transactionId: string | null;
}

const SalesGSTViewModal: React.FC<SalesGSTViewModalProps> = ({ isOpen, onClose, transactionId }) => {
    const [loading, setLoading] = useState(true);
    const [details, setDetails] = useState<any>(null);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!isOpen || !transactionId) return;
            setLoading(true);
            try {
                // Fetching from the same endpoint used in CustomerLedgerView for consistency
                const data = await httpClient.get(`/api/voucher-sales-new/${transactionId}/`);
                setDetails(data);
            } catch (error) {
                console.error('Error fetching sales transaction details:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchDetails();
    }, [isOpen, transactionId]);

    if (!isOpen) return null;

    const calculateItemTotals = (item: any) => {
        const taxable = parseFloat(item.taxable_value) || 0;
        const cgstAmount = parseFloat(item.cgst) || 0;
        const sgstAmount = parseFloat(item.sgst) || 0;
        const igstAmount = parseFloat(item.igst) || 0;
        const cessAmount = parseFloat(item.cess) || 0;

        // Extract rates or calculate from amounts
        const cgstRate = item.cgst_rate || (taxable > 0 ? (cgstAmount / taxable * 100).toFixed(2) : 0);
        const sgstRate = item.sgst_rate || (taxable > 0 ? (sgstAmount / taxable * 100).toFixed(2) : 0);
        const igstRate = item.igst_rate || (taxable > 0 ? (igstAmount / taxable * 100).toFixed(2) : 0);
        const cessRate = item.cess_rate || (taxable > 0 ? (cessAmount / taxable * 100).toFixed(2) : 0);

        const totalGst = cgstAmount + sgstAmount + igstAmount + cessAmount;
        const netValue = taxable + totalGst;

        return {
            taxable,
            cgstAmount,
            sgstAmount,
            igstAmount,
            cessAmount,
            cgstRate,
            sgstRate,
            igstRate,
            cessRate,
            totalGst,
            netValue
        };
    };

    const calculateGrandTotals = () => {
        if (!details || !details.items) return { taxable: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, cessAmount: 0, totalGst: 0, net: 0 };
        return details.items.reduce((acc: any, item: any) => {
            const totals = calculateItemTotals(item);
            return {
                taxable: acc.taxable + totals.taxable,
                cgstAmount: acc.cgstAmount + totals.cgstAmount,
                sgstAmount: acc.sgstAmount + totals.sgstAmount,
                igstAmount: acc.igstAmount + totals.igstAmount,
                cessAmount: acc.cessAmount + totals.cessAmount,
                totalGst: acc.totalGst + totals.totalGst,
                net: acc.net + totals.netValue
            };
        }, { taxable: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, cessAmount: 0, totalGst: 0, net: 0 });
    };

    const grandTotals = calculateGrandTotals();

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 transition-opacity" aria-hidden="true" onClick={onClose}>
                    <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
                </div>

                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                <div className="inline-block align-bottom bg-white rounded-[4px] text-left overflow-hidden shadow-none border border-slate-200 transform transition-all sm:my-8 sm:align-middle sm:max-w-6xl sm:w-full">
                    {/* Header */}
                    <div className="bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-50/50 rounded-[4px] text-indigo-600">
                                <FileText size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">
                                    GST Rate Breakdown - {details?.sales_invoice_no || 'Loading...'}
                                </h3>
                                <p className="text-sm text-gray-500">View detailed tax information per item</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-[4px] hover:bg-gray-100 transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="px-6 py-8 max-h-[75vh] overflow-y-auto bg-gray-50/50">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-3">
                                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-[4px] animate-spin"></div>
                                <p className="text-gray-500 font-medium">Fetching GST details...</p>
                            </div>
                        ) : details ? (
                            <div className="space-y-6">
                                {/* Basic Transaction Info */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-[4px] border border-gray-100 shadow-sm border border-slate-200">
                                    <DetailItem label="Invoice No" value={details.sales_invoice_no} />
                                    <DetailItem label="Date" value={details.date} />
                                    <DetailItem label="Customer" value={details.customer_name} />
                                    <DetailItem label="Status" value={details.posting_status} />
                                </div>

                                {/* GST Breakdown Table */}
                                <div className="bg-white rounded-[4px] border border-gray-100 shadow-sm border border-slate-200 overflow-hidden">
                                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                                        <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Itemized Tax Breakdown</h4>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-[#F8F9FA]">
                                                <tr>
                                                    <th rowSpan={2} className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest border-r">Sl No</th>
                                                    <th rowSpan={2} className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest border-r">Item Description</th>
                                                    <th rowSpan={2} className="px-4 py-3 text-right text-[11px] font-bold text-gray-500 uppercase tracking-widest border-r">Taxable Value</th>
                                                    <th colSpan={2} className="px-4 py-2 text-center text-[11px] font-bold text-gray-500 uppercase tracking-widest border-r border-b">CGST</th>
                                                    <th colSpan={2} className="px-4 py-2 text-center text-[11px] font-bold text-gray-500 uppercase tracking-widest border-r border-b">SGST</th>
                                                    <th colSpan={2} className="px-4 py-2 text-center text-[11px] font-bold text-gray-500 uppercase tracking-widest border-r border-b">IGST</th>
                                                    <th colSpan={2} className="px-4 py-2 text-center text-[11px] font-bold text-gray-500 uppercase tracking-widest border-r border-b">CESS</th>
                                                    <th rowSpan={2} className="px-4 py-3 text-right text-[11px] font-bold text-gray-500 uppercase tracking-widest">Total GST</th>
                                                </tr>
                                                <tr>
                                                    <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-400 uppercase border-r text-right">Rate</th>
                                                    <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-400 uppercase border-r text-right">Amount</th>
                                                    <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-400 uppercase border-r text-right">Rate</th>
                                                    <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-400 uppercase border-r text-right">Amount</th>
                                                    <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-400 uppercase border-r text-right">Rate</th>
                                                    <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-400 uppercase border-r text-right">Amount</th>
                                                    <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-400 uppercase border-r text-right">Rate</th>
                                                    <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-400 uppercase border-r text-right">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 bg-white">
                                                {details.items?.map((item: any, idx: number) => {
                                                    const t = calculateItemTotals(item);
                                                    return (
                                                        <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                                                            <td className="px-4 py-3 text-xs font-medium text-gray-500 border-r">{idx + 1}</td>
                                                            <td className="px-4 py-3 text-xs font-bold text-gray-900 border-r">
                                                                <div>{item.item_name}</div>
                                                                <div className="text-[10px] text-gray-400 font-normal">{item.hsn_sac}</div>
                                                            </td>
                                                            <td className="px-4 py-3 text-xs text-gray-900 text-right border-r font-medium">₹{t.taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                            
                                                            <td className="px-3 py-3 text-xs text-gray-500 text-right border-r">{t.cgstRate > 0 ? `${t.cgstRate}%` : '-'}</td>
                                                            <td className="px-3 py-3 text-xs text-gray-900 text-right border-r font-medium">₹{t.cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                            
                                                            <td className="px-3 py-3 text-xs text-gray-500 text-right border-r">{t.sgstRate > 0 ? `${t.sgstRate}%` : '-'}</td>
                                                            <td className="px-3 py-3 text-xs text-gray-900 text-right border-r font-medium">₹{t.sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                            
                                                            <td className="px-3 py-3 text-xs text-gray-500 text-right border-r">{t.igstRate > 0 ? `${t.igstRate}%` : '-'}</td>
                                                            <td className="px-3 py-3 text-xs text-gray-900 text-right border-r font-medium">₹{t.igstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                            
                                                            <td className="px-3 py-3 text-xs text-gray-500 text-right border-r">{t.cessRate > 0 ? `${t.cessRate}%` : '-'}</td>
                                                            <td className="px-3 py-3 text-xs text-gray-900 text-right border-r font-medium">₹{t.cessAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                            
                                                            <td className="px-4 py-3 text-xs font-bold text-indigo-600 text-right">₹{t.totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot className="bg-gray-50 font-bold">
                                                <tr>
                                                    <td colSpan={2} className="px-4 py-3 text-xs font-bold text-gray-900 text-right border-r uppercase tracking-wider">Grand Total:</td>
                                                    <td className="px-4 py-3 text-xs font-bold text-gray-900 text-right border-r">₹{grandTotals.taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                    <td className="border-r"></td>
                                                    <td className="px-3 py-3 text-xs font-bold text-gray-900 text-right border-r">₹{grandTotals.cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                    <td className="border-r"></td>
                                                    <td className="px-3 py-3 text-xs font-bold text-gray-900 text-right border-r">₹{grandTotals.sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                    <td className="border-r"></td>
                                                    <td className="px-3 py-3 text-xs font-bold text-gray-900 text-right border-r">₹{grandTotals.igstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                    <td className="border-r"></td>
                                                    <td className="px-3 py-3 text-xs font-bold text-gray-900 text-right border-r">₹{grandTotals.cessAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                    <td className="px-4 py-3 text-xs font-bold text-indigo-600 text-right">₹{grandTotals.totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>

                                {/* Audit Trail */}
                                <div className="flex items-center gap-4 text-[10px] text-gray-400 font-medium px-2">
                                    <div className="flex items-center gap-1">
                                        <CheckCircle size={10} />
                                        <span>Status: {details.posting_status}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Clock size={10} />
                                        <span>Reference: {details.sales_invoice_no}</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="py-20 text-center text-gray-500">
                                <p>Failed to load GST breakdown.</p>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="bg-gray-50 px-6 py-4 flex justify-end">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-white border border-gray-300 rounded-[4px] text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-sm active:scale-95"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const DetailItem = ({ label, value }: { label: string, value: any }) => (
    <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</p>
        <p className="text-sm font-bold text-gray-900 truncate">{value || 'N/A'}</p>
    </div>
);

export default SalesGSTViewModal;
