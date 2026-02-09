import React, { useState, useEffect } from 'react';
import { httpClient } from '../../services/httpClient';

interface ItemRow {
    id: number;
    itemCode: string;
    itemName: string;
    quantity: string;
    price: string;
    taxableValue: number;
    gst: number;
    netValue: number;
}

interface CreateSalesOrderProps {
    onCancel: () => void;
}

const CreateSalesOrder: React.FC<CreateSalesOrderProps> = ({ onCancel }) => {
    // Section 1: Basic Details
    const [soSeries, setSOSeries] = useState('SO-2024');
    const [soNumber, setSONumber] = useState(`SO-${Date.now().toString().slice(-6)}`); // Auto-generated unique ID
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [customerPONumber, setCustomerPONumber] = useState('');
    const [customerName, setCustomerName] = useState('customer1');
    const [branch, setBranch] = useState('main');
    const [address, setAddress] = useState('');
    const [email, setEmail] = useState('');
    const [contactNumber, setContactNumber] = useState('');

    // Section 2: Quotation/Contract Linking
    const [quotationType, setQuotationType] = useState('');
    const [quotationNumber, setQuotationNumber] = useState('');

    // Section 3: Item Details
    const [items, setItems] = useState<ItemRow[]>([
        { id: 1, itemCode: 'ITEM-001', itemName: 'Sample Product', quantity: '1', price: '100', taxableValue: 100, gst: 18, netValue: 118 }
    ]);

    // Section 4: Totals
    const [totalTaxableValue, setTotalTaxableValue] = useState(0);
    const [gstTotal, setGSTTotal] = useState(0);
    const [totalValue, setTotalValue] = useState(0);
    const [netValueTotal, setNetValueTotal] = useState(0);

    // Section 5: Delivery Terms
    const [deliverAt, setDeliverAt] = useState('');
    const [deliveryDate, setDeliveryDate] = useState('');

    // Section 6: Payment Terms
    const [creditPeriod, setCreditPeriod] = useState('');

    // Section 7: Salesperson
    const [employeeId, setEmployeeId] = useState('');
    const [employeeName, setEmployeeName] = useState('');
    const [salespersonInCharge, setSalespersonInCharge] = useState('');

    // Calculate item values
    const calculateItemValues = (item: ItemRow): ItemRow => {
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.price) || 0;
        const taxableValue = qty * price;
        const gst = taxableValue * 0.18; // 18% GST
        const netValue = taxableValue + gst;

        return {
            ...item,
            taxableValue,
            gst,
            netValue
        };
    };

    // Update totals when items change
    useEffect(() => {
        const totals = items.reduce((acc, item) => ({
            taxableValue: acc.taxableValue + item.taxableValue,
            gst: acc.gst + item.gst,
            netValue: acc.netValue + item.netValue
        }), { taxableValue: 0, gst: 0, netValue: 0 });

        setTotalTaxableValue(totals.taxableValue);
        setGSTTotal(totals.gst);
        setTotalValue(totals.taxableValue);
        setNetValueTotal(totals.netValue);
    }, [items]);

    const handleAddItem = () => {
        const newItem: ItemRow = {
            id: items.length + 1,
            itemCode: '',
            itemName: '',
            quantity: '',
            price: '',
            taxableValue: 0,
            gst: 0,
            netValue: 0
        };
        setItems([...items, newItem]);
    };

    const handleRemoveItem = (id: number) => {
        if (items.length > 1) {
            setItems(items.filter(item => item.id !== id));
        }
    };

    const handleItemChange = (id: number, field: keyof ItemRow, value: string) => {
        setItems(items.map(item => {
            if (item.id === id) {
                const updatedItem = { ...item, [field]: value };
                return calculateItemValues(updatedItem);
            }
            return item;
        }));
    };

    const handleSave = async () => {
        try {
            // Validate required fields
            if (!soSeries) {
                alert('Please select SO Series Name');
                return;
            }
            if (!customerName) {
                alert('Please select Customer Name');
                return;
            }
            if (!branch) {
                alert('Please select Branch');
                return;
            }
            if (!date) {
                alert('Please select Date');
                return;
            }
            // detailed item validation
            if (items.length === 0) {
                alert('Please add at least one item');
                return;
            }

            const invalidItem = items.find(i => !i.itemCode || !i.quantity || !i.price);
            if (invalidItem) {
                alert(`Please fill in all details for item #${invalidItem.id} (Code, Qty, Price)`);
                return;
            }

            // Prepare the data structure for backend
            const salesOrderData = {
                // Basic Details
                so_series_name: soSeries,
                so_number: soNumber,
                date: date,
                customer_po_number: customerPONumber || null,
                customer_name: customerName,
                branch: branch,
                address: address || null,
                email: email || null,
                contact_number: contactNumber || null,
                // quotation_type/number removed from here - moved to quotation_details

                // Items
                items: items.map(item => ({
                    item_code: item.itemCode,
                    item_name: item.itemName,
                    quantity: parseFloat(item.quantity) || 0,
                    price: parseFloat(item.price) || 0,
                    taxable_value: item.taxableValue,
                    gst: item.gst,
                    net_value: item.netValue
                })),

                // Delivery Terms
                delivery_terms: {
                    deliver_at: deliverAt || null,
                    delivery_date: deliveryDate || null
                },

                // Payment and Salesperson (Combined)
                payment_and_salesperson: {
                    credit_period: creditPeriod || null,
                    salesperson_in_charge: salespersonInCharge || null,
                    employee_id: employeeId || null,
                    employee_name: employeeName || null
                },

                // Quotation Details (New table)
                quotation_details: {
                    quotation_type: quotationType || null,
                    quotation_number: quotationNumber || null
                }
            };

            console.log('Sending sales order data:', salesOrderData);

            // Send to backend API using httpClient (automatically handles auth)
            const result = await httpClient.post('/api/customerportal/sales-orders/', salesOrderData);

            console.log('Sales order saved successfully:', result);
            alert('Sales Order saved successfully!');

            // Optionally call onCancel to go back to the list
            onCancel();

        } catch (error) {
            console.error('Error saving sales order:', error);
            alert(`Error saving sales order: ${error.message}`);
        }
    };


    return (
        <div className="min-h-screen bg-gray-50">
            {/* Main Content */}
            <div className="px-8 py-6">
                <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-200 p-8">
                    {/* Page Title */}
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Create Sales Order</h2>

                    {/* Section 1: Basic Details */}
                    <div className="mb-8">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">Basic Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    SO Series Name <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={soSeries}
                                    onChange={(e) => setSOSeries(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                >
                                    <option value="">Select series</option>
                                    <option value="SO-2024">SO-2024</option>
                                    <option value="SO-EXP">SO-EXP</option>
                                    <option value="SO-DOM">SO-DOM</option>
                                </select>
                                <p className="text-xs text-gray-500 mt-1">Data from masters</p>
                            </div>
                            <div className="flex items-end">
                                <button
                                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-[4px] hover:bg-indigo-700 transition-colors"
                                    onClick={() => alert('Import Customer PO functionality')}
                                >
                                    Import Customer PO
                                </button>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Sales Order Number
                                </label>
                                <input
                                    type="text"
                                    value={soNumber}
                                    readOnly
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-600"
                                />
                                <p className="text-xs text-gray-500 mt-1">Auto-generated based on series</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Date <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                />
                                <p className="text-xs text-gray-500 mt-1">Default: Today, editable</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Customer PO Number
                                </label>
                                <input
                                    type="text"
                                    value={customerPONumber}
                                    onChange={(e) => setCustomerPONumber(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="Can be fetched from imported PO"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Customer Name <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                >
                                    <option value="">Select customer</option>
                                    <option value="customer1">Acme Corporation</option>
                                    <option value="customer2">Global Traders</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Branch <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={branch}
                                    onChange={(e) => setBranch(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                >
                                    <option value="">Select branch</option>
                                    <option value="main">Main Branch</option>
                                    <option value="north">North Branch</option>
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Address
                                </label>
                                <textarea
                                    rows={3}
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                                    placeholder="Auto-filled from customer master"
                                />
                                <p className="text-xs text-gray-500 mt-1">Fetched from customer master</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="Auto-filled, editable"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Contact Number
                                </label>
                                <input
                                    type="tel"
                                    value={contactNumber}
                                    onChange={(e) => setContactNumber(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="Auto-filled"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Sales Quotation/Contract Linking */}
                    <div className="mb-8">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">Sales Quotation / Contract Linking</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Type
                                </label>
                                <select
                                    value={quotationType}
                                    onChange={(e) => setQuotationType(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                >
                                    <option value="">Select type</option>
                                    <option value="quotation">Sales Quotation</option>
                                    <option value="contract">Contract</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Sales Quotation # / Contract #
                                </label>
                                <select
                                    value={quotationNumber}
                                    onChange={(e) => setQuotationNumber(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                >
                                    <option value="">Select quotation/contract</option>
                                    <option value="sq001">SQ-2024-001</option>
                                    <option value="sq002">SQ-2024-002</option>
                                    <option value="ct001">CT-2024-001</option>
                                </select>
                                <p className="text-xs text-gray-500 mt-1">Only valid for selected customer</p>
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Item Details Table */}
                    <div className="mb-8">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">Item Details</h3>
                        <div className="overflow-x-auto border border-gray-200 rounded-[4px]">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Code</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Name</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Taxable Value</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GST</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Net Value</th>
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
                                                    className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                    placeholder="Code"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="text"
                                                    value={item.itemName}
                                                    onChange={(e) => handleItemChange(item.id, 'itemName', e.target.value)}
                                                    className="w-32 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                    placeholder="Name"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                                                    className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                    placeholder="Qty"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="number"
                                                    value={item.price}
                                                    onChange={(e) => handleItemChange(item.id, 'price', e.target.value)}
                                                    className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                    placeholder="Price"
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                                                ₹{item.taxableValue.toFixed(2)}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                                                ₹{item.gst.toFixed(2)}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                                                ₹{item.netValue.toFixed(2)}
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

                    {/* Section 4: Totals Summary */}
                    <div className="mb-8 flex justify-end">
                        <div className="w-full md:w-1/2 lg:w-1/3 bg-gray-50 border border-gray-200 rounded-[4px] p-6">
                            <h3 className="text-md font-semibold text-gray-900 mb-4">Totals Summary</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-600">Total Taxable Value:</span>
                                    <span className="text-sm font-semibold text-gray-900">₹{totalTaxableValue.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-600">GST Total:</span>
                                    <span className="text-sm font-semibold text-gray-900">₹{gstTotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between pt-3 border-t border-gray-300">
                                    <span className="text-sm font-semibold text-gray-900">Net Value Total:</span>
                                    <span className="text-lg font-bold text-indigo-600">₹{netValueTotal.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section 5: Delivery Terms */}
                    <div className="mb-8">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">Delivery Terms</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Deliver At
                                </label>
                                <select
                                    value={deliverAt}
                                    onChange={(e) => setDeliverAt(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                >
                                    <option value="">Select delivery address</option>
                                    <option value="addr1">Main Office - 123 Business St</option>
                                    <option value="addr2">Warehouse - 456 Industrial Ave</option>
                                </select>
                                <p className="text-xs text-gray-500 mt-1">All customer addresses</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Delivery Date
                                </label>
                                <input
                                    type="date"
                                    value={deliveryDate}
                                    onChange={(e) => setDeliveryDate(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 6: Payment Terms */}
                    <div className="mb-8">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">Payment Terms</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Credit Period
                                </label>
                                <input
                                    type="text"
                                    value={creditPeriod}
                                    onChange={(e) => setCreditPeriod(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="Auto-filled from customer master, editable"
                                />
                                <p className="text-xs text-gray-500 mt-1">From customer master</p>
                            </div>
                        </div>
                    </div>

                    {/* Employee Fields */}
                    <div className="mb-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Salesperson-in-charge
                                </label>
                                <input
                                    type="text"
                                    value={salespersonInCharge}
                                    onChange={(e) => setSalespersonInCharge(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder=""
                                />
                                <p className="text-xs text-gray-500 mt-1">Employee / Third Party Agent</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Employee ID
                                </label>
                                <select
                                    value={employeeId}
                                    onChange={(e) => {
                                        setEmployeeId(e.target.value);
                                        // Auto-fill employee name based on ID
                                        if (e.target.value === 'emp001') setEmployeeName('John Doe');
                                        else if (e.target.value === 'emp002') setEmployeeName('Jane Smith');
                                    }}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                >
                                    <option value="">Select employee/agent</option>
                                    <option value="emp001">EMP-001</option>
                                    <option value="emp002">EMP-002</option>
                                    <option value="agent001">AGENT-001</option>
                                </select>
                                <p className="text-xs text-gray-500 mt-1">Employee / Third Party Agent</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Employee Name
                                </label>
                                <input
                                    type="text"
                                    value={employeeName}
                                    readOnly
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-600"
                                    placeholder="Auto-filled when ID is selected"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 8: Actions */}
                    <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
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
            </div>
        </div>
    );
};

export default CreateSalesOrder;


