import React, { useState, useRef, useEffect } from 'react';
import { httpClient } from '../services/httpClient';
import { showError, showSuccess } from '../utils/toast';
import { useSubscriptionUsage } from '../hooks/useSubscriptionUsage';
import { EXACT_TALLY_MASTER_HEADERS } from '../services/mappingEngine';

// Improved type declaration for global XLSX library
declare const XLSX: {
    utils: {
        json_to_sheet: (data: Record<string, unknown>[], opts?: { header: string[] }) => unknown;
        book_new: () => unknown;
        book_append_sheet: (wb: unknown, ws: unknown, name: string) => void;
    };
    writeFile: (wb: unknown, filename: string) => void;
};

// ────────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────────

interface MasterResult {
    record: Record<string, string>;
}

interface AIExtractionResponse {
    success?: boolean;
    error?: string;
    data?: Record<string, unknown> | { master: Record<string, unknown> };
    reply?: string;
}

interface TallyMasterScannerModalProps {
    onClose: () => void;
    onUpload?: (data: Record<string, string | null>[]) => void;
    initialFiles?: FileList | null;
}

// ────────────────────────────────────────────────────────────────────────────────
// Icon
// ────────────────────────────────────────────────────────────────────────────────

const Icon: React.FC<{ name: string; className?: string }> = ({ name, className = '' }) => {
    const icons: Record<string, string> = {
        upload: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
        download: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
        x: 'M6 18L18 6M6 6l12 12',
        spinner: 'M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z',
        'check-circle': 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
        file: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    };
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icons[name] || icons.file} />
        </svg>
    );
};

// ────────────────────────────────────────────────────────────────────────────────
// All master columns shown in the table
// ────────────────────────────────────────────────────────────────────────────────

const ALL_MASTER_COLUMNS = EXACT_TALLY_MASTER_HEADERS;

// ────────────────────────────────────────────────────────────────────────────────
// Normalize AI result → strict master record
// ────────────────────────────────────────────────────────────────────────────────

const normalizeMasterResult = (raw: Record<string, unknown>): MasterResult => {
    const record: Record<string, string> = {};

    // Initialize all approved columns to ''
    EXACT_TALLY_MASTER_HEADERS.forEach(col => { record[col] = ''; });

    // Map strict keys exactly
    Object.entries(raw).forEach(([key, val]) => {
        if (EXACT_TALLY_MASTER_HEADERS.includes(key)) {
            const strVal = (val !== undefined && val !== null) ? String(val) : '';
            record[key] = strVal; // Do NOT trim trailing spaces
        }
    });

    return { record };
};

// ────────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────────

