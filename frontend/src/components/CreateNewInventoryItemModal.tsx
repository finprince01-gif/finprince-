import React, { useState, useEffect, useRef } from 'react';
import { httpClient } from '../services/httpClient';
import { apiService } from '../services/api';
import { showError, showSuccess } from '../utils/toast';
import { handleApiError } from '../utils/errorHandler';
import CategoryHierarchicalDropdown from './CategoryHierarchicalDropdown';
import SearchableDropdown from './SearchableDropdown';

interface CreateNewInventoryItemModalProps {
    onClose: () => void;
    onItemCreated: (itemName: string, itemCode: string, itemId: number) => void;
    prefilledData?: {
        item_code?: string;
        item_name?: string;
        hsn_code?: string;
        gst_rate?: string | number;
        rate?: string | number;
        uom?: string;
        description?: string;
        cgst_rate?: string | number;
        sgst_rate?: string | number;
        igst_rate?: string | number;
        cess_rate?: string | number;
        computed_gst_rate?: string | number;
        taxable_value?: string | number;
    };
}

const UNIT_OPTIONS = [
    { value: 'nos', label: 'Numbers' },
    { value: 'kg', label: 'Kilograms' },
    { value: 'gm', label: 'Grams' },
    { value: 'm', label: 'Meters' },
    { value: 'cm', label: 'Centimeters' },
    { value: 'l', label: 'Liters' },
    { value: 'ml', label: 'Milliliters' },
    { value: 'box', label: 'Box' },
    { value: 'pch', label: 'Pouch' },
    { value: 'set', label: 'Set' },
    { value: 'pcs', label: 'Pieces' },
    { value: 'doz', label: 'Dozen' },
    { value: 'bag', label: 'Bag' },
    { value: 'bdl', label: 'Bundle' },
    { value: 'can', label: 'Can' },
    { value: 'btl', label: 'Bottle' },
];

