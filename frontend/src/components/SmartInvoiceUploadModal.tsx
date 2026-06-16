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
import { useOcrWorkflowStore } from '../store/ocrWorkflowStore';
import { getXLSX } from '../utils/xlsx';
import { showError, showSuccess, showInfo } from '../utils/toast';
import CreateNewVendorFullModal from './CreateNewVendorFullModal';
import { CreateNewInventoryItemModal } from './CreateNewInventoryItemModal';
import { MatchExistingItemModal } from './MatchExistingItemModal';
import Icon from './Icon';
import { getVoucherSchema, VOUCHER_SCHEMAS, getVoucherFlatHeaders, type VoucherSchema } from '../configs/schemaConfig';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

// VendorStatus: Frontend display states + backend canonical values (EXISTS/NEW)
type VendorStatus = 'FOUND' | 'MISSING' | 'RESOLVED' | 'ERROR' | 'EXISTS' | 'NEW' | 'MATCHED' | 'CREATE_VENDOR';
type ValidationStatus = 'READY' | 'VENDOR_MISSING' | 'VALIDATION_FAILED' | 'EXTRACTION_FAILED' | 'PENDING' | 'RESOLVED' | 'FOUND' | 'NOT_FOUND' | 'GSTIN_CONFLICT' | 'ERROR' | 'VOUCHER_CREATED' | 'NEEDS_ATTENTION' | 'LOW_CONFIDENCE' | 'processing' | 'DUPLICATE' | 'DUPLICATE_IN_BATCH' | 'SUCCESS' | 'FAILED' | 'NEED_VENDOR' | 'INCOMPLETE' | 'EXTRACTING' | 'SCANNING' | 'PROCESSING' | 'NEED_TO_SAVE' | 'PENDING_PURCHASE';

