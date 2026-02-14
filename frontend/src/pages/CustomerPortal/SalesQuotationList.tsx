import React, { useState } from 'react';
import { Eye, Mail, Pencil, ArrowLeft } from 'lucide-react';
import { httpClient } from '../../services/httpClient';
import SalesQuotationViewModal from './SalesQuotationViewModal';

interface SalesQuotationListProps {
    onCreateQuotation: () => void;
    onEditQuotation: (id: string, type: QuotationType) => void;
}

type QuotationType = 'General Customer Quote' | 'Specific Customer Quote';
type SubTabType = 'Pending & Cancelled' | 'Executed';

interface GeneralQuotation {
    id: string;
    quoteNumber: string;
    customerCategory: string;
    validityPeriod: string;
    status?: string; // Assuming API provides status, otherwise will default logic
}

interface SpecificQuotation {
    id: string;
    quoteNumber: string;
    customerReferenceName: string;
    tentativeDeliveryDate: string;
    validity: string;
    amount: string;
    status?: string; // Assuming API provides status
}

const SalesQuotationList: React.FC<SalesQuotationListProps> = ({ onCreateQuotation, onEditQuotation }) => {
    const [activeType, setActiveType] = useState<QuotationType>('General Customer Quote');
    const [viewMode, setViewMode] = useState<'dashboard' | 'list'>('dashboard');
    const [activeSubTab, setActiveSubTab] = useState<SubTabType>('Pending & Cancelled');
    const [generalQuotations, setGeneralQuotations] = useState<GeneralQuotation[]>([]);
    const [specificQuotations, setSpecificQuotations] = useState<SpecificQuotation[]>([]);
    const [loading, setLoading] = useState(true);

    // View Modal State
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [selectedQuotationId, setSelectedQuotationId] = useState<string | null>(null);

    const handleView = (id: string) => {
        setSelectedQuotationId(id);
        setIsViewModalOpen(true);
    };

    const fetchGeneralQuotations = async () => {
        try {
            const data = await httpClient.get('/api/customerportal/sales-quotations-general/') as any[];
            const mappedData: GeneralQuotation[] = data.map((item: any) => ({
                id: item.id.toString(),
                quoteNumber: item.quote_number,
                customerCategory: item.customer_category,
                validityPeriod: (item.effective_from && item.effective_to)
                    ? `${item.effective_from} to ${item.effective_to}`
                    : 'N/A',
                status: item.status // Capture status if available
            }));
            setGeneralQuotations(mappedData);
        } catch (error) {
            console.error('Error fetching general quotations:', error);
        }
    };

    const fetchSpecificQuotations = async () => {
        try {
            const data = await httpClient.get('/api/customerportal/sales-quotations-specific/') as any[];
            const mappedData: SpecificQuotation[] = data.map((item: any) => {
                // Calculate total amount from items if possible
                const totalAmount = Array.isArray(item.items)
                    ? item.items.reduce((sum: number, row: any) => sum + (parseFloat(row.negotiated_price) || 0), 0)
                    : 0;

                return {
                    id: item.id.toString(),
                    quoteNumber: item.quote_number,
                    customerReferenceName: item.customer_name,
                    tentativeDeliveryDate: item.tentative_delivery_date || 'N/A',
                    validity: (item.validity_from && item.validity_to)
                        ? `${item.validity_from} to ${item.validity_to}`
                        : 'N/A',
                    amount: `₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
                    status: item.status // Capture status
                };
            });
            setSpecificQuotations(mappedData);
        } catch (error) {
            console.error('Error fetching specific quotations:', error);
        }
    };

    React.useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            if (activeType === 'General Customer Quote') {
                await fetchGeneralQuotations();
            } else {
                await fetchSpecificQuotations();
            }
            setLoading(false);
        };
        // Only fetch if we are in list view
        if (viewMode === 'list') {
            loadData();
        }
    }, [activeType, viewMode]);

    // Filtering Logic
    const filterQuotations = (quotations: any[]) => {
        if (activeSubTab === 'Pending & Cancelled') {
            // For now showing all, can add logic: return quotations.filter(q => q.status !== 'Executed');
            return quotations;
        } else {
            // Executed tab
            // For now return empty or specific status: return quotations.filter(q => q.status === 'Executed');
            return [];
        }
    };

    const displayedGeneralQuotations = filterQuotations(generalQuotations);
    const displayedSpecificQuotations = filterQuotations(specificQuotations);

    return (
        <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-100 p-6">
            {viewMode === 'dashboard' ? (
                <div>
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-gray-900">Sales Quotation</h2>
                        <button
                            onClick={onCreateQuotation}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                            Create Sales Quotation
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* General Quote Card */}
                        <div
                            onClick={() => { setActiveType('General Customer Quote'); setViewMode('list'); }}
                            className="bg-white p-6 rounded-[4px] border border-gray-200 hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all group"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-3 rounded-[4px] bg-indigo-50 text-indigo-600">
                                    <Eye className="w-6 h-6" />
                                </div>
                                <ArrowLeft className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 transform rotate-180 transition-all opacity-0 group-hover:opacity-100" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">General Customer Quote</h3>
                            <p className="text-sm text-gray-500 mt-2">Manage standard quotations for general customers.</p>
                        </div>
                        {/* Specific Quote Card */}
                        <div
                            onClick={() => { setActiveType('Specific Customer Quote'); setViewMode('list'); }}
                            className="bg-white p-6 rounded-[4px] border border-gray-200 hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all group"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-3 rounded-[4px] bg-indigo-50 text-indigo-600">
                                    <Pencil className="w-6 h-6" />
                                </div>
                                <ArrowLeft className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 transform rotate-180 transition-all opacity-0 group-hover:opacity-100" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">Specific Customer Quote</h3>
                            <p className="text-sm text-gray-500 mt-2">Manage tailored quotations for specific customers.</p>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    {/* Header Section */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setViewMode('dashboard')}
                                className="p-2 hover:bg-gray-100 rounded-[4px] transition-colors"
                                title="Back to Dashboard"
                            >
                                <ArrowLeft className="w-5 h-5 text-gray-600" />
                            </button>
                            <h2 className="text-xl font-bold text-gray-900">{activeType}</h2>
                        </div>

                        <div className="flex items-center">
                            <button
                                onClick={onCreateQuotation}
                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                                Create Sales Quotation
                            </button>
                        </div>
                    </div>

                    {/* Sub-tabs Navigation */}
                    <div className="border-b border-gray-200 mb-6">
                        <nav className="flex gap-8">
                            {(['Pending & Cancelled', 'Executed'] as SubTabType[]).map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveSubTab(tab)}
                                    className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeSubTab === tab
                                        ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    {tab.toUpperCase()}
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* Data Table */}
                    <div className="overflow-hidden ring-1 ring-black ring-opacity-5 rounded-[4px]">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Quote #
                                    </th>
                                    {activeType === 'General Customer Quote' ? (
                                        <>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Customer Category
                                            </th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Validity Period
                                            </th>
                                        </>
                                    ) : (
                                        <>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Customer Reference Name
                                            </th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Tentative Delivery Date
                                            </th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Validity
                                            </th>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Amount
                                            </th>
                                        </>
                                    )}
                                    <th scope="col" className="relative px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Action
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {loading ? (
                                    <tr>
                                        <td colSpan={activeType === 'General Customer Quote' ? 4 : 6} className="px-6 py-12 text-center text-sm text-gray-500">
                                            <div className="flex items-center justify-center gap-2">
                                                <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-[4px] animate-spin"></div>
                                                Fetching quotations...
                                            </div>
                                        </td>
                                    </tr>
                                ) : activeType === 'General Customer Quote' ? (
                                    displayedGeneralQuotations.length > 0 ? (
                                        displayedGeneralQuotations.map((quote) => (
                                            <tr key={quote.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <button className="text-sm font-medium text-indigo-600 hover:text-indigo-900 hover:underline">
                                                        {quote.quoteNumber}
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                    {quote.customerCategory}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {quote.validityPeriod}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <div className="flex items-center justify-end space-x-3">
                                                        <button
                                                            onClick={() => handleView(quote.id)}
                                                            className="text-gray-400 hover:text-indigo-600 transition-colors tooltip-trigger"
                                                            title="View"
                                                        >
                                                            <Eye size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => onEditQuotation(quote.id, activeType)}
                                                            className="text-gray-400 hover:text-indigo-600 transition-colors tooltip-trigger"
                                                            title="Edit"
                                                        >
                                                            <Pencil size={18} />
                                                        </button>
                                                        <button className="text-gray-400 hover:text-indigo-600 transition-colors tooltip-trigger" title="Mail">
                                                            <Mail size={18} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-500">
                                                {activeSubTab === 'Pending & Cancelled'
                                                    ? "No general customer quotes found."
                                                    : "No executed quotes found."}
                                            </td>
                                        </tr>
                                    )
                                ) : (
                                    displayedSpecificQuotations.length > 0 ? (
                                        displayedSpecificQuotations.map((quote) => (
                                            <tr key={quote.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <button className="text-sm font-medium text-indigo-600 hover:text-indigo-900 hover:underline">
                                                        {quote.quoteNumber}
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                    {quote.customerReferenceName}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                    {quote.tentativeDeliveryDate}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {quote.validity}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                                                    {quote.amount}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <div className="flex items-center justify-end space-x-3">
                                                        <button
                                                            onClick={() => handleView(quote.id)}
                                                            className="text-gray-400 hover:text-indigo-600 transition-colors tooltip-trigger"
                                                            title="View"
                                                        >
                                                            <Eye size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => onEditQuotation(quote.id, activeType)}
                                                            className="text-gray-400 hover:text-indigo-600 transition-colors tooltip-trigger"
                                                            title="Edit"
                                                        >
                                                            <Pencil size={18} />
                                                        </button>
                                                        <button className="text-gray-400 hover:text-indigo-600 transition-colors tooltip-trigger" title="Mail">
                                                            <Mail size={18} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">
                                                {activeSubTab === 'Pending & Cancelled'
                                                    ? "No specific customer quotes found."
                                                    : "No executed quotes found."}
                                            </td>
                                        </tr>
                                    )
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* View Modal */}
            <SalesQuotationViewModal
                isOpen={isViewModalOpen}
                onClose={() => setIsViewModalOpen(false)}
                quotationId={selectedQuotationId}
                type={activeType}
            />
        </div>
    );
};

export default SalesQuotationList;


