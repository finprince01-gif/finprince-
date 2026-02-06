import React, { useState } from 'react';
import { httpClient } from '../../services/httpClient';

interface ItemRow {
    id: number;
    itemCode: string;
    itemName: string;
    minOrderQty: string;
    basePrice: string;
    maxDiscount: string;
    bestPrice: string;
}

interface SpecificItemRow {
    id: number;
    itemCode: string;
    itemName: string;
    customerItemName: string;
    minOrderQty: string;
    basePrice: string;
    discount: string;
    negotiatedPrice: string;
}

interface CreateSalesQuotationProps {
    onCancel: () => void;
}

type QuotationType = 'General Customer Quote' | 'Specific Customer Quote';

const CreateSalesQuotation: React.FC<CreateSalesQuotationProps> = ({ onCancel }) => {
    const [quotationType, setQuotationType] = useState<QuotationType>('General Customer Quote');

    // General Customer Quote states
    const [quoteNumber, setQuoteNumber] = useState('');
    const [customerCategory, setCustomerCategory] = useState('');
    const [effectiveFrom, setEffectiveFrom] = useState('');
    const [effectiveTo, setEffectiveTo] = useState('');
    const [items, setItems] = useState<ItemRow[]>([
        { id: 1, itemCode: '', itemName: '', minOrderQty: '', basePrice: '', maxDiscount: '', bestPrice: '' }
    ]);

    // Specific Customer Quote states
    const [specificQuoteNumber, setSpecificQuoteNumber] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [branch, setBranch] = useState('');
    const [address, setAddress] = useState('');
    const [email, setEmail] = useState('');
    const [contactNo, setContactNo] = useState('');
    const [validityFrom, setValidityFrom] = useState('');
    const [validityTo, setValidityTo] = useState('');
    const [tentativeDeliveryDate, setTentativeDeliveryDate] = useState('');
    const [paymentTerms, setPaymentTerms] = useState('');
    const [specificItems, setSpecificItems] = useState<SpecificItemRow[]>([
        { id: 1, itemCode: '', itemName: '', customerItemName: '', minOrderQty: '', basePrice: '', discount: '', negotiatedPrice: '' }
    ]);

    const handleAddItem = () => {
        const newItem: ItemRow = {
            id: items.length + 1,
            itemCode: '',
            itemName: '',
            minOrderQty: '',
            basePrice: '',
            maxDiscount: '',
            bestPrice: ''
        };
        setItems([...items, newItem]);
    };

    const handleRemoveItem = (id: number) => {
        if (items.length > 1) {
            setItems(items.filter(item => item.id !== id));
        }
    };

    const handleItemChange = (id: number, field: keyof ItemRow, value: string) => {
        setItems(items.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        ));
    };

    const handleAddSpecificItem = () => {
        const newItem: SpecificItemRow = {
            id: specificItems.length + 1,
            itemCode: '',
            itemName: '',
            customerItemName: '',
            minOrderQty: '',
            basePrice: '',
            discount: '',
            negotiatedPrice: ''
        };
        setSpecificItems([...specificItems, newItem]);
    };

    const handleRemoveSpecificItem = (id: number) => {
        if (specificItems.length > 1) {
            setSpecificItems(specificItems.filter(item => item.id !== id));
        }
    };

    const handleSpecificItemChange = (id: number, field: keyof SpecificItemRow, value: string) => {
        setSpecificItems(specificItems.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        ));
    };

    const handleSave = async () => {
        try {
            if (quotationType === 'General Customer Quote') {
                const payload = {
                    quote_number: quoteNumber,
                    customer_category: customerCategory,
                    effective_from: effectiveFrom || null,
                    effective_to: effectiveTo || null,
                    items: items.map(item => ({
                        item_code: item.itemCode,
                        item_name: item.itemName,
                        min_order_qty: parseFloat(item.minOrderQty) || 0,
                        base_price: parseFloat(item.basePrice) || 0,
                        max_discount: parseFloat(item.maxDiscount) || 0,
                        best_price: parseFloat(item.bestPrice) || 0
                    }))
                };
                await httpClient.post('/api/customerportal/sales-quotations-general/', payload);
            } else {
                const payload = {
                    quote_number: specificQuoteNumber,
                    customer_name: customerName,
                    branch: branch,
                    address: address,
                    email: email,
                    contact_no: contactNo,
                    validity_from: validityFrom || null,
                    validity_to: validityTo || null,
                    tentative_delivery_date: tentativeDeliveryDate || null,
                    payment_terms: paymentTerms,
                    items: specificItems.map(item => ({
                        item_code: item.itemCode,
                        item_name: item.itemName,
                        customer_item_name: item.customerItemName,
                        min_order_qty: parseFloat(item.minOrderQty) || 0,
                        base_price: parseFloat(item.basePrice) || 0,
                        discount: parseFloat(item.discount) || 0,
                        negotiated_price: parseFloat(item.negotiatedPrice) || 0
                    }))
                };
                await httpClient.post('/api/customerportal/sales-quotations-specific/', payload);
            }
            alert('Quotation saved successfully!');
            onCancel();
        } catch (error: any) {
            console.error('Error saving quotation:', error);
            const errorMessage = error.response?.data?.detail || error.message || 'Failed to save quotation';
            alert(`Error: ${errorMessage}`);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">


            {/* Main Content */}
            <div className="px-8 py-6">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                    {/* Page Title */}
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Create Sales Quotation</h2>

                    {/* Quotation Type Selector */}
                    <div className="mb-8 bg-gray-50 p-2 rounded-lg inline-flex gap-2">
                        {(['General Customer Quote', 'Specific Customer Quote'] as QuotationType[]).map((type) => (
                            <button
                                key={type}
                                onClick={() => setQuotationType(type)}
                                className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${quotationType === type
                                    ? 'bg-white text-indigo-700 shadow-sm'
                                    : 'text-gray-600 hover:bg-white/50'
                                    }`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>

                    {/* Form Content */}
                    {quotationType === 'General Customer Quote' && (
                        <div>
                            {/* Header Fields */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Quote # <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={quoteNumber}
                                        onChange={(e) => setQuoteNumber(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Enter quote number"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Customer Category <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={customerCategory}
                                        onChange={(e) => setCustomerCategory(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Select or enter category"
                                    />
                                </div>
                            </div>

                            {/* Effective Period */}
                            <div className="mb-8">
                                <label className="block text-sm font-medium text-gray-700 mb-3">
                                    Effective Period <span className="text-red-500">*</span>
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">From</label>
                                        <input
                                            type="date"
                                            value={effectiveFrom}
                                            onChange={(e) => setEffectiveFrom(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">To</label>
                                        <input
                                            type="date"
                                            value={effectiveTo}
                                            onChange={(e) => setEffectiveTo(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Item Table Section */}
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Items</h3>
                                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Code</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Name</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Minimum Order Quantity</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base Price</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Maximum Discount</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Best Price</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {items.map((item, index) => (
                                                <tr key={item.id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 text-sm text-gray-900">{index + 1}</td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="text"
                                                            value={item.itemCode}
                                                            onChange={(e) => handleItemChange(item.id, 'itemCode', e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="Code"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="text"
                                                            value={item.itemName}
                                                            onChange={(e) => handleItemChange(item.id, 'itemName', e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="Name"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="number"
                                                            value={item.minOrderQty}
                                                            onChange={(e) => handleItemChange(item.id, 'minOrderQty', e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="Qty"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="number"
                                                            value={item.basePrice}
                                                            onChange={(e) => handleItemChange(item.id, 'basePrice', e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="Price"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="number"
                                                            value={item.maxDiscount}
                                                            onChange={(e) => handleItemChange(item.id, 'maxDiscount', e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="%"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="number"
                                                            value={item.bestPrice}
                                                            onChange={(e) => handleItemChange(item.id, 'bestPrice', e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="Price"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <button
                                                            onClick={() => handleRemoveItem(item.id)}
                                                            className="text-red-600 hover:text-red-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                                                            disabled={items.length === 1}
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
                                </div>

                                {/* Add Row Button */}
                                <button
                                    onClick={handleAddItem}
                                    className="mt-4 flex items-center gap-2 text-teal-600 hover:text-indigo-700 text-sm font-medium"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add Item
                                </button>
                            </div>
                        </div>
                    )}

                    {quotationType === 'Specific Customer Quote' && (
                        <div>
                            {/* Customer Details Section */}
                            <div className="mb-8">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Details</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Quote # <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={specificQuoteNumber}
                                            onChange={(e) => setSpecificQuoteNumber(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                            placeholder="Enter quote number"
                                        />
                                    </div>
                                    <div className="md:col-start-1">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Customer Name <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={customerName}
                                            onChange={(e) => setCustomerName(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                            placeholder="Enter customer name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Branch <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            value={branch}
                                            onChange={(e) => setBranch(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                        >
                                            <option value="">Select branch</option>
                                            <option value="main">Main Branch</option>
                                            <option value="north">North Branch</option>
                                            <option value="south">South Branch</option>
                                        </select>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Address <span className="text-red-500">*</span>
                                        </label>
                                        <textarea
                                            rows={3}
                                            value={address}
                                            onChange={(e) => setAddress(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                                            placeholder="Enter address"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Email Address <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                            placeholder="email@example.com"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Contact No <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="tel"
                                            value={contactNo}
                                            onChange={(e) => setContactNo(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                            placeholder="Enter contact number"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Validity Period */}
                            <div className="mb-8">
                                <label className="block text-sm font-medium text-gray-700 mb-3">
                                    Validity Period <span className="text-red-500">*</span>
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">From</label>
                                        <input
                                            type="date"
                                            value={validityFrom}
                                            onChange={(e) => setValidityFrom(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">To</label>
                                        <input
                                            type="date"
                                            value={validityTo}
                                            onChange={(e) => setValidityTo(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Item Lists Section */}
                            <div className="mb-8">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Item Lists</h3>
                                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Code</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Name</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer Item Name</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Minimum Order Quantity</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base Price</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Discount</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Negotiated Price</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {specificItems.map((item, index) => (
                                                <tr key={item.id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 text-sm text-gray-900">{index + 1}</td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="text"
                                                            value={item.itemCode}
                                                            onChange={(e) => handleSpecificItemChange(item.id, 'itemCode', e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="Code"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="text"
                                                            value={item.itemName}
                                                            onChange={(e) => handleSpecificItemChange(item.id, 'itemName', e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="Name"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="text"
                                                            value={item.customerItemName}
                                                            onChange={(e) => handleSpecificItemChange(item.id, 'customerItemName', e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="Customer Name"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="number"
                                                            value={item.minOrderQty}
                                                            onChange={(e) => handleSpecificItemChange(item.id, 'minOrderQty', e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="Qty"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="number"
                                                            value={item.basePrice}
                                                            onChange={(e) => handleSpecificItemChange(item.id, 'basePrice', e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="Price"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="number"
                                                            value={item.discount}
                                                            onChange={(e) => handleSpecificItemChange(item.id, 'discount', e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="%"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="number"
                                                            value={item.negotiatedPrice}
                                                            onChange={(e) => handleSpecificItemChange(item.id, 'negotiatedPrice', e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="Price"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <button
                                                            onClick={() => handleRemoveSpecificItem(item.id)}
                                                            className="text-red-600 hover:text-red-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                                                            disabled={specificItems.length === 1}
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
                                </div>

                                {/* Add Row Button */}
                                <button
                                    onClick={handleAddSpecificItem}
                                    className="mt-4 flex items-center gap-2 text-teal-600 hover:text-indigo-700 text-sm font-medium"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add Item
                                </button>
                            </div>

                            {/* Additional Details Section */}
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Details</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Tentative Delivery Date
                                        </label>
                                        <input
                                            type="date"
                                            value={tentativeDeliveryDate}
                                            onChange={(e) => setTentativeDeliveryDate(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Payment Terms
                                        </label>
                                        <textarea
                                            rows={3}
                                            value={paymentTerms}
                                            onChange={(e) => setPaymentTerms(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                                            placeholder="Enter payment terms"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-gray-200">
                        <button
                            onClick={onCancel}
                            className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-6 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreateSalesQuotation;

