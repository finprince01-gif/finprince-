import React, { useState, useRef } from 'react';
import { httpClient } from '../services/httpClient';
import { showError } from '../utils/toast';
import { useSubscriptionUsage } from '../hooks/useSubscriptionUsage';
declare const XLSX: any;

// ────────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────────

interface LineItem {
    'S.No': string;
    'Item Code': string;
    'Item/Description': string;
    'HSN/SAC': string;
    'Quantity': string;
    'Quantity UOM': string;
    'Item Rate': string;
    'Disc%': string;
    'Taxable Amount': string;
    'GST Rate': string;
    'IGST Amount': string;
    'CGST Amount': string;
    'SGST Amount': string;
    'Item Amount': string;
    'Marks': string;
    'No. of Packages': string;
    'Freight Charges': string;
    [key: string]: string;
}

interface InvoiceResult {
    header: Record<string, string>;
    line_items: LineItem[];
}

interface InvoiceScannerModalProps {
    onClose: () => void;
}

// ────────────────────────────────────────────────────────────────────────────────
// Icons
// ────────────────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────────────────
// Column definitions
// ────────────────────────────────────────────────────────────────────────────────

const HEADER_FIELDS = [
    'Voucher Date', 'Invoice Number', 'Purchase Order No.', 'PO Date',
    'Supplier Name', 'Supplier Address - Bill from', 'Supplier Address - Ship from',
    'Email ID', 'Phone Number', 'Sales Person', 'GSTIN', 'PAN', 'MSME Number',
    'Mode/Terms of Payment', 'Terms of Delivery',
    'Ledger Amount', 'Ledger Rate', 'Ledger Amount Dr/Cr', 'Ledger Narration',
    'Description of Ledger', 'Type of Tax Payment',
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
];

const LINE_ITEM_FIELDS = [
    // Identity
    'S.No', 'Item Code', 'Item/Description', 'HSN/SAC',
    // Quantity
    'Quantity', 'Quantity UOM',
    // Pricing
    'Item Rate', 'Disc%', 'Taxable Amount',
    // Tax (per-row)
    'GST Rate', 'IGST Amount', 'CGST Amount', 'SGST Amount',
    // Total
    'Item Amount',
    // Logistics
    'Marks', 'No. of Packages', 'Freight Charges',
];

// Final column order shown in the table: line-item fields first, then header fields
const ALL_COLUMNS = [...LINE_ITEM_FIELDS, ...HEADER_FIELDS];

// ────────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────────

