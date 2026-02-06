import React, { useState } from 'react';
import { Eye, Mail, Pencil } from 'lucide-react';

interface SalesQuotationListProps {
    onCreateQuotation: () => void;
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

const SalesQuotationList: React.FC<SalesQuotationListProps> = ({ onCreateQuotation }) => {
    const [activeType, setActiveType] = useState<QuotationType>('General Customer Quote');

    // Mock Data for General Quote
    const generalQuotations: GeneralQuotation[] = [
        {
            id: '1',
            quoteNumber: 'Q-GEN-001',
            customerCategory: 'Wholesale',
            validityPeriod: '2023-10-01 to 2023-12-31'
        },
        {
            id: '2',
            quoteNumber: 'Q-GEN-002',
            customerCategory: 'Retail',
            validityPeriod: '2024-01-01 to 2024-03-31'
        }
    ];

    // Mock Data for Specific Quote
    const specificQuotations: SpecificQuotation[] = [
        {
            id: '1',
            quoteNumber: 'Q-SPC-001',
            customerReferenceName: 'Tech Solutions Inc.',
            tentativeDeliveryDate: '2023-11-15',
            validity: '30 Days',
            amount: '₹15,000'
        },
        {
            id: '2',
            quoteNumber: 'Q-SPC-002',
            customerReferenceName: 'Global Corp',
            tentativeDeliveryDate: '2023-12-01',
            validity: '15 Days',
            amount: '₹28,500'
        }
    ];

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
                        {activeType === 'General Customer Quote' ? (
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
                                                <button className="text-gray-400 hover:text-teal-600 transition-colors tooltip-trigger" title="View">
                                                    <Eye size={18} />
                                                </button>
                                                <button className="text-gray-400 hover:text-teal-600 transition-colors tooltip-trigger" title="Edit">
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
                                                <button className="text-gray-400 hover:text-teal-600 transition-colors tooltip-trigger" title="View">
                                                    <Eye size={18} />
                                                </button>
                                                <button className="text-gray-400 hover:text-teal-600 transition-colors tooltip-trigger" title="Edit">
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
        </div>
    );
};

export default SalesQuotationList;

