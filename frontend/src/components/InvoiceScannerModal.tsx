import React, { useState, useRef, useEffect } from 'react';
import { httpClient } from '../services/httpClient';
import { apiService } from '../services';
import { showError, showSuccess, showInfo } from '../utils/toast';
import { useSubscriptionUsage } from '../hooks/useSubscriptionUsage';
import {
    runMappingEngine,
    buildIngestionReport,
    validateFinancials,
    validateStructuralIntegrity,
    coerceRow,
    saveVendorTemplate,
    // Official Tally Voucher headers — isolated in tallyVoucherSchema.ts
    // SCOPE: Upload Invoices → Tally → Voucher ONLY
    OFFICIAL_TALLY_VOUCHER_HEADERS,
    VOUCHER_COLUMN_SCHEMAS,
    type IngestionReport,
    type MappingDecision,
    type AuditEvent,
} from '../services/mappingEngine';
import { getVoucherSchema, getVoucherFlatHeaders, type VoucherSchema, type SchemaField } from '../configs/schemaConfig';
import CreateVendorModal from './CreateVendorModal';

import { getXLSX } from '../utils/xlsx';

// ────────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────────

interface LineItem {
    [key: string]: string;
}

interface InvoiceResult {
    invoice: Record<string, string>;
    items: LineItem[];
    headerMapping: Record<string, string>;
    itemMapping: Record<string, string>;
    report?: IngestionReport;
    /** id column from invoice_ocr_temp — present when result was served from cache or freshly saved */
    cacheRecordId?: number | null;
    /** hash to track and deduplicate bulk results */
    file_hash?: string;
}

interface InvoiceScannerModalProps {
    onClose: () => void;
    onUpload?: (data: any[]) => void;
    initialFiles?: FileList | null;
    voucherType: string;
    extractionMode?: 'ai_native' | 'tally' | 'zoho' | 'sap';
    scanType?: 'single' | 'bulk';
    onExtractionSuccess?: (extractedData: any) => void;
}

// ────────────────────────────────────────────────────────────────────────────────
// Local coercion helper (used in CSV/Excel path; heavy logic lives in mappingEngine.ts)
// ────────────────────────────────────────────────────────────────────────────────

const coerceNumber = (val: any): string => {
    if (val === undefined || val === null) return '';
    const cleaned = String(val).replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? '' : String(num);
};

// ─── Risk Dashboard Component ──────────────────────────────────────────────────