const InvoiceScannerModal: React.FC<InvoiceScannerModalProps> = ({ onClose }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [invoiceResults, setInvoiceResults] = useState<InvoiceResult[]>([]);
    const [isExtracting, setIsExtracting] = useState(false);

    const { incrementUsage, isLimitReached, subscriptionUsage } = useSubscriptionUsage();

    // ── Excel download ──────────────────────────────────────────────────────────
    const handleDownloadExcel = () => {
        if (invoiceResults.length === 0) return;

        const excelRows: Record<string, string>[] = [];
        let globalSerial = 0;

        invoiceResults.forEach((invoice) => {
            const items = invoice.line_items.length > 0 ? invoice.line_items : [{}];
            items.forEach((item) => {
                globalSerial += 1;
                const row: Record<string, string> = { '#': String(globalSerial) };
                ALL_COLUMNS.forEach((col) => {
                    if (LINE_ITEM_FIELDS.includes(col)) {
                        row[col] = (item as any)[col] ?? '';
                    } else {
                        row[col] = invoice.header[col] ?? '';
                    }
                });
                excelRows.push(row);
            });
        });

        const excelHeaders = ['#', ...ALL_COLUMNS];
        const ws = XLSX.utils.json_to_sheet(excelRows, { header: excelHeaders });
        const colWidths = excelHeaders.map((h) => ({ wch: Math.max(h.length, 14) }));
        ws['!cols'] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
        XLSX.writeFile(wb, `Extracted_Invoices_${Date.now()}.xlsx`);
    };

    // ── File upload & extraction ────────────────────────────────────────────────
    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        if (isLimitReached) {
            showError('❌ AI Extraction limit reached for your plan. Please upgrade to continue.');
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        setIsExtracting(true);

        try {
            const allResults: InvoiceResult[] = [];
            let batchProcessedCount = 0;

            for (let i = 0; i < files.length; i++) {
                // Check subscription limit
                if (subscriptionUsage && subscriptionUsage.limit !== 'Unlimited') {
                    const limit =
                        typeof subscriptionUsage.limit === 'string'
                            ? parseFloat(subscriptionUsage.limit)
                            : subscriptionUsage.limit;
                    const currentUsed = (subscriptionUsage.used || 0) + batchProcessedCount;
                    if (currentUsed >= limit) {
                        showError(`❌ AI Extraction limit reached (${limit}). Processed ${batchProcessedCount} files.`);
                        break;
                    }
                }

                const file = files[i];
                const formData = new FormData();
                formData.append('file', file);

                try {
                    const result = await httpClient.postFormData<any>('/api/ai/extract-invoice/', formData);

                    if (result.error) throw new Error(result.error);

                    if (result.success && result.data) {
                        // ── New structured format: { header, line_items } ──────
                        incrementUsage(1);
                        batchProcessedCount++;

                        const data = result.data as { header: Record<string, string>; line_items: LineItem[] };
                        const header = data.header ?? {};
                        const line_items: LineItem[] = Array.isArray(data.line_items)
                            ? data.line_items
                            : [];

                        // Re-assign sequential S.No on the frontend as well
                        const numbered_items = line_items.map((item, idx) => ({
                            ...item,
                            'S.No': String(idx + 1),
                        }));

                        allResults.push({ header, line_items: numbered_items });

                    } else if (result.reply) {
                        // ── Legacy fallback: plain JSON string in reply ────────
                        incrementUsage(1);
                        batchProcessedCount++;

                        let parsedData: any;
                        try {
                            const cleanJson = result.reply.replace(/```json\n?|\n?```/g, '').trim();
                            parsedData = JSON.parse(cleanJson);
                        } catch {
                            const jsonMatch = result.reply.match(/\{[\s\S]*\}/);
                            if (jsonMatch) {
                                parsedData = JSON.parse(jsonMatch[0]);
                            } else {
                                throw new Error('No JSON found in response');
                            }
                        }

                        // Wrap legacy flat object into new format
                        if (parsedData && typeof parsedData === 'object' && !Array.isArray(parsedData)) {
                            if (parsedData.header && parsedData.line_items) {
                                allResults.push(parsedData as InvoiceResult);
                            } else {
                                // Very old format — treat as header-only, no line items
                                allResults.push({ header: parsedData, line_items: [] });
                            }
                        }
                    } else {
                        throw new Error('No data received from backend');
                    }
                } catch (err) {
                    console.error(`Extraction failed for ${file.name}:`, err);
                    throw err;
                }
            }

            setInvoiceResults(allResults);
        } catch (error) {
            showError(`❌ Extraction Failed: ${(error as Error).message}. Please try again.`);
        } finally {
            setIsExtracting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ── Derive which columns actually have data (hide empty ones) ──────────────
    const visibleColumns = ALL_COLUMNS.filter((col) =>
        invoiceResults.some((inv) => {
            if (LINE_ITEM_FIELDS.includes(col)) {
                return inv.line_items.some((item) => item[col] && String(item[col]).trim() !== '');
            }
            return inv.header[col] && String(inv.header[col]).trim() !== '';
        })
    );

    // ── Build flat display rows ─────────────────────────────────────────────────
    let globalSerial = 0;
    const displayRows: Array<{ key: string; serial: number; header: Record<string, string>; item: LineItem; isFirstOfInvoice: boolean }> = [];

    invoiceResults.forEach((invoice, invoiceIdx) => {
        const items = invoice.line_items.length > 0 ? invoice.line_items : [({} as LineItem)];
        items.forEach((item, itemIdx) => {
            globalSerial += 1;
            displayRows.push({
                key: `${invoiceIdx}-${itemIdx}`,
                serial: globalSerial,
                header: invoice.header,
                item,
                isFirstOfInvoice: itemIdx === 0,
            });
        });
    });

    // ────────────────────────────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-[4px] shadow-none border border-slate-200 w-full max-w-7xl max-h-[90vh] flex flex-col">

                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b">
                    <h2 className="text-2xl font-bold text-gray-800">Invoice Scanner</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
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
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isExtracting}
                                className={`inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-[4px] border border-slate-200 text-white ${isExtracting ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
                                    }`}
                            >
                                <Icon
                                    name={isExtracting ? 'spinner' : 'upload'}
                                    className={`w-5 h-5 mr-2 ${isExtracting ? 'animate-spin' : ''}`}
                                />
                                {isExtracting ? 'Extracting...' : 'Select Invoice Files'}
                            </button>

                            {invoiceResults.length > 0 && (
                                <button
                                    onClick={handleDownloadExcel}
                                    className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-[4px] border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700"
                                >
                                    <Icon name="download" className="w-5 h-5 mr-2" />
                                    Download Excel
                                </button>
                            )}

                            {isExtracting && (
                                <span className="text-sm text-gray-600">Processing… Please wait</span>
                            )}
                        </div>
                    </div>

                    {/* Data Table */}
                    {displayRows.length > 0 && (
                        <div className="border rounded-[4px] overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 border-collapse">
                                    <thead className="bg-indigo-600">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider sticky left-0 bg-indigo-600">
                                                #
                                            </th>
                                            {visibleColumns.map((col, idx) => (
                                                <th
                                                    key={idx}
                                                    className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider whitespace-nowrap"
                                                >
                                                    {col}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white">
                                        {displayRows.map((row) => (
                                            <tr
                                                key={row.key}
                                                className={`${row.isFirstOfInvoice
                                                    ? 'border-t-2 border-gray-300'
                                                    : 'border-t border-gray-100'
                                                    } hover:bg-gray-50`}
                                            >
                                                {/* Sequential serial number */}
                                                <td className="px-4 py-3 text-sm font-medium text-gray-900 sticky left-0 bg-white align-middle text-center border-r border-gray-200">
                                                    {row.serial}
                                                </td>

                                                {visibleColumns.map((col, colIdx) => {
                                                    const value = LINE_ITEM_FIELDS.includes(col)
                                                        ? (row.item[col] ?? '')
                                                        : (row.header[col] ?? '');
                                                    return (
                                                        <td
                                                            key={colIdx}
                                                            className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap"
                                                        >
                                                            {value}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="bg-gray-50 px-4 py-3 border-t">
                                <p className="text-sm text-gray-700">
                                    📊 {displayRows.length} line item row{displayRows.length !== 1 ? 's' : ''} extracted.
                                    Each printed invoice row appears as a separate table row.
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
