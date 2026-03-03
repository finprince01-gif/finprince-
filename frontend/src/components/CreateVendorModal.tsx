import React, { useState, useEffect } from 'react';
import Icon from './Icon';

interface SupplierItem {
    id: string;
    supplierItemCode: string;
    supplierItemName: string;
    hsnSac: string;
}

interface CreateVendorModalProps {
    onClose: () => void;
    onSave: (data: any) => void;
    initialData: {
        vendor_name: string;
        gstin: string;
        address: string;
        state: string;
        branch?: string;
        supplier_items?: Array<{
            supplierItemCode: string;
            supplierItemName: string;
            hsnSac: string;
        }>;
    };
}

/** Derive PAN from GSTIN: remove first 2 and last 3 characters */
const derivePanFromGstin = (gstinValue: string): string => {
    const cleaned = gstinValue.trim();
    if (cleaned.length > 5) {
        return cleaned.slice(2, cleaned.length - 3).toUpperCase();
    }
    return '';
};

const generateId = () => Math.random().toString(36).slice(2, 9);

const buildInitialItems = (
    rawItems?: Array<{ supplierItemCode: string; supplierItemName: string; hsnSac: string }>
): SupplierItem[] => {
    if (rawItems && rawItems.length > 0) {
        return rawItems.map(item => ({ id: generateId(), ...item }));
    }
    return [{ id: generateId(), supplierItemCode: '', supplierItemName: '', hsnSac: '' }];
};

