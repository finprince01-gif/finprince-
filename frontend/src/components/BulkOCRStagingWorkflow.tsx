/**
 * BulkOCRStagingWorkflow.tsx
 * =========================================================
 * Fully editable Bulk OCR Staging Workflow.
 *
 * Flow:
 *  1. Upload invoices → OCR runs → results saved in invoice_ocr_temp
 *  2. Preview table loads from staging (extracted_data)
 *  3. User edits any field freely → Save → auto-revalidate → status updates instantly
 *  4. If vendor missing → Create Vendor button → revalidate → status: found
 *  5. Upload Vouchers → only processes found invoices; missing ones stay in staging
 *  6. Next session: existing unresolved invoices are loaded automatically
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { apiService } from '../services';
import { showError, showSuccess, showInfo } from '../utils/toast';
import CreateVendorModal from './CreateVendorModal';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StagedInvoice {
    id: number;
    file_hash: string;
    file_path: string;
    invoice_number: string;
    invoice_date: string;
    vendor_name: string;
    vendor_gstin: string;
    total_amount: string;
    /** 'Found' | 'Vendor Missing' | 'Error' — from backend */
    status: string;
    /** validation_status after edit: 'found' | 'missing' | 'error' */
    validation_status?: 'found' | 'missing' | 'error';
    extracted_data: any;
    created_at: string;
    vendor_id?: number | null;
}

interface EditModalState {
    invoice: StagedInvoice;
    draft: any; // deep clone of extracted_data being edited
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateSessionId = () =>
    `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const resolvedStatus = (inv: StagedInvoice): 'found' | 'missing' | 'error' => {
    if (inv.validation_status) return inv.validation_status;
    const s = (inv.status || '').toLowerCase();
    if (s === 'found' || s === 'vendor found') return 'found';
    if (s === 'error') return 'error';
    return 'missing';
};

const StatusBadge: React.FC<{ status: 'found' | 'missing' | 'error' }> = ({ status }) => {
    const map = {
        found: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        missing: 'bg-amber-100 text-amber-800 border-amber-300',
        error: 'bg-red-100 text-red-800 border-red-300',
    };
    const label = { found: '✅ Vendor Found', missing: '⚠ Vendor Missing', error: '❌ Error' };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${map[status]}`}>
            {label[status]}
        </span>
    );
};

// ─── Invoice Edit Modal ───────────────────────────────────────────────────────

interface EditModalProps {
    state: EditModalState;
    onClose: () => void;
    onSave: (fileHash: string, extractedData: any) => Promise<void>;
}

