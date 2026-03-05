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
import { showError, showSuccess, showInfo } from '../utils/toast';
import CreateVendorModal from './CreateVendorModal';
import { VOUCHER_COLUMN_SCHEMAS } from '../services/mappingEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type VendorStatus = 'FOUND' | 'MISSING' | 'RESOLVED' | 'ERROR';
type ValidationStatus = 'READY' | 'VENDOR_MISSING' | 'VALIDATION_FAILED' | 'EXTRACTION_FAILED' | 'PENDING' | 'RESOLVED' | 'FOUND' | 'NOT_FOUND' | 'GSTIN_CONFLICT' | 'ERROR';

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
    status: string; // "Found" | "Vendor Missing" | "Error"
    extracted_data: any;
    created_at: string;
    // ── Fields from re-validation ──
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
        VALIDATION_FAILED: { label: 'Invalid Data', cls: 'bg-red-100 text-red-800 border border-red-300', icon: '⚠️' },
        EXTRACTION_FAILED: { label: 'Scan Failed', cls: 'bg-red-100 text-red-800 border border-red-300', icon: '❌' },
        GSTIN_CONFLICT: { label: 'Conflict', cls: 'bg-red-100 text-red-800 border border-red-300', icon: '⚠️' },
        PENDING: { label: '...', cls: 'bg-gray-100 text-gray-600 border border-gray-200', icon: '⏳' },
        ERROR: { label: 'Error', cls: 'bg-red-100 text-red-800 border border-red-300', icon: '❌' },
    };
    const { label, cls, icon } = cfg[status as string] || cfg.ERROR;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-tight cursor-help ${cls}`} title={title}>
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
}

type ModalStep = 'upload' | 'scanning' | 'review' | 'finalizing' | 'done';

const BulkInvoiceUploadModal: React.FC<BulkInvoiceUploadModalProps> = ({
    onClose,
    onFinalized,
    voucherType = 'Purchase',
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    // State
    const [step, setStep] = useState<ModalStep>('upload');
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

    const fetchStagedInvoices = useCallback(async (seedData?: any[]) => {
        try {
            let res: any[];
            if (seedData) {
                res = seedData;
            } else {
                // Use ref so this stable callback always reads the latest value
                const allUnresolved = useAllUnresolvedRef.current;
                const queryParam = allUnresolved ? '' : `?upload_session_id=${uploadSessionId}`;
                res = await httpClient.get(`/api/ocr-staging/${queryParam}`);
            }
            console.log("OCR staging rows:", useAllUnresolvedRef.current ? "ALL" : uploadSessionId, res);

            if (Array.isArray(res)) {
                const seeded: ScanResult[] = res.map((r: any) => {
                    // Back-compat: map backend 'status' or 'validation_status'
                    const backendStatus = r.validation_status || r.status;
                    let vStatus: ValidationStatus = 'PENDING';

                    if (backendStatus === 'READY') vStatus = 'READY';
                    else if (backendStatus === 'VENDOR_MISSING') vStatus = 'VENDOR_MISSING';
                    else if (backendStatus === 'VALIDATION_FAILED') vStatus = 'VALIDATION_FAILED';
                    else if (backendStatus === 'EXTRACTION_FAILED') vStatus = 'EXTRACTION_FAILED';
                    else if (backendStatus === 'FOUND') vStatus = 'READY'; // Convert legacy FOUND to READY
                    else if (backendStatus === 'NOT_FOUND' || backendStatus === 'Vendor Missing') vStatus = 'VENDOR_MISSING';
                    else if (backendStatus === 'GSTIN_CONFLICT') vStatus = 'GSTIN_CONFLICT';
                    else if (backendStatus === 'RESOLVED') vStatus = 'RESOLVED';
                    else if (backendStatus === 'ERROR') vStatus = 'EXTRACTION_FAILED';

                    return {
                        ...r,
                        extracted_data: r.extracted_data || {},
                        validationStatus: vStatus,
                        // legacy fields
                        vendor_status: (vStatus === 'READY' || vStatus === 'RESOLVED') ? 'FOUND' : 'MISSING'
                    };
                });
                setScanResults(seeded);

                // We only re-validate PENDING rows or if we want to refresh everything
                seeded.filter(r => r.validationStatus === 'PENDING').forEach(async (row) => {
                    // ... (existing validation loop logic if needed, but backend already did it)
                });
            }
        } catch (err) {
            console.error("Failed to fetch staged invoices", err);
        }
    }, [uploadSessionId]);

    useEffect(() => {
        if (step === 'review' && scanResults.length === 0) {
            fetchStagedInvoices();
        }
    }, [step, fetchStagedInvoices, scanResults.length]);

    // ── STEP 1 — SCAN ────────────────────────────────────────────────────────

    const handleScan = async () => {
        if (selectedFiles.length === 0) {
            showError('Please select at least one invoice file.');
            return;
        }

        setStep('scanning');
        setScanProgress(5);
        setScanCurrentFile('Preparing upload…');

        try {
            const avgRes = await apiService.getExtractionAverageTime();
            const avgTime = avgRes?.average_time_per_invoice || 3.85;
            setEstimatedExtractionTime(avgTime * selectedFiles.length);
        } catch (error) {
            setEstimatedExtractionTime(3.85 * selectedFiles.length);
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
                fetchStagedInvoices(res.staged);
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

    const canFinalize = scanResults.some(r => ['READY', 'FOUND', 'RESOLVED'].includes(r.validationStatus));

    const handleFinalize = async () => {
        if (!canFinalize) {
            showError('No valid invoices to finalize. Please resolve issues first.');
            return;
        }

        const validCount = scanResults.filter(r => ['READY', 'FOUND', 'RESOLVED'].includes(r.validationStatus)).length;
        const total = scanResults.length;

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



    // ── Render ────────────────────────────────────────────────────────────────

    const missingCount = scanResults.filter(r => r.validationStatus === 'VENDOR_MISSING' || r.validationStatus === 'NOT_FOUND').length;
    const conflictCount = scanResults.filter(r => r.validationStatus === 'GSTIN_CONFLICT').length;
    const resolvedCount = scanResults.filter(r => r.validationStatus === 'RESOLVED').length;
    const readyCount = scanResults.filter(r => r.validationStatus === 'READY' || r.validationStatus === 'FOUND').length;
    const errorCount = scanResults.filter(r => r.validationStatus === 'VALIDATION_FAILED' || r.validationStatus === 'EXTRACTION_FAILED' || r.validationStatus === 'ERROR').length;
    const pendingCount = scanResults.filter(r => r.validationStatus === 'PENDING').length;

    const attentionNeededCount = scanResults.filter(r => !['READY', 'FOUND', 'RESOLVED'].includes(r.validationStatus)).length;

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
                    supplierItemCode: it['Item Code'] || it['Part No'] || '',
                    supplierItemName: it['Item Name'] || it['Description'] || '',
                    hsnSac: it['HSN/SAC'] || it['HSN Code'] || ''
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

                            return {
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
                        }));
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
                                <div className="grid grid-cols-2 gap-4">
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

                                    <div
                                        onClick={() => setFilterStatus('ready')}
                                        className={`p-4 rounded-2xl border-2 text-center font-bold cursor-pointer transition-all shadow-lg ${filterStatus === 'ready'
                                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-4 ring-emerald-100'
                                            : 'border-emerald-100 bg-emerald-50/50 text-emerald-600 hover:border-emerald-300'
                                            }`}
                                    >
                                        <div className="text-2xl mb-1">✅</div>
                                        <div className="text-3xl">{readyCount + resolvedCount}</div>
                                        <div className="text-[10px] uppercase opacity-70 tracking-wider">Ready for Upload</div>
                                        <div className="text-[9px] font-medium text-emerald-500 mt-1 italic leading-tight">
                                            {(readyCount + resolvedCount) > 0 ? 'Verified & ready to save' : 'No items ready yet'}
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
                                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex gap-2 text-sm text-gray-600 font-medium">
                                        <span className="flex-shrink-0 text-base">⏳</span>
                                        <span>Validating <strong>{pendingCount}</strong> vendor(s)…</span>
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
                                                                ) : row.validationStatus === 'VALIDATION_FAILED' ? (
                                                                    <span className="text-red-500 text-[10px] uppercase font-bold text-center px-1" title={row.conflictMessage || "Invalid data"}>Fix Data</span>
                                                                ) : ['EXTRACTION_FAILED', 'ERROR'].includes(row.validationStatus) ? (
                                                                    <span className="text-red-500 text-[10px] uppercase font-bold text-center px-1" title={row.conflictMessage || "Extraction failed"}>Retry</span>
                                                                ) : row.validationStatus === 'PENDING' ? (
                                                                    <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent animate-spin rounded-full" />
                                                                ) : (
                                                                    <div className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                                    </div>
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
