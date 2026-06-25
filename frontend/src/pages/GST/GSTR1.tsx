import React, { useState, useEffect } from 'react';
import { httpClient } from '../../services/httpClient';

let savedPeriod: { year: string; month: string } | null = null;

export default function GSTR1Page({ onNavigate, setViewVoucherData, vouchers }: { onNavigate?: (page: string, params?: any) => void, setViewVoucherData?: (data: any) => void, vouchers?: any[] }) {
    const [activeSubTab, setActiveSubTab] = useState('B2B');
    const [period, setPeriodState] = useState(() => {
        if (savedPeriod) return savedPeriod;
        
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
        
        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const currentMonthName = months[currentMonth] || 'January';

        return {
            year: `${fyStartYear}-${(fyStartYear + 1).toString().slice(-2)}`,
            month: currentMonthName
        };
    });

    const setPeriod = (newVal: { year: string; month: string }) => {
        savedPeriod = newVal;
        setPeriodState(newVal);
    };
    const [isLoading, setIsLoading] = useState(false);
    const [b2baData, setB2baData] = useState<any[]>([]);
    const [isFilingReturn, setIsFilingReturn] = useState(false);
    const [filingStatus, setFilingStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showAmendmentModal, setShowAmendmentModal] = useState(false);
    const [viewAmendmentData, setViewAmendmentData] = useState<any>(null);
    const [amendmentForm, setAmendmentForm] = useState<any>({});
    const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

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

    useEffect(() => {
        const saved = localStorage.getItem('gstr1_b2ba_data');
        if (saved) {
            try {
                setB2baData(JSON.parse(saved));
            } catch (e) { }
        }
    }, []);

    useEffect(() => {
        if (b2baData.length > 0) {
            localStorage.setItem('gstr1_b2ba_data', JSON.stringify(b2baData));
        }
    }, [b2baData]);

    useEffect(() => {
        // B2BA now comes from backend which already excludes amended from B2B
        // No manual frontend filtering needed
    }, []);


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
                'B2BA': '/api/gst/gstr1/b2ba/',
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
                    case 'B2BA': setB2baData([]); break;
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
                case 'B2B':
                    setB2bData(response || []);
                    break;
                case 'B2BA': setB2baData(response || []); break;
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

    // Check if selected period is the current month (filing not allowed)
    const isCurrentMonth = (() => {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1; // 1-indexed
        const fyStartYear = parseInt(period.year.split('-')[0]);
        const monthsMap: Record<string, { num: number; offset: number }> = {
            'April': { num: 4, offset: 0 }, 'May': { num: 5, offset: 0 }, 'June': { num: 6, offset: 0 },
            'July': { num: 7, offset: 0 }, 'August': { num: 8, offset: 0 }, 'September': { num: 9, offset: 0 },
            'October': { num: 10, offset: 0 }, 'November': { num: 11, offset: 0 }, 'December': { num: 12, offset: 0 },
            'January': { num: 1, offset: 1 }, 'February': { num: 2, offset: 1 }, 'March': { num: 3, offset: 1 }
        };
        const info = monthsMap[period.month];
        if (!info) return false;
        const filterYear = fyStartYear + info.offset;
        return filterYear === currentYear && info.num === currentMonth;
    })();

    const handleFileReturn = async () => {
        if (isCurrentMonth) return;
        setIsFilingReturn(true);
        setFilingStatus(null);
        try {
            const res: any = await httpClient.post('/api/gst/gstr1/file_return/', {
                year: period.year,
                month: period.month
            });
            setFilingStatus({
                type: 'success',
                message: res?.message || `GST Return filed successfully for ${period.month} ${period.year}.`
            });
            // Refresh data
            fetchData();
        } catch (err: any) {
            const msg = err?.response?.data?.error || err?.message || 'Failed to file GST return.';
            setFilingStatus({ type: 'error', message: msg });
        } finally {
            setIsFilingReturn(false);
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
                            onClick={handleFileReturn}
                            disabled={isCurrentMonth || isFilingReturn || isLoading}
                            title={isCurrentMonth ? 'Cannot file GST return for the current month. Select a previous month.' : 'Mark all vouchers in this period as GST Filed'}
                            className={`erp-button-primary ${isCurrentMonth
                                    ? 'opacity-40 cursor-not-allowed bg-gray-400 border-gray-300 hover:bg-gray-400'
                                    : 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600'
                                }`}
                        >
                            {isFilingReturn ? 'Filing...' : isCurrentMonth ? '🔒 File GST Return' : '✓ File GST Return'}
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
                {/* Filing Status Banner */}
                {filingStatus && (
                    <div className={`mt-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between gap-4 ${filingStatus.type === 'success'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-red-50 text-red-800 border border-red-200'
                        }`}>
                        <span>{filingStatus.type === 'success' ? '✅' : '❌'} {filingStatus.message}</span>
                        <button onClick={() => setFilingStatus(null)} className="text-xs opacity-60 hover:opacity-100">✕</button>
                    </div>
                )}
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
                                            <tr 
                                                key={idx} 
                                                className={`hover:bg-gray-50 cursor-pointer`}
                                                onClick={() => {
                                                    if (setViewVoucherData && onNavigate) {
                                                        setViewVoucherData({
                                                            ...row,
                                                            voucherNo: row.invoice_no,
                                                            type: 'Sales',
                                                            source: 'b2b_drilldown'
                                                        });
                                                        onNavigate('Vouchers');
                                                    }
                                                }}
                                            >
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
                                                <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
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
                            <p className="text-sm text-gray-600 mb-4">Shows original GST Filed values.</p>
                            <div className="erp-table-container">
                                <table className="erp-table">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">GSTIN/UIN of Recipient*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Name of Recipient</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Invoice No*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Invoice Date*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Invoice Value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Place of Supply*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Reverse Charge*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">Taxable Value*</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">IGST</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">CGST</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">SGST</th>
                                            <th className="px-4 py-2 border text-left text-sm font-medium">GST Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {b2baData.length > 0 ? b2baData.map((row, idx) => (
                                            <tr 
                                                key={idx} 
                                                className={`hover:bg-blue-50 cursor-pointer`}
                                                onClick={() => {
                                                    if (setViewVoucherData && onNavigate) {
                                                        setViewVoucherData({ 
                                                            ...row, 
                                                            voucherNo: row.original_invoice_no,
                                                            type: 'Sales',
                                                            source: 'b2b_drilldown',
                                                            _viewAsGSTFiled: true 
                                                        });
                                                        onNavigate('Vouchers');
                                                    }
                                                }}
                                            >
                                                <td className="px-4 py-2 border text-sm">{row.gstin || ''}</td>
                                                <td className="px-4 py-2 border text-sm">{row.recipient_name || ''}</td>
                                                <td className="px-4 py-2 border text-sm">{row.original_invoice_no}</td>
                                                <td className="px-4 py-2 border text-sm">{row.original_invoice_date}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.invoice_value || 0).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm">{row.place_of_supply || ''}</td>
                                                <td className="px-4 py-2 border text-sm">{row.reverse_charge || 'N'}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.taxable_value || 0).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.igst || 0).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.cgst || 0).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm text-right">{Number(row.sgst || 0).toFixed(2)}</td>
                                                <td className="px-4 py-2 border text-sm" onClick={(e) => e.stopPropagation()}>
                                                    <span className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
                                                        ✓ GST Filed
                                                    </span>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
                                                    No B2BA data available for selected period.
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

            {/* Edit Modal */}
            {showEditModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Edit Invoice</h3>
                        <p className="text-sm text-gray-600 mb-6">This is already registered. You can't edit it.</p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (selectedInvoice) {
                                        setAmendmentForm({
                                            original_invoice_no: selectedInvoice.invoice_no,
                                            original_invoice_date: selectedInvoice.invoice_date,
                                            original_invoice_value: selectedInvoice.invoice_value,
                                            original_taxable_value: selectedInvoice.taxable_value,
                                            revised_invoice_no: selectedInvoice.invoice_no,
                                            revised_invoice_date: selectedInvoice.invoice_date,
                                            revised_invoice_value: selectedInvoice.invoice_value,
                                            revised_taxable_value: selectedInvoice.taxable_value,
                                            recipient_name: selectedInvoice.recipient_name || '',
                                            place_of_supply: selectedInvoice.place_of_supply || '',
                                            reverse_charge: selectedInvoice.reverse_charge || 'N',
                                        });
                                        setShowAmendmentModal(true);
                                    }
                                    setShowEditModal(false);
                                }}
                                className="px-4 py-2 bg-[#3b2ddb] text-white rounded-md hover:bg-[#3b2ddb]/90 font-medium text-sm"
                            >
                                EDIT ANYWAY
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Amendment Form Modal */}
            {showAmendmentModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-[600px] max-h-[90vh] overflow-y-auto">
                        <h3 className="text-xl font-bold mb-4 text-[#3b2ddb]">Amend B2B Invoice</h3>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1 text-gray-700">Original Invoice No</label>
                                <input type="text" className="w-full border rounded p-2 bg-gray-100 text-gray-600 outline-none" readOnly value={amendmentForm.original_invoice_no || ''} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1 text-gray-700">Original Invoice Date</label>
                                <input type="text" className="w-full border rounded p-2 bg-gray-100 text-gray-600 outline-none" readOnly value={amendmentForm.original_invoice_date || ''} />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1 text-gray-700">Revised Invoice No <span className="text-red-500">*</span></label>
                                <input type="text" className="w-full border rounded p-2 outline-none" value={amendmentForm.revised_invoice_no || ''} onChange={(e) => setAmendmentForm({ ...amendmentForm, revised_invoice_no: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1 text-gray-700">Revised Invoice Date <span className="text-red-500">*</span></label>
                                <input type="date" className="w-full border rounded p-2 outline-none" value={amendmentForm.revised_invoice_date || ''} onChange={(e) => setAmendmentForm({ ...amendmentForm, revised_invoice_date: e.target.value })} />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1 text-gray-700">Revised Invoice Value <span className="text-red-500">*</span></label>
                                <input type="number" step="0.01" className="w-full border rounded p-2 outline-none" value={amendmentForm.revised_invoice_value || ''} onChange={(e) => setAmendmentForm({ ...amendmentForm, revised_invoice_value: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1 text-gray-700">Revised Taxable Value <span className="text-red-500">*</span></label>
                                <input type="number" step="0.01" className="w-full border rounded p-2 outline-none" value={amendmentForm.revised_taxable_value || ''} onChange={(e) => setAmendmentForm({ ...amendmentForm, revised_taxable_value: e.target.value })} />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1 text-gray-700">Recipient Name <span className="text-red-500">*</span></label>
                                <input type="text" className="w-full border rounded p-2 outline-none" value={amendmentForm.recipient_name || ''} onChange={(e) => setAmendmentForm({ ...amendmentForm, recipient_name: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1 text-gray-700">Place of Supply <span className="text-red-500">*</span></label>
                                <input type="text" className="w-full border rounded p-2 outline-none" value={amendmentForm.place_of_supply || ''} onChange={(e) => setAmendmentForm({ ...amendmentForm, place_of_supply: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1 text-gray-700">Reverse Charge <span className="text-red-500">*</span></label>
                                <select className="w-full border rounded p-2 outline-none" value={amendmentForm.reverse_charge || 'N'} onChange={(e) => setAmendmentForm({ ...amendmentForm, reverse_charge: e.target.value })}>
                                    <option value="N">N</option>
                                    <option value="Y">Y</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex justify-end space-x-4 mt-6">
                            <button
                                className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50 font-medium text-sm"
                                onClick={() => setShowAmendmentModal(false)}
                            >
                                CANCEL
                            </button>
                            <button
                                className="px-4 py-2 bg-[#3b2ddb] text-white rounded hover:bg-[#3b2ddb]/90 font-medium text-sm"
                                onClick={() => {
                                    setB2baData(prev => [...prev, amendmentForm]);
                                    setB2bData(prev => prev.filter(item => item.invoice_no !== amendmentForm.original_invoice_no));
                                    setShowAmendmentModal(false);
                                    setActiveSubTab('B2BA');
                                }}
                            >
                                SAVE AMENDMENT
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {viewAmendmentData && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-[700px] max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-xl font-bold text-[#3b2ddb]">Amendmented Voucher Details</h3>
                                <p className="text-xs text-gray-500 mt-1">Showing the revised/amended values of this invoice</p>
                            </div>
                            <button onClick={() => setViewAmendmentData(null)} className="text-gray-500 hover:text-gray-700">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Original Section */}
                        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                            <div className="flex items-center mb-3">
                                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full mr-2">✓ GST FILED (Original)</span>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500">Invoice No</label>
                                    <p className="text-sm font-semibold text-gray-800">{viewAmendmentData.original_invoice_no}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500">Invoice Date</label>
                                    <p className="text-sm font-semibold text-gray-800">{viewAmendmentData.original_invoice_date}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500">Invoice Value</label>
                                    <p className="text-sm font-semibold text-gray-800">{Number(viewAmendmentData.invoice_value || 0).toFixed(2)}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500">Taxable Value</label>
                                    <p className="text-sm font-semibold text-gray-800">{Number(viewAmendmentData.taxable_value || 0).toFixed(2)}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500">IGST</label>
                                    <p className="text-sm font-semibold text-gray-800">{Number(viewAmendmentData.igst || 0).toFixed(2)}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500">CGST / SGST</label>
                                    <p className="text-sm font-semibold text-gray-800">{Number(viewAmendmentData.cgst || 0).toFixed(2)} / {Number(viewAmendmentData.sgst || 0).toFixed(2)}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500">Customer (GSTIN)</label>
                                    <p className="text-sm font-semibold text-gray-800">{viewAmendmentData.recipient_name} ({viewAmendmentData.gstin})</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500">Place of Supply</label>
                                    <p className="text-sm font-semibold text-gray-800">{viewAmendmentData.place_of_supply}</p>
                                </div>
                            </div>
                        </div>

                        {/* Arrow */}
                        <div className="flex items-center justify-center my-3">
                            <div className="flex items-center space-x-2 text-gray-400">
                                <div className="h-px w-24 bg-gray-300"></div>
                                <span className="text-sm font-medium text-gray-500">Amended to ↓</span>
                                <div className="h-px w-24 bg-gray-300"></div>
                            </div>
                        </div>

                        {/* Amended Section */}
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                            <div className="flex items-center mb-3">
                                <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full mr-2">✎ AMENDED (Revised)</span>
                                <span className="text-xs text-gray-500">Amendment Date: {viewAmendmentData.revised_invoice_date}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-indigo-500">Invoice No</label>
                                    <p className="text-sm font-semibold text-indigo-700">{viewAmendmentData.amended_invoice_no || viewAmendmentData.revised_invoice_no}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-indigo-500">Invoice Date</label>
                                    <p className="text-sm font-semibold text-indigo-700">{viewAmendmentData.amended_invoice_date || viewAmendmentData.revised_invoice_date}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-indigo-500">Invoice Value</label>
                                    <p className="text-sm font-semibold text-indigo-700">{Number(viewAmendmentData.amended_invoice_value || 0).toFixed(2)}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-indigo-500">Taxable Value</label>
                                    <p className="text-sm font-semibold text-indigo-700">{Number(viewAmendmentData.amended_taxable_value || 0).toFixed(2)}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-indigo-500">IGST</label>
                                    <p className="text-sm font-semibold text-indigo-700">{Number(viewAmendmentData.amended_igst || 0).toFixed(2)}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-indigo-500">CGST / SGST</label>
                                    <p className="text-sm font-semibold text-indigo-700">{Number(viewAmendmentData.amended_cgst || 0).toFixed(2)} / {Number(viewAmendmentData.amended_sgst || 0).toFixed(2)}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-indigo-500">Customer (GSTIN)</label>
                                    <p className="text-sm font-semibold text-indigo-700">{viewAmendmentData.amended_recipient_name || viewAmendmentData.recipient_name} ({viewAmendmentData.amended_gstin || viewAmendmentData.gstin})</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-indigo-500">Place of Supply</label>
                                    <p className="text-sm font-semibold text-indigo-700">{viewAmendmentData.amended_place_of_supply || viewAmendmentData.place_of_supply}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end mt-6">
                            <button 
                                className="px-4 py-2 bg-[#3b2ddb] text-white rounded hover:bg-[#3b2ddb]/90 font-medium text-sm"
                                onClick={() => setViewAmendmentData(null)}
                            >
                                CLOSE
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


