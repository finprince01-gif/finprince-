import React, { useRef, useState, useEffect } from 'react';
import Icon from './Icon';
import { Country, State, City } from 'country-state-city';

interface BulkImportFeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    summary: any | null;
    title: string;
    onEditImported?: (record: any) => void;
    onUpload?: (file: File | any[], dryRun?: boolean) => void;
    isProcessing?: boolean;
    dropdownOptions?: Record<string, { label: string, value: string, full?: any }[]>;
    onDownloadTemplate?: () => void;
    /** Existing codes in the DB (customer_code / vendor_code) for duplicate detection */
    existingCodes?: string[];
}

export const BulkImportFeedbackModal: React.FC<BulkImportFeedbackModalProps> = ({
    isOpen,
    onClose,
    summary: initialSummary,
    title,
    onEditImported,
    onUpload,
    isProcessing = false,
    dropdownOptions,
    onDownloadTemplate,
    existingCodes = []
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [summary, setSummary] = useState<any>(initialSummary);
    const [activeTab, setActiveTab] = useState<'all' | 'success' | 'failed'>('all');
    const [editingItem, setEditingItem] = useState<{ type: 'success' | 'error'; index: number; data: any } | null>(null);
    const [editingTab, setEditingTab] = useState<string>('Basic Details');
    const [validationErrors, setValidationErrors] = useState<string[]>([]);

    const isItem = title.toLowerCase().includes('item') || title.toLowerCase().includes('inventory');

    const getFieldValue = (data: any, key: string): any => {
        if (!data) return '';
        if (data[key] !== undefined) return data[key];
        
        // Special case: Reference Name <-> Bank Branch / reference_name can get mixed up by header parser
        const FIELD_ALIASES: Record<string, string[]> = {
            'Reference Name': ['branch_name', 'reference_name', 'BranchName', 'Bank Branch', 'Branch Name'],
        };
        const aliases = FIELD_ALIASES[key];
        if (aliases) {
            for (const alias of aliases) {
                if (data[alias] !== undefined && data[alias] !== null && data[alias] !== '') return data[alias];
            }
        }
        
        const cleanK = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const dk of Object.keys(data)) {
            const cleanDk = dk.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleanK === cleanDk && cleanK !== '') {
                return data[dk];
            }
        }
        return '';
    };

    const setFieldValue = (data: any, key: string, val: any): void => {
        if (!data) return;
        if (data[key] !== undefined) {
            data[key] = val;
            return;
        }
        const cleanK = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const dk of Object.keys(data)) {
            const cleanDk = dk.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleanK === cleanDk && cleanK !== '') {
                data[dk] = val;
                return;
            }
        }
        data[key] = val;
    };

    useEffect(() => {
        if (isItem) {
            setEditingTab('Item Details');
        } else {
            setEditingTab('Basic Details');
        }
    }, [title]);

    // Default 'India' and map products
    useEffect(() => {
        if (editingItem) {
            let changed = false;
            const newData = { ...editingItem.data };

            if (!newData['Country']) {
                newData['Country'] = 'India';
                changed = true;
            }

            // Map flat product columns to products array if products is empty
            if (!newData['products'] || (Array.isArray(newData['products']) && newData['products'].length === 0)) {
                const hasProductData = newData['Item Code'] || newData['Item Name'] || newData['HSN/SAC Code'] || newData['HSN/SAC'];
                if (hasProductData) {
                    newData['products'] = [{
                        'Item Code': newData['Item Code'] || '',
                        'Item Name': newData['Item Name'] || '',
                        'HSN/SAC Code': newData['HSN/SAC Code'] || newData['HSN/SAC'] || '',
                        'UOM': newData['UOM'] || '',
                        'Customer Item Code': newData['Customer Item Code'] || newData['Cust Item Code'] || '',
                        'Customer Item Name': newData['Customer Item Name'] || newData['Cust Item Name'] || '',
                        'Supplier Item Code': newData['Supplier Item Code'] || newData['Supp Item Code'] || '',
                        'Supplier Item Name': newData['Supplier Item Name'] || newData['Supp Item Name'] || '',
                        'Packing Notes': newData['Packing Notes'] || '',
                    }];
                    changed = true;
                }
            }

            if (changed) {
                setEditingItem({ ...editingItem, data: newData });
            }
        }
    }, [editingItem?.index, editingItem?.type]);

    useEffect(() => {
        if (initialSummary) {
            const updatedSummary = { ...initialSummary };
            
            // Normalize helper for fuzzy matching
            const norm = (s: any) => (s || '').toString().toLowerCase().replace(/[\s\-_()]/g, '');

            // Frontend validation pass: move rows with invalid mandatory dropdowns to Failed
            const newSuccessful: any[] = [];
            const newErrors: any[] = [];
            
            const allItems = [
                ...(updatedSummary.successful_imports || []),
                ...(updatedSummary.errors || [])
            ];
            
            allItems.forEach((item: any) => {
                const data = { ...item.row_data }; // clone to avoid mutating initial data directly
                const rowIdx = item.row_index;
                const missingFields: string[] = item.missing_fields ? [...item.missing_fields] : [];
                let existingMessage = item.message ? item.message : '';
                
                const checkDropdown = (targetData: any, prefix: string, key: string, required: boolean, validOptions: {value: string}[]) => {
                    const val = getFieldValue(targetData, key);
                    const valStr = val ? val.toString().trim().toLowerCase() : '';
                    const isRawEmpty = !val || valStr === '' || valStr === 'n/a' || valStr === 'none' || valStr === 'nan' || valStr === 'null' || valStr.startsWith('select ');
                    
                    const fieldKey = prefix ? `${prefix} ${key}` : key;
                    
                    if (isRawEmpty) {
                        if (required && !missingFields.includes(fieldKey)) missingFields.push(fieldKey);
                        return;
                    }
                    
                    const matched = validOptions.find(o => o.value?.toString().toLowerCase() === valStr || norm(o.value) === norm(valStr));
                    if (!matched) {
                        if (required && !missingFields.includes(fieldKey)) missingFields.push(fieldKey);
                        setFieldValue(targetData, key, ''); // Clear invalid value
                    } else {
                        if (val !== matched.value) setFieldValue(targetData, key, matched.value); // Auto-correct
                    }
                };

                const countryOptions = Country.getAllCountries().map(c => ({ value: c.name, isoCode: c.isoCode }));
                
                const branchesToValidate = [
                    { data: data, prefix: '' },
                    ...(data['extra_branches'] || []).map((b: any, i: number) => ({ data: b, prefix: `Branch ${i + 1}` }))
                ];

                branchesToValidate.forEach((branchInfo) => {
                    const bData = branchInfo.data;
                    const bPrefix = branchInfo.prefix;

                    // Default Country to India if empty, to match backend behavior and allow state/city validation
                    if (!getFieldValue(bData, 'Country')) {
                        setFieldValue(bData, 'Country', 'India');
                    }
                    
                    checkDropdown(bData, bPrefix, 'Country', true, countryOptions);
                    
                    const countryNorm = norm(getFieldValue(bData, 'Country'));
                    const country = countryOptions.find(c => norm(c.value) === countryNorm);
                    const stateOptions = country ? State.getStatesOfCountry(country.isoCode).map(s => ({ value: s.name, isoCode: s.isoCode })) : [];
                    checkDropdown(bData, bPrefix, 'State', true, stateOptions);
                    
                    const stateNorm = norm(getFieldValue(bData, 'State'));
                    const state = stateOptions.find(s => norm(s.value) === stateNorm);
                    const cityOptions = (country && state) ? City.getCitiesOfState(country.isoCode, state.isoCode).map(c => ({ value: c.name })) : [];
                    
                    if (cityOptions.length > 0) {
                        checkDropdown(bData, bPrefix, 'City', true, cityOptions);
                    } else {
                        // No dropdown options — just require non-empty text
                        const cityVal = getFieldValue(bData, 'City');
                        const cityStr = cityVal ? cityVal.toString().trim().toLowerCase() : '';
                        const cityEmpty = !cityVal || cityStr === '' || cityStr === 'n/a' || cityStr === 'none' || cityStr === 'nan' || cityStr === 'null' || cityStr.startsWith('select ');
                        const fieldKey = bPrefix ? `${bPrefix} City` : 'City';
                        if (cityEmpty && !missingFields.includes(fieldKey)) missingFields.push(fieldKey);
                    }
                });
                
                // Validate generic dropdown options passed from props (e.g., Registration Type, Category, etc.)
                if (dropdownOptions) {
                    Object.entries(dropdownOptions).forEach(([key, options]) => {
                        checkDropdown(data, '', key, false, options);
                    });
                }

                // Validate products against inventory (Item Code / Item Name)
                if (data['products'] && Array.isArray(data['products'])) {
                    data['products'].forEach((prod: any, idx: number) => {
                        const itemCode = prod['Item Code'];
                        const itemName = prod['Item Name'];
                        
                        if (itemCode) {
                            const match = dropdownOptions?.['Item Code']?.find((o: any) => 
                                o.value?.toString().toLowerCase() === itemCode.toString().toLowerCase() || 
                                o.label?.toString().toLowerCase() === itemCode.toString().toLowerCase()
                            );
                            if (!match) missingFields.push(`Product ${idx + 1} Item Code`);
                        }
                        
                        if (itemName) {
                            const match = dropdownOptions?.['Item Name']?.find((o: any) => 
                                o.value?.toString().toLowerCase() === itemName.toString().toLowerCase() || 
                                o.label?.toString().toLowerCase() === itemName.toString().toLowerCase()
                            );
                            if (!match) missingFields.push(`Product ${idx + 1} Item Name`);
                        }
                    });
                }

                // Check ALL required fields for emptiness
                const isVendorCheck = title.toLowerCase().includes('vendor');
                const isItemCheck = title.toLowerCase().includes('item') || title.toLowerCase().includes('inventory');
                const requiredFieldsCheck = isItemCheck ?
                    ['Item Code', 'Item Name', 'UOM'] :
                    isVendorCheck ?
                    ['Vendor Code', 'Vendor Name', 'Category', 'PAN Number', 'Email Address', 'Contact Number', 'Reference Name', 'Address Line 1', 'Address Line 2', 'Country', 'State', 'City'] :
                    ['Customer Name', 'Category', 'Email Address', 'Contact Number', 'Branch Name', 'Address Line 1', 'Address Line 2', 'Country', 'State', 'City'];

                requiredFieldsCheck.forEach(f => {
                    const val = getFieldValue(data, f);
                    const isValEmpty = val === undefined || val === null || (() => {
                        const s = val.toString().trim().toLowerCase();
                        return s === '' || s === 'n/a' || s === 'none' || s === 'nan' || s === 'null' || s.startsWith('select ');
                    })();
                    if (isValEmpty && !missingFields.includes(f)) {
                        missingFields.push(f);
                    }
                });

                // Validate Contact Number (must be 10 digits)
                const contactNum = getFieldValue(data, 'Contact Number');
                if (contactNum) {
                    const digits = contactNum.toString().replace(/\D/g, '');
                    if (digits.length < 10 && !missingFields.includes('Contact Number')) {
                        missingFields.push('Contact Number');
                    }
                }

                // Check extra branches for mandatory fields
                if (data['extra_branches'] && Array.isArray(data['extra_branches'])) {
                    data['extra_branches'].forEach((branch: any, bIdx: number) => {
                        const branchRequiredFields = ['Branch Name', 'Address Line 1', 'Address Line 2', 'Country', 'State', 'City'];
                        branchRequiredFields.forEach(f => {
                            const val = getFieldValue(branch, f);
                            const isValEmpty = val === undefined || val === null || (() => {
                                const s = val.toString().trim().toLowerCase();
                                return s === '' || s === 'n/a' || s === 'none' || s === 'nan' || s === 'null' || s.startsWith('select ');
                            })();
                            if (isValEmpty && !missingFields.includes(`Branch ${bIdx + 1} ${f}`)) {
                                missingFields.push(`Branch ${bIdx + 1} ${f}`);
                            }
                        });
                    });
                }

                if (missingFields.length > 0 || existingMessage) {
                    let finalMessage = existingMessage;
                    if (missingFields.length > 0) {
                        const newMissingStr = `Row ${rowIdx}: ${missingFields.join(', ')} is invalid or missing`;
                        finalMessage = finalMessage ? `${finalMessage} | ${newMissingStr}` : newMissingStr;
                    }
                    newErrors.push({
                        ...item,
                        message: finalMessage,
                        missing_fields: missingFields,
                        row_data: data,
                        row_index: rowIdx
                    });
                } else {
                    newSuccessful.push({
                        ...item,
                        row_data: data,
                        isSelected: false
                    });
                }
            });

            updatedSummary.successful_imports = newSuccessful;
            updatedSummary.errors = newErrors;
            updatedSummary.success = newSuccessful.length;
            updatedSummary.failed = newErrors.length;

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

        // Validation before saving — use getFieldValue so aliased/fuzzy keys are resolved
        const isVendor = title.toLowerCase().includes('vendor');
        const isItem = title.toLowerCase().includes('item') || title.toLowerCase().includes('inventory');
        const requiredFields = isItem ?
            ['Item Code', 'Item Name', 'UOM'] :
            isVendor ?
            ['Vendor Code', 'Vendor Name', 'Category', 'PAN Number', 'Email Address', 'Contact Number', 'Reference Name', 'Address Line 1', 'Address Line 2', 'Country', 'State', 'City'] :
            ['Customer Name', 'Category', 'Email Address', 'Contact Number', 'Branch Name', 'Address Line 1', 'Address Line 2', 'Country', 'State', 'City'];

        const isEmptyVal = (val: any) => {
            if (val === undefined || val === null) return true;
            const s = val.toString().trim().toLowerCase();
            return s === '' || s === 'n/a' || s === 'none' || s === 'nan' || s === 'null' || s.startsWith('select ');
        };

        const missing = requiredFields.filter(f => {
            const val = getFieldValue(updatedData, f);
            return isEmptyVal(val);
        });

        // Validate extra branches mandatory fields
        if (updatedData['extra_branches'] && Array.isArray(updatedData['extra_branches'])) {
            updatedData['extra_branches'].forEach((branch: any, bIdx: number) => {
                const branchRequiredFields = ['Branch Name', 'Address Line 1', 'Address Line 2', 'Country', 'State', 'City'];
                branchRequiredFields.forEach(f => {
                    const val = getFieldValue(branch, f);
                    if (isEmptyVal(val)) {
                        missing.push(`Branch ${bIdx + 1} ${f}`);
                    }
                });
            });
        }

        if (missing.length > 0) {
            setValidationErrors(missing);
            alert(`Please fill in the following mandatory fields before saving:\n• ${missing.join('\n• ')}`);
            return;
        }

        // Validate Contact Number: must be 10 digits
        const contactNum = getFieldValue(updatedData, 'Contact Number');
        if (contactNum) {
            const digits = contactNum.toString().replace(/\D/g, '');
            if (digits.length < 10) {
                setValidationErrors(['Contact Number']);
                alert('Contact Number must have at least 10 digits.');
                return;
            }
        }

        // Validate PAN format for vendors
        if (isVendor) {
            const pan = updatedData['PAN Number'] || updatedData['pan_no'] || '';
            const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
            if (!panRegex.test(pan.toString().trim().toUpperCase())) {
                setValidationErrors([`Invalid PAN format: "${pan}". Must be in AAAAA0000A format (5 letters, 4 digits, 1 letter).`]);
                return;
            }
        }

        // Validate Customer Code / Vendor Code uniqueness against existing records
        const codeKey = isVendor ? 'Vendor Code' : 'Customer Code';
        const enteredCode = (getFieldValue(updatedData, codeKey) || '').toString().trim();
        if (enteredCode && existingCodes.length > 0) {
            const isDuplicate = existingCodes.some(
                c => c && c.toString().toLowerCase() === enteredCode.toLowerCase()
            );
            if (isDuplicate) {
                setValidationErrors([codeKey]);
                return;
            }
        }
        
        // Validate products: check that Item Code and Item Name exist in inventory
        const products = updatedData['products'];
        if (products && Array.isArray(products)) {
            const invalidProducts: string[] = [];
            products.forEach((prod: any, idx: number) => {
                const itemCode = prod['Item Code'];
                const itemName = prod['Item Name'];
                const norm = (s: any) => (s || '').toString().toLowerCase().replace(/[\s\-_()]/g, '');
                
                if (itemCode) {
                    const match = dropdownOptions?.['Item Code']?.find((o: any) =>
                        String(o.value).toLowerCase() === String(itemCode).toLowerCase() ||
                        norm(o.value) === norm(itemCode) ||
                        String(o.label).toLowerCase() === String(itemCode).toLowerCase() ||
                        norm(o.label) === norm(itemCode)
                    );
                    if (!match) invalidProducts.push(`Product ${idx + 1} Item Code "${itemCode}" not found in inventory`);
                }
                
                if (itemName) {
                    const match = dropdownOptions?.['Item Name']?.find((o: any) =>
                        String(o.value).toLowerCase() === String(itemName).toLowerCase() ||
                        norm(o.value) === norm(itemName) ||
                        String(o.label).toLowerCase() === String(itemName).toLowerCase() ||
                        norm(o.label) === norm(itemName)
                    );
                    if (!match) invalidProducts.push(`Product ${idx + 1} Item Name "${itemName}" not found in inventory`);
                }
            });
            
            if (invalidProducts.length > 0) {
                setValidationErrors(invalidProducts);
                return;
            }
        }
        
        setValidationErrors([]);

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
        setValidationErrors([]);
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
                                const sectionTitles = isItem ? ['Item Details'] : [
                                    'Basic Details',
                                    'GST & Address Details',
                                    'Products/Services',
                                    'TDS & Other Statutory Details',
                                    'Banking Information',
                                    'Terms & Conditions'
                                ];

                                return (
                                    <div className="flex items-center gap-10 border-b border-gray-100 mb-10 px-2 overflow-x-auto no-scrollbar">
                                        {sectionTitles.map((tab) => (
                                            <button
                                                key={tab}
                                                onClick={() => setEditingTab(tab)}
                                                className={`pb-4 text-[11px] font-black uppercase tracking-[0.2em] transition-all relative whitespace-nowrap ${editingTab === tab ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
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
                                            { label: 'VENDOR CODE', key: 'Vendor Code', placeholder: 'VEN-XXXXXX', required: true },
                                            { label: 'VENDOR NAME', key: 'Vendor Name', placeholder: 'Enter vendor name', required: true },
                                            { label: 'VENDOR CATEGORY', key: 'Category', type: 'select', placeholder: 'SELECT CATEGORY', required: true },
                                            { label: 'BILLING CURRENCY', key: 'Billing Currency', type: 'select', placeholder: 'SELECT CURRENCY' },
                                            { label: 'PAN NO.', key: 'PAN Number', placeholder: 'AAAAA0000A', required: true },
                                            { label: 'CONTACT PERSON', key: 'Contact Person', placeholder: 'Primary contact name' },
                                            { label: 'EMAIL ADDRESS', key: 'Email Address', placeholder: 'vendor@example.com', required: true },
                                            { label: 'CONTACT NO', key: 'Contact Number', placeholder: '+91 XXXXX XXXXX', required: true },
                                            { label: 'IS THIS VENDOR ALSO A CUSTOMER?', key: 'Is Also Customer', type: 'toggle' },
                                            { label: 'GST TCS APPLICABLE?', key: 'TCS Applicable', type: 'toggle' },
                                        ]
                                    },
                                    {
                                        title: 'GST & Address Details',
                                        fields: [
                                            { label: 'GSTIN', key: 'GSTIN', placeholder: '22AAAAA0000A1Z5' },
                                            { label: 'REFERENCE NAME', key: 'Reference Name', placeholder: 'Main Branch', required: true },
                                            { label: 'ADDRESS LINE 1', key: 'Address Line 1', placeholder: 'Building/Street', required: true },
                                            { label: 'ADDRESS LINE 2', key: 'Address Line 2', placeholder: 'Area/Landmark', required: true },
                                            { label: 'ADDRESS LINE 3', key: 'Address Line 3', placeholder: 'Locality' },
                                            { label: 'COUNTRY', key: 'Country', type: 'select', placeholder: 'SELECT COUNTRY', required: true },
                                            { label: 'STATE', key: 'State', type: 'select', placeholder: 'SELECT STATE', required: true },
                                            { label: 'CITY', key: 'City', type: 'select', placeholder: 'SELECT CITY', required: true },
                                            { label: 'PINCODE', key: 'Pincode', placeholder: '600001' },
                                            { label: 'CONTACT PERSON', key: 'Branch Contact Person', placeholder: 'Branch contact name' },
                                            { label: 'EMAIL ADDRESS', key: 'Branch Email Address', placeholder: 'branch@example.com' },
                                            { label: 'CONTACT NO', key: 'Branch Contact Number', placeholder: '+91 XXXXX XXXXX' },
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
                                        title: 'Banking Information',
                                        fields: [
                                            { label: 'BANK ACCOUNT NO', key: 'Bank Account No', placeholder: 'XXXXXXXXXXXX' },
                                            { label: 'BANK NAME', key: 'Bank Name', placeholder: 'Enter bank name' },
                                            { label: 'IFSC CODE', key: 'IFSC Code', placeholder: 'SBIN000XXXX' },
                                            { label: 'BANK BRANCH', key: 'Bank Branch', placeholder: 'Enter branch name' },
                                            { label: 'SWIFT CODE', key: 'Swift Code', placeholder: 'Enter swift code' },
                                            { label: 'ASSOCIATED BRANCH', key: 'Associated Branch', type: 'select', placeholder: 'SELECT BRANCH' },
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
                                            {
                                                label: 'Products & Services List',
                                                key: 'products',
                                                type: 'table',
                                                columns: [
                                                    { label: 'ITEM CODE', key: 'Item Code', placeholder: 'ITM-XXXX' },
                                                    { label: 'ITEM NAME', key: 'Item Name', placeholder: 'Item name' },
                                                    { label: 'HSN/SAC', key: 'HSN/SAC Code', placeholder: 'XXXX' },
                                                    { label: 'SUPPLIER ITEM CODE', key: 'Supplier Item Code', placeholder: 'Optional' },
                                                    { label: 'SUPPLIER ITEM NAME', key: 'Supplier Item Name', placeholder: 'Optional' },
                                                    { label: 'PACKING NOTES', key: 'Packing Notes', placeholder: 'Notes' },
                                                ]
                                            }
                                        ]
                                    }
                                ] : isItem ? [
                                    {
                                        title: 'Item Details',
                                        fields: [
                                            { label: 'ITEM CODE', key: 'Item Code', placeholder: 'e.g. ITEM001', required: true },
                                            { label: 'ITEM NAME', key: 'Item Name', placeholder: 'Enter item name', required: true },
                                            { label: 'DESCRIPTION', key: 'Description', placeholder: 'Enter item description' },
                                            { label: 'CATEGORY PATH', key: 'Category Path', type: 'select', placeholder: 'SELECT CATEGORY PATH' },
                                            { label: 'UOM', key: 'UOM', type: 'select', placeholder: 'SELECT UOM', required: true },
                                            { label: 'ALTERNATE UOM', key: 'Alternate UOM', type: 'select', placeholder: 'SELECT ALTERNATE UOM' },
                                            { label: 'CONVERSION FACTOR', key: 'Conversion Factor', placeholder: 'e.g. 1.0000' },
                                            { label: 'RATE', key: 'Rate', placeholder: 'e.g. 100.00' },
                                            { label: 'HSN CODE', key: 'HSN Code', placeholder: 'e.g. 8471' },
                                            { label: 'GST RATE (%)', key: 'GST Rate', placeholder: 'e.g. 18' },
                                            { label: 'CESS RATE (%)', key: 'Cess Rate', placeholder: 'e.g. 2' },
                                            { label: 'REORDER LEVEL', key: 'Reorder Level', placeholder: 'e.g. 10' },
                                            { label: 'IS SALEABLE (YES/NO)', key: 'Is Saleable', placeholder: 'Yes or No' },
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
                                            { label: 'REGISTRATION TYPE', key: 'Registration Type', type: 'select', placeholder: 'Select Type' },
                                            { label: 'BRANCH NAME', key: 'Branch Name', placeholder: 'Main Branch', required: true },
                                            { label: 'ADDRESS LINE 1', key: 'Address Line 1', placeholder: 'Building/Street', required: true },
                                            { label: 'ADDRESS LINE 2', key: 'Address Line 2', placeholder: 'Area/Landmark', required: true },
                                            { label: 'ADDRESS LINE 3', key: 'Address Line 3', placeholder: 'Locality' },
                                            { label: 'COUNTRY', key: 'Country', type: 'select', placeholder: 'SELECT COUNTRY', required: true },
                                            { label: 'STATE', key: 'State', type: 'select', placeholder: 'SELECT STATE', required: true },
                                            { label: 'CITY', key: 'City', type: 'select', placeholder: 'SELECT CITY', required: true },
                                            { label: 'PINCODE', key: 'Pincode', placeholder: '600001' },
                                            { label: 'CONTACT PERSON', key: 'Branch Contact Person', placeholder: 'Branch contact name' },
                                            { label: 'EMAIL ADDRESS', key: 'Branch Email Address', placeholder: 'branch@example.com' },
                                            { label: 'CONTACT NO', key: 'Branch Contact Number', placeholder: '+91 XXXXX XXXXX' },
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
                                        title: 'Banking Information',
                                        fields: [
                                            { label: 'BANK ACCOUNT NO', key: 'Bank Account No', placeholder: 'XXXXXXXXXXXX' },
                                            { label: 'BANK NAME', key: 'Bank Name', placeholder: 'Enter bank name' },
                                            { label: 'IFSC CODE', key: 'IFSC Code', placeholder: 'SBIN000XXXX' },
                                            { label: 'BANK BRANCH', key: 'Bank Branch', placeholder: 'Enter branch name' },
                                            { label: 'SWIFT CODE', key: 'Swift Code', placeholder: 'Enter swift code' },
                                            { label: 'ASSOCIATED BRANCH', key: 'Associated Branch', type: 'select', placeholder: 'SELECT BRANCH' },
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
                                            {
                                                label: 'Products & Services List',
                                                key: 'products',
                                                type: 'table',
                                                columns: [
                                                    { label: 'ITEM CODE', key: 'Item Code', placeholder: 'ITM-XXXX' },
                                                    { label: 'ITEM NAME', key: 'Item Name', placeholder: 'Item name' },
                                                    { label: 'HSN/SAC CODE', key: 'HSN/SAC Code', placeholder: 'XXXX' },
                                                    {
                                                        label: title.toLowerCase().includes('vendor') ? 'SUPPLIER ITEM CODE' : 'CUSTOMER ITEM CODE',
                                                        key: title.toLowerCase().includes('vendor') ? 'Supplier Item Code' : 'Customer Item Code',
                                                        placeholder: 'Optional'
                                                    },
                                                    {
                                                        label: title.toLowerCase().includes('vendor') ? 'SUPPLIER ITEM NAME' : 'CUSTOMER ITEM NAME',
                                                        key: title.toLowerCase().includes('vendor') ? 'Supplier Item Name' : 'Customer Item Name',
                                                        placeholder: 'Optional'
                                                    },
                                                    { label: 'PACKING NOTES', key: 'Packing Notes', placeholder: 'Notes' },
                                                ]
                                            }
                                        ]
                                    }
                                ];

                                const activeSection = allSections.find(s => s.title === editingTab) || allSections[0];

                                return (
                                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        {[editingItem.data, ...(activeSection.title === 'GST & Address Details' ? (editingItem.data.extra_branches || []) : activeSection.title === 'Banking Information' ? (editingItem.data.extra_banks || []) : [])].map((branchData: any, bIdx: number) => (
                                            <div key={bIdx} className={bIdx > 0 ? "mt-12 pt-8 border-t border-dashed border-indigo-200 relative animate-in fade-in" : ""}>
                                                {bIdx > 0 && (
                                                    <div className="flex justify-between items-center mb-6">
                                                        <h3 className="text-sm font-black text-indigo-900 uppercase tracking-widest">
                                                            {activeSection.title === 'GST & Address Details' ? `Branch ${bIdx + 1}` : `Bank ${bIdx + 1}`}
                                                        </h3>
                                                        <button 
                                                            type="button"
                                                            onClick={() => {
                                                                if (activeSection.title === 'GST & Address Details') {
                                                                    const newBranches = [...(editingItem.data.extra_branches || [])];
                                                                    newBranches.splice(bIdx - 1, 1);
                                                                    editingItem.data.extra_branches = newBranches;
                                                                } else if (activeSection.title === 'Banking Information') {
                                                                    const newBanks = [...(editingItem.data.extra_banks || [])];
                                                                    newBanks.splice(bIdx - 1, 1);
                                                                    editingItem.data.extra_banks = newBanks;
                                                                }
                                                                setEditingItem({...editingItem});
                                                            }}
                                                            className="text-[10px] font-bold uppercase tracking-widest text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                                            Remove {activeSection.title === 'GST & Address Details' ? 'Branch' : 'Bank'}
                                                        </button>
                                                    </div>
                                                )}
                                        <div className="grid grid-cols-2 gap-x-12 gap-y-8">
                                            {activeSection.fields.map((field, fIdx) => {
                                                const key = field.key;
                                                const value = getFieldValue(branchData, key);

                                                // Error/Warning Logic: only highlight fields from the error message for the main (first) branch
                                                const errorMessage = editingItem.type === 'error' ? (summary.errors[editingItem.index]?.message?.toLowerCase() || '') : '';
                                                const isMentionedInError = bIdx === 0 && (errorMessage.includes(key.toLowerCase()) || errorMessage.includes(field.label.toLowerCase()));

                                                // Normalize helper: strips spaces, hyphens for fuzzy matching (e.g. 'Tamilnadu' matches 'Tamil Nadu')
                                                const norm = (s: any) => (s || '').toString().toLowerCase().replace(/[\s\-_()]/g, '');

                                                // Check if this field should be a dropdown
                                                let fieldOptions = dropdownOptions?.[key] || dropdownOptions?.[key.toLowerCase()] || dropdownOptions?.[key.replace(/ /g, '_').toLowerCase()];

                                                // Dynamic Country-State-City Logic
                                                if (key === 'Country') {
                                                    fieldOptions = Country.getAllCountries().map(c => ({ label: c.name, value: c.name }));
                                                } else if (key === 'State') {
                                                    const selectedCountryName = getFieldValue(branchData, 'Country');
                                                    const countryNorm = norm(selectedCountryName);
                                                    const country = Country.getAllCountries().find(c => norm(c.name) === countryNorm);
                                                    if (country) {
                                                        fieldOptions = State.getStatesOfCountry(country.isoCode).map(s => ({ label: s.name, value: s.name }));
                                                    }
                                                } else if (key === 'City') {
                                                    const selectedCountryName = getFieldValue(branchData, 'Country');
                                                    const selectedStateName = getFieldValue(branchData, 'State');
                                                    const countryNorm = norm(selectedCountryName);
                                                    const stateNorm = norm(selectedStateName);
                                                    const country = Country.getAllCountries().find(c => norm(c.name) === countryNorm);
                                                    const state = country ? State.getStatesOfCountry(country.isoCode).find(s => norm(s.name) === stateNorm) : null;
                                                    if (country && state) {
                                                        const cities = City.getCitiesOfState(country.isoCode, state.isoCode).map(c => ({ label: c.name, value: c.name }));
                                                        // Only use dropdown if cities exist; otherwise leave undefined so it renders as text input
                                                        if (cities.length > 0) {
                                                            fieldOptions = cities;
                                                        }
                                                    }
                                                }

                                                // isEmpty: check raw value, AND for select fields check if value is a valid option
                                                const valStr = value ? value.toString().trim().toLowerCase() : '';
                                                const isRawEmpty = !value || valStr === '' || valStr === 'n/a' || valStr === 'none' || valStr === 'nan' || valStr === 'null' || valStr.startsWith('select ');
                                                const isSelectField = field.type === 'select' || !!fieldOptions;
                                                // Fuzzy match: try exact first, then normalized (strips spaces)
                                                const matchedOption = (isSelectField && fieldOptions && !isRawEmpty)
                                                    ? (fieldOptions.find((o: any) => o.value?.toString().toLowerCase() === valStr)
                                                        || fieldOptions.find((o: any) => norm(o.value) === norm(valStr)))
                                                    : null;
                                                const isNotInOptions = isSelectField && fieldOptions && fieldOptions.length > 0 && !matchedOption;
                                                const isEmpty = isRawEmpty || (isSelectField && (!value || isNotInOptions));
                                                const isInvalidPan = key === 'PAN Number' && !isEmpty && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(valStr.toUpperCase());
                                                const isCodeKey = key === 'Customer Code' || key === 'Vendor Code';
                                                const isWithinFileDuplicate = isMentionedInError && (
                                                    errorMessage.includes('more than once') ||
                                                    errorMessage.includes('in this file')
                                                );
                                                const isDuplicateField = isMentionedInError && (
                                                    errorMessage.includes('already exists') || 
                                                    errorMessage.includes('exist') || 
                                                    errorMessage.includes('duplicate') ||
                                                    errorMessage.includes('in this file')
                                                );
                                                const isDuplicateCode = (isCodeKey && validationErrors.includes(key)) || isDuplicateField;
                                                const hasWarning = (field.required && isEmpty) || isInvalidPan || isDuplicateField || (isMentionedInError && isEmpty) || validationErrors.includes(key);
                                                const warningMessage = isWithinFileDuplicate
                                                    ? `This ${field.label} is already used in this file. Each entry must be unique.`
                                                    : isDuplicateCode
                                                        ? `This ${field.label} already exists in the system.`
                                                        : isInvalidPan ? 'Invalid PAN format (e.g. AAAAA0000A)' : 'This field is mandatory';
                                                
                                                // Auto-correct the stored value to properly-cased option value
                                                if (matchedOption && value !== matchedOption.value) {
                                                    setFieldValue(branchData, key, matchedOption.value);
                                                }
                                                // If value is invalid (not in options) and field is required, clear it so save is blocked
                                                if (isNotInOptions && !isRawEmpty) {
                                                    setFieldValue(branchData, key, '');
                                                }

                                                // Mutual exclusivity for TDS/TCS
                                                const isTDS = key === 'TDS Section';
                                                const isTCS = key === 'TCS Section';
                                                const tdsValue = getFieldValue(branchData, 'TDS Section');
                                                const tcsValue = getFieldValue(branchData, 'TCS Section');
                                                const isFieldDisabled = (isTDS && !!tcsValue && tcsValue !== '' && (!tdsValue || tdsValue === '')) ||
                                                    (isTCS && !!tdsValue && tdsValue !== '' && (!tcsValue || tcsValue === ''));


                                                return (
                                                    <div key={fIdx} className={`space-y-2.5 ${field.type === 'table' ? 'col-span-full' : ''}`}>
                                                        <label className={`text-[10px] font-black uppercase tracking-[0.15em] transition-colors ${hasWarning ? 'text-rose-500' : 'text-gray-500'}`}>
                                                            {field.label}
                                                            {field.required && <span className="ml-1 text-rose-500 font-black">*</span>}
                                                        </label>

                                                        {field.type === 'table' ? (
                                                            <div className="col-span-full border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                                                                <div className="overflow-x-hidden">
                                                                    <table className="w-full text-xs">
                                                                        <thead>
                                                                            <tr className="bg-gray-50/50 border-b border-gray-100">
                                                                                <th className="px-4 py-3 text-left font-black text-gray-500 uppercase tracking-[0.1em] whitespace-nowrap">NO</th>
                                                                                {(field.columns || []).map((col: any) => (
                                                                                    <th key={col.key} className="px-4 py-3 text-left font-black text-gray-500 uppercase tracking-[0.1em] whitespace-nowrap">
                                                                                        {col.label}
                                                                                    </th>
                                                                                ))}
                                                                                <th className="px-4 py-3 w-10"></th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-gray-100">
                                                                            {(value || [{}]).map((row: any, rIdx: number) => (
                                                                                <tr key={rIdx} className="hover:bg-gray-50/50 transition-colors">
                                                                                    <td className="px-4 py-4 text-gray-400 font-bold">{rIdx + 1}</td>
                                                                                    {(field.columns || []).map((col: any) => {
                                                                                        const colOptions = dropdownOptions?.[col.key] || dropdownOptions?.[col.key.toLowerCase()];
                                                                                        // Check if this cell's value is invalid (not found in options)
                                                                                        const rawColVal = row[col.key] || '';
                                                                                        let isColInvalid = false;
                                                                                        if (colOptions && rawColVal) {
                                                                                            const norm = (s: any) => (s || '').toString().toLowerCase().replace(/[\s\-_()]/g, '');
                                                                                            const found = colOptions.find((o: any) =>
                                                                                                String(o.value).toLowerCase() === String(rawColVal).toLowerCase() ||
                                                                                                norm(o.value) === norm(rawColVal) ||
                                                                                                String(o.label).toLowerCase() === String(rawColVal).toLowerCase() ||
                                                                                                norm(o.label) === norm(rawColVal)
                                                                                            );
                                                                                            isColInvalid = !found;
                                                                                        }
                                                                                        return (
                                                                                            <td key={col.key} className="px-2 py-2">
                                                                                                {isColInvalid && (
                                                                                                    <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-1">⚠ Not found in inventory</p>
                                                                                                )}
                                                                                                {col.type === 'select' || colOptions ? (
                                                                                                    <select
                                                                                                        value={(() => {
                                                                                                            const raw = row[col.key] || '';
                                                                                                            if (!raw) return '';
                                                                                                            const exact = (colOptions || []).find((o: any) => String(o.value) === String(raw));
                                                                                                            if (exact) return exact.value;
                                                                                                            const norm = (s: any) => (s || '').toString().toLowerCase().replace(/[\s\-_()]/g, '');
                                                                                                            const fuzzy = (colOptions || []).find((o: any) => norm(o.value) === norm(raw));
                                                                                                            return fuzzy ? fuzzy.value : raw;
                                                                                                        })()}
                                                                                                        onChange={(e) => {
                                                                                                            const newVal = e.target.value;
                                                                                                            const newProducts = [...(value || [{}])];
                                                                                                            let updatedRow = { ...newProducts[rIdx], [col.key]: newVal };

                                                                                                            if (col.key === 'Item Code' || col.key === 'Item Name') {
                                                                                                                const selectedOption = (colOptions || []).find((opt: any) => opt.value === newVal);
                                                                                                                if (selectedOption?.full) {
                                                                                                                    const item = selectedOption.full;
                                                                                                                    updatedRow = {
                                                                                                                        ...updatedRow,
                                                                                                                        'Item Code': item.item_code || item.code || '',
                                                                                                                        'Item Name': item.item_name || item.name || '',
                                                                                                                        'HSN/SAC Code': item.hsn_code || item.hsnCode || item.hsn_sac || '',
                                                                                                                        'UOM': (typeof item.uom === 'object' ? (item.uom?.symbol || item.uom?.name) : item.uom) ||
                                                                                                                            (typeof item.unit === 'object' ? (item.unit?.symbol || item.unit?.name) : item.unit) ||
                                                                                                                            item.uom || item.unit || ''
                                                                                                                    };
                                                                                                                }
                                                                                                            }

                                                                                                            newProducts[rIdx] = updatedRow;
                                                                                                            branchData[key] = newProducts;
                                                                                                            setEditingItem({ ...editingItem });
                                                                                                        }}
                                                                                                        className={`w-full px-3 py-2 rounded-xl text-xs font-bold focus:ring-2 outline-none transition-all border ${isColInvalid ? 'bg-rose-50 border-rose-400 text-rose-700 focus:ring-rose-300' : 'bg-gray-50/50 border-gray-200 focus:ring-indigo-500/20 focus:border-indigo-500'}`}
                                                                                                    >
                                                                                                        <option value="">{col.placeholder || 'Select'}</option>
                                                                                                        {(colOptions || []).map((opt: any) => (
                                                                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                                                                        ))}
                                                                                                    </select>
                                                                                                ) : (
                                                                                                    <input
                                                                                                        value={row[col.key] || ''}
                                                                                                        placeholder={col.placeholder}
                                                                                                        onChange={(e) => {
                                                                                                            const newVal = e.target.value;
                                                                                                            const newProducts = [...(value || [{}])];
                                                                                                            let updatedRow = { ...newProducts[rIdx], [col.key]: newVal };

                                                                                                            if (col.key === 'HSN/SAC Code' && newVal && newVal.length >= 4) {
                                                                                                                const masterList = dropdownOptions?.['Item Code'] || dropdownOptions?.['Item Name'] || [];
                                                                                                                const match = masterList.find((opt: any) => {
                                                                                                                    const item = opt.full;
                                                                                                                    if (!item) return false;
                                                                                                                    const itemHsn = item.hsn_code || item.hsnCode || item.hsn_sac || '';
                                                                                                                    return itemHsn === newVal;
                                                                                                                });

                                                                                                                if (match?.full) {
                                                                                                                    const item = match.full;
                                                                                                                    updatedRow = {
                                                                                                                        ...updatedRow,
                                                                                                                        'Item Code': item.item_code || item.code || '',
                                                                                                                        'Item Name': item.item_name || item.name || '',
                                                                                                                        'UOM': (typeof item.uom === 'object' ? (item.uom?.symbol || item.uom?.name) : item.uom) ||
                                                                                                                            (typeof item.unit === 'object' ? (item.unit?.symbol || item.unit?.name) : item.unit) ||
                                                                                                                            item.uom || item.unit || ''
                                                                                                                    };
                                                                                                                }
                                                                                                            }

                                                                                                            newProducts[rIdx] = updatedRow;
                                                                                                            branchData[key] = newProducts;
                                                                                                            setEditingItem({ ...editingItem });
                                                                                                        }}
                                                                                                        className="w-full px-3 py-2 bg-gray-50/50 border border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                                                                                    />
                                                                                                )}
                                                                                            </td>
                                                                                        );
                                                                                    })}
                                                                                    <td className="px-4 py-4">
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                const newProducts = (value || [{}]).filter((_: any, i: number) => i !== rIdx);
                                                                                                branchData[key] = newProducts.length ? newProducts : [{}];
                                                                                                setEditingItem({ ...editingItem });
                                                                                            }}
                                                                                            className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                                                                        >
                                                                                            <Icon name="trash" className="w-4 h-4" />
                                                                                        </button>
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        const newProducts = [...(value || [{}]), {}];
                                                                        branchData[key] = newProducts;
                                                                        setEditingItem({ ...editingItem });
                                                                    }}
                                                                    className="w-full py-3 bg-gray-50/50 hover:bg-indigo-50 text-indigo-600 text-xs font-black uppercase tracking-widest border-t border-gray-100 transition-all flex items-center justify-center gap-2"
                                                                >
                                                                    <Icon name="plus" className="w-4 h-4" />
                                                                    Add Row
                                                                </button>
                                                            </div>
                                                        ) : field.type === 'toggle' ? (
                                                            <div className="flex gap-4">
                                                                {['YES', 'NO'].map(opt => {
                                                                    const isActive = (opt === 'YES' && (value === true || value?.toString().toLowerCase() === 'yes')) ||
                                                                        (opt === 'NO' && (value === false || value?.toString().toLowerCase() === 'no' || !value));
                                                                    return (
                                                                        <button
                                                                            key={opt}
                                                                            onClick={() => {
                                                                                branchData[key] = opt === 'YES';
                                                                                setEditingItem({ ...editingItem }); // Trigger re-render
                                                                            }}
                                                                            className={`flex-1 py-3 px-6 rounded-xl text-xs font-black tracking-widest transition-all ${isActive
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
                                                                    value={matchedOption ? matchedOption.value : (isNotInOptions ? '' : (value || ''))}
                                                                    onChange={(e) => {
                                                                        setFieldValue(branchData, key, e.target.value);
                                                                        if (key === 'Country') {
                                                                            setFieldValue(branchData, 'State', '');
                                                                            setFieldValue(branchData, 'City', '');
                                                                        } else if (key === 'State') {
                                                                            setFieldValue(branchData, 'City', '');
                                                                        }
                                                                        setEditingItem({ ...editingItem });
                                                                    }}
                                                                    disabled={isFieldDisabled}
                                                                    className={`w-full px-5 py-4 rounded-2xl text-sm font-bold transition-all focus:ring-4 outline-none appearance-none bg-no-repeat bg-[right_1.25rem_center] bg-[length:1.2em_1.2em] ${isFieldDisabled
                                                                            ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                                                                            : hasWarning
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
                                                                placeholder={field.placeholder}
                                                                disabled={isFieldDisabled}
                                                                onChange={(e) => {
                                                                    setFieldValue(branchData, key, e.target.value);
                                                                    setEditingItem({ ...editingItem });
                                                                }}
                                                                className={`w-full px-5 py-4 rounded-2xl text-sm font-bold transition-all focus:ring-4 outline-none ${isFieldDisabled
                                                                        ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                                                                        : hasWarning
                                                                            ? 'bg-rose-50 border-2 border-rose-100 focus:border-rose-500 focus:ring-rose-500/10'
                                                                            : 'bg-gray-50/50 border-2 border-gray-100 focus:border-indigo-500 focus:ring-indigo-500/10 group-hover:border-indigo-200'
                                                                    }`}
                                                            />
                                                        )}

                                                        {hasWarning && (
                                                            <p className="text-[10px] font-bold text-rose-500 flex items-center gap-1 mt-1 animate-in slide-in-from-top-1">
                                                                <Icon name={"exclamation-circle" as any} className="w-3 h-3" />
                                                                {warningMessage}
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                            </div>
                                        ))}
                                        {activeSection.title === 'GST & Address Details' && (
                                            <div className="mt-8 flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        editingItem.data.extra_branches = [...(editingItem.data.extra_branches || []), {}];
                                                        setEditingItem({...editingItem});}}
                                                    className="px-5 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 hover:text-indigo-700 transition-all flex items-center gap-2 border border-indigo-100 shadow-sm"
                                                >
                                                    <Icon name="plus" className="w-4 h-4" />
                                                    ADD MANUAL BRANCH
                                                </button>
                                            </div>
                                        )}
                                        {activeSection.title === 'Banking Information' && (
                                            <div className="mt-8 flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        editingItem.data.extra_banks = [...(editingItem.data.extra_banks || []), {}];
                                                        setEditingItem({...editingItem});}}
                                                    className="px-5 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 hover:text-indigo-700 transition-all flex items-center gap-2 border border-indigo-100 shadow-sm"
                                                >
                                                    <Icon name="plus" className="w-4 h-4" />
                                                    ADD ANOTHER BANK
                                                </button>
                                            </div>
                                        )}
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
                                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">{isItem ? 'Item Name' : 'Name'}</th>
                                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">{isItem ? 'Item Code' : 'Code'}</th>
                                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">{isItem ? 'Category Path' : 'Category'}</th>
                                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">{isItem ? 'UOM' : 'GSTIN'}</th>
                                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">{isItem ? 'Rate' : 'State'}</th>
                                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {summary.successful_imports.map((item: any, idx: number) => {
                                                    const rd = item.row_data || {};
                                                    const display = isItem ? {
                                                        name: rd['Item Name'] || rd['item_name'] || item.name || 'N/A',
                                                        code: rd['Item Code'] || rd['item_code'] || item.code || 'N/A',
                                                        category: rd['Category Path'] || rd['category_path'] || 'N/A',
                                                        uom: rd['UOM'] || rd['uom'] || 'N/A',
                                                        rate: rd['Rate'] || rd['rate'] || 'N/A'
                                                    } : {
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
                                                                <span className="text-xs font-medium text-gray-500 font-mono">{isItem ? (display as any).uom : display.gstin}</span>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className="text-xs font-bold text-gray-500 uppercase">{isItem ? `₹${(display as any).rate}` : display.state}</span>
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
