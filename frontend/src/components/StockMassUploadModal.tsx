
import React, { useState, useCallback, useRef } from 'react';
import type { StockItem, Unit, StockGroup } from '../types';
import Icon from './Icon';
import { apiService } from '../services';

declare const XLSX: any;

interface StockMassUploadModalProps {
    onClose: () => void;
    onComplete: (items: StockItem[]) => void;
    units: Unit[];
    stockGroups: StockGroup[];
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
            <h3 className="text-xl font-semibold text-slate-700">Drag & drop inventory files here</h3>
            <p className="text-slate-500 mt-1">Supports Excel, PDF, and Image files.</p>
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
                accept=".xlsx, .xls, image/png, image/jpeg, application/pdf"
                className="hidden"
                onChange={handleFileChange}
            />
        </div>
    );
};

const StockMassUploadModal: React.FC<StockMassUploadModalProps> = ({ onClose, onComplete }) => {
    const [files, setFiles] = useState<File[]>([]);
    const [parsedItems, setParsedItems] = useState<StockItem[]>([]);
    const [errors, setErrors] = useState<{ fileName: string, message: string }[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    const processFiles = useCallback(async (filesToProcess: File[]) => {
        setIsProcessing(true);
        setParsedItems([]);
        setErrors([]);

        let allItems: StockItem[] = [];
        let allErrors: { fileName: string, message: string }[] = [];

        for (const file of filesToProcess) {
            try {
                let items: StockItem[] = [];
                const fileType = file.type;

                if (fileType.includes('spreadsheetml') || fileType.includes('excel')) {
                    items = await new Promise<StockItem[]>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            try {
                                const data = e.target?.result;
                                const workbook = XLSX.read(data, { type: 'array' });
                                const sheetName = workbook.SheetNames[0];
                                const sheet = workbook.Sheets[sheetName];
                                const rows = XLSX.utils.sheet_to_json(sheet) as any[];
                                const excelItems: StockItem[] = rows.map((row, index) => {
                                    if (!row.name || !row.group || !row.unit) {
                                        throw new Error(`Row ${index + 2}: Missing required fields (name, group, unit).`);
                                    }
                                    return {
                                        name: String(row.name), group: String(row.group), unit: String(row.unit),
                                        hsn: row.hsn ? String(row.hsn) : undefined,
                                        gstRate: row.gstRate ? parseFloat(String(row.gstRate)) : undefined,
                                        quantity: row.quantity ? parseInt(String(row.quantity), 10) : 0,
                                    } as unknown as StockItem;
                                });
                                resolve(excelItems);
                            } catch (err) {
                                reject(err instanceof Error ? err : new Error("Failed to parse Excel file. Check format and headers."));
                            }
                        };
                        reader.onerror = () => reject(new Error("Failed to read the file."));
                        reader.readAsArrayBuffer(file);
                    });
                } else if (fileType === 'application/pdf' || fileType.startsWith('image/')) {
                    const response = await apiService.extractStockItemsFromFile(file);
                    items = Array.isArray(response) ? response : (response as any).items || [];
                    if (items.length === 0) {
                        throw new Error("AI could not find any stock items in the document.");
                    }
                } else {
                    throw new Error(`Unsupported file type: ${fileType}.`);
                }
                allItems = [...allItems, ...items];
            } catch (err) {
                allErrors.push({ fileName: file.name, message: err instanceof Error ? err.message : "An unknown error occurred." });
            }
        }

        setParsedItems(allItems);
        setErrors(allErrors);
        setIsProcessing(false);
    }, []);

    const handleFileSelect = (selectedFiles: FileList) => {
        const filesArray = Array.from(selectedFiles);
        setFiles(filesArray);
        if (filesArray.length > 0) {
            processFiles(filesArray);
        }
    };

    const handleDownloadTemplate = () => {
        const headers = [["name", "group", "unit", "hsn", "gstRate", "quantity"]];
        const exampleData = [["Sample Laptop", "Electronics", "Nos", "847130", 18, 10]];
        const worksheet = XLSX.utils.aoa_to_sheet([...headers, ...exampleData]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "StockItems");
        XLSX.writeFile(workbook, "StockItem_Template.xlsx");
    };

    const handleItemChange = (index: number, field: string, value: string | number) => {
        const newItems = [...parsedItems];
        const item = { ...newItems[index] };

        if (field === 'gstRate' || field === 'quantity') {
            (item as any)[field] = typeof value === 'string' ? parseFloat(value) || 0 : value;
        } else {
            (item as any)[field] = value;
        }

        newItems[index] = item;
        setParsedItems(newItems);
    };

    const handleDeleteItem = (index: number) => {
        setParsedItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleSave = () => {
        onComplete(parsedItems);
        onClose();
    };

    const clearAll = () => {
        setFiles([]);
        setParsedItems([]);
        setErrors([]);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4" aria-modal="true" role="dialog">
            <style>{`
                .table-input { width: 100%; border: 1px solid transparent; padding: 0.5rem 0.75rem; background-color: transparent; outline: none; border-radius: 0.375rem; transition: all 0.2s; color: #111827; /* Tailwind gray-900 */ }
                .table-input:focus { background-color: white; border-color: #0d9488; box-shadow: 0 0 0 1px #0d9488; }
            `}</style>
            <div className="bg-slate-50 rounded-xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col">
                <header className="flex items-center justify-between p-4 border-b border-slate-200 flex-shrink-0">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center space-x-3">
                        <Icon name="upload" className="w-6 h-6 text-purple-600" />
                        <span>Mass Stock Item Upload</span>
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><Icon name="close" className="w-6 h-6" /></button>
                </header>

                <main className="flex-1 p-6 overflow-y-auto">
                    {files.length === 0 && !isProcessing ? (
                        <div className="h-full">
                            <UploadDropzone onFilesSelected={handleFileSelect} />
                            <div className="text-center mt-4">
                                <button onClick={handleDownloadTemplate} className="text-sm font-medium text-teal-600 hover:underline">
                                    Download Excel Template
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div className="p-3 mb-4 bg-teal-50 border border-teal-200 rounded-md flex justify-between items-center">
                                <p className="text-sm text-teal-800 font-medium truncate pr-4">
                                    {files.length} file(s) selected: {files.map(f => f.name).join(', ')}
                                </p>
                                <button onClick={clearAll} className="text-sm font-semibold text-red-600 hover:text-red-800 flex-shrink-0">Clear All</button>
                            </div>

                            {
                                isProcessing &&
                                <div className="flex items-center justify-center p-4 space-x-2 text-slate-600">
                                    <Icon name="spinner" className="animate-spin w-5 h-5" />
                                    <span>Processing {files.length} file(s)...</span>
                                </div>
                            }

                            {
                                !isProcessing && errors.length > 0 && (
                                    <div className="mb-4">
                                        <h4 className="font-semibold text-red-700">Processing Errors:</h4>
                                        <ul className="list-disc list-inside p-3 bg-red-50 rounded-md text-red-600 text-sm max-h-32 overflow-y-auto">
                                            {errors.map((err, i) => <li key={i}><strong>{err.fileName}:</strong> {err.message}</li>)}
                                        </ul>
                                    </div>
                                )
                            }

                            {
                                !isProcessing && parsedItems.length > 0 && (
                                    <>
                                        <p className="text-teal-700 font-semibold mb-2">Found {parsedItems.length} items to import. You can edit the details below before confirming.</p>
                                        <div className="max-h-[45vh] overflow-y-auto border rounded-md">
                                            <table className="min-w-full text-sm">
                                                <thead className="bg-slate-100 sticky top-0">
                                                    <tr>
                                                        <th className="p-3 text-left font-semibold text-slate-600">Name</th>
                                                        <th className="p-3 text-left font-semibold text-slate-600">Group</th>
                                                        <th className="p-3 text-left font-semibold text-slate-600">Unit</th>
                                                        <th className="p-3 text-left font-semibold text-slate-600">HSN</th>
                                                        <th className="p-3 text-right font-semibold text-slate-600">GST Rate (%)</th>
                                                        <th className="p-3 text-right font-semibold text-slate-600">Quantity</th>
                                                        <th className="p-3 w-12"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-slate-200">
                                                    {parsedItems.map((item, index) => (
                                                        <tr key={index}>
                                                            <td className="p-1"><input type="text" value={item.name} onChange={e => handleItemChange(index, 'name', e.target.value)} className="table-input font-medium" /></td>
                                                            <td className="p-1"><input type="text" value={item.group} onChange={e => handleItemChange(index, 'group', e.target.value)} className="table-input" /></td>
                                                            <td className="p-1"><input type="text" value={item.unit} onChange={e => handleItemChange(index, 'unit', e.target.value)} className="table-input" /></td>
                                                            <td className="p-1"><input type="text" value={item.hsn || ''} onChange={e => handleItemChange(index, 'hsn', e.target.value)} className="table-input font-mono" /></td>
                                                            <td className="p-1"><input type="number" value={item.gstRate || 0} onChange={e => handleItemChange(index, 'gstRate', e.target.value)} className="table-input font-mono text-right" /></td>
                                                            <td className="p-1"><input type="number" value={item.quantity || 0} onChange={e => handleItemChange(index, 'quantity', e.target.value)} className="table-input font-mono text-right" /></td>
                                                            <td className="p-2 text-center">
                                                                <button onClick={() => handleDeleteItem(index)} className="text-slate-400 hover:text-red-500" title="Remove item"><Icon name="trash" className="w-4 h-4" /></button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )
                            }
                        </div >
                    )}
                </main >

                <footer className="p-4 border-t border-slate-200 flex justify-end items-center flex-shrink-0 space-x-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-slate-200">Cancel</button>
                    <button
                        onClick={handleSave}
                        disabled={parsedItems.length === 0 || isProcessing}
                        className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-md flex items-center hover:bg-teal-700 disabled:bg-gray-400"
                    >
                        <Icon name="check-circle" className="w-5 h-5 mr-2" />
                        Confirm & Import {parsedItems.length > 0 ? `(${parsedItems.length})` : ''}
                    </button>
                </footer>
            </div >
        </div >
    );
};

export default StockMassUploadModal;