const EditModal: React.FC<EditModalProps> = ({ state, onClose, onSave }) => {
    const [draft, setDraft] = useState<any>(() => JSON.parse(JSON.stringify(state.draft)));
    const [saving, setSaving] = useState(false);

    // Get the "invoice header" object from the draft
    const getInvoiceHeader = (): Record<string, any> => {
        const d = draft;
        if (d && typeof d === 'object') {
            if (d.invoice && typeof d.invoice === 'object') return d.invoice;
            if (d.header && typeof d.header === 'object') return d.header;
        }
        return typeof d === 'object' ? d : {};
    };

    const getItems = (): any[] => {
        const d = draft;
        if (d && typeof d === 'object') {
            return d.items || d.line_items || [];
        }
        return [];
    };

    const setHeaderField = (key: string, value: string) => {
        setDraft((prev: any) => {
            const next = JSON.parse(JSON.stringify(prev));
            // Determine where the invoice header lives
            if (next.invoice && typeof next.invoice === 'object') {
                next.invoice[key] = value;
            } else if (next.header && typeof next.header === 'object') {
                next.header[key] = value;
            } else {
                next[key] = value;
            }
            return next;
        });
    };

    const setItemField = (idx: number, key: string, value: string) => {
        setDraft((prev: any) => {
            const next = JSON.parse(JSON.stringify(prev));
            const items = next.items || next.line_items || [];
            if (items[idx]) items[idx][key] = value;
            if (next.items) next.items = items;
            else if (next.line_items) next.line_items = items;
            return next;
        });
    };

    const addItem = () => {
        setDraft((prev: any) => {
            const next = JSON.parse(JSON.stringify(prev));
            const newItem = { 'Item Name': '', 'HSN/SAC': '', 'Quantity': '', 'UOM': '', 'Rate': '', 'Taxable Value': '', 'IGST': '', 'CGST': '', 'SGST/UTGST': '', 'Item Amount': '' };
            if (next.items) next.items.push(newItem);
            else if (next.line_items) next.line_items.push(newItem);
            else next.items = [newItem];
            return next;
        });
    };

    const removeItem = (idx: number) => {
        setDraft((prev: any) => {
            const next = JSON.parse(JSON.stringify(prev));
            if (next.items) next.items.splice(idx, 1);
            else if (next.line_items) next.line_items.splice(idx, 1);
            return next;
        });
    };

    const header = getInvoiceHeader();
    const items = getItems();

    // Key header fields to show prominently
    const HEADER_KEYS = [
        'Vendor Name', 'GSTIN', 'Supplier Invoice No', 'Voucher Date',
        'Total Invoice Value', 'Grand Total', 'Total Taxable Value',
        'Bill From - Address Line 1', 'Place of Supply', 'Bill From - State', 'Branch',
    ];
    // All unique header keys (including any extra ones from OCR)
    const allHeaderKeys = Array.from(new Set([...HEADER_KEYS, ...Object.keys(header)])).filter(
        k => !['items', 'line_items'].includes(k)
    );
    const itemKeys = items.length > 0
        ? Array.from(new Set(items.flatMap(i => Object.keys(i))))
        : ['Item Name', 'HSN/SAC', 'Quantity', 'UOM', 'Rate', 'Taxable Value', 'IGST', 'CGST', 'SGST/UTGST', 'Item Amount'];

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(state.invoice.file_hash, draft);
            onClose();
        } catch (e) {
            showError('Failed to save edits. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-indigo-600 to-indigo-700 text-white flex-shrink-0">
                    <div>
                        <h2 className="text-lg font-bold">Edit Invoice</h2>
                        <p className="text-indigo-200 text-xs mt-0.5 font-mono truncate max-w-96">{state.invoice.file_path}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-indigo-500 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 p-6 space-y-6">

                    {/* Invoice Header Fields */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">1</span>
                            Invoice Header Fields
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {allHeaderKeys.map(key => (
                                <div key={key}>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">{key}</label>
                                    <input
                                        type="text"
                                        value={header[key] ?? ''}
                                        onChange={e => setHeaderField(key, e.target.value)}
                                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-colors bg-white"
                                        placeholder={`Enter ${key}`}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Line Items */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">2</span>
                                Line Items ({items.length})
                            </h3>
                            <button
                                onClick={addItem}
                                className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-300 hover:border-indigo-500 rounded-md px-3 py-1.5 transition-colors"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Add Item
                            </button>
                        </div>

                        {items.length === 0 ? (
                            <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg">
                                No line items. Click "Add Item" to add one.
                            </div>
                        ) : (
                            <div className="border rounded-lg overflow-hidden overflow-x-auto">
                                <table className="min-w-full text-xs">
                                    <thead className="bg-indigo-600 text-white">
                                        <tr>
                                            <th className="px-2 py-2 text-center font-semibold w-8">#</th>
                                            {itemKeys.map(k => (
                                                <th key={k} className="px-3 py-2 text-left font-semibold whitespace-nowrap min-w-[100px]">{k}</th>
                                            ))}
                                            <th className="px-2 py-2 w-8"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {items.map((item, idx) => (
                                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                <td className="px-2 py-1 text-center text-gray-400">{idx + 1}</td>
                                                {itemKeys.map(k => (
                                                    <td key={k} className="px-1 py-1">
                                                        <input
                                                            type="text"
                                                            value={item[k] ?? ''}
                                                            onChange={e => setItemField(idx, k, e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 bg-transparent text-xs"
                                                        />
                                                    </td>
                                                ))}
                                                <td className="px-1 py-1">
                                                    <button
                                                        onClick={() => removeItem(idx)}
                                                        className="text-red-400 hover:text-red-600 transition-colors p-0.5"
                                                        title="Remove item"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 flex-shrink-0">
                    <p className="text-xs text-gray-500">
                        💡 All fields are editable. Validation runs automatically after saving.
                    </p>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                            {saving ? (
                                <>
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Saving…
                                </>
                            ) : '💾 Save & Revalidate'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface BulkOCRStagingWorkflowProps {
    /** If provided, only load/process invoices belonging to this session. */
    uploadSessionId?: string;
    /** Called after successful finalization so parent can refresh counters etc. */
    onFinalizeSuccess?: (summary: any) => void;
    /** Optional CSS class for the root element */
    className?: string;
}

const BulkOCRStagingWorkflow: React.FC<BulkOCRStagingWorkflowProps> = ({
    uploadSessionId: externalSessionId,
    onFinalizeSuccess,
    className = '',
}) => {
    // ── Session ──────────────────────────────────────────────────────────────
    const sessionIdRef = useRef<string>(externalSessionId || generateSessionId());
    const sessionId = sessionIdRef.current;

    // ── State ────────────────────────────────────────────────────────────────
    const [invoices, setInvoices] = useState<StagedInvoice[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [finalizing, setFinalizing] = useState(false);
    const [editModal, setEditModal] = useState<EditModalState | null>(null);
    const [createVendorFor, setCreateVendorFor] = useState<StagedInvoice | null>(null);
    const [revalidating, setRevalidating] = useState<Set<string>>(new Set());
    const [viewDetailsFor, setViewDetailsFor] = useState<StagedInvoice | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    // ── Load staging from backend ────────────────────────────────────────────
    const loadStaged = useCallback(async (useAllUnresolved = false) => {
        setLoading(true);
        try {
            const sid = useAllUnresolved ? undefined : sessionId;
            const data = await apiService.getStagedInvoices(sid);
            const items: StagedInvoice[] = Array.isArray(data) ? data : [];
            // Normalize validation_status from 'status' field if not present
            setInvoices(items.map(inv => ({
                ...inv,
                validation_status: undefined, // will be derived via resolvedStatus()
            })));
        } catch (err) {
            console.error('[Staging] loadStaged error:', err);
        } finally {
            setLoading(false);
        }
    }, [sessionId]);

    // Load on mount — show ALL unresolved invoices (resume previous sessions)
    useEffect(() => { loadStaged(true); }, []);

    // ── Upload new files ─────────────────────────────────────────────────────
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setUploading(true);
        try {
            const result = await apiService.uploadToStaging(files, sessionId);
            const staged: StagedInvoice[] = result?.staged || [];
            if (staged.length > 0) {
                // Merge: add new invoices (by file_hash) keeping existing edits
                setInvoices(prev => {
                    const existingHashes = new Set(prev.map(i => i.file_hash));
                    const newItems = staged.filter(i => !existingHashes.has(i.file_hash));
                    return [...newItems, ...prev];
                });
                showSuccess(`✅ ${staged.length} invoice(s) processed and staged.`);
            } else {
                showInfo('ℹ No new invoices were staged (may already be in review).');
                // Still refresh to show any updated ones
                await loadStaged(true);
            }
        } catch (err: any) {
            showError(`❌ Upload failed: ${err?.message || 'Unknown error'}`);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ── Upload from folder selection ──────────────────────────────────────────
    const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const allFiles = Array.from(e.target.files || []);
        // Filter only PDF and image files from the selected folder
        const supported = allFiles.filter(f =>
            f.type === 'application/pdf' ||
            f.type.startsWith('image/') ||
            /\.(pdf|jpg|jpeg|png|webp)$/i.test(f.name)
        );
        if (!supported.length) {
            showError('No supported PDF or image files found in the selected folder.');
            if (folderInputRef.current) folderInputRef.current.value = '';
            return;
        }
        setUploading(true);
        try {
            const result = await apiService.uploadToStaging(supported, sessionId);
            const staged: StagedInvoice[] = result?.staged || [];
            if (staged.length > 0) {
                setInvoices(prev => {
                    const existingHashes = new Set(prev.map(i => i.file_hash));
                    const newItems = staged.filter(i => !existingHashes.has(i.file_hash));
                    return [...newItems, ...prev];
                });
                showSuccess(`✅ ${staged.length} invoice(s) from folder processed and staged.`);
            } else {
                showInfo('ℹ No new invoices were staged (may already be in review).');
                await loadStaged(true);
            }
        } catch (err: any) {
            showError(`❌ Folder upload failed: ${err?.message || 'Unknown error'}`);
        } finally {
            setUploading(false);
            if (folderInputRef.current) folderInputRef.current.value = '';
        }
    };

    // ── Save edits + auto-revalidate ─────────────────────────────────────────
    const handleSaveEdit = async (fileHash: string, extractedData: any) => {
        setRevalidating(prev => new Set(prev).add(fileHash));
        try {
            const result = await apiService.saveStagingEdit(fileHash, extractedData);
            setInvoices(prev => prev.map(inv => {
                if (inv.file_hash !== fileHash) return inv;
                const validStatus: 'found' | 'missing' | 'error' =
                    result.status === 'found' ? 'found' :
                        result.status === 'error' ? 'error' : 'missing';
                return {
                    ...inv,
                    extracted_data: result.extracted_data || extractedData,
                    invoice_number: result.invoice_number || inv.invoice_number,
                    invoice_date: result.invoice_date || inv.invoice_date,
                    vendor_name: result.vendor_name || inv.vendor_name,
                    vendor_gstin: result.vendor_gstin || inv.vendor_gstin,
                    total_amount: result.total_amount || inv.total_amount,
                    validation_status: validStatus,
                    vendor_id: result.vendor_id ?? inv.vendor_id,
                };
            }));
            const newStatus = result.status === 'found' ? 'Vendor Found ✅' : 'Vendor Missing ⚠';
            showSuccess(`✅ Saved. Status: ${newStatus}`);
        } catch (err: any) {
            showError(`❌ Save failed: ${err?.message || 'Unknown error'}`);
            throw err;
        } finally {
            setRevalidating(prev => { const s = new Set(prev); s.delete(fileHash); return s; });
        }
    };

    // ── Open edit modal ───────────────────────────────────────────────────────
    const openEdit = (inv: StagedInvoice) => {
        setEditModal({ invoice: inv, draft: JSON.parse(JSON.stringify(inv.extracted_data || {})) });
    };

    // ── Delete invoice from staging ──────────────────────────────────────────
    const handleDelete = async (inv: StagedInvoice) => {
        if (!window.confirm(`Remove "${inv.file_path}" from staging?`)) return;
        try {
            await apiService.deleteStagedInvoice(inv.file_hash);
            setInvoices(prev => prev.filter(i => i.file_hash !== inv.file_hash));
            showSuccess('🗑 Invoice removed from staging.');
        } catch {
            showError('Failed to remove invoice.');
        }
    };

    // ── Create Vendor → auto-revalidate ─────────────────────────────────────
    const handleCreateVendor = async (vendorData: any) => {
        if (!createVendorFor) return;
        const inv = createVendorFor;
        try {
            await apiService.createVendorFromStaging({
                vendor_name: vendorData.vendor_name,
                gstin: vendorData.gstin,
                address: vendorData.address,
                state: vendorData.state,
                branch: vendorData.branch,
            });
            setCreateVendorFor(null);
            showSuccess(`✅ Vendor "${vendorData.vendor_name}" created. Revalidating…`);

            // Revalidate by saving the same extracted_data again (triggers vendor lookup)
            await handleSaveEdit(inv.file_hash, inv.extracted_data);
        } catch (err: any) {
            showError(`Failed to create vendor: ${err?.message || 'Unknown error'}`);
        }
    };

    // ── Finalize (upload valid invoices) ─────────────────────────────────────
    const handleFinalize = async () => {
        const foundCount = invoices.filter(i => resolvedStatus(i) === 'found').length;
        if (foundCount === 0) {
            showError('⚠ No invoices with found vendors to upload.');
            return;
        }
        if (!window.confirm(`Upload ${foundCount} valid invoice(s) as purchase vouchers? Invoices with missing vendors will remain in staging.`)) return;

        setFinalizing(true);
        try {
            const summary = await apiService.finalizeStagedInvoices();
            const created = summary?.created || 0;
            const skipped = summary?.skipped || 0;
            const failed = summary?.failed || 0;

            if (created > 0) {
                showSuccess(summary.message || `✅ ${created} voucher(s) created.`);
            } else {
                showInfo(summary.message || 'No vouchers were created.');
            }

            // Refresh staging list — processed invoices will be gone
            await loadStaged(true);

            if (onFinalizeSuccess) onFinalizeSuccess(summary);
        } catch (err: any) {
            showError(`❌ Finalization failed: ${err?.message || 'Unknown error'}`);
        } finally {
            setFinalizing(false);
        }
    };

    // ── Derived counts ────────────────────────────────────────────────────────
    const foundCount = invoices.filter(i => resolvedStatus(i) === 'found').length;
    const missingCount = invoices.filter(i => resolvedStatus(i) === 'missing').length;
    const errorCount = invoices.filter(i => resolvedStatus(i) === 'error').length;

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div className={`flex flex-col h-full ${className}`} id="bulk-ocr-staging-workflow">

            {/* ── Toolbar ──────────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white border-b shadow-sm flex-shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                        <span className="text-xl">📋</span>
                        <div>
                            <h2 className="text-sm font-bold text-gray-900">OCR Staging Review</h2>
                            <p className="text-[11px] text-gray-500">Edit → Validate → Upload</p>
                        </div>
                    </div>

                    {/* Summary pills */}
                    {invoices.length > 0 && (
                        <div className="flex items-center gap-2 text-[11px] font-semibold">
                            <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full">
                                {invoices.length} total
                            </span>
                            {foundCount > 0 && (
                                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full">
                                    {foundCount} ready
                                </span>
                            )}
                            {missingCount > 0 && (
                                <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full">
                                    {missingCount} missing vendor
                                </span>
                            )}
                            {errorCount > 0 && (
                                <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-full">
                                    {errorCount} error
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Refresh */}
                    <button
                        onClick={() => loadStaged(true)}
                        disabled={loading}
                        title="Refresh staging list"
                        className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                        <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>

                    {/* Upload Files */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="staging-file-input"
                    />
                    {/* Upload Folder */}
                    <input
                        ref={folderInputRef}
                        type="file"
                        // @ts-ignore — webkitdirectory is valid in all modern browsers
                        webkitdirectory=""
                        multiple
                        onChange={handleFolderUpload}
                        className="hidden"
                        id="staging-folder-input"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                        {uploading ? (
                            <>
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Scanning…
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                                Scan & Stage
                            </>
                        )}
                    </button>

                    {/* Upload Folder button */}
                    <button
                        onClick={() => folderInputRef.current?.click()}
                        disabled={uploading}
                        title="Upload all PDFs from a folder"
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                        📁 Upload Folder
                    </button>

                    {/* Upload Vouchers */}
                    <button
                        onClick={handleFinalize}
                        disabled={finalizing || foundCount === 0}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                        {finalizing ? (
                            <>
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Uploading…
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Upload Vouchers{foundCount > 0 ? ` (${foundCount})` : ''}
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* ── Workflow hint bar ─────────────────────────────────────────── */}
            {missingCount > 0 && (
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-700 flex items-center gap-2 flex-shrink-0">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>
                        <strong>{missingCount} invoice(s)</strong> have missing vendors. Click <strong>Edit</strong> to correct vendor details, or click <strong>Create Vendor</strong> on each row. They will be revalidated automatically.
                    </span>
                </div>
            )}

            {/* ── Preview Table ─────────────────────────────────────────────── */}
            <div className="flex-1 overflow-auto">
                {loading && invoices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400">
                        <svg className="w-8 h-8 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <span className="text-sm">Loading staged invoices…</span>
                    </div>
                ) : invoices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400">
                        <svg className="w-12 h-12 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <div className="text-center">
                            <p className="text-sm font-medium text-gray-500">No staged invoices</p>
                            <p className="text-xs text-gray-400 mt-1">Click "Scan & Stage" to upload invoices and begin the review.</p>
                        </div>
                    </div>
                ) : (
                    <table className="min-w-full text-sm divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">#</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">File Name</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Invoice No.</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Vendor Name</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">GSTIN</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Amount</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {invoices.map((inv, idx) => {
                                const vstatus = resolvedStatus(inv);
                                const isRevalidating = revalidating.has(inv.file_hash);
                                return (
                                    <tr
                                        key={inv.file_hash}
                                        className={`transition-colors ${vstatus === 'found' ? 'hover:bg-emerald-50/30' : vstatus === 'error' ? 'bg-red-50/40 hover:bg-red-50' : 'bg-amber-50/20 hover:bg-amber-50/40'}`}
                                    >
                                        <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                                        <td className="px-4 py-3">
                                            <span className="font-mono text-xs text-gray-700 max-w-[180px] block truncate" title={inv.file_path}>
                                                📄 {inv.file_path}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700 font-medium text-xs">
                                            {inv.invoice_number || <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                                            {inv.invoice_date || <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-gray-800 text-xs font-medium max-w-[160px] truncate" title={inv.vendor_name}>
                                            {inv.vendor_name || <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-600">
                                            {inv.vendor_gstin || <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-right text-gray-800 font-semibold text-xs">
                                            {inv.total_amount ? `₹ ${inv.total_amount}` : <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {isRevalidating ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-indigo-600 font-medium">
                                                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                    </svg>
                                                    Validating…
                                                </span>
                                            ) : (
                                                <StatusBadge status={vstatus} />
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-center gap-1.5">
                                                {/* Edit button — always available */}
                                                <button
                                                    onClick={() => openEdit(inv)}
                                                    title="Edit invoice fields"
                                                    className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-500 rounded-md transition-colors"
                                                >
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                    Edit
                                                </button>

                                                {/* Create Vendor — only for missing */}
                                                {vstatus === 'missing' && (
                                                    <button
                                                        onClick={() => setCreateVendorFor(inv)}
                                                        title="Create vendor in master"
                                                        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-orange-600 hover:text-orange-800 border border-orange-200 hover:border-orange-500 rounded-md transition-colors"
                                                    >
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                        </svg>
                                                        Create Vendor
                                                    </button>
                                                )}

                                                {/* View details */}
                                                <button
                                                    onClick={() => setViewDetailsFor(viewDetailsFor?.file_hash === inv.file_hash ? null : inv)}
                                                    title="View extracted details"
                                                    className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-400 rounded-md transition-colors"
                                                >
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    Details
                                                </button>

                                                {/* Delete */}
                                                <button
                                                    onClick={() => handleDelete(inv)}
                                                    title="Remove from staging"
                                                    className="p-1.5 text-red-400 hover:text-red-600 border border-transparent hover:border-red-200 rounded-md transition-colors"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Inline Details Panel ──────────────────────────────────────── */}
            {viewDetailsFor && (
                <div className="flex-shrink-0 border-t bg-gray-50 max-h-64 overflow-y-auto p-4">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold text-gray-700">
                            📄 Extracted Data — {viewDetailsFor.file_path}
                        </h3>
                        <button onClick={() => setViewDetailsFor(null)} className="text-gray-400 hover:text-gray-600">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <pre className="text-[10px] text-gray-600 font-mono whitespace-pre-wrap">
                        {JSON.stringify(viewDetailsFor.extracted_data, null, 2)}
                    </pre>
                </div>
            )}

            {/* ── Edit Modal ────────────────────────────────────────────────── */}
            {editModal && (
                <EditModal
                    state={editModal}
                    onClose={() => setEditModal(null)}
                    onSave={handleSaveEdit}
                />
            )}

            {/* ── Create Vendor Modal ───────────────────────────────────────── */}
            {createVendorFor && (() => {
                const inv = createVendorFor;
                const invData = inv.extracted_data?.invoice || inv.extracted_data?.header || inv.extracted_data || {};
                const items = inv.extracted_data?.items || inv.extracted_data?.line_items || [];
                const supplierItems = items.map((item: any) => ({
                    supplierItemCode: item['Item Code'] || '',
                    supplierItemName: item['Item Name'] || item['Item'] || '',
                    hsnSac: item['HSN/SAC'] || '',
                }));
                return (
                    <CreateVendorModal
                        onClose={() => setCreateVendorFor(null)}
                        onSave={handleCreateVendor}
                        initialData={{
                            vendor_name: inv.vendor_name && inv.vendor_name !== '—' ? inv.vendor_name : (invData['Vendor Name'] || ''),
                            gstin: inv.vendor_gstin && inv.vendor_gstin !== '—' ? inv.vendor_gstin : (invData['GSTIN'] || ''),
                            address: invData['Bill From - Address Line 1'] || '',
                            state: invData['Bill From - State'] || '',
                            branch: invData['Branch'] || '',
                            supplier_items: supplierItems,
                        }}
                    />
                );
            })()}
        </div>
    );
};

export default BulkOCRStagingWorkflow;
