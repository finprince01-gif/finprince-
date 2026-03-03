import React, { useState, useRef, useEffect } from 'react';
import { httpClient } from '../services/httpClient';
import { apiService } from '../services';
import { showError, showSuccess } from '../utils/toast';
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

declare const XLSX: any;

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
}

interface InvoiceScannerModalProps {
    onClose: () => void;
    onUpload?: (data: any[]) => void;
    initialFiles?: FileList | null;
    voucherType: string;
    extractionMode?: 'finpixe' | 'tally';
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

const InvoiceScannerModal: React.FC<InvoiceScannerModalProps> = ({ onClose, onUpload, initialFiles, voucherType, extractionMode = 'finpixe', onExtractionSuccess }) => {
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
        // ── Quantity / Unit ───────────────────────────────────────────────────
        "Qty", "Quantity", "UOM", "UQC", "Alternate Unit",
        // ── Foreign currency ──────────────────────────────────────────────────
        "Rate (FC)", "Amount (FC)",
        // ── INR pricing ───────────────────────────────────────────────────────
        "Item Rate", "Rate", "Taxable Value",
        // ── Tax columns ───────────────────────────────────────────────────────
        "CGST", "SGST", "SGST/UTGST", "IGST", "CESS", "Cess",
        "IGST Rate", "CGST Rate", "SGST/UTGST Rate",
        "Cess Rate", "Cess Rate Per Unit", "State Cess Rate",
        // ── Row total ─────────────────────────────────────────────────────────
        "Invoice Value", "Item Amount",
        // ── Tally-specific per-row fields ────────────────────────────────────
        "GST Rate Details", "GST Taxability Type"
    ].filter(f => ALL_COLUMNS.includes(f));