export const CreateNewInventoryItemModal: React.FC<CreateNewInventoryItemModalProps> = ({
    onClose,
    onItemCreated,
    prefilledData,
}) => {
    // Form states matching Inventory.tsx editFormData structures
    const [itemCode, setItemCode] = useState('');
    const [itemName, setItemName] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState<number | string>('');
    const [categoryPath, setCategoryPath] = useState('');
    const [isVendorSpecificItemCode, setIsVendorSpecificItemCode] = useState(false);
    const [vendorName, setVendorName] = useState('');
    const [vendorSuffix, setVendorSuffix] = useState('');
    const [uom, setUom] = useState('nos');
    const [altUnit, setAltUnit] = useState('');
    const [conversionFactor, setConversionFactor] = useState('');
    const [rate, setRate] = useState('0.00');
    const [rateUnit, setRateUnit] = useState('nos');
    const [hsnCode, setHsnCode] = useState('');
    const [gstRate, setGstRate] = useState('');
    const [cessRate, setCessRate] = useState('');
    const [reorderLevel, setReorderLevel] = useState('');
    const [reorderLevel2, setReorderLevel2] = useState('');
    const [isSaleable, setIsSaleable] = useState(false);

    // Dropdowns data states
    const [vendors, setVendors] = useState<any[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [unitOptions, setUnitOptions] = useState<any[]>(UNIT_OPTIONS);

    // Debounce refs for HSN auto-fill
    const hsnDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastFetchedHsn = useRef('');

    // Fetch vendors on mount using the same service method as Inventory.tsx
    useEffect(() => {
        const fetchVendors = async () => {
            try {
                const data = await apiService.getRichVendors();
                setVendors(Array.isArray(data) ? data : (data as any)?.results || []);
            } catch (error) {
                console.error('Error fetching vendors:', error);
            }
        };
        fetchVendors();
    }, []);

    // Fetch dynamic units from backend UOM master on mount
    useEffect(() => {
        const fetchUnits = async () => {
            try {
                const response = await httpClient.get('/api/inventory/units/');
                const data = Array.isArray(response) ? response : (response as any)?.results || [];
                if (data.length > 0) {
                    const mapped = data.map((u: any) => ({
                        value: u.symbol,
                        label: u.name
                    }));
                    setUnitOptions(mapped);
                }
            } catch (error) {
                console.error('Error fetching inventory units:', error);
            }
        };
        fetchUnits();
    }, []);

    // Map and prefill initial values from OCR prefilledData
    useEffect(() => {
        if (prefilledData) {
            console.info('[FORENSIC][FORM_INITIALIZATION_VALUES]', {
                item_code: prefilledData.item_code,
                item_name: prefilledData.item_name,
                hsn_code: prefilledData.hsn_code,
                gst_rate: prefilledData.gst_rate,
                rate: prefilledData.rate,
                uom: prefilledData.uom,
                cgst_rate: prefilledData.cgst_rate,
                sgst_rate: prefilledData.sgst_rate,
                igst_rate: prefilledData.igst_rate,
                cess_rate: prefilledData.cess_rate,
                computed_gst_rate: prefilledData.computed_gst_rate,
                taxable_value: prefilledData.taxable_value,
            });

            if (prefilledData.item_code) setItemCode(prefilledData.item_code);
            if (prefilledData.item_name) setItemName(prefilledData.item_name);
            if (prefilledData.hsn_code) setHsnCode(prefilledData.hsn_code);
            
            // Prefill GST Rate: computed_gst_rate -> gst_rate
            const gstVal = prefilledData.computed_gst_rate !== undefined ? prefilledData.computed_gst_rate : prefilledData.gst_rate;
            if (gstVal !== undefined && gstVal !== null) {
                setGstRate(String(gstVal));
            }
            
            if (prefilledData.cess_rate !== undefined && prefilledData.cess_rate !== null) {
                setCessRate(String(prefilledData.cess_rate));
            }
            
            if (prefilledData.rate !== undefined && prefilledData.rate !== null) {
                setRate(String(prefilledData.rate));
            }
            if (prefilledData.uom) {
                const cleanUom = prefilledData.uom.toLowerCase();
                const matched = unitOptions.find(o => o.value === cleanUom || o.label.toLowerCase() === cleanUom);
                const selectedVal = matched ? matched.value : cleanUom;
                setUom(selectedVal);
                setRateUnit(selectedVal);
                setAltUnit(selectedVal);
                setConversionFactor('1');
            }
            if (prefilledData.description) setDescription(prefilledData.description);
        }
    }, [prefilledData, unitOptions]);

    // Always initialize default conversion factor to 1:1 if unspecified when altUnit is selected.
    useEffect(() => {
        if (altUnit && !conversionFactor) {
            setConversionFactor('1');
        }
    }, [altUnit, conversionFactor]);

    // Live debounced HSN GST details query (Parity with Inventory.tsx handleHsnChange)
    const handleHsnChange = (value: string) => {
        setHsnCode(value);
        const hsn = value.trim();
        if (hsn.length < 4) {
            setGstRate('');
            lastFetchedHsn.current = '';
            return;
        }
        if (hsn === lastFetchedHsn.current) return;

        if (hsnDebounceRef.current) clearTimeout(hsnDebounceRef.current);

        hsnDebounceRef.current = setTimeout(async () => {
            try {
                const response: any = await httpClient.get('/api/hsn-details/', { hsn_code: hsn });
                if (response && response.igst !== undefined) {
                    lastFetchedHsn.current = hsn;
                    setGstRate(String(response.igst));
                }
            } catch {
                lastFetchedHsn.current = '';
            }
        }, 500);
    };

    // Form submit handler matching Inventory.tsx handleSaveItem payload logic
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!itemCode.trim() || !itemName.trim()) {
            showError('Item Code and Item Name are required');
            return;
        }

        setIsSaving(true);
        try {
            const data = {
                item_code: itemCode.trim(),
                item_name: itemName.trim(),
                description: description.trim() || null,
                category: (typeof category === 'string' && category.startsWith('system_')) ? null : (category || null),
                category_path: categoryPath || null,
                subgroup: null,

                is_vendor_specific: !!isVendorSpecificItemCode,
                vendor_specific_name: isVendorSpecificItemCode ? vendorName : null,
                vendor_specific_suffix: isVendorSpecificItemCode ? vendorSuffix : null,

                uom: uom || 'nos',
                alternate_uom: altUnit || null,
                conversion_factor: altUnit && conversionFactor ? conversionFactor : null,

                rate: rate || 0,
                rate_unit: rateUnit || uom || 'nos',

                hsn_code: hsnCode.trim() || null,
                gst_rate: gstRate !== '' ? gstRate : null,
                cess_rate: cessRate !== '' ? cessRate : null,

                reorder_level: reorderLevel || null,
                reorder_level_2: reorderLevel2 || null,
                is_saleable: isSaleable || false
            };

            const response: any = await httpClient.post('/api/inventory/items/', data);
            showSuccess('Item saved successfully');
            onItemCreated(response.item_name || response.name, response.item_code, response.id);
        } catch (error: any) {
            handleApiError(error, 'Save Item');
        } finally {
            setIsSaving(false);
        }
    };

    // Category conditional checks for Reorder Levels
    const showReorderLevel = categoryPath && ['raw material', 'stock-in-trade', 'stock in trade', 'stores & spares', 'stores and spares', 'packing material'].some(cat => categoryPath.toLowerCase().includes(cat));

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-lg shadow-2xl border border-gray-300 w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden">
                {/* Header matching Inventory.tsx styling */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-slate-50 flex-shrink-0">
                    <h3 className="text-lg font-semibold text-gray-800">Create New Item</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                    >
                        ✕
                    </button>
                </div>

                {/* Form matching Inventory.tsx fields */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                    {/* Item Code & Name */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Item Code</label>
                            <input
                                type="text"
                                value={itemCode}
                                onChange={(e) => setItemCode(e.target.value)}
                                placeholder="Enter item code"
                                className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Item Name</label>
                            <input
                                type="text"
                                value={itemName}
                                onChange={(e) => setItemName(e.target.value)}
                                placeholder="Enter item name"
                                className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Item Description</label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Enter item description"
                            className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                        <CategoryHierarchicalDropdown
                            onlyRoots={false}
                            mergeSystem={true}
                            onSelect={async (selection) => {
                                setCategory(selection.id);
                                setCategoryPath(selection.fullPath);
                            }}
                            value={categoryPath || String(category)}
                        />
                    </div>

                    {/* Vendor-Specific Item Code */}
                    <div className="border-t border-gray-200 pt-4">
                        <label className="flex items-center mb-4 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isVendorSpecificItemCode}
                                onChange={(e) => setIsVendorSpecificItemCode(e.target.checked)}
                                className="h-4 w-4 text-indigo-600 rounded cursor-pointer"
                            />
                            <span className="ml-2 text-sm font-medium text-gray-700">Create Vendor-specific item code</span>
                        </label>
                        {isVendorSpecificItemCode && (
                            <div className="grid grid-cols-2 gap-4 pl-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Vendor Name</label>
                                    <SearchableDropdown
                                        options={Array.from(new Set(vendors.map((v: any) => v.vendor_name).filter(Boolean)))}
                                        value={vendorName}
                                        onChange={(val) => setVendorName(val)}
                                        placeholder="Select Vendor"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Suffix</label>
                                    <input
                                        type="text"
                                        placeholder="Enter suffix"
                                        value={vendorSuffix}
                                        onChange={(e) => setVendorSuffix(e.target.value)}
                                        className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Unit Configuration */}
                    <div className="border-t border-gray-200 pt-4">
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Unit (UOM)</label>
                                <select
                                    value={uom}
                                    onChange={(e) => {
                                        setUom(e.target.value);
                                        if (rateUnit === uom || !rateUnit) {
                                            setRateUnit(e.target.value);
                                        }
                                    }}
                                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">Select UOM</option>
                                    {unitOptions.map((unit) => (
                                        <option key={unit.value} value={unit.value}>
                                            {unit.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Alternate Unit</label>
                                <select
                                    value={altUnit}
                                    onChange={(e) => setAltUnit(e.target.value)}
                                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">Select alternate unit</option>
                                    {unitOptions.map((unit) => (
                                        <option key={unit.value} value={unit.value}>
                                            {unit.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {altUnit && (
                            <div className="animate-in slide-in-from-top-1 duration-100">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Conversion</label>
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value="1"
                                            readOnly
                                            className="w-32 px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none bg-gray-50 text-center font-bold shadow-sm"
                                        />
                                        <span className="text-sm font-semibold text-indigo-700 bg-indigo-50 px-4 py-2 rounded border border-indigo-100 min-w-[100px] text-center shadow-sm">
                                            {unitOptions.find(u => u.value === uom)?.label || 'UOM'}
                                        </span>
                                    </div>
                                    <span className="text-xl font-bold text-gray-400">=</span>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={conversionFactor}
                                            onChange={(e) => setConversionFactor(e.target.value)}
                                            placeholder="Conversion factor"
                                            className="w-48 px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-slate-400 transition-colors"
                                        />
                                        <span className="text-sm font-semibold text-emerald-700 bg-emerald-50 px-4 py-2 rounded border border-emerald-100 min-w-[100px] text-center shadow-sm">
                                            {unitOptions.find(u => u.value === altUnit)?.label || 'Alt Unit'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Rate */}
                    <div className="border-t border-gray-200 pt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Rate</label>
                        <div className="grid grid-cols-2 gap-4">
                            <input
                                type="text"
                                value={rate}
                                onChange={(e) => setRate(e.target.value)}
                                placeholder="Enter rate"
                                className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <select
                                className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                value={rateUnit}
                                onChange={(e) => setRateUnit(e.target.value)}
                            >
                                <option value="">Select unit</option>
                                {unitOptions
                                    .filter(unit => unit.value === uom || (altUnit && unit.value === altUnit))
                                    .map((unit) => (
                                        <option key={unit.value} value={unit.value}>
                                            {unit.label}
                                        </option>
                                    ))}
                            </select>
                        </div>
                    </div>

                    {/* HSN & GST & CESS */}
                    <div className="border-t border-gray-200 pt-4 grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">HSN Code</label>
                            <input
                                type="text"
                                value={hsnCode}
                                onChange={(e) => handleHsnChange(e.target.value)}
                                placeholder="Enter HSN code"
                                className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">GST Rate (%)</label>
                            <input
                                type="text"
                                value={gstRate}
                                onChange={(e) => setGstRate(e.target.value)}
                                placeholder="e.g. 18"
                                className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Cess Rate (%)</label>
                            <input
                                type="text"
                                value={cessRate}
                                onChange={(e) => setCessRate(e.target.value)}
                                placeholder="e.g. 2"
                                className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Reorder & Saleable */}
                    <div className="border-t border-gray-200 pt-4 space-y-4">
                        {showReorderLevel && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Reorder Level</label>
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={reorderLevel}
                                            onChange={(e) => setReorderLevel(e.target.value)}
                                            className="w-48 px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                                        />
                                        <span className="text-sm font-semibold text-indigo-700 bg-indigo-50 px-4 py-2 rounded border border-indigo-100 min-w-[100px] text-center shadow-sm">
                                            {UNIT_OPTIONS.find(u => u.value === uom)?.label || 'UOM'}
                                        </span>
                                    </div>
                                    {altUnit && (
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={reorderLevel2}
                                                onChange={(e) => setReorderLevel2(e.target.value)}
                                                className="w-48 px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                                            />
                                            <span className="text-sm font-semibold text-emerald-700 bg-emerald-50 px-4 py-2 rounded border border-emerald-100 min-w-[100px] text-center shadow-sm">
                                                {UNIT_OPTIONS.find(u => u.value === altUnit)?.label || 'Alt Unit'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        {categoryPath?.includes('Work in Progress') && (
                            <label className="flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isSaleable}
                                    onChange={(e) => setIsSaleable(e.target.checked)}
                                    className="h-4 w-4 text-indigo-600 rounded cursor-pointer"
                                />
                                <span className="ml-2 text-sm font-medium text-gray-700">Saleable Item</span>
                            </label>
                        )}
                    </div>
                </form>

                {/* Footer Buttons */}
                <div className="px-6 py-4 bg-slate-50 border-t border-gray-200 flex items-center justify-end gap-3 flex-shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSaving}
                        className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-[4px] text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSaving}
                        className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-[4px] text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 min-w-[120px]"
                    >
                        {isSaving ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        ) : null}
                        Save & Close
                    </button>
                </div>
            </div>
        </div>
    );
};
