import React, { useState, useEffect } from 'react';
import { httpClient } from '../../services/httpClient';

export default function GSTR1Page() {
    const [activeSubTab, setActiveSubTab] = useState('B2B');
    const [period, setPeriod] = useState(() => {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
        return {
            year: `${fyStartYear}-${(fyStartYear + 1).toString().slice(-2)}`,
            month: 'January'
        };
    });
    const [isLoading, setIsLoading] = useState(false);

    // Data states
    const [b2bData, setB2bData] = useState<any[]>([]);
    const [b2clData, setB2clData] = useState<any[]>([]);
    const [b2csData, setB2csData] = useState<any[]>([]);
    const [cdnrData, setCdnrData] = useState<any[]>([]);
    const [cdnurData, setCdnurData] = useState<any[]>([]);
    const [atData, setAtData] = useState<any[]>([]);
    const [atadjData, setAtadjData] = useState<any[]>([]);
    const [exempData, setExempData] = useState<any[]>([]);
    const [docData, setDocData] = useState<any[]>([]);
    const [expData, setExpData] = useState<any[]>([]);
    const [hsnData, setHsnData] = useState<any[]>([]);
    const [stats, setStats] = useState<Record<string, number>>({});

    const subTabs = [
        // Original tabs
        'B2B', 'B2BA', 'B2CL', 'B2CLA', 'B2CS', 'B2CSA',
        'CDNR', 'CDNRA', 'CDNUR',
        'EXP', 'EXPA',
        'AT', 'ATA', 'ATADJ', 'ATADJA',
        // E-commerce tabs
        'ECO', 'ECOA', 'ECOB2B', 'ECOURP2B', 'ECOB2C', 'ECOURP2C',
        'ECOAB2B', 'ECOAB2C', 'ECOAURP2B', 'ECOAURP2C',
        // Other tabs
        'EXEMP', 'HSNB2B', 'HSNB2C', 'DOC'
    ];

    const fetchData = async () => {
        setIsLoading(true);
        try {
            // Fetch stats first
            let queryParams = new URLSearchParams(period as any).toString();
            const statsRes = await httpClient.get<Record<string, number>>(`/api/gst/gstr1/stats/?${queryParams}`);
            setStats(statsRes || {});

            // Mapping tab names to API endpoints
            const endpointMap: Record<string, string> = {
                'B2B': '/api/gst/gstr1/b2b/',
                'B2CL': '/api/gst/gstr1/b2cl/',
                'B2CS': '/api/gst/gstr1/b2cs/',
                'CDNR': '/api/gst/gstr1/cdnr/',
                'CDNUR': '/api/gst/gstr1/cdnur/',
                'EXP': '/api/gst/gstr1/exp/',
                'AT': '/api/gst/gstr1/at/',
                'ATADJ': '/api/gst/gstr1/atadj/',
                'EXEMP': '/api/gst/gstr1/exemp/',
                'DOC': '/api/gst/gstr1/doc/',
                'HSNB2B': '/api/gst/gstr1/hsnb2b/',
                'HSNB2C': '/api/gst/gstr1/hsnb2c/',

            };

            const url = endpointMap[activeSubTab];
            if (!url) {
                setIsLoading(false);
                // Clear data for tabs that don't have an endpoint
                switch (activeSubTab) {
                    case 'B2B': setB2bData([]); break;
                    case 'B2CL': setB2clData([]); break;
                    case 'B2CS': setB2csData([]); break;
                    case 'CDNR': setCdnrData([]); break;
                    case 'CDNUR': setCdnurData([]); break;
                    case 'AT': setAtData([]); break;
                    case 'ATADJ': setAtadjData([]); break;
                    case 'EXEMP': setExempData([]); break;
                    case 'DOC': setDocData([]); break;
                    case 'EXP': setExpData([]); break;
                    case 'HSN': setHsnData([]); break;
                }
                return;
            }

            // In a real application, you'd pass period as query parameters
            queryParams = new URLSearchParams(period as any).toString();
            const fullUrl = `${url}?${queryParams}`;
            const response = await httpClient.get<any[]>(fullUrl);

            switch (activeSubTab) {
                case 'B2B': setB2bData(response || []); break;
                case 'B2CL': setB2clData(response || []); break;
                case 'B2CS': setB2csData(response || []); break;
                case 'CDNR': setCdnrData(response || []); break;
                case 'CDNUR': setCdnurData(response || []); break;
                case 'AT': setAtData(response || []); break;
                case 'ATADJ': setAtadjData(response || []); break;
                case 'EXEMP': setExempData(response || []); break;
                case 'DOC': setDocData(response || []); break;
                case 'EXP': setExpData(response || []); break;
                case 'HSN': setHsnData(response || []); break;
                default:
                    // Clear data for other tabs if they were previously populated
                    setB2bData([]);
                    setB2clData([]);
                    setB2csData([]);
                    setCdnrData([]);
                    setCdnurData([]);
                    setAtData([]);
                    setAtadjData([]);
                    setExempData([]);
                    setDocData([]);
                    setExpData([]);
                    setHsnData([]);
                    break;
            }
        } catch (error) {
            console.error('Failed to fetch GSTR1 data:');
            // Clear data on error
            switch (activeSubTab) {
                case 'B2B': setB2bData([]); break;
                case 'B2CL': setB2clData([]); break;
                case 'B2CS': setB2csData([]); break;
                case 'CDNR': setCdnrData([]); break;
                case 'CDNUR': setCdnurData([]); break;
                case 'AT': setAtData([]); break;
                case 'ATADJ': setAtadjData([]); break;
                case 'EXEMP': setExempData([]); break;
                case 'DOC': setDocData([]); break;
                case 'EXP': setExpData([]); break;
                case 'HSN': setHsnData([]); break;
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownloadExcel = async () => {
        try {
            const queryParams = new URLSearchParams(period as any).toString();
            const response: any = await httpClient.get(`/api/gst/gstr1/download_excel/?${queryParams}`);

            const url = window.URL.createObjectURL(response);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `GSTR1_${period.year}_${period.month}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error('Download failed');
        }
    };

    const handleDownloadJson = async () => {
        try {
            const queryParams = new URLSearchParams(period as any).toString();
            const response: any = await httpClient.get(`/api/gst/gstr1/download_json/?${queryParams}`);

            const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `GSTR1_${period.year}_${period.month}.json`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error('Download failed');
        }
    };


    useEffect(() => {
        fetchData();
    }, [activeSubTab, period]); // Refetch on tab or period change

    return (
        <div className="space-y-6">
            {/* Period Selector */}
            <div className="erp-container">
                <div className="flex flex-wrap items-end gap-6">
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Financial Year</label>
                        <select
                            value={period.year}
                            onChange={(e) => setPeriod({ ...period, year: e.target.value })}
                            className="erp-select"
                        >
                            {/* ... years ... */}
                            {(() => {
                                const years = [];
                                const today = new Date();
                                const currentYear = today.getFullYear();
                                const currentMonth = today.getMonth();

                                let fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;

                                for (let i = 0; i < 11; i++) {
                                    const start = fyStartYear - i;
                                    const end = (start + 1).toString().slice(-2);
                                    const fyLabel = `${start}-${end}`;
                                    years.push(<option key={fyLabel} value={fyLabel}>{fyLabel}</option>);
                                }
                                return years;
                            })()}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Month</label>
                        <select
                            value={period.month}
                            onChange={(e) => setPeriod({ ...period, month: e.target.value })}
                            className="erp-select"
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
                    <div className="flex items-center gap-3">
                        <button
                            onClick={fetchData}
                            className="erp-button-primary"
                            disabled={isLoading}
                        >
                            {isLoading ? 'Generating...' : 'Generate Return'}
                        </button>
                        <button
                            onClick={handleDownloadExcel}
                            className="erp-button-secondary"
                            disabled={isLoading}
                        >
                            Download Excel
                        </button>
                        <button
                            onClick={handleDownloadJson}
                            className="erp-button-secondary bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100"
                            disabled={isLoading}
                        >
                            Download JSON
                        </button>
                    </div>
                </div>
            </div>

            {/* Sub Tabs */}
            <div className="erp-container p-0">
                <div className="erp-tab-container mb-0 border-b border-slate-100 px-6 overflow-x-auto">
                    {subTabs.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveSubTab(tab)}
                            className={`erp-tab ${activeSubTab === tab ? 'active' : ''}`}
                        >
                            {tab} {stats[tab] !== undefined && stats[tab] > 0 ? `(${stats[tab]})` : ''}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* Loading State */}
                    {isLoading && (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-[4px] h-8 w-8 border-b-2 border-indigo-600"></div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'B2B' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">B2B Invoices - Business to Registered Business</h3>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
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

                    {!isLoading && activeSubTab === 'B2BA' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">B2BA - B2B Invoices (Amendment)</h3>
                            <p className="text-sm text-gray-600 mb-4">Amended details of B2B invoices</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">GSTIN/UIN of Recipient*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Name of Recipient</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Invoice number*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Invoice Date*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Revised Invoice number*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Revised Invoice Date*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Invoice value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Place of Supply(POS)*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Reverse Charge*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Applicable % of Tax Rate</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Invoice Type*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">E-Commerce GSTIN*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable Value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={15} className="px-4 py-8 text-center text-gray-500">
                                                No B2BA data available for selected period.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'B2CL' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">B2C Large - Invoices above ₹2.5 Lakhs</h3>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
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

                    {!isLoading && activeSubTab === 'B2CLA' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">B2CLA - B2C Large (Amendment)</h3>
                            <p className="text-sm text-gray-600 mb-4">Amended details of B2C Large invoices</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Invoice number</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Invoice Date</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Revised Invoice number*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Revised Invoice Date</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Invoice value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Place of Supply(POS)</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Applicable % of Tax Rate</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable Value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">E-Commerce GSTIN</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                                                No B2CLA data available for selected period.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'B2CS' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">B2C Small - Summary of Small Invoices</h3>
                            <p className="text-sm text-gray-600 mb-4">Aggregated summary by Place of Supply and Tax Rate</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
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

                    {!isLoading && activeSubTab === 'B2CSA' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">B2CSA - B2C Small (Amendment)</h3>
                            <p className="text-sm text-gray-600 mb-4">Amended details of B2C Small supplies</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Type*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Financial Year</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Month</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Place of Supply(POS)</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Revised Place of Supply(POS)</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Applicable % of Tax Rate</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Rate*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable Value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">E-Commerce GSTIN</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                                                No B2CSA data available for selected period.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'CDNR' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">CDNR - Credit/Debit Notes (Registered)</h3>
                            <p className="text-sm text-gray-600 mb-4">Credit and Debit Notes issued to registered taxpayers</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">GSTIN/UIN*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Name of Recipient</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Note Number*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Note date*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Note Type*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Place of Supply*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Reverse charge*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Note Supply Type*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Note value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Applicable % of Tax Rate</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cdnrData.length > 0 ? cdnrData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 border text-sm">{row.gstin}</td>
                                                <td className="px-4 py-2 border text-sm">{row.recipient_name}</td>
                                                <td className="px-4 py-2 border text-sm">{row.note_number}</td>
                                                <td className="px-4 py-2 border text-sm">{row.note_date}</td>
                                                <td className="px-4 py-2 border text-sm">{row.note_type}</td>
                                                <td className="px-4 py-2 border text-sm">{row.place_of_supply}</td>
                                                <td className="px-4 py-2 border text-sm">{row.reverse_charge}</td>
                                                <td className="px-4 py-2 border text-sm">{row.note_supply_type}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.note_value).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm">{row.applicable_tax_rate}%</td>
                                                <td className="px-4 py-2 border text-sm">{row.rate}%</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.taxable_value).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.cess_amount || 0).toFixed(2)}</td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={13} className="px-4 py-8 text-center text-gray-500">
                                                    No CDNR data available for selected period.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'CDNRA' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">CDNRA - Credit/Debit Notes (Registered) Amendment</h3>
                            <p className="text-sm text-gray-600 mb-4">Amended Credit/Debit Notes issued to registered taxpayers</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">GSTIN/UIN*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Name of Recipient</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Note Number*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Note date*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Revised Note Number*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Revised Note date*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Note Type*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Place of Supply*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Reverse charge*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Note Supply Type*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Note value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Applicable % of Tax Rate</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={15} className="px-4 py-8 text-center text-gray-500">
                                                No CDNRA data available for selected period.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'CDNUR' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">CDNUR - Credit/Debit Notes (Unregistered)</h3>
                            <p className="text-sm text-gray-600 mb-4">Credit and Debit Notes issued to unregistered taxpayers</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">UR Type*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Note Number*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Note date*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Note Type*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Place of Supply</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Note value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Applicable % of Tax Rate</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable value</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cdnurData.length > 0 ? cdnurData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 border text-sm">{row.ur_type}</td>
                                                <td className="px-4 py-2 border text-sm">{row.note_number}</td>
                                                <td className="px-4 py-2 border text-sm">{row.note_date}</td>
                                                <td className="px-4 py-2 border text-sm">{row.note_type}</td>
                                                <td className="px-4 py-2 border text-sm">{row.place_of_supply}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.note_value).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm">{row.applicable_tax_rate}%</td>
                                                <td className="px-4 py-2 border text-sm">{row.rate}%</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.taxable_value).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.cess_amount || 0).toFixed(2)}</td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                                                    No CDNUR data available for selected period.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'AT' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">AT - Advance Tax</h3>
                            <p className="text-sm text-gray-600 mb-4">Tax collected in advance (TCS/TDS)</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Place of Supply(POS)*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Gross advance received*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {atData.length > 0 ? atData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 border text-sm">{row.place_of_supply}</td>
                                                <td className="px-4 py-2 border text-sm">{row.rate}%</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.gross_advance_received).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.cess_amount || 0).toFixed(2)}</td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                                                    No AT data available for selected period.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'ATADJ' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">ATADJ - Advance Tax Adjustment</h3>
                            <p className="text-sm text-gray-600 mb-4">Adjustment of advance tax paid</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Place of Supply(POS)*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Gross advance received*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {atadjData.length > 0 ? atadjData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 border text-sm">{row.place_of_supply}</td>
                                                <td className="px-4 py-2 border text-sm">{row.rate}%</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.gross_advance_received).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.cess_amount || 0).toFixed(2)}</td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                                                    No ATADJ data available for selected period.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'EXPA' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">EXPA - Amended Export</h3>
                            <p className="text-sm text-gray-600 mb-4">Amended Exports supplies including SEZ</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Export Type*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Invoice number*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Invoice Date*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Revised Invoice number*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Revised Invoice Date*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Invoice value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Port Code</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Shipping Bill Number</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Shipping Bill Date</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Applicable % of Tax Rate</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
                                                No EXPA data available for selected period.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'ATA' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">ATA - Advance Tax (Amendment)</h3>
                            <p className="text-sm text-gray-600 mb-4">Amended Advance tax liability for tax already paid on advance received</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Place of Supply(POS)*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Gross advance received*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                                                No ATA data available for selected period.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'ATADJA' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">ATADJA - Advance Tax Adjustment (Amendment)</h3>
                            <p className="text-sm text-gray-600 mb-4">Amended Adjustment of tax liability for tax already paid on advance received</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Financial Year</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Month*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Place of Supply(POS)*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Applicable % of Tax Rate</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Gross advance adjusted*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                                No ATADJA data available for selected period.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'ECO' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">ECO - E-Commerce Operator</h3>
                            <p className="text-sm text-gray-600 mb-4">Supplies through E-C Details of supplies through Electronic Commerce Operator</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Nature of Supply*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Place of Supply(POS)/ GSTIN*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">E-Commerce Operator Name</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Net value of supplies*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Integrated Tax Amount</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Central Tax Amount</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">State/UT Tax Amount</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                                                No ECO data available for selected period.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'ECOA' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">ECOA - Amended E-Commerce Operator</h3>
                            <p className="text-sm text-gray-600 mb-4">Amended Supplies IT Details of amended supplies through Electronic Commerce Operator</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Nature of Supply*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Month*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">E-Commerce Operator GSTIN*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">E-Commerce Operator Name</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Net value of supplies*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Integrated Tax Amount</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Central Tax Amount</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">State/UT Tax Amount</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Financial Year</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                                                No ECOA data available for selected period.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'ECOB2B' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">ECOB2B - Supplies UIA 9/5</h3>
                            <p className="text-sm text-gray-600 mb-4">Details of supplies (via E-Commerce) 15 B2B</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">GSTIN/UIN of Supplier</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">GSTIN/UIN of Recipient</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Recipient Name</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Invoice Number</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Document date</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Value of supplies made</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Place of Supply*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Supply Type*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Document type</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
                                                No ECOB2B data available for selected period.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'ECOURP2B' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">ECOURP2B - Supplies via E-Commerce to URP B2B</h3>
                            <p className="text-sm text-gray-600 mb-4">Details of supplies made through e-commerce to unregistered persons (B2B)</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">GSTIN/UIN of Recipient</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Recipient Name</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Document Number</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Document Date</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Value of Supplies Made</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Place of Supply</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Document Type</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable Value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                                                No ECOURP2B data available for selected period.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'ECOB2C' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">ECOB2C - Supplies via E-Commerce to B2C</h3>
                            <p className="text-sm text-gray-600 mb-4">Details of supplies made through e-commerce to consumers (B2C)</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">GSTIN/UIN of Supplier</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Supplier Name</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Place of Supply*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable Value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                                No ECOB2C data available for selected period.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'ECOURP2C' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">ECOURP2C - Supplies via E-Commerce to URP B2C</h3>
                            <p className="text-sm text-gray-600 mb-4">Details of supplies made through e-commerce to unregistered persons (B2C)</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Place of Supply*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable Value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                                                No ECOURP2C data available for selected period.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'ECOAB2B' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">ECOAB2B - Amended Supplies via E-Commerce to B2B</h3>
                            <p className="text-sm text-gray-600 mb-4">Amended details of supplies made through e-commerce to B2B customers</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">GSTIN/UIN of Supplier</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Supplier Name</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">GSTIN/UIN of Recipient</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Recipient Name</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Document Number</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Document Date</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Revised Document Number</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Revised Document Date</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Value of Supplies Made</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Place of Supply</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Document Type</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable Value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={14} className="px-4 py-8 text-center text-gray-500">
                                                No ECOAB2B data available for selected period.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'ECOAB2C' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">ECOAB2C - Amended Supplies via E-Commerce to B2C</h3>
                            <p className="text-sm text-gray-600 mb-4">Amended details of supplies made through e-commerce to B2C customers</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Financial Year*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Month*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">GSTIN/UIN of Supplier</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Supplier Name</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Place of Supply*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable Value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                                                No ECOAB2C data available for selected period.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'ECOAURP2B' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">ECOAURP2B - Amended Supplies via E-Commerce to URP B2B</h3>
                            <p className="text-sm text-gray-600 mb-4">Amended details of supplies made through e-commerce to unregistered persons (B2B)</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">GSTIN/UIN of Recipient</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Recipient Name</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Document Number</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Document Date</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Revised Document Number</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Revised Document Date</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Value of Supplies Made</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Place of Supply</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Document Type</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable Value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
                                                No ECOAURP2B data available for selected period.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'ECOAURP2C' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">ECOAURP2C - Amended Supplies via E-Commerce to URP B2C</h3>
                            <p className="text-sm text-gray-600 mb-4">Amended details of supplies made through e-commerce to unregistered persons (B2C)</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Financial Year*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Original Month*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Place Of Supply</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable Value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                                No ECOAURP2C data available for selected period.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'EXEMP' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">EXEMP - Exempted Supplies</h3>
                            <p className="text-sm text-gray-600 mb-4">Details of exempted, nil-rated and non-GST supplies</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Description</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Nil rated supplies</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Exempted</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Non GST Supplies</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {exempData.length > 0 ? exempData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 border text-sm">{row.description}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.nil_rated_supplies || 0).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.exempted || 0).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.non_gst_supplies || 0).toFixed(2)}</td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                                                    No EXEMP data available for selected period.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'DOC' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">DOC - Document Details</h3>
                            <p className="text-sm text-gray-600 mb-4">Summary of documents issued during the period</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Nature of Document*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Sr. No From*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Sr. No To*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Total Number*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cancelled</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {docData.length > 0 ? docData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 border text-sm">{row.nature_of_document}</td>
                                                <td className="px-4 py-2 border text-sm">{row.sr_no_from}</td>
                                                <td className="px-4 py-2 border text-sm">{row.sr_no_to}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{row.total_number}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{row.cancelled || 0}</td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                                    No DOC data available for selected period.
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
                            <h3 className="erp-section-title border-none pb-0 mb-4">Exports</h3>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
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



                    {!isLoading && activeSubTab === 'HSNB2B' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">HSN Summary of B2B</h3>
                            <p className="text-sm text-gray-600 mb-4">HSN wise summary of goods/services supplied during the tax period</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">HSN*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Description</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">UQC*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Total Quantity*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Total Value</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable Value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Integrated Tax Amount</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Central Tax Amount</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">State/UT Tax Amount</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                                                No HSNB2B data available for selected period.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && activeSubTab === 'HSNB2C' && (
                        <div>
                            <h3 className="erp-section-title border-none pb-0 mb-4">HSN Summary of B2C</h3>
                            <p className="text-sm text-gray-600 mb-4">HSN wise summary of goods/services supplied during the tax period</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">HSN*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Description</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">UQC*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Total Quantity*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Total Value</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Rate</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable Value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Integrated Tax Amount</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Central Tax Amount</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">State/UT Tax Amount</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Cess Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                                                No HSNB2C data available for selected period.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!isLoading && !['B2B', 'B2BA', 'B2CL', 'B2CLA', 'B2CS', 'B2CSA', 'CDNR', 'CDNRA', 'CDNUR', 'EXP', 'EXPA', 'AT', 'ATA', 'ATADJ', 'ATADJA', 'ECO', 'ECOA', 'ECOB2B', 'ECOURP2B', 'ECOB2C', 'ECOURP2C', 'ECOAB2B', 'ECOAB2C', 'ECOAURP2B', 'ECOAURP2C', 'EXEMP', 'HSNB2B', 'HSNB2C', 'DOC'].includes(activeSubTab) && (
                        <div className="text-center py-12">
                            <p className="text-gray-500">This sub-tab is under development.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}


