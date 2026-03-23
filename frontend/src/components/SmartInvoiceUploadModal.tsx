/**
 * SmartInvoiceUploadModal.tsx (OCR Staging & Workflow)
 * 
 * Implements a consolidated OCR staging & editing workflow:
 *  1. Upload Files    → POST /api/ocr-staging/
 *  2. Review Staging → GET  /api/ocr-staging/
 *  3. Edit Data       → PATCH /api/ai/ocr-cache/<id>/update/
 *  4. Finalize        → POST /api/ocr-staging-finalize/
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { httpClient } from '../services/httpClient';
import { apiService } from '../services/api';
import { getXLSX } from '../utils/xlsx';
import { showError, showSuccess, showInfo } from '../utils/toast';
import CreateVendorModal from './CreateVendorModal';
import { VOUCHER_COLUMN_SCHEMAS } from '../services/mappingEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type VendorStatus = 'FOUND' | 'MISSING' | 'RESOLVED' | 'ERROR';
type ValidationStatus = 'READY' | 'VENDOR_MISSING' | 'VALIDATION_FAILED' | 'EXTRACTION_FAILED' | 'PENDING' | 'RESOLVED' | 'FOUND' | 'NOT_FOUND' | 'GSTIN_CONFLICT' | 'ERROR' | 'VOUCHER_CREATED' | 'NEEDS_ATTENTION' | 'LOW_CONFIDENCE' | 'processing';

interface ScanResult {
    id: number;
    file_hash: string;
    file_path: string;
    vendor_status: VendorStatus;
    vendor_id: number | null;
    vendor_name: string;
    vendor_gstin: string;
    invoice_number: string;
    invoice_date: string;
    total_amount: string | number;
    status: string; // Legacy UI status label
    extracted_data: any;
    created_at: string;
    validationStatus: ValidationStatus;
    matchedBy?: string;
    conflictMessage?: string;
}

interface FinalizeErrorItem {
    file: string;
    error: any;
}

interface FinalizeResult {
    success: boolean;
    total: number;
    created: number;
    failed: number;
    skipped: number;
    message?: string;
    errors: FinalizeErrorItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Components ──────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// (InlineVendorCreatePanel removed to use shared CreateVendorModal)

// ─────────────────────────────────────────────────────────────────────────────
// Status Badge — mirrors PurchaseVendorValidateView result states
// ─────────────────────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: ValidationStatus, title?: string }> = ({ status, title }) => {
    const cfg: Record<string, { label: string; cls: string; icon: string }> = {
        READY: { label: 'Ready', cls: 'bg-emerald-100 text-emerald-800 border border-emerald-300', icon: '✅' },
        FOUND: { label: 'Ready', cls: 'bg-emerald-100 text-emerald-800 border border-emerald-300', icon: '✅' },
        RESOLVED: { label: 'Resolved', cls: 'bg-blue-100 text-blue-800 border border-blue-300', icon: '🔗' },
        VENDOR_MISSING: { label: 'Vendor Missing', cls: 'bg-amber-100 text-amber-800 border border-amber-300', icon: '⚠️' },
        NOT_FOUND: { label: 'Vendor Missing', cls: 'bg-amber-100 text-amber-800 border border-amber-300', icon: '⚠️' },
        GSTIN_CONFLICT: { label: 'Conflict', cls: 'bg-red-100 text-red-800 border border-red-300', icon: '⚠️' },
        PENDING: { label: 'Validating...', cls: 'bg-blue-50 text-blue-700 border border-blue-200', icon: '⏳' },
        PROCESSING: { label: 'Processing...', cls: 'bg-blue-50 text-blue-700 border border-blue-200', icon: '⏳' },
        NEEDS_ATTENTION: { label: 'Needs Attention', cls: 'bg-orange-100 text-orange-800 border border-orange-300', icon: '⚠️' },
        LOW_CONFIDENCE: { label: 'Low Confidence', cls: 'bg-amber-100 text-amber-800 border border-amber-300', icon: '🤏' },
        EXTRACTION_FAILED: { label: 'Extraction Failed', cls: 'bg-red-50 text-red-700 border border-red-200', icon: '❌' },
        VALIDATION_FAILED: { label: 'Validation Failed', cls: 'bg-red-50 text-red-700 border border-red-200', icon: '❌' },
        VOUCHER_CREATED: { label: 'Voucher Created', cls: 'bg-indigo-100 text-indigo-800 border border-indigo-300', icon: '🧾' },
        ERROR: { label: 'Error', cls: 'bg-red-100 text-red-800 border border-red-300', icon: '❌' },
    };
    const s = (status as string || 'ERROR').toUpperCase();
    const { label, cls, icon } = cfg[s] || cfg.ERROR;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-tight cursor-help ${cls}`} title={title || label}>
            {icon} {label}
        </span>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Details Side Panel ──────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const ReviewDetailsPanel: React.FC<{ row: ScanResult; onClose: () => void }> = ({ row, onClose }) => {
    const data = row.extracted_data || {};
    const items = data.items || data.line_items || [];
    const summary = data.summary_totals || {};
    const invoice = data.invoice || data.header || data;

    return (
        <div className="absolute inset-y-0 right-0 w-96 bg-white shadow-2xl border-l border-gray-200 z-[80] flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                <div>
                    <h3 className="font-bold text-gray-900">Invoice Details</h3>
                    <p className="text-xs text-gray-500 truncate max-w-[240px] italic">{row.file_path}</p>
                </div>
                <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-full transition-colors">
                    <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {row.conflictMessage && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-800 text-[11px] font-bold">
                        ⚠️ {row.conflictMessage}
                    </div>
                )}
                {/* Header Info */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Invoice No</label>
                        <p className="text-sm font-bold text-gray-800">{row.invoice_number || '—'}</p>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Date</label>
                        <p className="text-sm font-bold text-gray-800">{row.invoice_date || '—'}</p>
                    </div>
                </div>

                <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Vendor</label>
                    <p className="text-sm font-bold text-gray-900">{row.vendor_name || '—'}</p>
                    <p className="text-[11px] text-gray-500 font-mono mt-0.5 uppercase tracking-tighter">{row.vendor_gstin || 'No GSTIN'}</p>
                </div>

                {/* Items Table */}
                <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Line Items ({items.length})</label>
                    <div className="border border-gray-100 rounded-lg overflow-hidden">
                        <table className="w-full text-left text-[11px]">
                            <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-100 uppercase">
                                <tr>
                                    <th className="px-2 py-1.5 w-1/2">Item</th>
                                    <th className="px-2 py-1.5 text-right">Qty</th>
                                    <th className="px-2 py-1.5 text-right">Rate</th>
                                    <th className="px-2 py-1.5 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {items.map((it: any, i: number) => (
                                    <tr key={i}>
                                        <td className="px-2 py-2 font-medium text-gray-700 leading-tight">{it['Item Name'] || it['Description'] || 'Unknown Item'}</td>
                                        <td className="px-2 py-2 text-right text-gray-600">{it['Qty'] || it['Quantity']}</td>
                                        <td className="px-2 py-2 text-right text-gray-600">{it['Item Rate'] || it['Rate']}</td>
                                        <td className="px-2 py-2 text-right font-bold text-gray-800">{it['Invoice Value'] || it['Amount'] || it['Item Amount']}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Totals */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 border border-gray-100">
                    <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Taxable Value</span>
                        <span className="font-medium text-gray-700">{summary['Taxable Value'] || '0.00'}</span>
                    </div>
                    {summary['Total IGST'] && summary['Total IGST'] !== '0.00' && (
                        <div className="flex justify-between text-xs">
                            <span className="text-gray-500">IGST</span>
                            <span className="font-medium text-gray-700">{summary['Total IGST']}</span>
                        </div>
                    )}
                    {summary['Total CGST'] && summary['Total CGST'] !== '0.00' && (
                        <div className="flex justify-between text-xs">
                            <span className="text-gray-500">CGST</span>
                            <span className="font-medium text-gray-700">{summary['Total CGST']}</span>
                        </div>
                    )}
                    {summary['Total SGST/UTGST'] && summary['Total SGST/UTGST'] !== '0.00' && (
                        <div className="flex justify-between text-xs">
                            <span className="text-gray-500">SGST</span>
                            <span className="font-medium text-gray-700">{summary['Total SGST/UTGST']}</span>
                        </div>
                    )}
                    <div className="border-t border-gray-200 pt-2 flex justify-between">
                        <span className="text-sm font-bold text-gray-900">Grand Total</span>
                        <span className="text-sm font-black text-indigo-700">₹{row.total_amount || summary['Grand Total'] || '0.00'}</span>
                    </div>
                </div>
            </div>

            <div className="p-4 border-t bg-white">
                <button onClick={onClose} className="w-full py-2 bg-gray-800 text-white rounded-lg text-sm font-bold hover:bg-gray-900 shadow-md">Close Preview</button>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Edit Modal ──────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const EditInvoiceModal: React.FC<{
    row: ScanResult;
    voucherType: string;
    onClose: () => void;
    onSave: (updatedData: any, revalidation?: { status: string; vendor_id: number | null; vendor_name: string }) => void;
    onResolve?: (resolution: 'use_existing' | 'update_name') => void;
}> = ({ row, voucherType, onClose, onSave, onResolve }) => {
    const [data, setData] = useState(JSON.parse(JSON.stringify(row.extracted_data)));
    const [saving, setSaving] = useState(false);

    const invoice = data.invoice || data.header || data;
    const items = data.items || data.line_items || [];

    // Filter out fields that belong to line items or system metadata from the header grid
    const EXCLUDED_KEYS = [
        "ITEM CODE", "ITEM NAME", "HSN/SAC", "QTY", "QUANTITY", "UOM", "UQC", "RATE",
        "ITEM RATE", "TAXABLE VALUE", "IGST", "CGST", "SGST/UTGST", "CESS", "INVOICE VALUE", "DESCRIPTION",
        "ITEMS", "LINE_ITEMS", "SUMMARY_TOTALS", "HEADER", "INVOICE", "DATA", "S.NO"
    ];

    const schemaFields = VOUCHER_COLUMN_SCHEMAS[voucherType] || [];
    const extractedKeys = Object.keys(invoice);

    // Combine schema fields + any extra fields found by AI, excluding line item fields and system keys
    const allHeaderFields = Array.from(new Set([...schemaFields, ...extractedKeys]))
        .filter(k => {
            const upperK = k.toUpperCase().replace(/\./g, '').trim();
            return !EXCLUDED_KEYS.includes(upperK);
        });

    const handleHeaderChange = (key: string, val: string) => {
        const newData = { ...data };
        // Determine where to store (preferring the existing nesting style)
        if (newData.invoice) newData.invoice[key] = val;
        else if (newData.header) newData.header[key] = val;
        else newData[key] = val;
        setData(newData);
    };

    const handleItemChange = (idx: number, key: string, val: string) => {
        const newData = { ...data };
        const targetItems = newData.items || newData.line_items;
        if (targetItems) targetItems[idx][key] = val;
        setData(newData);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Use PATCH /api/ocr-staging/<file_hash>/ which saves AND auto-revalidates
            const result: any = await httpClient.patch(
                `/api/ocr-staging/${row.file_hash}/`,
                { extracted_data: data }
            );
            // Pass validation result back to parent so it can update the row inline
            onSave(result.extracted_data || data, {
                status: result.status || 'missing',
                vendor_id: result.vendor_id ?? null,
                vendor_name: result.vendor_name || '',
            });
            const isFound = result.status === 'READY' || result.status === 'found' || result.status === 'FOUND';
            const isConflict = result.status === 'GSTIN_CONFLICT';
            const statusMsg = isFound ? '✅ Found' : (isConflict ? '⚠️ GSTIN Conflict' : '⚠ Missing');
            showSuccess(`✅ Saved. Vendor status: ${statusMsg}`);
            onClose();
        } catch (err) {
            showError('Failed to update staging record.');
        } finally {
            setSaving(false);
        }
    };

    const handleResolveConflict = async (resolution: 'use_existing' | 'update_name') => {
        setSaving(true);
        try {
            const res: any = await httpClient.post('/api/purchase/vendors/resolve-conflict/', {
                file_hash: row.file_hash,
                resolution: resolution
            });
            if (res.success) {
                // Determine the new name based on resolution
                let finalName = row.vendor_name;
                if (resolution === 'update_name') {
                    finalName = invoice['Vendor Name'] || invoice['vendor_name'] || row.vendor_name;
                }

                onSave(data, {
                    status: 'READY',
                    vendor_id: row.vendor_id,
                    vendor_name: finalName,
                });
                showSuccess(`Conflict Resolved: ${resolution === 'use_existing' ? 'Using Master' : 'Updated Master'}`);
                onClose();
            } else {
                showError(res.error || 'Resolution failed');
            }
        } catch (err) {
            showError('Server error during resolution');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-lg">Edit Invoice Data</h3>
                        <p className="text-xs text-gray-500 italic">Editing extracted OCR fields for {row.file_path}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">✕</button>
                </div>

                {/* Conflict Resolution Header */}
                {row.validationStatus === 'GSTIN_CONFLICT' && (
                    <div className="px-6 py-4 bg-red-50 border-b border-red-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-xl">⚠️</div>
                            <div>
                                <h4 className="font-bold text-red-900 text-sm">GSTIN Conflict Detected</h4>
                                <p className="text-[10px] text-red-700 italic max-w-md">{row.conflictMessage || 'This GSTIN belongs to a different vendor in your master list.'}</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleResolveConflict('use_existing')}
                                disabled={saving}
                                className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-200 transition-colors shadow-sm"
                            >
                                Use Existing Master Info
                            </button>
                            <button
                                onClick={() => handleResolveConflict('update_name')}
                                disabled={saving}
                                className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-200 transition-colors shadow-sm"
                            >
                                Update Master with this Name
                            </button>
                        </div>
                    </div>
                )}
                {/* Vendor Missing Header */}
                {(row.validationStatus === 'VENDOR_MISSING' || row.validationStatus === 'NOT_FOUND') && (
                    <div className="px-6 py-4 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-xl">⚠️</div>
                            <div>
                                <h4 className="font-bold text-amber-900 text-sm">Vendor Not Found</h4>
                                <p className="text-[10px] text-amber-700 italic">This vendor is not in your master list. Match or create it to continue.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                onSave(data, { status: 'VENDOR_MISSING', vendor_id: null, vendor_name: invoice['Vendor Name'] || invoice['vendor_name'] || row.vendor_name });
                                onClose();
                                setTimeout(() => window.dispatchEvent(new CustomEvent('re-open-create-vendor', { detail: row.file_hash })), 100);
                            }}
                            className="px-6 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors shadow-md"
                        >
                            Create New Vendor
                        </button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    <div>
                        <h4 className="text-xs font-black text-indigo-500 uppercase tracking-widest mb-4">Header Fields</h4>
                        <div className="grid grid-cols-3 gap-4">
                            {allHeaderFields.map(k => {
                                let v = invoice[k];
                                // Handle null/undefined or objects
                                let displayVal = "";
                                if (v !== null && v !== undefined) {
                                    displayVal = typeof v === 'object' ? JSON.stringify(v) : String(v);
                                }

                                return (
                                    <div key={k}>
                                        <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{k}</label>
                                        <input
                                            type="text"
                                            value={displayVal}
                                            onChange={e => handleHeaderChange(k, e.target.value)}
                                            placeholder={`Enter ${k}...`}
                                            className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none hover:border-indigo-300 transition-colors"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <h4 className="text-xs font-black text-indigo-500 uppercase tracking-widest mb-4">Line Items ({items.length})</h4>
                        <div className="overflow-x-auto border border-gray-100 rounded-xl">
                            <table className="w-full text-xs">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        {items.length > 0 && Object.keys(items[0]).map(k => (
                                            <th key={k} className="px-3 py-2 text-left font-bold text-gray-500 whitespace-nowrap">{k}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {items.map((it: any, i: number) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            {Object.entries(it).map(([k, v]) => (
                                                <td key={k} className="p-1 min-w-[100px]">
                                                    <input
                                                        type="text"
                                                        value={String(v || '')}
                                                        onChange={e => handleItemChange(i, k, e.target.value)}
                                                        className="w-full border-none p-1.5 focus:ring-2 focus:ring-indigo-200 outline-none bg-transparent rounded"
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-2 text-sm font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100">Cancel</button>
                    <button onClick={handleSave} disabled={saving} className="px-8 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-lg disabled:opacity-50 hover:bg-indigo-700 transition-colors">
                        {saving ? (
                            <span className="flex items-center gap-2">
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                Saving & Validating…
                            </span>
                        ) : 'Save & Revalidate'}
                    </button>
                </div>
            </div>
        </div>
    );
};


// ─────────────────────────────────────────────────────────────────────────────
// Resolve Conflict Modal
// ─────────────────────────────────────────────────────────────────────────────

// ResolveConflictModal removed (integrated into EditInvoiceModal)

// ─────────────────────────────────────────────────────────────────────────────
// Main Modal
// ─────────────────────────────────────────────────────────────────────────────

interface BulkInvoiceUploadModalProps {
    onClose: () => void;
    onFinalized?: (result: FinalizeResult) => void;
    voucherType: string;
    isLimitReached?: boolean;
}

type ModalStep = 'upload' | 'scanning' | 'review' | 'finalizing' | 'done';

const BulkInvoiceUploadModal: React.FC<BulkInvoiceUploadModalProps> = ({
    onClose,
    onFinalized,
    voucherType = 'Purchase',
    isLimitReached = false,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    // State
    const [step, setStep] = useState<ModalStep>('upload');
    const [isLoading, setIsLoading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const isMounted = useRef(true);
    // Use a ref for the polling interval so it can be cleared from anywhere
    const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const pollingIntervalRef2 = useRef<NodeJS.Timeout | null>(null); // setInterval handle
    const retryCountRef = useRef(0); // Mirror retryCount in a ref for non-stale access in interval

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
            // Clear both timeout and interval on unmount
            if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
            if (pollingIntervalRef2.current) clearInterval(pollingIntervalRef2.current);
        };
    }, []);

    const [dragOver, setDragOver] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [scanId, setScanId] = useState<string>('');
    const [scanResults, setScanResults] = useState<ScanResult[]>([]);
    const [scanProgress, setScanProgress] = useState(0);       // 0-100
    const [scanCurrentFile, setScanCurrentFile] = useState('');
    const [finalizeResult, setFinalizeResult] = useState<FinalizeResult | null>(null);
    const [filterStatus, setFilterStatus] = useState<'ready' | 'pending' | 'error'>('pending');
    const [showOnlyPending, setShowOnlyPending] = useState(true);
    const [finalizing, setFinalizing] = useState(false);
    const [resolvingRow, setResolvingRow] = useState<ScanResult | null>(null);
    const [detailsRow, setDetailsRow] = useState<ScanResult | null>(null);
    const [estimatedExtractionTime, setEstimatedExtractionTime] = useState<number | null>(null);
    const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
    const [editingRow, setEditingRow] = useState<ScanResult | null>(null);
    const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());
    const [uploadSessionId] = useState(() => {
        if (typeof window.crypto !== 'undefined' && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
    });

    // ── Resume Workflow State ──
    const [isCheckingUnresolved, setIsCheckingUnresolved] = useState(true);
    const [unresolvedCount, setUnresolvedCount] = useState(0);
    const [showResumePrompt, setShowResumePrompt] = useState(false);
    const [useAllUnresolved, setUseAllUnresolved] = useState(false);

    // Duplicate detection set
    const uploadedFilesSetRef = useRef<Set<string>>(new Set());
    // Ref so fetchStagedInvoices (stable callback) can always read the latest value
    const useAllUnresolvedRef = useRef(false);

    // Listen for events from sub-modals to trigger workflows
    useEffect(() => {
        const handler = (e: any) => {
            const fileHash = e.detail;
            const row = scanResults.find(r => r.file_hash === fileHash);
            if (row) setResolvingRow(row);
        };
        window.addEventListener('re-open-create-vendor', handler);
        return () => window.removeEventListener('re-open-create-vendor', handler);
    }, [scanResults]);

    // Check for existing unresolved invoices on mount
    useEffect(() => {
        const checkExisting = async () => {
            try {
                const res: any = await httpClient.get('/api/ocr-staging/');
                if (Array.isArray(res) && res.length > 0) {
                    const needsAttentionCount = res.filter((r: any) => !['READY', 'FOUND', 'RESOLVED'].includes(r.validation_status)).length;
                    // If some are pending, show that count. If all are ready, just show the total ready as pending finalization.
                    setUnresolvedCount(needsAttentionCount > 0 ? needsAttentionCount : res.length);
                    setShowResumePrompt(true);
                }
            } catch (err) {
                console.error("Check unresolved failed", err);
            } finally {
                setIsCheckingUnresolved(false);
            }
        };
        checkExisting();
    }, []);

    // ── Live countdown timer ──────────────────────────────────────────────────
    useEffect(() => {
        if (step === 'scanning' && estimatedExtractionTime !== null) {
            setCountdownSeconds(Math.round(estimatedExtractionTime));
            const interval = setInterval(() => {
                setCountdownSeconds(prev => {
                    if (prev === null || prev <= 1) {
                        return 0; // Keep at 0 until extraction finishes
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(interval);
        } else {
            setCountdownSeconds(null);
        }
    }, [step, estimatedExtractionTime]);

    // ── Drag & Drop ───────────────────────────────────────────────────────────

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files).filter(f => {
            const typeMatch = f.type === 'application/pdf' || f.type.startsWith('image/');
            const extMatch = /\.(pdf|jpg|jpeg|png|webp|gif)$/i.test(f.name);
            return typeMatch || extMatch;
        });
        if (files.length > 0) {
            setSelectedFiles(prev => [...prev, ...files]);
            setShowResumePrompt(false);
        } else {
            showError('Invalid file type. Please select PDF or images.');
        }
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles: File[] = [];
            for (let i = 0; i < e.target.files.length; i++) {
                const file = e.target.files[i];
                const fileKey = `${file.name}*${file.size}*${file.lastModified}`;
                if (uploadedFilesSetRef.current.has(fileKey)) {
                    showInfo(`Skipped duplicate: ${file.name}`);
                    continue;
                }
                newFiles.push(file);
                uploadedFilesSetRef.current.add(fileKey);
            }

            if (newFiles.length > 0) {
                setSelectedFiles(prev => [...prev, ...newFiles]);
                if (showResumePrompt) setShowResumePrompt(false);
            }
        }
        e.target.value = '';
    };

    const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const allFiles = Array.from(e.target.files);
            const supported = allFiles.filter(f =>
                f.type === 'application/pdf' ||
                f.type.startsWith('image/') ||
                /\.(pdf|jpg|jpeg|png|webp|gif)$/i.test(f.name)
            );

            const newFiles: File[] = [];
            for (const file of supported) {
                const fileKey = `${file.name}*${file.size}*${file.lastModified}`;
                if (uploadedFilesSetRef.current.has(fileKey)) {
                    continue; // Silent skip for folders to avoid toast spam
                }
                newFiles.push(file);
                uploadedFilesSetRef.current.add(fileKey);
            }

            if (newFiles.length > 0) {
                setSelectedFiles(prev => [...prev, ...newFiles]);
                if (showResumePrompt) setShowResumePrompt(false);
                showSuccess(`Added ${newFiles.length} new files from folder.`);
            } else if (supported.length > 0) {
                showInfo('All files in this folder were already added.');
            } else {
                showError('No supported PDF or image files found in the folder.');
            }
        }
        e.target.value = '';
    };

    const removeFile = (idx: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
    };

    // ── STEP 1 — SCAN ────────────────────────────────────────────────────────

    const MAX_RETRIES = 30; // 90 seconds (3000ms poll) for complex AI extraction
    const POLL_INTERVAL_MS = 3000;

    /**
     * Stop the active polling interval.
     */
    const stopPolling = useCallback(() => {
        if (pollingIntervalRef2.current) {
            clearInterval(pollingIntervalRef2.current);
            pollingIntervalRef2.current = null;
        }
        if (pollingTimeoutRef.current) {
            clearTimeout(pollingTimeoutRef.current);
            pollingTimeoutRef.current = null;
        }
        retryCountRef.current = 0;
        setRetryCount(0);
    }, []);

    /**
     * Execute a single fetch of staged invoices and update state.
     * Returns true if polling should stop (completed or max retries).
     */
    const doFetch = useCallback(async (sid: string): Promise<boolean> => {
        try {
            console.log("Calling /api/ocr-staging/ with sessionId:", sid);
            const res: any = await httpClient.get(`/api/ocr-staging/${sid}/`);

            if (!isMounted.current) return true;
            setIsLoading(false);
            setFetchError(null);

            // ── Handle both envelope {status, data:[]} and legacy plain array ──
            let rows: any[];
            let pipelineStatus: string;
            if (Array.isArray(res)) {
                // Legacy plain-array response (backward compat)
                rows = res;
                pipelineStatus = rows.every(r => !['PENDING', 'processing'].includes(r.validation_status || '')) ? 'completed' : 'processing';
            } else if (res && Array.isArray(res.data)) {
                rows = res.data;
                pipelineStatus = res.status || 'processing';
            } else {
                console.error("Unexpected API response format:", res);
                setScanResults([]);
                return false;
            }

            console.log(`OCR staging: status=${pipelineStatus}, rows=${rows.length}`);

            // ── Diagnostic: log the first row's full structure so mapping issues are visible ──
            if (rows.length > 0) {
                console.log('[OCR Staging] Full API row[0]:', JSON.stringify(rows[0], null, 2));
            }

            // Bad OCR values that should be treated as missing
            const JUNK_VALUES = new Set([
                'DATED', 'DATE', 'NO', 'NUMBER', 'BILL', 'INV', 'INVOICE',
                'PARTICULARS', '—', '-', 'N/A', 'NA', 'NIL', 'NULL', 'NONE', 'UNDEFINED'
            ]);

            /**
             * Returns the value as a display string, or '—' if it is empty/junk.
             * Accepts multiple candidate values — returns the first valid one.
             */
            const clean = (...candidates: any[]): string => {
                for (const val of candidates) {
                    if (!val && val !== 0) continue;
                    const s = String(val).trim();
                    if (!s) continue;
                    if (JUNK_VALUES.has(s.toUpperCase())) continue;
                    return s;
                }
                return '—';
            };

            const seeded: ScanResult[] = rows.map((r: any) => {
                const rawExtracted = r.extracted_data || {};
                // Try all known nesting patterns
                const inv: Record<string, any> =
                    rawExtracted.invoice ||
                    rawExtracted.header ||
                    rawExtracted.header_fields ||
                    rawExtracted || {};

                const backendStatus = r.validation_status || r.status || 'PENDING';
                let vStatus: ValidationStatus = 'PENDING';

                if (backendStatus === 'READY' || backendStatus === 'found' || backendStatus === 'FOUND') vStatus = 'READY';
                else if (backendStatus === 'RESOLVED' || backendStatus === 'resolved') vStatus = 'RESOLVED';
                else if (['VENDOR_MISSING', 'NOT_FOUND', 'not_found', 'Vendor Missing'].includes(backendStatus)) vStatus = 'VENDOR_MISSING';
                else if (backendStatus === 'GSTIN_CONFLICT' || backendStatus === 'gstin_conflict') vStatus = 'GSTIN_CONFLICT';
                else if (backendStatus === 'NEEDS_ATTENTION' || backendStatus === 'needs_attention') vStatus = 'NEEDS_ATTENTION';
                else if (backendStatus === 'VOUCHER_CREATED' || backendStatus === 'Voucher Created') vStatus = 'VOUCHER_CREATED';
                else if (['EXTRACTION_FAILED', 'extraction_failed', 'ERROR'].includes(backendStatus)) vStatus = 'EXTRACTION_FAILED';
                else if (backendStatus === 'VALIDATION_FAILED' || backendStatus === 'validation_failed') vStatus = 'VALIDATION_FAILED';
                else if (backendStatus === 'processing') vStatus = 'processing';

                if (rawExtracted._fallback || r.conflict_message?.toLowerCase().includes('low-confidence')) {
                    vStatus = 'LOW_CONFIDENCE';
                }

                // A row can NEVER be "Ready" if vendor_id is absent
                if (vStatus === 'READY' && !r.vendor_id) vStatus = 'VENDOR_MISSING';

                // ── Resolve display fields using variadic clean() ──
                // Backend now sends '' for missing fields (not '—'), so empty string
                // cascades to the next candidate correctly.
                const invoiceNumber = clean(
                    r.invoice_number,
                    inv['Supplier Invoice No'], inv['Supplier Invoice No.'],
                    inv['invoice_number'], inv['Invoice No'], inv['Invoice Number'],
                );
                const invoiceDate = clean(
                    r.invoice_date,
                    inv['Voucher Date'], inv['Invoice Date'], inv['Date'], inv['invoice_date'],
                );
                const vendorName = clean(
                    r.vendor_name,
                    inv['Vendor Name'], inv['vendor_name'],
                    inv['Supplier Name'], inv['Party Name'], inv['Bill From'],
                );
                const vendorGstin = clean(
                    r.vendor_gstin,
                    inv['GSTIN'], inv['vendor_gstin'], inv['Supplier GSTIN'], inv['Party GSTIN'],
                );
                const totalAmount = clean(
                    r.total_amount,
                    inv['Total Invoice Value'], inv['Grand Total'],
                    inv['total_amount'], inv['Invoice Value'], inv['Amount'],
                );

                // Hardening: Only treat as NEEDS_ATTENTION if it is explicitly set by backend.
                // Do not eagerly override PENDING here while the pipeline is still active.
                const hasAnyData = invoiceNumber !== '—' || vendorName !== '—' || totalAmount !== '—';
                const isCompletelyEmpty = !hasAnyData && Object.keys(inv).length === 0;

                if (vStatus === 'PENDING' && isCompletelyEmpty) {
                    // Let it stay as PENDING (will show 'Validating...' or spinner in UI)
                    // unless we are at the very end of retries (handled by stopPolling logic).
                }

                return {
                    id: r.id,
                    file_hash: r.file_hash,
                    file_path: r.file_path,
                    invoice_number: invoiceNumber,
                    invoice_date: invoiceDate,
                    vendor_name: vendorName,
                    vendor_gstin: vendorGstin,
                    total_amount: totalAmount,
                    validationStatus: vStatus,
                    vendor_id: r.vendor_id || null,
                    vendor_status: (vStatus === 'READY' || vStatus === 'RESOLVED') ? 'FOUND' : 'MISSING' as VendorStatus,
                    matchedBy: r.matched_by || '',
                    conflictMessage: r.conflict_message || '',
                    extracted_data: rawExtracted,
                    status: r.status || backendStatus,
                    created_at: r.created_at || new Date().toISOString(),
                };
            });

            setScanResults(seeded);

            // ── Stop polling if backend says completed or all rows settled ──
            if (pipelineStatus === 'completed') {
                console.log('✅ Backend reported completed — stopping poll.');
                return true; // Signal caller to stop
            }

            // ── AUTO-PATCH MISSING VENDORS (opportunistic, silent) ──
            const needsRevalidation = seeded.filter(r => r.validationStatus === 'VENDOR_MISSING' && !r.vendor_id);
            if (needsRevalidation.length > 0) {
                setTimeout(async () => {
                    for (const row of needsRevalidation) {
                        try {
                            const patchResult: any = await httpClient.patch(`/api/ocr-staging/${row.file_hash}/`, { extracted_data: row.extracted_data });
                            if (patchResult.status === 'READY') {
                                setScanResults(prev => prev.map(r => r.id === row.id ? { ...r, ...patchResult, validationStatus: 'READY' } : r));
                            }
                        } catch { /* silent */ }
                    }
                }, 1000);
            }

            return false; // Keep polling

        } catch (err: any) {
            if (!isMounted.current) return true;
            setIsLoading(false);
            console.error("Failed to fetch staged invoices:", err);

            const httpStatus = err?.response?.status;
            // Never retry on invalid request — would loop forever on bad URL
            if (httpStatus === 400 || httpStatus === 404) {
                setFetchError('Invalid request — check session ID.');
                console.error('Not retrying (bad request):', err);
                return true;
            }
            if (httpStatus === 500) setFetchError('Server error (500). Please check backend logs.');
            else if (httpStatus === 503) setFetchError('Service unavailable (Kafka/AI). Retrying...');
            else setFetchError('Could not sync with server. Check connection.');

            return false; // Allow retry up to MAX_RETRIES
        }
    }, [uploadSessionId]);

    /**
     * Fetch staged invoices once and start a polling interval if the
     * pipeline is still processing.  The interval stops automatically
     * when the backend reports status=completed or MAX_RETRIES is hit.
     */
    const fetchStagedInvoices = useCallback(async (forcedSid?: any, _isAutoRetry = false) => {
        if (!isMounted.current) return;

        // ── Resolve session ID ──
        let sid = '';
        if (typeof forcedSid === 'string' && forcedSid) {
            sid = forcedSid;
        } else if (forcedSid && typeof forcedSid === 'object' && !Array.isArray(forcedSid)) {
            sid = forcedSid.upload_session_id || forcedSid.id || uploadSessionId;
        } else {
            sid = useAllUnresolvedRef.current ? '' : uploadSessionId;
        }

        if (!sid || typeof sid !== 'string') {
            console.error('Invalid sessionId passed to fetchStagedInvoices:', forcedSid);
            return;
        }

        // ── Stop any existing poll before starting a new one ──
        stopPolling();
        setFetchError(null);
        setRetryCount(0);
        retryCountRef.current = 0;
        setIsLoading(true);

        // ── Initial fetch ──
        const shouldStop = await doFetch(sid);
        if (shouldStop || !isMounted.current) return;

        // ── Start polling interval ──
        pollingIntervalRef2.current = setInterval(async () => {
            if (!isMounted.current) {
                clearInterval(pollingIntervalRef2.current!);
                pollingIntervalRef2.current = null;
                return;
            }

            retryCountRef.current += 1;
            setRetryCount(retryCountRef.current);

            if (retryCountRef.current > MAX_RETRIES) {
                // Hard stop — mark remaining PENDING as NEEDS_ATTENTION
                console.warn(`Polling stopped after ${MAX_RETRIES} retries.`);
                clearInterval(pollingIntervalRef2.current!);
                pollingIntervalRef2.current = null;
                setScanResults(prev => prev.map(r =>
                    (r.validationStatus === 'PENDING' || r.validationStatus === 'processing')
                        ? { ...r, validationStatus: 'NEEDS_ATTENTION', conflictMessage: 'Extraction timeout – please review manually.' }
                        : r
                ));
                return;
            }

            const done = await doFetch(sid);
            if (done) {
                console.log('Polling complete — clearing interval.');
                clearInterval(pollingIntervalRef2.current!);
                pollingIntervalRef2.current = null;
            }
        }, POLL_INTERVAL_MS);

    }, [uploadSessionId, doFetch, stopPolling]);

    useEffect(() => {
        if (!uploadSessionId) return;
        if (step === 'review' && scanResults.length === 0) {
            fetchStagedInvoices(uploadSessionId);
        }
    }, [step, uploadSessionId]); // Removed dependencies that cause re-triggering

    // ── STEP 1 — SCAN ────────────────────────────────────────────────────────

    const handleScan = async () => {
        if (selectedFiles.length === 0) {
            showError('Please select at least one invoice file.');
            return;
        }

        if (isLimitReached) {
            showError('❌ AI Extraction limit reached. Please upgrade your subscription.');
            return;
        }

        setStep('scanning');
        setScanProgress(5);
        setScanCurrentFile('Preparing upload…');

        try {
            const avgRes = await apiService.getExtractionAverageTime();
            const avgTime = avgRes?.average_time_per_invoice || 3.85;

            let estimatedTasks = 0;
            selectedFiles.forEach(f => {
                if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
                    estimatedTasks += Math.max(1, Math.ceil(f.size / 100000)); // Estimate ~100KB per page
                } else {
                    estimatedTasks += 1;
                }
            });

            // Backend uses 5 parallel threads for the chunks
            const batchCount = Math.ceil(estimatedTasks / 5);
            setEstimatedExtractionTime(avgTime * batchCount);
        } catch (error) {
            let estimatedTasks = 0;
            selectedFiles.forEach(f => {
                const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
                estimatedTasks += isPdf ? Math.max(1, Math.ceil(f.size / 100000)) : 1;
            });
            const batchCount = Math.ceil(estimatedTasks / 5);
            setEstimatedExtractionTime(3.85 * batchCount);
        }

        try {
            const formData = new FormData();
            selectedFiles.forEach(f => formData.append('files', f));
            formData.append('voucher_type', voucherType);
            formData.append('upload_session_id', uploadSessionId);

            setScanProgress(90);
            setScanCurrentFile(`Processing AI results…`);

            const res: any = await httpClient.postFormData('/api/ocr-staging/', formData);

            setScanProgress(100);

            if (res?.duplicate_count > 0) {
                const multi = res.duplicate_count > 1;
                showInfo(`✨ ${res.duplicate_count} invoice${multi ? 's' : ''} already scanned — results loaded instantly.`);
            }

            // Use the returned staged list directly to avoid redundant GET & race conditions
            if (res?.staged) {
                fetchStagedInvoices(uploadSessionId);
            }
            setStep('review');
        } catch (err: any) {
            const msg = err?.response?.data?.error || err?.message || 'Scan failed. Please try again.';
            showError(`❌ Scan failed: ${msg}`);
            setStep('upload');
        } finally {
            setEstimatedExtractionTime(null);
        }
    };

    // ── STEP 2 — RESOLVE VENDOR ──────────────────────────────────────────────

    const handleResolve = (filePath: string, vendorId: number, vendorName: string) => {
        setScanResults(prev => prev.map(r =>
            r.file_path === filePath
                ? {
                    ...r,
                    vendor_status: 'RESOLVED' as VendorStatus,
                    validationStatus: 'RESOLVED' as ValidationStatus,
                    vendor_id: vendorId,
                    vendor_name: vendorName,
                    matchedBy: 'Newly Created',
                    conflictMessage: undefined,
                }
                : r
        ));
        setResolvingRow(null);
        showSuccess(`Vendor resolved for ${filePath}`);
    };

    const handleSaveVendor = async (vendorData: any) => {
        if (!resolvingRow) return;

        try {
            const res: any = await httpClient.post('/api/purchase/vendors/create/', vendorData);

            if (res?.status === 'CREATED' && res?.vendor_id) {
                showSuccess('Vendor Created! Re-validating invoice…');

                // Merge the corrected vendor info into extracted_data so re-validation succeeds
                const updatedExtracted = { ...resolvingRow.extracted_data };
                const inv = updatedExtracted.invoice || updatedExtracted.header || updatedExtracted;

                inv['Vendor Name'] = vendorData.vendor_name;
                inv['GSTIN'] = vendorData.gstin;
                inv['Bill From - Address Line 1'] = vendorData.address;
                inv['Bill From - State'] = vendorData.state;
                inv['Branch'] = vendorData.branch;

                // Trigger backend re-validation with the corrected data
                const patchRes: any = await httpClient.patch(
                    `/api/ocr-staging/${resolvingRow.file_hash}/`,
                    { extracted_data: updatedExtracted }
                );

                if (patchRes.success) {
                    setScanResults(prev => prev.map(r =>
                        r.file_hash === resolvingRow.file_hash
                            ? {
                                ...r,
                                extracted_data: updatedExtracted,
                                validationStatus: patchRes.status as ValidationStatus,
                                vendor_id: patchRes.vendor_id || res.vendor_id,
                                vendor_name: patchRes.vendor_name || vendorData.vendor_name,
                                vendor_gstin: vendorData.gstin,
                            }
                            : r
                    ));
                    // Refresh all staged invoices to catch other rows with the same now-resolved vendor
                    fetchStagedInvoices();
                }
                setResolvingRow(null);
            } else {
                showError(res?.error || 'Failed to create vendor');
            }
        } catch (err: any) {
            const msg = err?.response?.data?.error || err?.message || 'Creation failed.';
            showError(msg);
        }
    };

    const handleRemove = async (fileHash: string) => {
        try {
            await httpClient.delete(`/api/ocr-staging/${fileHash}/`);
            setScanResults(prev => prev.filter(r => r.file_hash !== fileHash));
            setSelectedHashes(prev => {
                const next = new Set(prev);
                next.delete(fileHash);
                return next;
            });
            showSuccess('Removed from staging');
        } catch (err) {
            showError('Failed to remove invoice');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedHashes.size === 0) return;
        if (!window.confirm(`Are you sure you want to delete ${selectedHashes.size} selected items?`)) return;

        try {
            const hashes = Array.from(selectedHashes);
            // Parallel delete
            await Promise.all(hashes.map(h => httpClient.delete(`/api/ocr-staging/${h}/`)));

            setScanResults(prev => prev.filter(r => !selectedHashes.has(r.file_hash)));
            setSelectedHashes(new Set());
            showSuccess(`Bulk deleted ${hashes.length} invoices`);
        } catch (err) {
            showError('Bulk delete failed partially');
            fetchStagedInvoices();
        }
    }

    const toggleSelectAll = () => {
        const currentlyShowing = scanResults.filter(row => !['READY', 'FOUND', 'RESOLVED'].includes(row.validationStatus));
        if (selectedHashes.size === currentlyShowing.length && currentlyShowing.length > 0) {
            setSelectedHashes(new Set());
        } else {
            setSelectedHashes(new Set(currentlyShowing.map(r => r.file_hash)));
        }
    };

    const toggleSelectRow = (hash: string) => {
        setSelectedHashes(prev => {
            const next = new Set(prev);
            if (next.has(hash)) next.delete(hash);
            else next.add(hash);
            return next;
        });
    };

    const handleBack = () => {
        setStep('upload');
        if (useAllUnresolved) {
            setUseAllUnresolved(false);
            useAllUnresolvedRef.current = false;
            setShowResumePrompt(true);
        }
    };

    // ── STEP 3 — FINALIZE ────────────────────────────────────────────────────

    const canFinalize = scanResults.some(r => ['READY', 'FOUND', 'RESOLVED'].includes(r.validationStatus) && r.validationStatus !== 'VOUCHER_CREATED');

    const handleFinalize = async () => {
        if (!canFinalize) {
            showError('No valid invoices to finalize. Please resolve issues first.');
            return;
        }

        const readyRows = scanResults.filter(r => ['READY', 'FOUND', 'RESOLVED'].includes(r.validationStatus) && r.validationStatus !== 'VOUCHER_CREATED');
        const validCount = readyRows.length;
        const total = scanResults.filter(r => r.validationStatus !== 'VOUCHER_CREATED').length;

        if (validCount < total) {
            if (!window.confirm(`Only ${validCount} of ${total} invoices are ready.\n\nReady invoices will be uploaded.\nProblematic invoices will safely remain here so you can fix and retry them without stopping the batch.\n\nContinue?`)) {
                return;
            }
        }

        setFinalizing(true);
        setStep('finalizing');

        try {
            const res: FinalizeResult = await httpClient.post('/api/ocr-staging-finalize/', {
                upload_session_id: useAllUnresolved ? undefined : uploadSessionId
            });

            setFinalizeResult(res);
            setStep('done');

            if (res.created > 0) {
                showSuccess(res.message || `✅ ${res.created} voucher(s) created successfully!`);
            }
            if (res.failed > 0) {
                showError(`⚠️ ${res.failed} internal error(s) occurred.`);
            }

            // Refresh staged invoices so the unresolved ones remain visible when user comes back
            fetchStagedInvoices();
            onFinalized?.(res);
        } catch (err: any) {
            const msg = err?.response?.data?.error || err?.message || 'Finalize failed.';
            showError(`❌ ${msg}`);
            setStep('review');
        } finally {
            setFinalizing(false);
        }
    };

    /**
     * handleDownloadExcel - Export current scan session to Excel.
     * Maps extracted data + line items to rows.
     */
    const handleDownloadExcel = async () => {
        try {
            const XLSX = await getXLSX();
            if (scanResults.length === 0) {
                showInfo('No data available to export.');
                return;
            }

            const allExportRows: any[] = [];
            scanResults.forEach((row, idx) => {
                const data = row.extracted_data || {};
                const items = data.items || data.line_items || [{}];
                const header = data.invoice || data.header || data;

                items.forEach((item: any) => {
                    allExportRows.push({
                        'S.No': allExportRows.length + 1,
                        'Invoice Number': header.invoice_number || row.invoice_number || header['Invoice Number'] || '—',
                        'Invoice Date': header.invoice_date || row.invoice_date || header['Invoice Date'] || '—',
                        'Vendor Name': header.vendor_name || row.vendor_name || header['Vendor Name'] || '—',
                        'Vendor GSTIN': header.vendor_gstin || row.vendor_gstin || header['Vendor GSTIN'] || '—',
                        'Place of Supply': header.place_of_supply || header['Place of Supply'] || '—',
                        'Currency': header.currency || header['Currency'] || 'INR',
                        'Conversion Rate': header.exchange_rate || header['Conversion Rate'] || '1',
                        'Item Name': item['Item Name'] || item['Description'] || '—',
                        'HSN/SAC': item['HSN/SAC'] || '—',
                        'Quantity': item['Qty'] || item['Quantity'] || '—',
                        'UOM': item['UOM'] || '—',
                        'Rate': item['Item Rate'] || item['Rate'] || '—',
                        'Taxable Val': item['Taxable Value'] || item['Taxable Amount'] || '—',
                        'IGST': item['IGST'] || '0',
                        'CGST': item['CGST'] || '0',
                        'SGST': item['SGST/UTGST'] || item['SGST'] || '0',
                        'Cess': item['Cess'] || '0',
                        'Item Total': item['Invoice Value'] || item['Amount'] || item['Item Amount'] || '—',
                        'Grand Total': header.total_amount || row.total_amount || header['Total Amount'] || '—',
                        'Matching Method': row.matchedBy || '—'
                    });
                });
            });

            const ws = XLSX.utils.json_to_sheet(allExportRows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Scanned Data');

            // Apply basic styling/column widths
            const colWidths = [
                { wch: 6 },  // S.No
                { wch: 15 }, // Invoice Number
                { wch: 12 }, // Invoice Date
                { wch: 25 }, // Vendor Name
                { wch: 15 }, // Vendor GSTIN
                { wch: 15 }, // Place of Supply
                { wch: 10 }, // Currency
                { wch: 10 }, // Conversion Rate
                { wch: 30 }, // Item Name
                { wch: 10 }, // HSN/SAC
                { wch: 10 }, // Quantity
                { wch: 8 },  // UOM
                { wch: 12 }, // Rate
                { wch: 12 }, // Taxable Val
                { wch: 8 },  // IGST
                { wch: 8 },  // CGST
                { wch: 8 },  // SGST
                { wch: 8 },  // Cess
                { wch: 12 }, // Item Total
                { wch: 12 }, // Grand Total
                { wch: 15 }  // Matching Method
            ];
            ws['!cols'] = colWidths;

            XLSX.writeFile(wb, `Finpixe_Bulk_Scan_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
            showSuccess('Excel export successful');
        } catch (err) {
            console.error('Excel Export Error:', err);
            showError('Failed to generate Excel file');
        }
    };



    // ── Render ────────────────────────────────────────────────────────────────

    const missingCount = scanResults.filter(r => r.validationStatus === 'VENDOR_MISSING' || r.validationStatus === 'NOT_FOUND').length;
    const conflictCount = scanResults.filter(r => r.validationStatus === 'GSTIN_CONFLICT').length;
    const resolvedCount = scanResults.filter(r => r.validationStatus === 'RESOLVED').length;
    const readyCount = scanResults.filter(r => r.validationStatus === 'READY' || r.validationStatus === 'FOUND').length;
    const errorCount = scanResults.filter(r => r.validationStatus === 'VALIDATION_FAILED' || r.validationStatus === 'EXTRACTION_FAILED' || r.validationStatus === 'ERROR').length;
    const pendingCount = scanResults.filter(r => r.validationStatus === 'PENDING').length;
    const vouchersCreatedCount = scanResults.filter(r => r.validationStatus === 'VOUCHER_CREATED').length;

    const attentionNeededCount = scanResults.filter(r => !['READY', 'FOUND', 'RESOLVED', 'PENDING', 'PROCESSING', 'scanning'].includes(r.validationStatus)).length;

    // Auto-switch to appropriate view based on what needs attention
    useEffect(() => {
        if (step === 'review' && scanResults.length > 0) {
            if (attentionNeededCount > 0 && filterStatus === 'ready') {
                // Focus the user on items that need fixing
                setFilterStatus('pending');
            } else if (attentionNeededCount === 0 && (readyCount + resolvedCount) > 0 && filterStatus === 'pending') {
                setFilterStatus('ready');
            }
        }
    }, [step, scanResults, filterStatus, attentionNeededCount, readyCount, resolvedCount]);

    return (
        <>
            {/* Resolve Section (Integrated into Edit modal or fallback to Create modal) */}
            {resolvingRow && (() => {
                if (resolvingRow.validationStatus === 'GSTIN_CONFLICT') {
                    // This case is now handled by integrated EditInvoiceModal
                    return null;
                }

                // Support {invoice:{...}}, {header:{...}}, or flat structure
                const inv = resolvingRow.extracted_data?.invoice
                    || resolvingRow.extracted_data?.header
                    || resolvingRow.extracted_data
                    || {};

                // Extract items for Supplier Items pre-filling
                const rawItems = resolvingRow.extracted_data?.items
                    || resolvingRow.extracted_data?.line_items
                    || [];
                const supplier_items = rawItems.map((it: any) => ({
                    supplierItemCode: it['Item Code'] || it['item_code'] || it['Part No'] || '',
                    supplierItemName: it['Item Name'] || it['item_name'] || it['Description'] || it['description'] || '',
                    hsnSac: it['HSN/SAC'] || it['hsn_sac'] || it['HSN Code'] || it['hsnSac'] || ''
                }));

                return (
                    <CreateVendorModal
                        initialData={{
                            vendor_name: resolvingRow.vendor_name || inv['Vendor Name'] || inv['vendor_name'] || '',
                            gstin: resolvingRow.vendor_gstin || inv['GSTIN'] || inv['vendor_gstin'] || '',
                            address: inv['Bill From - Address Line 1'] || inv['Address'] || inv['address'] || '',
                            state: inv['Bill From - State'] || inv['State'] || '',
                            branch: inv['Branch'] || '',
                            supplier_items: supplier_items
                        }}
                        onClose={() => setResolvingRow(null)}
                        onSave={handleSaveVendor}
                    />
                );
            })()}

            {/* Edit Modal */}
            {editingRow && (
                <EditInvoiceModal
                    row={editingRow}
                    voucherType={voucherType}
                    onClose={() => setEditingRow(null)}
                    onSave={(newData, revalidation) => {
                        let updatedRow: ScanResult | null = null;
                        setScanResults(prev => prev.map(r => {
                            if (r.id !== editingRow.id) return r;
                            // Map revalidation.status
                            let newValidationStatus: ValidationStatus = r.validationStatus;
                            if (revalidation) {
                                if (revalidation.status === 'READY' || revalidation.status === 'FOUND' || revalidation.status === 'found') newValidationStatus = 'READY';
                                else if (revalidation.status === 'VENDOR_MISSING' || revalidation.status === 'NOT_FOUND' || revalidation.status === 'not_found') newValidationStatus = 'VENDOR_MISSING';
                                else if (revalidation.status === 'GSTIN_CONFLICT' || revalidation.status === 'gstin_conflict') newValidationStatus = 'GSTIN_CONFLICT';
                                else if (revalidation.status === 'VALIDATION_FAILED' || revalidation.status === 'validation_failed') newValidationStatus = 'VALIDATION_FAILED';
                                else if (revalidation.status === 'EXTRACTION_FAILED') newValidationStatus = 'EXTRACTION_FAILED';
                                else if (revalidation.status === 'error' || revalidation.status === 'ERROR') newValidationStatus = 'EXTRACTION_FAILED';
                                else newValidationStatus = 'VENDOR_MISSING';
                            }
                            // Extract flattened fields for the table to refresh immediately
                            const invoicePart = newData.invoice || newData.header || newData;
                            const newInvNo = invoicePart['Supplier Invoice No'] || invoicePart['Supplier Invoice No.'] || invoicePart.invoice_number || r.invoice_number;
                            const newInvDate = invoicePart['Voucher Date'] || invoicePart['Date'] || invoicePart.invoice_date || r.invoice_date;
                            const newGstin = invoicePart['GSTIN'] || invoicePart.vendor_gstin || r.vendor_gstin;
                            const newAmount = invoicePart['Total Invoice Value'] || invoicePart['Grand Total'] || invoicePart['Total Amount'] || invoicePart.total_amount || r.total_amount;

                            const updated = {
                                ...r,
                                extracted_data: newData,
                                validationStatus: newValidationStatus,
                                invoice_number: newInvNo,
                                invoice_date: newInvDate,
                                vendor_gstin: newGstin,
                                total_amount: newAmount,
                                vendor_id: revalidation?.vendor_id ?? r.vendor_id,
                                vendor_name: revalidation?.vendor_name || r.vendor_name,
                                vendor_status: (revalidation?.status === 'READY' || revalidation?.status === 'found' || revalidation?.status === 'FOUND') ? 'FOUND' : r.vendor_status,
                            };
                            if (newValidationStatus === 'VENDOR_MISSING') updatedRow = updated;
                            return updated;
                        }));
                        // ✅ Auto-open Create Vendor immediately if revalidation says vendor is missing
                        // so user doesn't need to click "Create Vendor" as a separate step
                        if (updatedRow) {
                            setTimeout(() => setResolvingRow(updatedRow), 150);
                        }
                    }}
                />
            )}

            {/* Details Side Panel */}
            {detailsRow && (
                <ReviewDetailsPanel
                    row={detailsRow}
                    onClose={() => setDetailsRow(null)}
                />
            )}

            {/* Main Modal */}
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div
                    className="bg-white rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden"
                    style={{ maxWidth: '900px', maxHeight: '92vh' }}
                >
                    {/* ── Header ── */}
                    <div
                        className="flex items-center justify-between px-6 py-4 flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">Finpixe Bulk Scan – Invoice Scanner</h2>
                                <p className="text-xs text-indigo-200">
                                    {step === 'upload' && 'Upload multiple invoices for batch AI processing.'}
                                    {step === 'scanning' && 'AI extracting invoice data…'}
                                    {step === 'review' && (
                                        <span className="flex items-center gap-2">
                                            <span className="bg-emerald-400/30 text-emerald-50 px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-400/20">
                                                {readyCount + resolvedCount} Ready
                                            </span>
                                            <span className={`${attentionNeededCount > 0 ? 'bg-amber-400/30 text-amber-50' : 'text-indigo-200'} px-2 py-0.5 rounded-full text-[10px] font-bold border border-white/10`}>
                                                {attentionNeededCount} Need Attention
                                            </span>
                                        </span>
                                    )}
                                    {step === 'finalizing' && 'Saving vouchers…'}
                                    {step === 'done' && 'Done'}
                                </p>
                            </div>
                        </div>

                        {/* Step Indicator */}
                        <div className="flex items-center gap-1 mr-4">
                            {(['upload', 'review', 'done'] as const).map((s, idx) => {
                                const labels = ['1. Select', '2. Pending', '3. Save'];
                                const active = step === s || (s === 'upload' && step === 'scanning') || (s === 'review' && step === 'finalizing');
                                const done = (s === 'upload' && ['review', 'finalizing', 'done'].includes(step)) ||
                                    (s === 'review' && step === 'done');
                                return (
                                    <React.Fragment key={s}>
                                        {idx > 0 && (
                                            <div className={`w-6 h-px ${done ? 'bg-white' : 'bg-white/30'}`} />
                                        )}
                                        <div className={`px-2 py-0.5 rounded text-xs font-semibold transition-all
                                            ${done ? 'bg-emerald-400 text-white' : active ? 'bg-white text-indigo-700' : 'bg-white/20 text-white/70'}`}>
                                            {done ? '✓' : labels[idx]}
                                        </div>
                                    </React.Fragment>
                                );
                            })}
                        </div>

                        <button
                            onClick={onClose}
                            disabled={step === 'scanning' || step === 'finalizing'}
                            className="text-indigo-200 hover:text-white transition-colors ml-2 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* ── Body ── */}
                    <div className="flex-1 overflow-y-auto relative min-h-[500px]">

                        {/* ────── STEP: UPLOAD ────── */}
                        {step === 'upload' && (
                            <div className="p-6 space-y-4">

                                {/* ── Non-blocking Resume Banner ── */}
                                {showResumePrompt && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 text-lg">⚠️</div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-amber-900">
                                                {unresolvedCount} pending invoice{unresolvedCount !== 1 ? 's' : ''} from a previous session
                                            </p>
                                            <p className="text-xs text-amber-700 mt-0.5">Resume reviewing them, or start a fresh upload below.</p>
                                            <div className="flex items-center gap-2 mt-3">
                                                <button
                                                    onClick={() => {
                                                        useAllUnresolvedRef.current = true;
                                                        setUseAllUnresolved(true);
                                                        setStep('review');
                                                        setShowResumePrompt(false);
                                                    }}
                                                    className="px-4 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors"
                                                >
                                                    🚀 Resume Pending
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div
                                    onDrop={handleDrop}
                                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                    onDragLeave={() => setDragOver(false)}
                                    className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all
                                        ${dragOver ? 'border-indigo-500 bg-indigo-50 scale-[1.01]' : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/40'}`}
                                >
                                    {/* File picker — individual files */}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        multiple
                                        accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,image/*,application/pdf"
                                        className="hidden"
                                        onChange={handleFileChange}
                                    />
                                    {/* Folder picker — entire folder */}
                                    <input
                                        ref={folderInputRef}
                                        type="file"
                                        multiple
                                        // @ts-ignore
                                        webkitdirectory=""
                                        directory=""
                                        mozdirectory=""
                                        className="hidden"
                                        onChange={handleFolderChange}
                                    />
                                    <div className="flex flex-col items-center gap-3">
                                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl transition-all ${dragOver ? 'bg-indigo-100 scale-110' : 'bg-gray-100'}`}>📄</div>
                                        <div>
                                            <p className="text-base font-semibold text-gray-700 font-bold">{dragOver ? 'Drop files here!' : 'Drag & drop invoices here'}</p>
                                            <p className="text-sm text-gray-500 mt-1 italic">or use the buttons below · PDF and image files supported</p>
                                        </div>
                                        <div className="flex gap-3 mt-4">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); fileInputRef.current?.click(); }}
                                                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold shadow-md active:scale-95 transition-all hover:bg-indigo-700"
                                            >
                                                📄 Select Files
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); folderInputRef.current?.click(); }}
                                                className="px-5 py-2.5 bg-white text-indigo-700 border border-indigo-200 rounded-xl text-sm font-semibold shadow-sm active:scale-95 transition-all hover:bg-indigo-50"
                                            >
                                                📁 Select Folder
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {selectedFiles.length > 0 && (
                                    <div>
                                        <div className="flex items-center justify-between mb-3 px-2">
                                            <h3 className="text-sm font-bold text-indigo-900">Selected Files ({selectedFiles.length})</h3>
                                            <button onClick={() => setSelectedFiles([])} className="text-xs text-red-500 hover:text-red-700 font-bold underline">Clear all</button>
                                        </div>
                                        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                                            {selectedFiles.map((f, idx) => (
                                                <div key={idx} className="flex items-center gap-3 p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                                                    <div className="text-xl flex-shrink-0">{f.type === 'application/pdf' ? '📕' : '🖼️'}</div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold text-gray-800 truncate">{f.name}</p>
                                                        <p className="text-xs text-gray-500 italic">{(f.size / 1024).toFixed(1)} KB</p>
                                                    </div>
                                                    <button onClick={e => { e.stopPropagation(); removeFile(idx); }} className="text-gray-400 hover:text-red-500 transition-colors">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ────── STEP: SCANNING ────── */}
                        {step === 'scanning' && (
                            <div className="p-6 flex flex-col items-center justify-center min-h-[300px] gap-6">
                                <div className="relative w-24 h-24">
                                    <div className="absolute inset-0 rounded-full border-4 border-indigo-100" />
                                    <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-500 animate-spin" style={{ animationDuration: '1s' }} />
                                    <div className="absolute inset-0 flex items-center justify-center text-2xl">🤖</div>
                                </div>
                                <div className="text-center">
                                    <h3 className="text-lg font-bold text-gray-800">AI Extracting {voucherType} Data…</h3>
                                    <p className="text-sm text-gray-500 mt-1 italic">{scanCurrentFile}</p>
                                </div>
                                <div className="w-full max-w-sm">
                                    <div className="flex justify-between text-xs font-bold text-indigo-600 mb-2"><span>Scanning Progress</span><span>{scanProgress}%</span></div>
                                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${scanProgress}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
                                    </div>
                                    {countdownSeconds !== null && (
                                        <div className="flex items-center justify-center gap-1.5 mt-4 text-indigo-600 font-bold bg-indigo-50 py-2 rounded-lg border border-indigo-100">
                                            <span>⏱</span>
                                            <span className="text-sm tabular-nums">
                                                {countdownSeconds > 0
                                                    ? `${Math.floor(countdownSeconds / 60)}:${String(countdownSeconds % 60).padStart(2, '0')} remaining`
                                                    : 'Almost done...'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ────── STEP: REVIEW ────── */}
                        {step === 'review' && (
                            <div className="p-4 space-y-4">
                                <div className="grid grid-cols-1 gap-4">
                                    <div
                                        onClick={() => setFilterStatus('pending')}
                                        className={`p-4 rounded-2xl border-2 text-center font-bold cursor-pointer transition-all shadow-lg ${filterStatus === 'pending'
                                            ? 'border-amber-500 bg-amber-50 text-amber-700 ring-4 ring-amber-100'
                                            : 'border-amber-100 bg-amber-50/50 text-amber-600 hover:border-amber-300'
                                            }`}
                                    >
                                        <div className="text-2xl mb-1">⚠️</div>
                                        <div className="text-3xl">{attentionNeededCount}</div>
                                        <div className="text-[10px] uppercase opacity-70 tracking-wider">Need Attention</div>
                                        <div className="text-[9px] font-medium text-amber-500 mt-1 italic leading-tight">
                                            {errorCount > 0 ? `${errorCount} errors, ` : ''}
                                            {missingCount > 0 ? `${missingCount} missing vendors` : ''}
                                            {conflictCount > 0 ? `${missingCount > 0 ? ' & ' : ''}${conflictCount} conflicts` : ''}
                                            {attentionNeededCount === 0 && 'All clear!'}
                                        </div>
                                    </div>
                                </div>

                                {/* Footer Filter Toggle - removed for focus */}

                                {/* Banners */}
                                {missingCount > 0 && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2 text-sm text-amber-800 font-medium">
                                        <span className="flex-shrink-0 text-base">⚠️</span>
                                        <span><strong>{missingCount} invoice(s)</strong> have unknown vendors. Create the vendor before saving.</span>
                                    </div>
                                )}
                                {conflictCount > 0 && (
                                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2 text-sm text-red-800 font-medium">
                                        <span className="flex-shrink-0 text-base">⚠️</span>
                                        <span><strong>{conflictCount} invoice(s)</strong> have a GSTIN that matches a different vendor name. Manual verification required.</span>
                                    </div>
                                )}
                                {pendingCount > 0 && (
                                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between text-sm text-blue-800 font-medium animate-pulse">
                                        <div className="flex items-center gap-2">
                                            <span className="flex-shrink-0 text-base">⏳</span>
                                            <span>Validating <strong>{pendingCount}</strong> vendor(s) via AI pipeline…</span>
                                        </div>
                                        <div className="text-[10px] bg-blue-100 px-2 py-0.5 rounded-full">Attempt {retryCount}/3</div>
                                    </div>
                                )}

                                {fetchError && (
                                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between text-sm text-red-800 font-medium">
                                        <div className="flex items-center gap-2">
                                            <span className="flex-shrink-0 text-base">❌</span>
                                            <span>{fetchError}</span>
                                        </div>
                                        <button
                                            onClick={() => fetchStagedInvoices()}
                                            className="px-3 py-1 bg-red-600 text-white rounded-lg text-[10px] font-bold hover:bg-red-700 transition-colors uppercase"
                                        >
                                            Retry Sync
                                        </button>
                                    </div>
                                )}

                                <div className="flex items-center justify-between px-2 mb-2">
                                    <div className="text-xs font-bold text-gray-500 uppercase tracking-tight">
                                        {selectedHashes.size > 0 ? `${selectedHashes.size} items selected` : 'Select items to bulk delete'}
                                    </div>
                                    {selectedHashes.size > 0 && (
                                        <button
                                            onClick={handleBulkDelete}
                                            className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-bold hover:bg-red-200 transition-colors flex items-center gap-1.5"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            Delete Selected
                                        </button>
                                    )}
                                </div>
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr className="text-gray-600 text-[10px] uppercase font-bold tracking-wider">
                                            <th className="px-3 py-3 text-left w-8">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                    checked={selectedHashes.size > 0 && selectedHashes.size === scanResults.filter(row => !['READY', 'FOUND', 'RESOLVED'].includes(row.validationStatus)).length}
                                                    onChange={toggleSelectAll}
                                                />
                                            </th>
                                            <th className="px-3 py-3 text-center w-10">S.No</th>
                                            <th className="px-3 py-3 text-left">File Name</th>
                                            <th className="px-3 py-3 text-left">Inv No</th>
                                            <th className="px-3 py-3 text-left">Date</th>
                                            <th className="px-3 py-3 text-left">Vendor</th>
                                            <th className="px-3 py-3 text-left">GSTIN</th>
                                            <th className="px-3 py-3 text-right">Amount</th>
                                            <th className="px-3 py-3 text-center">Status</th>
                                            <th className="px-3 py-3 text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {scanResults
                                            .filter(row => {
                                                if (filterStatus === 'pending') {
                                                    return !['READY', 'FOUND', 'RESOLVED'].includes(row.validationStatus);
                                                }
                                                return ['READY', 'FOUND', 'RESOLVED'].includes(row.validationStatus);
                                            })
                                            .map((row, idx) => {
                                                const invoice = row.extracted_data || {};
                                                return (
                                                    <tr key={idx} className={`group hover:bg-indigo-50/40 transition-colors ${selectedHashes.has(row.file_hash) ? 'bg-indigo-50' : row.validationStatus === 'GSTIN_CONFLICT' ? 'bg-red-50/40' :
                                                        row.validationStatus === 'NOT_FOUND' ? 'bg-amber-50/30' : ''
                                                        }`}>
                                                        <td className="px-3 py-3">
                                                            <input
                                                                type="checkbox"
                                                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                                checked={selectedHashes.has(row.file_hash)}
                                                                onChange={() => toggleSelectRow(row.file_hash)}
                                                                onClick={e => e.stopPropagation()}
                                                            />
                                                        </td>
                                                        <td className="px-3 py-3 text-center text-xs font-bold text-gray-500">
                                                            {idx + 1}
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <div className="flex flex-col">
                                                                <span className="truncate max-w-[120px] font-medium text-gray-700" title={row.file_path}>{row.file_path}</span>
                                                                <button onClick={() => setDetailsRow(row)} className="text-[10px] text-indigo-500 hover:text-indigo-700 underline font-bold text-left mt-0.5">View Details</button>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 font-bold text-gray-800 text-[11px]">{invoice.invoice_number || row.invoice_number || '—'}</td>
                                                        <td className="px-3 py-3 text-[11px] text-gray-600 font-medium whitespace-nowrap">{invoice.invoice_date || row.invoice_date || '—'}</td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-gray-900 text-[11px] leading-tight truncate max-w-[120px]" title={invoice.vendor_name || row.vendor_name}>{invoice.vendor_name || row.vendor_name || '—'}</span>
                                                                {row.validationStatus === 'GSTIN_CONFLICT' && row.conflictMessage ? (
                                                                    <span className="text-[9px] text-red-600 font-bold uppercase tracking-tighter mt-0.5 leading-tight">{row.conflictMessage}</span>
                                                                ) : row.matchedBy && (
                                                                    <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-tighter mt-0.5">Matched by {row.matchedBy}</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 font-mono text-[10px] text-gray-500">{invoice.vendor_gstin || row.vendor_gstin || '—'}</td>
                                                        <td className="px-3 py-3 text-right font-black text-gray-900 text-[11px]">₹{invoice.total_amount || row.total_amount || '—'}</td>
                                                        <td className="px-2 py-3 text-center"><StatusBadge status={row.validationStatus} title={row.conflictMessage} /></td>
                                                        <td className="px-2 py-3 text-center">
                                                            <div className="flex items-center justify-center gap-1">
                                                                {['VENDOR_MISSING', 'NOT_FOUND'].includes(row.validationStatus) ? (
                                                                    <button onClick={() => setResolvingRow(row)} className="px-2 py-1 bg-amber-500 text-white rounded text-[10px] font-bold hover:bg-amber-600 uppercase">Create Vendor</button>
                                                                ) : row.validationStatus === 'GSTIN_CONFLICT' ? (
                                                                    <button onClick={() => setEditingRow(row)} className="px-2 py-1 bg-red-500 text-white rounded text-[10px] font-bold hover:bg-red-600 uppercase">Resolve</button>
                                                                ) : row.validationStatus === 'LOW_CONFIDENCE' ? (
                                                                    <button onClick={() => setEditingRow(row)} className="px-2 py-1 bg-amber-600 text-white rounded text-[10px] font-bold hover:bg-amber-700 uppercase" title={row.conflictMessage || "Low confidence OCR – manual review needed"}>Review</button>
                                                                ) : row.validationStatus === 'NEEDS_ATTENTION' ? (
                                                                    <button onClick={() => setEditingRow(row)} className="px-2 py-1 bg-orange-500 text-white rounded text-[10px] font-bold hover:bg-orange-600 uppercase" title={row.conflictMessage || "Manual review required"}>Review</button>
                                                                ) : row.validationStatus === 'VALIDATION_FAILED' ? (
                                                                    <span className="text-red-500 text-[10px] uppercase font-bold text-center px-1" title={row.conflictMessage || "Invalid data"}>Fix Data</span>
                                                                ) : ['EXTRACTION_FAILED', 'ERROR'].includes(row.validationStatus) ? (
                                                                    <span className="text-red-500 text-[10px] uppercase font-bold text-center px-1" title={row.conflictMessage || "Extraction failed"}>Retry</span>
                                                                ) : row.validationStatus === 'PENDING' ? (
                                                                    <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent animate-spin rounded-full" />
                                                                ) : row.validationStatus === 'VOUCHER_CREATED' ? (
                                                                    <div className="flex flex-col items-center">
                                                                        <div className="w-5 h-5 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
                                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                                        </div>
                                                                        <span className="text-[8px] font-black text-indigo-600 uppercase mt-0.5 whitespace-nowrap">Voucher Created</span>
                                                                    </div>
                                                                ) : (
                                                                    <div className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                                    </div>
                                                                )}
                                                                {/* Revalidate button — triggers a fresh vendor check without opening edit modal */}
                                                                {!['PENDING', 'VOUCHER_CREATED'].includes(row.validationStatus) && (
                                                                    <button
                                                                        onClick={async () => {
                                                                            setScanResults(prev => prev.map(r => r.file_hash === row.file_hash ? { ...r, validationStatus: 'PENDING' } : r));
                                                                            try {
                                                                                const result: any = await httpClient.patch(`/api/ocr-staging/${row.file_hash}/`, { extracted_data: row.extracted_data });
                                                                                setScanResults(prev => prev.map(r => {
                                                                                    if (r.file_hash !== row.file_hash) return r;
                                                                                    let newStatus: ValidationStatus = 'VENDOR_MISSING';
                                                                                    const s = result.status || '';
                                                                                    if (s === 'READY' || s === 'found' || s === 'FOUND') newStatus = 'READY';
                                                                                    else if (s === 'VENDOR_MISSING' || s === 'NOT_FOUND' || s === 'not_found') newStatus = 'VENDOR_MISSING';
                                                                                    else if (s === 'GSTIN_CONFLICT' || s === 'gstin_conflict') newStatus = 'GSTIN_CONFLICT';
                                                                                    const updated = { ...r, validationStatus: newStatus, vendor_id: result.vendor_id ?? r.vendor_id, vendor_name: result.vendor_name || r.vendor_name };
                                                                                    if (newStatus === 'VENDOR_MISSING') setTimeout(() => setResolvingRow(updated), 150);
                                                                                    return updated;
                                                                                }));
                                                                            } catch { fetchStagedInvoices(); }
                                                                        }}
                                                                        className="p-1 hover:bg-indigo-100 rounded text-indigo-400 hover:text-indigo-700 transition-colors"
                                                                        title="Revalidate vendor"
                                                                    >
                                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                                    </button>
                                                                )}
                                                                <button onClick={() => setEditingRow(row)} className="p-1 hover:bg-indigo-100 rounded text-indigo-600" title="Edit Data">
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                    </svg>
                                                                </button>
                                                                <button onClick={() => handleRemove(row.file_hash)} className="p-1 hover:bg-red-100 rounded text-red-600" title="Remove Invoice">
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* ────── STEP: FINALIZING ────── */}
                        {step === 'finalizing' && (
                            <div className="p-6 flex flex-col items-center justify-center min-h-[300px] gap-6">
                                <div className="relative w-24 h-24">
                                    <div className="absolute inset-0 rounded-full border-4 border-emerald-100" />
                                    <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500 animate-spin" style={{ animationDuration: '0.8s' }} />
                                    <div className="absolute inset-0 flex items-center justify-center text-2xl">💾</div>
                                </div>
                                <div className="text-center">
                                    <h3 className="text-lg font-bold text-gray-800">Finalizing {voucherType} Vouchers…</h3>
                                    <p className="text-sm text-gray-500 mt-1 italic saving-info">Processing your invoices into the ledger.</p>
                                </div>
                            </div>
                        )}

                        {/* ────── STEP: DONE ────── */}
                        {step === 'done' && finalizeResult && (
                            <div className="p-6 space-y-5">
                                <div className={`rounded-2xl p-6 text-center text-white ${finalizeResult.failed === 0 ? 'bg-emerald-600' : 'bg-amber-600'}`}>
                                    <div className="text-4xl mb-2">{finalizeResult.failed === 0 ? '🎉' : '⚠️'}</div>
                                    <h3 className="text-2xl font-bold">{finalizeResult.failed === 0 ? 'Finalization Complete!' : 'Partial Success'}</h3>
                                    <p className="mt-2 text-sm font-medium opacity-90 leading-relaxed max-w-md mx-auto">{finalizeResult.message || `${finalizeResult.created} of ${finalizeResult.total} vouchers created`}</p>
                                </div>
                                <div className="grid grid-cols-4 gap-3">
                                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center"><div className="text-2xl font-bold">{finalizeResult.total}</div><div className="text-xs text-gray-500">Total</div></div>
                                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center"><div className="text-2xl font-bold text-emerald-700">{finalizeResult.created}</div><div className="text-xs text-gray-500">Success</div></div>
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center"><div className="text-2xl font-bold text-amber-700">{finalizeResult.skipped}</div><div className="text-xs text-gray-500">Left in Staging</div></div>
                                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center"><div className="text-2xl font-bold text-red-700">{finalizeResult.failed}</div><div className="text-xs text-gray-500">Internal Error</div></div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Footer ── */}
                    <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t flex-shrink-0">
                        <div className="text-xs text-gray-400 font-mono italic">
                            {step === 'review' && scanId && `Session: ${scanId.slice(0, 8)}…`}
                        </div>
                        <div className="flex items-center gap-3">
                            {step === 'done' ? (
                                <button onClick={onClose} className="px-8 py-2.5 bg-gray-800 text-white rounded-xl text-sm font-bold shadow-lg">Close & Finish</button>
                            ) : (
                                <>
                                    <button onClick={onClose} disabled={step === 'scanning' || step === 'finalizing'} className="px-6 py-2.5 text-sm font-bold text-gray-600 hover:text-gray-900 font-bold transition-colors">Cancel</button>

                                    {step === 'upload' && (
                                        <button onClick={handleScan} disabled={selectedFiles.length === 0} className="px-8 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-bold shadow-lg disabled:opacity-40 flex items-center gap-2">
                                            Scan {selectedFiles.length > 0 ? `${selectedFiles.length} File(s)` : 'Files'}
                                        </button>
                                    )}

                                    {step === 'review' && (
                                        <>
                                            <button
                                                onClick={handleBack}
                                                className="px-6 py-2.5 text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                                            >
                                                ← Back
                                            </button>
                                            <button
                                                onClick={handleDownloadExcel}
                                                className="px-6 py-2.5 bg-white text-indigo-700 border border-indigo-200 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                </svg>
                                                Download Excel
                                            </button>
                                            <button onClick={handleFinalize} disabled={!canFinalize || finalizing} className="px-8 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-sm font-bold shadow-xl disabled:opacity-40 flex items-center gap-2">
                                                {finalizing ? 'Saving...' : 'Finalize & Save Vouchers'}
                                            </button>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div >
        </>
    );
};

export default BulkInvoiceUploadModal;
