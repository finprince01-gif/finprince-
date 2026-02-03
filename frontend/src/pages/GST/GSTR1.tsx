import React, { useState, useEffect } from 'react';
import { httpClient } from '../../services/httpClient';

export default function GSTR1Page() {
    const [activeSubTab, setActiveSubTab] = useState('B2B');
    const [period, setPeriod] = useState({ year: '2024-25', month: 'January' });
    const [isLoading, setIsLoading] = useState(false);

    // Data states
    const [b2bData, setB2bData] = useState<any[]>([]);
    const [b2clData, setB2clData] = useState<any[]>([]);
    const [b2csData, setB2csData] = useState<any[]>([]);
    const [expData, setExpData] = useState<any[]>([]);
    const [hsnData, setHsnData] = useState<any[]>([]);

    const subTabs = [
        'B2B', 'B2CL', 'B2CS', 'CDNR', 'CDNUR', 'EXP', 'AT', 'ATADJ', 'EXEMP', 'HSN', 'DOC'
    ];

    const fetchData = async () => {
        setIsLoading(true);
        try {
            // Mapping tab names to API endpoints
            const endpointMap: Record<string, string> = {
                'B2B': '/api/accounting/gst/gstr1/b2b/',
                'B2CL': '/api/accounting/gst/gstr1/b2cl/',
                'B2CS': '/api/accounting/gst/gstr1/b2cs/',
                'EXP': '/api/accounting/gst/gstr1/exp/',
                'HSN': '/api/accounting/gst/gstr1/hsn/'
            };

            const url = endpointMap[activeSubTab];
            if (!url) {
                setIsLoading(false);
                // Clear data for tabs that don't have an endpoint
                switch (activeSubTab) {
                    case 'B2B': setB2bData([]); break;
                    case 'B2CL': setB2clData([]); break;
                    case 'B2CS': setB2csData([]); break;
                    case 'EXP': setExpData([]); break;
                    case 'HSN': setHsnData([]); break;
                }
                return;
            }

            // In a real application, you'd pass period as query parameters
            const queryParams = new URLSearchParams(period as any).toString();
            const fullUrl = `${url}?${queryParams}`;
            const response = await httpClient.get(fullUrl);

            switch (activeSubTab) {
                case 'B2B': setB2bData(response || []); break;
                case 'B2CL': setB2clData(response || []); break;
                case 'B2CS': setB2csData(response || []); break;
                case 'EXP': setExpData(response || []); break;
                case 'HSN': setHsnData(response || []); break;
                default:
                    // Clear data for other tabs if they were previously populated
                    setB2bData([]);
                    setB2clData([]);
                    setB2csData([]);
                    setExpData([]);
                    setHsnData([]);
                    break;
            }
        } catch (error) {
            console.error('Failed to fetch GSTR1 data:', error);
            // Clear data on error
            switch (activeSubTab) {
                case 'B2B': setB2bData([]); break;
                case 'B2CL': setB2clData([]); break;
                case 'B2CS': setB2csData([]); break;
                case 'EXP': setExpData([]); break;
                case 'HSN': setHsnData([]); break;
            }
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [activeSubTab, period]); // Refetch on tab or period change

    return (
        <div className="space-y-6">
            {/* Period Selector */}
            <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Financial Year</label>
                        <select
                            value={period.year}
                            onChange={(e) => setPeriod({ ...period, year: e.target.value })}
                            className="px-4 py-2 border border-gray-300 rounded-md"
                        >
                            <option>2024-25</option>
                            <option>2023-24</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
                        <select
                            value={period.month}
                            onChange={(e) => setPeriod({ ...period, month: e.target.value })}
                            className="px-4 py-2 border border-gray-300 rounded-md"
                        >
                            <option>January</option>
                            <option>February</option>
                            <option>March</option>
                            <option>April</option>
                            <option>May</option>
                            <option>June</option>
                            <option>July</option>
                            <option>August</option>
                            <option>September</option>
                            <option>October</option>
                            <option>November</option>
                            <option>December</option>
                        </select>
                    </div>
                    <button
                        onClick={fetchData}
                        className="mt-7 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
                        disabled={isLoading}
                    >
                        {isLoading ? 'Generating...' : 'Generate Return'}
                    </button>
                </div>
            </div>

            {/* Sub Tabs */}
            <div className="bg-white rounded-lg shadow">
                <div className="border-b border-gray-200 px-6">
                    <div className="flex gap-8 overflow-x-auto">
                        {subTabs.map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveSubTab(tab)}
                                className={`py-4 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeSubTab === tab
                                    ? 'border-teal-600 text-teal-700'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* Loading State */}
                    {isLoading && (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'B2B' && (
                        <div>
                            <h3 className="text-lg font-semibold mb-4">B2B Invoices - Business to Registered Business</h3>
                            <div className="overflow-x-auto">
                                <table className="min-w-full border border-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">GSTIN</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Recipient Name</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Invoice No</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Invoice Date</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Invoice Value</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Place of Supply</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rev. Charge</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable Value</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">IGST</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">CGST</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">SGST</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {b2bData.length > 0 ? b2bData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 border text-sm">{row.gstin}</td>
                                                <td className="px-4 py-2 border text-sm">{row.recipient_name}</td>
                                                <td className="px-4 py-2 border text-sm">{row.invoice_no}</td>
                                                <td className="px-4 py-2 border text-sm">{row.invoice_date}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.invoice_value).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm">{row.place_of_supply}</td>
                                                <td className="px-4 py-2 border text-sm">{row.reverse_charge}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.taxable_value).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.igst).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.cgst).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.sgst).toFixed(2)}</td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                                                    No B2B invoices found for selected period.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'B2CL' && (
                        <div>
                            <h3 className="text-lg font-semibold mb-4">B2C Large - Invoices above ₹2.5 Lakhs</h3>
                            <div className="overflow-x-auto">
                                <table className="min-w-full border border-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Invoice No</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Invoice Date</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Invoice Value</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Place of Supply</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable Value</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">IGST</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {b2clData.length > 0 ? b2clData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 border text-sm">{row.invoice_no}</td>
                                                <td className="px-4 py-2 border text-sm">{row.invoice_date}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.invoice_value).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm">{row.place_of_supply}</td>
                                                <td className="px-4 py-2 border text-sm">{row.rate}%</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.taxable_value).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.igst).toFixed(2)}</td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                                    No B2C Large invoices found.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'B2CS' && (
                        <div>
                            <h3 className="text-lg font-semibold mb-4">B2C Small - Summary of Small Invoices</h3>
                            <p className="text-sm text-gray-600 mb-4">Aggregated summary by Place of Supply and Tax Rate</p>
                            <div className="overflow-x-auto">
                                <table className="min-w-full border border-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Type</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Place of Supply</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable Value</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">IGST</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">CGST</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">SGST</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {b2csData.length > 0 ? b2csData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 border text-sm">{row.type}</td>
                                                <td className="px-4 py-2 border text-sm">{row.place_of_supply}</td>
                                                <td className="px-4 py-2 border text-sm">{row.rate}%</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.taxable_value).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.igst).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.cgst).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.sgst).toFixed(2)}</td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                                    No B2C Small data available.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'EXP' && (
                        <div>
                            <h3 className="text-lg font-semibold mb-4">Exports</h3>
                            <div className="overflow-x-auto">
                                <table className="min-w-full border border-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Export Type</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Invoice No</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Invoice Date</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Invoice Value</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Port Code</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">SB No</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">SB Date</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {expData.length > 0 ? expData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 border text-sm">{row.export_type}</td>
                                                <td className="px-4 py-2 border text-sm">{row.invoice_no}</td>
                                                <td className="px-4 py-2 border text-sm">{row.invoice_date}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.invoice_value).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm">{row.port_code}</td>
                                                <td className="px-4 py-2 border text-sm">{row.shipping_bill_number}</td>
                                                <td className="px-4 py-2 border text-sm">{row.shipping_bill_date}</td>
                                                <td className="px-4 py-2 border text-sm">{row.rate}%</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.taxable_value).toFixed(2)}</td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                                                    No export invoices found.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'HSN' && (
                        <div>
                            <h3 className="text-lg font-semibold mb-4">HSN Summary</h3>
                            <div className="overflow-x-auto">
                                <table className="min-w-full border border-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">HSN Code</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Description</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">UQC</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Total Qty</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable Value</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">IGST</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">CGST</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">SGST</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {hsnData.length > 0 ? hsnData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 border text-sm">{row.hsn_code}</td>
                                                <td className="px-4 py-2 border text-sm">{row.description}</td>
                                                <td className="px-4 py-2 border text-sm">{row.uqc}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{row.total_quantity}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.taxable_value).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.igst).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.cgst).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.sgst).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.cess).toFixed(2)}</td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                                                    No HSN data available.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && !['B2B', 'B2CL', 'B2CS', 'EXP', 'HSN'].includes(activeSubTab) && (
                        <div className="text-center py-12">
                            <p className="text-gray-500">This sub-tab is under development.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
