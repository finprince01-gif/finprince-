import React, { useState, useRef, useEffect, useCallback } from 'react';
import { apiService } from '../services';
import { showError, showSuccess, showInfo } from '../utils/toast';
import CreateCustomerModal from './CreateCustomerModal';
import Icon from './Icon';

import { SALES_VOUCHER_COLUMNS_BY_TAB, SalesVoucherTab } from '../constants/salesVoucherColumns';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SalesInvoiceGroup {
    invoice_no: string;
    header: any;
    items: any[];
    /** READY | CUSTOMER_MISSING | GSTIN_CONFLICT | VALIDATION_FAILED */
    status: string;
    message: string;
    customer_id?: number;
    matched_by?: string;
    session_id: string;
    row_index: number;
}

interface EditModalProps {
    invoice: SalesInvoiceGroup;
    index: number;
    onClose: () => void;
    onSave: (index: number, updated: SalesInvoiceGroup) => Promise<void>;
}

const SalesEditModal: React.FC<EditModalProps> = ({ invoice, index, onClose, onSave }) => {
    const [draft, setDraft] = useState<SalesInvoiceGroup>(JSON.parse(JSON.stringify(invoice)));
    const [saving, setSaving] = useState(false);
    const [activeMainTab, setActiveMainTab] = useState<'header' | 'items'>('header');
    const [activeSubTab, setActiveSubTab] = useState<SalesVoucherTab>('Invoice Details');

    const updateHeader = (key: string, value: any) => {
        setDraft(prev => ({
            ...prev,
            header: { ...prev.header, [key]: value }
        }));
    };

    const updateItem = (itemIdx: number, key: string, value: any) => {
        const newItems = [...draft.items];
        newItems[itemIdx] = { ...newItems[itemIdx], [key]: value };
        setDraft(prev => ({ ...prev, items: newItems }));
    };

    const addItem = () => {
        setDraft(prev => ({
            ...prev,
            items: [...prev.items, { item_name: '', qty: 0, item_rate: 0, taxable_value: 0 }]
        }));
    };

    const removeItem = (itemIdx: number) => {
        setDraft(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== itemIdx)
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(index, draft);
            onClose();
        } catch (e) {
            showError('Failed to update invoice');
        } finally {
            setSaving(false);
        }
    };

    const headerTabs: SalesVoucherTab[] = [
        'Invoice Details',
        'Payment Details',
        'Dispatch Details',
        'E-Invoice & E-Way Bill Details'
    ];

    const itemTabs: SalesVoucherTab[] = [
        'Item & Tax Details',
        'Foreign Currency (Item & Tax Details)'
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex-shrink-0">
                    <div>
                        <h2 className="text-lg font-bold">Edit Sales Invoice</h2>
                        <p className="text-blue-100 text-xs mt-0.5">Invoice No: {draft.header.sales_invoice_no || draft.invoice_no || 'Pending'}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                        <Icon name="x" className="w-6 h-6" />
                    </button>
                </div>

                {/* Main Tabs */}
                <div className="flex border-b px-6 bg-gray-50/50">
                    <button
                        onClick={() => {
                            setActiveMainTab('header');
                            setActiveSubTab('Invoice Details');
                        }}
                        className={`px-6 py-3 text-sm font-semibold transition-all border-b-2 ${activeMainTab === 'header' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Header Details
                    </button>
                    <button
                        onClick={() => {
                            setActiveMainTab('items');
                            setActiveSubTab('Item & Tax Details');
                        }}
                        className={`px-6 py-3 text-sm font-semibold transition-all border-b-2 ${activeMainTab === 'items' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Line Items ({draft.items.length})
                    </button>
                </div>

                {/* Sub Tabs */}
                <div className="flex border-b px-6 bg-white gap-2 overflow-x-auto scrollbar-hide">
                    {(activeMainTab === 'header' ? headerTabs : itemTabs).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveSubTab(tab)}
                            className={`px-4 py-2 text-xs font-bold whitespace-nowrap transition-all border-b-2 mt-1 ${activeSubTab === tab ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 p-6 bg-gray-50/30">
                    {activeMainTab === 'header' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
                            {SALES_VOUCHER_COLUMNS_BY_TAB[activeSubTab].map(col => (
                                <div key={col.key} className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                        {col.label}
                                        {col.required && <span className="text-red-500 font-bold">*</span>}
                                    </label>
                                    <input
                                        type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all hover:border-gray-300"
                                        value={draft.header[col.key] ?? ''}
                                        onChange={e => {
                                            let val: any = e.target.value;
                                            if (col.type === 'number') val = parseFloat(val) || 0;
                                            updateHeader(col.key, val);
                                            // Special Case:Sync Invoice No
                                            if (col.key === 'sales_invoice_no') setDraft(d => ({ ...d, invoice_no: val }));
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-white p-3 rounded-lg border shadow-sm">
                                <span className="text-xs text-gray-500 font-medium italic">
                                    Displaying fields for: <span className="font-bold text-gray-700">{activeSubTab}</span>
                                </span>
                                <button onClick={addItem} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-200">
                                    + Add New Item
                                </button>
                            </div>

                            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                                <table className="w-full border-collapse">
                                    <thead className="bg-gray-100">
                                        <tr>
                                            {SALES_VOUCHER_COLUMNS_BY_TAB[activeSubTab].map(col => (
                                                <th key={col.key} className="p-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b">
                                                    {col.label}
                                                </th>
                                            ))}
                                            <th className="p-3 text-center border-b w-12"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {draft.items.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-blue-50/30 transition-colors group">
                                                {SALES_VOUCHER_COLUMNS_BY_TAB[activeSubTab].map(col => (
                                                    <td key={col.key} className="p-2 border-r last:border-r-0">
                                                        <input
                                                            type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                                                            className={`w-full p-1 border-none focus:ring-0 text-xs ${col.type === 'number' ? 'text-right' : ''}`}
                                                            value={item[col.key] ?? ''}
                                                            placeholder={col.type === 'number' ? '0' : ''}
                                                            onChange={e => {
                                                                let val: any = e.target.value;
                                                                if (col.type === 'number') val = parseFloat(val) || 0;
                                                                updateItem(idx, col.key, val);
                                                            }}
                                                        />
                                                    </td>
                                                ))}
                                                <td className="p-2 text-center">
                                                    <button onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all">
                                                        <Icon name="trash" className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 flex-shrink-0">
                    <p className="text-xs text-gray-500">
                        <span className="font-bold text-orange-500 mr-1">Note:</span> Saving will re-validate the customer against the master.
                    </p>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100">
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-6 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center gap-2"
                        >
                            {saving && <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>}
                            Save & Revalidate
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    switch (status) {
        case 'READY':
            return <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold border border-emerald-200 uppercase">Ready ✅</span>;
        case 'CUSTOMER_MISSING':
            return <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold border border-amber-200 uppercase">No Customer ❌</span>;
        case 'GSTIN_CONFLICT':
            return <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold border border-red-200 uppercase">GSTIN Conflict ❗</span>;
        case 'VALIDATION_FAILED':
            return <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold border border-red-200 uppercase">Fail ❌</span>;
        default:
            return <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-[10px] font-bold border border-gray-200 uppercase">{status}</span>;
    }
};

interface SalesExcelUploadWorkflowProps {
    onClose?: () => void;
}

const SalesExcelUploadWorkflow: React.FC<SalesExcelUploadWorkflowProps> = ({ onClose }) => {
    const [invoices, setInvoices] = useState<SalesInvoiceGroup[]>([]);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [finalizing, setFinalizing] = useState(false);
    const [editModal, setEditModal] = useState<{ invoice: SalesInvoiceGroup; index: number } | null>(null);
    const [createCustomerFor, setCreateCustomerFor] = useState<SalesInvoiceGroup | null>(null);
    const [summary, setSummary] = useState<any>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setSummary(null); // Clear old summary on new upload
        try {
            const res = await apiService.uploadSalesExcelWorkflow(file);
            setInvoices(res.invoices);
            setSessionId(res.session_id);
            showSuccess(`Successfully parsed ${res.invoices.length} invoices`);
        } catch (error) {
            showError('Excel parsing failed');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleUpdate = async (index: number, updated: SalesInvoiceGroup) => {
        if (!sessionId) return;
        try {
            const res = await apiService.updateSalesWorkflowInvoice({
                session_id: sessionId,
                index,
                invoice: updated
            });
            setInvoices(res.invoices);
            showSuccess('Invoice updated and revalidated');
        } catch (error) {
            showError('Update failed');
            throw error;
        }
    };

    const handleCreateCustomer = async (customerData: any) => {
        if (!createCustomerFor || !sessionId) return;
        try {
            await apiService.createCustomerFromSalesWorkflow(customerData);
            showSuccess('Customer created successfully. Revalidating all records...');
            setCreateCustomerFor(null);

            // Revalidate everything to update matching statuses
            const res = await apiService.updateSalesWorkflowInvoice({
                session_id: sessionId,
                revalidate_all: true
            });
            setInvoices(res.invoices);
        } catch (error: any) {
            showError(error?.message || 'Customer creation failed');
        }
    };

    const handleFinalize = async () => {
        if (!sessionId) return;
        setFinalizing(true);
        try {
            const res = await apiService.finalizeSalesWorkflow(sessionId);
            setSummary(res.summary);
            setInvoices(res.remaining);
            if (res.summary.created > 0) {
                showSuccess(`Created ${res.summary.created} vouchers successfully!`);
            } else {
                showInfo('No vouchers were created. Check for errors.');
            }
        } catch (error) {
            showError('Finalization failed');
        } finally {
            setFinalizing(false);
        }
    };

    const counts = {
        total: invoices.length,
        ready: invoices.filter(i => i.status === 'READY').length,
        missing: invoices.filter(i => i.status === 'CUSTOMER_MISSING').length,
        error: invoices.filter(i => i.status === 'VALIDATION_FAILED' || i.status === 'GSTIN_CONFLICT').length
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
            {/* Header / Toolbar */}
            <div className="bg-white border-b px-6 py-4 flex flex-wrap items-center justify-between gap-4 shadow-sm z-10">
                <div className="flex items-center gap-4">
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 mr-2"
                            title="Go Back"
                        >
                            <Icon name="arrow-left" className="w-5 h-5" />
                        </button>
                    )}
                    <div className="p-2 bg-blue-50 rounded-lg">
                        <Icon name="file-text" className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-gray-900 tracking-tight">Sales Excel Workflow</h1>
                        <p className="text-[11px] text-gray-500 font-medium">Group by Invoice → Validate Customer → Upload Vouchers</p>
                    </div>

                    {invoices.length > 0 && (
                        <div className="ml-6 flex items-center gap-3">
                            <div className="flex flex-col">
                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total</span>
                                <span className="text-sm font-bold text-gray-700">{counts.total}</span>
                            </div>
                            <div className="w-px h-6 bg-gray-200"></div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">Ready</span>
                                <span className="text-sm font-bold text-emerald-600">{counts.ready}</span>
                            </div>
                            <div className="w-px h-6 bg-gray-200"></div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">Missing</span>
                                <span className="text-sm font-bold text-amber-600">{counts.missing}</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />

                    <button
                        onClick={async () => {
                            try {
                                const blob = await apiService.getSalesExcelTemplate();
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'Sales_Excel_Template.xlsx';
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                            } catch (e) {
                                showError('Failed to download template');
                            }
                        }}
                        className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
                    >
                        <Icon name="download" className="w-4 h-4" />
                        Download Template
                    </button>



                    {invoices.length > 0 && (
                        <button
                            onClick={handleFinalize}
                            disabled={finalizing || counts.ready === 0}
                            className="px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            {finalizing ? <Icon name="loader" className="w-4 h-4 animate-spin" /> : <Icon name="check-circle" className="w-4 h-4" />}
                            Finalize Invoices ({counts.ready})
                        </button>
                    )}
                </div>
            </div>

            {/* Hint Bar */}
            {counts.missing > 0 && (
                <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-3 animate-in fade-in slide-in-from-top-1 duration-300">
                    <div className="p-1 bg-amber-100 rounded">
                        <Icon name="alert-circle" className="w-4 h-4 text-amber-600" />
                    </div>
                    <span className="text-[11px] text-amber-800 font-medium">
                        <strong>Action Required:</strong> {counts.missing} invoices have missing customers. Use "Create Customer" or edit to link to existing masters.
                    </span>
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 overflow-auto p-6">
                {summary && (
                    <div className="mb-8 p-6 bg-white border rounded-xl shadow-sm animate-in zoom-in duration-300">
                        <div className="flex items-center justify-between mb-4 border-b pb-4">
                            <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                                <Icon name="bar-chart-2" className="w-5 h-5 text-indigo-500" />
                                Last Upload Summary
                            </h2>
                            <button onClick={() => setSummary(null)} className="text-gray-400 hover:text-gray-600">
                                <Icon name="x" className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                                <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest mb-1">Created</p>
                                <p className="text-2xl font-black text-emerald-700">{summary.created}</p>
                            </div>
                            <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                                <p className="text-[10px] text-red-600 font-bold uppercase tracking-widest mb-1">Failed</p>
                                <p className="text-2xl font-black text-red-700">{summary.failed}</p>
                            </div>
                            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Skipped</p>
                                <p className="text-2xl font-black text-gray-600">{summary.skipped || 0}</p>
                            </div>
                            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                                <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest mb-1">Total</p>
                                <p className="text-2xl font-black text-indigo-700">{summary.total}</p>
                            </div>
                        </div>

                        {summary.errors && summary.errors.length > 0 && (
                            <div className="mt-6">
                                <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider mb-2">Errors Details</h3>
                                <div className="space-y-2">
                                    {summary.errors.map((err: any, idx: number) => (
                                        <div key={idx} className="p-3 bg-red-50/30 border border-red-100 rounded-lg text-[11px] text-red-700 flex flex-col gap-1">
                                            <span className="font-bold">Invoice #{err.invoice_no}:</span>
                                            <span className="font-mono">{typeof err.errors === 'string' ? err.errors : JSON.stringify(err.errors)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {invoices.length === 0 && !uploading && !summary ? (
                    <div className="h-full flex flex-col items-center justify-center text-center py-20 bg-white rounded-2xl border-2 border-dashed border-slate-200">
                        <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-6">
                            <Icon name="file-spreadsheet" className="w-10 h-10" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-800">No Invoices Uploaded</h2>
                        <p className="text-slate-400 mt-2 max-w-sm">Upload a Sales Excel file to begin the validation and voucher creation workflow.</p>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="mt-8 px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 active:scale-95"
                        >
                            Select Excel File
                        </button>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-900 text-white">
                                <tr>
                                    <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest w-12">#</th>
                                    <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest">Customer & Invoice</th>
                                    <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest">Branch / Location</th>
                                    <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest">Amount</th>
                                    <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-widest">Status</th>
                                    <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-widest">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {invoices.map((inv, idx) => (
                                    <tr key={idx} className={`hover:bg-slate-50/80 transition-colors ${inv.status === 'READY' ? '' : 'bg-amber-50/20'}`}>
                                        <td className="px-6 py-4 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-800">{inv.header.customer_name || '—'}</span>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">INV-{inv.invoice_no}</span>
                                                    <span className="text-[10px] text-slate-400 font-medium font-mono">{inv.header.gstin || 'No GSTIN'}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-xs font-medium text-slate-600">{inv.header.customer_branch || '—'}</span>
                                            {inv.header.invoice_date && <p className="text-[10px] text-slate-400 mt-0.5">📅 {inv.header.invoice_date}</p>}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="font-bold text-slate-800">₹ {(inv.header.total_invoice_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                            <p className="text-[10px] text-slate-400 mt-0.5">{inv.items.length} items</p>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <StatusBadge status={inv.status} />
                                            {inv.message && <p className="text-[10px] text-red-400 mt-1 max-w-[120px] mx-auto truncate" title={inv.message}>{inv.message}</p>}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => setEditModal({ invoice: inv, index: idx })}
                                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                    title="Edit Record"
                                                >
                                                    <Icon name="edit-3" className="w-4 h-4" />
                                                </button>

                                                {inv.status === 'CUSTOMER_MISSING' && (
                                                    <button
                                                        onClick={() => setCreateCustomerFor(inv)}
                                                        className="px-3 py-1.5 bg-orange-50 text-orange-600 hover:bg-orange-100 text-[10px] font-bold rounded-lg border border-orange-200 transition-all flex items-center gap-1.5"
                                                    >
                                                        <Icon name="user-plus" className="w-3.5 h-3.5" />
                                                        Create Customer
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() => setInvoices(prev => prev.filter((_, i) => i !== idx))}
                                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                    title="Remove from list"
                                                >
                                                    <Icon name="trash-2" className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modals */}
            {editModal && (
                <SalesEditModal
                    invoice={editModal.invoice}
                    index={editModal.index}
                    onClose={() => setEditModal(null)}
                    onSave={handleUpdate}
                />
            )}

            {createCustomerFor && (
                <CreateCustomerModal
                    onClose={() => setCreateCustomerFor(null)}
                    onSave={handleCreateCustomer}
                    initialData={{
                        customer_name: createCustomerFor.header.customer_name,
                        gstin: createCustomerFor.header.gstin,
                        address: createCustomerFor.header.bill_to_address_1 || '',
                        state: createCustomerFor.header.bill_to_state || '',
                        branch: createCustomerFor.header.customer_branch,
                        email: '',
                        phone: createCustomerFor.header.contact || ''
                    }}
                />
            )}
        </div>
    );
};

export default SalesExcelUploadWorkflow;
