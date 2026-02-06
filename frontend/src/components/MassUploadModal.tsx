import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { MassUploadFile, ExtractedInvoiceData, Voucher, Ledger, StockItem, CompanyDetails, SalesPurchaseVoucher, PaymentReceiptVoucher, ContraVoucher, JournalVoucher, VoucherItem, ExtractedLineItem, VoucherType } from '../types';
import Icon from './Icon';
import { apiService } from '../services';
import { extractInvoiceDataWithRetry } from '../services/geminiService';

// Let TypeScript know that the XLSX library is available globally
declare const XLSX: any;

const isVoucher = (obj: any): obj is Voucher => {
    return obj && typeof obj.type === 'string' && typeof obj.date === 'string';
};

interface MassUploadModalProps {
    onClose: () => void;
    onComplete: (vouchers: Voucher[]) => void;
    ledgers: Ledger[];
    stockItems: StockItem[];
    companyDetails: CompanyDetails;
    voucherType: VoucherType;
}

const UploadDropzone: React.FC<{ onFilesSelected: (files: FileList) => void }> = ({ onFilesSelected }) => {
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDrag = (e: React.DragEvent, enter: boolean) => {
        e.preventDefault();
        e.stopPropagation();
        if (enter) setIsDragging(true);
        else setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onFilesSelected(e.dataTransfer.files);
            e.dataTransfer.clearData();
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onFilesSelected(e.target.files);
        }
    }

    return (
        <div
            className={`w-full h-full flex flex-col items-center justify-center border-4 border-dashed rounded-lg transition-colors ${isDragging ? 'border-teal-500 bg-teal-50' : 'border-slate-300 bg-slate-100'}`}
            onDragEnter={e => handleDrag(e, true)}
            onDragLeave={e => handleDrag(e, false)}
            onDragOver={e => handleDrag(e, true)}
            onDrop={handleDrop}
        >
            <Icon name="upload" className="w-16 h-16 text-slate-400 mb-4" />
            <h3 className="text-xl font-semibold text-slate-700">Drag & drop invoices or Excel files here</h3>
            <p className="text-slate-500 mt-1">Supports images (PNG, JPG), PDF files, and Excel files.</p>
            <button
                onClick={() => inputRef.current?.click()}
                className="mt-6 px-6 py-2 bg-teal-600 text-white font-semibold rounded-md hover:bg-teal-700"
            >
                Or click to browse
            </button>
            <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/png, image/jpeg, application/pdf, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                className="hidden"
                onChange={handleFileChange}
            />
        </div>
    );
};

