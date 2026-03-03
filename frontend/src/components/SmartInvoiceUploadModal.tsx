/**
 * BulkInvoiceUploadModal.tsx
 * 
 * Implements the strict 3-step Bulk Invoice Upload flow:
 *  STEP 1 — BULK SCAN        → POST /api/bulk-invoice/scan/
 *  STEP 2 — REVIEW & RESOLVE → POST /api/bulk-invoice/update-vendor/
 *  STEP 3 — FINALIZE & SAVE  → POST /api/bulk-invoice/finalize/
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { httpClient } from '../services/httpClient';
import { apiService } from '../services/api';
import { showError, showSuccess, showInfo } from '../utils/toast';
import CreateVendorModal from './CreateVendorModal';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type VendorStatus = 'FOUND' | 'MISSING' | 'RESOLVED' | 'ERROR';

interface ScanResult {
    file_name: string;
    vendor_status: VendorStatus;
    vendor_id: number | null;
    vendor_name: string;
    gstin: string;
    address: string;
    city: string;
    state: string;
    error?: string;
}

interface FinalizeError {
    [file_name: string]: string;
}

interface FinalizeResult {
    success: boolean;
    total: number;
    created: number;
    failed: number;
    errors: FinalizeError;
}

// ─────────────────────────────────────────────────────────────────────────────
// Components ──────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// (InlineVendorCreatePanel removed to use shared CreateVendorModal)

// ─────────────────────────────────────────────────────────────────────────────
// Status Badge
// ─────────────────────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: VendorStatus }> = ({ status }) => {
    const cfg: Record<VendorStatus, { label: string; cls: string; icon: string }> = {
        FOUND: {
            label: 'Vendor Found',
            cls: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
            icon: '✅',
        },
        RESOLVED: {
            label: 'Vendor Resolved',
            cls: 'bg-blue-100 text-blue-800 border border-blue-300',
            icon: '🔗',
        },
        MISSING: {
            label: 'Vendor Missing',
            cls: 'bg-amber-100 text-amber-800 border border-amber-300',
            icon: '⚠️',
        },
        ERROR: {
            label: 'Extraction Error',
            cls: 'bg-red-100 text-red-800 border border-red-300',
            icon: '❌',
        },
    };
    const { label, cls, icon } = cfg[status] || cfg.ERROR;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
            {icon} {label}
        </span>
    );
};

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

    // State
    const [step, setStep] = useState<ModalStep>('upload');
    const [dragOver, setDragOver] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [scanId, setScanId] = useState<string>('');
    const [scanResults, setScanResults] = useState<ScanResult[]>([]);
    const [scanProgress, setScanProgress] = useState(0);       // 0-100
    const [scanCurrentFile, setScanCurrentFile] = useState('');
    const [finalizeResult, setFinalizeResult] = useState<FinalizeResult | null>(null);
    const [finalizing, setFinalizing] = useState(false);
    const [resolvingRow, setResolvingRow] = useState<ScanResult | null>(null);
    const [estimatedExtractionTime, setEstimatedExtractionTime] = useState<number | null>(null);
    const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

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
        const files = Array.from(e.dataTransfer.files).filter(
            f => f.type === 'application/pdf' || f.type.startsWith('image/')
        );
        if (files.length > 0) setSelectedFiles(prev => [...prev, ...files]);
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setSelectedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
        }
        e.target.value = '';
    };

    const removeFile = (idx: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
    };

    // ── STEP 1 — SCAN ────────────────────────────────────────────────────────

    const handleScan = async () => {
        if (selectedFiles.length === 0) {
            showError('Please select at least one invoice file.');
            return;
        }

        setStep('scanning');
        setScanProgress(5);
        setScanCurrentFile('Preparing upload…');

        // Calculate estimated extraction time
        try {
            const avgRes = await apiService.getExtractionAverageTime();
            const avgTime = avgRes?.average_time_per_invoice || 3.85;
            setEstimatedExtractionTime(avgTime * selectedFiles.length);
        } catch (error) {
            console.error("Failed to fetch avg extraction time", error);
            setEstimatedExtractionTime(3.85 * selectedFiles.length);
        }

        try {
            const formData = new FormData();
            selectedFiles.forEach(f => formData.append('files', f));
            formData.append('voucher_type', voucherType);

            setScanProgress(20);
            setScanCurrentFile(`Scanning ${selectedFiles.length} file(s) with AI…`);

            const res: any = await httpClient.postFormData('/api/bulk-invoice/scan/', formData);

            setScanProgress(90);
            setScanCurrentFile('Processing results…');

            if (res?.scan_id && Array.isArray(res?.results)) {
                setScanId(res.scan_id);
                setScanResults(res.results);
                setScanProgress(100);
                setStep('review');
                const missingCount = res.results.filter((r: ScanResult) => r.vendor_status === 'MISSING').length;
                const errorCount = res.results.filter((r: ScanResult) => r.vendor_status === 'ERROR').length;
                if (missingCount > 0) {
                    showInfo(`${missingCount} invoice(s) have unknown vendors. Please resolve before finalizing.`);
                }
                if (errorCount > 0) {
                    showError(`${errorCount} invoice(s) failed to extract. Check the table for details.`);
                }
            } else {
                throw new Error('Invalid response from scan API.');
            }
        } catch (err: any) {
            const msg = err?.response?.data?.error || err?.message || 'Scan failed. Please try again.';
            showError(`❌ Scan failed: ${msg}`);
            setStep('upload');
        } finally {
            setEstimatedExtractionTime(null);
        }
    };

    // ── STEP 2 — RESOLVE VENDOR ──────────────────────────────────────────────

    const handleResolve = (fileName: string, vendorId: number, vendorName: string) => {
        setScanResults(prev => prev.map(r =>
            r.file_name === fileName
                ? { ...r, vendor_status: 'RESOLVED', vendor_id: vendorId, vendor_name: vendorName }
                : r
        ));
        setResolvingRow(null);
        showSuccess(`Vendor resolved for ${fileName}`);
    };

    const handleSaveVendor = async (vendorData: any) => {
        if (!resolvingRow) return;

        try {
            // 1. Create vendor via existing purchase vendor create API
            const res: any = await httpClient.post('/api/purchase/vendors/create/', vendorData);

            if (res?.status === 'CREATED' && res?.vendor_id) {
                // 2. Update the cached scan record with the new vendor
                await httpClient.post('/api/bulk-invoice/update-vendor/', {
                    scan_id: scanId,
                    file_name: resolvingRow.file_name,
                    vendor_id: res.vendor_id,
                });

                // 3. Update local UI
                handleResolve(resolvingRow.file_name, res.vendor_id, vendorData.vendor_name);
                showSuccess('Vendor Created and Invoice Resolved!');
            } else {
                showError(res?.error || 'Failed to create vendor');
            }
        } catch (err: any) {
            const msg = err?.response?.data?.error || err?.message || 'Creation failed.';
            showError(msg);
        }
    };

    // ── STEP 3 — FINALIZE ────────────────────────────────────────────────────

    const canFinalize = scanResults.every(r =>
        r.vendor_status === 'FOUND' || r.vendor_status === 'RESOLVED'
    );

    const handleFinalize = async () => {
        if (!canFinalize) {
            showError('Please resolve all missing vendors before finalizing.');
            return;
        }
        if (!scanId) {
            showError('Scan session lost. Please re-upload.');
            return;
        }

        setFinalizing(true);
        setStep('finalizing');

        try {
            const res: any = await httpClient.post('/api/bulk-invoice/finalize/', {
                scan_id: scanId,
            });

            setFinalizeResult(res);
            setStep('done');

            if (res.created > 0) {
                showSuccess(`✅ ${res.created} voucher(s) created successfully!`);
            }
            if (res.failed > 0) {
                showError(`⚠️ ${res.failed} voucher(s) failed. Check the summary below.`);
            }

            onFinalized?.(res);
        } catch (err: any) {
            const msg =
                err?.response?.data?.error || err?.message || 'Finalize failed.';
            showError(`❌ ${msg}`);
            setStep('review');
        } finally {
            setFinalizing(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const missingCount = scanResults.filter(r => r.vendor_status === 'MISSING').length;
    const resolvedCount = scanResults.filter(r => r.vendor_status === 'RESOLVED').length;
    const foundCount = scanResults.filter(r => r.vendor_status === 'FOUND').length;
    const errorCount = scanResults.filter(r => r.vendor_status === 'ERROR').length;

    return (
        <>
            {/* Resolve Section (Shared CreateVendorModal) */}
            {resolvingRow && (
                <CreateVendorModal
                    initialData={{
                        vendor_name: resolvingRow.vendor_name,
                        gstin: resolvingRow.gstin,
                        address: resolvingRow.address,
                        state: resolvingRow.state,
                        branch: resolvingRow.city
                    }}
                    onClose={() => setResolvingRow(null)}
                    onSave={handleSaveVendor}
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
                                <h2 className="text-lg font-bold text-white">AI Invoice Smart Upload</h2>
                                <p className="text-xs text-indigo-200">
                                    {step === 'upload' && 'Select one or more invoices to scan'}
                                    {step === 'scanning' && 'AI extracting invoice data…'}
                                    {step === 'review' && `${scanResults.length} invoices scanned · Review & resolve vendors`}
                                    {step === 'finalizing' && `Creating ${voucherType} vouchers…`}
                                    {step === 'done' && 'Processing complete'}
                                </p>
                            </div>
                        </div>

                        {/* Step Indicator */}
                        <div className="flex items-center gap-1 mr-4">
                            {(['upload', 'review', 'done'] as const).map((s, idx) => {
                                const labels = ['1. Select', '2. Review', '3. Save'];
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
                    <div className="flex-1 overflow-y-auto">
                        {/* ────── STEP: UPLOAD ────── */}
                        {step === 'upload' && (
                            <div className="p-6 space-y-6">
                                <div
                                    onDrop={handleDrop}
                                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                    onDragLeave={() => setDragOver(false)}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all
                                        ${dragOver ? 'border-indigo-500 bg-indigo-50 scale-[1.01]' : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/40'}`}
                                >
                                    <input ref={fileInputRef} type="file" multiple accept=".pdf,image/*" className="hidden" onChange={handleFileChange} />
                                    <div className="flex flex-col items-center gap-3">
                                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl transition-all ${dragOver ? 'bg-indigo-100 scale-110' : 'bg-gray-100'}`}>📄</div>
                                        <div>
                                            <p className="text-base font-semibold text-gray-700 font-bold">{dragOver ? 'Drop files here!' : 'Drag & drop invoices here'}</p>
                                            <p className="text-sm text-gray-500 mt-1 italic">or click to browse · PDF and image files supported</p>
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
                                <div className="grid grid-cols-4 gap-3">
                                    {[
                                        { label: 'Total', value: scanResults.length, color: 'indigo', icon: '📋' },
                                        { label: 'Found', value: foundCount + resolvedCount, color: 'emerald', icon: '✅' },
                                        { label: 'Missing', value: missingCount, color: 'amber', icon: '⚠️' },
                                        { label: 'Errors', value: errorCount, color: 'red', icon: '❌' },
                                    ].map(card => (
                                        <div key={card.label} className={`p-3 rounded-xl border text-center font-bold ${card.color === 'indigo' ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : card.color === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : card.color === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                                            <div className="text-xl">{card.icon}</div>
                                            <div className="text-2xl mt-1">{card.value}</div>
                                            <div className="text-xs opacity-70 mt-0.5">{card.label}</div>
                                        </div>
                                    ))}
                                </div>

                                {missingCount > 0 && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2 text-sm text-amber-800 font-medium">
                                        <span className="flex-shrink-0 text-base">⚠️</span>
                                        <span><strong>{missingCount} invoice(s)</strong> have unknown vendors. Resolve before saving.</span>
                                    </div>
                                )}

                                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr className="text-gray-600 text-xs uppercase font-bold">
                                                <th className="px-4 py-3 text-left w-8">#</th>
                                                <th className="px-4 py-3 text-left">File Name</th>
                                                <th className="px-4 py-3 text-left">Vendor</th>
                                                <th className="px-4 py-3 text-left">GSTIN</th>
                                                <th className="px-4 py-3 text-left">Status</th>
                                                <th className="px-4 py-3 text-center">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {scanResults.map((row, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50/50">
                                                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{idx + 1}</td>
                                                    <td className="px-4 py-3 font-medium text-gray-700 truncate max-w-[150px]">{row.file_name}</td>
                                                    <td className="px-4 py-3 font-bold text-gray-900">{row.vendor_name || '—'}</td>
                                                    <td className="px-4 py-3 font-mono text-xs opacity-70">{row.gstin || '—'}</td>
                                                    <td className="px-4 py-3"><StatusBadge status={row.vendor_status} /></td>
                                                    <td className="px-4 py-3 text-center">
                                                        {row.vendor_status === 'MISSING' ? (
                                                            <button onClick={() => setResolvingRow(row)} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 shadow-sm">Create Vendor</button>
                                                        ) : (
                                                            <span className="text-emerald-500 font-bold text-xs uppercase italic tracking-wider">Ready</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
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
                                    <h3 className="text-2xl font-bold">{finalizeResult.failed === 0 ? 'Upload Success!' : 'Partial Success'}</h3>
                                    <p className="mt-1 opacity-90">{finalizeResult.created} of {finalizeResult.total} vouchers created</p>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center"><div className="text-2xl font-bold">{finalizeResult.total}</div><div className="text-xs text-gray-500">Total</div></div>
                                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center"><div className="text-2xl font-bold text-emerald-700">{finalizeResult.created}</div><div className="text-xs text-gray-500">Success</div></div>
                                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center"><div className="text-2xl font-bold text-red-700">{finalizeResult.failed}</div><div className="text-xs text-gray-500">Failed</div></div>
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
                                        <button onClick={handleFinalize} disabled={!canFinalize || finalizing} className="px-8 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-sm font-bold shadow-xl disabled:opacity-40 flex items-center gap-2">
                                            {finalizing ? 'Saving...' : 'Finalize & Save Vouchers'}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default BulkInvoiceUploadModal;