    const HEADER_FIELDS = ALL_COLUMNS.filter(col => !LINE_ITEM_FIELDS.includes(col));
    const fileInputRef = useRef<HTMLInputElement>(null);
    const processedFilesRef = useRef<FileList | null>(null);
    const [invoiceResults, setInvoiceResults] = useState<InvoiceResult[]>([]);
    const [isExtracting, setIsExtracting] = useState(false);
    const [uploadedFileNames, setUploadedFileNames] = useState<string[]>([]);
    const [estimatedExtractionTime, setEstimatedExtractionTime] = useState<number | null>(null);
    const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

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
            const names = Array.from(initialFiles).map((f) => f.name);
            setUploadedFileNames((prev) => [...prev, ...names]);
            processFiles(initialFiles);
        }
    }, [initialFiles]);

    const processFiles = async (files: FileList) => {
        if (isLimitReached) {
            showError('❌ AI Extraction limit reached for your plan. Please upgrade to continue.');
            return;
        }

        setIsExtracting(true);
        const fileCount = files.length;
        try {
            if (fileCount > 0) {
                const avgRes = await apiService.getExtractionAverageTime();
                const avgTime = avgRes?.average_time_per_invoice || 3.85;
                setEstimatedExtractionTime(avgTime * fileCount);
            } else {
                setEstimatedExtractionTime(null);
            }
        } catch (error) {
            console.error("Failed to fetch avg extraction time", error);
            setEstimatedExtractionTime(fileCount > 0 ? 3.85 * fileCount : null);
        }

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
                formData.append('voucher_type', voucherType);
                formData.append('table_name', voucherType);
                formData.append('columns', JSON.stringify(ALL_COLUMNS));

                try {
                    const result = await httpClient.postFormData<any>('/api/ai/extract-invoice/', formData);

                    if (result.error) throw new Error(result.error);

                    // Normalize and Push — using enterprise engine v3
                    const normalizeResult = (res: any): InvoiceResult => {
                        console.log('[InvoiceScanner] Raw AI Result:', res);

                        const resData = res.data || res;
                        const summaryTotals = resData.summary_totals || resData.summaryTotals || {};

                        // Merge summary totals into the header object for mapping
                        const rawHeader = {
                            ...(res.invoice || res.header || res.header_fields || {}),
                            ...resData,
                            ...summaryTotals
                        };
                        // Remove items from rawHeader if it was just resData
                        delete (rawHeader as any).items;
                        delete (rawHeader as any).line_items;

                        const rawItems = resData.items || resData.line_items || resData.lineItems || res.items || res.line_items || res.lineItems || [];
                        const vendorId = rawHeader['Vendor Name'] || rawHeader.sellerName || res.sellerName || '';
                        const audit: AuditEvent[] = [];

                        // ── Header Mapping ──
                        const headerKeys = Array.from(new Set([...Object.keys(res), ...Object.keys(rawHeader)])) as string[];
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
                        const normalizedHeader: Record<string, string> = {};
                        HEADER_FIELDS.forEach(field => {
                            const sourceKey = hResult.mapping[field];
                            let val = sourceKey ? (res[sourceKey] ?? rawHeader[sourceKey]) : undefined;
                            // ── Direct exact-match fallback: if mapping engine missed it but AI returned it ──
                            if ((val === undefined || val === null || val === '') && rawHeader[field] !== undefined) {
                                val = rawHeader[field];
                            }
                            if (typeof val === 'number') val = String(val);
                            if (field.includes('Total') || field.includes('Value') || field.includes('Amount')) {
                                val = coerceNumber(val);
                            }
                            normalizedHeader[field] = (val !== undefined && val !== null) ? String(val) : '';
                        });

                        // ── Build normalized items ──
                        const normalizedItems = rawItems.map((item: any, idx: number) => {
                            const normalizedItem: any = {};
                            LINE_ITEM_FIELDS.forEach(field => {
                                if (field === 'S.No') { normalizedItem[field] = String(idx + 1); return; }
                                const sourceKey = iResult.mapping[field];
                                let val = sourceKey ? item[sourceKey] : undefined;
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

                    if (result.success && result.data) {
                        incrementUsage(1);
                        batchProcessedCount++;
                        allResults.push(normalizeResult(result.data));
                    } else if (result.reply) {
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
                        allResults.push(normalizeResult(parsedData));
                    } else {
                        throw new Error('No data received from backend');
                    }
                } catch (err) {
                    console.error(`Extraction failed for ${file.name}:`, err);
                    throw err;
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


    const handleDownloadExcel = () => {
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

        // Keep only columns that have at least one non-empty value (mirrors what's visible)
        const activeCols = ALL_COLUMNS.filter(col =>
            allRows.some(row => row[col] !== '' && row[col] !== undefined && row[col] !== null)
        );

        // Rebuild rows with only the active columns — no '#' column
        const excelRows = allRows.map(row => {
            const out: Record<string, string> = {};
            activeCols.forEach(col => { out[col] = row[col]; });
            return out;
        });

        const ws = XLSX.utils.json_to_sheet(excelRows, { header: activeCols });
        ws['!cols'] = activeCols.map((h) => ({ wch: Math.max(h.length, 14) }));
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

        // Keep only columns with actual data — no '#' column
        const activeCols = ALL_COLUMNS.filter(col =>
            allRows.some(row => row[col] !== '' && row[col] !== undefined)
        );
        let csvContent = activeCols.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';

        allRows.forEach(row => {
            const cells = activeCols.map(col => {
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

        const names = Array.from(files).map((f) => f.name);
        setUploadedFileNames((prev) => [...prev, ...names]);

        // Reset processed ref for manual file changes
        processedFilesRef.current = null;
        processFiles(files);
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
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">

            <div className="bg-white rounded-[4px] shadow-none border border-slate-200 w-full max-w-7xl max-h-[90vh] flex flex-col">

                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b">
                    <div className="flex flex-col overflow-hidden mr-4 max-w-[80%]">
                        <h2 className="text-2xl font-bold text-gray-800 shrink-0">Invoice Scanner</h2>
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
                        <div className="flex items-center gap-4">
                            {!isExtracting || invoiceResults.length > 0 ? (
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isExtracting}
                                    className={`inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-[4px] border border-slate-200 text-white ${isExtracting ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                                >
                                    <Icon
                                        name={isExtracting ? 'spinner' : 'upload'}
                                        className={`w-5 h-5 mr-2 ${isExtracting ? 'animate-spin' : ''}`}
                                    />
                                    {isExtracting ? 'Extracting...' : 'Add More Invoices'}
                                </button>
                            ) : (
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

                            {invoiceResults.length > 0 && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleDownloadExcel}
                                        className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-[4px] border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700"
                                    >
                                        <Icon name="download" className="w-5 h-5 mr-2" />
                                        Download Excel
                                    </button>
                                    <button
                                        onClick={handleDownloadCSV}
                                        className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-[4px] border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700"
                                    >
                                        <Icon name="download" className="w-5 h-5 mr-2" />
                                        Download CSV
                                    </button>
                                    {extractionMode !== 'tally' && (
                                        <button
                                            onClick={handleUploadToFinpixe}
                                            disabled={displayRows.length === 0}
                                            className={`inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-[4px] border border-slate-200 text-white ${displayRows.length === 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
                                                }`}
                                        >
                                            <Icon name="check-circle" className="w-5 h-5 mr-2" />
                                            Upload to Finpixe
                                        </button>
                                    )}
                                </div>
                            )}

                            {isExtracting && (
                                <span className="text-sm text-gray-600">Processing… Please wait</span>
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
        </div>
    );
};

export default InvoiceScannerModal;
