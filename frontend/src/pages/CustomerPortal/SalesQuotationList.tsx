import React, { useState } from 'react';
import { Eye, Mail, Pencil } from 'lucide-react';
import { httpClient } from '../../services/httpClient';
import SalesQuotationViewModal from './SalesQuotationViewModal';

interface SalesQuotationListProps {
    onCreateQuotation: () => void;
    onEditQuotation: (id: string, type: QuotationType) => void;
}

type QuotationType = 'General Customer Quote' | 'Specific Customer Quote';

interface GeneralQuotation {
    id: string;
    quoteNumber: string;
    customerCategory: string;
    validityPeriod: string;
}

interface SpecificQuotation {
    id: string;
    quoteNumber: string;
    customerReferenceName: string;
    tentativeDeliveryDate: string;
    validity: string;
    amount: string;
}

const SalesQuotationList: React.FC<SalesQuotationListProps> = ({ onCreateQuotation, onEditQuotation }) => {
    const [activeType, setActiveType] = useState<QuotationType>('General Customer Quote');
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
                    : 'N/A'
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
                    amount: `₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
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
        loadData();
    }, [activeType]);

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Sales Quotation</h2>

                    {/* Segmented Control for Quotation Type */}
                    <div className="mt-4 bg-gray-100 p-1 rounded-lg inline-flex">
                        <button
                            onClick={() => setActiveType('General Customer Quote')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeType === 'General Customer Quote'
                                ? 'bg-teal-600 text-white shadow-sm'
                                : 'text-gray-600 hover:text-gray-900'
                                }`}
                        >
                            General Customer Quote
                        </button>
                        <button
                            onClick={() => setActiveType('Specific Customer Quote')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeType === 'Specific Customer Quote'
                                ? 'bg-teal-600 text-white shadow-sm'
                                : 'text-gray-600 hover:text-gray-900'
                                }`}
                        >
                            Specific Customer Quote
                        </button>
                    </div>
                </div>

                <div className="flex items-center">
                    <button
                        onClick={onCreateQuotation}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-teal-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                        Create Sales Quotation
                    </button>
                </div>
            </div>

            {/* Data Table */}
            <div className="overflow-hidden ring-1 ring-black ring-opacity-5 rounded-lg">
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
                                        <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                                        Fetching quotations...
                                    </div>
                                </td>
                            </tr>
                        ) : activeType === 'General Customer Quote' ? (
                            generalQuotations.length > 0 ? (
                                generalQuotations.map((quote) => (
                                    <tr key={quote.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <button className="text-sm font-medium text-teal-600 hover:text-indigo-900 hover:underline">
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
                                                    className="text-gray-400 hover:text-teal-600 transition-colors tooltip-trigger"
                                                    title="View"
                                                >
                                                    <Eye size={18} />
                                                </button>
                                                <button
                                                    onClick={() => onEditQuotation(quote.id, activeType)}
                                                    className="text-gray-400 hover:text-teal-600 transition-colors tooltip-trigger"
                                                    title="Edit"
                                                >
                                                    <Pencil size={18} />
                                                </button>
                                                <button className="text-gray-400 hover:text-teal-600 transition-colors tooltip-trigger" title="Mail">
                                                    <Mail size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-500">
                                        No general customer quotes found.
                                    </td>
                                </tr>
                            )
                        ) : (
                            specificQuotations.length > 0 ? (
                                specificQuotations.map((quote) => (
                                    <tr key={quote.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <button className="text-sm font-medium text-teal-600 hover:text-indigo-900 hover:underline">
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
                                                    className="text-gray-400 hover:text-teal-600 transition-colors tooltip-trigger"
                                                    title="View"
                                                >
                                                    <Eye size={18} />
                                                </button>
                                                <button
                                                    onClick={() => onEditQuotation(quote.id, activeType)}
                                                    className="text-gray-400 hover:text-teal-600 transition-colors tooltip-trigger"
                                                    title="Edit"
                                                >
                                                    <Pencil size={18} />
                                                </button>
                                                <button className="text-gray-400 hover:text-teal-600 transition-colors tooltip-trigger" title="Mail">
                                                    <Mail size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">
                                        No specific customer quotes found.
                                    </td>
                                </tr>
                            )
                        )}
                    </tbody>
                </table>
            </div>

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