const RiskBadge: React.FC<{ level: 'Low' | 'Medium' | 'High' }> = ({ level }) => {
    const styles = {
        Low: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
        Medium: 'bg-amber-100 text-amber-800 border border-amber-300',
        High: 'bg-red-100 text-red-800 border border-red-300',
    };
    const icons = { Low: '✅', Medium: '⚠️', High: '🚨' };
    return (
        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${styles[level]}`}>
            {icons[level]} {level} Risk
        </span>
    );
};

const IngestionDashboard: React.FC<{
    report: IngestionReport;
    onConfirm: () => void;
    onCancel: () => void;
    confirmRequired: boolean;
}> = ({ report, onConfirm, onCancel, confirmRequired }) => {
    const [agreed, setAgreed] = useState(false);
    const errors = report.financialValidations.filter(v => !v.passed && v.severity === 'error');
    const warnings = report.financialValidations.filter(v => !v.passed && v.severity === 'warning');

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">📊</span>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Ingestion Risk Report</h2>
                            <p className="text-xs text-gray-500">Schema v{report.schemaVersion} · {new Date(report.timestamp).toLocaleString()}</p>
                        </div>
                    </div>
                    <RiskBadge level={report.riskLevel} />
                </div>

                <div className="px-6 py-4 space-y-5">

                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <SummaryCard label="Confidence" value={`${report.overallConfidence.toFixed(0)}%`}
                            color={report.overallConfidence >= 80 ? 'green' : report.overallConfidence >= 70 ? 'amber' : 'red'} />
                        <SummaryCard label="Mapped Fields" value={`${report.mappedFields.length}`} color="blue" />
                        <SummaryCard label="Unmapped" value={`${report.unmappedFields.length}`}
                            color={report.unmappedFields.length > 0 ? 'amber' : 'green'} />
                        <SummaryCard label="Template" value={report.templateUsed ? `v${report.templateVersion}` : 'None'}
                            color={report.templateUsed ? (report.templateHashMatch ? 'green' : 'amber') : 'gray'} />
                    </div>

                    {/* Block Reasons */}
                    {report.blockSubmission && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <h3 className="font-semibold text-red-800 mb-2">🚫 Submission Blocked</h3>
                            <ul className="space-y-1">
                                {report.blockReasons.map((r, i) => (
                                    <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                                        <span className="mt-0.5">•</span> {r}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Financial Validation */}
                    {(errors.length > 0 || warnings.length > 0) && (
                        <div>
                            <h3 className="font-semibold text-gray-800 mb-2">💰 Financial Integrity</h3>
                            <div className="space-y-1.5">
                                {[...errors, ...warnings].map((v, i) => (
                                    <div key={i} className={`flex items-start gap-2 text-xs px-3 py-2 rounded border
                                        ${v.severity === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                                        <span>{v.severity === 'error' ? '❌' : '⚠️'}</span>
                                        <div>
                                            <span className="font-medium">{v.rule}</span>
                                            {v.expected !== undefined && (
                                                <span className="ml-2">Expected {v.expected?.toFixed(2)} · Got {v.actual?.toFixed(2)} · Δ {v.discrepancy?.toFixed(2)}</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Mapping Table */}
                    <details className="border rounded-lg overflow-hidden" open>
                        <summary className="px-4 py-2 bg-gray-50 font-semibold text-sm cursor-pointer">🗺️ Mapping Decisions ({report.mappedFields.length})</summary>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-xs divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Target Field</th>
                                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Source Column</th>
                                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Score</th>
                                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Method</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {report.mappedFields.map((d, i) => (
                                        <tr key={i}>
                                            <td className="px-3 py-1.5 font-medium text-gray-800">{d.target}</td>
                                            <td className="px-3 py-1.5 text-gray-600 font-mono">{d.source}</td>
                                            <td className="px-3 py-1.5">
                                                <span className={`font-mono font-bold ${d.score >= 90 ? 'text-emerald-600' : d.score >= 70 ? 'text-amber-600' : 'text-red-600'
                                                    }`}>{d.score}</span>
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <MethodBadge method={d.method} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </details>

                    {/* Unmapped Fields */}
                    {report.unmappedFields.length > 0 && (
                        <details className="border border-amber-200 rounded-lg overflow-hidden bg-amber-50/30">
                            <summary className="px-4 py-2 bg-amber-50 font-semibold text-sm text-amber-800 cursor-pointer">
                                ⚠️ Unmapped Fields ({report.unmappedFields.length})
                            </summary>
                            <div className="px-4 py-3 flex flex-wrap gap-2">
                                {report.unmappedFields.map(f => (
                                    <span key={f} className="px-2 py-1 bg-amber-100 border border-amber-300 text-amber-800 rounded text-xs">{f}</span>
                                ))}
                            </div>
                        </details>
                    )}

                    {/* Collisions */}
                    {report.collisionsRejected.length > 0 && (
                        <details className="border rounded-lg overflow-hidden">
                            <summary className="px-4 py-2 bg-gray-50 font-semibold text-sm cursor-pointer">Collision Log ({report.collisionsRejected.length} rejected)</summary>
                            <div className="px-4 py-3 space-y-1">
                                {report.collisionsRejected.map((c, i) => (
                                    <p key={i} className="text-xs text-gray-600">
                                        <span className="text-red-500 font-medium">[REJECTED]</span> {c.source} → {c.target} (score {c.score})
                                    </p>
                                ))}
                            </div>
                        </details>
                    )}

                    {/* Confirmation for Medium/High */}
                    {!report.blockSubmission && confirmRequired && (
                        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
                            <label className="flex items-start gap-2 cursor-pointer">
                                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                                    className="mt-0.5 accent-amber-600" />
                                <span className="text-sm text-amber-800 font-medium">
                                    I have reviewed the risk report and confirm this data is accurate enough to enter into the ERP.
                                    I accept responsibility for any data discrepancies.
                                </span>
                            </label>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-3 flex justify-end gap-3">
                    <button onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100">
                        Cancel
                    </button>
                    {!report.blockSubmission && (
                        <button
                            onClick={onConfirm}
                            disabled={confirmRequired && !agreed}
                            className={`px-5 py-2 text-sm font-semibold text-white rounded-lg transition-colors
                                ${(confirmRequired && !agreed)
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                            ✅ Confirm & Upload
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const SummaryCard: React.FC<{ label: string; value: string; color: 'green' | 'blue' | 'amber' | 'red' | 'gray' }> = ({ label, value, color }) => {
    const colors = {
        green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        blue: 'border-blue-200 bg-blue-50 text-blue-700',
        amber: 'border-amber-200 bg-amber-50 text-amber-700',
        red: 'border-red-200 bg-red-50 text-red-700',
        gray: 'border-gray-200 bg-gray-50 text-gray-600',
    };
    return (
        <div className={`border rounded-lg p-3 text-center ${colors[color]}`}>
            <div className="text-xl font-bold">{value}</div>
            <div className="text-xs mt-0.5 opacity-80">{label}</div>
        </div>
    );
};

const MethodBadge: React.FC<{ method: MappingDecision['method'] }> = ({ method }) => {
    const styles: Record<string, string> = {
        template: 'bg-purple-100 text-purple-700',
        exact: 'bg-emerald-100 text-emerald-700',
        sanitized: 'bg-teal-100 text-teal-700',
        keyword: 'bg-blue-100 text-blue-700',
        fuzzy: 'bg-amber-100 text-amber-700',
        unmapped: 'bg-red-100 text-red-700',
    };
    return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${styles[method] ?? ''}`}>{method}</span>;
};


const Icon: React.FC<{ name: string; className?: string }> = ({ name, className = '' }) => {
    const icons: Record<string, string> = {
        upload: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
        download: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
        x: 'M6 18L18 6M6 6l12 12',
        file: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
        spinner: 'M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z',
        'check-circle': 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    };
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icons[name] || icons.file} />
        </svg>
    );
};

// ────────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────────
// Tally Item Columns helper
// ────────────────────────────────────────────────────────────────────────────────
const TALLY_ITEM_HEADERS = [
    'Item Name', 'Item Description', 'Actual Quantity', 'Billed Quantity',
    'Quantity UOM', 'Item Rate', 'Item Rate per', 'Disc%', 'Item Amount',
    'MRP/Marginal', 'HSN/SAC', 'GST Classification', 'IGST Rate', 'CGST Rate',
    'SGST/UTGST Rate', 'Cess Rate', 'Taxable Value', 'HSN Description'
];

const InvoiceScannerModal: React.FC<InvoiceScannerModalProps> = ({ onClose, onUpload, initialFiles, voucherType, extractionMode = 'ai_native', scanType = 'single', onExtractionSuccess }) => {
    // ── Columns definitions based on extractionMode & voucherType ──
    const schema = getVoucherSchema(voucherType) as VoucherSchema;
    const ALL_COLUMNS = extractionMode === 'tally'
        ? [...OFFICIAL_TALLY_VOUCHER_HEADERS]          // ✔ Official Tally Voucher headers only
        : getVoucherFlatHeaders(voucherType);

    const LINE_ITEM_FIELDS = (schema.sections.items as SchemaField[] | undefined)?.map(f => f.label) || [];
    const HEADER_FIELDS = Object.entries(schema.sections)
        .filter(([name]) => name !== 'items')
        .flatMap(([, fields]) => (fields as SchemaField[]).map(f => f.label));

    const isItemField = (col: string) => {
        return LINE_ITEM_FIELDS.includes(col) || (extractionMode === 'tally' && TALLY_ITEM_HEADERS.includes(col));
    };
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);
    const processedFilesRef = useRef<FileList | File[] | null>(null);
    const uploadedFilesSetRef = useRef<Set<string>>(new Set());
    const stagedFilePathsRef = useRef<string[]>([]); // Ref to avoid stale closures in polling
    const uploadSessionIdRef = useRef<string | null>(null);
    const [invoiceResults, setInvoiceResults] = useState<InvoiceResult[]>([]);
    const [isExtracting, setIsExtracting] = useState(false);
    const [uploadedFileNames, setUploadedFileNames] = useState<string[]>([]);
    const [stagedFilePaths, setStagedFilePaths] = useState<string[]>([]); // SCOPE: Current batch only
    const [estimatedExtractionTime, setEstimatedExtractionTime] = useState<number | null>(null);
    const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

    // -- Countdown Timer Effect --
    useEffect(() => {
        let timer: any;
        if (isExtracting && estimatedExtractionTime !== null) {
            setCountdownSeconds(estimatedExtractionTime);
            timer = setInterval(() => {
                setCountdownSeconds(prev => (prev !== null && prev > 0) ? prev - 1 : prev);
            }, 1000);
        } else {
            setCountdownSeconds(null);
            setEstimatedExtractionTime(null);
        }
        return () => { if (timer) clearInterval(timer); };
    }, [isExtracting, estimatedExtractionTime]);

    // ── Auto-Validate Vendor for Purchase Vouchers ───────────────────────────────
    const [vendorValidation, setVendorValidation] = useState<'IDLE' | 'VALIDATING' | 'FOUND' | 'NOT_FOUND' | 'GSTIN_CONFLICT'>('IDLE');
    const [vendorValidationMessage, setVendorValidationMessage] = useState<string>('');
    const [isCreateVendorModalOpen, setIsCreateVendorModalOpen] = useState(false);
    const [extractedVendorData, setExtractedVendorData] = useState<any>(null);

    // -- Bulk Job State --
    const [bulkJobId, setBulkJobId] = useState<number | null>(null);
    const [bulkStatus, setBulkStatus] = useState<{ total: number; processed: number; failed: number; pending: number; status: string } | null>(null);
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const firstInvoiceVendorStr = invoiceResults.length > 0 && !isExtracting && voucherType === 'Purchase'
        ? String(invoiceResults[0].invoice['Vendor Name'] || '') + '|' + String(invoiceResults[0].invoice['GSTIN'] || '') + '|' + String(invoiceResults[0].invoice['Branch'] || '')
        : '';

    useEffect(() => {
        if (!firstInvoiceVendorStr || voucherType !== 'Purchase') {
            setVendorValidation('IDLE');
            return;
        }

        const checkVendor = async () => {
            if (extractionMode !== 'ai_native') return;
            const firstRow = invoiceResults[0].invoice;

            const vendorName = firstRow['Vendor Name'] || firstRow['Bill From'] || firstRow['Buyer/Supplier - Mailing Name'] || '';
            if (!vendorName) return;

            const gstin = firstRow['GSTIN'] || '';
            const branch = firstRow['Branch'] || '';
            const state = firstRow['State'] || firstRow['Billing State'] || firstRow['Bill From - State'] || '';
            const billFrom = firstRow['Bill From'] || firstRow['Buyer/Supplier - Address'] || firstRow['Bill From - Address Line 1'] || '';

            setVendorValidation('VALIDATING');
            try {
                const res = await httpClient.post<any>('/api/purchase/vendors/validate/', {
                    vendor_name: vendorName,
                    gstin,
                    state,
                    address: billFrom,
                    branch
                });

                const items = invoiceResults[0].items.filter((pi: any) => pi['Item Name'] || pi['Item Code'] || pi['item_name'] || pi['Description'] || pi['description'] || pi['Item'])
                    .map((pi: any) => ({
                        supplierItemCode: String(pi['Item Code'] || pi['item_code'] || pi['Part No'] || ''),
                        supplierItemName: String(pi['Item Name'] || pi['item_name'] || pi['Description'] || pi['description'] || pi['Item'] || ''),
                        hsnSac: String(pi['HSN/SAC'] || pi['hsn_sac'] || pi['HSN Code'] || pi['hsnSac'] || ''),
                    }));

                if (res?.status === 'FOUND') {
                    setVendorValidation('FOUND');
                } else if (res?.status === 'NOT_FOUND') {
                    setVendorValidation('NOT_FOUND');
                    setExtractedVendorData({ vendor_name: vendorName, gstin, state, address: billFrom, branch, supplier_items: items.length > 0 ? items : undefined });
                } else if (res?.status === 'GSTIN_CONFLICT') {
                    setVendorValidation('GSTIN_CONFLICT');
                    setVendorValidationMessage(res.message);
                    setExtractedVendorData({ vendor_name: vendorName, gstin, state, address: billFrom, branch, supplier_items: items.length > 0 ? items : undefined });
                } else {
                    setVendorValidation('IDLE');
                }
            } catch (e) {
                console.error("Vendor validation failed", e);
                setVendorValidation('IDLE');
            }
        };

        const timeout = setTimeout(checkVendor, 500); // debounce typing
        return () => clearTimeout(timeout);
    }, [firstInvoiceVendorStr]);

    const getCellValue = (data: any, col: string): string => {
        if (!data) return '';
        // 1. Direct match (e.g. "Supplier Invoice No.")
        if (data[col] !== undefined && data[col] !== null && data[col] !== '') return String(data[col]);

        // 2. Normalize to snake_case for backend matching
        const snakeCol = col.toLowerCase().replace(/[\s\/\-\.]+/g, '_').replace(/^_|_$/g, '');
        if (data[snakeCol] !== undefined && data[snakeCol] !== null && data[snakeCol] !== '') return String(data[snakeCol]);

        // 3. Robust aliasing
        const ALIASES: Record<string, string[]> = {
            'invoice_date': ['Date', 'Voucher Date', 'Inv Date', 'Bill Date', 'Reference Date'],
            'invoice_no': ['Supplier Invoice No.', 'Supplier Invoice No', 'Voucher Number', 'Inv No', 'Bill No', 'Reference No.'],
            'reference_no': ['Reference No.', 'Reference', 'Ref No', 'Supplier Invoice No.'],
            'vendor_name': ['Vendor Name', 'Supplier Name', 'Party Name', 'Party', 'Customer Name', 'Buyer/Supplier - Mailing Name'],
            'vendor_address': ['Vendor Address', 'Address', 'Supplier Address', 'Bill From', 'Buyer/Supplier - Address', 'Buyer/Supplier - Bill to/from', 'Bill From Address', 'Ship From Address', 'Consignee Address'],
            'bill_from': ['Bill From Address', 'Bill From', 'Office Address', 'Dispatch from Name'],
            'ship_from': ['Ship From Address', 'Ship From', 'Dispatch From Address'],
            'address_type': ['Address Type', 'Buyer/Supplier - Address Type'],
            'vendor_state': ['Vendor State', 'State', 'Supplier State', 'Buyer/Supplier - State'],
            'vendor_country': ['Vendor Country', 'Country', 'Supplier Country', 'Buyer/Supplier - Country'],
            'vendor_gstin': ['GSTIN', 'Supplier GSTIN', 'Party GSTIN', 'Buyer/Supplier - GSTIN/UIN'],
            'registration_type': ['GST Registration Type', 'Registration Type', 'Buyer/Supplier - GST Registration Type'],
            'gst_taxability_type': ['GST - Classification', 'GST Taxability Type', 'GST - Taxability Type', 'GST Taxability'],
            'gst_nature_of_transaction': ['GST - Nature of Transaction', 'GST Nature of Transaction', 'Nature of Transaction'],
            'gst_classification': ['GST - Classification', 'GST Classification', 'Classification'],
            'voucher_type': ['Voucher Type Name', 'Transaction Type', 'Voucher Type'],
            'file_name': ['File Name', 'Source File', 'Uploaded File'],
            'voucher_series': ['Voucher Number Series Name', 'Voucher Series'],
            'narration': ['Voucher Narration', 'Narration', 'Remarks', 'Notes'],
            'pos': ['Place of Supply', 'Bill From - State', 'State', 'POS', 'State Type', 'Buyer/Supplier - State', 'Buyer/Supplier - Place of Supply'],
            
            // Items / Ledgers
            'item_name': ['Item Name', 'Description', 'Particulars', 'Item Description', 'Ledger Name'],
            'item_code': ['Item Code', 'Part No', 'Code'],
            'hsn_sac': ['HSN/SAC', 'HSN', 'HSN Code'],
            'quantity': ['Qty', 'Quantity', 'Billed Quantity', 'Actual Quantity'],
            'uom': ['UOM', 'Unit', 'Units', 'Quantity UOM'],
            'rate': ['Item Rate', 'Rate', 'Unit Price', 'Price'],
            'item_rate': ['Item Rate', 'Rate', 'Item Rate per'],
            'discount_percent': ['Disc%', 'Discount %', 'Discount', 'Disc %'],
            'taxable_value': ['Taxable Value', 'Assessable Value', 'Taxable Amount'],
            'total_amount': ['Invoice Value', 'Item Amount', 'Amount', 'Total Invoice Value', 'Grand Total', 'Ledger Amount'],
            'cgst_amount': ['CGST', 'Central Tax', 'CGST Amount', 'Total CGST'],
            'cgst_rate': ['CGST RATE', 'CGST %', 'Central Tax %'],
            'sgst_amount': ['SGST', 'SGST/UTGST', 'State Tax', 'SGST Amount', 'Total SGST', 'Total SGST/UTGST'],
            'sgst_rate': ['SGST/UTGST RATE', 'SGST %', 'State Tax %'],
            'igst_amount': ['IGST', 'Integrated Tax', 'IGST Amount', 'Total IGST'],
            'igst_rate': ['IGST RATE', 'IGST %', 'Integrated Tax %'],
            'cess_amount': ['Cess', 'CESS', 'Cess Amount'],
            'cess_rate': ['Cess Rate', 'CESS RATE', 'Cess %'],
        };

        for (const [key, altList] of Object.entries(ALIASES)) {
            // If the column we are looking for is either the canonical key or in the alias list
            if (key === snakeCol || altList.includes(col) || altList.some(a => a.toLowerCase().replace(/[\s\/\-\.]+/g, '_').replace(/^_|_$/g, '') === snakeCol)) {
                if (data[key] !== undefined && data[key] !== null && data[key] !== '') return String(data[key]);
                for (const alt of altList) {
                    if (data[alt] !== undefined && data[alt] !== null && data[alt] !== '') return String(data[alt]);
                    const altSnake = alt.toLowerCase().replace(/[\s\/\-\.]+/g, '_').replace(/^_|_$/g, '');
                    if (data[altSnake] !== undefined && data[altSnake] !== null && data[altSnake] !== '') return String(data[altSnake]);
                }
            }
        }
        return '';
    };

    const { incrementUsage, isLimitReached, subscriptionUsage } = useSubscriptionUsage();

    useEffect(() => {
        if (isExtracting && estimatedExtractionTime !== null) {
            setCountdownSeconds(Math.round(estimatedExtractionTime));
            const interval = setInterval(() => {
                setCountdownSeconds(prev => {
                    if (prev === null || prev <= 1) return 0;
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(interval);
        } else {
            setCountdownSeconds(null);
        }
    }, [isExtracting, estimatedExtractionTime]);

    useEffect(() => {
        if (initialFiles && initialFiles.length > 0 && processedFilesRef.current !== initialFiles) {
            processedFilesRef.current = initialFiles;
            processFiles(initialFiles);
        }
    }, [initialFiles]);

    const processFiles = async (files: FileList | File[]) => {
        if (isExtracting) return;
        setIsExtracting(true);

        const newFiles: File[] = [];
        const newNames: string[] = [];

        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            newFiles.push(f);
            newNames.push(f.name);
        }

        if (newFiles.length === 0) { setIsExtracting(false); return; }

        setUploadedFileNames(prev => [...prev, ...newNames]);

        try {
            const currentSessionId = String(Date.now());
            uploadSessionIdRef.current = currentSessionId;
            const formData = new FormData();
            newFiles.forEach(f => formData.append('files', f));
            formData.append('upload_session_id', currentSessionId); 
            formData.append('voucher_type', voucherType);

            const response = await httpClient.postFormData<any>('/api/bulk-upload/', formData);
            if (response.job_id) {
                // Tracking uploaded file paths to ensure scope parity (Step 3: store currentFile)
                const newPaths = response.file_paths || [response.file_path].filter(Boolean) || [];
                setStagedFilePaths(prev => [...prev, ...newPaths]);
                stagedFilePathsRef.current = [...stagedFilePathsRef.current, ...newPaths];
                
                setBulkJobId(response.job_id);
                setBulkStatus({
                    total: response.total_files,
                    processed: 0,
                    failed: 0,
                    pending: response.total_files,
                    status: 'processing'
                });
                setEstimatedExtractionTime(response.total_files * 12);
                startPolling(response.job_id);
            }
        } catch (error) {
            showError(`❌ Upload Failed: ${(error as Error).message}`);
            setIsExtracting(false);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const fetchStagingData = async () => {
        try {
            // STEP 3: Fetch using session_id to get ALL relevant processed records safely
            const params: Record<string, string> = {};
            if (uploadSessionIdRef.current) {
                params.upload_session_id = uploadSessionIdRef.current;
            }

            const response: any = await httpClient.get('/api/ocr-staging/', params);
            const stagedResults = Array.isArray(response) ? response : (response?.data || []);

            const mappedResults: InvoiceResult[] = stagedResults.map((item: any) => {
                console.log("FORM SOURCE (DB Batch):", item.extracted_data);
                const extData = item.extracted_data || {};
                // The new structure has a 'sections' key or flattened top-level
                const resData = extData;
                
                // FLATTEN nested sections for the mapping engine (supplier_details, supply_details)
                const flattenedHeader = {
                    ...(resData.sections?.supplier_details || {}),
                    ...(resData.sections?.supply_details || {}),
                    ...(resData.data || resData)
                };
                
                const rawItems = (resData.sections?.items || resData.line_items || resData.items || []);

                const normalizedHeader: Record<string, string> = {};
                const colsToMap = extractionMode === 'tally' ? ALL_COLUMNS : HEADER_FIELDS;
                
                colsToMap.forEach(field => {
                    normalizedHeader[field] = getCellValue(flattenedHeader, field);
                });
                // Map the source filename to the "Voucher Type Name" column as requested
                const fileName = item.file_path?.split(/[\\/]/).pop() || 'Invoice.pdf';
                normalizedHeader['Voucher Type Name'] = fileName;
                normalizedHeader['File Name'] = fileName;

                const normalizedItems = rawItems.map((ritem: any) => {
                    // Items are usually already flat, but check if there's an 'item' wrapper
                    const flatItem = ritem.item ? { ...ritem.item, ...ritem } : ritem;
                    const ni: any = {};
                    const itemColsToMap = extractionMode === 'tally' ? ALL_COLUMNS.filter(c => isItemField(c)) : LINE_ITEM_FIELDS;
                    
                    itemColsToMap.forEach(f => {
                        ni[f] = getCellValue(flatItem, f);
                    });
                    return ni;
                });

                return {
                    invoice: normalizedHeader,
                    items: normalizedItems,
                    headerMapping: {},
                    itemMapping: {},
                    file_hash: item.file_hash,
                    cacheRecordId: item.id
                };
            }).filter((res: any) => res.items.length > 0 || Object.keys(res.invoice).length > 0);

            setInvoiceResults(mappedResults);

            if (mappedResults.length > 0 && onExtractionSuccess) {
                const firstRow = mappedResults[0].invoice;
                onExtractionSuccess({
                    vendor_name: firstRow['Vendor Name'] || firstRow['vendor_name'] || '',
                    gstin: firstRow['GSTIN'] || '',
                    branch: firstRow['Branch'] || '',
                    state: firstRow['State'] || ''
                });
            }
        } catch (err) {
            console.error("Failed to fetch staging data:", err);
        }
    };

    const startPolling = (jobId: number) => {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        let currentInterval = 2000;

        const poll = async () => {
            try {
                const status = await httpClient.get<any>(`/api/bulk-status/${jobId}/`);
                setBulkStatus(status);
                if (status.processed > 0) await fetchStagingData();

                if (status.status === 'completed' || status.status === 'failed' || status.status === 'success') {
                    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
                    setIsExtracting(false);
                    await fetchStagingData();
                    if (status.status !== 'failed') {
                        showSuccess(`✅ Processing completed! ${status.processed} processed, ${status.failed} failed.`);
                    }
                    return;
                }

                const progress = (status.processed + status.failed) / status.total;
                const nextInterval = progress >= 0.5 ? 5000 : 2000;
                if (nextInterval !== currentInterval) {
                    currentInterval = nextInterval;
                    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
                    pollingIntervalRef.current = setInterval(poll, currentInterval);
                }
            } catch (err) {
                console.error("Polling error:", err);
            }
        };
        pollingIntervalRef.current = setInterval(poll, currentInterval);
    };


    useEffect(() => {
        return () => {
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        };
    }, []);

    // ── Upload directly (no risk dashboard) ──────────────────────────────────────
    const handleUploadToAI = () => {
        if (!onUpload) return;
        if (invoiceResults.length === 0) { showError('No data extracted.'); return; }

        if (voucherType === 'Purchase' && (vendorValidation === 'NOT_FOUND' || vendorValidation === 'GSTIN_CONFLICT')) {
            // Force user to handle Create Vendor first
            setIsCreateVendorModalOpen(true);
            return;
        }

        // ── Auto-compute Invoice Value if missing (sum of Item Amount across all items) ──
        // Sales & Purchase use "Invoice Value"; Credit/Debit Notes use "Total Invoice Value"
        // ── Auto-compute "Invoice Value" per item if missing ──────────────────
        // "Invoice Value" is a LINE_ITEM field in Sales/Purchase schema.
        // If the AI did not extract it directly, derive it from Taxable Value + taxes.
        // For Credit/Debit Notes, the legacy "Total Invoice Value" header field is used.
        const autoComputedResults = invoiceResults.map(res => {
            if (voucherType === 'Sales' || voucherType === 'Purchase') {
                // Fix each item row: fill "Invoice Value" if empty
                const fixedItems = res.items.map(item => {
                    const existing = String(item['Invoice Value'] ?? '').trim();
                    if (existing !== '' && existing !== '0') return item;
                    // Derive from taxable + tax columns
                    const taxable = parseFloat(item['Taxable Value'] || '0') || 0;
                    const igst = parseFloat(item['IGST'] || item['Integrated Tax (IGST)'] || '0') || 0;
                    const cgst = parseFloat(item['CGST'] || item['Central Tax (CGST)'] || '0') || 0;
                    const sgst = parseFloat(item['SGST/UTGST'] || item['SGST'] || item['State Tax (SGST)'] || '0') || 0;
                    const cess = parseFloat(item['Cess'] || item['CESS'] || '0') || 0;
                    const derived = taxable + igst + cgst + sgst + cess;
                    // Also try legacy "Item Amount" fallback
                    const legacyAmt = parseFloat(item['Item Amount'] || '0') || 0;
                    const computed = derived > 0 ? derived : (legacyAmt > 0 ? legacyAmt : taxable);
                    return computed > 0 ? { ...item, 'Invoice Value': String(computed) } : item;
                });
                return { ...res, items: fixedItems };
            }

            // Credit/Debit Notes: auto-fill "Total Invoice Value" in the header if missing
            const totalInvField = 'Total Invoice Value';
            if (HEADER_FIELDS.includes(totalInvField) && (!res.invoice[totalInvField] || res.invoice[totalInvField].trim() === '')) {
                const sumItemAmount = res.items.reduce((sum, item) => {
                    const amt = parseFloat(item['Item Amount'] || item['Taxable Value'] || '0');
                    return sum + (isNaN(amt) ? 0 : amt);
                }, 0);
                if (sumItemAmount > 0) {
                    return { ...res, invoice: { ...res.invoice, [totalInvField]: String(sumItemAmount) } };
                }
            }
            return res;
        });

        // ── Validation: Block if truly non-derivable required fields are missing ──
        // "Invoice Value" is intentionally NOT in the mandatory list for Sales/Purchase
        // because it is always auto-computed above from Taxable Value + tax columns.
        const mandatoryForType: Record<string, string[]> = {
            'Sales': ["Date", "Customer Name"],
            'Purchase': ["Date", "Vendor Name"],
            'Payment': ["Voucher Date", "Account", "Amount"],
            'Receipt': ["Voucher Date", "Account", "Amount"],
            'Contra': ["Voucher Date", "From Account", "To Account", "Amount"],
            'Journal': ["Voucher Date", "Amount"],
            'Expenses': ["Voucher Date", "Expense Ledger", "Amount"],
            'Credit Note': ["Voucher Date", "Buyer/Supplier - Mailing Name", "Total Invoice Value"],
            'Debit Note': ["Voucher Date", "Buyer/Supplier - Mailing Name", "Total Invoice Value"]
        };

        const requiredCols = mandatoryForType[voucherType] || ["Date"];
        const missing = requiredCols.filter(col => {
            return autoComputedResults.some(res => {
                const val = LINE_ITEM_FIELDS.includes(col)
                    ? res.items[0]?.[col]
                    : res.invoice[col];
                return !val || String(val).trim() === '';
            });
        });

        if (missing.length > 0) {
            showError(`Submission blocked! Missing required fields: ${missing.join(', ')}`);
            return;
        }

        const allFlatRows: any[] = [];

        autoComputedResults.forEach((res) => {
            // Save vendor template
            const vendorName = res.invoice['Vendor Name'] || '';
            if (vendorName) {
                const combinedMapping = { ...res.headerMapping, ...res.itemMapping };
                const headerKeys = Object.keys(res.invoice);
                saveVendorTemplate(vendorName, combinedMapping, headerKeys);
            }

            const items = res.items.length > 0 ? res.items : [({} as LineItem)];
            items.forEach(item => {
                const rowObj: Record<string, any> = {};
                ALL_COLUMNS.forEach(col => {
                    const isItemField = LINE_ITEM_FIELDS.includes(col);
                    const value = isItemField ? (item as any)[col] : (res.invoice as any)[col];
                    rowObj[col] = (value !== undefined && value !== null && value !== '') ? value : null;
                });
                allFlatRows.push(rowObj);
            });
        });

        onUpload(allFlatRows);
        showSuccess(`✅ ${allFlatRows.length} rows uploaded successfully.`);
        setUploadedFileNames([]);
        setEstimatedExtractionTime(null);
        onClose();
    };

    const handleVendorCreated = async (data: any) => {
        try {
            const response = await httpClient.post<any>('/api/purchase/vendors/create/', data);
            if (response && response.status === 'CREATED') {
                showSuccess(response.message || 'Vendor created successfully');
                setIsCreateVendorModalOpen(false);
                setVendorValidation('FOUND');

                // Once the vendor is created, automatically continue the AI Extraction process.
                setTimeout(() => {
                    handleUploadToAI();
                }, 200);
            }
        } catch (error: any) {
            console.error('Vendor creation error:', error);
            showError(error.response?.data?.error || error.message || 'Failed to create vendor');
        }
    };

    const handleDownloadExcel = async () => {
        const XLSX = await getXLSX();
        if (invoiceResults.length === 0) return;

        // Build full rows using same logic as the display table
        const allRows: Record<string, string>[] = [];
        invoiceResults.forEach((res) => {
            const items = res.items.length > 0 ? res.items : [{}];
            items.forEach((item) => {
                const row: Record<string, string> = {};
                ALL_COLUMNS.forEach((col) => {
                    const isItemField = LINE_ITEM_FIELDS.includes(col);
                    row[col] = isItemField
                        ? getCellValue(item, col)
                        : getCellValue(res.invoice, col);
                });
                allRows.push(row);
            });
        });

        // For Tally: always export ALL columns so the file matches the exact Tally schema.
        // For other modes: keep only columns that have at least one non-empty value.
        const exportCols = extractionMode === 'tally'
            ? ALL_COLUMNS
            : ALL_COLUMNS.filter(col =>
                allRows.some(row => row[col] !== '' && row[col] !== undefined && row[col] !== null)
            );

        // Rebuild rows with the chosen columns
        const excelRows = allRows.map(row => {
            const out: Record<string, string> = {};
            exportCols.forEach(col => { out[col] = row[col] ?? ''; });
            return out;
        });

        const ws = XLSX.utils.json_to_sheet(excelRows, { header: exportCols });
        ws['!cols'] = exportCols.map((h) => ({ wch: Math.max(h.length, 14) }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
        XLSX.writeFile(wb, `Extracted_Invoices_${Date.now()}.xlsx`);
    };

    const handleDownloadCSV = () => {
        if (invoiceResults.length === 0) return;

        // Build full rows
        const allRows: Record<string, string>[] = [];
        invoiceResults.forEach((res) => {
            const items = res.items.length > 0 ? res.items : [({})];
            items.forEach((item) => {
                const row: Record<string, string> = {};
                ALL_COLUMNS.forEach((col) => {
                    row[col] = isItemField(col)
                        ? getCellValue(item, col)
                        : getCellValue(res.invoice, col);
                });
                allRows.push(row);
            });
        });

        // For Tally: always export ALL columns. For other modes: active columns only.
        const exportCols = (extractionMode === 'tally'
            ? ALL_COLUMNS
            : ALL_COLUMNS.filter(col =>
                allRows.some(row => row[col] !== '' && row[col] !== undefined)
            )
        ).filter(c => !['S.No', 'Staging Status', 'Action', 'Validation Status', 'id', 'serial', 'cacheRecordId', 'file_hash'].includes(c));

        let csvContent = exportCols.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';

        allRows.forEach(row => {
            const cells = exportCols.map(col => {
                const val = String(row[col] ?? '');
                return `"${val.replace(/"/g, '""')}"`;
            });
            csvContent += cells.join(',') + '\n';
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `Extracted_Invoices_${Date.now()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // ── File upload & extraction ────────────────────────────────────────────────
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (isExtracting && countdownSeconds !== null && countdownSeconds > 0) {
            timer = setInterval(() => {
                setCountdownSeconds(prev => (prev !== null ? prev - 1 : null));
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [isExtracting, countdownSeconds]);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        // Reset processed ref for manual file changes
        processedFilesRef.current = null;
        processFiles(files);
    };

    const handleFolderChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const allFiles = Array.from(event.target.files || []);
        const supported = allFiles.filter(f =>
            f.type === 'application/pdf' ||
            f.type.startsWith('image/') ||
            /\.(pdf|jpg|jpeg|png|webp)$/i.test(f.name)
        );
        if (supported.length === 0) {
            showError('No supported PDF or image files found in the selected folder.');
            return;
        }

        // Build a synthetic FileList-like object
        const dataTransfer = new DataTransfer();
        supported.forEach(file => dataTransfer.items.add(file));
        const newFiles = dataTransfer.files;

        processedFilesRef.current = null;
        processFiles(newFiles);
    };

    // ── Handle cell change ──────────────────────────────────────────────────────
    const handleCellChange = (invoiceIdx: number, itemIdx: number, col: string, value: string) => {
        setInvoiceResults(prev => {
            const next = [...prev];
            const res = { ...next[invoiceIdx] };

            if (isItemField(col)) {
                const items = [...res.items];
                // If we're editing a fallback empty row
                if (items.length === 0 && itemIdx === 0) {
                    items[0] = { [col]: value } as any;
                } else {
                    items[itemIdx] = { ...items[itemIdx], [col]: value };
                }
                res.items = items;
            } else {
                res.invoice = { ...res.invoice, [col]: value };
            }

            next[invoiceIdx] = res;

            // ── Persist edit to OCR cache / Staging table ─────
            const extractedData = {
                invoice: res.invoice,
                items: res.items,
            };

            if (res.file_hash) {
                // Bulk flow: Use staging API (triggers re-validation)
                apiService.saveStagingEdit(res.file_hash, extractedData)
                    .then(() => fetchStagingData()) // Refresh validation status (READY, etc.)
                    .catch(err => console.warn('[Staging] Edit failed', err));
            } else if (res.cacheRecordId) {
                // Single scan fallback
                apiService.updateOcrCache(res.cacheRecordId, extractedData).catch((err: any) => {
                    console.warn('[OCR Cache] Failed to persist edit for record', res.cacheRecordId, err);
                });
            }

            return next;
        });
    };

    // ── Columns shown in the table (Include all for zero shifting) ─────────────
    const visibleColumns = ALL_COLUMNS;

    // ── Build flat display rows ─────────────────────────────────────────────────
    let globalSerial = 0;
    const displayRows: Array<{
        key: string;
        serial: number;
        invoiceIdx: number;
        itemIdx: number;
        header: Record<string, string>;
        item: LineItem;
        isFirstOfInvoice: boolean
    }> = [];

    invoiceResults.forEach((res, invoiceIdx) => {
        const items = res.items.length > 0 ? res.items : [({} as LineItem)];
        items.forEach((item, itemIdx) => {
            globalSerial += 1;
            displayRows.push({
                key: `${invoiceIdx}-${itemIdx}`,
                invoiceIdx,
                itemIdx,
                serial: globalSerial,
                header: res.invoice, // This is the 'invoice' level data
                item,
                isFirstOfInvoice: itemIdx === 0,
            });
        });
    });



    // ────────────────────────────────────────────────────────────────────────────
    const isSingleScan = scanType === 'single';
    const modePrefix = extractionMode === 'tally' ? 'Tally' :
        (extractionMode === 'ai_native' ? 'AI Native' :
            (extractionMode.charAt(0).toUpperCase() + extractionMode.slice(1)));

    const modalTitle = `${modePrefix} ${isSingleScan ? 'Single' : 'Bulk'} Scan – Invoice Scanner`;
    const modalHint = isSingleScan
        ? 'Upload a single invoice for fast AI extraction.'
        : 'Upload multiple invoices for batch AI processing.';

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">

            <div className="bg-white rounded-[4px] shadow-none border border-slate-200 w-full max-w-7xl max-h-[90vh] flex flex-col">

                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b">
                    <div className="flex flex-col overflow-hidden mr-4 max-w-[80%]">
                        <h2 className="text-2xl font-bold text-gray-800 shrink-0">{modalTitle}</h2>
                        <p className="text-xs text-indigo-500 font-medium mt-0.5">{modalHint}</p>
                        {uploadedFileNames.length > 0 && (
                            <span
                                className="text-sm text-gray-500 truncate mt-1"
                                title={uploadedFileNames.join(", ")}
                            >
                                {uploadedFileNames.join(", ")}
                            </span>
                        )}
                    </div>
                    <button onClick={() => { setUploadedFileNames([]); setEstimatedExtractionTime(null); onClose(); }} className="text-gray-400 hover:text-gray-600 shrink-0">
                        <Icon name="x" className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-col min-h-0 p-6">

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
                        <input
                            ref={folderInputRef}
                            type="file"
                            // @ts-ignore
                            webkitdirectory=""
                            multiple
                            onChange={handleFolderChange}
                            className="hidden"
                        />
                        <div className="flex items-center gap-4">
                            {!isExtracting && invoiceResults.length === 0 && (
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-[4px] border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700"
                                >
                                    <Icon name="upload" className="w-5 h-5 mr-2" />
                                    Select Files
                                </button>
                            )}

                            {isExtracting && (
                                <div className="flex flex-col justify-center px-6 py-2 w-full max-w-md">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2 text-sm font-medium text-indigo-600">
                                            <Icon name="spinner" className="w-5 h-5 animate-spin" />
                                            <span>{scanType === 'bulk' ? 'Processing Bulk Job...' : 'Processing invoices...'}</span>
                                        </div>
                                        {bulkStatus && (
                                            <span className="text-xs font-bold text-indigo-600">
                                                {Math.round(((bulkStatus.processed + bulkStatus.failed) / bulkStatus.total) * 100)}%
                                            </span>
                                        )}
                                    </div>

                                    {bulkStatus ? (
                                        <div className="space-y-1.5">
                                            <div className="w-full bg-gray-200 rounded-full h-2">
                                                <div
                                                    className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                                                    style={{ width: `${((bulkStatus.processed + bulkStatus.failed) / bulkStatus.total) * 100}%` }}
                                                ></div>
                                            </div>
                                            <div className="flex justify-between items-center text-[10px] text-gray-500 font-medium">
                                                <div className="flex gap-3">
                                                    <span>Total: {bulkStatus.total}</span>
                                                    <span className="text-emerald-600">Processed: {bulkStatus.processed}</span>
                                                    <span className="text-red-500">Failed: {bulkStatus.failed}</span>
                                                </div>
                                                {countdownSeconds !== null && (
                                                    <div className="flex items-center gap-1 text-indigo-600 font-bold tabular-nums">
                                                        <span>⏱</span>
                                                        <span>{Math.floor(countdownSeconds / 60)}:{(countdownSeconds % 60).toString().padStart(2, '0')}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        countdownSeconds !== null && (
                                            <div className="flex items-center gap-1.5 ml-7 mt-1">
                                                <span style={{ fontSize: '15px', lineHeight: 1 }}>⏱</span>
                                                <span className="text-xs font-semibold text-indigo-600 tabular-nums">
                                                    {countdownSeconds > 0
                                                        ? (() => {
                                                            const m = Math.floor(countdownSeconds / 60);
                                                            const s = countdownSeconds % 60;
                                                            return m > 0
                                                                ? `${m}:${String(s).padStart(2, '0')} remaining`
                                                                : `${s}s remaining`;
                                                        })()
                                                        : 'Almost done...'}
                                                </span>
                                            </div>
                                        )
                                    )}
                                </div>
                            )}

                            {invoiceResults.length > 0 && !isExtracting && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleDownloadExcel}
                                        className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-[4px] border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700"
                                    >
                                        <Icon name="download" className="w-5 h-5 mr-2" />
                                        Download Excel
                                    </button>
                                    <button
                                        onClick={handleDownloadCSV}
                                        className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-[4px] border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700"
                                    >
                                        <Icon name="download" className="w-5 h-5 mr-2" />
                                        Download CSV
                                    </button>
                                    {extractionMode === 'ai_native' && (

                                        <div className="flex items-center">
                                            <button
                                                onClick={handleUploadToAI}
                                                disabled={displayRows.length === 0 || vendorValidation === 'VALIDATING'}
                                                className={`inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-[4px] border-slate-200 text-white transition-colors ${displayRows.length === 0 || vendorValidation === 'VALIDATING' ? 'bg-gray-400 cursor-not-allowed opacity-75' : 'bg-emerald-600 hover:bg-emerald-700'
                                                    }`}
                                            >
                                                {vendorValidation === 'VALIDATING' ? <Icon name="spinner" className="w-5 h-5 mr-2 animate-spin" /> : <Icon name="check-circle" className="w-5 h-5 mr-2" />}
                                                Finalize & Upload
                                            </button>

                                            {voucherType === 'Purchase' && vendorValidation === 'NOT_FOUND' && (
                                                <div className="flex items-center gap-2 ml-4 animate-fade-in-up">
                                                    <div className="text-xs text-red-600 font-semibold flex items-center gap-1.5 whitespace-nowrap bg-red-50 px-2 py-1.5 rounded border border-red-100 shadow-sm">
                                                        <Icon name="x" className="w-3.5 h-3.5" /> Vendor Not Found
                                                    </div>
                                                    <button
                                                        onClick={() => setIsCreateVendorModalOpen(true)}
                                                        className="px-4 py-1.5 bg-white hover:bg-red-50 border border-red-200 hover:border-red-300 text-red-600 rounded-[4px] flex items-center justify-center font-medium shadow-sm transition-all focus:ring-1 focus:ring-red-500 focus:outline-none whitespace-nowrap text-sm"
                                                    >
                                                        <Icon name="plus" className="w-4 h-4 mr-1.5" /> Create Vendor
                                                    </button>
                                                </div>
                                            )}
                                            {voucherType === 'Purchase' && vendorValidation === 'GSTIN_CONFLICT' && (
                                                <div className="flex items-center gap-2 ml-4 animate-fade-in-up max-w-[350px]">
                                                    <div className="text-[11px] leading-tight text-amber-700 flex items-start gap-1.5 bg-amber-50 px-2.5 py-1.5 rounded border border-amber-200 shadow-sm overflow-hidden">
                                                        <Icon name="alert-triangle" className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                                                        <span className="line-clamp-2">{vendorValidationMessage}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setIsCreateVendorModalOpen(true)}
                                                        className="px-3 py-1.5 shrink-0 bg-white hover:bg-amber-50 border border-amber-300 hover:border-amber-400 text-amber-700 rounded flex items-center justify-center font-medium shadow-sm transition-colors text-xs"
                                                    >
                                                        <Icon name="plus" className="w-3 h-3 mr-1" /> Create Vendor
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {isExtracting && (
                                <span className="text-sm text-gray-600 ml-4 border-l pl-4 border-gray-300">Processing… Please wait</span>
                            )}
                        </div>
                    </div>

                    {/* Data Table */}
                    {displayRows.length > 0 && (
                        <div className="flex-1 flex flex-col min-h-0 border rounded-[4px] mt-2">
                            {/* Single wrapper for both horizontal and vertical scrolling */}
                            <div className="overflow-auto max-h-[65vh]">
                                <table className="min-w-[1500px] w-full divide-y divide-gray-200 border-collapse">
                                    <thead className="sticky top-0 z-20">
                                        <tr className="bg-gray-50">
                                            {visibleColumns.map((col) => {
                                                const displayCol = col === 'Voucher Type Name' ? 'File Name' : col;
                                                return (
                                                    <th
                                                        key={col}
                                                        className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-r border-gray-200 last:border-r-0 whitespace-nowrap min-w-[150px]"
                                                    >
                                                        {displayCol}
                                                    </th>
                                                );
                                            })}
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


                                                {visibleColumns.map((col) => {
                                                    const isFieldItem = isItemField(col);
                                                    const cellValue = isFieldItem
                                                        ? getCellValue(row.item, col)
                                                        : getCellValue(row.header, col);

                                                    // Check if field was mapped confidently
                                                    const currentRes = invoiceResults[row.invoiceIdx];
                                                    const isMapped = isFieldItem
                                                        ? (col === 'S.No' || !!currentRes?.itemMapping?.[col])
                                                        : !!currentRes?.headerMapping?.[col];

                                                    return (
                                                        <td
                                                            key={col}
                                                            className="px-4 py-2 text-sm text-gray-900 border-r border-gray-100 last:border-r-0 truncate max-w-[300px]"
                                                            title={String(cellValue ?? '')}
                                                        >
                                                            <input
                                                                type="text"
                                                                value={String(cellValue ?? '')}
                                                                onChange={(e) => handleCellChange(row.invoiceIdx, row.itemIdx, col, e.target.value)}
                                                                className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm overflow-hidden text-ellipsis"
                                                            />
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="bg-gray-50 px-4 py-3 border-t mt-auto">
                                <p className="text-sm text-gray-700">
                                    📊 {displayRows.length} line item row{displayRows.length !== 1 ? 's' : ''} extracted.
                                    Each printed invoice row appears as a separate table row.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Inline Create Vendor Modal triggered during Upload to Finpixe */}
            {isCreateVendorModalOpen && extractedVendorData && (
                <CreateVendorModal
                    initialData={extractedVendorData}
                    onClose={() => setIsCreateVendorModalOpen(false)}
                    onSave={handleVendorCreated}
                />
            )}
        </div >
    );
};

export default InvoiceScannerModal;
