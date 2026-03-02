import React, { useState } from 'react';
import Icon from './Icon';

interface CreateVendorModalProps {
    onClose: () => void;
    onSave: (data: any) => void;
    initialData: {
        vendor_name: string;
        gstin: string;
        address: string;
        state: string;
    };
}

const CreateVendorModal: React.FC<CreateVendorModalProps> = ({ onClose, onSave, initialData }) => {
    const [vendorName, setVendorName] = useState(initialData.vendor_name || '');
    const [gstin, setGstin] = useState(initialData.gstin || '');
    const [address, setAddress] = useState(initialData.address || '');
    const [state, setState] = useState(initialData.state || '');

    const handleSave = () => {
        onSave({
            vendor_name: vendorName,
            gstin,
            address,
            state
        });
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[4px] shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h2 className="text-xl font-semibold text-gray-800">Create Vendor</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <Icon name="x" className="w-6 h-6" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name <span className="text-red-500">*</span></label>
                        <input type="text" value={vendorName} onChange={e => setVendorName(e.target.value)} className="w-full px-4 py-2 border rounded-md" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
                        <input type="text" value={gstin} onChange={e => setGstin(e.target.value)} className="w-full px-4 py-2 border rounded-md" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                        <textarea value={address} onChange={e => setAddress(e.target.value)} className="w-full px-4 py-2 border rounded-md" rows={2} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                        <input type="text" value={state} onChange={e => setState(e.target.value)} className="w-full px-4 py-2 border rounded-md" />
                    </div>
                </div>
                <div className="flex items-center justify-end px-6 py-4 border-t bg-gray-50 gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-100">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded">Save & Attach</button>
                </div>
            </div>
        </div>
    );
};

export default CreateVendorModal;
