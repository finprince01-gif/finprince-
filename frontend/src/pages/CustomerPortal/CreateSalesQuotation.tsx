import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronDown } from 'lucide-react';
import { httpClient } from '../../services/httpClient';
import { showSuccess, showError } from '../../utils/toast';
import { handleApiError } from '../../utils/errorHandler';
import CategoryHierarchicalDropdown from '../../components/CategoryHierarchicalDropdown';
import { CUSTOMER_CATEGORIES } from '../../constants/customerPortalConstants';

interface ItemRow {
    id: number;
    db_id?: number | string; // To track existing items for partial updates if needed
    itemCode: string;
    itemName: string;
    minOrderQty: string;
    basePrice: string;
    maxDiscount: string;
    bestPrice: string;
    uom: string;
}

interface SpecificItemRow {
    id: number;
    db_id?: number | string;
    itemCode: string;
    itemName: string;
    customerItemName: string;
    minOrderQty: string;
    basePrice: string;
    discount: string;
    negotiatedPrice: string;
    uom: string;
}

interface InventoryItem {
    id: number | string;
    item_code: string;
    item_name: string;
    uom: string;
    rate: string | number;
}

interface CreateSalesQuotationProps {
    onCancel: () => void;
    editId?: string | null;
    editType?: QuotationType | null;
}

type QuotationType = 'General Customer Quote' | 'Specific Customer Quote';