export interface ScanResult {
    id: string;
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
    branch?: string;
    has_source?: boolean;
    _isMerged?: boolean;
    _mergedCount?: number;
    _allHashes?: string[];
    error_message?: string;
    total_taxable_value?: string;
    total_cgst?: string;
    total_sgst?: string;
    total_igst?: string;
    group_id?: string;
    processed: boolean;
    _blocked?: boolean;
    resume_reason?: string;
    item_status?: string;
    missing_items?: any[];
    items?: any[];
    _isSnapshot?: boolean;
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
// UI Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Standardize snake_case keys used by backend vs PascalCase used in UI/Excel
const LINE_ITEM_FIELDS = ['Item Name', 'Item Code', 'HSN/SAC', 'Quantity', 'Unit', 'Rate', 'Amount', 'Taxable Value', 'discount_amount', 'cgst_rate', 'cgst_amount', 'sgst_rate', 'sgst_amount', 'igst_rate', 'igst_amount', 'total_amount'];

/**
 * Helper to get value from data object using various key aliases (snake_case, Display Name, etc.)
 */
const getCellValue = (data: any, col: string): string => {
    if (!data) return '—';
    // 1. Direct match (e.g. "Supplier Invoice No.")
    if (data[col] !== undefined && data[col] !== null && data[col] !== '') return String(data[col]);

    // 2. Normalize to snake_case for backend matching
    const snakeCol = col.toLowerCase().replace(/[\s\/\-\.]+/g, '_').replace(/^_|_$/g, '');
    if (data[snakeCol] !== undefined && data[snakeCol] !== null && data[snakeCol] !== '') return String(data[snakeCol]);

    // 3. Robust aliasing
    const ALIASES: Record<string, string[]> = {
        'invoice_date': ['Date', 'Voucher Date', 'Inv Date', 'Bill Date', 'Reference Date', 'invoice_date'],
        'invoice_no': ['Supplier Invoice No.', 'Supplier Invoice No', 'Voucher Number', 'Reference No', 'Inv No', 'Bill No', 'invoice_no', 'invoice_number'],
        'reference_no': ['Reference No.', 'Reference', 'Ref No', 'Supplier Invoice No.'],
        'vendor_name': ['Vendor Name', 'Supplier Name', 'Party Name', 'Party', 'Customer Name', 'Buyer/Supplier - Mailing Name', 'Bill From', 'vendor_name'],
        'vendor_address': ['Vendor Address', 'Address', 'Supplier Address', 'Bill From', 'Buyer/Supplier - Address', 'Buyer/Supplier - Bill to/from', 'Bill From Address', 'Ship From Address', 'Consignee Address', 'vendor_address'],
        'bill_from': ['Bill From Address', 'Bill From', 'bill_address_from', 'Office Address', 'Dispatch from Name', 'bill_from'],
        'ship_from': ['Ship From Address', 'Ship From', 'Dispatch From Address'],
        'vendor_gstin': ['GSTIN', 'Supplier GSTIN', 'Party GSTIN', 'Buyer/Supplier - GSTIN/UIN', 'gstin', 'vendor_gstin'],
        'voucher_type': ['Voucher Type Name', 'Transaction Type', 'Voucher Type'],
        'voucher_series': ['Voucher Number Series Name', 'Voucher Series'],
        'narration': ['Voucher Narration', 'Narration', 'Remarks', 'Notes'],
        'pos': ['Place of Supply', 'Bill From - State', 'State', 'POS', 'State Type', 'place_of_supply'],
        'total_cgst': ['Total CGST', 'CGST', 'Central Tax', 'CGST Amount', 'cgst'],
        'total_sgst': ['Total SGST', 'SGST', 'SGST/UTGST', 'State Tax', 'SGST Amount', 'Total SGST/UTGST', 'sgst'],
        'total_igst': ['Total IGST', 'IGST', 'Integrated Tax', 'IGST Amount', 'igst'],
        'taxable_value': ['Taxable Value', 'Assessable Value', 'Taxable Amount', 'taxable_value'],
        'total_amount': ['Total Invoice Value', 'invoice_total', 'Grand Total', 'Amount', 'Invoice Value', 'Item Amount', 'Ledger Amount', 'total_amount', 'invoice_total'],
        'ledger_name': ['Ledger Name', 'Account Name', 'Particulars'],
    };

    for (const [key, altList] of Object.entries(ALIASES)) {
        // If the column we are looking for is either the canonical key or in the alias list
        if (key === snakeCol || altList.includes(col) || altList.some(a => a.toLowerCase().replace(/[\s\/\-\.]+/g, '_').replace(/^_|_$/g, '') === snakeCol)) {
            if (data[key] !== undefined && data[key] !== null && data[key] !== '') return String(data[key]);
            for (const alt of altList) {
                if (data[alt] !== undefined && data[alt] !== null && data[alt] !== '') return String(data[alt]);
                // Also try snake_case version of the alias
                const altSnake = alt.toLowerCase().replace(/[\s\/\-\.]+/g, '_').replace(/^_|_$/g, '');
                if (data[altSnake] !== undefined && data[altSnake] !== null && data[altSnake] !== '') return String(data[altSnake]);
            }
        }
    }

    return '—';
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
                                        <td className="px-2 py-2 font-medium text-gray-700 leading-tight">{it['description'] || it['Item Name'] || it['Description'] || 'Unknown Item'}</td>
                                        <td className="px-2 py-2 text-right text-gray-600">{it['qty'] || it['quantity'] || it['Qty'] || it['Quantity']}</td>
                                        <td className="px-2 py-2 text-right text-gray-600">{it['rate'] || it['Item Rate'] || it['Rate']}</td>
                                        <td className="px-2 py-2 text-right font-bold text-gray-800">{it['total_amount'] || it['amount'] || it['Invoice Value'] || it['Amount'] || it['Item Amount']}</td>
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
                        <span className="font-medium text-gray-700">{row['total_taxable_value'] || '0.00'}</span>
                    </div>
                    {row['total_igst'] && row['total_igst'] !== '0.00' && (
                        <div className="flex justify-between text-xs">
                            <span className="text-gray-500">IGST</span>
                            <span className="font-medium text-gray-700">{row['total_igst']}</span>
                        </div>
                    )}
                    {row['total_cgst'] && row['total_cgst'] !== '0.00' && (
                        <div className="flex justify-between text-xs">
                            <span className="text-gray-500">CGST</span>
                            <span className="font-medium text-gray-700">{row['total_cgst']}</span>
                        </div>
                    )}
                    {row['total_sgst'] && row['total_sgst'] !== '0.00' && (
                        <div className="flex justify-between text-xs">
                            <span className="text-gray-500">SGST</span>
                            <span className="font-medium text-gray-700">{row['total_sgst']}</span>
                        </div>
                    )}
                    <div className="border-t border-gray-200 pt-2 flex justify-between">
                        <span className="text-sm font-bold text-gray-900">Grand Total</span>
                        <span className="text-sm font-black text-indigo-700">₹{row.total_amount || '0.00'}</span>
                    </div>
                </div>

                {/* Fallback Data */}
                {data._raw_text && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                        <label className="text-[10px] font-black text-amber-600 uppercase tracking-wider block mb-2 flex items-center gap-1">
                            <Icon name="info" className="w-3 h-3" />
                            Fallback Data (Raw AI Output)
                        </label>
                        <div className="bg-amber-50/30 rounded-lg p-3 text-[10px] text-gray-600 font-mono overflow-x-auto border border-amber-100/50 max-h-40 overflow-y-auto">
                            <pre className="whitespace-pre-wrap">{data._raw_text}</pre>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-4 border-t bg-white">
                <button onClick={onClose} className="w-full py-2 bg-gray-800 text-white rounded-lg text-sm font-bold hover:bg-gray-900 shadow-md">Close Preview</button>
            </div>
        </div>
    );
};

// ── Key Normalization & Deduplication (Architecture Aligned) ─────────────
const normalizeVoucherField = (k: string, voucherType: string) => {
    if (!k) return "";
    let nk = k.toLowerCase()
        .replace(/[\s\/\-\.]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');

    // ── Synonyms/Aliases — Context Sensitive ──
    if (voucherType === 'Sales') {
        if (nk === 'invoice_no' || nk === 'invoice_number' || nk === 'sales_invoice_no') {
            return 'sales_invoice_no';
        }
        if (nk === 'customer' || nk === 'customer_name' || nk === 'party_name') {
            return 'customer_name';
        }
        if (nk === 'order_no' || nk === 'sales_order_no') {
            return 'sales_order_no';
        }
    } else {
        // Default to Purchase terminology for Purchase, Expenses, etc.
        if (nk === 'supplied_invoice_no' || nk === 'supplier_inv_no' || nk === 'invoice_no' || nk === 'invoice_number' || nk === 'supplier_invoice_no') {
            return 'invoice_no';
        }
        if (nk === 'vendor' || nk === 'supplier_name' || nk === 'party_name' || nk === 'vendor_name') {
            return 'vendor_name';
        }
        if (nk === 'order_no' || nk === 'purchase_order_no') {
            return 'purchase_order_no';
        }
        if (nk === 'bill_from' || nk === 'bill_address_from' || nk === 'bill_from_address') {
            return 'bill_address_from';
        }
        if (nk === 'bill_to' || nk === 'bill_address_to' || nk === 'bill_to_address') {
            return 'bill_address_to';
        }
    }

    if (nk === 'date' || nk === 'inv_date' || nk === 'voucher_date') {
        return 'invoice_date';
    }
    if (nk === 'invoice_value' || nk === 'grand_total' || nk === 'total_amount' || nk === 'invoice_total') {
        return 'invoice_total';
    }
    if (nk === 'taxable_value' || nk === 'assessable_value') {
        return 'total_taxable_value';
    }
    return nk;
};

// ─────────────────────────────────────────────────────────────────────────────
// Edit Modal ──────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export const EditInvoiceModal: React.FC<{
    row: ScanResult;
    voucherType: string;
    onClose: () => void;
    onSave: (updatedData: any, revalidation?: { status: string; vendor_id: number | null; vendor_name: string; vendor_status?: string }) => void;
    onResolve?: (resolution: 'use_existing' | 'update_name') => void;
}> = ({ row, voucherType, onClose, onSave, onResolve }) => {

    const [dynamicSchema, setDynamicSchema] = useState<VoucherSchema | null>(null);
    const [data, setData] = useState<any>(null); // HARD RESET FRONTEND STATE
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<string>('');

    useEffect(() => {
        const fetchFreshData = async () => {
            setLoading(true);
            try {
                // STEP 1: Fetch FULL Dynamic Schema + Data from DB (or use snapshot row directly)
                const isSnapshot = String(row.id).startsWith('snap_') || !!row._isSnapshot;

                const schemaPromise = httpClient.get(`/api/voucher-schema/?type=${voucherType}`);
                const rowPromise = isSnapshot ? Promise.resolve({ data: [row] }) : httpClient.get(`/api/ocr-staging/${row.id}/`);

                const [schemaRes, rowRes]: any = await Promise.all([schemaPromise, rowPromise]);

                const fetchedSchema = schemaRes as VoucherSchema;
                const dbRow = (rowRes?.data && rowRes.data[0]) || null;

                if (!dbRow) throw new Error("Record not found in DB.");

                console.log("SCHEMA:", fetchedSchema);
                console.log(`FORM SOURCE (${isSnapshot ? 'SNAPSHOT' : 'DB'}):`, dbRow.extracted_data);

                setDynamicSchema(fetchedSchema);

                const raw = JSON.parse(JSON.stringify(dbRow.extracted_data || {}));

                const normalizedSections: any = {};
                Object.entries(fetchedSchema.sections || {}).forEach(([sectionName, fields]: any) => {
                    if (!Array.isArray(fields)) return;

                    if (sectionName === 'items') {
                        let itmsRaw = raw.sections?.items || raw.items || raw.line_items || [];
                        if (!Array.isArray(itmsRaw)) itmsRaw = [];

                        normalizedSections['items'] = (itmsRaw.length > 0 ? itmsRaw : [{}]).map((item: any) => {
                            const normalizedItem: any = {};
                            fields.forEach((f: any) => {
                                const val = item[f.name] || item[f.label] || getCellValue(item, f.label);
                                normalizedItem[f.name] = (val === '—') ? "" : val;
                            });
                            return normalizedItem;
                        });
                    } else {
                        // Find raw data for this section
                        const secRaw = raw.sections?.[sectionName] || raw[sectionName] || raw.invoice || raw.header || raw || {};
                        const normalizedSection: any = {};
                        fields.forEach((f: any) => {
                            const val = secRaw[f.name] || secRaw[f.label] || getCellValue(secRaw, f.label);
                            normalizedSection[f.name] = (val === '—') ? "" : val;
                        });
                        normalizedSections[sectionName] = normalizedSection;
                    }
                });

                setData({
                    ...raw,
                    sections: normalizedSections
                });
            } catch (err) {
                console.error("Edit modal load error:", err);
                showError("Failed to load schema-driven voucher data.");
                onClose();
            } finally {
                setLoading(false);
            }
        };
        fetchFreshData();
    }, [row.id, voucherType]);

    if (loading || !data || !dynamicSchema) {
        return (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-white p-8 rounded-2xl flex flex-col items-center gap-4 shadow-2xl">
                    <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent animate-spin rounded-full" />
                    <p className="font-bold text-gray-700">Fetching Schema Source of Truth...</p>
                </div>
            </div>
        );
    }

    const sections = data.sections || {};
    const items = sections.items || [];

    const handleFieldChange = (sectionName: string, key: string, val: string) => {
        setData(prev => ({
            ...prev,
            sections: {
                ...prev.sections,
                [sectionName]: {
                    ...prev.sections[sectionName],
                    [key]: val
                }
            }
        }));
    };

    const handleItemChange = (idx: number, key: string, val: string) => {
        setData((prev: any) => {
            if (!prev || !prev.sections) return prev;
            const newItems = [...(prev.sections.items || [])];
            newItems[idx] = { ...newItems[idx], [key]: val };
            return {
                ...prev,
                sections: {
                    ...prev.sections,
                    items: newItems
                }
            };
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // STEP 2: Enforce Schema-Driven Flow (Save full sections)
            const result: any = await httpClient.patch(
                `/api/ocr-staging/${row.file_hash}/`,
                {
                    extracted_data: data,
                    voucher_type: voucherType.toUpperCase()
                }
            );

            onSave(result.extracted_data || data, {
                status: result.status || 'missing',
                vendor_id: result.vendor_id ?? null,
                vendor_name: result.vendor_name || '',
                vendor_status: result.vendor_status || null,
            });
            const isMatched = result.vendor_status === 'EXISTS';
            showSuccess(isMatched ? '✅ MATCHED: Vendor synchronized with DB.' : '⚠️ ACTION REQUIRED: Update sync failed.');
            onClose();
        } catch (err) {
            showError('Failed to save schema-aligned record.');
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
                    finalName = sections.supplier_details?.vendor_name || row.vendor_name;
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
                {/* Vendor Status Headers */}
                {['EXISTS', 'FOUND', 'MATCHED'].includes(row.vendor_status || '') ? (
                    <div className="px-6 py-4 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-xl">✅</div>
                            <div>
                                <h4 className="font-bold text-emerald-900 text-sm uppercase tracking-wider">Matched</h4>
                                <p className="text-[10px] text-emerald-700 italic">This vendor exists in your master list: {row.vendor_name || sections.supplier_details?.vendor_name}</p>
                            </div>
                        </div>
                    </div>
                ) : row.vendor_status === 'NEW' || row.vendor_status === 'MISSING' ? (
                    <div className="px-6 py-4 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-xl">⚠️</div>
                            <div>
                                <h4 className="font-bold text-amber-900 text-sm uppercase tracking-wider">Create Vendor</h4>
                                <p className="text-[10px] text-amber-700 italic">This vendor was not found. Please create it to continue.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                onSave(data, {
                                    status: 'VENDOR_MISSING',
                                    vendor_id: null,
                                    vendor_name: sections.supplier_details?.vendor_name || row.vendor_name
                                });
                                onClose();
                                setTimeout(() => window.dispatchEvent(new CustomEvent('re-open-create-vendor', { detail: row.file_hash })), 100);
                            }}
                            className="px-6 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors shadow-md"
                        >
                            Create New Vendor
                        </button>
                    </div>
                ) : (
                    <div className="px-6 py-4 bg-blue-50 border-b border-blue-100 flex items-center gap-3">
                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent animate-spin rounded-full" />
                        <span className="text-sm font-bold text-blue-700 uppercase">Processing...</span>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto bg-gray-50/50">
                    {/* Tabs Navigation */}
                    <div className="flex border-b border-gray-200 bg-white overflow-x-auto">
                        {Object.keys(dynamicSchema.sections || {})
                            .filter(name => name !== 'items')
                            .map((sectionName) => {
                                const sectionTitles: Record<string, string> = {
                                    supplier_details: "Supplier Details",
                                    supply_details: "Supply Details",
                                    due_details: "Due Details",
                                    transit_details: "Transit Details"
                                };
                                const title = sectionTitles[sectionName] || sectionName.replace(/_/g, ' ').toUpperCase();
                                const isActive = activeTab === sectionName || (!activeTab && sectionName === Object.keys(dynamicSchema.sections || {}).filter(n => n !== 'items')[0]);
                                
                                return (
                                    <button
                                        key={sectionName}
                                        onClick={() => setActiveTab(sectionName)}
                                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${isActive
                                            ? 'border-indigo-600 text-indigo-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }`}
                                    >
                                        {title}
                                    </button>
                                );
                            })}
                    </div>

                    <div className="p-6 space-y-6">
                        {/* Active Tab Content */}
                        <div className="p-6 bg-white rounded-[4px] border border-gray-200 min-h-[200px]">
                            {Object.entries(dynamicSchema.sections || {})
                                .filter(([name]) => name !== 'items')
                                .map(([sectionName, fields]: any) => {
                                    const isActive = activeTab === sectionName || (!activeTab && sectionName === Object.keys(dynamicSchema.sections || {}).filter(n => n !== 'items')[0]);
                                    if (!isActive) return null;

                                    const sectionData = sections[sectionName] || {};

                                    return (
                                        <div key={sectionName} className="space-y-6 animate-in fade-in duration-200">
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                                {fields.map((field: any) => {
                                                    const nk = field.name;
                                                    const kLabel = field.label;
                                                    const isMandatory = field.mandatory;

                                                    let v = sectionData[nk];
                                                    let displayVal = "";
                                                    if (v !== null && v !== undefined) {
                                                        displayVal = typeof v === 'object' ? JSON.stringify(v) : String(v);
                                                    }

                                                    if (field.type === 'date' && displayVal) {
                                                        const parts = displayVal.split(/[-\/]/);
                                                        if (parts.length === 3) {
                                                            // if DD-MM-YYYY
                                                            if (parts[0].length === 2 && parts[2].length === 4) {
                                                                displayVal = `${parts[2]}-${parts[1]}-${parts[0]}`;
                                                            }
                                                        }
                                                    }

                                                    return (
                                                        <div key={nk} className="space-y-1">
                                                            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                                                                {kLabel}
                                                                {isMandatory && <span className="text-red-500">*</span>}
                                                            </label>
                                                            <input
                                                                type={field.type === 'number' ? 'text' : field.type}
                                                                value={displayVal}
                                                                onChange={e => handleFieldChange(sectionName, nk, e.target.value)}
                                                                placeholder={`Enter ${kLabel.toLowerCase()}...`}
                                                                className={`w-full border rounded-[4px] px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500 outline-none transition-all ${isMandatory && !displayVal ? 'border-amber-300 bg-amber-50/20' : 'border-gray-300'}`}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>

                    {/* Dynamic Line Items Section */}
                    {dynamicSchema.sections?.items && (
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-4 border-b border-indigo-50 pb-2">Line Items ({items.length})</h4>
                            <div className="overflow-x-auto border border-gray-100 rounded-xl shadow-sm">
                                <table className="w-full text-[11px]">
                                    <thead className="bg-gray-50 border-b border-gray-100">
                                        <tr>
                                            {dynamicSchema.sections.items.map((field: any) => (
                                                <th key={field.name} className="px-3 py-3 text-left font-bold text-gray-500 whitespace-nowrap uppercase tracking-tighter">
                                                    {field.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {items.map((it: any, i: number) => (
                                            <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                                                {dynamicSchema.sections.items.map((field: any) => {
                                                    const k = field.name;
                                                    const v = it[k];
                                                    return (
                                                        <td key={k} className="p-1 min-w-[100px]">
                                                            <input
                                                                type="text"
                                                                value={String(v || '')}
                                                                onChange={e => handleItemChange(i, k, e.target.value)}
                                                                className="w-full border-none p-1.5 focus:ring-2 focus:ring-indigo-200 outline-none bg-transparent rounded text-gray-700"
                                                            />
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
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
    activeSessionId?: string;
    initialStep?: string;
    onEditRow?: (row: any) => void;
}

type ModalStep = 'upload' | 'scanning' | 'review' | 'finalizing' | 'done';

const BulkInvoiceUploadModal: React.FC<BulkInvoiceUploadModalProps> = ({
    onClose,
    onFinalized,
    voucherType = 'Purchase',
    isLimitReached = false,
    onEditRow,
    activeSessionId,
    initialStep
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    const {
        step, setStep,
        uploadSessionId: storeSessionId, setUploadSessionId: setStoreSessionId,
        filterStatus, setFilterStatus
    } = useOcrWorkflowStore();

    const initRef = useRef(false);

    // Use activeSessionId/initialStep if provided, else use store, ONLY ON MOUNT
    useEffect(() => {
        if (!initRef.current) {
            if (activeSessionId) {
                setStoreSessionId(activeSessionId);
            }
            if (initialStep) {
                setStep(initialStep as ModalStep);
            }
            initRef.current = true;
        }
    }, [activeSessionId, initialStep, setStoreSessionId, setStep]);

    const uploadSessionId = storeSessionId || (activeSessionId as string) || '';
    const setUploadSessionId = setStoreSessionId;

    useEffect(() => {
        if (!storeSessionId && !activeSessionId) {
            const newId = (typeof window.crypto !== 'undefined' && typeof window.crypto.randomUUID === 'function')
                ? window.crypto.randomUUID()
                : Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
            setStoreSessionId(newId);
        }
    }, [storeSessionId, activeSessionId, setStoreSessionId]);

    const [workflowState, setWorkflowState] = useState<"LIVE_UPLOAD" | "REVIEW" | "FINALIZING" | "FINALIZED">("LIVE_UPLOAD");
    const [isLoading, setIsLoading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const isMounted = useRef(true);
    // Use a ref for the polling interval so it can be cleared from anywhere
    const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const pollingIntervalRef2 = useRef<NodeJS.Timeout | null>(null); // setInterval handle
    const retryCountRef = useRef(0); // Mirror retryCount in a ref for non-stale access in interval
    const stalledAt100Ref = useRef<number | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
            // Clear both timeout and interval on unmount
            if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
            if (pollingIntervalRef2.current) clearInterval(pollingIntervalRef2.current);
            if (eventSourceRef.current) eventSourceRef.current.close();
            if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        };
    }, []);

    const [dragOver, setDragOver] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [scanId, setScanId] = useState<string>('');
    const useAllUnresolvedRef = useRef(false); // Moved up to use for routing state

    // ── ISOLATED STORES FOR UPLOAD VS RESUME FLOWS ──
    const [uploadRows, setUploadRows] = useState<ScanResult[]>([]);
    const [resumeRows, setResumeRows] = useState<ScanResult[]>([]);
    const [uploadSelectedHashes, setUploadSelectedHashes] = useState<Set<string>>(new Set());
    const [resumeSelectedHashes, setResumeSelectedHashes] = useState<Set<string>>(new Set());

    // Computed properties mapped to the active flow
    const scanResults = useAllUnresolvedRef.current ? resumeRows : uploadRows;
    const selectedHashes = useAllUnresolvedRef.current ? resumeSelectedHashes : uploadSelectedHashes;

    const setScanResults = useCallback((val: React.SetStateAction<ScanResult[]>) => {
        if (useAllUnresolvedRef.current) {
            setResumeRows(val);
        } else {
            setUploadRows(val);
        }
    }, []);

    const setSelectedHashes = useCallback((val: React.SetStateAction<Set<string>>) => {
        if (useAllUnresolvedRef.current) {
            setResumeSelectedHashes(val);
        } else {
            setUploadSelectedHashes(val);
        }
    }, []);
    const [scanProgress, setScanProgress] = useState(0);       // 0-100
    const [scanCurrentFile, setScanCurrentFile] = useState('');
    const [finalizeResult, setFinalizeResult] = useState<FinalizeResult | null>(null);
    const [groupPages, setGroupPages] = useState(true);
    const [rescanningRowId, setRescanningRowId] = useState<string | null>(null);
    const [rescanningAll, setRescanningAll] = useState(false);
    const [showOnlyPending, setShowOnlyPending] = useState(true);
    const [finalizing, setFinalizing] = useState(false);
    const [resizing, setResizing] = useState<number | null>(null);
    const [resolvingRow, setResolvingRow] = useState<ScanResult | null>(null);
    const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
    const [extractedVendorData, setExtractedVendorData] = useState<any>(null);
    const [isCreateVendorModalOpen, setIsCreateVendorModalOpen] = useState(false);

    const openCreateVendorModal = (row: ScanResult) => {
        console.info('[FORENSIC][INVOICE_SCANNER_VENDOR_LIFECYCLE] CREATE_VENDOR_BUTTON_CLICK');
        setResolvingRow(row);
        setSelectedInvoice(row);
        console.info('[FORENSIC][INVOICE_SCANNER_VENDOR_LIFECYCLE] setSelectedInvoice executed', row);

        const sections = row.extracted_data?.sections || {};
        const supplier = sections.supplier_details || row.extracted_data || {};
        const rawItems = sections.items || row.extracted_data?.items || row.extracted_data?.line_items || [];
        const supplier_items = rawItems.map((it: any) => ({
            supplierItemCode: String(it['item_code'] || it['itemCode'] || it['supplierItemCode'] || it['product_code'] || it['productCode'] || it['code'] || ''),
            supplierItemName: String(it['item_name'] || it['itemName'] || it['supplierItemName'] || it['product_name'] || it['productName'] || it['description'] || it['name'] || ''),
            hsnSac: String(it['HSN/SAC'] || it['hsn_sac'] || it['HSN Code'] || it['hsnSac'] || '')
        }));

        const prefData = {
            vendor_name: row.vendor_name || supplier['vendor_name'] || supplier['Vendor Name'] || '',
            gstin: row.vendor_gstin || supplier['gstin'] || supplier['GSTIN'] || '',
            address: supplier['vendor_address'] || supplier['Address'] || supplier['address'] || '',
            state: supplier['vendor_city'] || supplier['State'] || supplier['state'] || '',
            branch: supplier['branch'] || row.branch || '',
            vendor_category: supplier['vendor_category'] || supplier['Vendor Category'] || '',
            supplier_items: supplier_items
        };

        console.info('[FORENSIC][INVOICE_SCANNER_VENDOR_LIFECYCLE] PREFILLED_VENDOR_DATA', prefData);
        setExtractedVendorData(prefData);
        setIsCreateVendorModalOpen(true);
        console.info('[FORENSIC][INVOICE_SCANNER_VENDOR_LIFECYCLE] CREATE_VENDOR_MODAL_OPEN', true);
    };

    const [isCreateItemModalOpen, setIsCreateItemModalOpen] = useState(false);
    const [isMatchItemModalOpen, setIsMatchItemModalOpen] = useState(false);
    const [extractedItemData, setExtractedItemData] = useState<any>(null);
    const [itemResolvingRow, setItemResolvingRow] = useState<ScanResult | null>(null);
    const [matchingLineIndex, setMatchingLineIndex] = useState<number>(0);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    const toggleExpandRow = (rowId: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(rowId)) {
                next.delete(rowId);
            } else {
                next.add(rowId);
            }
            return next;
        });
    };

    const openMatchItemModal = (row: ScanResult, item: any, lineIdx: number = 0) => {
        console.info('[FORENSIC][INVOICE_SCANNER_ITEM_LIFECYCLE] MATCH_ITEM_BUTTON_CLICK', item);
        setItemResolvingRow(row);
        setMatchingLineIndex(lineIdx);
        
        const prefData = {
            item_code: item.item_code || '',
            item_name: item.item_name || '',
            hsn_code: item.hsn_code || '',
            description: item.description || '',
            gst_rate: item.gst_rate ?? '0.00',
            rate: item.rate ?? '0.00',
            uom: item.uom || 'nos',
            cgst_rate: item.cgst_rate ?? 0.0,
            sgst_rate: item.sgst_rate ?? 0.0,
            igst_rate: item.igst_rate ?? 0.0,
            cess_rate: item.cess_rate ?? 0.0,
            computed_gst_rate: item.computed_gst_rate ?? 0.0,
            taxable_value: item.taxable_value ?? 0.0,
        };
        
        setExtractedItemData(prefData);
        setIsMatchItemModalOpen(true);
    };

    const openCreateItemModal = (row: ScanResult, item: any) => {
        console.info('[FORENSIC][INVOICE_SCANNER_ITEM_LIFECYCLE] CREATE_ITEM_BUTTON_CLICK', item);
        setItemResolvingRow(row);

        const prefData = {
            item_code: item.item_code || '',
            item_name: item.item_name || '',
            hsn_code: item.hsn_code || '',
            description: item.description || '',
            gst_rate: item.gst_rate ?? '0.00',
            rate: item.rate ?? '0.00',
            uom: item.uom || 'nos',
            cgst_rate: item.cgst_rate ?? 0.0,
            sgst_rate: item.sgst_rate ?? 0.0,
            igst_rate: item.igst_rate ?? 0.0,
            cess_rate: item.cess_rate ?? 0.0,
            computed_gst_rate: item.computed_gst_rate ?? 0.0,
            taxable_value: item.taxable_value ?? 0.0,
        };

        console.info('[FORENSIC][INVOICE_SCANNER_ITEM_LIFECYCLE] PREFILLED_ITEM_DATA', prefData);
        setExtractedItemData(prefData);
        setIsCreateItemModalOpen(true);
    };

    const handleRevalidateRow = async (row: ScanResult) => {
        console.info('[FORENSIC][INVOICE_SCANNER_ITEM_LIFECYCLE] REVALIDATING_ROW_AFTER_ITEM_CREATION', row.file_hash);
        setScanResults(prev => prev.map(r => r.file_hash === row.file_hash ? { ...r, validationStatus: 'PENDING' } : r));
        try {
            const result: any = await httpClient.patch(`/api/ocr-staging/${row.file_hash}/`, {
                extracted_data: row.extracted_data
            });
            setScanResults(prev => prev.map(r => {
                if (r.file_hash !== row.file_hash) return r;
                let newStatus: ValidationStatus = 'VENDOR_MISSING';
                const s = result.status || '';
                if (s === 'READY' || s === 'found' || s === 'FOUND') newStatus = 'READY';
                else if (s === 'DUPLICATE' || s === 'duplicate') newStatus = 'DUPLICATE';
                else if (s === 'VENDOR_MISSING' || s === 'NOT_FOUND' || s === 'not_found' || s === 'CREATE_VENDOR') newStatus = 'VENDOR_MISSING';
                else if (s === 'GSTIN_CONFLICT' || s === 'gstin_conflict') newStatus = 'GSTIN_CONFLICT';

                return {
                    ...r,
                    validationStatus: newStatus,
                    vendor_id: result.vendor_id ?? r.vendor_id,
                    vendor_name: result.vendor_name || r.vendor_name,
                    vendor_status: ((result.vendor_id ?? r.vendor_id) ? 'EXISTS' : (result.vendor_status || 'NEW')) as VendorStatus,
                    item_status: result.item_status || r.item_status,
                    missing_items: result.missing_items || [],
                    items: result.items || r.items,
                };
            }));
            fetchResumeCounts();
            showSuccess('Inventory item created and row re-validated successfully!');
        } catch (err) {
            console.error('[FORENSIC][INVOICE_SCANNER_ITEM_LIFECYCLE] Revalidation failed:', err);
            fetchStagedInvoices();
        }
    };

    const [detailsRow, setDetailsRow] = useState<ScanResult | null>(null);
    const [estimatedExtractionTime, setEstimatedExtractionTime] = useState<number | null>(null);
    const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
    const [editingRow, setEditingRow] = useState<ScanResult | null>(null);

    // ─────────────────────────────────────────────────────────────────────────────
    // ULTIMATE MERGE LOGIC: Grouping by normalized Invoice No + GSTIN
    // ─────────────────────────────────────────────────────────────────────────────
    const mergedResults = React.useMemo(() => {
        if (!scanResults || !scanResults.length) return [];

        const groups: Record<string, ScanResult[]> = {};
        const normalize = (s: any) => String(s || '').replace(/[^A-Z0-9]/g, '').trim().toUpperCase();

        // Month-Aware Date Fingerprint (handles 'Sep', 'Sept', '09', etc.)
        const dateFingerprint = (d: any) => {
            let s = String(d || '').toLowerCase().trim();
            if (!s || s === '—') return "";
            const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
            months.forEach((m, i) => {
                // Handle both 'sept' and 'sep' for September
                const monthNum = String(i + 1).padStart(2, '0');
                if (m === 'sep') {
                    s = s.replace(/september|sept|sep/, monthNum);
                } else {
                    s = s.replace(new RegExp(m + '[a-z]*'), monthNum);
                }
            });
            const digits = s.replace(/[^0-9]/g, '');
            // Sort digits to make it order/separator independent (2024-09-07 == 07-09-2024)
            return digits.split('').sort().join('');
        };

        scanResults.forEach(r => {
            const group_id = r.group_id;
            const invNo = normalize(r.invoice_number || getCellValue(r, 'invoice_no') || getCellValue(r, 'invoice_number'));
            const gstin = normalize(r.vendor_gstin || getCellValue(r, 'vendor_gstin'));
            const date = dateFingerprint(r.invoice_date || getCellValue(r, 'invoice_date'));

            let key = "";
            // Primary Key: High-Confidence Match (GSTIN + InvNo + Standardized Date)
            if (gstin && invNo && date) {
                key = `U3_${gstin}_${invNo}_${date}`;
            }
            else if (invNo && gstin) {
                key = `U2_${gstin}_${invNo}`;
            }
            else if (group_id) {
                key = `GID_${group_id}`;
            }
            else if (invNo && (gstin || normalize(r.vendor_name))) {
                key = `M2V_${invNo}_${gstin || normalize(r.vendor_name)}`;
            }
            else {
                key = `UNGROUPED_${r.file_hash || r.id}`;
            }

            console.log(`[FRONTEND GROUP] record=${r.id} hash=${r.file_hash?.substring(0, 8)}... key=${key} invNo='${invNo}' gstin=${gstin} dateFingerprint='${date}'`);

            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
        });

        const final = Object.values(groups).map(group => {
            if (group.length === 1) return { ...group[0], _isMerged: false, _mergedCount: 1, _allHashes: [group[0].file_hash] };

            // SORT: Put rows with more data/vendor_id at the top
            const sorted = [...group].sort((a, b) => {
                if (a.vendor_id && !b.vendor_id) return -1;
                if (!a.vendor_id && b.vendor_id) return 1;
                const aAmt = parseFloat(String(getCellValue(a, 'total_amount') || a.total_amount).replace(/[₹,]/g, '') || '0');
                const bAmt = parseFloat(String(getCellValue(b, 'total_amount') || b.total_amount).replace(/[₹,]/g, '') || '0');
                return bAmt - aAmt;
            });

            const primary = { ...sorted[0] };
            const finalMergedCount = group.length;

            // Exhaustive Collection of items from across ALL pages
            const allItems = group.reduce((acc, r) => {
                const data = r.extracted_data || {};
                const pageItems = data.items || data.line_items || data.sections?.items || [];
                return [...acc, ...(Array.isArray(pageItems) ? pageItems : [])];
            }, [] as any[]);

            // Pick the best header values from across the group
            const bestInvNo = group.find(r => r.invoice_number)?.invoice_number || primary.invoice_number;
            const bestDate = group.find(r => r.invoice_date)?.invoice_date || primary.invoice_date;

            return {
                ...primary,
                invoice_number: bestInvNo,
                invoice_date: bestDate,
                _isMerged: true,
                _mergedCount: finalMergedCount,
                _allHashes: group.map(x => x.file_hash),
                extracted_data: {
                    ...(primary.extracted_data || {}),
                    items: allItems,
                    line_items: allItems,
                    sections: {
                        ...(primary.extracted_data?.sections || {}),
                        items: allItems
                    }
                }
            };
        });

        console.log("MERGED RESULTS COUNT:", final.length, "FROM RAW:", scanResults.length);
        return final;
    }, [scanResults, pollingIntervalRef2.current]); // Added a few more deps to ensure refresh

    const currentDataset = groupPages ? mergedResults : scanResults;

    const [activeFilter, setActiveFilter] = useState<'all' | 'vendor_required' | 'item_required' | 'voucher_need_save'>('all');

    const isVendorRequired = useCallback((r: ScanResult) => {
        if (r.validationStatus === 'VOUCHER_CREATED') return false;
        const IN_PROGRESS_STATUSES = new Set(['processing', 'PENDING', 'PROCESSING', 'scanning', 'EXTRACTING']);
        if (IN_PROGRESS_STATUSES.has(r.validationStatus)) return false;
        const hasEffectiveMatch = ['EXISTS', 'FOUND', 'MATCHED', 'RESOLVED'].includes(r.vendor_status || '');
        return !r.vendor_id || !hasEffectiveMatch;
    }, []);

    const isItemRequired = useCallback((r: ScanResult) => {
        if (r.validationStatus === 'VOUCHER_CREATED') return false;
        const IN_PROGRESS_STATUSES = new Set(['processing', 'PENDING', 'PROCESSING', 'scanning', 'EXTRACTING']);
        if (IN_PROGRESS_STATUSES.has(r.validationStatus)) return false;
        return r.item_status === 'CREATE ITEM';
    }, []);

    const isVoucherNeedSave = useCallback((r: ScanResult) => {
        if (r.validationStatus === 'VOUCHER_CREATED' || r.validationStatus === 'DUPLICATE' || r.validationStatus === 'DUPLICATE_IN_BATCH') return false;
        const IN_PROGRESS_STATUSES = new Set(['processing', 'PENDING', 'PROCESSING', 'scanning', 'EXTRACTING']);
        if (IN_PROGRESS_STATUSES.has(r.validationStatus)) return false;
        return !!(r.vendor_id || ['READY', 'FOUND', 'RESOLVED', 'SUCCESS', 'NEED_TO_SAVE', 'PENDING_PURCHASE'].includes(r.validationStatus));
    }, []);

    const visibleRows = React.useMemo(() => {
        return currentDataset.filter(r => {
            if (activeFilter === 'vendor_required') return isVendorRequired(r);
            if (activeFilter === 'item_required') return isItemRequired(r);
            if (activeFilter === 'voucher_need_save') return isVoucherNeedSave(r);
            return true;
        });
    }, [currentDataset, activeFilter, isVendorRequired, isItemRequired, isVoucherNeedSave]);

    const countAll = currentDataset.length;
    const countVendorRequired = currentDataset.filter(isVendorRequired).length;
    const countItemRequired = currentDataset.filter(isItemRequired).length;
    const countVoucherNeedSave = currentDataset.filter(isVoucherNeedSave).length;

    // ── Resume Workflow State ──
    const [isCheckingUnresolved, setIsCheckingUnresolved] = useState(true);
    const [unresolvedCount, setUnresolvedCount] = useState(0);
    const [needsVendorCount, setNeedsVendorCount] = useState(0);
    const [readyToFinalizeCount, setReadyToFinalizeCount] = useState(0);
    const [showResumePrompt, setShowResumePrompt] = useState(false);
    const [useAllUnresolved, setUseAllUnresolved] = useState(false);

    // Duplicate detection set
    const uploadedFilesSetRef = useRef<Set<string>>(new Set());
    // Ref already declared above

    // Listen for events from sub-modals to trigger workflows
    useEffect(() => {
        const handler = (e: any) => {
            const fileHash = e.detail;
            const row = scanResults.find(r => r.file_hash === fileHash);
            if (row) openCreateVendorModal(row);
        };
        window.addEventListener('re-open-create-vendor', handler);
        return () => window.removeEventListener('re-open-create-vendor', handler);
    }, [scanResults]);

    const fetchResumeCounts = useCallback(async () => {
        try {
            const res: any = await httpClient.get('/api/ocr-staging/?resume=true');
            const rows = (res && Array.isArray(res.data)) ? res.data : (Array.isArray(res) ? res : []);

            if (rows.length > 0) {
                const vendorNeededCount = rows.filter((r: any) => {
                    if (r.processed || r.validation_status === 'VOUCHER_CREATED' || r.validation_status === 'DUPLICATE') return false;
                    const vendorMissing = !r.vendor_id && !['READY', 'FOUND', 'RESOLVED', 'SUCCESS'].includes(r.validation_status);
                    const itemsMissing = r.item_status === 'CREATE ITEM';
                    return vendorMissing || itemsMissing;
                }).length;

                const readyToFinalize = rows.filter((r: any) => {
                    if (r.processed || r.validation_status === 'VOUCHER_CREATED' || r.validation_status === 'DUPLICATE') return false;
                    const hasVendor = !!(r.vendor_id || ['READY', 'FOUND', 'RESOLVED', 'SUCCESS'].includes(r.validation_status));
                    const hasValidItems = r.item_status === 'ALREADY EXIST';
                    return hasVendor && hasValidItems;
                }).length;

                setUnresolvedCount(vendorNeededCount);
                setNeedsVendorCount(vendorNeededCount);
                setReadyToFinalizeCount(readyToFinalize);
                setShowResumePrompt(vendorNeededCount > 0 || readyToFinalize > 0);
            } else {
                setUnresolvedCount(0);
                setNeedsVendorCount(0);
                setReadyToFinalizeCount(0);
                setShowResumePrompt(false);
            }
        } catch (err) {
            console.error("Check unresolved failed", err);
        } finally {
            setIsCheckingUnresolved(false);
        }
    }, []);

    // Check for existing unresolved invoices on mount
    useEffect(() => {
        fetchResumeCounts();
    }, [fetchResumeCounts]);

    // ── Re-hydration guard: fires once when entering review step with a valid session ──
    // This restores the scan list after "Back to Scan List" navigation, which
    // unmounts/remounts BulkInvoiceUploadModal with empty local state.
    const hasFetchedForReviewRef = useRef(false);
    useEffect(() => {
        const sid = uploadSessionId || activeSessionId;
        if (step === 'review' && sid && !hasFetchedForReviewRef.current) {
            hasFetchedForReviewRef.current = true;
            console.log("[FORENSIC][RE-HYDRATION] Restoring scan list on review mount. session_id =", sid);
            fetchStagedInvoices(sid);
        }
        // Reset flag when leaving review step so next entry re-fetches
        if (step !== 'review') {
            hasFetchedForReviewRef.current = false;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, uploadSessionId, activeSessionId]); // intentionally omit fetchStagedInvoices to prevent ref-change loops

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
    const POLL_INTERVAL_MS = 5000;

    /**
     * Centralized Polling Manager: Stops all active polling intervals and SSE connections.
     */
    const stopAllPolling = useCallback(() => {
        console.log('[POLLING_STOPPED] Halting all polling mechanisms');
        if (pollingIntervalRef2.current) {
            clearInterval(pollingIntervalRef2.current);
            pollingIntervalRef2.current = null;
        }
        if (pollingTimeoutRef.current) {
            clearTimeout(pollingTimeoutRef.current);
            pollingTimeoutRef.current = null;
        }
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        retryCountRef.current = 0;
        setRetryCount(0);
        stalledAt100Ref.current = null;
    }, []);

    const performCloseCleanup = useCallback(() => {
        console.log("[FORENSIC] performCloseCleanup initiated");
        // Stop frontend polling
        stopAllPolling();

        // Clear timers/intervals
        if (progressIntervalRef.current) {
            console.log("[FORENSIC] Clearing progressInterval");
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
        }

        // Clear loading states
        setIsLoading(false);
        setFinalizing(false);
        setScanProgress(0);

        // Clear upload session state in Zustand store
        useOcrWorkflowStore.getState().clearWorkflow();

        // Call the parent onClose callback
        onClose();
    }, [onClose, stopAllPolling]);

    const handleClose = useCallback(() => {
        console.log("Close clicked");
        performCloseCleanup();
    }, [performCloseCleanup]);

    const handleCancel = useCallback(() => {
        console.log("Cancel clicked");
        performCloseCleanup();
    }, [performCloseCleanup]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                // If a sub-modal/panel is open, let it handle Escape
                if (isCreateVendorModalOpen || isCreateItemModalOpen || detailsRow) {
                    return;
                }
                console.log("Escape key pressed");
                handleClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isCreateVendorModalOpen, isCreateItemModalOpen, detailsRow, handleClose]);

    /**
     * Execute a single fetch of staged invoices and update state.
     * Returns true if polling should stop (completed or max retries).
     */
    const doFetch = useCallback(async (sid: string, vFilter?: string): Promise<boolean> => {
        try {
            // ── Normalize the URL and append filter if present ──
            let url = sid ? `/api/ocr-staging/?upload_session_id=${sid}` : `/api/ocr-staging/?resume=true`;
            if (vFilter) {
                const base = url.split('?')[0];
                const params = new URLSearchParams(url.split('?')[1] || '');
                params.append('filter', vFilter);
                url = `${base}?${params.toString()}`;
            }
            console.log("Calling OCR Staging API:", url);
            const res: any = await httpClient.get(url);

            if (!isMounted.current) return true;
            setIsLoading(false);
            setFetchError(null);
            console.log("OCR API response:", res);
            if (res) {
                console.log("[FRONTEND_RECEIPT] raw API payload:", res);
                const rowsToLog = Array.isArray(res) ? res : (res.data || []);
                rowsToLog.forEach((row: any) => {
                    console.log(
                        `[FRONTEND_ROW_RECEIPT] ` +
                        `invoice_no=${row.invoice_no || ''} ` +
                        `vendor_id=${row.vendor_id || ''} ` +
                        `vendor_status=${row.vendor_status || ''}`
                    );
                });
            }

            // ── Handle both envelope {status, data:[]} and legacy plain array ──
            let rows: any[];
            let pipelineStatus: string;
            if (Array.isArray(res)) {
                // Legacy plain-array response (backward compat)
                rows = res;
                pipelineStatus = rows.every(r => !['PENDING', 'processing'].includes(r.validation_status || '')) ? 'completed' : 'processing';
            } else if (res && res.status === 'FINALIZED') {
                const snapshotInvoicesRaw = res.data || [];
                console.log(`[FRONTEND_RAW_RESPONSE] status=FINALIZED session=${sid} invoices=${snapshotInvoicesRaw.length}`);
                console.log('✅ SNAPSHOT RECEIVED — HALTING POLL.');
                const snapshotInvoices = snapshotInvoicesRaw.map((inv: any, idx: number) => {
                    const result = {
                        ...inv, // Preserve mapped fields from backend (vendor_status, status, etc)
                        id: String(inv.id || `snap_${idx}`),
                        file_hash: inv.file_hash || inv.file_path || String(inv.id) || `snap_${sid}_${idx}`,
                        file_path: inv.file_path || 'Finalized Result',
                        invoice_number: inv.invoice_number || inv.invoice_no || '—',
                        invoice_date: inv.invoice_date || '—',
                        vendor_name: inv.vendor_name || '—',
                        vendor_gstin: inv.vendor_gstin || inv.gstin || '—',
                        branch: inv.branch || '—',
                        total_amount: String(inv.total_amount || inv.invoice_total || '0.00'),
                        extracted_data: inv.extracted_data || inv,
                        validationStatus: (inv.validationStatus || inv.validation_status || 'READY') as ValidationStatus,
                        vendor_status: (inv.vendor_id ? 'EXISTS' : (inv.vendor_status || 'NEW')) as VendorStatus,
                        processed: !!inv.processed,
                        _isSnapshot: true,
                        _isMerged: !!inv._isMerged,
                        _mergedCount: inv._mergedCount || 1,
                        total_taxable_value: String(inv.total_taxable_value || '0.00'),
                        total_igst: String(inv.total_igst || '0.00'),
                        total_cgst: String(inv.total_cgst || '0.00'),
                        total_sgst: String(inv.total_sgst || '0.00')
                    };
                    return result;
                });

                setScanResults(snapshotInvoices);
                setScanProgress(100);
                setIsLoading(false);
                setStep('review');
                return true; // Stop polling
            } else if (res && (res.data !== undefined || res.status === 'PROCESSING' || res.status === 'EMPTY_SESSION_TERMINAL')) {
                if (res.status === 'EMPTY_SESSION_TERMINAL') {
                    console.log(`[EMPTY_SESSION_TERMINAL_DETECTED] session=${uploadSessionId}`);
                    setScanProgress(100);
                    setScanCurrentFile('No active records in this upload session');
                    setIsLoading(false);
                    setScanResults([]);
                    setStep('review');
                    return true;
                }

                // ── Update Progress (Fix #6) ──
                if (res.progress_percent !== undefined) {
                    const pct = Math.round(res.progress_percent);
                    setScanProgress(pct);
                    // ── [SCAN_STATUS_TEXT_FIX] Update scanCurrentFile dynamically based on real progress ──
                    // Previously stuck at "Queued for AI extraction..." throughout entire polling lifecycle.
                    if (pct <= 0) {
                        setScanCurrentFile('Queued for AI extraction…');
                    } else if (pct < 25) {
                        setScanCurrentFile(`Processing pages… (${pct}%)`);
                    } else if (pct < 60) {
                        setScanCurrentFile(`AI extracting invoice data… (${pct}%)`);
                    } else if (pct < 90) {
                        setScanCurrentFile(`Assembling multi-page results… (${pct}%)`);
                    } else if (pct < 100) {
                        setScanCurrentFile(`Finalizing extracted data… (${pct}%)`);
                    } else {
                        setScanCurrentFile('Almost done — building review…');
                    }
                    if (pct >= 100) {
                        if (!stalledAt100Ref.current) stalledAt100Ref.current = Date.now();
                    } else {
                        stalledAt100Ref.current = null;
                    }
                }

                // ── [PHASE 6] DETERMINISTIC HYDRATION BARRIER ──
                // Block full review transition while backend is still processing AND data is empty.
                // BUT: if progress > 0, at least the status text has updated — keep polling.
                if (res.status === 'PROCESSING' && (!res.data || res.data.length === 0)) {
                    console.log(`[STAGING_FETCH] Session in flight. progress=${res.progress_percent ?? 0}% Blocking hydration, continuing poll.`);
                    return false; // Continue polling
                }

                rows = res.data || [];
                pipelineStatus = res.status || 'processing';

                // (progress + status text already updated in the block above, before the hydration barrier check)
            } else {
                console.error("Unexpected API response format:", res);
                setScanResults([]);
                return false;
            }

            console.log(`OCR staging: status=${pipelineStatus}, rows=${rows.length}`);
            console.log("Records count:", rows.length);

            // ── Diagnostic: log the first row's full structure so mapping issues are visible ──
            if (rows.length > 0) {
                console.log('[FRONTEND_API_RESPONSE] count=' + rows.length);
                console.log('[FRONTEND_ROW_KEYS] sample_row=' + JSON.stringify(Object.keys(rows[0])));
                console.log('[ROW_RENDER_OBJECT] sample_row=', rows[0]);
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

                // HARDENING: UI MUST READ validation_status AS PRIMARY (Step 4 Fix)
                const backendStatus = r.validation_status || 'PENDING';
                // db_status: raw DB pipeline stage (new field added to API)
                const dbStatus = r.db_status || r.status || '';

                // ── ASYNC-SAFE STATUS RESOLUTION ──
                // The backend now returns db_status = the raw DB status field.
                // If db_status is an in-progress async stage, ALWAYS show SCANNING.
                // Never trust validation_status when the record is mid-pipeline.
                const ASYNC_IN_PROGRESS = new Set([
                    'PROCESSING', 'OCR_PROCESSING', 'OCR_QUEUED',
                    'AI_QUEUED', 'AI_PROCESSING', 'UPLOADING', 'EXTRACTING', 'UPLOADED',
                ]);
                const ASYNC_TERMINAL = new Set([
                    'EXTRACTED', 'FAILED', 'VOUCHER_CREATED', 'OCR_FAILED', 'FINALIZED', 'SUCCESS', 'COMPLETED',
                ]);

                let vStatus: ValidationStatus = 'PENDING';

                if (backendStatus === 'PROCESSING' || ASYNC_IN_PROGRESS.has(dbStatus)) {
                    // Record is in an async pipeline stage — show SCANNING spinner
                    vStatus = 'processing';
                } else if (['DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE', 'duplicate'].includes(backendStatus)) {
                    vStatus = 'DUPLICATE';
                } else if (['READY', 'success', 'SUCCESS', 'found', 'FOUND', 'MATCHED', 'matched', 'EXISTS', 'exists'].includes(backendStatus)) {
                    vStatus = 'READY';
                } else if (backendStatus === 'VOUCHER_CREATED' || backendStatus === 'Voucher Created' || (r.processed === true && !['PENDING_PURCHASE', 'GSTIN_CONFLICT', 'DUPLICATE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_INVOICE'].includes(backendStatus))) {
                    vStatus = 'VOUCHER_CREATED';
                } else if (backendStatus === 'RESOLVED' || backendStatus === 'resolved' || backendStatus === 'MATCHED_VENDOR') {
                    vStatus = 'RESOLVED';
                } else if (['NEED_VENDOR', 'VENDOR_MISSING', 'NOT_FOUND', 'not_found', 'Vendor Missing', 'CREATE_VENDOR'].includes(backendStatus)) {
                    vStatus = 'NEED_VENDOR';
                } else if (backendStatus === 'GSTIN_CONFLICT' || backendStatus === 'gstin_conflict') {
                    vStatus = 'GSTIN_CONFLICT';
                } else if (backendStatus === 'NEEDS_ATTENTION' || backendStatus === 'needs_attention' || backendStatus === 'INCOMPLETE' || backendStatus === 'incomplete') {
                    vStatus = 'NEEDS_ATTENTION';
                } else if (['EXTRACTION_FAILED', 'extraction_failed', 'ERROR', 'error'].includes(backendStatus)) {
                    vStatus = 'EXTRACTION_FAILED';
                } else if (['VALIDATION_FAILED', 'validation_failed', 'FAILED', 'failed'].includes(backendStatus)) {
                    vStatus = 'VALIDATION_FAILED';
                } else if (
                    backendStatus === 'processing' ||
                    backendStatus === 'PROCESSING' ||
                    backendStatus === 'EXTRACTING' ||
                    backendStatus === 'UPLOADED'
                ) {
                    vStatus = 'processing';
                }

                // Low-confidence override (only when pipeline is complete)
                if (ASYNC_TERMINAL.has(dbStatus) && (r.extracted_data?._fallback || r.conflict_message?.toLowerCase().includes('low-confidence'))) {
                    vStatus = 'LOW_CONFIDENCE';
                }

                // If backend says READY but we have no vendor, it's not actually ready for finalization
                // Only apply this check when the pipeline has completed (not mid-processing)
                if (['READY', 'RESOLVED'].includes(vStatus) && !r.vendor_id) vStatus = 'NEED_VENDOR';

                // GUARDED: Only convert PENDING→NEEDS_ATTENTION when the record is
                // genuinely terminal (db_status is a done state), not mid-pipeline.
                // This prevents premature NEEDS_ATTENTION during async AI processing.
                if (vStatus === 'PENDING' && (r.status === 'SUCCESS' || r.status === 'FINALIZED') && ASYNC_TERMINAL.has(dbStatus)) {
                    vStatus = 'NEEDS_ATTENTION';
                }

                // ── Resolve display fields using variadic clean() ──
                // Prioritize standardized snake_case keys over legacy ERP headers
                const invoiceNumber = clean(
                    r.supplier_invoice_no, r.invoice_number,
                    inv['invoice_no'], inv['invoice_number'],
                    inv['supplier_invoice_no'], inv['supplied_invoice_no'],
                    inv['Supplier Invoice No'], inv['Supplier Invoice No.'],
                    inv['Invoice No'], inv['Invoice Number'],
                );
                const invoiceDate = clean(
                    r.invoice_date,
                    inv['invoice_date'],
                    inv['Voucher Date'], inv['Invoice Date'], inv['Date'],
                );
                const vendorName = clean(
                    r.vendor_name,
                    inv['vendor_name'],
                    inv['Vendor Name'], inv['Supplier Name'], inv['Party Name'], inv['Bill From'],
                );
                const vendorGstin = clean(
                    r.gstin, r.vendor_gstin,
                    inv['gstin'],
                    inv['GSTIN'], inv['Supplier GSTIN'], inv['Party GSTIN'],
                );
                const totalAmount = clean(
                    r.total_invoice_value, r.total_amount,
                    inv['invoice_total'], inv['total_invoice_value'],
                    inv['Total Invoice Value'], inv['Grand Total'], inv['total_amount'], inv['total_invoice_amount']
                );

                // Add totals to row object so ReviewDetailsPanel can use them consistently
                const totalTaxable = clean(inv['total_taxable_value'], inv['Taxable Value'], inv['Summary Totals']?.['Taxable Value']) || '0.00';
                const totalCgst = clean(inv['total_cgst'], inv['CGST'], inv['Summary Totals']?.['Total CGST']) || '0.00';
                const totalSgst = clean(inv['total_sgst'], inv['SGST/UTGST'], inv['Summary Totals']?.['Total SGST/UTGST']) || '0.00';
                const totalIgst = clean(inv['total_igst'], inv['IGST'], inv['Summary Totals']?.['Total IGST']) || '0.00';

                const result: ScanResult = {
                    id: String(r.id || r.file_hash),
                    file_hash: r.file_hash,
                    file_path: r.file_path,
                    invoice_number: invoiceNumber,
                    invoice_date: invoiceDate,
                    vendor_name: vendorName,
                    vendor_gstin: vendorGstin,
                    total_amount: totalAmount,
                    total_taxable_value: totalTaxable,
                    total_cgst: totalCgst,
                    total_sgst: totalSgst,
                    total_igst: totalIgst,
                    validationStatus: vStatus,
                    vendor_status: (r.vendor_id ? 'EXISTS' : (r.vendor_status || 'NEW')) as VendorStatus,
                    vendor_id: r.vendor_id,
                    branch: clean(r.branch, inv['branch'], inv['Branch']),
                    extracted_data: rawExtracted,
                    status: r.status || vStatus,
                    created_at: r.created_at || new Date().toISOString(),
                    error_message: r.validation_message || '',
                    matchedBy: r.matched_by || '',
                    conflictMessage: r.conflict_message || '',
                    _isMerged: !!rawExtracted?._is_merged,
                    _mergedCount: rawExtracted?._merged_count || 1,
                    group_id: r.group_id,
                    processed: !!r.processed,
                    item_status: r.item_status || '',
                    missing_items: r.missing_items || [],
                    items: r.items || [],
                };
                return result;
            });

            setScanResults(prev => {
                if (!useAllUnresolvedRef.current) {
                    // Live Session: seeded is the exact authoritative state
                    return seeded;
                }

                // Resume Staging: Deterministic Unresolved Identity Merge
                const normalize = (s: any) => String(s || '').replace(/[^A-Z0-9]/g, '').trim().toUpperCase();

                const getResumeKey = (r: ScanResult) => {
                    return r.file_hash || String(r.id);
                };

                const next = [...prev];
                const seenKeys = new Set<string>();

                for (const incoming of seeded) {
                    const rKey = getResumeKey(incoming);
                    if (seenKeys.has(rKey)) {
                        console.log(`[RESUME_DEDUP_SKIPPED] frontend skipping duplicate incoming row key=${rKey}`);
                        continue;
                    }
                    seenKeys.add(rKey);

                    const existingIndex = next.findIndex(r => getResumeKey(r) === rKey);
                    if (existingIndex >= 0) {
                        next[existingIndex] = incoming;
                        console.log(`[RESUME_ROW_REPLACED] key=${rKey}`);
                    } else {
                        next.push(incoming);
                        console.log(`[RESUME_ROW_APPENDED] key=${rKey}`);
                    }
                }

                // Reconcile and remove resolved rows (present in prev but missing from authoritative seeded)
                const finalRows = next.filter(r => {
                    const keep = seenKeys.has(getResumeKey(r));
                    if (!keep) console.log(`[RESUME_ROW_RESOLVED] key=${getResumeKey(r)} removed from staging`);
                    return keep;
                });
                return finalRows;
            });
            console.log("API count:", rows.length);

            // [BUG 2 FIX: PROGRESSIVE REVIEW UNLOCK] 
            // Unlock the review step progressively as soon as records exist in the session,
            // rather than waiting for complete processing or terminal completion!
            const lowerStatus = pipelineStatus.toLowerCase();
            if ((seeded.length > 0 || lowerStatus === 'completed' || lowerStatus === 'finalized' || lowerStatus === 'failed') && isMounted.current) {
                console.log(`[PURCHASE_SCAN_REVIEW_UNLOCK] progressive unlock: count=${seeded.length} pipelineStatus=${pipelineStatus}`);
                if (step === 'scanning') setStep('review');
            }

            // ── Stop polling if backend says completed or all rows settled ──
            if (lowerStatus === 'completed' || lowerStatus === 'finalized' || lowerStatus === 'failed') {
                console.log(`✅ Backend reported ${pipelineStatus} — stopping poll.`);
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
                                setScanResults(prev => prev.map(r =>
                                    (r.id === row.id && !r._isSnapshot) ? { ...r, ...patchResult, validationStatus: 'READY' } : r
                                ));
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

    const vFilterRef = useRef<string | undefined>(undefined);

    const fetchStagedInvoices = useCallback(async (forcedSid?: any, _isAutoRetry = false, vFilter?: string) => {
        if (!isMounted.current) return;
        vFilterRef.current = vFilter;

        // ── Resolve session ID ──
        let sid = '';
        if (typeof forcedSid === 'string' && forcedSid) {
            sid = forcedSid;
        } else if (forcedSid && typeof forcedSid === 'object' && !Array.isArray(forcedSid)) {
            sid = forcedSid.upload_session_id || forcedSid.id || uploadSessionId;
        } else {
            sid = useAllUnresolvedRef.current ? '' : uploadSessionId;
        }

        if (!sid || sid === 'null' || sid === 'undefined' || sid === 'None') {
            if (!useAllUnresolvedRef.current) {
                console.error('[ORPHAN_POLL_BLOCKED] Invalid sessionId passed to fetchStagedInvoices for live upload:', forcedSid, 'sid:', sid);
                return;
            }
        }

        // ── Stop any existing poll before starting a new one ──
        stopAllPolling();
        setFetchError(null);
        setRetryCount(0);
        retryCountRef.current = 0;
        setIsLoading(true);

        // ── Initial fetch ──
        const initialStop = await doFetch(sid, vFilter);
        if (initialStop || !isMounted.current) return;

        // ── [PHASE 5B] SSE INFRASTRUCTURE ──
        // Replaces polling with push-based terminal state signaling.
        const startSSE = (session_id: string) => {
            if (eventSourceRef.current) eventSourceRef.current.close();

            console.log(`[SSE_CONNECTED] session_id=${session_id}`);
            // Note: EventSource sends cookies by default if same-origin.
            const es = new EventSource(`/api/ocr-status-stream/${session_id}/`);
            eventSourceRef.current = es;

            es.onmessage = async (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log(`[SSE_EVENT] session=${session_id} status=${data.status}`);

                    if (data.status === 'FINALIZED' || data.status === 'FAILED') {
                        console.log(`[SESSION_FINALIZED_EVENT] session_id=${session_id} event=${data.status}`);
                        console.log('✅ TERMINAL STATE REACHED — HALTING SSE.');
                        await doFetch(session_id, vFilterRef.current);
                        es.close();
                        console.log('[POLLING_DISABLED]');
                    }
                } catch (err) {
                    console.error('[SSE_PARSE_ERROR]', err);
                }
            };

            es.onerror = (err) => {
                console.warn('[SSE_ERROR] Falling back to adaptive polling.', err);
                es.close();
                // Fallback to legacy polling if SSE fails (e.g. proxy issues)
                startPoll(3000);
            };
        };

        // ── [PHASE 4-B FIX] ADAPTIVE EXPONENTIAL POLLING (Fallback) ──
        const startTime = Date.now();
        const startPoll = (delay: number) => {
            const timeoutId = setTimeout(async () => {
                if (!isMounted.current) return;
                const done = await doFetch(sid, vFilterRef.current);
                if (!done && isMounted.current) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    const nextDelay = elapsed > 90 ? 15000 : (elapsed > 30 ? 8000 : 3000);
                    startPoll(nextDelay);
                }
            }, delay);
            pollingIntervalRef2.current = timeoutId as any;
        };

        // Prefer SSE, fallback to polling
        startSSE(sid);
        if (!uploadSessionId) return;
        if (step === 'review' && scanResults.length === 0) {
            // Do NOT pass uploadSessionId here. fetchStagedInvoices knows how to 
            // choose between sid='' (resume all) and sid=uploadSessionId based on the ref.
            fetchStagedInvoices();
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

            // Backend uses parallel workers. Limit is 2 per instance.
            const batchCount = Math.ceil(estimatedTasks / 2);
            setEstimatedExtractionTime(Math.round(avgTime * batchCount) + 5);
        } catch (error) {
            let estimatedTasks = 0;
            selectedFiles.forEach(f => {
                const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
                estimatedTasks += isPdf ? Math.max(1, Math.ceil(f.size / 100000)) : 1;
            });
            const batchCount = Math.ceil(estimatedTasks / 2);
            setEstimatedExtractionTime(Math.round(3.85 * batchCount) + 5);
        }

        try {
            const formData = new FormData();
            selectedFiles.forEach(f => formData.append('files', f));
            formData.append('voucher_type', voucherType);
            formData.append('upload_type', 'PURCHASE'); // [UPLOAD_TYPE PROPAGATION FIX] Purchase Scan
            formData.append('upload_session_id', uploadSessionId);

            setScanProgress(40);
            setScanCurrentFile(`Uploading ${selectedFiles.length} files...`);

            // Start a small interval to move progress from 40 to 90 while waiting for backend
            const progressInterval = setInterval(() => {
                setScanProgress(prev => {
                    if (prev < 90) return prev + 1;
                    return prev;
                });
            }, 1000);
            progressIntervalRef.current = progressInterval;

            const res: any = await httpClient.postFormData('/api/ocr-staging/', formData);
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
            }

            setScanCurrentFile(`Queued for AI extraction...`);

            // [PURCHASE_SCAN_PROGRESS_FIX] Do NOT set scanProgress=100 here.
            // Previously this prematurely set progress to 100 before backend polling started,
            // causing the bar to jump to 100 then reset to 0 when the backend returned real progress.
            // Instead, hold at a low value so backend polling drives the progress bar correctly.
            setScanProgress(5); // Reset to base — backend will drive from here via polling

            // Show info about recovered results (excluding those hidden by filter, e.g. hard duplicates)
            const actionableFound = (res.results || []).filter((r: any) =>
                r.is_duplicate && !['DUPLICATE', 'VOUCHER_CREATED'].includes(r.status)
            ).length;

            if (actionableFound > 0) {
                showInfo(`✨ ${actionableFound} results loaded instantly from previous scans.`);
            }

            console.log(`[PURCHASE_SCAN_UPLOAD_DONE] session=${uploadSessionId} starting polling for backend progress`);

            // MANDATORY: Always fetch from DB after upload. No shortcut.
            // This ensures invoice_ocr_temp is the SINGLE SOURCE OF TRUTH.
            fetchStagedInvoices(uploadSessionId);
            // [ISSUE 1 FIX] Removed setStep('review') so UI stays in scanning state until progressive hydration begins.
        } catch (err: any) {
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
            }
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

    const handleSaveVendorSuccess = async (vendorName: string, vendorId: number, row: ScanResult) => {
        console.info(`[FORENSIC][PURCHASE_SCAN_VENDOR_LIFECYCLE] Vendor created via canonical Vendor Master form. vendor_name="${vendorName}", vendor_id=${vendorId}, file_hash=${row.file_hash}`);
        try {
            // Fetch the created vendor's basic detail to get the canonical details
            const basicDetail: any = await httpClient.get(`/api/vendors/basic-details/${vendorId}/`);
            // Fetch GST details to get the GSTIN and branch
            const gstDetails: any = await httpClient.get(`/api/vendors/gst-details/?vendor_basic_detail=${vendorId}`);
            const gstList = Array.isArray(gstDetails) ? gstDetails : (gstDetails.results || []);

            const gstin = gstList?.[0]?.gstin || '';
            const branch = gstList?.[0]?.reference_name || 'Main Branch';
            const address = gstList?.[0]?.branch_address || '';
            const state = basicDetail.state || '';
            const vendorCategory = basicDetail.vendor_category || '';

            console.info(`[FORENSIC][PURCHASE_SCAN_VENDOR_LIFECYCLE] Retrieved newly created vendor details from backend. GSTIN="${gstin}", branch="${branch}", state="${state}", category="${vendorCategory}"`);

            showInfo('Re-validating invoice…');

            // Merge the corrected vendor info into extracted_data so re-validation succeeds
            const updatedExtracted = { ...row.extracted_data };
            const inv = updatedExtracted.invoice || updatedExtracted.header || updatedExtracted;

            inv['Vendor Name'] = vendorName;
            inv['GSTIN'] = gstin;
            if (address) {
                inv['Bill From - Address Line 1'] = address;
            }
            if (state) {
                inv['Bill From - State'] = state;
            }
            inv['Branch'] = branch;
            inv['Vendor Category'] = vendorCategory;

            // Trigger backend re-validation with the corrected data
            const patchRes: any = await httpClient.patch(
                `/api/ocr-staging/${row.file_hash}/`,
                { extracted_data: updatedExtracted }
            );

            if (patchRes.success) {
                let newStatus: ValidationStatus = 'READY';
                const s = patchRes.status || '';
                if (s === 'DUPLICATE' || s === 'duplicate') {
                    newStatus = 'DUPLICATE';
                } else if (s === 'GSTIN_CONFLICT' || s === 'gstin_conflict') {
                    newStatus = 'GSTIN_CONFLICT';
                } else if (s === 'VENDOR_MISSING' || s === 'NOT_FOUND' || s === 'not_found' || s === 'CREATE_VENDOR' || s === 'NEED_VENDOR') {
                    newStatus = 'NEED_VENDOR';
                }

                console.info(`[FORENSIC][PURCHASE_SCAN_VENDOR_LIFECYCLE] Re-validation completed successfully. New status="${newStatus}", vendor_status="FOUND", file_hash=${row.file_hash}`);

                // Update ONLY the specific row that was just resolved (strict per-row update)
                setScanResults(prev => prev.map(r =>
                    r.file_hash === row.file_hash
                        ? {
                            ...r,
                            extracted_data: patchRes.extracted_data || updatedExtracted,
                            validationStatus: newStatus,
                            vendor_id: patchRes.vendor_id || vendorId,
                            vendor_name: patchRes.vendor_name || vendorName,
                            vendor_gstin: gstin || r.vendor_gstin,
                            vendor_status: 'FOUND' as VendorStatus,
                        }
                        : r
                ));
                fetchResumeCounts();
                showSuccess('Vendor details validated and invoice updated.');
            } else {
                console.warn(`[FORENSIC][PURCHASE_SCAN_VENDOR_LIFECYCLE] Re-validation returned patch success=false for file_hash=${row.file_hash}`);
            }
            setResolvingRow(null);
        } catch (err: any) {
            console.error('[FORENSIC][PURCHASE_SCAN_VENDOR_LIFECYCLE] Failed during post-creation validation refresh:', err);
            showError('Failed to refresh invoice details after vendor creation.');
        }
    };

    const handleRescan = async (row: ScanResult) => {
        if (rescanningRowId) return; // Prevent double-click
        const rowNumericId = String(row.id).replace(/^snap_/, '');
        if (!rowNumericId || isNaN(Number(rowNumericId))) {
            showError('Cannot rescan: record ID is invalid. Please re-upload the file.');
            return;
        }

        setRescanningRowId(row.id);
        setScanResults(prev => prev.map(r =>
            r.id === row.id ? { ...r, validationStatus: 'PROCESSING' as ValidationStatus } : r
        ));

        try {
            const res: any = await httpClient.post(`/api/ocr-staging/${rowNumericId}/rescan/`, {});
            if (res.success) {
                showSuccess(`🔄 Rescan queued for ${row.file_path?.split('/').pop() || row.invoice_number || 'invoice'}`);
                // Restart polling so the grid refreshes as reprocessing progresses
                await new Promise(r => setTimeout(r, 800));
                fetchStagedInvoices(uploadSessionId || undefined);
            } else {
                showError(res.error || 'Rescan could not be initiated');
                fetchStagedInvoices(uploadSessionId || undefined);
            }
        } catch (err: any) {
            showError(err?.response?.data?.error || 'Network error during rescan');
            fetchStagedInvoices(uploadSessionId || undefined);
        } finally {
            setRescanningRowId(null);
        }
    };

    const handleRescanAll = async () => {
        if (rescanningAll || !uploadSessionId) return;
        if (!window.confirm(`Re-run full AI extraction for all ${scanResults.length} invoice(s) in this session?\n\nExisting data will be cleared and re-extracted. This cannot be undone.`)) return;

        setRescanningAll(true);
        setScanResults(prev => prev.map(r => ({ ...r, validationStatus: 'PROCESSING' as ValidationStatus })));

        try {
            const res: any = await httpClient.post(`/api/ocr-staging/session/${uploadSessionId}/rescan/`, {});
            if (res.success) {
                showSuccess(`🔄 Rescan All queued: ${res.triggered_count} invoice(s) reprocessing.`);
                await new Promise(r => setTimeout(r, 1000));
                fetchStagedInvoices(uploadSessionId);
            } else {
                showError(res.error || 'Session rescan failed');
                fetchStagedInvoices(uploadSessionId);
            }
        } catch (err: any) {
            showError(err?.response?.data?.error || 'Network error during session rescan');
            fetchStagedInvoices(uploadSessionId);
        } finally {
            setRescanningAll(false);
        }
    };

    const handleRemove = async (fileHash: string) => {
        try {
            const targetRow = scanResults.find(r => r.file_hash === fileHash);
            const isSnapshotRow = targetRow ? !!targetRow._isSnapshot : String(fileHash).startsWith('snap_');
            if (!isSnapshotRow) {
                await httpClient.delete(`/api/ocr-staging/${fileHash}/`);
            }
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
            const nonSnapshotHashes = hashes.filter(h => {
                const targetRow = scanResults.find(r => r.file_hash === h);
                return targetRow ? !targetRow._isSnapshot : !String(h).startsWith('snap_');
            });
            // Parallel delete only for staging records
            if (nonSnapshotHashes.length > 0) {
                await Promise.all(nonSnapshotHashes.map(h => httpClient.delete(`/api/ocr-staging/${h}/`)));
            }

            setScanResults(prev => prev.filter(r => !selectedHashes.has(r.file_hash)));
            setSelectedHashes(new Set());
            showSuccess(`Bulk deleted ${hashes.length} invoices`);
        } catch (err) {
            showError('Bulk delete failed partially');
            fetchStagedInvoices(undefined, false, vFilterRef.current);
        }
    }

    const toggleSelectAll = () => {
        const currentlyShowing = scanResults.filter(row => row.vendor_status !== 'EXISTS');
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
        if (workflowState === "FINALIZING") return;
        setStep('upload');
        if (useAllUnresolved) {
            setUseAllUnresolved(false);
            useAllUnresolvedRef.current = false;
            fetchResumeCounts();
        }
    };

    const canFinalize = scanResults.some(r =>
        r.validationStatus !== 'VOUCHER_CREATED' &&
        r.validationStatus !== 'DUPLICATE'
    ) && !finalizing;

    const handleFinalize = async () => {
        if (!canFinalize) {
            showError(`No valid invoices to finalize or move to pending.`);
            return;
        }

        // Count READY rows from ALL scan results (not just the visible filtered table).
        // This fixes the bug where being on 'Pending' tab hid READY rows, causing a false "0 ready" error.
        const allReadyRows = scanResults.filter(r =>
            (r.vendor_id || ['READY', 'FOUND', 'RESOLVED', 'SUCCESS', 'NEED_VENDOR', 'NEED_TO_SAVE'].includes(r.validationStatus)) &&
            r.validationStatus !== 'VOUCHER_CREATED' &&
            r.validationStatus !== 'DUPLICATE' &&
            r.item_status === 'ALREADY EXIST'
        );
        const allPendingRows = scanResults.filter(r =>
            (!r.vendor_id && !['READY', 'FOUND', 'RESOLVED', 'SUCCESS', 'VOUCHER_CREATED', 'DUPLICATE', 'DUPLICATE_IN_BATCH', 'NEED_VENDOR', 'NEED_TO_SAVE'].includes(r.validationStatus)) ||
            r.item_status === 'CREATE ITEM'
        );
        const validCount = allReadyRows.length;
        const pendingCount = allPendingRows.length;

        console.log('[FINALIZE_CONFIRMATION_CHECK] Diagnosing finalize session scoping:', {
            uploadSessionId,
            useAllUnresolved: useAllUnresolvedRef.current,
            scanResultsCount: scanResults.length,
            allReadyRowsCount: allReadyRows.length,
            allPendingRowsCount: allPendingRows.length,
            readyToFinalizeCountState: readyToFinalizeCount,
            needsVendorCountState: needsVendorCount,
            calculatedValidCount: validCount,
            calculatedPendingCount: pendingCount
        });

        if (validCount === 0 && pendingCount === 0) {
            showError(`No invoices are ready to process.`);
            return;
        }

        if (validCount === 0 && pendingCount > 0) {
            if (!window.confirm(`${pendingCount} invoice(s) still need attention. They will be moved to your Pending Purchases queue to be resolved later.\n\nMove them to Pending Purchases now?`)) {
                return;
            }
        } else if (pendingCount > 0 && validCount > 0) {
            if (!window.confirm(`${validCount} invoice(s) are ready to save as vouchers.\n${pendingCount} invoice(s) still need attention and will be moved to Pending Purchases.\n\nProceed now?`)) {
                return;
            }
        }

        if (workflowState === "FINALIZING") return;
        setWorkflowState("FINALIZING");
        setFinalizing(true);
        setStep('finalizing');

        console.log('[FINALIZE_STARTED] Halting polling and hydration');
        stopAllPolling();

        try {
            const res: FinalizeResult = await httpClient.post('/api/ocr-staging-finalize/', {
                upload_session_id: uploadSessionId // Send uploadSessionId ALWAYS!
            });

            setFinalizeResult(res);

            if (res.created > 0) {
                showSuccess(res.message || `✅ ${res.created} voucher(s) created successfully!`);
            }
            if (res.failed > 0) {
                showError(`⚠️ ${res.failed} internal error(s) occurred.`);
            }

            if (res.skipped > 0) {
                // If there are skipped/pending items left, stay on review screen and fetch them.
                console.log('[SESSION_PARTIAL_TEARDOWN] Fetching remaining staging rows...');
                setStep('review');
                setWorkflowState("REVIEW");
                // Fetch canonical backend state
                fetchStagedInvoices(useAllUnresolvedRef.current ? undefined : uploadSessionId);
                fetchResumeCounts();
            } else {
                console.log('[SESSION_TEARDOWN_STARTED] Cleaning up live upload state');
                // TEARDOWN ORCHESTRATION STATE BEFORE CLEARING upload_session_id
                setUploadRows([]);
                setResumeRows([]);
                setUploadSelectedHashes(new Set());
                setResumeSelectedHashes(new Set());
                setScanProgress(0);

                console.log('[SESSION_TEARDOWN_COMPLETED] Upload session cleared');

                if (typeof window.crypto !== 'undefined' && typeof window.crypto.randomUUID === 'function') {
                    setUploadSessionId(window.crypto.randomUUID());
                } else {
                    setUploadSessionId(Math.random().toString(36).substring(2, 11) + Date.now().toString(36));
                }

                if (useAllUnresolvedRef.current) {
                    setUseAllUnresolved(false);
                    useAllUnresolvedRef.current = false;
                }

                setWorkflowState("FINALIZED");
                console.log('[LIVE_UPLOAD_RESET] Transitioning to clean upload state');
                setStep('upload');
                setWorkflowState("LIVE_UPLOAD");
                fetchResumeCounts();
            }

            onFinalized?.(res);
        } catch (err: any) {
            const msg = err?.response?.data?.error || err?.message || 'Finalize failed.';
            showError(`❌ ${msg}`);
            setStep('review');
            setWorkflowState("REVIEW");
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

            const schemaFields = getVoucherFlatHeaders(voucherType);
            const allExportRows: any[] = [];

            scanResults.forEach((row) => {
                const data = row.extracted_data || {};
                // Normalize the whole dataset first for consistent lookup
                const rawInv = data.invoice || data.header || data || {};
                const normalizedInv: any = {};
                Object.entries(rawInv).forEach(([k, v]) => {
                    const nk = normalizeVoucherField(k, voucherType);
                    if (nk) normalizedInv[nk] = v;
                });

                const rawItems = data.items || data.line_items || [{}];
                rawItems.forEach((rawItem: any) => {
                    const normalizedItem: any = {};
                    Object.entries(rawItem).forEach(([k, v]) => {
                        const nk = normalizeVoucherField(k, voucherType);
                        if (nk) normalizedItem[nk] = v;
                    });

                    const exportRow: any = {
                        'S.No': allExportRows.length + 1,
                        'System ID': row.id,
                        'File Name': row.file_path?.split(/[\\/]/).pop() || 'Unknown',
                        'Matching Status': row.validationStatus || '—',
                        'Matched By': row.matchedBy || '—'
                    };

                    // Map all schema fields
                    schemaFields.forEach(colName => {
                        const nk = normalizeVoucherField(colName, voucherType);

                        // Priority search: 
                        // 1. Normalized Header (most reliable for core fields)
                        // 2. Normalized Item
                        // 3. Raw Header (fallback)
                        // 4. Raw Item (fallback)
                        // 5. Parent row properties (invoice_number, etc.)

                        let val = normalizedInv[nk] ?? normalizedItem[nk];

                        if (val === undefined || val === null || val === '') {
                            val = rawInv[colName] ?? rawItem[colName];
                        }

                        // Special fallbacks for core fields if still empty
                        if (val === undefined || val === null || val === '') {
                            if (nk === 'invoice_date') val = row.invoice_date;
                            if (nk === 'supplier_invoice_no' || nk === 'sales_invoice_no') val = row.invoice_number;
                            if (nk === 'vendor_name' || nk === 'customer_name') val = row.vendor_name;
                            if (nk === 'gstin') val = row.vendor_gstin;
                            if (nk === 'total_invoice_value') val = row.total_amount;
                        }

                        exportRow[colName] = (val !== null && val !== undefined && val !== '') ? val : '—';
                    });

                    allExportRows.push(exportRow);
                });
            });

            const ws = XLSX.utils.json_to_sheet(allExportRows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Scanned Data');

            // Set column widths
            const colWidths = [
                { wch: 6 },  // S.No
                { wch: 20 }, // File Name
                { wch: 15 }, // Status
                ...schemaFields.map(() => ({ wch: 15 }))
            ];
            ws['!cols'] = colWidths;

            XLSX.writeFile(wb, `Purchase_Bulk_Scan_${voucherType}_${new Date().toISOString().split('T')[0]}.xlsx`);
            showSuccess('Excel export successful');
        } catch (err) {
            console.error('Excel Export Error:', err);
            showError('Failed to generate Excel file');
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const missingCount = mergedResults.filter(r => r.validationStatus === 'VENDOR_MISSING' || r.validationStatus === 'NOT_FOUND').length;
    const conflictCount = mergedResults.filter(r => r.validationStatus === 'GSTIN_CONFLICT').length;
    const resolvedCount = mergedResults.filter(r => r.validationStatus === 'RESOLVED').length;
    const readyCount = mergedResults.filter(r =>
        ['READY', 'FOUND', 'RESOLVED', 'SUCCESS', 'NEED_TO_SAVE'].includes(r.validationStatus) &&
        r.item_status === 'ALREADY EXIST'
    ).length;
    const duplicatesCount = mergedResults.filter(r => ['DUPLICATE', 'DUPLICATE_IN_BATCH'].includes(r.validationStatus)).length;
    const errorCount = mergedResults.filter(r => r.validationStatus === 'VALIDATION_FAILED' || r.validationStatus === 'EXTRACTION_FAILED' || r.validationStatus === 'ERROR').length;
    // pendingCount: records still in async pipeline (show SCANNING spinner in banner)
    const pendingCount = mergedResults.filter(r => ['PENDING', 'PROCESSING', 'processing', 'scanning'].includes(r.validationStatus)).length;
    const vouchersCreatedCount = mergedResults.filter(r => r.validationStatus === 'VOUCHER_CREATED').length;

    // ── ATTENTION NEEDED COUNT ──
    // Only count records that have COMPLETED async processing but require user action.
    // Explicitly EXCLUDE records that are still in-flight (processing/PENDING/scanning)
    // so the counter stays 0 while AI workers are running.
    const IN_PROGRESS_STATUSES = new Set(['processing', 'PENDING', 'PROCESSING', 'scanning', 'EXTRACTING']);
    const attentionNeededCount = mergedResults.filter(r => {
        if (IN_PROGRESS_STATUSES.has(r.validationStatus)) return false;
        if (r.validationStatus === 'VOUCHER_CREATED' || r.validationStatus === 'DUPLICATE') return false;
        const vendorMissing = !r.vendor_id && !['READY', 'FOUND', 'RESOLVED', 'SUCCESS'].includes(r.validationStatus);
        const itemsMissing = r.item_status === 'CREATE ITEM';
        return vendorMissing || itemsMissing;
    }).length;

    // Default filter on first load of review step
    useEffect(() => {
        if (step === 'review') {
            if (filterStatus === 'ready' && attentionNeededCount > 0) {
                setFilterStatus('pending');
            } else if (filterStatus === 'pending' && attentionNeededCount === 0 && readyCount > 0) {
                // If nothing needs attention but we have ready items (e.g. after resume), show ready items
                setFilterStatus('ready');
            }
        }
    }, [step, attentionNeededCount, readyCount]);

    // ── PHASE 5 & 6: PIPELINE-GATED UI ──
    const isPipelineStabilized = scanResults.length > 0 && scanResults.every(r => !r._blocked && r.validationStatus !== 'processing');
    const isExportDisabled = finalizing || scanResults.length === 0 || !isPipelineStabilized;

    return (
        <>
            {/* Resolve Section (Integrated into Edit modal or fallback to Create modal) */}
            {isCreateVendorModalOpen && resolvingRow && (
                <CreateNewVendorFullModal
                    prefilledData={extractedVendorData}
                    onClose={() => {
                        setIsCreateVendorModalOpen(false);
                        setResolvingRow(null);
                    }}
                    onVendorCreated={(vendorName, vendorId) => {
                        setIsCreateVendorModalOpen(false);
                        handleSaveVendorSuccess(vendorName, vendorId, resolvingRow);
                    }}
                />
            )}

            {isCreateItemModalOpen && itemResolvingRow && (
                <CreateNewInventoryItemModal
                    prefilledData={extractedItemData}
                    onClose={() => {
                        setIsCreateItemModalOpen(false);
                        setItemResolvingRow(null);
                    }}
                    onItemCreated={(itemName, itemCode, itemId) => {
                        setIsCreateItemModalOpen(false);
                        if (itemResolvingRow) {
                            handleRevalidateRow(itemResolvingRow);
                        }
                    }}
                />
            )}

            {isMatchItemModalOpen && itemResolvingRow && (
                <MatchExistingItemModal
                    stagingId={itemResolvingRow.id}
                    lineIndex={matchingLineIndex}
                    extractedItem={extractedItemData}
                    onClose={() => {
                        setIsMatchItemModalOpen(false);
                        setItemResolvingRow(null);
                    }}
                    onItemMatched={(updatedRow?: any) => {
                        setIsMatchItemModalOpen(false);
                        if (updatedRow && itemResolvingRow) {
                            // Directly update the row in scan results without full revalidation
                            setScanResults(prev =>
                                prev.map(r => String(r.id) === String(itemResolvingRow.id) ? { ...r, ...updatedRow } : r)
                            );
                        } else if (itemResolvingRow) {
                            handleRevalidateRow(itemResolvingRow);
                        }
                        setItemResolvingRow(null);
                    }}
                />
            )}

            {/* Edit — handled by parent via onEditRow (opens canonical Purchase Voucher form) */}

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
                    className="bg-white rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden transition-all duration-300"
                    style={{ maxWidth: '1400px', maxHeight: '95vh' }}
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
                                <h2 className="text-lg font-bold text-white">Purchase Bulk Scan – Invoice Scanner</h2>
                                <p className="text-xs text-indigo-200">
                                    {step === 'upload' && 'Upload multiple invoices for batch AI processing.'}
                                    {step === 'scanning' && 'AI extracting invoice data…'}
                                    {step === 'review' && (
                                        <span className="flex items-center gap-2">
                                            <span className="text-white/80 font-medium">
                                                {mergedResults.length} voucher{mergedResults.length !== 1 ? 's' : ''}
                                                <span className="mx-1 opacity-40">|</span>
                                                {mergedResults.reduce((acc, r) => acc + (r._mergedCount || 1), 0)} file{mergedResults.reduce((acc, r) => acc + (r._mergedCount || 1), 0) !== 1 ? 's' : ''}
                                            </span>
                                            <span
                                                onClick={() => setFilterStatus('ready')}
                                                className={`cursor-pointer px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${filterStatus === 'ready' ? 'bg-emerald-400 text-white border-white/40 shadow-sm' : 'bg-emerald-400/30 text-emerald-50 border-emerald-400/20 hover:bg-emerald-400/50'}`}
                                            >
                                                {readyCount} Matched
                                            </span>
                                            <span
                                                onClick={() => setFilterStatus('pending')}
                                                className={`cursor-pointer px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${filterStatus === 'pending' ? 'bg-amber-400 text-white border-white/40 shadow-sm' : `${attentionNeededCount > 0 ? 'bg-amber-400/30 text-amber-50 border-white/10' : 'bg-white/10 text-white/50 border-white/5'} hover:bg-white/20`}`}
                                            >
                                                {attentionNeededCount} Need Attention
                                            </span>
                                        </span>
                                    )}
                                    {step === 'finalizing' && 'Saving vouchers…'}
                                    {step === 'done' && 'Done'}
                                </p>
                            </div>
                        </div>

                        {/* Resume Toggle & Step Indicator */}
                        <div className="flex items-center gap-4 mr-4">


                            <div className="flex items-center gap-1">
                                {(['upload', 'review', 'done'] as const).map((s, idx) => {
                                    const labels = ['1. Upload', '2. Review', '3. Save'];
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
                        </div>

                        <button
                            onClick={handleClose}
                            className="text-indigo-200 hover:text-white transition-colors ml-2"
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
                                {/* ── Action Filter Tabs ── */}
                                <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-gray-150 justify-center">
                                    <button
                                        onClick={() => setActiveFilter('all')}
                                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 select-none outline-none ${
                                            activeFilter === 'all'
                                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-150 border border-indigo-600'
                                                : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100'
                                        }`}
                                    >
                                        <span>📂 All</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                            activeFilter === 'all' ? 'bg-indigo-700 text-indigo-100' : 'bg-indigo-200 text-indigo-600'
                                        }`}>
                                            {countAll}
                                        </span>
                                    </button>

                                    <button
                                        onClick={() => setActiveFilter('vendor_required')}
                                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 select-none outline-none ${
                                            activeFilter === 'vendor_required'
                                                ? 'bg-orange-600 text-white shadow-md shadow-orange-150 border border-orange-600'
                                                : 'bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-100'
                                        }`}
                                    >
                                        <span>👤 Vendor Required</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                            activeFilter === 'vendor_required' ? 'bg-orange-700 text-orange-100' : 'bg-orange-200 text-orange-600'
                                        }`}>
                                            {countVendorRequired}
                                        </span>
                                    </button>

                                    <button
                                        onClick={() => setActiveFilter('item_required')}
                                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 select-none outline-none ${
                                            activeFilter === 'item_required'
                                                ? 'bg-amber-600 text-white shadow-md shadow-amber-150 border border-amber-600'
                                                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-100'
                                        }`}
                                    >
                                        <span>📦 Item Required</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                            activeFilter === 'item_required' ? 'bg-amber-700 text-amber-100' : 'bg-amber-200 text-amber-600'
                                        }`}>
                                            {countItemRequired}
                                        </span>
                                    </button>

                                    <button
                                        onClick={() => setActiveFilter('voucher_need_save')}
                                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 select-none outline-none ${
                                            activeFilter === 'voucher_need_save'
                                                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-150 border border-emerald-600'
                                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100'
                                        }`}
                                    >
                                        <span>💾 Need to Save</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                            activeFilter === 'voucher_need_save' ? 'bg-emerald-700 text-emerald-100' : 'bg-emerald-200 text-emerald-600'
                                        }`}>
                                            {countVoucherNeedSave}
                                        </span>
                                    </button>
                                </div>

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
                                        <div className="text-[10px] bg-blue-100 px-2 py-0.5 rounded-full">Attempt {retryCount}/{MAX_RETRIES}</div>
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

                                {selectedHashes.size > 0 && (
                                    <div className="flex items-center justify-between px-2 mb-2 bg-gray-50/50 p-2 rounded-xl border border-gray-100 animate-fadeIn">
                                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                            {selectedHashes.size} items selected
                                        </div>
                                        <button
                                            onClick={handleBulkDelete}
                                            className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-bold hover:bg-red-200 transition-colors flex items-center gap-1.5 shadow-sm active:scale-95"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            Delete Selected
                                        </button>
                                    </div>
                                )}
                                {(() => {
                                    const showVendorCol = activeFilter === 'all' || activeFilter === 'vendor_required';
                                    const showItemCol = activeFilter === 'all' || activeFilter === 'item_required';
                                    const showVoucherCol = activeFilter === 'all' || activeFilter === 'voucher_need_save';
                                    const totalVisibleCols = 10 + (showVendorCol ? 1 : 0) + (showItemCol ? 1 : 0) + (showVoucherCol ? 1 : 0);

                                    return (
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 border-b border-gray-200">
                                                <tr className="text-gray-600 text-[10px] uppercase font-bold tracking-wider">
                                                    <th className="px-3 py-3 text-left w-8">
                                                        <input
                                                            type="checkbox"
                                                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                            checked={selectedHashes.size > 0 && selectedHashes.size === scanResults.filter(row => !['EXISTS', 'FOUND', 'MATCHED'].includes(row.vendor_status || '')).length}
                                                            onChange={toggleSelectAll}
                                                        />
                                                    </th>
                                                    <th className="px-3 py-3 text-center w-10">S.No</th>
                                                    <th className="px-3 py-3 text-left">File Name</th>
                                                    <th className="px-3 py-3 text-left">Inv No</th>
                                                    <th className="px-3 py-3 text-left">Date</th>
                                                    <th className="px-3 py-3 text-left">Vendor</th>
                                                    <th className="px-3 py-3 text-left">GSTIN</th>
                                                    <th className="px-3 py-3 text-left">Branch</th>
                                                    <th className="px-3 py-3 text-right">Amount</th>
                                                    {showVendorCol && <th className="px-3 py-3 text-center">Vendor Status</th>}
                                                    {showItemCol && <th className="px-3 py-3 text-center">Item Status</th>}
                                                    {showVoucherCol && <th className="px-3 py-3 text-center">Voucher Status</th>}
                                                    <th className="px-3 py-3 text-center">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {visibleRows.length === 0 && (
                                                    <tr>
                                                        <td colSpan={totalVisibleCols} className="text-center py-8 text-gray-500 font-medium italic">
                                                            No invoices match the selected filter.
                                                        </td>
                                                    </tr>
                                                )}
                                                {visibleRows.map((row, idx) => {
                                                const invoice = row.extracted_data?.invoice || row.extracted_data?.header || row.extracted_data || {};

                                                // CROSS-CHECK: Robust Instant Vendor Link
                                                const rowGstin = (row.extracted_data?.sections?.supplier_details?.gstin || row.vendor_gstin || "").toString().trim().toUpperCase();
                                                const rowBranch = (row.extracted_data?.sections?.supplier_details?.branch || row.branch || "").toString().trim().toUpperCase();
                                                const rowName = (row.extracted_data?.sections?.supplier_details?.vendor_name || row.vendor_name || "").toString().trim().toUpperCase();

                                                // [SIBLING_VENDOR_INFERENCE_BLOCKED] Each row uses ONLY its own backend validation.
                                                // Borrowing vendor_id from sibling rows is explicitly disabled — it was the root
                                                // cause of false "ALREADY EXIST" badges for vendors not in the master.
                                                console.log(
                                                    `[SIBLING_VENDOR_INFERENCE_BLOCKED]\n` +
                                                    `record_id=${row.id}`
                                                );

                                                // STRICTLY own row only — never inherit from siblings
                                                const effectiveVendorId = row.vendor_id;

                                                const hasEffectiveMatch = ['EXISTS', 'FOUND', 'MATCHED', 'RESOLVED'].includes(row.vendor_status || '');
                                                const renderedBadge = hasEffectiveMatch ? 'ALREADY EXIST' : 'Create Vendor';

                                                console.log(
                                                    `[FRONTEND_VENDOR_RENDER_DECISION] ` +
                                                    `invoice_no=${row.invoice_number || ''} ` +
                                                    `displayed_badge=${renderedBadge} ` +
                                                    `source_field_used=row.vendor_status ` +
                                                    `vendor_status_val=${row.vendor_status || ''} ` +
                                                    `vendor_id_val=${row.vendor_id || ''}`
                                                );

                                                if (row.vendor_id && renderedBadge === 'Create Vendor') {
                                                    console.error(
                                                        `[VENDOR_UI_STATE_CORRUPTION] UI is rendering 'Create Vendor' even though vendor_id exists!\n` +
                                                        `invoice_no=${row.invoice_number || ''}\n` +
                                                        `vendor_id=${row.vendor_id}\n` +
                                                        `vendor_status=${row.vendor_status || ''}\n` +
                                                        `rendered_badge=${renderedBadge}\n` +
                                                        `row_payload=${JSON.stringify(row)}`
                                                    );
                                                }

                                                return (
                                                    <React.Fragment key={row.file_hash || row.id || idx}>
                                                        <tr className={`group hover:bg-indigo-50/40 transition-colors ${row._isMerged ? 'bg-blue-50/30' : ''} ${selectedHashes.has(row.file_hash) ? 'bg-indigo-50' :
                                                            row.vendor_status === 'NEW' ? 'bg-amber-50/30' : ''
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
                                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                                        <span className="truncate max-w-[120px] font-medium text-gray-700" title={row.file_path}>
                                                                            {row.file_path.split('/').pop()}
                                                                        </span>
                                                                        {row._isMerged && (
                                                                            <span className="flex-shrink-0 bg-indigo-100 text-indigo-700 text-[9px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter border border-indigo-200">
                                                                                {row._mergedCount} FILES
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <button onClick={() => setDetailsRow(row)} className="text-[10px] text-indigo-500 hover:text-indigo-700 underline font-bold text-left mt-0.5">View Details</button>
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-3 font-bold text-gray-800 text-[11px]">{(() => {
                                                                const val = getCellValue(row, 'invoice_number');
                                                                if (val === '—') console.warn(`[EMPTY_RENDER_FIELD] row=${row.id} field=invoice_number row_keys=${Object.keys(row)}`);
                                                                return val;
                                                            })()}</td>
                                                            <td className="px-3 py-3 text-[11px] text-gray-600 font-medium whitespace-nowrap">{getCellValue(row, 'invoice_date')}</td>
                                                            <td className="px-4 py-3">
                                                                <div className="flex flex-col">
                                                                    <span className="font-bold text-gray-900 text-[11px] leading-tight truncate max-w-[120px]" title={row.vendor_name}>{getCellValue(row, 'vendor_name')}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-3 font-mono text-[10px] text-gray-500">{getCellValue(row, 'vendor_gstin')}</td>
                                                            <td className="px-3 py-3 text-[11px] text-gray-600 font-medium">{getCellValue(row, 'branch') || row.branch || row.extracted_data?.sections?.supplier_details?.branch || '—'}</td>
                                                            <td className="px-3 py-3 text-right font-black text-gray-900 text-[11px]">₹{(() => {
                                                                const val = getCellValue(row, 'total_amount');
                                                                console.log(`[CELL_VALUE_TRACE] row=${row.id} field=total_amount value=${val}`);
                                                                return val;
                                                            })()}</td>
                                                            {/* Vendor Status */}
                                                            {showVendorCol && (
                                                                <td className="px-2 py-3 text-center text-[10px] font-bold uppercase whitespace-nowrap">
                                                                    {(row.validationStatus === "processing" || row.validationStatus === "PENDING" || row.validationStatus === "EXTRACTING" || row.validationStatus === "PROCESSING" || row.validationStatus === "SCANNING") ? (
                                                                        <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-1 rounded inline-flex items-center gap-1">
                                                                            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent animate-spin rounded-full" /> SCANNING
                                                                        </span>
                                                                    ) : row.validationStatus === "EXTRACTION_FAILED" ? (
                                                                        <span className="bg-red-100 text-red-800 border border-red-300 px-2 py-1 rounded">FAILED</span>
                                                                    ) : hasEffectiveMatch ? (
                                                                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-1 rounded">ALREADY EXIST</span>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => openCreateVendorModal(row)}
                                                                            className="bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white border border-orange-600 px-2 py-1 rounded cursor-pointer transition-colors"
                                                                        >
                                                                            Create Vendor
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            )}
                                                            {/* Item Status */}
                                                            {showItemCol && (
                                                                <td className="px-2 py-3 text-center text-[10px] font-bold uppercase whitespace-nowrap">
                                                                    {(row.validationStatus === "processing" || row.validationStatus === "PENDING" || row.validationStatus === "EXTRACTING" || row.validationStatus === "PROCESSING" || row.validationStatus === "SCANNING") ? (
                                                                        <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-1 rounded inline-flex items-center gap-1">
                                                                            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent animate-spin rounded-full" /> SCANNING
                                                                        </span>
                                                                    ) : row.item_status === 'ALREADY EXIST' ? (
                                                                        <div className="flex flex-col items-center gap-1">
                                                                            <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-1 rounded inline-block">ALREADY EXIST</span>
                                                                            {row.items && row.items.length > 0 && (
                                                                                <button
                                                                                    onClick={() => toggleExpandRow(row.id)}
                                                                                    className="text-[9px] text-indigo-600 hover:text-indigo-800 font-bold underline focus:outline-none"
                                                                                >
                                                                                    {expandedRows.has(row.id) ? 'Hide Items' : 'View Items'}
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    ) : row.item_status === 'CREATE ITEM' ? (
                                                                        <div className="flex flex-col items-center gap-1">
                                                                            <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-1 rounded inline-block">CREATE ITEM</span>
                                                                            <button
                                                                                onClick={() => toggleExpandRow(row.id)}
                                                                                className="text-[9px] text-indigo-600 hover:text-indigo-800 font-bold underline focus:outline-none"
                                                                            >
                                                                                {expandedRows.has(row.id) ? 'Hide Items' : 'Expand Items'}
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-gray-300">—</span>
                                                                    )}
                                                                </td>
                                                            )}
                                                            {/* Voucher Status */}
                                                            {showVoucherCol && (
                                                                <td className="px-2 py-3 text-center text-[10px] font-bold uppercase whitespace-nowrap">
                                                                    {(row.validationStatus === "processing" || row.validationStatus === "PENDING" || row.validationStatus === "EXTRACTING" || row.validationStatus === "PROCESSING" || row.validationStatus === "SCANNING") ? (
                                                                        <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-1 rounded inline-flex items-center gap-1">
                                                                            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent animate-spin rounded-full" /> SCANNING
                                                                        </span>
                                                                    ) : row.validationStatus === "VOUCHER_CREATED" ? (
                                                                        <span className="bg-emerald-600 text-white px-2 py-1 rounded">✅ Saved</span>
                                                                    ) : (row.validationStatus === "DUPLICATE" || row.validationStatus === "DUPLICATE_IN_BATCH") ? (
                                                                        <span className="bg-red-100 text-red-800 border border-red-300 px-2 py-1 rounded">Already Exist</span>
                                                                    ) : (effectiveVendorId || ['READY', 'FOUND', 'RESOLVED', 'SUCCESS', 'NEED_TO_SAVE', 'PENDING_PURCHASE'].includes(row.validationStatus)) ? (
                                                                        <button
                                                                            onClick={() => {
                                                                                if (onEditRow) {
                                                                                    onEditRow({
                                                                                        ...row,
                                                                                        uploadSessionId: uploadSessionId,
                                                                                        file_name: row.file_path?.split(/[\/]/).pop() || row.file_path || '',
                                                                                    });
                                                                                } else {
                                                                                    setEditingRow(row);
                                                                                }
                                                                            }}
                                                                            title="Open Voucher For Review"
                                                                            className="bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-1 rounded hover:bg-indigo-200 hover:text-indigo-800 transition-colors cursor-pointer font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 inline-block"
                                                                        >
                                                                            Need to Save
                                                                        </button>
                                                                    ) : (['NEED_VENDOR', 'VENDOR_MISSING', 'NOT_FOUND', 'GSTIN_CONFLICT', 'CREATE_VENDOR'].includes(row.validationStatus)) ? (
                                                                        <span className="bg-orange-100 text-orange-700 border border-orange-200 px-2 py-1 rounded">Create Vendor First</span>
                                                                    ) : row.validationStatus === "EXTRACTION_FAILED" ? (
                                                                        <span className="bg-red-100 text-red-700 border border-red-200 px-2 py-1 rounded">Failed</span>
                                                                    ) : (
                                                                        <span className="bg-amber-50 text-amber-600 border border-amber-200 px-2 py-1 rounded">Pending</span>
                                                                    )}
                                                                </td>
                                                            )}
                                                            <td className="px-2 py-3 text-center">
                                                                <div
                                                                    className="flex items-center justify-center gap-1"
                                                                    style={{
                                                                        opacity: (['PENDING', 'processing', 'PROCESSING', 'SCANNING', 'EXTRACTING', 'scanning', 'resolving', 'validating'].includes(row.validationStatus)) ? 0.3 : 1,
                                                                        pointerEvents: (['PENDING', 'processing', 'PROCESSING', 'SCANNING', 'EXTRACTING', 'scanning', 'resolving', 'validating'].includes(row.validationStatus)) ? 'none' : 'auto'
                                                                    }}
                                                                >

                                                                    {/* Revalidate button — triggers a fresh vendor check without opening edit modal.
                                                                         Always shown; the outer container dims it while the row is in-flight. */}
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
                                                                                    else if (s === 'DUPLICATE' || s === 'duplicate') newStatus = 'DUPLICATE';
                                                                                    else if (s === 'VENDOR_MISSING' || s === 'NOT_FOUND' || s === 'not_found' || s === 'CREATE_VENDOR') newStatus = 'VENDOR_MISSING';
                                                                                    else if (s === 'GSTIN_CONFLICT' || s === 'gstin_conflict') newStatus = 'GSTIN_CONFLICT';
                                                                                    const updated = {
                                                                                        ...r,
                                                                                        validationStatus: newStatus,
                                                                                        vendor_id: result.vendor_id ?? r.vendor_id,
                                                                                        vendor_name: result.vendor_name || r.vendor_name,
                                                                                        vendor_status: ((result.vendor_id ?? r.vendor_id) ? 'EXISTS' : (result.vendor_status || 'NEW')) as VendorStatus,
                                                                                    };
                                                                                    if (newStatus === 'VENDOR_MISSING') setTimeout(() => openCreateVendorModal(updated), 150);
                                                                                    return updated;
                                                                                }));
                                                                            } catch { fetchStagedInvoices(); }
                                                                        }}
                                                                        className="p-1 hover:bg-indigo-100 rounded text-indigo-400 hover:text-indigo-700 transition-colors"
                                                                        title="Revalidate vendor"
                                                                    >
                                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                                    </button>

                                                                    {/* Rescan button — re-runs full OCR + AI extraction pipeline for this row.
                                                                         Always shown for all statuses (ALREADY EXIST, DUPLICATE, VOUCHER_CREATED, NEED TO SAVE, etc).
                                                                         Only snap_N orphan rows (no real backend PK) are excluded. */}
                                                                    {!String(row.id).startsWith('snap_') && (
                                                                        <button
                                                                            onClick={() => handleRescan(row)}
                                                                            disabled={rescanningRowId === row.id}
                                                                            className="p-1 hover:bg-violet-100 rounded text-violet-400 hover:text-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                                            title="Rescan — re-run OCR & AI extraction for this invoice"
                                                                        >
                                                                            {rescanningRowId === row.id ? (
                                                                                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707" /></svg>
                                                                            ) : (
                                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18" /></svg>
                                                                            )}
                                                                        </button>
                                                                    )}

                                                                </div>
                                                            </td>

                                                        </tr>

                                                        {expandedRows.has(row.id) && (

                                                            <tr className="bg-slate-50/30">

                                                                <td colSpan={totalVisibleCols} className="px-6 py-4">

                                                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">

                                                                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">

                                                                            <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Line Items Validation</span>

                                                                            <span className="text-[10px] text-gray-500 font-mono">Total Items: {row.items?.length || 0}</span>

                                                                        </div>

                                                                        <table className="w-full text-left text-[11px]">

                                                                            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-150 uppercase text-[9px] tracking-wider">

                                                                                <tr>

                                                                                    <th className="px-3 py-2 w-10 text-center">#</th>

                                                                                    <th className="px-3 py-2">Item Name</th>

                                                                                    <th className="px-3 py-2">HSN/SAC</th>

                                                                                    <th className="px-3 py-2">UOM</th>

                                                                                    <th className="px-3 py-2 text-right">Rate</th>

                                                                                    <th className="px-3 py-2 text-center">Item Status</th>

                                                                                    <th className="px-3 py-2 text-center">Action</th>

                                                                                </tr>

                                                                            </thead>

                                                                            <tbody className="divide-y divide-slate-100">

                                                                                {(row.items || []).map((item: any, itemIdx: number) => (

                                                                                    <tr key={itemIdx} className="hover:bg-indigo-50/20 transition-colors">

                                                                                        <td className="px-3 py-2 text-center text-slate-400 font-bold">{itemIdx + 1}</td>

                                                                                        <td className="px-3 py-2">

                                                                                            <div className="flex flex-col">

                                                                                                <span className="font-bold text-slate-900 leading-tight">{item.item_name}</span>

                                                                                                {item.item_code && <span className="text-[9px] text-slate-400 font-mono mt-0.5">Code: {item.item_code}</span>}

                                                                                            </div>

                                                                                        </td>

                                                                                        <td className="px-3 py-2 font-mono text-slate-600">{item.hsn_code || '—'}</td>

                                                                                        <td className="px-3 py-2 text-slate-600 uppercase font-bold">{item.uom || '—'}</td>

                                                                                        <td className="px-3 py-2 text-right text-slate-700 font-bold">₹{parseFloat(item.rate || 0).toFixed(2)}</td>

                                                                                        <td className="px-3 py-2 text-center whitespace-nowrap">

                                                                                            {item.item_status === 'ALREADY EXIST' ? (

                                                                                                <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded text-[9px] font-extrabold tracking-wider">ALREADY EXIST</span>

                                                                                            ) : (

                                                                                                <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded text-[9px] font-extrabold tracking-wider text-amber-800">CREATE ITEM</span>

                                                                                            )}

                                                                                        </td>

                                                                                        <td className="px-3 py-2 text-center">

                                                                                        {item.item_status === 'CREATE ITEM' ? (
                                                                                            <div className="flex items-center justify-center gap-1.5">
                                                                                                <button
                                                                                                    onClick={() => openCreateItemModal(row, item)}
                                                                                                    className="bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white border border-amber-600 px-3 py-1 rounded text-[10px] font-bold cursor-pointer transition-colors shadow-sm"
                                                                                                >
                                                                                                    Create Item
                                                                                                </button>
                                                                                                <button
                                                                                                    onClick={() => openMatchItemModal(row, item, item.line_index ?? itemIdx)}
                                                                                                    className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white border border-indigo-700 px-3 py-1 rounded text-[10px] font-bold cursor-pointer transition-colors shadow-sm flex items-center gap-1"
                                                                                                >
                                                                                                    <Icon name="link" className="w-3 h-3" />
                                                                                                    Match Existing
                                                                                                </button>
                                                                                            </div>

                                                                                            ) : (

                                                                                                <span className="text-gray-400">—</span>

                                                                                            )}

                                                                                        </td>

                                                                                    </tr>

                                                                                ))}

                                                                            </tbody>

                                                                        </table>

                                                                    </div>

                                                                </td>

                                                            </tr>

                                                        )}

                                                    </React.Fragment>
                                                )
                                            })}
                                    </tbody>
                                </table>
                                    );
                                })()}
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
                                <button onClick={handleClose} className="px-8 py-2.5 bg-gray-800 text-white rounded-xl text-sm font-bold shadow-lg">Close & Finish</button>
                            ) : (
                                <>
                                    <button onClick={handleCancel} className="px-6 py-2.5 text-sm font-bold text-gray-600 hover:text-gray-900 font-bold transition-colors">Cancel</button>

                                    {step === 'upload' && (
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={handleScan}
                                                disabled={selectedFiles.length === 0}
                                                className="px-8 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-bold shadow-lg disabled:opacity-40 flex items-center gap-2 whitespace-nowrap active:scale-95"
                                            >
                                                Scan {selectedFiles.length > 0 ? `${selectedFiles.length} File(s)` : 'Files'}
                                            </button>
                                        </div>
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
                                                disabled={isExportDisabled}
                                                className="px-6 py-2.5 bg-white text-indigo-700 border border-indigo-200 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2 disabled:opacity-40"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                </svg>
                                                Download Excel
                                            </button>
                                            {/* Rescan All — re-runs full pipeline for every invoice in this upload session */}
                                            {uploadSessionId && !scanResults.every(r => String(r.id).startsWith('snap_')) && (
                                                <button
                                                    onClick={handleRescanAll}
                                                    disabled={rescanningAll || finalizing}
                                                    title="Re-run OCR & AI extraction for all invoices in this session"
                                                    className="px-5 py-2.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-xl text-sm font-bold shadow-sm hover:bg-violet-100 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    {rescanningAll ? (
                                                        <>
                                                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3" /></svg>
                                                            Rescanning…
                                                        </>
                                                    ) : (
                                                        <>
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                            Rescan All
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                            <button
                                                onClick={handleFinalize}
                                                disabled={isExportDisabled || !canFinalize}
                                                className="px-8 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-sm font-bold shadow-xl disabled:opacity-40 flex items-center gap-2"
                                            >
                                                {finalizing ? 'Saving...' : !isPipelineStabilized ? 'Finalizing Assembly...' : 'Finalize & Save Vouchers'}
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
