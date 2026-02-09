import React, { useState, useRef } from 'react';
import { httpClient } from '../services/httpClient';
declare const XLSX: any;

// Icon component inline
const Icon: React.FC<{ name: string; className?: string }> = ({ name, className = '' }) => {
    const icons: Record<string, string> = {
        upload: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
        download: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
        x: 'M6 18L18 6M6 6l12 12',
        file: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
        spinner: 'M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
    };
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icons[name] || icons.file} />
        </svg>
    );
};

interface InvoiceScannerModalProps {
    onClose: () => void;
}

const InvoiceScannerModal: React.FC<InvoiceScannerModalProps> = ({ onClose }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [extractedData, setExtractedData] = useState<any[]>([]);
    const [isExtracting, setIsExtracting] = useState(false);

    // All 109 field headers
    const fieldHeaders = [
        'Voucher Date', 'Invoice Number', 'Purchase Order No.', 'PO Date',
        'Supplier Name', 'Supplier Address - Bill from', 'Supplier Address - Ship from',
        'Email ID', 'Phone Number', 'Sales Person', 'GSTIN', 'PAN', 'MSME Number',
        'Mode/Terms of Payment', 'Terms of Delivery',
        'Ledger Amount', 'Ledger Rate', 'Ledger Amount Dr/Cr', 'Ledger Narration',
        'Description of Ledger', 'Type of Tax Payment',
        'Item Code', 'Item/Description', 'Quantity', 'Quantity UOM', 'Item Rate',
        'Disc%', 'Item Amount', 'Marks', 'No. of Packages', 'Freight Charges',
        'HSN/SAC Details',
        'GST Rate', 'IGST Amount', 'CGST Amount', 'SGST/UTGST Amount',
        'Cess Rate', 'Cess Amount', 'State Cess Rate', 'State Cess Amount',
        'Applicable for Reverse Charge', 'Taxable Value', 'Invoice Value',
        'VAT Registration No.', 'VAT Tax Rate', 'VAT Taxable Value',
        'Mode of Transport', 'Freight Basis', 'Delivery Challan No.',
        'Delivery Challan Date', 'Carrier Name/Agent', 'LR RR No.', 'LR RR No. - Date',
        'Motor Vehicle No.', 'Vessel/Flight No.', 'Port of Loading', 'Port of Discharge',
        'Port Code (Discharge)', 'Additional Docs', 'Special Instructions',
        'Original Invoice No.', 'Original Invoice - Date',
        'e-Invoice - Ack No.', 'e-Invoice - Ack Date', 'e-Invoice - IRN',
        'e-Way Bill No.', 'e-Way Bill Date', 'Consolidated e-Way Bill No.',
        'Consolidated e-Way Bill Date', 'e-Way Bill Extension Details',
        'Advance Amount', 'Advance Taxable Value', 'Advance IGST Amount',
        'Advance SGST Amount', 'Advance CGST Amount', 'Advance Cess Amount',
        'Advance State Cess Amount',
        'TDS - Section', 'TDS - Description', 'TDS - Assessable Value',
        'Override TDS Exemption u/s 206C', 'Deductee Type',
        'TCS - Section', 'TCS - Description', 'TCS - Assessable Value',
        'Exemption from TCS for Buyer-Deductible TDS', 'TCS Party Details - Collectee Type',
        'Bank - A/c No.', 'Bank - Bank Name', 'Bank - Branch', 'Bank - IFS Code',
        'Payment Details (if any already paid)',
        'Party Type', 'Party Name', 'Party ID', 'Paid Amount', 'Paid Date',
        'Payment Mode', 'Payment Reference No',
        'e-Way Bill No.', 'Motor Vehicle No.',
        'State', 'Email'
    ];

    const handleDownloadExcel = () => {
        if (extractedData.length === 0) return;

        const ws = XLSX.utils.json_to_sheet(extractedData, { header: fieldHeaders });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Invoices");
        XLSX.writeFile(wb, `Extracted_Invoices_${new Date().getTime()}.xlsx`);
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        setIsExtracting(true);
        const API_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:8000';

        try {
            const allResults: any[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const formData = new FormData();
                formData.append('file', file);

                try {
                    // Use httpClient to ensure proper JWT authentication
                    const result = await httpClient.postFormData<any>('/api/ai/extract-invoice/', formData);

                    if (result.error) {
                        throw new Error(result.error);
                    }

                    if (result.reply) {
                        // Backend returns a JSON string in 'reply'
                        let parsedData;
                        try {
                            // First try simple clean
                            const cleanJson = result.reply.replace(/```json\n?|\n?```/g, '').trim();
                            parsedData = JSON.parse(cleanJson);
                        } catch (e) {
                            console.warn("Direct JSON parse failed, trying partial extraction...", e);
                            // If simple parse fails, try to find the first '[' and last ']'
                            try {
                                const jsonMatch = result.reply.match(/\[[\s\S]*\]/);
                                if (jsonMatch) {
                                    parsedData = JSON.parse(jsonMatch[0]);
                                } else {
                                    throw new Error("No JSON array found in response");
                                }
                            } catch (e2) {
                                console.error("JSON Extraction Error:", e2, result.reply);
                                throw new Error("Failed to parse extracted data. Response was not valid JSON.");
                            }
                        }

                        if (Array.isArray(parsedData)) {
                            allResults.push(...parsedData);
                        } else if (parsedData) {
                            allResults.push(parsedData);
                        }
                    } else if (result.success && result.data) {
                        // Support legacy or alternative format if any
                        allResults.push(result.data);
                    } else {
                        throw new Error("No data received from backend");
                    }
                } catch (err) {
                    console.error(`API Failed for ${file.name}:`, err);
                    throw err; // Propagate error to main handler
                }
            }

            // Ensure new columns exist in the data so they show up in the table
            const enhancedResults = allResults.map(item => ({
                ...item,
                'Party Type': item['Party Type'] || '',
                'Party Name': item['Party Name'] || '',
                'Party ID': item['Party ID'] || '',
                'Paid Amount': item['Paid Amount'] || '',
                'Paid Date': item['Paid Date'] || '',
                'Payment Mode': item['Payment Mode'] || '',
                'Payment Reference No': item['Payment Reference No'] || '',
                'e-Way Bill No.': item['e-Way Bill No.'] || '',
                'Motor Vehicle No.': item['Motor Vehicle No.'] || '',
                'State': item['State'] || '',
                'Email': item['Email'] || ''
            }));

            setExtractedData(enhancedResults);
        } catch (error) {
            console.error('OCR Global Error:', error);
            // alert('❌ OCR Failed: ' + (error as Error).message); // Use a more user-friendly message or keep detailed if needed for debug
            alert(`❌ Extraction Failed: ${(error as Error).message}. Please try again.`);
        } finally {
            setIsExtracting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Get unique keys from all extracted data records to form dynamic columns
    const dynamicHeaders = Array.from(new Set(extractedData.flatMap(item => Object.keys(item))));

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 w-full max-w-7xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b">
                    <h2 className="text-2xl font-bold text-gray-800">Invoice Scanner</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        <Icon name="x" className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                    {/* Upload Section */}
                    <div className="mb-6">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,.pdf"
                            multiple
                            onChange={handleFileChange}
                            className="hidden"
                        />
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isExtracting}
                                    className={`inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-white ${isExtracting
                                        ? 'bg-gray-400 cursor-not-allowed'
                                        : 'bg-indigo-600 hover:bg-indigo-700'
                                        }`}
                                >
                                    <Icon name={isExtracting ? "spinner" : "upload"} className={`w-5 h-5 mr-2 ${isExtracting ? 'animate-spin' : ''}`} />
                                    {isExtracting ? 'Extracting...' : 'Select Invoice Files'}
                                </button>

                                {extractedData.length > 0 && (
                                    <button
                                        onClick={handleDownloadExcel}
                                        className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700"
                                    >
                                        <Icon name="download" className="w-5 h-5 mr-2" />
                                        Download Excel
                                    </button>
                                )}

                                {isExtracting && (
                                    <span className="text-sm text-gray-600">
                                        Processing... Please wait
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Data Table */}
                    {extractedData.length > 0 && (
                        <div className="border rounded-[4px] overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-indigo-600">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider sticky left-0 bg-indigo-600">
                                                #
                                            </th>
                                            {dynamicHeaders.map((key: string, idx) => (
                                                <th key={idx} className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider whitespace-nowrap">
                                                    {key}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {extractedData.map((invoice, rowIdx) => (
                                            <tr key={rowIdx} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white">
                                                    {rowIdx + 1}
                                                </td>
                                                {dynamicHeaders.map((key: string, colIdx) => (
                                                    <td key={colIdx} className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                                        {(invoice as Record<string, any>)[key] || '-'}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="bg-gray-50 px-4 py-3 border-t">
                                <p className="text-sm text-gray-700">
                                    📊 Showing only extracted fields for clarity. The downloaded Excel file contains the same filtered columns.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InvoiceScannerModal;