const MassUploadModal: React.FC<MassUploadModalProps> = ({ onClose, onComplete, ledgers, stockItems, companyDetails, voucherType }) => {
    const [files, setFiles] = useState<MassUploadFile[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        const newUrls: Record<string, string> = {};
        files.forEach(f => {
            if (f.file.type.startsWith('image/') || f.file.type === 'application/pdf') {
                newUrls[f.id] = URL.createObjectURL(f.file);
            }
        });
        setPreviewUrls(newUrls);

        // Cleanup function
        return () => {
            Object.values(newUrls).forEach(url => URL.revokeObjectURL(url));
        };
    }, [files]);

    const processExcel = async (file: File): Promise<Voucher[]> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = XLSX.read(data, { type: 'array' });
                    let allVouchers: Voucher[] = [];
                    const processSheet = (sheetName: string, sheetType: string) => {
                        const sheet = workbook.Sheets[sheetName];
                        if (sheet) {
                            const rows = XLSX.utils.sheet_to_json(sheet);
                            rows.forEach((row: any) => {
                                try {
                                    let voucher: Partial<Voucher> = { date: new Date((row.date - (25567 + 1)) * 86400 * 1000).toISOString().split('T')[0], type: voucherType, narration: row.narration };
                                    if (sheetType === 'SalesPurchases') {
                                        voucher = { ...voucher, party: row.party, invoiceNo: row.invoiceNo, isInterState: row.isInterState === 'TRUE', items: JSON.parse(row.items) } as Partial<SalesPurchaseVoucher>;
                                        // Recalculate totals
                                        const { items, isInterState } = voucher as SalesPurchaseVoucher;
                                        const totals = items.reduce((acc, item) => {
                                            const stockItem = stockItems.find(si => si.name === item.name);
                                            const gstRate = stockItem?.gstRate || 0;
                                            const taxable = item.qty * item.rate;
                                            const tax = taxable * (gstRate / 100);
                                            item.taxableAmount = taxable;
                                            if (isInterState) {
                                                item.igstAmount = tax; item.cgstAmount = 0; item.sgstAmount = 0;
                                            } else {
                                                item.igstAmount = 0; item.cgstAmount = tax / 2; item.sgstAmount = tax / 2;
                                            }
                                            item.totalAmount = taxable + tax;
                                            acc.taxable += item.taxableAmount; acc.cgst += item.cgstAmount; acc.sgst += item.sgstAmount; acc.igst += item.igstAmount; acc.total += item.totalAmount;
                                            return acc;
                                        }, { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });
                                        (voucher as SalesPurchaseVoucher).totalTaxableAmount = totals.taxable;
                                        (voucher as SalesPurchaseVoucher).totalCgst = totals.cgst;
                                        (voucher as SalesPurchaseVoucher).totalSgst = totals.sgst;
                                        (voucher as SalesPurchaseVoucher).totalIgst = totals.igst;
                                        (voucher as SalesPurchaseVoucher).total = totals.total;
                                    } else if (sheetType === 'PaymentsReceipts') {
                                        voucher = { ...voucher, party: row.party, account: row.account, amount: row.amount } as PaymentReceiptVoucher;
                                    } else if (sheetType === 'Contra') {
                                        voucher = { ...voucher, fromAccount: row.fromAccount, toAccount: row.toAccount, amount: row.amount } as ContraVoucher;
                                    } else if (sheetType === 'Journal') {
                                        const entries = JSON.parse(row.entries);
                                        const { debit, credit } = entries.reduce((acc: any, e: any) => ({ debit: acc.debit + e.debit, credit: acc.credit + e.credit }), { debit: 0, credit: 0 });
                                        voucher = { ...voucher, entries, totalDebit: debit, totalCredit: credit } as JournalVoucher;
                                    }
                                    if (isVoucher(voucher)) allVouchers.push(voucher as Voucher);
                                } catch (error) {
                                    console.error('Error processing row:', error);
                                }
                            });
                        }
                    };
                    // Only process the sheet that matches the current voucherType
                    if (voucherType === 'Purchase' || voucherType === 'Sales') {
                        processSheet('SalesPurchases', 'SalesPurchases');
                    } else if (voucherType === 'Payment' || voucherType === 'Receipt') {
                        processSheet('PaymentsReceipts', 'PaymentsReceipts');
                    } else if (voucherType === 'Contra') {
                        processSheet('Contra', 'Contra');
                    } else if (voucherType === 'Journal') {
                        processSheet('Journal', 'Journal');
                    }
                    resolve(allVouchers);
                } catch (error) {
                    console.error('Error processing Excel:', error);
                    resolve([]);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    };

    const handleFileSelect = (selectedFiles: FileList) => {
        const newFiles: MassUploadFile[] = Array.from(selectedFiles)
            .filter(file => !files.some(f => f.id === `${file.name}-${file.lastModified}`))
            .map(file => ({
                id: `${file.name}-${file.lastModified}`,
                file,
                status: 'pending',
            }));
        setFiles(prev => [...prev, ...newFiles]);
    };

    const startProcessing = async () => {
        setIsProcessing(true);
        for (const file of files) {
            if (file.status === 'pending') {
                setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'processing' } : f));
                try {
                    if (file.file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.file.type === 'application/vnd.ms-excel') {
                        const vouchers = await processExcel(file.file);
                        setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'success', extractedData: vouchers } : f));
                    } else {
                        const data = await extractInvoiceDataWithRetry(file.file);
                        setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'success', extractedData: data } : f));
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown processing error.';
                    setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'error', error: message } : f));
                }
            }
        }
        setIsProcessing(false);
    };

    const calculateVoucherTotals = useCallback((extractedData: ExtractedInvoiceData, partyName: string) => {
        const partyLedger = ledgers.find(l => l.name.toLowerCase() === partyName.toLowerCase());
        const isInterState = (partyLedger?.state && companyDetails?.state)
            ? partyLedger.state.toLowerCase() !== companyDetails.state.toLowerCase()
            : false;

        const itemsWithTaxes = (extractedData.lineItems || []).filter(item => item != null).map(item => {
            const stockItem = stockItems.find(si => si.name.toLowerCase() === item.itemDescription.toLowerCase());
            const gstRate = stockItem?.gstRate || 0;
            const taxableAmount = item.quantity * item.rate;
            const tax = taxableAmount * (gstRate / 100);
            return {
                taxableAmount,
                cgstAmount: isInterState ? 0 : tax / 2,
                sgstAmount: isInterState ? 0 : tax / 2,
                igstAmount: isInterState ? tax : 0,
                totalAmount: taxableAmount + tax,
            };
        });

        const totals = itemsWithTaxes.reduce((acc, item) => ({
            totalTaxableAmount: acc.totalTaxableAmount + item.taxableAmount,
            totalCgst: acc.totalCgst + item.cgstAmount,
            totalSgst: acc.totalSgst + item.sgstAmount,
            totalIgst: acc.totalIgst + item.igstAmount,
            grandTotal: acc.grandTotal + item.totalAmount,
        }), { totalTaxableAmount: 0, totalCgst: 0, totalSgst: 0, totalIgst: 0, grandTotal: 0 });

        return { ...totals, isInterState };
    }, [ledgers, stockItems, companyDetails.state]);

    const handleDataChange = useCallback((fileId: string, field: keyof ExtractedInvoiceData, value: string | number) => {
        setFiles(prevFiles => prevFiles.map(f => {
            if (f.id === fileId && f.extractedData && !Array.isArray(f.extractedData)) {
                const updatedDataPartial = { ...f.extractedData, [field]: value };

                if (field === 'sellerName') {
                    const totals = calculateVoucherTotals(updatedDataPartial, String(value));
                    const updatedData = {
                        ...updatedDataPartial,
                        subtotal: totals.totalTaxableAmount,
                        cgstAmount: totals.totalCgst,
                        sgstAmount: totals.totalSgst,
                        totalAmount: totals.grandTotal,
                    };
                    return { ...f, extractedData: updatedData };
                } else {
                    return { ...f, extractedData: updatedDataPartial };
                }
            }
            return f;
        }));
    }, [calculateVoucherTotals]);

    const handleLineItemChange = useCallback((fileId: string, itemIndex: number, field: keyof ExtractedLineItem, value: string | number) => {
        setFiles(prevFiles => prevFiles.map(f => {
            if (f.id === fileId && f.extractedData && !Array.isArray(f.extractedData)) {
                const newLineItems = [...(f.extractedData.lineItems || [])];
                const updatedItem = { ...newLineItems[itemIndex], [field]: value };
                newLineItems[itemIndex] = updatedItem;

                const tempData = { ...f.extractedData, lineItems: newLineItems };
                const totals = calculateVoucherTotals(tempData, tempData.sellerName || '');

                const updatedData = {
                    ...tempData,
                    subtotal: totals.totalTaxableAmount,
                    cgstAmount: totals.totalCgst,
                    sgstAmount: totals.totalSgst,
                    totalAmount: totals.grandTotal,
                };

                return { ...f, extractedData: updatedData };
            }
            return f;
        }));
    }, [calculateVoucherTotals]);

    const handleDeleteFile = (fileId: string) => {
        setFiles(prev => prev.filter(f => f.id !== fileId));
    };

    const handleSave = () => {
        const vouchersToCreate: Voucher[] = [];
        files.forEach(file => {
            if (file.status === 'success' && file.extractedData) {
                if (Array.isArray(file.extractedData)) {
                    // Excel file with vouchers
                    vouchersToCreate.push(...file.extractedData);
                } else {
                    // Image/PDF with extracted data
                    const data = file.extractedData as ExtractedInvoiceData;
                    const totals = calculateVoucherTotals(data, data.sellerName || 'Unknown Party');

                    const items: VoucherItem[] = (data.lineItems || []).filter(item => item != null).map(item => {
                        const stockItem = stockItems.find(si => si.name.toLowerCase() === (item.itemDescription || '').toLowerCase());
                        const gstRate = stockItem?.gstRate || 18;
                        const quantity = Number(item.quantity) || 0;
                        const rate = Number(item.rate) || 0;
                        const taxableAmount = quantity * rate;
                        const tax = taxableAmount * (gstRate / 100);
                        return {
                            name: item.itemDescription || 'Unknown Item',
                            qty: quantity,
                            rate: rate,
                            taxableAmount: taxableAmount,
                            cgstAmount: totals.isInterState ? 0 : tax / 2,
                            sgstAmount: totals.isInterState ? 0 : tax / 2,
                            igstAmount: totals.isInterState ? tax : 0,
                            totalAmount: taxableAmount + tax,
                        };
                    });

                    const invoiceDateStr = typeof data.invoiceDate === 'string' ? data.invoiceDate : new Date().toISOString().split('T')[0];
                    const invoiceDate = new Date(invoiceDateStr);
                    const validInvoiceDate = !isNaN(invoiceDate.getTime()) ? invoiceDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

                    const dueDateValue = data.dueDate ? new Date(data.dueDate) : null;
                    const validDueDate = dueDateValue && !isNaN(dueDateValue.getTime()) ? dueDateValue.toISOString().split('T')[0] : undefined;

                    const voucher: SalesPurchaseVoucher = {
                        id: Math.random().toString(36).substr(2, 9),
                        type: voucherType as 'Sales' | 'Purchase',
                        date: validInvoiceDate,
                        invoiceNo: data.invoiceNumber || '',
                        dueDate: validDueDate,
                        party: data.sellerName || 'Unknown Party',
                        isInterState: totals.isInterState,
                        items,
                        totalTaxableAmount: totals.totalTaxableAmount,
                        totalCgst: totals.totalCgst,
                        totalSgst: totals.totalSgst,
                        totalIgst: totals.totalIgst,
                        total: totals.grandTotal,
                        narration: `Auto-imported from ${file.file.name}`,
                    };
                    vouchersToCreate.push(voucher);
                }
            }
        });

        onComplete(vouchersToCreate);
        onClose();
    };

    const { completedCount, successCount, hasPendingFiles } = useMemo(() => {
        const completed = files.filter(f => f.status === 'success' || f.status === 'error').length;
        const success = files.filter(f => f.status === 'success').length;
        const pending = files.some(f => f.status === 'pending');
        return { completedCount: completed, successCount: success, hasPendingFiles: pending };
    }, [files]);

    const StatusPill: React.FC<{ status: MassUploadFile['status'] }> = ({ status }) => {
        const styles = {
            pending: 'bg-slate-200 text-slate-600',
            processing: 'bg-teal-100 text-teal-600 animate-pulse',
            success: 'bg-green-100 text-teal-700',
            error: 'bg-red-100 text-red-700',
        }[status];
        const icon = {
            pending: null,
            processing: <Icon name="spinner" className="w-3 h-3 animate-spin" />,
            success: <Icon name="check-circle" className="w-3 h-3" />,
            error: <Icon name="warning" className="w-3 h-3" />,
        }[status];
        return (
            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full inline-flex items-center space-x-1.5 ${styles}`}>
                {icon}
                <span className="capitalize">{status}</span>
            </span>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4" aria-modal="true" role="dialog">
            <style>{`
                  .review-input { width: 100%; border: 1px solid transparent; background: #f8fafc; border-radius: 4px; padding: 4px 6px; transition: all 0.2s; color: #1e293b; }
                  .review-input:hover { border-color: #cbd5e1; }
                  .review-input:focus { border-color: #0d9488; background: white; box-shadow: 0 0 0 1px #0d9488; }
                  .sub-table-header { padding: 0.5rem 0.75rem; text-align: left; font-size: 0.75rem; font-weight: 600; color: #4b5563; }
             `}</style>
            <div className="bg-slate-50 rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col">
                <header className="flex items-center justify-between p-4 border-b border-slate-200 flex-shrink-0">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center space-x-3">
                        <Icon name="upload" className="w-6 h-6 text-purple-600" />
                        <span>Mass Invoice Upload</span>
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><Icon name="close" className="w-6 h-6" /></button>
                </header>

                <main className="flex-1 p-2 sm:p-6 overflow-y-auto">
                    {
                        files.length === 0 ? <UploadDropzone onFilesSelected={handleFileSelect} /> : (
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-100">
                                    <tr>
                                        <th className="p-3 text-left font-semibold text-slate-600">File</th>
                                        <th className="p-3 text-left font-semibold text-slate-600 w-32">Status</th>
                                        <th className="p-3 text-left font-semibold text-slate-600 w-36">Date</th>
                                        <th className="p-3 text-left font-semibold text-slate-600 w-36">Inv No.</th>
                                        <th className="p-3 text-left font-semibold text-slate-600">Party</th>
                                        <th className="p-3 text-right font-semibold text-slate-600 w-36">Amount</th>
                                        <th className="p-3 w-12"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {files.map((file, index) => (
                                        <tr key={index} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-500">
                                                        {file.file.type.includes('image') ? '🖼️' : '📄'}
                                                    </div>
                                                    <span className="text-sm font-medium text-slate-700 truncate max-w-[150px]" title={file.file.name}>
                                                        {file.file.name}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <StatusPill status={file.status} />
                                            </td>
                                            <td className="p-3">
                                                {file.status === 'success' && (Array.isArray(file.extractedData) ? '' : (() => {
                                                    const invoiceDate = new Date(file.extractedData?.invoiceDate || Date.now());
                                                    const validValue = !isNaN(invoiceDate.getTime()) ? invoiceDate.toISOString().split('T')[0] : '';
                                                    return <input type="date" value={validValue} onChange={e => handleDataChange(file.id, 'invoiceDate', e.target.value)} className="review-input" />;
                                                })())}
                                            </td>
                                            <td className="p-3">
                                                {file.status === 'success' && (Array.isArray(file.extractedData) ? '' : <input type="text" value={file.extractedData?.invoiceNumber || ''} onChange={e => handleDataChange(file.id, 'invoiceNumber', e.target.value)} className="review-input" />)}
                                            </td>
                                            <td className="p-3">
                                                {file.status === 'success' && (Array.isArray(file.extractedData) ? `Excel file with ${file.extractedData.length} vouchers` : <input type="text" value={file.extractedData?.sellerName || ''} onChange={e => handleDataChange(file.id, 'sellerName', e.target.value)} className="review-input" />)}
                                            </td>
                                            <td className="p-3 text-right">
                                                {file.status === 'success' && (Array.isArray(file.extractedData) ? file.extractedData.reduce((sum, v) => sum + (v.total || v.amount || 0), 0).toFixed(2) : <input type="number" value={Number(file.extractedData?.totalAmount || 0).toFixed(2)} readOnly className="review-input text-right font-mono bg-slate-100" />)}
                                            </td>
                                            <td className="p-3">
                                                <button
                                                    onClick={() => handleDeleteFile(file.id)}
                                                    className="text-slate-400 hover:text-red-500 transition-colors"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                </main>

                {files.length > 0 && (
                    <footer className="p-4 border-t border-slate-200 flex justify-between items-center flex-shrink-0">
                        <p className="text-sm text-gray-500">
                            <strong>{files.length}</strong> files selected. <strong>{completedCount}</strong> processed. <strong>{successCount}</strong> ready to import.
                        </p>
                        <div className="flex items-center space-x-2">
                            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-slate-200">Cancel</button>
                            {isProcessing ? (
                                <button disabled className="px-4 py-2 text-sm font-medium text-white bg-teal-400 rounded-md flex items-center cursor-not-allowed"><Icon name="spinner" className="animate-spin w-4 h-4 mr-2" />Processing...</button>
                            ) : (
                                !hasPendingFiles ? (
                                    <button onClick={handleSave} disabled={successCount === 0} className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-md flex items-center hover:bg-teal-700 disabled:bg-gray-400"><Icon name="check-circle" className="w-5 h-5 mr-2" /> Save {successCount} Vouchers</button>
                                ) : (
                                    <button onClick={startProcessing} className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-md flex items-center hover:bg-teal-700"><Icon name="wand-sparkles" className="w-5 h-5 mr-2" /> Start Processing</button>
                                )
                            )}
                        </div>
                    </footer>
                )}
            </div>
        </div>
    );
};

export default MassUploadModal;

