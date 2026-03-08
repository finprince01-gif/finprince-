import React, { useState, useEffect } from 'react';
import Icon from './Icon';

interface CreateCustomerModalProps {
    onClose: () => void;
    onSave: (data: any) => void;
    initialData: {
        customer_name: string;
        gstin: string;
        address: string;
        state: string;
        branch?: string;
        email?: string;
        phone?: string;
    };
}

const CreateCustomerModal: React.FC<CreateCustomerModalProps> = ({ onClose, onSave, initialData }) => {
    const [customerName, setCustomerName] = useState(initialData.customer_name || '');
    const [gstin, setGstin] = useState(initialData.gstin || '');
    const [address, setAddress] = useState(initialData.address || '');
    const [state, setState] = useState(initialData.state || '');
    const [branch, setBranch] = useState(initialData.branch || '');
    const [email, setEmail] = useState(initialData.email || '');
    const [phone, setPhone] = useState(initialData.phone || '');

    const handleSave = () => {
        onSave({
            customer_name: customerName,
            gstin,
            address,
            state,
            branch,
            email,
            phone
        });
    };

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex-shrink-0">
                    <h2 className="text-xl font-semibold">Create New Customer</h2>
                    <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors">
                        <Icon name="x" className="w-6 h-6" />
                    </button>
                </div>

                {/* Scrollable Body */}
                <div className="overflow-y-auto flex-1 p-6 space-y-5">
                    <p className="text-xs text-gray-500 italic">
                        The customer details below were extracted from the Excel. Please verify before creating.
                    </p>

                    {/* Customer Name */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-semibold text-gray-700">
                            Customer Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={customerName}
                            onChange={e => setCustomerName(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm shadow-sm"
                            placeholder="Full Legal Name"
                            required
                        />
                    </div>

                    {/* GSTIN */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-semibold text-gray-700">GSTIN <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={gstin}
                            onChange={e => setGstin(e.target.value.toUpperCase())}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm shadow-sm"
                            placeholder="33AAAAA0000A1Z5"
                            maxLength={15}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Branch */}
                        <div className="space-y-1.5">
                            <label className="block text-sm font-semibold text-gray-700">Branch <span className="text-red-500">*</span></label>
                            <input
                                type="text"
                                value={branch}
                                onChange={e => setBranch(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm shadow-sm"
                                placeholder="Main / Branch Name"
                            />
                        </div>
                        {/* State */}
                        <div className="space-y-1.5">
                            <label className="block text-sm font-semibold text-gray-700">State</label>
                            <input
                                type="text"
                                value={state}
                                onChange={e => setState(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm shadow-sm"
                                placeholder="State Name"
                            />
                        </div>
                    </div>

                    {/* Address */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-semibold text-gray-700">Address</label>
                        <textarea
                            value={address}
                            onChange={e => setAddress(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm shadow-sm"
                            rows={2}
                            placeholder="Full Address"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Email */}
                        <div className="space-y-1.5">
                            <label className="block text-sm font-semibold text-gray-700">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm shadow-sm"
                                placeholder="customer@example.com"
                            />
                        </div>
                        {/* Phone */}
                        <div className="space-y-1.5">
                            <label className="block text-sm font-semibold text-gray-700">Phone</label>
                            <input
                                type="text"
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm shadow-sm"
                                placeholder="Phone Number"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end px-6 py-4 border-t bg-gray-50/50 gap-3 flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-8 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md shadow-blue-500/20 transition-all active:scale-[0.98]"
                    >
                        Create Customer
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateCustomerModal;
