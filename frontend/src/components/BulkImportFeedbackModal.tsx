import React, { useRef, useState, useEffect } from 'react';
import Icon from './Icon';

interface BulkImportFeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    summary: any | null;
    title: string;
    onEditImported?: (record: any) => void;
    onUpload?: (file: File | any[], dryRun?: boolean) => void;
    isProcessing?: boolean;
    dropdownOptions?: Record<string, { label: string, value: string }[]>;
}

export const BulkImportFeedbackModal: React.FC<BulkImportFeedbackModalProps> = ({ 
    isOpen, 
    onClose, 
    summary: initialSummary, 
    title, 
    onEditImported,
    onUpload,
    isProcessing = false,
    dropdownOptions
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [summary, setSummary] = useState<any>(initialSummary);
    const [activeTab, setActiveTab] = useState<'all' | 'success' | 'failed'>('all');
    const [editingItem, setEditingItem] = useState<{ type: 'success' | 'error'; index: number; data: any } | null>(null);
    const [editingTab, setEditingTab] = useState<string>('Basic Details');

    useEffect(() => {
        if (initialSummary) {
            const updatedSummary = { ...initialSummary };
            if (updatedSummary.successful_imports) {
                updatedSummary.successful_imports = updatedSummary.successful_imports.map((item: any) => ({
                    ...item,
                    isSelected: false // All start as false (Implicit ALL mode)
                }));
            }
            setSummary(updatedSummary);
        } else {
            setSummary(null);
        }
    }, [initialSummary]);

    const hasExplicitSelection = summary?.successful_imports?.some((s: any) => s.isSelected) || false;

    const toggleAllSelection = (selected: boolean) => {
        if (!summary) return;
        const newSummary = { ...summary };
        newSummary.successful_imports = newSummary.successful_imports.map((item: any) => ({
            ...item,
            isSelected: selected
        }));
        setSummary(newSummary);
    };

    const toggleItemSelection = (index: number) => {
        if (!summary) return;
        const newSummary = { ...summary };
        newSummary.successful_imports[index].isSelected = !newSummary.successful_imports[index].isSelected;
        setSummary(newSummary);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && onUpload) {
            setSelectedFile(file);
            onUpload(file, true); // Upload for preview first
            setActiveTab('all'); // Reset tab on new upload
        }
        // Reset input so the same file can be selected again if needed
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleConfirmImport = () => {
        if (onUpload && summary) {
            const allImports = summary.successful_imports || [];
            const selectedImports = allImports.filter((s: any) => s.isSelected);
            
            // If nothing is selected, import ALL records. Otherwise, import only selected ones.
            const recordsToProcess = selectedImports.length === 0 ? allImports : selectedImports;

            if (recordsToProcess.length === 0) {
                alert("No records available to import.");
                return;
            }

            const payload = recordsToProcess.map((s: any) => ({ row_data: s.row_data, row_index: s.row_index }));
            onUpload(payload, false); 
            setActiveTab('all');
        }
    };

    const handleQuickSave = (updatedData: any) => {
        if (!editingItem || !summary) return;

        const newSummary = { ...summary };
        if (editingItem.type === 'error') {
            // Remove from errors, add to success (assuming it's fixed now)
            const fixedItem = newSummary.errors[editingItem.index];
            newSummary.errors.splice(editingItem.index, 1);
            newSummary.failed -= 1;
            
            newSummary.successful_imports.push({
                ...fixedItem,
                row_data: updatedData,
                name: updatedData['Customer Name'] || updatedData['Vendor Name'] || updatedData['name'],
                code: updatedData['Customer Code'] || updatedData['Vendor Code'] || updatedData['code'],
                isSelected: true // Fixed items default to selected
            });
            newSummary.success += 1;
        } else {
            // Just update existing success item
            newSummary.successful_imports[editingItem.index].row_data = updatedData;
            newSummary.successful_imports[editingItem.index].name = updatedData['Customer Name'] || updatedData['Vendor Name'] || updatedData['name'];
        }

        setSummary(newSummary);
        setEditingItem(null);
    };

    const handleClose = () => {
        setSelectedFile(null);
        setActiveTab('all');
        setEditingItem(null);
        onClose();
    };

    if (!isOpen) return null;

    // Determine the view state
    const isResultsView = summary !== null;
    const isInitialView = !isResultsView && !isProcessing;
    const isPreview = summary?.is_preview || false;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] relative">
                
                {/* Quick Edit Overlay */}
                {editingItem && (
                    <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-md animate-in fade-in slide-in-from-bottom-8 duration-300 flex flex-col">
                        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 rounded-xl">
                                    <Icon name="edit" className="w-5 h-5 text-indigo-600" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900">Fix Record Data</h3>
                            </div>
                            <button onClick={() => setEditingItem(null)} className="p-2 hover:bg-gray-100 rounded-full">
                                <Icon name="x" className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>
                        <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
                            {/* Display specific error message if available */}
                            {editingItem.type === 'error' && summary.errors[editingItem.index]?.message && (
                                <div className="mb-8 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-4 animate-in shake-1 duration-500">
                                    <div className="p-2 bg-rose-100 rounded-lg shrink-0">
                                        <Icon name="exclamation-triangle" className="w-5 h-5 text-rose-600" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="text-[10px] font-black text-rose-900 uppercase tracking-widest">Validation Error</h4>
                                        <p className="text-sm text-rose-700 font-medium leading-relaxed">
                                            {summary.errors[editingItem.index].message}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Horizontal Text Tabs Navigation */}
                            {(() => {
                                const sectionTitles = [
                                    'Basic Details',
                                    'GST & Address Details',
                                    'Products/Services',
                                    'TDS & Other Statutory Details',
                                    'Banking Info',
                                    'Terms & Conditions'
                                ];

                                return (
                                    <div className="flex items-center gap-10 border-b border-gray-100 mb-10 px-2 overflow-x-auto no-scrollbar">
                                        {sectionTitles.map((tab) => (
                                            <button
                                                key={tab}
                                                onClick={() => setEditingTab(tab)}
                                                className={`pb-4 text-[11px] font-black uppercase tracking-[0.2em] transition-all relative whitespace-nowrap ${
                                                    editingTab === tab ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
                                                }`}
                                            >
                                                {tab}
                                                {editingTab === tab && (
                                                    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-indigo-600 rounded-t-full animate-in fade-in slide-in-from-bottom-1" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                );
                            })()}

                            {/* Active Section Content */}
                            {(() => {
                                const isVendor = title.toLowerCase().includes('vendor');
                                const allSections = isVendor ? [
                                    {
                                        title: 'Basic Details',
                                        fields: [
                                            { label: 'VENDOR CODE', key: 'Vendor Code', placeholder: 'VEN-XXXXXX' },
                                            { label: 'VENDOR NAME', key: 'Vendor Name', placeholder: 'Enter vendor name', required: true },
                                            { label: 'VENDOR CATEGORY', key: 'Category', type: 'select', placeholder: 'SELECT CATEGORY', required: true },
                                            { label: 'BILLING CURRENCY', key: 'Billing Currency', type: 'select', placeholder: 'SELECT CURRENCY' },
                                            { label: 'PAN NO.', key: 'PAN Number', placeholder: 'AAAAA0000A' },
                                            { label: 'CONTACT PERSON', key: 'Contact Person', placeholder: 'Primary contact name' },
                                            { label: 'EMAIL ADDRESS', key: 'Email Address', placeholder: 'vendor@example.com', required: true },
                                            { label: 'CONTACT NO', key: 'Contact Number', placeholder: '+91 XXXXX XXXXX', required: true },
                                            { label: 'IS THIS VENDOR ALSO A CUSTOMER?', key: 'Is Also Customer', type: 'toggle' },
                                            { label: 'TCS APPLICABLE?', key: 'TCS Applicable', type: 'toggle' },
                                        ]
                                    },
                                    {
                                        title: 'GST & Address Details',
                                        fields: [
                                            { label: 'GSTIN', key: 'GSTIN', placeholder: '22AAAAA0000A1Z5' },
                                            { label: 'BRANCH NAME', key: 'Branch Name', placeholder: 'Main Branch' },
                                            { label: 'ADDRESS LINE 1', key: 'Address Line 1', placeholder: 'Building/Street' },
                                            { label: 'ADDRESS LINE 2', key: 'Address Line 2', placeholder: 'Area/Landmark' },
                                            { label: 'ADDRESS LINE 3', key: 'Address Line 3', placeholder: 'Locality' },
                                            { label: 'CITY', key: 'City', placeholder: 'City Name' },
                                            { label: 'STATE', key: 'State', type: 'select', placeholder: 'SELECT STATE' },
                                            { label: 'PINCODE', key: 'Pincode', placeholder: '600001' },
                                            { label: 'COUNTRY', key: 'Country', placeholder: 'India' },
                                        ]
                                    },
                                    {
                                        title: 'TDS & Other Statutory Details',
                                        fields: [
                                            { label: 'MSME NO', key: 'MSME No', placeholder: 'UDYAM-XX-XX-XXXXXXX' },
                                            { label: 'FSSAI NO', key: 'FSSAI No', placeholder: '1XXXXXXXXXXXXX' },
                                            { label: 'IEC CODE', key: 'IEC Code', placeholder: 'XXXXXXXXXX' },
                                            { label: 'TDS SECTION', key: 'TDS Section', type: 'select', placeholder: 'SELECT SECTION' },
                                            { label: 'TCS SECTION', key: 'TCS Section', type: 'select', placeholder: 'SELECT SECTION' },
                                        ]
                                    },
                                    {
                                        title: 'Banking Info',
                                        fields: [
                                            { label: 'BANK ACCOUNT NO', key: 'Bank Account No', placeholder: 'XXXXXXXXXXXX' },
                                            { label: 'BANK NAME', key: 'Bank Name', placeholder: 'Enter bank name' },
                                            { label: 'IFSC CODE', key: 'IFSC Code', placeholder: 'SBIN000XXXX' },
                                            { label: 'BANK BRANCH', key: 'Bank Branch', placeholder: 'Enter branch name' },
                                        ]
                                    },
                                    {
                                        title: 'Terms & Conditions',
                                        fields: [
                                            { label: 'CREDIT PERIOD (DAYS)', key: 'Credit Period', placeholder: '30' },
                                            { label: 'CREDIT TERMS', key: 'Credit Terms', placeholder: 'Enter terms' },
                                            { label: 'PENALTY TERMS', key: 'Penalty Terms', placeholder: 'Enter penalty details' },
                                            { label: 'DELIVERY TERMS', key: 'Delivery Terms', placeholder: 'Enter delivery details' },
                                            { label: 'WARRANTY DETAILS', key: 'Warranty Details', placeholder: 'Enter warranty details' },
                                            { label: 'FORCE MAJEURE', key: 'Force Majeure', placeholder: 'Enter details' },
                                        ]
                                    },
                                    {
                                        title: 'Products/Services',
                                        fields: [
                                            { label: 'PRODUCTS/SERVICES', key: 'Products Services', placeholder: 'Enter products or services' }
                                        ]
                                    }
                                ] : [
                                    {
                                        title: 'Basic Details',
                                        fields: [
                                            { label: 'CUSTOMER CODE', key: 'Customer Code', placeholder: 'CUST-XXXXXX' },
                                            { label: 'CUSTOMER NAME', key: 'Customer Name', placeholder: 'Enter customer name', required: true },
                                            { label: 'CUSTOMER CATEGORY', key: 'Category', type: 'select', placeholder: 'SELECT CATEGORY', required: true },
                                            { label: 'BILLING CURRENCY', key: 'Billing Currency', type: 'select', placeholder: 'SELECT CURRENCY' },
                                            { label: 'PAN NO.', key: 'PAN Number', placeholder: 'AAAAA0000A' },
                                            { label: 'CONTACT PERSON', key: 'Contact Person', placeholder: 'Primary contact name' },
                                            { label: 'EMAIL ADDRESS', key: 'Email Address', placeholder: 'customer@example.com', required: true },
                                            { label: 'CONTACT NO', key: 'Contact Number', placeholder: '+91 XXXXX XXXXX', required: true },
                                            { label: 'IS ALSO VENDOR?', key: 'Is Also Vendor', type: 'toggle' },
                                            { label: 'GST TDS APPLICABLE?', key: 'GST TDS Applicable', type: 'toggle' },
                                        ]
                                    },
                                    {
                                        title: 'GST & Address Details',
                                        fields: [
                                            { label: 'GSTIN', key: 'GSTIN', placeholder: '22AAAAA0000A1Z5' },
                                            { label: 'BRANCH NAME', key: 'Branch Name', placeholder: 'Main Branch' },
                                            { label: 'ADDRESS LINE 1', key: 'Address Line 1', placeholder: 'Building/Street' },
                                            { label: 'ADDRESS LINE 2', key: 'Address Line 2', placeholder: 'Area/Landmark' },
                                            { label: 'ADDRESS LINE 3', key: 'Address Line 3', placeholder: 'Locality' },
                                            { label: 'CITY', key: 'City', placeholder: 'City Name' },
                                            { label: 'STATE', key: 'State', type: 'select', placeholder: 'SELECT STATE' },
                                            { label: 'PINCODE', key: 'Pincode', placeholder: '600001' },
                                            { label: 'COUNTRY', key: 'Country', placeholder: 'India' },
                                        ]
                                    },
                                    {
                                        title: 'TDS & Other Statutory Details',
                                        fields: [
                                            { label: 'MSME NO', key: 'MSME No', placeholder: 'UDYAM-XX-XX-XXXXXXX' },
                                            { label: 'FSSAI NO', key: 'FSSAI No', placeholder: '1XXXXXXXXXXXXX' },
                                            { label: 'IEC CODE', key: 'IEC Code', placeholder: 'XXXXXXXXXX' },
                                            { label: 'TDS SECTION', key: 'TDS Section', type: 'select', placeholder: 'SELECT SECTION' },
                                            { label: 'TCS SECTION', key: 'TCS Section', type: 'select', placeholder: 'SELECT SECTION' },
                                        ]
                                    },
                                    {
                                        title: 'Banking Info',
                                        fields: [
                                            { label: 'BANK ACCOUNT NO', key: 'Bank Account No', placeholder: 'XXXXXXXXXXXX' },
                                            { label: 'BANK NAME', key: 'Bank Name', placeholder: 'Enter bank name' },
                                            { label: 'IFSC CODE', key: 'IFSC Code', placeholder: 'SBIN000XXXX' },
                                            { label: 'BANK BRANCH', key: 'Bank Branch', placeholder: 'Enter branch name' },
                                        ]
                                    },
                                    {
                                        title: 'Terms & Conditions',
                                        fields: [
                                            { label: 'CREDIT PERIOD (DAYS)', key: 'Credit Period', placeholder: '30' },
                                            { label: 'CREDIT TERMS', key: 'Credit Terms', placeholder: 'Enter terms' },
                                            { label: 'PENALTY TERMS', key: 'Penalty Terms', placeholder: 'Enter penalty details' },
                                            { label: 'DELIVERY TERMS', key: 'Delivery Terms', placeholder: 'Enter delivery details' },
                                            { label: 'WARRANTY DETAILS', key: 'Warranty Details', placeholder: 'Enter warranty details' },
                                            { label: 'FORCE MAJEURE', key: 'Force Majeure', placeholder: 'Enter details' },
                                        ]
                                    },
                                    {
                                        title: 'Products/Services',
                                        fields: [
                                            { label: 'PRODUCTS/SERVICES', key: 'Products Services', placeholder: 'Enter products or services' }
                                        ]
                                    }
                                ];

                                const activeSection = allSections.find(s => s.title === editingTab) || allSections[0];

                                return (
                                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        <div className="grid grid-cols-2 gap-x-12 gap-y-8">
                                            {activeSection.fields.map((field, fIdx) => {
                                                const key = field.key;
                                                const value = editingItem.data[key];
                                                
                                                // Error/Warning Logic
                                                const errorMessage = summary.errors[editingItem.index]?.message?.toLowerCase() || '';
                                                const isMentionedInError = errorMessage.includes(key.toLowerCase().replace(/ /g, '_')) || errorMessage.includes(key.toLowerCase());
                                                const isEmpty = !value || value.toString().trim() === '';
                                                const hasWarning = field.required && isEmpty;

                                                // Check if this field should be a dropdown
                                                const fieldOptions = dropdownOptions?.[key] || dropdownOptions?.[key.toLowerCase()] || dropdownOptions?.[key.replace(/ /g, '_').toLowerCase()];

                                                return (
                                                    <div key={fIdx} className="space-y-2.5">
                                                        <label className={`text-[10px] font-black uppercase tracking-[0.15em] transition-colors ${hasWarning ? 'text-rose-500' : 'text-gray-500'}`}>
                                                            {field.label}
                                                            {field.required && <span className="ml-1 text-rose-500 font-black">*</span>}
                                                        </label>

                                                        {field.type === 'toggle' ? (
                                                            <div className="flex gap-4">
                                                                {['YES', 'NO'].map(opt => {
                                                                    const isActive = (opt === 'YES' && (value === true || value?.toString().toLowerCase() === 'yes')) || 
                                                                                   (opt === 'NO' && (value === false || value?.toString().toLowerCase() === 'no' || !value));
                                                                    return (
                                                                        <button
                                                                            key={opt}
                                                                            onClick={() => {
                                                                                editingItem.data[key] = opt === 'YES';
                                                                                setEditingItem({ ...editingItem }); // Trigger re-render
                                                                            }}
                                                                            className={`flex-1 py-3 px-6 rounded-xl text-xs font-black tracking-widest transition-all ${
                                                                                isActive 
                                                                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 ring-4 ring-indigo-50' 
                                                                                : 'bg-white border-2 border-gray-100 text-gray-400 hover:border-indigo-100 hover:bg-indigo-50/10'
                                                                            }`}
                                                                        >
                                                                            {opt}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : field.type === 'select' || fieldOptions ? (
                                                            <div className="relative group">
                                                                <select 
                                                                    value={value || ''}
                                                                    onChange={(e) => {
                                                                        editingItem.data[key] = e.target.value;
                                                                        setEditingItem({ ...editingItem });
                                                                    }}
                                                                    className={`w-full px-5 py-4 rounded-2xl text-sm font-bold transition-all focus:ring-4 outline-none appearance-none bg-no-repeat bg-[right_1.25rem_center] bg-[length:1.2em_1.2em] ${
                                                                        hasWarning 
                                                                        ? 'bg-rose-50 border-2 border-rose-100 focus:border-rose-500 focus:ring-rose-500/10' 
                                                                        : 'bg-gray-50/50 border-2 border-gray-100 focus:border-indigo-500 focus:ring-indigo-500/10 group-hover:border-indigo-200'
                                                                    }`}
                                                                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236B7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")` }}
                                                                >
                                                                    <option value="">{field.placeholder || 'SELECT OPTION'}</option>
                                                                    {(fieldOptions || []).map((opt: any) => (
                                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        ) : (
                                                            <input 
                                                                type="text"
                                                                value={value || ''}
                                                                onChange={(e) => {
                                                                    editingItem.data[key] = e.target.value;
                                                                    setEditingItem({ ...editingItem });
                                                                }}
                                                                placeholder={field.placeholder || `Enter ${field.label}...`}
                                                                className={`w-full px-5 py-4 rounded-2xl text-sm font-bold transition-all focus:ring-4 outline-none ${
                                                                    hasWarning 
                                                                    ? 'bg-rose-50 border-2 border-rose-100 focus:border-rose-500 focus:ring-rose-500/10' 
                                                                    : 'bg-gray-50/50 border-2 border-gray-100 focus:border-indigo-500 focus:ring-indigo-500/10'
                                                                }`}
                                                            />
                                                        )}
                                                        
                                                        {hasWarning && (
                                                            <p className="text-[10px] font-bold text-rose-500 flex items-center gap-1 mt-1 animate-in slide-in-from-top-1">
                                                                <Icon name={"exclamation-circle" as any} className="w-3 h-3" />
                                                                This field is mandatory
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                        <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                            <button 
                                onClick={() => setEditingItem(null)}
                                className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                            >
                                CANCEL
                            </button>
                            <button 
                                onClick={() => handleQuickSave(editingItem.data)}
                                className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all hover:-translate-y-0.5 active:translate-y-0"
                            >
                                SAVE CHANGES
                            </button>
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-50 rounded-xl">
                            <Icon name="file-spreadsheet" className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 leading-tight">{title}</h2>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                {isInitialView ? 'Step 1: Upload File' : isPreview ? 'Step 2: Preview & Confirm' : 'Step 3: Import Results'}
                            </p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors group">
                        <Icon name="x" className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                    {isProcessing ? (
                        <div className="py-16 flex flex-col items-center justify-center space-y-6">
                            <div className="relative">
                                <div className="w-20 h-20 border-4 border-indigo-50 border-t-indigo-600 rounded-full animate-spin"></div>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Icon name="upload" className="w-8 h-8 text-indigo-600 animate-pulse" />
                                </div>
                            </div>
                            <div className="text-center space-y-2">
                                <p className="text-xl font-bold text-gray-900">
                                    {isPreview ? 'Validating File...' : 'Finalizing Import...'}
                                </p>
                                <p className="text-sm text-gray-500 max-w-[240px] mx-auto">
                                    {isPreview 
                                        ? "We're checking your file for any errors before we save it."
                                        : "Almost there! We're saving your records to the database."}
                                </p>
                            </div>
                        </div>
                    ) : isInitialView ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center space-y-8">
                            <div className="relative">
                                <div className="w-24 h-24 bg-indigo-50 rounded-3xl flex items-center justify-center rotate-6 group-hover:rotate-0 transition-transform">
                                    <Icon name="upload" className="w-12 h-12 text-indigo-500" />
                                </div>
                                <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-indigo-50">
                                    <Icon name="plus" className="w-4 h-4 text-indigo-600" />
                                </div>
                            </div>
                            <div className="max-w-xs space-y-2">
                                <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Bulk Import</h3>
                                <p className="text-sm text-gray-500">
                                    Drag and drop your excel file here or click the button below to browse.
                                </p>
                            </div>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept=".xlsx, .xls" 
                                onChange={handleFileChange}
                            />
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="px-16 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black shadow-2xl shadow-indigo-200 transition-all active:scale-95 flex items-center justify-center gap-3 uppercase tracking-widest"
                            >
                                <Icon name="upload" className="w-5 h-5" />
                                Select File
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                            {isPreview && (
                                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4">
                                    <div className="p-2 bg-amber-100 rounded-lg shrink-0">
                                        <Icon name="alert-circle" className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="text-sm font-bold text-amber-900 uppercase tracking-wider">Preview Mode</h4>
                                        <p className="text-sm text-amber-700 leading-relaxed">
                                            The records below have been validated but <strong>not yet saved</strong>. Review the counts and errors, then click "CONFIRM IMPORT" to finalize.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Stats Cards (Filter Buttons) */}
                            <div className="grid grid-cols-2 gap-6">
                                <button 
                                    onClick={() => setActiveTab(activeTab === 'success' ? 'all' : 'success')}
                                    className={`bg-emerald-50 border rounded-[2rem] p-8 transition-all group relative text-left ${activeTab === 'success' ? 'border-emerald-500 shadow-xl shadow-emerald-100' : 'border-emerald-100 hover:shadow-lg hover:shadow-emerald-100/50'}`}
                                >
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2.5 bg-emerald-100 rounded-xl text-emerald-600 group-hover:scale-110 transition-transform">
                                            <Icon name="check-circle" className="w-6 h-6" />
                                        </div>
                                        <span className="text-[10px] font-black text-emerald-800 uppercase tracking-[0.2em]">Successful</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-6xl font-black text-emerald-600 tracking-tighter">
                                            {!hasExplicitSelection
                                                ? summary.success 
                                                : summary.successful_imports?.filter((s: any) => s.isSelected).length}
                                        </p>
                                        <p className="text-xl font-bold text-emerald-400">
                                            {!hasExplicitSelection ? ' (ALL)' : `/ ${summary.success}`}
                                        </p>
                                    </div>
                                    {activeTab === 'success' && (
                                        <div className="absolute top-4 right-4 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                                    )}
                                </button>
                                <button 
                                    onClick={() => setActiveTab(activeTab === 'failed' ? 'all' : 'failed')}
                                    className={`bg-rose-50 border rounded-[2rem] p-8 transition-all group relative text-left ${activeTab === 'failed' ? 'border-rose-500 shadow-xl shadow-rose-100' : 'border-rose-100 hover:shadow-lg hover:shadow-rose-100/50'}`}
                                >
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2.5 bg-rose-100 rounded-xl text-rose-600 group-hover:scale-110 transition-transform">
                                            <Icon name="alert-circle" className="w-6 h-6" />
                                        </div>
                                        <span className="text-[10px] font-black text-rose-800 uppercase tracking-[0.2em]">Failed</span>
                                    </div>
                                    <p className="text-6xl font-black text-rose-600 tracking-tighter">{summary.failed}</p>
                                    {activeTab === 'failed' && (
                                        <div className="absolute top-4 right-4 w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                                    )}
                                </button>
                            </div>

                            {/* Errors List */}
                            {(activeTab === 'all' || activeTab === 'failed') && summary.errors && summary.errors.length > 0 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex items-center justify-between px-1">
                                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                            <Icon name="exclamation-triangle" className="w-3 h-3 text-amber-500" />
                                            Error Details
                                        </h3>
                                        <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full uppercase tracking-widest">
                                            {summary.errors.length} Issues Found
                                        </span>
                                    </div>
                                    <div className="bg-rose-50/50 border border-rose-100 rounded-[1.5rem] overflow-hidden divide-y divide-rose-100 max-h-96 overflow-y-auto custom-scrollbar">
                                        {summary.errors.map((error: any, idx: number) => (
                                            <div key={idx} className="p-4 flex items-center justify-between hover:bg-rose-50 transition-colors group">
                                                <div className="flex items-start gap-4">
                                                    <div className="w-2 h-2 rounded-full bg-rose-400 mt-1.5 shrink-0 shadow-[0_0_8px_rgba(251,113,133,0.6)]" />
                                                    <span className="text-sm text-rose-700 font-medium leading-relaxed">{typeof error === 'string' ? error : error.message}</span>
                                                </div>
                                                {isPreview && error.row_data && (
                                                    <button 
                                                        onClick={() => setEditingItem({ type: 'error', index: idx, data: { ...error.row_data } })}
                                                        className="px-4 py-1.5 bg-white border border-rose-200 text-[10px] font-black text-rose-600 rounded-lg hover:bg-rose-600 hover:text-white transition-all uppercase tracking-widest shadow-sm"
                                                    >
                                                        Fix
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Successful/Preview List */}
                            {(activeTab === 'all' || activeTab === 'success') && summary.successful_imports && summary.successful_imports.length > 0 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex items-center justify-between px-1">
                                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                            <Icon name="check-circle" className="w-3 h-3 text-emerald-500" />
                                            {isPreview ? 'Validation Results' : 'Imported Records'}
                                        </h3>
                                        {!isPreview && <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Click to View</span>}
                                    </div>
                                    <div className="bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm max-h-96 overflow-y-auto custom-scrollbar">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="sticky top-0 bg-gray-50/80 backdrop-blur-md z-10 border-b border-gray-100">
                                                <tr>
                                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Name</th>
                                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Code</th>
                                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Category</th>
                                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">GSTIN</th>
                                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">State</th>
                                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {summary.successful_imports.map((item: any, idx: number) => {
                                                    const rd = item.row_data || {};
                                                    const display = {
                                                        name: rd['Customer Name'] || rd['Vendor Name'] || rd['name'] || item.name || 'N/A',
                                                        code: rd['Customer Code'] || rd['Vendor Code'] || rd['code'] || item.code || 'N/A',
                                                        category: rd['Category'] || rd['vendor_category'] || rd['customer_category'] || 'N/A',
                                                        gstin: rd['GSTIN'] || rd['gstin'] || 'N/A',
                                                        state: rd['State'] || rd['state'] || rd['branch_state'] || 'N/A'
                                                    };
                                                    
                                                    return (
                                                        <tr 
                                                            key={idx} 
                                                            onClick={() => hasExplicitSelection && toggleItemSelection(idx)}
                                                            onDoubleClick={() => toggleItemSelection(idx)}
                                                            className={`group transition-all select-none cursor-pointer border-l-4 ${item.isSelected ? 'bg-indigo-50/80 border-indigo-500 shadow-sm' : 'border-transparent hover:bg-gray-50'}`}
                                                        >
                                                            <td className="px-6 py-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`p-1.5 rounded-lg shrink-0 ${isPreview ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                                                        <Icon name="check-circle" className="w-3 h-3" />
                                                                    </div>
                                                                    <span className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{display.name}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{display.code}</span>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className="text-xs font-bold text-gray-500">{display.category}</span>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className="text-xs font-medium text-gray-500 font-mono">{display.gstin}</span>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className="text-xs font-bold text-gray-500 uppercase">{display.state}</span>
                                                            </td>
                                                            <td className="px-6 py-4 text-right">
                                                                <div className="flex justify-end gap-2">
                                                                    {isPreview ? (
                                                                        <button 
                                                                            onClick={() => setEditingItem({ type: 'success', index: idx, data: { ...item.row_data } })}
                                                                            className="px-4 py-1.5 bg-white border border-gray-200 text-[10px] font-black text-gray-600 rounded-lg hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all uppercase tracking-widest shadow-sm"
                                                                        >
                                                                            Edit
                                                                        </button>
                                                                    ) : (
                                                                        <button 
                                                                            onClick={() => onEditImported?.(item)}
                                                                            className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors"
                                                                        >
                                                                            <Icon name="eye" className="w-4 h-4" />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}
                </div>

                {/* Fixed Footer - Outside scrollable area */}
                {!isInitialView && !isProcessing && summary && (
                    <div className="px-8 py-6 border-t border-gray-100 bg-white/80 backdrop-blur-md z-20 flex justify-between items-center sticky bottom-0">
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={handleClose}
                                className="px-6 py-2 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors uppercase tracking-widest"
                            >
                                Cancel
                            </button>
                            
                            {hasExplicitSelection && (
                                <button 
                                    onClick={() => toggleAllSelection(false)}
                                    className="px-4 py-2 text-[10px] font-black text-rose-500 hover:bg-rose-50 rounded-xl transition-all uppercase tracking-widest flex items-center gap-2"
                                >
                                    <Icon name="x" className="w-3 h-3" />
                                    Reset Selection
                                </button>
                            )}
                        </div>
                        
                        {isPreview ? (
                            <button 
                                onClick={handleConfirmImport}
                                disabled={summary.success === 0}
                                className="px-10 py-4 bg-indigo-600 text-white rounded-[1.5rem] font-black text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all hover:-translate-y-1 active:translate-y-0 flex items-center gap-3 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none"
                            >
                                <Icon name="check-circle" className="w-5 h-5" />
                                <span className="uppercase tracking-[0.1em]">Confirm Import</span>
                            </button>
                        ) : (
                            <button 
                                onClick={handleClose}
                                className="px-12 py-4 bg-gray-900 text-white rounded-[1.5rem] font-black text-sm shadow-xl shadow-gray-200 hover:bg-black transition-all hover:-translate-y-1 active:translate-y-0 uppercase tracking-[0.2em]"
                            >
                                Finish
                            </button>
                        )}
                    </div>
                )}
            </div>
            <style>
                {`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
                `}
            </style>
        </div>
    );
};
