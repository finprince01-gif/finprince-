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
}

interface InvoiceScannerModalProps {
    onClose: () => void;
    onUpload?: (data: any[]) => void;
    initialFiles?: FileList | null;
    voucherType: string;
    extractionMode?: 'finpixe' | 'tally' | 'zoho' | 'sap';
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

const InvoiceScannerModal: React.FC<InvoiceScannerModalProps> = ({ onClose, onUpload, initialFiles, voucherType, extractionMode = 'finpixe', scanType = 'single', onExtractionSuccess }) => {
    // ── Columns definitions based on extractionMode & voucherType ──
    // ⚠️  extractionMode === 'tally' ONLY uses OFFICIAL_TALLY_VOUCHER_HEADERS
    //     These are strictly isolated official Tally Voucher export columns.
    //     They do NOT include Finpixe fields, DB columns, or calculated totals.
    const ALL_COLUMNS = extractionMode === 'tally'
        ? [...OFFICIAL_TALLY_VOUCHER_HEADERS]          // ✔ Official Tally Voucher headers only
        // De-duplicate: schema may list same label in multiple sections (e.g. IGST in items + summary)
        : [...new Set(VOUCHER_COLUMN_SCHEMAS[voucherType] || [...OFFICIAL_TALLY_VOUCHER_HEADERS].slice(0, 27))];


    const LINE_ITEM_FIELDS = [
        // ── Core item identification ──────────────────────────────────────────
        "Item Code", "Item Name", "HSN/SAC", "HSN Description", "Description", "Sales Ledger",
        "Item Description",
        // ── Quantity / Unit ───────────────────────────────────────────────────
        "Qty", "Quantity", "UOM", "UQC", "Alternate Unit",
        "Actual Quantity", "Billed Quantity", "Quantity UOM",
        // ── Foreign currency ──────────────────────────────────────────────────
        "Rate (FC)", "Amount (FC)",
        // ── INR pricing ───────────────────────────────────────────────────────
        "Item Rate", "Rate", "Taxable Value",
        "Item Rate per", "Disc%",
        // ── Tax columns ───────────────────────────────────────────────────────
        "CGST", "SGST", "SGST/UTGST", "IGST", "CESS", "Cess",
        "IGST Rate", "CGST Rate", "SGST/UTGST Rate",
        "Cess Rate", "Cess Rate Per Unit", "State Cess Rate",
        // ── Row total ─────────────────────────────────────────────────────────
        "Invoice Value", "Item Amount",
        // ── Tally-specific per-row fields ────────────────────────────────────
        "GST Rate Details", "GST Taxability Type",
        "Item Allocations - Tracking No.", "Item Allocations - Order No.", "Item Allocations - Batch/Lot No."
    ].filter(f => ALL_COLUMNS.includes(f));


    const HEADER_FIELDS = ALL_COLUMNS.filter(col => !LINE_ITEM_FIELDS.includes(col));
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);
    const processedFilesRef = useRef<FileList | File[] | null>(null);
    const uploadedFilesSetRef = useRef<Set<string>>(new Set());
    const [invoiceResults, setInvoiceResults] = useState<InvoiceResult[]>([]);
    const [isExtracting, setIsExtracting] = useState(false);
    const [uploadedFileNames, setUploadedFileNames] = useState<string[]>([]);
    const [estimatedExtractionTime, setEstimatedExtractionTime] = useState<number | null>(null);
    const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

    // ── Auto-Validate Vendor for Purchase Vouchers ───────────────────────────────
    const [vendorValidation, setVendorValidation] = useState<'IDLE' | 'VALIDATING' | 'FOUND' | 'NOT_FOUND' | 'GSTIN_CONFLICT'>('IDLE');
    const [vendorValidationMessage, setVendorValidationMessage] = useState<string>('');
    const [isCreateVendorModalOpen, setIsCreateVendorModalOpen] = useState(false);
    const [extractedVendorData, setExtractedVendorData] = useState<any>(null);

    const firstInvoiceVendorStr = invoiceResults.length > 0 && !isExtracting && voucherType === 'Purchase'
        ? String(invoiceResults[0].invoice['Vendor Name'] || '') + '|' + String(invoiceResults[0].invoice['GSTIN'] || '') + '|' + String(invoiceResults[0].invoice['Branch'] || '')
        : '';