const CreateVendorModal: React.FC<CreateVendorModalProps> = ({ onClose, onSave, initialData }) => {
    const [vendorName, setVendorName] = useState(initialData.vendor_name || '');
    const [gstin, setGstin] = useState(initialData.gstin || '');
    const [pan, setPan] = useState(derivePanFromGstin(initialData.gstin || ''));
    const [address, setAddress] = useState(initialData.address || '');
    const [state, setState] = useState(initialData.state || '');
    const [branch, setBranch] = useState(initialData.branch || '');
    const [supplierItems, setSupplierItems] = useState<SupplierItem[]>(
        buildInitialItems(initialData.supplier_items)
    );

    // Auto-update PAN whenever GSTIN changes
    useEffect(() => {
        setPan(derivePanFromGstin(gstin));
    }, [gstin]);

    const addSupplierItem = () => {
        setSupplierItems(prev => [
            ...prev,
            { id: generateId(), supplierItemCode: '', supplierItemName: '', hsnSac: '' }
        ]);
    };

    const removeSupplierItem = (id: string) => {
        setSupplierItems(prev => prev.filter(item => item.id !== id));
    };

    const updateSupplierItem = (id: string, field: keyof SupplierItem, value: string) => {
        setSupplierItems(prev =>
            prev.map(item => item.id === id ? { ...item, [field]: value } : item)
        );
    };

    const handleSave = () => {
        onSave({
            vendor_name: vendorName,
            gstin,
            pan,
            address,
            state,
            branch,
            supplier_items: supplierItems.map(({ id, ...rest }) => rest)
        });
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[4px] shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
                    <h2 className="text-xl font-semibold text-gray-800">Create Vendor</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <Icon name="x" className="w-6 h-6" />
                    </button>
                </div>

                {/* Scrollable Body */}
                <div className="overflow-y-auto flex-1 p-6 space-y-4">

                    {/* Vendor Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Vendor Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={vendorName}
                            onChange={e => setVendorName(e.target.value)}
                            className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            required
                        />
                    </div>

                    {/* GSTIN + PAN side by side */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
                            <input
                                type="text"
                                value={gstin}
                                onChange={e => setGstin(e.target.value.toUpperCase())}
                                className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                placeholder="e.g. 33AAAAA0000A1Z5"
                                maxLength={15}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                PAN No.
                                {gstin.trim().length > 5 && (
                                    <span className="ml-2 text-xs text-indigo-500 font-normal">(from GSTIN)</span>
                                )}
                            </label>
                            <input
                                type="text"
                                value={pan}
                                onChange={e => setPan(e.target.value.toUpperCase())}
                                className="w-full px-4 py-2 border rounded-md bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                placeholder="AAAAA0000A"
                                maxLength={10}
                            />
                        </div>
                    </div>

                    {/* Address */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                        <textarea
                            value={address}
                            onChange={e => setAddress(e.target.value)}
                            className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            rows={2}
                        />
                    </div>

                    {/* State + Branch side by side */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                            <input
                                type="text"
                                value={state}
                                onChange={e => setState(e.target.value)}
                                className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                            <input
                                type="text"
                                value={branch}
                                onChange={e => setBranch(e.target.value)}
                                className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                placeholder="e.g. Main Branch"
                            />
                        </div>
                    </div>

                    {/* ── Supplier Items Section ── */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                                    Supplier Items
                                </h3>
                                {initialData.supplier_items && initialData.supplier_items.length > 0 && (
                                    <p className="text-xs text-indigo-500 mt-0.5">
                                        Pre-filled from invoice items — edit as needed
                                    </p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={addSupplierItem}
                                className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-300 hover:border-indigo-500 rounded px-2 py-1 transition-colors"
                            >
                                <Icon name="plus" className="w-3 h-3" />
                                Add Item
                            </button>
                        </div>

                        <div className="border rounded-md overflow-hidden">
                            {/* Table Header */}
                            <div className="grid grid-cols-[2rem_1fr_1fr_1fr_2rem] bg-indigo-600 text-white text-xs font-semibold">
                                <div className="px-2 py-2 text-center">#</div>
                                <div className="px-3 py-2">Supplier Item Code</div>
                                <div className="px-3 py-2">Supplier Item Name</div>
                                <div className="px-3 py-2">HSN / SAC</div>
                                <div className="px-2 py-2"></div>
                            </div>

                            {/* Table Rows */}
                            {supplierItems.map((item, index) => (
                                <div
                                    key={item.id}
                                    className={`grid grid-cols-[2rem_1fr_1fr_1fr_2rem] items-center border-t ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                                >
                                    {/* Row number */}
                                    <div className="px-2 py-1 text-center text-xs text-gray-400">{index + 1}</div>

                                    {/* Supplier Item Code */}
                                    <div className="px-2 py-1">
                                        <input
                                            type="text"
                                            value={item.supplierItemCode}
                                            onChange={e => updateSupplierItem(item.id, 'supplierItemCode', e.target.value)}
                                            placeholder="Supplier Code"
                                            className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-indigo-400 bg-transparent"
                                        />
                                    </div>

                                    {/* Supplier Item Name */}
                                    <div className="px-2 py-1">
                                        <input
                                            type="text"
                                            value={item.supplierItemName}
                                            onChange={e => updateSupplierItem(item.id, 'supplierItemName', e.target.value)}
                                            placeholder="Supplier Item Name"
                                            className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-indigo-400 bg-transparent"
                                        />
                                    </div>

                                    {/* HSN/SAC */}
                                    <div className="px-2 py-1">
                                        <input
                                            type="text"
                                            value={item.hsnSac}
                                            onChange={e => updateSupplierItem(item.id, 'hsnSac', e.target.value)}
                                            placeholder="HSN / SAC"
                                            className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-indigo-400 bg-transparent"
                                            maxLength={8}
                                        />
                                    </div>

                                    {/* Delete */}
                                    <div className="px-1 py-1 flex justify-center">
                                        <button
                                            type="button"
                                            onClick={() => removeSupplierItem(item.id)}
                                            disabled={supplierItems.length === 1}
                                            className="text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                            title="Remove item"
                                        >
                                            <Icon name="trash" className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <p className="text-xs text-gray-400 mt-1">
                            Supplier-specific item codes and HSN/SAC codes used for invoice mapping.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end px-6 py-4 border-t bg-gray-50 gap-3 flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-100"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded"
                    >
                        Save &amp; Attach
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateVendorModal;
