import React, { useState, useEffect } from 'react';
import { httpClient } from '../services/httpClient';

interface GRNItem {
    id: number;
    itemCode: string;
    itemName: string;
    hsnCode: string;
    uom: string;
    quantity: string;
    boxes: string;
}

interface Location {
    id: number;
    name: string;
}

interface CreateGRNModalProps {
    onClose: () => void;
    onSave: (data: any) => void;
}

const CreateGRNModal: React.FC<CreateGRNModalProps> = ({ onClose, onSave }) => {
    // Form State
    const [grnNo, setGrnNo] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [location, setLocation] = useState('');
    const [purchaseOrderNo, setPurchaseOrderNo] = useState('');
    const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
    const [vendorName, setVendorName] = useState('');
    const [branch, setBranch] = useState('');
    const [address, setAddress] = useState('');
    const [gstin, setGstin] = useState('');
    const [postingNote, setPostingNote] = useState('');

    // Locations State
    const [locations, setLocations] = useState<Location[]>([]);

    // Items State
    const [items, setItems] = useState<GRNItem[]>([
        { id: 1, itemCode: '', itemName: '', hsnCode: '', uom: '', quantity: '', boxes: '' }
    ]);

    // Fetch locations on mount
    useEffect(() => {
        const fetchLocations = async () => {
            try {
                const response = await httpClient.get<Location[]>('/api/inventory/locations/');
                setLocations(response || []);
            } catch (error) {
                console.error('Failed to fetch locations:', error);
            }
        };
        fetchLocations();
    }, []);

    const handleAddItem = () => {
        const newItem: GRNItem = {
            id: Date.now(),
            itemCode: '',
            itemName: '',
            hsnCode: '',
            uom: '',
            quantity: '',
            boxes: ''
        };
        setItems([...items, newItem]);
    };

    const handleRemoveItem = (id: number) => {
        if (items.length > 1) {
            setItems(items.filter(item => item.id !== id));
        }
    };

    const handleItemChange = (id: number, field: keyof GRNItem, value: string) => {
        setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    const calculateTotalBoxes = () => {
        return items.reduce((sum, item) => sum + (parseFloat(item.boxes) || 0), 0);
    };

    const handleSave = () => {
        // Validate required fields
        if (!grnNo) {
            alert('Please enter GRN No');
            return;
        }

        // Construct payload to match InventoryOperationNewGRNSerializer
        const payload = {
            grn_type: 'purchases', // purchases or sales_return
            grn_no: grnNo,
            date: date || null,
            time: time || null,
            location_id: location ? parseInt(location) : null, // BigIntegerField, not ForeignKey
            reference_no: purchaseOrderNo || '', // PO No
            secondary_ref_no: supplierInvoiceNo || '', // Supplier Invoice No
            vendor_name: vendorName || '',
            branch: branch || '',
            address: address || '',
            gstin: gstin || '',
            posting_note: postingNote || '',
            status: 'Posted',
            items: items.map(item => ({
                item_code: item.itemCode || '',
                item_name: item.itemName || '',
                hsn_code: item.hsnCode || '',
                uom: item.uom || '',
                quantity: parseFloat(item.quantity) || 0,
                no_of_boxes: item.boxes || '0'
            }))
        };

        console.log('GRN Payload:', JSON.stringify(payload, null, 2));
        onSave(payload);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-xl font-bold text-gray-800">Create GRN (Goods Receipt Note)</h3>
                </div>

                <div className="p-6 space-y-6">
                    {/* Row 1 */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">GRN No</label>
                            <input
                                type="text"
                                value={grnNo}
                                onChange={(e) => setGrnNo(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                            <input
                                type="time"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                            <select
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500"
                            >
                                <option value="">Select Location</option>
                                {locations.map((loc) => (
                                    <option key={loc.id} value={loc.id.toString()}>
                                        {loc.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Row 2 */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Order No.</label>
                            <input
                                type="text"
                                value={purchaseOrderNo}
                                onChange={(e) => setPurchaseOrderNo(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Invoice No.</label>
                            <input
                                type="text"
                                value={supplierInvoiceNo}
                                onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name</label>
                            <input
                                type="text"
                                value={vendorName}
                                onChange={(e) => setVendorName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500"
                                placeholder="Enter Name"
                            />
                        </div>
                    </div>

                    {/* Row 3 */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                            <input
                                type="text"
                                value={branch}
                                onChange={(e) => setBranch(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                            <textarea
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
                                rows={1}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN No.</label>
                            <input
                                type="text"
                                value={gstin}
                                onChange={(e) => setGstin(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500"
                            />
                        </div>
                    </div>

                    {/* Items Section */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="text-sm font-medium text-gray-700">Items</h4>
                            <button
                                onClick={handleAddItem}
                                className="text-teal-600 hover:text-teal-700 text-sm font-medium flex items-center"
                            >
                                + Add Item
                            </button>
                        </div>
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Item Code</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Item Name</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">HSN Code</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">UOM</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Quantity</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">No. of boxes/packs</th>
                                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {items.map((item) => (
                                        <tr key={item.id}>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={item.itemCode}
                                                    onChange={(e) => handleItemChange(item.id, 'itemCode', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={item.itemName}
                                                    onChange={(e) => handleItemChange(item.id, 'itemName', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={item.hsnCode}
                                                    onChange={(e) => handleItemChange(item.id, 'hsnCode', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={item.uom}
                                                    onChange={(e) => handleItemChange(item.id, 'uom', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="number"
                                                    value={item.boxes}
                                                    onChange={(e) => handleItemChange(item.id, 'boxes', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                />
                                            </td>
                                            <td className="p-2 text-center">
                                                <button
                                                    onClick={() => handleRemoveItem(item.id)}
                                                    className="text-red-500 hover:text-red-700 text-sm font-medium"
                                                >
                                                    Remove
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex justify-end mt-2 items-center gap-2">
                            <span className="text-sm font-bold text-gray-700">Total Number of Boxes / Packs:</span>
                            <div className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm font-medium bg-gray-50">
                                {calculateTotalBoxes()}
                            </div>
                        </div>
                    </div>

                    {/* Posting Note */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Posting Note</label>
                        <textarea
                            value={postingNote}
                            onChange={(e) => setPostingNote(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none h-24"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50 rounded-b-lg">
                    <button
                        onClick={handleSave}
                        className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-md transition-colors"
                    >
                        Save GRN
                    </button>
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-md hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateGRNModal;