const CreateSalesQuotation: React.FC<CreateSalesQuotationProps> = ({ onCancel, editId, editType }) => {
    const [quotationType, setQuotationType] = useState<QuotationType>(editType || 'General Customer Quote');
    const [loading, setLoading] = useState(false);

    // General Customer Quote states
    const [quoteNumber, setQuoteNumber] = useState('');
    const [customerCategory, setCustomerCategory] = useState('');
    const [customerCategoryId, setCustomerCategoryId] = useState<number | null>(null);
    const [effectiveFrom, setEffectiveFrom] = useState('');
    const [effectiveTo, setEffectiveTo] = useState('');
    const [items, setItems] = useState<ItemRow[]>([
        { id: 1, itemCode: '', itemName: '', minOrderQty: '', basePrice: '', maxDiscount: '', bestPrice: '', uom: '' }
    ]);
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
    const [filteredItems, setFilteredItems] = useState<InventoryItem[]>([]);
    const [showSuggestions, setShowSuggestions] = useState<{ rowId: number, type: 'general' | 'specific' } | null>(null);

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
        { id: 1, itemCode: '', itemName: '', customerItemName: '', minOrderQty: '', basePrice: '', discount: '', negotiatedPrice: '', uom: '' }
    ]);
    const [allCustomers, setAllCustomers] = useState<any[]>([]);
    const [filteredCustomersForSearch, setFilteredCustomersForSearch] = useState<any[]>([]);
    const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
    const [customerBranches, setCustomerBranches] = useState<any[]>([]);

    // Fetch Inventory Items
    useEffect(() => {
        const fetchInventory = async () => {
            try {
                const response = await httpClient.get('/api/inventory/items/');
                if (Array.isArray(response)) {
                    setInventoryItems(response);
                } else if ((response as any).results) {
                    setInventoryItems((response as any).results);
                }
            } catch (error) {
                handleApiError(error, 'Fetch Inventory Items');
            }
        };

        const fetchAllCustomersList = async () => {
            try {
                const response = await httpClient.get('/api/customerportal/customer-master/');
                if (Array.isArray(response)) {
                    setAllCustomers(response);
                }
            } catch (error) {
                handleApiError(error, 'Fetch Customers');
            }
        };

        fetchInventory();
        fetchAllCustomersList();
    }, []);

    useEffect(() => {
        const fetchQuotationData = async () => {
            if (!editId) return;
            setLoading(true);
            try {
                const endpoint = quotationType === 'General Customer Quote'
                    ? `/api/customerportal/sales-quotations-general/${editId}/`
                    : `/api/customerportal/sales-quotations-specific/${editId}/`;

                const data = await httpClient.get(endpoint) as any;

                if (quotationType === 'General Customer Quote') {
                    setQuoteNumber(data.quote_number);
                    setCustomerCategory(data.customer_category);
                    setEffectiveFrom(data.effective_from || '');
                    setEffectiveTo(data.effective_to || '');
                    if (data.items && data.items.length > 0) {
                        setItems(data.items.map((item: any, idx: number) => ({
                            id: idx + 1,
                            db_id: item.id,
                            itemCode: item.item_code,
                            itemName: item.item_name,
                            minOrderQty: item.min_order_qty.toString(),
                            basePrice: item.base_price.toString(),
                            maxDiscount: item.max_discount.toString(),
                            bestPrice: item.best_price.toString(),
                            uom: item.uom || ''
                        })));
                    }
                } else {
                    setSpecificQuoteNumber(data.quote_number);
                    setCustomerName(data.customer_name);
                    setBranch(data.branch);
                    setAddress(data.address);
                    setEmail(data.email);
                    setContactNo(data.contact_no);
                    setValidityFrom(data.validity_from || '');
                    setValidityTo(data.validity_to || '');
                    setTentativeDeliveryDate(data.tentative_delivery_date || '');
                    setPaymentTerms(data.payment_terms || '');
                    if (data.items && data.items.length > 0) {
                        setSpecificItems(data.items.map((item: any, idx: number) => ({
                            id: idx + 1,
                            db_id: item.id,
                            itemCode: item.item_code,
                            itemName: item.item_name,
                            customerItemName: item.customer_item_name,
                            minOrderQty: item.min_order_qty.toString(),
                            basePrice: item.base_price.toString(),
                            discount: item.discount.toString(),
                            negotiatedPrice: item.negotiated_price.toString(),
                            uom: item.uom || ''
                        })));
                    }
                }
            } catch (error) {
                handleApiError(error, 'Load Quotation Details');
            } finally {
                setLoading(false);
            }
        };

        fetchQuotationData();
    }, [editId, quotationType]);

    const handleAddItem = () => {
        const newItem: ItemRow = {
            id: items.length + 1,
            itemCode: '',
            itemName: '',
            minOrderQty: '',
            basePrice: '',
            maxDiscount: '',
            bestPrice: '',
            uom: ''
        };
        setItems([...items, newItem]);
    };

    const handleRemoveItem = (id: number) => {
        if (items.length > 1) {
            setItems(items.filter(item => item.id !== id));
        }
    };

    const handleItemChange = (id: number, field: keyof ItemRow, value: string) => {
        if (field === 'itemCode') {
            const selected = inventoryItems.find(i => i.item_code === value);
            if (selected) {
                setItems(items.map(item =>
                    item.id === id ? {
                        ...item,
                        itemCode: selected.item_code,
                        itemName: selected.item_name,
                        basePrice: selected.rate.toString(),
                        uom: selected.uom || ''
                    } : item
                ));
            } else {
                setItems(items.map(item =>
                    item.id === id ? { ...item, [field]: value } : item
                ));
            }
        } else if (field === 'itemName') {
            const selected = inventoryItems.find(i => i.item_name === value);
            if (selected) {
                setItems(items.map(item =>
                    item.id === id ? {
                        ...item,
                        itemCode: selected.item_code,
                        itemName: selected.item_name,
                        basePrice: selected.rate.toString(),
                        uom: selected.uom || ''
                    } : item
                ));
            } else {
                setItems(items.map(item =>
                    item.id === id ? { ...item, [field]: value } : item
                ));
            }
        } else {
            setItems(items.map(item =>
                item.id === id ? { ...item, [field]: value } : item
            ));
        }
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
            negotiatedPrice: '',
            uom: ''
        };
        setSpecificItems([...specificItems, newItem]);
    };

    const handleRemoveSpecificItem = (id: number) => {
        if (specificItems.length > 1) {
            setSpecificItems(specificItems.filter(item => item.id !== id));
        }
    };

    const handleSpecificItemChange = (id: number, field: keyof SpecificItemRow, value: string) => {
        if (field === 'itemCode') {
            const selected = inventoryItems.find(i => i.item_code === value);
            if (selected) {
                setSpecificItems(specificItems.map(item =>
                    item.id === id ? {
                        ...item,
                        itemCode: selected.item_code,
                        itemName: selected.item_name,
                        basePrice: selected.rate.toString(),
                        uom: selected.uom || ''
                    } : item
                ));
            } else {
                setSpecificItems(specificItems.map(item =>
                    item.id === id ? { ...item, [field]: value } : item
                ));
            }
        } else if (field === 'itemName') {
            const selected = inventoryItems.find(i => i.item_name === value);
            if (selected) {
                setSpecificItems(specificItems.map(item =>
                    item.id === id ? {
                        ...item,
                        itemCode: selected.item_code,
                        itemName: selected.item_name,
                        basePrice: selected.rate.toString(),
                        uom: selected.uom || ''
                    } : item
                ));
            } else {
                setSpecificItems(specificItems.map(item =>
                    item.id === id ? { ...item, [field]: value } : item
                ));
            }
        } else {
            setSpecificItems(specificItems.map(item =>
                item.id === id ? { ...item, [field]: value } : item
            ));
        }
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
                        ...(item.db_id ? { id: item.db_id } : {}), // Include ID for existing items if backend supports it
                        item_code: item.itemCode,
                        item_name: item.itemName,
                        min_order_qty: parseFloat(item.minOrderQty) || 0,
                        base_price: parseFloat(item.basePrice) || 0,
                        max_discount: parseFloat(item.maxDiscount) || 0,
                        best_price: parseFloat(item.bestPrice) || 0
                    }))
                };
                if (editId) {
                    await httpClient.patch(`/api/customerportal/sales-quotations-general/${editId}/`, payload);
                } else {
                    await httpClient.post('/api/customerportal/sales-quotations-general/', payload);
                }
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
                        ...(item.db_id ? { id: item.db_id } : {}),
                        item_code: item.itemCode,
                        item_name: item.itemName,
                        customer_item_name: item.customerItemName,
                        min_order_qty: parseFloat(item.minOrderQty) || 0,
                        base_price: parseFloat(item.basePrice) || 0,
                        discount: parseFloat(item.discount) || 0,
                        negotiated_price: parseFloat(item.negotiatedPrice) || 0
                    }))
                };
                if (editId) {
                    await httpClient.patch(`/api/customerportal/sales-quotations-specific/${editId}/`, payload);
                } else {
                    await httpClient.post('/api/customerportal/sales-quotations-specific/', payload);
                }
            }
            showSuccess(`Quotation ${editId ? 'updated' : 'saved'} successfully!`);
            onCancel();
        } catch (error: any) {
            handleApiError(error, 'Save Quotation');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {loading && (
                <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-3">
                    <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-[4px] animate-spin"></div>
                    <p className="text-gray-600 font-medium italic">Loading quotation details...</p>
                </div>
            )}

            {/* Main Content */}
            <div className="px-8 py-6">
                <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-200 p-8">
                    {/* Page Title */}
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-gray-900">{editId ? 'Edit' : 'Create'} Sales Quotation</h2>
                        {editId && (
                            <span className="px-3 py-1 bg-indigo-100 text-indigo-800 text-xs font-bold rounded-[4px] uppercase tracking-wider">
                                Edit Mode
                            </span>
                        )}
                    </div>

                    {/* Quotation Type Selector */}
                    <div className="mb-8 bg-gray-50 p-2 rounded-[4px] inline-flex gap-2">
                        {(['General Customer Quote', 'Specific Customer Quote'] as QuotationType[]).map((type) => (
                            <button
                                key={type}
                                onClick={() => !editId && setQuotationType(type)}
                                disabled={!!editId && quotationType !== type}
                                className={`px-6 py-2 rounded-[4px] text-sm font-medium transition-colors ${quotationType === type
                                    ? 'bg-white text-indigo-700 shadow-none border border-slate-200-none border border-slate-200'
                                    : !!editId ? 'text-gray-400 cursor-not-allowed' : 'text-gray-600 hover:bg-white/50'
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
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Enter quote number"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Customer Category <span className="text-red-500">*</span>
                                    </label>
                                    <CategoryHierarchicalDropdown
                                        apiEndpoint="/api/customerportal/categories/"
                                        value={customerCategory}
                                        onSelect={(selection) => {
                                            setCustomerCategoryId(selection.id);
                                            setCustomerCategory(selection.fullPath);
                                        }}
                                        placeholder="Select category"
                                        colorTheme="indigo"
                                        systemCategories={CUSTOMER_CATEGORIES.map(c => c.category)}
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
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">To</label>
                                        <input
                                            type="date"
                                            value={effectiveTo}
                                            onChange={(e) => setEffectiveTo(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Item Table Section */}
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Items</h3>
                                <div className="overflow-x-auto border border-gray-200 rounded-[4px]">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Code</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Name</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Minimum Order Quantity</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base Price</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">UOM</th>
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
                                                        <select
                                                            value={item.itemCode}
                                                            onChange={(e) => handleItemChange(item.id, 'itemCode', e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                                        >
                                                            <option value="">Select Item Code</option>
                                                            {inventoryItems.map((invItem) => (
                                                                <option key={`code-${invItem.id}`} value={invItem.item_code}>
                                                                    {invItem.item_code}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <select
                                                            value={item.itemName}
                                                            onChange={(e) => handleItemChange(item.id, 'itemName', e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                                        >
                                                            <option value="">Select Item Name</option>
                                                            {inventoryItems.map((invItem) => (
                                                                <option key={`name-${invItem.id}`} value={invItem.item_name}>
                                                                    {invItem.item_name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="text"
                                                            value={item.uom}
                                                            readOnly
                                                            className="w-full px-2 py-1 border border-gray-200 rounded text-sm bg-gray-50 text-gray-500"
                                                            placeholder="UOM"
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
                                    className="mt-4 flex items-center gap-2 text-indigo-600 hover:text-indigo-700 text-sm font-medium"
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
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                            placeholder="Enter quote number"
                                        />
                                    </div>
                                    <div className="md:col-start-1 relative">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Customer Name <span className="text-red-500">*</span>
                                        </label>
                                        <div className="relative group">
                                            <input
                                                type="text"
                                                value={customerName}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setCustomerName(val);
                                                    const matches = allCustomers.filter(c =>
                                                        c.customer_name.toLowerCase().includes(val.toLowerCase())
                                                    );
                                                    setFilteredCustomersForSearch(matches);
                                                    setShowCustomerSuggestions(true);
                                                }}
                                                onFocus={() => {
                                                    // Show all if empty, or filter if typing
                                                    const matches = allCustomers.filter(c =>
                                                        c.customer_name.toLowerCase().includes(customerName.toLowerCase())
                                                    );
                                                    setFilteredCustomersForSearch(matches);
                                                    setShowCustomerSuggestions(true);
                                                }}
                                                className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                placeholder="Enter or select customer name"
                                            />
                                            <div
                                                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 group-hover:text-indigo-500 transition-colors"
                                                onClick={() => {
                                                    if (!showCustomerSuggestions) {
                                                        setFilteredCustomersForSearch(allCustomers);
                                                        setShowCustomerSuggestions(true);
                                                    } else {
                                                        setShowCustomerSuggestions(false);
                                                    }
                                                }}
                                            >
                                                <ChevronDown className="w-5 h-5" />
                                            </div>
                                        </div>
                                        {showCustomerSuggestions && filteredCustomersForSearch.length > 0 && (
                                            <div className="absolute z-[60] w-full mt-1 bg-white border border-gray-200 rounded-[4px] shadow-lg max-h-60 overflow-y-auto">
                                                {filteredCustomersForSearch.map((cust) => (
                                                    <div
                                                        key={cust.id}
                                                        onClick={() => {
                                                            setCustomerName(cust.customer_name);
                                                            setAddress(cust.address || (cust.gst_details?.branches?.[0]?.address) || '');
                                                            setEmail(cust.email_address || '');
                                                            setContactNo(cust.contact_number || '');
                                                            setShowCustomerSuggestions(false);

                                                            const branches = cust.gst_details?.branches || [];
                                                            setCustomerBranches(branches);

                                                            if (branches.length > 0) {
                                                                const mainBranch = branches.find((b: any) =>
                                                                    (b.referenceName || b.defaultRef)?.toLowerCase().includes('main')
                                                                ) || branches[0];
                                                                setBranch(mainBranch.referenceName || mainBranch.defaultRef || '');
                                                            } else {
                                                                setBranch('');
                                                            }
                                                        }}
                                                        className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-none transition-colors"
                                                    >
                                                        <div className="font-medium text-gray-900">{cust.customer_name}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {showCustomerSuggestions && (
                                            <div
                                                className="fixed inset-0 z-[55]"
                                                onClick={() => setShowCustomerSuggestions(false)}
                                            />
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Branch <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            value={branch}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setBranch(val);
                                                const selectedBranch = customerBranches.find(b => (b.referenceName || b.defaultRef) === val);
                                                if (selectedBranch && selectedBranch.address) {
                                                    setAddress(selectedBranch.address);
                                                }
                                            }}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                        >
                                            <option value="">Select branch</option>
                                            {customerBranches.length > 0 && customerBranches.map((b, idx) => (
                                                <option key={idx} value={b.referenceName || b.defaultRef}>
                                                    {b.referenceName || b.defaultRef}
                                                </option>
                                            ))}
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
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 resize-none"
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
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
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
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
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
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">To</label>
                                        <input
                                            type="date"
                                            value={validityTo}
                                            onChange={(e) => setValidityTo(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Item Lists Section */}
                            <div className="mb-8">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Item Lists</h3>
                                <div className="overflow-x-auto border border-gray-200 rounded-[4px]">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Code</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Name</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer Item Name</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Minimum Order Quantity</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base Price</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">UOM</th>
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
                                                        <select
                                                            value={item.itemCode}
                                                            onChange={(e) => handleSpecificItemChange(item.id, 'itemCode', e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                                        >
                                                            <option value="">Select Item Code</option>
                                                            {inventoryItems.map((invItem) => (
                                                                <option key={`code-${invItem.id}`} value={invItem.item_code}>
                                                                    {invItem.item_code}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <select
                                                            value={item.itemName}
                                                            onChange={(e) => handleSpecificItemChange(item.id, 'itemName', e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                                        >
                                                            <option value="">Select Item Name</option>
                                                            {inventoryItems.map((invItem) => (
                                                                <option key={`name-${invItem.id}`} value={invItem.item_name}>
                                                                    {invItem.item_name}
                                                                </option>
                                                            ))}
                                                        </select>
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
                                                            type="text"
                                                            value={item.uom}
                                                            readOnly
                                                            className="w-full px-2 py-1 border border-gray-200 rounded text-sm bg-gray-50 text-gray-500"
                                                            placeholder="UOM"
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
                                    className="mt-4 flex items-center gap-2 text-indigo-600 hover:text-indigo-700 text-sm font-medium"
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
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
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
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 resize-none"
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
                            className="px-6 py-2 border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-[4px] text-sm font-medium hover:bg-indigo-700 transition-colors"
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div >
        </div >
    );
};

export default CreateSalesQuotation;