const TallyMasterScannerModal: React.FC<TallyMasterScannerModalProps> = ({ onClose, onUpload, initialFiles }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const hasAutoProcessed = useRef(false);
    const isMounted = useRef(true);

    const [masterResults, setMasterResults] = useState<MasterResult[]>([]);
    const [isExtracting, setIsExtracting] = useState(!!(initialFiles && initialFiles.length > 0));
    const [uploadedFileNames, setUploadedFileNames] = useState<string[]>([]);

    const { incrementUsage, subscriptionUsage } = useSubscriptionUsage();

    // Prevent state updates if component unmounts
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    const processFiles = async (files: FileList) => {
        if (!files || files.length === 0) return;
        setIsExtracting(true);

        try {
            const allResults: MasterResult[] = [];
            let batchProcessedCount = 0;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const formData = new FormData();
                formData.append('file', file);

                if (!isMounted.current) break; // Break early if modal closed

                try {
                    const result = await httpClient.postFormData<AIExtractionResponse>('/api/ai/extract-master/', formData);

                    if (result.error) throw new Error(result.error);

                    if (result.success && result.data) {
                        incrementUsage(1);
                        batchProcessedCount++;
                        const dataRecord = result.data as Record<string, unknown>;
                        const flat: Record<string, unknown> = (dataRecord.master as Record<string, unknown>) || dataRecord || {};
                        allResults.push(normalizeMasterResult(flat));
                    } else if (result.reply) {
                        incrementUsage(1);
                        batchProcessedCount++;
                        let parsedData: Record<string, unknown>;
                        try {
                            const cleanJson = result.reply.replace(/```json\n?|\n?```/g, '').trim();
                            parsedData = JSON.parse(cleanJson);
                        } catch {
                            const jsonMatch = result.reply.match(/\{[\s\S]*\}/);
                            if (jsonMatch) parsedData = JSON.parse(jsonMatch[0]);
                            else throw new Error('No JSON found in AI response');
                        }
                        const flat: Record<string, unknown> = (parsedData.master as Record<string, unknown>) || parsedData || {};
                        allResults.push(normalizeMasterResult(flat));
                    }
                } catch (err) {
                    console.error(`[TallyMasterScanner] ${file.name} failed:`, err);
                    if (isMounted.current) showError(`Extraction failed for ${file.name}`);
                }
            }

            if (isMounted.current && allResults.length > 0) {
                setMasterResults(prev => [...prev, ...allResults]);
            }
        } catch (error) {
            console.error('[TallyMasterScanner] Batch error:', error);
            if (isMounted.current) {
                showError(`❌ Extraction Failed: ${(error as Error).message}`);
            }
        } finally {
            if (isMounted.current) {
                setIsExtracting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        }
    };

    // Auto-process initial files on mount or when they arrive
    useEffect(() => {
        if (initialFiles && initialFiles.length > 0 && !hasAutoProcessed.current) {
            hasAutoProcessed.current = true;
            const names = Array.from(initialFiles).map((f) => f.name);
            setUploadedFileNames((prev) => [...prev, ...names]);
            processFiles(initialFiles);
        }
    }, [initialFiles]);

    // ── Actions ──────────────────────────────────────────────────────────────────
    const handleUploadToFinpixe = () => {
        if (!onUpload) return;
        if (masterResults.length === 0) { showError('No data to upload.'); return; }

        const allRows = masterResults.map(res => {
            const row: Record<string, string | null> = {};
            ALL_MASTER_COLUMNS.forEach(col => {
                const val = res.record[col];
                row[col] = (val !== undefined && val !== null && val !== '') ? val : null;
            });
            return row;
        });

        onUpload(allRows);
        showSuccess(`✅ ${allRows.length} master record(s) uploaded.`);
        setUploadedFileNames([]);
        onClose();
    };

    const handleDownloadExcel = () => {
        if (masterResults.length === 0) return;
        const allRows = masterResults.map(res => {
            const row: Record<string, string> = {};
            ALL_MASTER_COLUMNS.forEach(col => { row[col] = res.record[col] ?? ''; });
            return row;
        });
        const activeCols = ALL_MASTER_COLUMNS.filter(col => allRows.some(row => !!row[col]));
        const excelRows = allRows.map(row => {
            const out: Record<string, string> = {};
            activeCols.forEach(col => { out[col] = row[col]; });
            return out;
        });
        const ws = XLSX.utils.json_to_sheet(excelRows, { header: activeCols });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Tally Masters');
        XLSX.writeFile(wb, `Tally_Masters_${Date.now()}.xlsx`);
    };

    const handleDownloadCSV = () => {
        if (masterResults.length === 0) return;
        const allRows = masterResults.map(res => {
            const row: Record<string, string> = {};
            ALL_MASTER_COLUMNS.forEach(col => { row[col] = res.record[col] ?? ''; });
            return row;
        });
        const activeCols = ALL_MASTER_COLUMNS.filter(col => allRows.some(row => !!row[col]));
        let csv = activeCols.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';
        allRows.forEach(row => {
            csv += activeCols.map(col => `"${String(row[col] ?? '').replace(/"/g, '""')}"`).join(',') + '\n';
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Tally_Masters_${Date.now()}.csv`;
        a.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = e.target.files;
            const names = Array.from(files).map((f) => f.name);
            setUploadedFileNames((prev) => [...prev, ...names]);
            processFiles(files);
        }
    };

    const handleCellChange = (idx: number, col: string, value: string) => {
        setMasterResults(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], record: { ...next[idx].record, [col]: value } };
            return next;
        });
    };

    // ────────────────────────────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-[4px] shadow-none border border-slate-200 w-full max-w-7xl max-h-[90vh] flex flex-col">

                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b">
                    <div className="flex flex-col overflow-hidden mr-4 max-w-[80%]">
                        <h2 className="text-2xl font-bold text-gray-800 shrink-0">Tally Master Scanner</h2>
                        {uploadedFileNames.length > 0 ? (
                            <span
                                className="text-sm text-gray-500 truncate mt-1"
                                title={uploadedFileNames.join(", ")}
                            >
                                {uploadedFileNames.join(", ")}
                            </span>
                        ) : (
                            <p className="text-sm text-gray-500 mt-1">Extract ledger and party details using AI</p>
                        )}
                    </div>
                    <button onClick={() => { setUploadedFileNames([]); onClose(); }} className="text-gray-400 hover:text-gray-600 shrink-0">
                        <Icon name="x" className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-col min-h-0 p-6">

                    {/* Proactive Loading View (Full Central Spinner) */}
                    {isExtracting && masterResults.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                            <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
                                <Icon name="spinner" className="w-10 h-10 text-indigo-600 animate-spin" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900">Extracting Master Data</h3>
                            <p className="text-slate-500 max-w-sm mt-2">
                                Please wait while our AI analyzes your documents.
                                This usually takes 5-10 seconds per page.
                            </p>
                            <div className="mt-8 flex gap-2 justify-center">
                                <span className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce"></span>
                                <span className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce delay-75"></span>
                                <span className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce delay-150"></span>
                            </div>
                        </div>
                    ) : (
                        <>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,.pdf"
                                multiple
                                onChange={handleFileChange}
                                className="hidden"
                            />
                            {/* Actions Row (Shown only when there are results to avoid duplicate buttons) */}
                            {masterResults.length > 0 && (
                                <div className="mb-6 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={isExtracting}
                                            className={`inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-[4px] text-white ${isExtracting ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                                        >
                                            <Icon
                                                name={isExtracting ? 'spinner' : 'upload'}
                                                className={`w-5 h-5 mr-2 ${isExtracting ? 'animate-spin' : ''}`}
                                            />
                                            {isExtracting ? 'Extracting...' : 'Add More Files'}
                                        </button>

                                        {!isExtracting && (
                                            <div className="flex gap-2">
                                                <button onClick={handleDownloadExcel} className="inline-flex items-center px-4 py-3 border border-slate-200 text-sm font-medium rounded-[4px] text-slate-700 bg-white hover:bg-slate-50">
                                                    <Icon name="download" className="w-4 h-4 mr-2" />
                                                    Excel
                                                </button>
                                                <button onClick={handleDownloadCSV} className="inline-flex items-center px-4 py-3 border border-slate-200 text-sm font-medium rounded-[4px] text-slate-700 bg-white hover:bg-slate-50">
                                                    <Icon name="download" className="w-4 h-4 mr-2" />
                                                    CSV
                                                </button>
                                            </div>
                                        )}
                                    </div>


                                </div>
                            )}

                            {/* Data Table */}
                            {masterResults.length > 0 ? (
                                <div className="flex-1 flex flex-col min-h-0 border border-slate-200 rounded-[4px]">
                                    <div className="overflow-auto flex-1">
                                        <table className="min-w-full divide-y divide-gray-200 border-collapse">
                                            <thead className="sticky top-0 z-20 bg-slate-50">
                                                <tr>
                                                    {ALL_MASTER_COLUMNS.map((col) => (
                                                        <th
                                                            key={col}
                                                            className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-r border-slate-200 last:border-r-0 whitespace-nowrap min-w-[180px]"
                                                        >
                                                            {col}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-100">
                                                {masterResults.map((res, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50">
                                                        {ALL_MASTER_COLUMNS.map((col) => (
                                                            <td key={col} className="px-4 py-2 text-sm text-gray-900 border-r border-slate-50 last:border-r-0">
                                                                <input
                                                                    type="text"
                                                                    value={res.record[col] ?? ''}
                                                                    onChange={(e) => handleCellChange(idx, col, e.target.value)}
                                                                    className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm"
                                                                    placeholder="-"
                                                                />
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500">
                                        <span>📊 {masterResults.length} master record(s) extracted</span>
                                        <span>Review and edit fields before uploading</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 p-12 text-center">
                                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                                        <Icon name="file" className="w-8 h-8 text-slate-400" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-slate-900">Ready to Extract</h3>
                                    <p className="text-slate-500 max-w-sm mt-1">
                                        Select your ledger documents (Images or PDFs) to begin the AI extraction process.
                                    </p>
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="mt-6 inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-[4px] text-white bg-indigo-600 hover:bg-indigo-700"
                                    >
                                        <Icon name="upload" className="w-5 h-5 mr-2" />
                                        Select Files
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TallyMasterScannerModal;