    useEffect(() => {
        if (!firstInvoiceVendorStr || voucherType !== 'Purchase') {
            setVendorValidation('IDLE');
            return;
        }

        const checkVendor = async () => {
            if (extractionMode !== 'finpixe') return;
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

                const items = invoiceResults[0].items.filter((pi: any) => pi['Item Name'] || pi['Item Code'])
                    .map((pi: any) => ({
                        supplierItemCode: String(pi['Item Code'] || ''),
                        supplierItemName: String(pi['Item Name'] || ''),
                        hsnSac: String(pi['HSN/SAC'] || ''),
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

    const { incrementUsage, isLimitReached, subscriptionUsage } = useSubscriptionUsage();

    // ── Live countdown timer ──────────────────────────────────────────────────
    useEffect(() => {
        if (isExtracting && estimatedExtractionTime !== null) {
            setCountdownSeconds(Math.round(estimatedExtractionTime));
            const interval = setInterval(() => {
                setCountdownSeconds(prev => {
                    if (prev === null || prev <= 1) {
                        // Don't clear — keep at 0 until extraction finishes
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(interval);
        } else {
            setCountdownSeconds(null);
        }
    }, [isExtracting, estimatedExtractionTime]);

    // Auto-process initial files if provided
    useEffect(() => {
        if (initialFiles && initialFiles.length > 0 && processedFilesRef.current !== initialFiles) {
            processedFilesRef.current = initialFiles;
            processFiles(initialFiles);
        }
    }, [initialFiles]);

    const processFiles = async (files: FileList | File[]) => {
        if (isLimitReached && extractionMode === 'finpixe') {
            showError('❌ AI Extraction limit reached for your plan. Please upgrade to continue.');
            return;
        }

        const newFiles: File[] = [];
        const newNames: string[] = [];
        let duplicateFound = false;

        // Enforce single file for Finpixe Single Scan
        if (scanType === 'single' && files.length > 1) {
            showError('FINPIXE SINGLE SCAN allows only one invoice. Use FINPIXE BULK SCAN for multiple invoices.');
            return;
        }

        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const fileKey = `${f.name}*${f.size}*${f.lastModified}`;
            if (uploadedFilesSetRef.current.has(fileKey)) {
                duplicateFound = true;
            } else {
                uploadedFilesSetRef.current.add(fileKey);
                newFiles.push(f);
                newNames.push(f.name);
            }
        }

        if (duplicateFound) {
            showError('Duplicate invoice detected. This file has already been processed.');
        }

        if (newFiles.length === 0) return;

        setUploadedFileNames(prev => [...prev, ...newNames]);

        setIsExtracting(true);
        const fileCount = newFiles.length;
        try {
            if (fileCount > 0) {
                const avgRes = await apiService.getExtractionAverageTime();
                const avgTime = avgRes?.average_time_per_invoice || 3.85;
                const batchCount = Math.ceil(fileCount / 5); // 5 files concurrent
                setEstimatedExtractionTime(avgTime * batchCount);
            } else {
                setEstimatedExtractionTime(null);
            }
        } catch (error) {
            console.error("Failed to fetch avg extraction time", error);
            const batchCount = Math.ceil(fileCount / 5);
            setEstimatedExtractionTime(fileCount > 0 ? 3.85 * batchCount : null);
        }

        try {
            const allResults: InvoiceResult[] = [];
            let batchProcessedCount = 0;
            const CONCURRENCY_LIMIT = 4;

            for (let i = 0; i < newFiles.length; i += CONCURRENCY_LIMIT) {
                const batch = newFiles.slice(i, i + CONCURRENCY_LIMIT);

                const batchPromises = batch.map(async (file) => {
                    // Check subscription limit before initiating request
                    if (extractionMode === 'finpixe' && subscriptionUsage && subscriptionUsage.limit !== 'Unlimited') {
                        const limit = typeof subscriptionUsage.limit === 'string'
                            ? parseFloat(subscriptionUsage.limit)
                            : subscriptionUsage.limit;
                        if ((subscriptionUsage.used || 0) + batchProcessedCount >= limit) {
                            return { file, error: 'LIMIT_REACHED', success: false };
                        }
                    }

                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('voucher_type', voucherType);
                    formData.append('table_name', voucherType);
                    formData.append('columns', JSON.stringify(ALL_COLUMNS));
                    formData.append('extraction_mode', extractionMode || 'finpixe');


                    try {
                        const result = await httpClient.postFormData<any>('/api/ai/extract-invoice/', formData);
                        return { file, result, success: true };
                    } catch (err) {
                        return { file, error: err, success: false };
                    }
                });

                const batchResponses = await Promise.all(batchPromises);

                for (const response of batchResponses) {
                    if (response.error === 'LIMIT_REACHED') {
                        showError(`❌ AI Extraction limit reached.`);
                        continue;
                    }

                    batchProcessedCount++;
                    const file = response.file;

                    if (!response.success) {
                        console.error(`Extraction failed for ${file.name}:`, response.error);
                        showError(`❌ Extraction Failed for ${file.name}.`);
                        continue;
                    }

                    const result = response.result;
                    if (result.error) {
                        showError(`❌ Extraction Failed for ${file.name}: ${result.error}`);
                        continue;
                    }

                    if (result.duplicate) {
                        showInfo(`✨ ${file.name} already scanned — results loaded instantly.`);
                    }

                    // Normalize and Push — using enterprise engine v3
                    const normalizeResult = (res: any): InvoiceResult => {
                        // res = result.data = { invoice: { Date, Vendor Name, ... }, items: [...] }
                        // OR from multi-invoice: res = { Date, Vendor Name, items: [...] }
                        const resData = res.data || res;

                        // Extract the flat invoice-level fields
                        const invoicePart: Record<string, any> =
                            resData.invoice || resData.header || resData.header_fields ||
                            res.invoice || res.header || {};

                        // Merge summary_totals into the flat header
                        const summaryTotals: Record<string, any> =
                            resData.summary_totals || resData.summaryTotals ||
                            invoicePart.summary_totals || {};

                        // Build a CLEAN flat rawHeader: invoice fields + summary totals only
                        // Do NOT spread resData (which contains container keys like "invoice", "items")
                        const rawHeader: Record<string, any> = { 
                            ...invoicePart, 
                            ...summaryTotals,
                            voucher_type: resData.voucher_type || res.voucher_type || voucherType
                        };

                        // Strip any nested objects or arrays (keep only scalar values)
                        Object.keys(rawHeader).forEach(k => {
                            const v = rawHeader[k];
                            if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
                                delete rawHeader[k];
                            }
                        });


                        // Items come from resData, not from invoicePart
                        const rawItems: any[] = resData.items || resData.line_items || resData.lineItems ||
                            res.items || res.line_items || res.lineItems || [];

                        const vendorId = rawHeader['Vendor Name'] || rawHeader['vendor_name'] || rawHeader.sellerName || '';
                        const audit: AuditEvent[] = [];

                        // ── Header Mapping ── (pass actual field keys, not container keys)
                        const headerKeys = Object.keys(rawHeader) as string[];
                        const hResult = runMappingEngine(headerKeys, HEADER_FIELDS, vendorId, audit);

                        // ── Item Mapping ──
                        const itemKeys = rawItems.length > 0 ? Object.keys(rawItems[0]) : [];
                        const iResult = runMappingEngine(itemKeys, LINE_ITEM_FIELDS, vendorId, audit);

                        // ── 7️⃣ Structural Integrity Validation ──
                        const allDecisions = [...hResult.decisions, ...iResult.decisions];
                        const allSwaps = [...hResult.swapSuspicions, ...iResult.swapSuspicions];
                        const combinedMapping = { ...hResult.mapping, ...iResult.mapping };
                        const structuralViolations = validateStructuralIntegrity(
                            combinedMapping, allDecisions, allSwaps,
                            [...HEADER_FIELDS, ...LINE_ITEM_FIELDS], audit
                        );

                        // ── Build normalized header ──
                        // Use EXACT MATCH first (field name = key in rawHeader), then mapping engine
                        const normalizedHeader: Record<string, string> = {};
                        HEADER_FIELDS.forEach(field => {
                            let val: any;
                            // 1. Exact match — backend already uses correct column names
                            if (rawHeader[field] !== undefined && rawHeader[field] !== null) {
                                val = rawHeader[field];
                            }
                            // 2. Mapping engine resolved a source key
                            else {
                                const sourceKey = hResult.mapping[field];
                                if (sourceKey) val = rawHeader[sourceKey];
                            }
                            if (typeof val === 'number') val = String(val);
                            if (field.includes('Total') || field.includes('Value') || field.includes('Amount')) {
                                val = coerceNumber(val);
                            }
                            normalizedHeader[field] = (val !== undefined && val !== null) ? String(val) : '';
                        });

                        // ── 7.5 Tally-specific field fallbacks (to fill common missing fields) ──
                        if (extractionMode === 'tally') {
                            // Mirror Date -> Reference Date if only one exists
                            if (!normalizedHeader['Reference Date'] && normalizedHeader['Voucher Date']) {
                                normalizedHeader['Reference Date'] = normalizedHeader['Voucher Date'];
                            } else if (normalizedHeader['Reference Date'] && !normalizedHeader['Voucher Date']) {
                                normalizedHeader['Voucher Date'] = normalizedHeader['Reference Date'];
                            }
                            // Mirror Number -> Reference No if only one exists (common for supplier invoices)
                            if (!normalizedHeader['Reference No.'] && normalizedHeader['Voucher Number']) {
                                normalizedHeader['Reference No.'] = normalizedHeader['Voucher Number'];
                            } else if (normalizedHeader['Reference No.'] && !normalizedHeader['Voucher Number']) {
                                normalizedHeader['Voucher Number'] = normalizedHeader['Reference No.'];
                            }
                        }


                        // ── Build normalized items ──
                        const normalizedItems = rawItems.map((item: any, idx: number) => {
                            const normalizedItem: any = {};
                            LINE_ITEM_FIELDS.forEach(field => {
                                if (field === 'S.No') { normalizedItem[field] = String(idx + 1); return; }
                                let val: any;
                                // 1. Exact match
                                if (item[field] !== undefined && item[field] !== null) {
                                    val = item[field];
                                }
                                // 2. Mapping engine
                                else {
                                    const sourceKey = iResult.mapping[field];
                                    if (sourceKey) val = item[sourceKey];
                                }
                                const numericFields = ['Quantity', 'Rate', 'Item Rate', 'Disc %', 'Disc Amount',
                                    'Taxable Value', 'Taxable Amount', 'GST %', 'GST Rate', 'Item Amount',
                                    'IGST', 'CGST', 'SGST/UTGST', 'Invoice Value', 'Cess'];
                                if (numericFields.some(nf => field.startsWith(nf))) {
                                    val = coerceNumber(val);
                                }
                                normalizedItem[field] = (val !== undefined && val !== null) ? String(val) : '';
                            });
                            return normalizedItem;
                        });

                        console.log('[MappingEngine v3] Audit:', { hResult, iResult, structuralViolations });
                        if (hResult.ambiguities.length > 0 || iResult.ambiguities.length > 0) {
                            console.warn('[MappingEngine v3] AMBIGUITIES DETECTED:', [...hResult.ambiguities, ...iResult.ambiguities]);
                        }
                        if (allSwaps.length > 0) {
                            console.warn('[MappingEngine v3] SWAP SUSPICIONS:', allSwaps);
                        }

                        return {
                            invoice: normalizedHeader,
                            items: normalizedItems,
                            headerMapping: hResult.mapping,
                            itemMapping: iResult.mapping,
                        };
                    };

                    // ── Multi-invoice PDF: backend split the PDF into N invoices ──────
                    if (result.success && result.multi_invoice && Array.isArray(result.results)) {
                        console.log(`[InvoiceScanner] Multi-invoice PDF: ${result.invoice_count} invoices detected`);
                        for (const invResult of result.results) {
                            if (invResult.error) {
                                console.warn('[InvoiceScanner] Error in split invoice:', invResult.error);
                                continue;
                            }
                            if (invResult.success && invResult.data) {
                                batchProcessedCount++;
                                const normalised = normalizeResult(invResult.data);
                                normalised.cacheRecordId = invResult.cache_record_id ?? null;
                                allResults.push(normalised);
                            }
                        }
                    } else if (result.success && result.data) {
                        batchProcessedCount++;
                        const normalised = normalizeResult(result.data);
                        // Persist the cache record id so edits can be synced back
                        normalised.cacheRecordId = result.cache_record_id ?? null;
                        allResults.push(normalised);
                    } else if (result.reply) {
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
                        const normalised = normalizeResult(parsedData);
                        // cache_record_id may also be present on reply responses
                        normalised.cacheRecordId = result.cache_record_id ?? null;
                        allResults.push(normalised);
                    } else {
                        showError(`❌ No data received from backend for ${file.name}`);
                    }
                }
            }


            setInvoiceResults(prev => [...prev, ...allResults]);

            if (allResults.length > 0 && onExtractionSuccess) {
                const firstRow = allResults[0].invoice;
                const extractedData = {
                    vendor_name: firstRow['Vendor Name'] || firstRow['Bill From'] || firstRow['Buyer/Supplier - Mailing Name'] || '',
                    gstin: firstRow['GSTIN'] || '',
                    branch: firstRow['Branch'] || '',
                    bill_from: firstRow['Bill From'] || firstRow['Buyer/Supplier - Address'] || firstRow['Bill From - Address Line 1'] || '',
                    state: firstRow['State'] || firstRow['Billing State'] || firstRow['Bill From - State'] || ''
                };
                onExtractionSuccess(extractedData);
            }
        } catch (error) {
            showError(`❌ Extraction Failed: ${(error as Error).message}. Please try again.`);
        } finally {
            setIsExtracting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ── Upload directly (no risk dashboard) ──────────────────────────────────────
    const handleUploadToFinpixe = () => {
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

                // Once the vendor is created, automatically continue the Upload to Finpixe process.
                setTimeout(() => {
                    handleUploadToFinpixe();
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
                    row[col] = LINE_ITEM_FIELDS.includes(col)
                        ? ((item as any)[col] ?? '')
                        : (res.invoice[col] ?? '');
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
                    row[col] = LINE_ITEM_FIELDS.includes(col)
                        ? String((item as any)[col] ?? '')
                        : String((res.invoice as any)[col] ?? '');
                });
                allRows.push(row);
            });
        });

        // For Tally: always export ALL columns. For other modes: active columns only.
        const exportCols = extractionMode === 'tally'
            ? ALL_COLUMNS
            : ALL_COLUMNS.filter(col =>
                allRows.some(row => row[col] !== '' && row[col] !== undefined)
            );

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

            if (LINE_ITEM_FIELDS.includes(col)) {
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

            // ── Persist edit to OCR cache (fire-and-forget, non-blocking) ─────
            if (res.cacheRecordId) {
                apiService.updateOcrCache(res.cacheRecordId, {
                    invoice: res.invoice,
                    items: res.items,
                }).catch((err: any) => {
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
    const modalTitle = isSingleScan
        ? 'Finpixe Single Scan – Invoice Scanner'
        : 'Finpixe Bulk Scan – Invoice Scanner';
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
                                <div className="flex flex-col justify-center px-6 py-2">
                                    <div className="flex items-center gap-2 text-sm font-medium text-indigo-600">
                                        <Icon name="spinner" className="w-5 h-5 animate-spin" />
                                        <span>Processing invoices...</span>
                                    </div>
                                    {countdownSeconds !== null && (
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
                                    {extractionMode === 'finpixe' && (

                                        <div className="flex items-center">
                                            <button
                                                onClick={handleUploadToFinpixe}
                                                disabled={displayRows.length === 0 || vendorValidation === 'VALIDATING'}
                                                className={`inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-[4px] border-slate-200 text-white transition-colors ${displayRows.length === 0 || vendorValidation === 'VALIDATING' ? 'bg-gray-400 cursor-not-allowed opacity-75' : 'bg-emerald-600 hover:bg-emerald-700'
                                                    }`}
                                            >
                                                {vendorValidation === 'VALIDATING' ? <Icon name="spinner" className="w-5 h-5 mr-2 animate-spin" /> : <Icon name="check-circle" className="w-5 h-5 mr-2" />}
                                                Upload to Finpixe
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
                                            {visibleColumns.map((col) => (
                                                <th
                                                    key={col}
                                                    className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-r border-gray-200 last:border-r-0 whitespace-nowrap min-w-[150px]"
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


                                                {visibleColumns.map((col) => {
                                                    const isItemField = LINE_ITEM_FIELDS.includes(col);
                                                    const cellValue = isItemField
                                                        ? (row.item as any)[col]
                                                        : (row.header as any)[col];

                                                    // Check if field was mapped confidently
                                                    const currentRes = invoiceResults[row.invoiceIdx];
                                                    const isMapped = isItemField
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
