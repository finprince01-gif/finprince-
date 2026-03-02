import React, { useEffect, useState } from 'react';
import { X, Calendar, User, MapPin, Mail, Phone, Clock, FileText, CheckCircle } from 'lucide-react';
import { httpClient } from '../../services/httpClient';

interface ViewModalProps {
    isOpen: boolean;
    onClose: () => void;
    quotationId: string | null;
    type: 'General Customer Quote' | 'Specific Customer Quote';
}

const SalesQuotationViewModal: React.FC<ViewModalProps> = ({ isOpen, onClose, quotationId, type }) => {
    const [loading, setLoading] = useState(true);
    const [details, setDetails] = useState<any>(null);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!isOpen || !quotationId) return;
            setLoading(true);
            try {
                const endpoint = type === 'General Customer Quote'
                    ? `/api/customerportal/sales-quotations-general/${quotationId}/`
                    : `/api/customerportal/sales-quotations-specific/${quotationId}/`;
                const data = await httpClient.get(endpoint);
                setDetails(data);
            } catch (error) {
                console.error('Error fetching quotation details:');
            } finally {
                setLoading(false);
            }
        };

        fetchDetails();
    }, [isOpen, quotationId, type]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 transition-opacity" aria-hidden="true" onClick={onClose}>
                    <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
                </div>

                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                <div className="inline-block align-bottom bg-white rounded-[4px] text-left overflow-hidden shadow-none border border-slate-200-none border border-slate-200 transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
                    {/* Header */}
                    <div className="bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-50/50 rounded-[4px] text-indigo-600">
                                <FileText size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">
                                    Quotation Details - {details?.quote_number || 'Loading...'}
                                </h3>
                                <p className="text-sm text-gray-500">{type}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-[4px] hover:bg-gray-100 transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="px-6 py-8 max-h-[70vh] overflow-y-auto bg-gray-50/50">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-3">
                                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-[4px] animate-spin"></div>
                                <p className="text-gray-500 font-medium">Fetching details...</p>
                            </div>
                        ) : details ? (
                            <div className="space-y-8">
                                {/* Basic Info Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-white p-6 rounded-[4px] border border-gray-100 shadow-none border border-slate-200-none border border-slate-200">
                                    <DetailItem
                                        icon={<FileText size={18} className="text-indigo-500" />}
                                        label="Quote #"
                                        value={details.quote_number}
                                    />
                                    {type === 'General Customer Quote' ? (
                                        <>
                                            <DetailItem
                                                icon={<User size={18} className="text-indigo-500" />}
                                                label="Customer Category"
                                                value={details.customer_category}
                                            />
                                            <DetailItem
                                                icon={<Calendar size={18} className="text-indigo-500" />}
                                                label="Effective From"
                                                value={details.effective_from}
                                            />
                                            <DetailItem
                                                icon={<Calendar size={18} className="text-indigo-500" />}
                                                label="Effective To"
                                                value={details.effective_to}
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <DetailItem
                                                icon={<User size={18} className="text-indigo-500" />}
                                                label="Customer Name"
                                                value={details.customer_name}
                                            />
                                            <DetailItem
                                                icon={<MapPin size={18} className="text-indigo-500" />}
                                                label="Branch"
                                                value={details.branch}
                                            />
                                            <DetailItem
                                                icon={<Mail size={18} className="text-indigo-500" />}
                                                label="Email"
                                                value={details.email}
                                            />
                                            <DetailItem
                                                icon={<Phone size={18} className="text-indigo-500" />}
                                                label="Contact No"
                                                value={details.contact_no}
                                            />
                                            <DetailItem
                                                icon={<Calendar size={18} className="text-indigo-500" />}
                                                label="Validity From"
                                                value={details.validity_from}
                                            />
                                            <DetailItem
                                                icon={<Calendar size={18} className="text-indigo-500" />}
                                                label="Validity To"
                                                value={details.validity_to}
                                            />
                                            <DetailItem
                                                icon={<Clock size={18} className="text-indigo-500" />}
                                                label="Tentative Delivery"
                                                value={details.tentative_delivery_date}
                                            />
                                        </>
                                    )}
                                </div>

                                {/* Items Table */}
                                <div className="bg-white rounded-[4px] border border-gray-100 shadow-none border border-slate-200-none border border-slate-200 overflow-hidden">
                                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                                        <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Item Details</h4>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50/50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest">No</th>
                                                    <th className="px-6 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest">Code</th>
                                                    <th className="px-6 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest">Name</th>
                                                    {type === 'Specific Customer Quote' && (
                                                        <th className="px-6 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest">Cust Item Name</th>
                                                    )}
                                                    <th className="px-6 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest text-right">Min Qty</th>
                                                    <th className="px-6 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest text-right">Base Price</th>
                                                    {type === 'General Customer Quote' ? (
                                                        <>
                                                            <th className="px-6 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest text-right">Max Disc %</th>
                                                            <th className="px-6 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest text-right">Best Price</th>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <th className="px-6 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest text-right">Disc %</th>
                                                            <th className="px-6 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest text-right">Negotiated Price</th>
                                                        </>
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 bg-white">
                                                {details.items?.map((item: any, idx: number) => (
                                                    <tr key={idx} className="hover:bg-indigo-50/50/30 transition-colors">
                                                        <td className="px-6 py-3 text-xs font-medium text-gray-500">{idx + 1}</td>
                                                        <td className="px-6 py-3 text-xs font-bold text-gray-900">{item.item_code}</td>
                                                        <td className="px-6 py-3 text-xs text-gray-600">{item.item_name}</td>
                                                        {type === 'Specific Customer Quote' && (
                                                            <td className="px-6 py-3 text-xs text-gray-600">{item.customer_item_name}</td>
                                                        )}
                                                        <td className="px-6 py-3 text-xs text-gray-900 text-right">{item.min_order_qty}</td>
                                                        <td className="px-6 py-3 text-xs text-gray-900 text-right font-medium">₹{parseFloat(item.base_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                        {type === 'General Customer Quote' ? (
                                                            <>
                                                                <td className="px-6 py-3 text-xs text-red-600 text-right">{item.max_discount}%</td>
                                                                <td className="px-6 py-3 text-xs text-indigo-600 text-right font-bold">₹{parseFloat(item.best_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <td className="px-6 py-3 text-xs text-red-600 text-right">{item.discount}%</td>
                                                                <td className="px-6 py-3 text-xs text-indigo-600 text-right font-bold">₹{parseFloat(item.negotiated_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                            </>
                                                        )}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Additional Details for Specific Quote */}
                                {type === 'Specific Customer Quote' && details.payment_terms && (
                                    <div className="bg-white p-6 rounded-[4px] border border-gray-100 shadow-none border border-slate-200-none border border-slate-200">
                                        <div className="flex items-center gap-2 mb-4">
                                            <FileText size={18} className="text-indigo-500" />
                                            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Payment Terms</h4>
                                        </div>
                                        <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-4 rounded-[4px] border border-gray-100 italic">
                                            "{details.payment_terms}"
                                        </p>
                                    </div>
                                )}

                                {/* Audit Trail */}
                                <div className="flex items-center gap-4 text-[10px] text-gray-400 font-medium px-2">
                                    <div className="flex items-center gap-1">
                                        <CheckCircle size={10} />
                                        <span>Created by: {details.created_by || 'System'}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Clock size={10} />
                                        <span>Last Updated: {new Date(details.updated_at).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="py-20 text-center text-gray-500">
                                <p>Failed to load quotation details.</p>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="bg-gray-50 px-6 py-4 flex justify-end">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-white border border-gray-300 rounded-[4px] text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-none border border-slate-200-none border border-slate-200 active:scale-95"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface DetailItemProps {
    icon: React.ReactNode;
    label: string;
    value: any;
}

const DetailItem: React.FC<DetailItemProps> = ({ icon, label, value }) => (
    <div className="flex items-start gap-3">
        <div className="mt-1">{icon}</div>
        <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</p>
            <p className="text-sm font-bold text-gray-900 truncate max-w-[200px]">{value || 'N/A'}</p>
        </div>
    </div>
);

export default SalesQuotationViewModal;

