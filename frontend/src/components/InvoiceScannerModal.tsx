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
    // Official Tally Voucher headers â€” isolated in tallyVoucherSchema.ts
    // SCOPE: Upload Invoices â†’ Tally â†’ Voucher ONLY
    OFFICIAL_TALLY_VOUCHER_HEADERS,
    VOUCHER_COLUMN_SCHEMAS,
    type IngestionReport,
    type MappingDecision,
    type AuditEvent,
} from '../services/mappingEngine';
import { getVoucherSchema, getVoucherFlatHeaders, type VoucherSchema, type SchemaField } from '../configs/schemaConfig';
import CreateVendorModal from './CreateVendorModal';
import Icon from './Icon';

import { getXLSX } from '../utils/xlsx';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Types
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface LineItem {
    [key: string]: string;
}

interface InvoiceResult {
    invoice: Record<string, string>;
    items: LineItem[];
    headerMapping: Record<string, string>;
    itemMapping: Record<string, string>;
    report?: IngestionReport;
    /** id column from invoice_ocr_temp â€” present when result was served from cache or freshly saved */
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Local coercion helper (used in CSV/Excel path; heavy logic lives in mappingEngine.ts)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const coerceNumber = (val: any): string => {
    if (val === undefined || val === null) return '';
    const cleaned = String(val).replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? '' : String(num);
};

// â”€â”€â”€ Risk Dashboard Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const RiskBadge: React.FC<{ level: 'Low' | 'Medium' | 'High' }> = ({ level }) => {
    const styles = {
        Low: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
        Medium: 'bg-amber-100 text-amber-800 border border-amber-300',
        High: 'bg-red-100 text-red-800 border border-red-300',
    };
    const icons = { Low: 'âœ…', Medium: 'âš ï¸', High: 'ðŸš¨' };
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
                        <span className="text-2xl">ðŸ“Š</span>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Ingestion Risk Report</h2>
                            <p className="text-xs text-gray-500">Schema v{report.schemaVersion} Â· {new Date(report.timestamp).toLocaleString()}</p>
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
                            <h3 className="font-semibold text-red-800 mb-2">ðŸš« Submission Blocked</h3>
                            <ul className="space-y-1">
                                {report.blockReasons.map((r, i) => (
                                    <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                                        <span className="mt-0.5">â€¢</span> {r}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Financial Validation */}
                    {(errors.length > 0 || warnings.length > 0) && (
                        <div>
                            <h3 className="font-semibold text-gray-800 mb-2">ðŸ’° Financial Integrity</h3>
                            <div className="space-y-1.5">
                                {[...errors, ...warnings].map((v, i) => (
                                    <div key={i} className={`flex items-start gap-2 text-xs px-3 py-2 rounded border
                                        ${v.severity === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                                        <span>{v.severity === 'error' ? 'âŒ' : 'âš ï¸'}</span>
                                        <div>
                                            <span className="font-medium">{v.rule}</span>
                                            {v.expected !== undefined && (
                                                <span className="ml-2">Expected {v.expected?.toFixed(2)} Â· Got {v.actual?.toFixed(2)} Â· Î” {v.discrepancy?.toFixed(2)}</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Mapping Table */}
                    <details className="border rounded-lg overflow-hidden" open>
                        <summary className="px-4 py-2 bg-gray-50 font-semibold text-sm cursor-pointer">ðŸ—ºï¸ Mapping Decisions ({report.mappedFields.length})</summary>
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
                                âš ï¸ Unmapped Fields ({report.unmappedFields.length})
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
                                        <span className="text-red-500 font-medium">[REJECTED]</span> {c.source} â†’ {c.target} (score {c.score})
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
                            âœ… Confirm & Upload
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




// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Component
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Tally Item Columns helper
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TALLY_ITEM_HEADERS = [
    'Item Name', 'Item Description', 'Actual Quantity', 'Billed Quantity',
    'Quantity UOM', 'Item Rate', 'Item Rate per', 'Disc%', 'Item Amount',
    'MRP/Marginal', 'HSN/SAC', 'GST Classification', 'IGST Rate', 'CGST Rate',
    'SGST/UTGST Rate', 'Cess Rate', 'Taxable Value', 'HSN Description'
];

const InvoiceScannerModal: React.FC<InvoiceScannerModalProps> = ({ onClose, onUpload, initialFiles, voucherType, extractionMode = 'ai_native', scanType = 'single', onExtractionSuccess }) => {
    // â”€â”€ Columns definitions based on extractionMode & voucherType â”€â”€
    const schema = getVoucherSchema(voucherType) as VoucherSchema;
    // â”€â”€ Zoho Specific Columns â”€â”€
    const ZOHO_COLUMNS = [
        'Date', 'Invoice No', 'Name', 'GSTIN', 'Branch', 'Place of Supply', 'Bill Address From', 'Bill Address To',
        'Total Taxable Value', 'Total Invoice Value', 'Total IGST', 'Total CGST', 'Total SGST/UTGST',
        'Item Name', 'HSN/SAC', 'Qty', 'UOM', 'Item Rate', 'Taxable Value',
        'IGST', 'CGST', 'SGST/UTGST', 'Invoice Value', 'IRN', 'Ack. No.', 'Ack. Date', 'Folder Path'
    ];

    const ALL_COLUMNS = extractionMode === 'tally'
        ? [...OFFICIAL_TALLY_VOUCHER_HEADERS]          // âœ” Official Tally Voucher headers only
        : (extractionMode === 'zoho' ? ZOHO_COLUMNS : getVoucherFlatHeaders(voucherType));

    const LINE_ITEM_FIELDS = (schema.sections.items as SchemaField[] | undefined)?.map(f => f.label) || [];
    const HEADER_FIELDS = Object.entries(schema.sections)
        .filter(([name]) => name !== 'items')
        .flatMap(([, fields]) => (fields as SchemaField[]).map(f => f.label));

    const isItemField = (col: string) => {
        return LINE_ITEM_FIELDS.includes(col) || (extractionMode === 'tally' && TALLY_ITEM_HEADERS.includes(col));
    };

    // â”€â”€ Centralized Zoho Mapping Resolver â”€â”€
    const resolveZohoValue = (header: any, item: any, col: string): string => {
        const isItem = isItemField(col);

        // Rule: Address resolution (Ensure From/To distinction)
        if (col === "Bill Address From" || col === "Bill From Address" || col === "Bill From") {
            console.log("bill_from:", header.bill_from);
            return header.bill_from || header.vendor_address || header.bill_address_from || header['Bill Address From'] || "";
        }


        if (col === "Bill Address To") {
            const val = getCellValue(header, "Bill Address To") ||
                getCellValue(header, "billing_address") ||
                getCellValue(header, "bill_to_address") ||
                getCellValue(item, "billing_address") ||
                getCellValue(item, "bill_to_address") ||
                '';
            return val;
        }

        // Rule: Invoice Value -> Header Total (ONLY for ai_native mode table display)
        if (col === "Folder Path") {
            return header.folder_path || header.file_path || "";
        }

        return isItem ? getCellValue(item, col) : getCellValue(header, col);
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

    // -- Centralized Countdown Timer Effect --
    useEffect(() => {
        if (!isExtracting) {
            setCountdownSeconds(null);
            return;
        }

        const timer = setInterval(() => {
            setCountdownSeconds(prev => {
                if (prev === null || prev <= 0) return 0;
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isExtracting]);

    // â”€â”€ Auto-Validate Vendor for Purchase Vouchers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const [vendorValidation, setVendorValidation] = useState<'IDLE' | 'VALIDATING' | 'FOUND' | 'NOT_FOUND' | 'GSTIN_CONFLICT'>('IDLE');
    const [vendorValidationMessage, setVendorValidationMessage] = useState<string>('');
    const [isCreateVendorModalOpen, setIsCreateVendorModalOpen] = useState(false);
    const [extractedVendorData, setExtractedVendorData] = useState<any>(null);

    // -- Bulk Job State --
    const [bulkJobId, setBulkJobId] = useState<number | null>(null);
    const [bulkStatus, setBulkStatus] = useState<{ total: number; processed: number; failed: number; pending: number; status: string; progress: number; completed: boolean } | null>(null);
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const startTimeRef = useRef<number | null>(null);
    // Cancellation flag â€” set to true to abort an in-progress polling loop
    const cancelExtractionRef = useRef<boolean>(false);

    const activePollIdRef = useRef<number>(0);
    // Guard: once FINALIZED, prevent any fetchStagingData from clearing invoiceResults
    const isFinalizedRef = useRef<boolean>(false);

    const handleCancelExtraction = () => {
        // 1. Signal the polling loop to stop immediately
        activePollIdRef.current += 1; // Monotonic increment to invalidate current loop
        cancelExtractionRef.current = true;
        // 2. Clear any pending setTimeout
        if (pollingIntervalRef.current) {
            clearTimeout(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
        // 3. Reset all extraction UI state
        setIsExtracting(false);
        setBulkStatus(null);
        setBulkJobId(null);
        setCountdownSeconds(null);
        startTimeRef.current = null;
        // 4. Send cancellation signal to backend to stop workers and update Redis/DB state
        if (uploadSessionIdRef.current) {
            httpClient.post('/api/ocr-staging-cancel/', { session_id: uploadSessionIdRef.current })
                .then(() => console.log(`[CANCEL_API] Successfully sent cancel signal for session: ${uploadSessionIdRef.current}`))
                .catch(err => console.error(`[CANCEL_API] Failed to cancel session:`, err));
        }

        // 5. Rotate the session ID so the NEXT upload starts with a clean session
        const newId = String(Date.now());
        uploadSessionIdRef.current = newId;
        console.log(`[CANCEL] Extraction cancelled. New session allocated: ${newId}`);
    };


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
            const vendorCategory = firstRow['Vendor Category'] || firstRow['vendor_category'] || '';

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
                    setExtractedVendorData({ vendor_name: vendorName, gstin, state, address: billFrom, branch, vendor_category: vendorCategory, supplier_items: items.length > 0 ? items : undefined });
                } else if (res?.status === 'GSTIN_CONFLICT') {
                    setVendorValidation('GSTIN_CONFLICT');
                    setVendorValidationMessage(res.message);
                    setExtractedVendorData({ vendor_name: vendorName, gstin, state, address: billFrom, branch, vendor_category: vendorCategory, supplier_items: items.length > 0 ? items : undefined });
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
            'invoice_no': ['Invoice No', 'Supplier Invoice No.', 'Supplier Invoice No', 'Voucher Number', 'Inv No', 'Bill No', 'Reference No.', 'Sales Invoice No'],
            'reference_no': ['Reference No.', 'Reference', 'Ref No', 'Supplier Invoice No.'],
            'vendor_name': ['Name', 'Vendor Name', 'Supplier Name', 'Party Name', 'Party', 'Customer Name', 'Buyer/Supplier - Mailing Name'],
            'bill_from': ['Bill Address From', 'Bill From', 'Bill From Address', 'Ship From Address', 'Dispatch From Address', 'vendor_address', 'Address', 'Supplier Address', 'Consignee Address'],
            'bill_to_address': ['Bill Address To', 'Billing Address', 'Customer Address', 'Buyer Address', 'bill_to', 'billing_address'],
            'billing_address': ['Bill Address To', 'Billing Address', 'Customer Address', 'Buyer Address', 'Ship To Address', 'Consignee Address', 'bill_to_address'],
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
            'branch': ['Branch', 'Branch Name', 'branch', 'Branch '],
            'pos': ['Place of Supply', 'Bill From - State', 'State', 'POS', 'State Type', 'Buyer/Supplier - State', 'Buyer/Supplier - Place of Supply', 'place_of_supply'],
            'sales_order_no': ['Sales Order No', 'Purchase Order No', 'PO No', 'Order No'],

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
            'irn': ['IRN', 'Invoice Reference Number', 'irn'],
            'ack_no': ['Ack. No.', 'Ack No', 'Ack No.', 'Acknowledgement No', 'ack_no', 'ack_no_'],
            'ack_date': ['Ack. Date', 'Ack Date', 'Ack Date.', 'Acknowledgement Date', 'ack_date', 'ack_date_'],
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
        if (initialFiles && initialFiles.length > 0 && processedFilesRef.current !== initialFiles) {
            processedFilesRef.current = initialFiles;
            processFiles(initialFiles);
        }
    }, [initialFiles]);

    const processFiles = async (files: FileList | File[]) => {
        if (isExtracting) return;
        setIsExtracting(true);
        // Reset cancellation flag for this new extraction run
        cancelExtractionRef.current = false;
        // ALWAYS rotate session ID on each new upload.
        // This prevents fetchStagingData from accidentally reading data from a
        // previous (potentially cancelled) session when the new job completes.
        const newId = String(Date.now());
        uploadSessionIdRef.current = newId;
        console.log(`[SESSION ROTATED] New session for upload: ${newId}`);
        // Clear any results from a previous extraction so the UI is clean
        setInvoiceResults([]);
        setBulkStatus(null);
        setBulkJobId(null);

        const newFiles: File[] = [];
        const newNames: string[] = [];

        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            newFiles.push(f);
            newNames.push(f.name);
        }

        if (newFiles.length === 0) { setIsExtracting(false); return; }

        setUploadedFileNames(prev => [...prev, ...newNames]);

        // â”€â”€ "File Analysis" Estimation Logic (Replicated from Purchase Scan) â”€â”€
        let estimatedTasks = 0;
        newFiles.forEach(f => {
            if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
                // Estimate ~100KB per page as a heuristic
                estimatedTasks += Math.max(1, Math.ceil(f.size / 100000));
            } else {
                estimatedTasks += 1;
            }
        });

        let avgTime = 3.85; // Default fallback
        try {
            const avgRes = await apiService.getExtractionAverageTime();
            if (avgRes && avgRes.average_time_per_invoice) {
                avgTime = avgRes.average_time_per_invoice;
            }
        } catch (e) {
            console.warn("Failed to fetch average time, using fallback:", e);
        }

        // Backend uses parallel workers. Current worker pool limit is 2 per instance.
        const batchCount = Math.ceil(estimatedTasks / 2);
        const zohoBuffer = extractionMode === 'zoho' ? 15 : 0;
        const initialEstimate = Math.round(batchCount * avgTime) + 5 + zohoBuffer;

        setEstimatedExtractionTime(initialEstimate);
        setCountdownSeconds(initialEstimate);

        try {
            // uploadSessionIdRef is already set to a fresh ID at the top of processFiles.
            // We just read it here â€” no conditional generation needed.
            const currentSessionId = uploadSessionIdRef.current!; // guaranteed non-null (set above)
            console.log(`[SESSION USED FOR UPLOAD] ${currentSessionId}`);

            const isOthersMode = extractionMode !== 'ai_native';
            
            // â”€â”€ [PHASE 4] DIRECT S3 UPLOAD FLOW â”€â”€
            // Decouples API from byte-stream handling to prevent memory exhaustion
            const sessionIds: string[] = [];
            const filePaths: string[] = [];
            
            if (!isOthersMode) {
                showInfo(`ðŸ“¤ Preparing direct S3 upload for ${newFiles.length} files...`);
                for (let i = 0; i < newFiles.length; i++) {
                    const f = newFiles[i];
                    try {
                        // 1. Request Presigned Policy
                        const policyRes = await apiService.getS3UploadPolicy(f.name);
                        // 2. Direct Upload to S3 (Bypass Django)
                        await apiService.uploadToS3(policyRes.policy.url, policyRes.policy.fields, f);
                        // 3. Collect metadata reference
                        sessionIds.push(policyRes.session_id);
                        filePaths.push((f as any).webkitRelativePath || f.name);
                        console.log(`[S3_DIRECT_SUCCESS] ${f.name} -> ${policyRes.session_id}`);
                    } catch (err) {
                        console.error(`[S3_DIRECT_FAILED] ${f.name}:`, err);
                        throw new Error(`Failed to upload ${f.name} to S3.`);
                    }
                }
            }

            const formData = new FormData();
            
            if (sessionIds.length > 0) {
                // Metadata-only upload (Hardened Path)
                sessionIds.forEach(id => formData.append('session_ids', id));
                filePaths.forEach(p => formData.append('file_paths', p));
            } else {
                // Legacy Fallback / Others Mode
                newFiles.forEach(f => {
                    formData.append('files', f);
                    const relPath = (f as any).webkitRelativePath || '';
                    if (relPath) {
                        formData.append('file_paths', relPath);
                    }
                });
            }

            formData.append('upload_session_id', currentSessionId);
            formData.append('voucher_type', voucherType);

            // [UPLOAD_TYPE PROPAGATION FIX] Map extractionMode → upload_type for backend routing
            const uploadTypeMap: Record<string, string> = {
                'ai_native': 'PURCHASE',
                'zoho': 'ZOHO',
                'tally': 'TALLY',
                'sap': 'SAP',
            };
            const derivedUploadType = uploadTypeMap[extractionMode] || 'PURCHASE';
            formData.append('upload_type', derivedUploadType);

            if (isOthersMode) {
                formData.append('no_persist', 'true');
            }

            console.log(`[UPLOAD STARTED] Files: ${newFiles.length} | Session: ${currentSessionId}`);
            const response = await httpClient.postFormData<any>('/api/bulk-upload/', formData);

            if (isOthersMode && response.results) {
                // Map results immediately (they are already extracted and deleted from DB)
                handleInstantResults(response.results);
                setIsExtracting(false);
                showSuccess(`âœ… ${response.results.length} files extracted instantly (non-persistent).`);
                return;
            }

            if (response.job_id) {
                console.log(`[UPLOAD SUCCESS] Job ID: ${response.job_id} | Session: ${currentSessionId}`);
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
                    status: 'processing',
                    progress: 0,
                    completed: false
                });
                startTimeRef.current = Date.now();

                // Refine estimate based on actual total and analysis
                const jobBatchCount = Math.ceil(response.total_files / 2);
                const jobZohoBuffer = extractionMode === 'zoho' ? 15 : 0;
                const jobEstimate = Math.round(jobBatchCount * avgTime) + 5 + jobZohoBuffer;

                setEstimatedExtractionTime(jobEstimate);
                setCountdownSeconds(prev => Math.max(prev || 0, jobEstimate));
                startPolling(response.job_id);
            }
        } catch (error) {
            showError(`âŒ Upload Failed: ${(error as Error).message}`);
            setIsExtracting(false);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // â”€â”€ Helper to map instant results without DB fetching â”€â”€
    const handleInstantResults = (results: any[]) => {
        const mappedResults: InvoiceResult[] = results.map((item: any) => {
            const extData = item.data || {};
            const resData = extData;

            const flattenedHeader: any = {
                ...(resData.sections?.supplier_details || {}),
                ...(resData.sections?.supply_details || {}),
                ...(resData.data || resData)
            };

            // â”€â”€ DEFINITIVE ADDRESS INJECTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            const _vendorAddr: string = (
                resData['bill_from'] ||
                resData['Bill From'] ||
                resData['vendor_address'] ||
                resData['bill_address_from'] ||
                resData['Bill Address From'] ||
                resData.sections?.supplier_details?.bill_from ||
                resData.sections?.supplier_details?.vendor_address ||
                ''
            );
            flattenedHeader['bill_from'] = _vendorAddr;
            flattenedHeader['Bill Address From'] = _vendorAddr;
            flattenedHeader['bill_address_from'] = _vendorAddr;
            flattenedHeader['Bill From'] = _vendorAddr;

            // IRN, ACK NO, ACK DATE INJECTION
            const _irn: string = resData['irn'] || resData['IRN'] || resData.sections?.irn || '';
            flattenedHeader['irn'] = _irn;
            flattenedHeader['IRN'] = _irn;

            const _ackNo: string = resData['ack_no'] || resData['Ack. No.'] || resData['Ack No'] || resData.sections?.ack_no || '';
            flattenedHeader['ack_no'] = _ackNo;
            flattenedHeader['Ack. No.'] = _ackNo;
            flattenedHeader['Ack No.'] = _ackNo;

            const _ackDate: string = resData['ack_date'] || resData['Ack. Date'] || resData['Ack Date'] || resData.sections?.ack_date || '';
            flattenedHeader['ack_date'] = _ackDate;
            flattenedHeader['Ack. Date'] = _ackDate;
            flattenedHeader['Ack Date.'] = _ackDate;

            const rawItems = (resData.sections?.items || resData.line_items || resData.items || []);
            const normalizedHeader: Record<string, string> = {};
            const colsToMap = ALL_COLUMNS;

            colsToMap.forEach(field => {
                normalizedHeader[field] = getCellValue(flattenedHeader, field);
            });
            const fileName = item.file_name || 'Invoice.pdf';
            normalizedHeader['Voucher Type Name'] = fileName;
            normalizedHeader['File Name'] = fileName;

            const normalizedItems = rawItems.map((ritem: any) => {
                const flatItem = ritem.item ? { ...ritem.item, ...ritem } : ritem;
                // FIX: Preserve original data to prevent blank cells
                const ni: any = { ...flatItem };
                const itemColsToMap = (extractionMode === 'tally' || extractionMode === 'zoho') ? ALL_COLUMNS.filter(c => isItemField(c)) : LINE_ITEM_FIELDS;
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
                cacheRecordId: null // No DB record
            };
        });

        setInvoiceResults(mappedResults);
    };

    const fetchStagingData = async (retryCount = 0) => {
        try {
            // STEP 3: Fetch using session_id to get ALL relevant processed records safely
            const params: Record<string, string> = {};
            if (uploadSessionIdRef.current) {
                params.upload_session_id = uploadSessionIdRef.current;
            }

            const response: any = await httpClient.get('/api/ocr-staging/', params);
            
            // --- [PHASE 6] DETERMINISTIC HYDRATION BARRIER ---
            console.log(`[HYDRATION_RECEIVED] status=${response?.status} mode=${extractionMode}`);
            if (response?.status === 'PROCESSING') {
                console.log(`[HYDRATION_WAIT] Backend still processing. Deferring hydration. retryCount=${retryCount}`);
                if (retryCount < 5) {
                    const backoffMs = Math.pow(2, retryCount) * 1000;
                    console.log(`[FRONTEND_HYDRATION_BLOCKED] Retrying hydration in ${backoffMs}ms due to PROCESSING status...`);
                    await new Promise(resolve => setTimeout(resolve, backoffMs));
                    return fetchStagingData(retryCount + 1);
                }
                return;
            }

            let stagedResults = Array.isArray(response) ? response : (response?.data || []);
            
            console.log(`[HYDRATION_RAW] rows=${stagedResults.length}`);
            if (!stagedResults || stagedResults.length === 0) {
                if (isFinalizedRef.current) {
                    console.warn('[HYDRATION_EMPTY_GUARDED] Empty response ignored — results already finalized.');
                    return;
                }
                console.warn(`[HYDRATION_EMPTY] No rows returned from /api/ocr-staging/ retryCount=${retryCount}`);
                
                // Add hydration retry guard
                if (retryCount < 5) {
                    const backoffMs = Math.pow(2, retryCount) * 1000;
                    console.log(`[FRONTEND_HYDRATION_BLOCKED] Retrying hydration in ${backoffMs}ms...`);
                    await new Promise(resolve => setTimeout(resolve, backoffMs));
                    return fetchStagingData(retryCount + 1);
                }
                return;
            }

            // --- [REQUIREMENT 4: FRONTEND DEFENSIVE NORMALIZATION] ---
            stagedResults = stagedResults.map((row: any) => {
                let resolvedItems = [];
                if (Array.isArray(row.items) && row.items.length > 0) {
                    resolvedItems = row.items;
                } else if (Array.isArray(row.extracted_data?.sections?.items) && row.extracted_data.sections.items.length > 0) {
                    resolvedItems = row.extracted_data.sections.items;
                } else if (Array.isArray(row.extracted_data?.items)) {
                    resolvedItems = row.extracted_data.items;
                }

                return {
                    ...row,
                    invoice_no: row.invoice_no || row.invoice_number || "",
                    items: resolvedItems
                };
            });

            // --- [REQUIREMENT 5: DO NOT AUTO-RECONSTRUCT INVALID RECORDS] ---
            // Block empty hydration records completely from entering UI mapping
            stagedResults = stagedResults.filter((r: any) => r.invoice_no || (r.items && r.items.length > 0));
            
            console.log(`[HYDRATION_FILTERED] validRows=${stagedResults.length}`);
            if (stagedResults.length === 0) {
                if (isFinalizedRef.current) {
                    console.warn('[HYDRATION_FILTERED_GUARDED] Filtered to 0 but results already finalized — ignoring.');
                    return;
                }
                console.warn('[HYDRATION_BLOCKED] All rows rejected — missing invoice_no and items.');
                return;
            }

            // ═══════════════════════════════════════════════════════════════════════
            // ZOHO PATH — Distributed FinalizedSnapshot Architecture (New)
            // FinalizedSnapshot rows are FLAT: { invoice_no, vendor_name, gstin, items, totals, ... }
            // No extracted_data.sections. No reconstructZohoInvoices. Direct field mapping only.
            // ═══════════════════════════════════════════════════════════════════════
            if (extractionMode === 'zoho') {
                const isFinalized = response?.status === 'FINALIZED' || response?.status === 'COMPLETED';
                if (!isFinalized) {
                    console.log(`[ZOHO_GATE] Not finalized (status=${response?.status}). Holding hydration.`);
                    return;
                }

                console.log(`[ZOHO_SNAPSHOT_HYDRATION] Processing ${stagedResults.length} flat snapshot rows.`);

                const snapshotMapped: InvoiceResult[] = stagedResults.map((row: any, idx: number) => {
                    const rawItems: any[] = Array.isArray(row.items) ? row.items : [];

                    // Build header directly from flat FinalizedSnapshot top-level fields
                    const normalizedHeader: Record<string, string> = {};
                    normalizedHeader['Invoice No']          = row.invoice_no || '';
                    normalizedHeader['Date']                = row.invoice_date || '';
                    normalizedHeader['Name']                = row.vendor_name || '';
                    normalizedHeader['GSTIN']               = row.gstin || row.vendor_gstin || '';
                    normalizedHeader['Branch']              = row.branch || '';
                    normalizedHeader['Place of Supply']     = row.place_of_supply || '';
                    normalizedHeader['Bill Address From']   = row.bill_from || '';
                    normalizedHeader['Bill Address To']     = row.bill_to || row.billing_address || '';
                    normalizedHeader['Total Invoice Value'] = row.totals || row.total_amount || '';
                    normalizedHeader['Total Taxable Value'] = row.total_taxable_value || '';
                    normalizedHeader['Total IGST']          = row.total_igst || '';
                    normalizedHeader['Total CGST']          = row.total_cgst || '';
                    normalizedHeader['Total SGST/UTGST']    = row.total_sgst || '';
                    normalizedHeader['IRN']                 = row.irn || '';
                    normalizedHeader['Ack. No.']            = row.ack_no || '';
                    normalizedHeader['Ack. Date']           = row.ack_date || '';
                    normalizedHeader['Folder Path']         = row.file_path || '';
                    const fileName = (row.file_path || 'Invoice.pdf').split(/[\/\\]/).pop() || 'Invoice.pdf';
                    normalizedHeader['Voucher Type Name']   = fileName;
                    normalizedHeader['File Name']           = fileName;

                    // Fill remaining ZOHO_COLUMNS via alias resolution on the flat row
                    ALL_COLUMNS.forEach(col => {
                        if (!normalizedHeader[col]) normalizedHeader[col] = getCellValue(row, col);
                    });

                    const normalizedItems = rawItems.map((ritem: any) => {
                        const flatItem = ritem.item ? { ...ritem.item, ...ritem } : ritem;
                        const ni: any = { ...flatItem };
                        ALL_COLUMNS.filter(c => isItemField(c)).forEach(f => { ni[f] = getCellValue(flatItem, f); });
                        return ni;
                    });

                    const valid = normalizedItems.length > 0 || Object.values(normalizedHeader).some(v => !!v);
                    console.log(`[ZOHO_ROW_${idx}] inv="${row.invoice_no}" vendor="${row.vendor_name}" items=${normalizedItems.length} valid=${valid}`);

                    return { invoice: normalizedHeader, items: normalizedItems, headerMapping: {}, itemMapping: {}, file_hash: row.file_hash, cacheRecordId: row.id };
                }).filter((res: any) => res.items.length > 0 || Object.values(res.invoice).some(v => !!v));

                console.log(`[ZOHO_SNAPSHOT_RESULT] rendered=${snapshotMapped.length} / received=${stagedResults.length}`);

                if (snapshotMapped.length > 0) {
                    isFinalizedRef.current = true;
                    console.log(`[ZOHO_FINALIZED_LOCKED] isFinalizedRef=true. invoiceResults will be protected from overwrite.`);
                    setInvoiceResults(snapshotMapped);
                    if (onExtractionSuccess) {
                        const fr = snapshotMapped[0].invoice;
                        onExtractionSuccess({ vendor_name: fr['Name'] || fr['Vendor Name'] || '', gstin: fr['GSTIN'] || '', branch: fr['Branch'] || '', state: fr['Place of Supply'] || '' });
                    }
                } else {
                    console.warn('[ZOHO_SNAPSHOT_EMPTY] Mapping produced 0 valid rows. Sample:', JSON.stringify(stagedResults[0] || {}).substring(0, 300));
                }
                return;
            }

            const mappedResults: InvoiceResult[] = stagedResults.map((item: any) => {
                const extData = item.extracted_data || {};
                const resData = extData;

                // FLATTEN nested sections for the mapping engine (supplier_details, supply_details)
                const flattenedHeader: Record<string, any> = {
                    ...(resData.sections?.supplier_details || {}),
                    ...(resData.sections?.supply_details || {}),
                    ...(resData.header || {}),
                    ...resData
                };

                // --- DEFINITIVE ADDRESS INJECTION ---
                const _vendorAddr: string = (
                    resData['bill_from'] ||
                    resData['Bill From'] ||
                    resData['vendor_address'] ||
                    resData['bill_address_from'] ||
                    resData['Bill Address From'] ||
                    resData.sections?.supplier_details?.bill_from ||
                    resData.sections?.supplier_details?.vendor_address ||
                    ''
                );
                flattenedHeader['bill_from'] = _vendorAddr;
                flattenedHeader['Bill Address From'] = _vendorAddr;
                flattenedHeader['bill_address_from'] = _vendorAddr;
                flattenedHeader['Bill From'] = _vendorAddr;

                // IRN, ACK NO, ACK DATE INJECTION
                const _irn: string = resData['irn'] || resData['IRN'] || resData.sections?.irn || '';
                flattenedHeader['irn'] = _irn;
                flattenedHeader['IRN'] = _irn;

                const _ackNo: string = resData['ack_no'] || resData['Ack. No.'] || resData['Ack No'] || resData.sections?.ack_no || '';
                flattenedHeader['ack_no'] = _ackNo;
                flattenedHeader['Ack. No.'] = _ackNo;
                flattenedHeader['Ack No.'] = _ackNo;

                const _ackDate: string = resData['ack_date'] || resData['Ack. Date'] || resData['Ack Date'] || resData.sections?.ack_date || '';
                flattenedHeader['ack_date'] = _ackDate;
                flattenedHeader['Ack. Date'] = _ackDate;
                flattenedHeader['Ack Date.'] = _ackDate;

                const _billingAddr: string = (
                    resData['Bill Address To'] ||
                    resData['billing_address'] ||
                    resData['bill_to_address'] ||
                    resData.sections?.supplier_details?.billing_address ||
                    item.extracted_data?.billing_address ||
                    ''
                );
                flattenedHeader['Bill Address To'] = _billingAddr;
                flattenedHeader['billing_address'] = _billingAddr;

                // PLACE OF SUPPLY INJECTION
                const _gstin = (resData.gstin || resData.vendor_gstin || resData.sections?.supplier_details?.gstin || item.gstin || '').trim().toUpperCase();
                const _stateCode = _gstin.substring(0, 2);
                const GST_STATE_CODES: Record<string, string> = {
                    "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
                    "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
                    "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
                    "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
                    "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
                    "16": "Tripura", "17": "Meghalaya", "18": "Assam",
                    "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
                    "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
                    "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra",
                    "28": "Andhra Pradesh", "29": "Karnataka", "30": "Goa",
                    "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
                    "34": "Puducherry", "35": "Andaman and Nicobar Islands",
                    "36": "Telangana", "37": "Andhra Pradesh (New)"
                };
                const _pos: string = GST_STATE_CODES[_stateCode] ||
                    resData['Place of Supply'] ||
                    resData['place_of_supply'] ||
                    resData.sections?.supplier_details?.place_of_supply ||
                    resData.sections?.supplier_details?.vendor_state ||
                    '';
                flattenedHeader['Place of Supply'] = _pos;
                flattenedHeader['place_of_supply'] = _pos;

                const rawItems = (resData.sections?.items || resData.line_items || resData.items || []);

                const normalizedHeader: Record<string, string> = {};
                const colsToMap = ALL_COLUMNS;

                colsToMap.forEach(field => {
                    normalizedHeader[field] = getCellValue(flattenedHeader, field);
                });

                if (!normalizedHeader['Bill Address To']) {
                    normalizedHeader['Bill Address To'] =
                        flattenedHeader['Bill Address To'] ||
                        flattenedHeader['billing_address'] ||
                        flattenedHeader['bill_to_address'] ||
                        '';
                }
                console.log("PHASE2 normalizedHeader[Bill Address From]:", normalizedHeader['Bill Address From']);

                // Map the source filename to the "Voucher Type Name" column as requested
                const fileName = item.file_path?.split(/[\\/]/).pop() || 'Invoice.pdf';
                normalizedHeader['Voucher Type Name'] = fileName;
                normalizedHeader['File Name'] = fileName;

                const normalizedItems = rawItems.map((ritem: any) => {
                    // Items are usually already flat, but check if there's an 'item' wrapper
                    const flatItem = ritem.item ? { ...ritem.item, ...ritem } : ritem;
                    // FIX: Preserve original data to prevent blank cells (Requirement 1/2)
                    const ni: any = { ...flatItem };
                    // Fix: Use ALL_COLUMNS for Zoho mode as well
                    const itemColsToMap = (extractionMode === 'tally') ? ALL_COLUMNS.filter(c => isItemField(c)) : LINE_ITEM_FIELDS;

                    itemColsToMap.forEach(f => {
                        ni[f] = getCellValue(flatItem, f);
                    });
                    return ni;
                });
                console.log("[NORMALIZED ITEMS]", normalizedItems); // Forensic Log 4

                return {
                    invoice: normalizedHeader,
                    items: normalizedItems,
                    headerMapping: {},
                    itemMapping: {},
                    file_hash: item.file_hash,
                    cacheRecordId: item.id
                };
            }).filter((res: any) => res.items.length > 0 || Object.keys(res.invoice).length > 0);

            console.log('[HYDRATION_RESULT] mappedResults count:', mappedResults.length);
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
        if (pollingIntervalRef.current) clearTimeout(pollingIntervalRef.current);
        const pollId = ++activePollIdRef.current;
        console.log(`[POLLING_STARTED] Job: ${jobId} | PollID: ${pollId}`);

        let consecutiveNoChange = 0;
        let lastProcessed = -1;
        let currentInterval = 2000; // [PHASE 6 FIX] Conservative base interval to prevent API storms

        const poll = async () => {
            if (pollId !== activePollIdRef.current) {
                console.log(`[POLL_CANCEL_REASON] Stale Poll ID: ${pollId} vs ${activePollIdRef.current}`);
                return;
            }
            if (cancelExtractionRef.current) {
                console.log(`[POLL_CANCEL_REASON] User Cancelled`);
                return;
            }

            try {
                const url = `/api/bulk-status/${jobId}/`;
                console.log(`[POLL_REQUEST_SENT] ${url} | PollID: ${pollId}`);
                const status = await httpClient.get<any>(url);
                
                if (pollId !== activePollIdRef.current) {
                    console.log(`[POLL_RACE_CONDITION] Ignoring response for Job ${jobId} (PollID ${pollId} is now stale)`);
                    return;
                }

                console.log(`[POLL_RESPONSE_RAW] Job: ${jobId} Payload:`, status);

                const normalizedStatus = String(status.status || '').toUpperCase();
                // [FIX] Requirement #6: Stop polling ONLY on terminal states
                const isTerminal = status.completed === true || 
                    ['FINALIZED', 'FAILED', 'PARTIAL_FAILURE', 'PARTIAL_FAILED', 'COMPLETED'].includes(normalizedStatus);

                console.log(`[POLLING_RESPONSE] Job: ${jobId} | Status: ${normalizedStatus} | Progress: ${status.progress}% | Terminal: ${isTerminal}`);

                // Monotonic progress guard
                setBulkStatus(prev => {
                    console.log(`[POLL_STATE_BEFORE] Job: ${jobId} Prev:`, prev);
                    if (prev && (prev.progress || 0) > (status.progress || 0) && !isTerminal) {
                        console.warn(`[POLL_MONOTONIC_BLOCK] Prev: ${prev.progress} > Current: ${status.progress}`);
                        return prev;
                    }
                    const next = { ...status, status: normalizedStatus, completed: isTerminal, progress: status.progress || 0 };
                    console.log(`[POLL_STATE_AFTER] Job: ${jobId} Next:`, next);
                    return next;
                });

                if (isTerminal) {
                    console.log(`[POLL_TERMINAL_DETECTED] Job: ${jobId} status=${normalizedStatus}. Starting hydration before clearing processing state.`);
                    startTimeRef.current = null;
                    setCountdownSeconds(null);

                    // CRITICAL ORDER: Hydrate FIRST, then clear isExtracting.
                    // If setIsExtracting(false) runs before setInvoiceResults(), React commits
                    // a render with isExtracting=false + invoiceResults=[] which shows the
                    // upload buttons and hides the table — the classic "modal reset" bug.
                    console.log(`[POLL_HYDRATION_START] Job: ${jobId}`);
                    await fetchStagingData();
                    console.log(`[POLL_HYDRATION_DONE] Job: ${jobId} invoiceResults will now persist.`);

                    // Clear processing state AFTER data is in React state
                    setIsExtracting(false);

                    if (normalizedStatus !== 'FAILED') {
                        showSuccess(`Extraction Complete: ${status.processed} processed.`);
                    }
                    return;
                }

                // Adaptive backoff
                const currentProcessed = (status.processed || 0) + (status.failed || 0);
                if (currentProcessed > lastProcessed) {
                    consecutiveNoChange = 0;
                    currentInterval = 500;
                } else {
                    consecutiveNoChange++;
                    if (consecutiveNoChange > 4) {
                        // Aggressive backoff for slow jobs
                        currentInterval = Math.min(currentInterval + 1000, 10000);
                    }
                }
                lastProcessed = currentProcessed;

                // Time estimation
                if (startTimeRef.current && status.total > 0) {
                    const elapsedMs = Date.now() - startTimeRef.current;
                    if (currentProcessed > 0) {
                        const msPerFile = elapsedMs / currentProcessed;
                        const remainingCount = status.total - currentProcessed;
                        const estimate = Math.round((remainingCount * msPerFile) / 1000);
                        setCountdownSeconds(estimate);
                    }
                }
            } catch (err) {
                console.error("[POLLING_ERROR]", err);
                currentInterval = 2000;
            }

            if (pollId === activePollIdRef.current && !cancelExtractionRef.current) {
                pollingIntervalRef.current = setTimeout(poll, currentInterval);
            }
        };

        poll();
    };


    useEffect(() => {

        return () => {
            // pollingIntervalRef stores a setTimeout handle, not setInterval.
            if (pollingIntervalRef.current) clearTimeout(pollingIntervalRef.current);
        };
    }, []);

    // â”€â”€ Upload directly (no risk dashboard) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const handleUploadToAI = () => {
        if (!onUpload) return;
        if (invoiceResults.length === 0) { showError('No data extracted.'); return; }

        if (voucherType === 'Purchase' && (vendorValidation === 'NOT_FOUND' || vendorValidation === 'GSTIN_CONFLICT')) {
            // Force user to handle Create Vendor first
            setIsCreateVendorModalOpen(true);
            return;
        }

        // â”€â”€ Auto-compute Invoice Value if missing (sum of Item Amount across all items) â”€â”€
        // Sales & Purchase use "Invoice Value"; Credit/Debit Notes use "Total Invoice Value"
        // â”€â”€ Auto-compute "Invoice Value" per item if missing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        // â”€â”€ Validation: Block if truly non-derivable required fields are missing â”€â”€
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
        showSuccess(`âœ… ${allFlatRows.length} rows uploaded successfully.`);
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

                // Update invoice header with corrected vendor info
                setInvoiceResults(prev => prev.map((res, i) => {
                    if (i !== 0) return res;
                    const newRes = { ...res };
                    newRes.invoice = { ...newRes.invoice };
                    newRes.invoice['Vendor Name'] = data.vendor_name;
                    newRes.invoice['GSTIN'] = data.gstin;
                    newRes.invoice['Vendor Category'] = data.vendor_category || '';
                    return newRes;
                }));

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

        console.log("AUDIT: EXCEL EXPORT SOURCE:", invoiceResults);

        // Build full rows using same logic as the display table
        const allRows: Record<string, string>[] = [];
        invoiceResults.forEach((res) => {
            const items = res.items.length > 0 ? res.items : [{}];
            items.forEach((item) => {
                const row: Record<string, string> = {};
                ALL_COLUMNS.forEach((col) => {
                    row[col] = resolveZohoValue(res.invoice, item, col);
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

        console.log("AUDIT: CSV EXPORT SOURCE:", invoiceResults);

        // Build full rows
        const allRows: Record<string, string>[] = [];
        invoiceResults.forEach((res) => {
            const items = res.items.length > 0 ? res.items : [{}];
            items.forEach((item) => {
                const row: Record<string, string> = {};
                ALL_COLUMNS.forEach((col) => {
                    row[col] = resolveZohoValue(res.invoice, item, col);
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

    // â”€â”€ Handle cell change â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

            // â”€â”€ Persist edit to OCR cache / Staging table â”€â”€â”€â”€â”€
            const extractedData = {
                invoice: res.invoice,
                items: res.items,
            };

            if (res.file_hash) {
                // Bulk flow: Use staging API (triggers re-validation)
                // GUARD: In Zoho mode after finalization, do NOT re-fetch staging data.
                // A re-fetch returns an empty/different response that would wipe the finalized
                // invoiceResults table. Edits are applied locally via setInvoiceResults above.
                const shouldRefetch = extractionMode !== 'zoho' || !isFinalizedRef.current;
                apiService.saveStagingEdit(res.file_hash, extractedData)
                    .then(() => { if (shouldRefetch) fetchStagingData(); })
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

    // â”€â”€ Columns shown in the table (Include all for zero shifting) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const visibleColumns = ALL_COLUMNS;

    // â”€â”€ Build flat display rows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

            // Make absolutely sure res.invoice contains address keys for direct rendering
            if (res.invoice) {
                res.invoice['bill_from'] = res.invoice['bill_from'] || res.invoice['vendor_address'] || res.invoice['bill_address_from'] || res.invoice['Bill Address From'] || '';
                res.invoice['bill_address_from'] = res.invoice['bill_from'];
                if (!res.invoice['bill_from']) {
                    console.error("FRONTEND ERROR: bill_from missing in row!", res.invoice);
                }
                if (!res.invoice['Bill Address To']) {
                    res.invoice['Bill Address To'] = res.invoice['billing_address'] || res.invoice['bill_to_address'] || item['billing_address'] || '';
                }
            }




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



    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const isSingleScan = scanType === 'single';
    const modePrefix = extractionMode === 'tally' ? 'Tally' :
        (extractionMode === 'ai_native' ? 'AI Native' :
            (extractionMode.charAt(0).toUpperCase() + extractionMode.slice(1)));

    const modalTitle = `${modePrefix} ${isSingleScan ? 'Single' : 'Bulk'} Scan â€“ Invoice Scanner`;
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
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-[4px] border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700"
                                    >
                                        <Icon name="upload" className="w-5 h-5 mr-2" />
                                        Select Files
                                    </button>
                                    <button
                                        id="bulk-folder-upload-btn"
                                        onClick={() => folderInputRef.current?.click()}
                                        className="inline-flex items-center px-6 py-3 border border-slate-200 text-sm font-medium rounded-[4px] text-gray-700 bg-white hover:bg-gray-50 shadow-sm"
                                    >
                                        <Icon name="document" className="w-5 h-5 mr-2 text-amber-500" />
                                        Select Folder
                                    </button>
                                </div>
                            )}

                            {isExtracting && (
                                <div className="flex flex-col justify-center px-6 py-2 w-full max-w-md">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2 text-sm font-medium text-indigo-600">
                                            <Icon name="spinner" className="w-5 h-5 animate-spin" />
                                            <span>{scanType === 'bulk' ? 'Processing Bulk Job...' : 'Processing invoices...'}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {bulkStatus && (
                                                <span className="text-xs font-bold text-indigo-600">
                                                    {Math.round(((bulkStatus.processed + bulkStatus.failed) / bulkStatus.total) * 100)}%
                                                </span>
                                            )}
                                            {/* Cancel Extraction Button */}
                                            <button
                                                onClick={handleCancelExtraction}
                                                title="Cancel extraction"
                                                className="text-xs font-semibold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded px-2 py-0.5 transition-colors bg-red-50 hover:bg-red-100"
                                            >
                                                âœ• Cancel
                                            </button>
                                        </div>
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
                                                        <span>â±</span>
                                                        <span>{Math.floor(countdownSeconds / 60)}:{(countdownSeconds % 60).toString().padStart(2, '0')}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        countdownSeconds !== null && (
                                            <div className="flex items-center gap-1.5 ml-7 mt-1">
                                                <span style={{ fontSize: '15px', lineHeight: 1 }}>â±</span>
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
                                                        <Icon name="warning" className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
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
                                <div className="flex items-center gap-2 ml-4 border-l pl-4 border-gray-300">
                                    <span className="text-sm text-gray-500">
                                        {countdownSeconds !== null && countdownSeconds > 0 ? (
                                            <span className="flex items-center gap-1.5 text-indigo-600 font-medium animate-pulse">
                                                <Icon name="spinner" className="w-3 h-3 animate-spin" />
                                                Estimated: {Math.floor(countdownSeconds / 60)}:{(countdownSeconds % 60).toString().padStart(2, '0')} remaining
                                            </span>
                                        ) : (
                                            "Processing… Please wait"
                                        )}
                                    </span>
                                </div>
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
                                        {displayRows.map((row) => {
                                            return (
                                                <tr
                                                    key={row.key}
                                                    className={`${row.isFirstOfInvoice
                                                        ? 'border-t-2 border-gray-300'
                                                        : 'border-t border-gray-100'
                                                        } hover:bg-gray-50`}
                                                >
                                                    {visibleColumns.map((col) => {
                                                        const COLUMN_TO_KEY: Record<string, string> = {
                                                            'item name': 'description',
                                                            'item description': 'description',
                                                            'hsn/sac': 'hsn_sac',
                                                            'hsn': 'hsn_sac',
                                                            'qty': 'qty',
                                                            'quantity': 'qty',
                                                            'actual quantity': 'qty',
                                                            'billed quantity': 'qty',
                                                            'item rate': 'rate',
                                                            'rate': 'rate',
                                                            'taxable value': 'taxable_value',
                                                            'total taxable value': 'total_tax_value',
                                                            'invoice value': 'total_invoice_value',
                                                            'total invoice value': 'total_invoice_value',
                                                            'voucher number': 'invoice_no',
                                                            'invoice number': 'invoice_no',
                                                            'invoice no': 'invoice_no',
                                                            'bill no': 'invoice_no',
                                                            'voucher date': 'invoice_date',
                                                            'invoice date': 'invoice_date',
                                                            'date': 'invoice_date',
                                                            'vendor name': 'vendor_name',
                                                            'name': 'vendor_name',
                                                            'gstin': 'gstin',
                                                            'vendor gstin': 'gstin',
                                                            'uom': 'uom',
                                                            'quantity uom': 'uom',
                                                            'branch': 'branch',
                                                            'irn': 'irn',
                                                            'ack no': 'ack_no',
                                                            'ack. no.': 'ack_no',
                                                            'ack date': 'ack_date',
                                                            'ack. date': 'ack_date',
                                                            'bill address from': 'bill_from',
                                                            'bill from': 'bill_from',
                                                            'bill address to': 'bill_to',
                                                            'bill to': 'bill_to',
                                                            'place of supply': 'place_of_supply',
                                                            'sac': 'hsn_sac'
                                                        };

                                                        const backendKey = COLUMN_TO_KEY[col.toLowerCase()] || col;
                                                        const isItem = isItemField(col);

                                                        let cellValue: any = isItem ? row.item[backendKey] : row.header[backendKey];

                                                        // [PHASE 11.9] FORENSIC LOGS
                                                        if (row.itemIdx === 0 && col === visibleColumns[0]) {
                                                            console.log("[CANONICAL_ROW_KEYS]", Object.keys(isItem ? row.item : row.header));
                                                            console.log("[FRONTEND_ROW_KEYS]", visibleColumns);
                                                        }

                                                        // Fallback to aliased resolver if direct backend key is missing
                                                        if (cellValue === undefined || cellValue === null || cellValue === '') {
                                                            cellValue = resolveZohoValue(row.header, row.item, col);
                                                        }

                                                        if (cellValue) {
                                                            console.log("[TABLE_RENDER_VALUE]", col, "->", cellValue);
                                                        }

                                                        const isAddressCol = col.toLowerCase().includes('address') || col.toLowerCase().includes('from') || col.toLowerCase().includes('to');

                                                        return (
                                                            <td
                                                                key={col}
                                                                className={`px-4 py-2 text-sm text-gray-900 border-r border-gray-100 last:border-r-0 max-w-[300px] ${isAddressCol ? 'whitespace-pre-wrap' : 'truncate'}`}
                                                                title={String(cellValue ?? '')}
                                                            >
                                                                {isAddressCol ? (
                                                                    <textarea
                                                                        value={String(cellValue ?? '')}
                                                                        onChange={(e) => handleCellChange(row.invoiceIdx, row.itemIdx, col, e.target.value)}
                                                                        rows={2}
                                                                        className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm resize-none"
                                                                    />
                                                                ) : (
                                                                    <input
                                                                        type="text"
                                                                        value={String(cellValue ?? '')}
                                                                        onChange={(e) => handleCellChange(row.invoiceIdx, row.itemIdx, col, e.target.value)}
                                                                        className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm overflow-hidden text-ellipsis"
                                                                    />
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="bg-gray-50 px-4 py-3 border-t mt-auto">
                                <p className="text-sm text-gray-700">
                                    ðŸ“Š {displayRows.length} line item row{displayRows.length !== 1 ? 's' : ''} extracted.
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
