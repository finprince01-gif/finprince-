import React, { useState, useEffect } from 'react';
import { httpClient } from '../../services/httpClient';
import { showSuccess, showError, showInfo } from '../../utils/toast';
import { handleApiError } from '../../utils/errorHandler';
import { Country, State, City } from 'country-state-city';

interface ItemRow {
    id: number;
    itemCode: string;
    itemName: string;
    quantity: string;
    uom: string; // Unit of Measure
    price: string;
    taxableValue: number;
    gst: number;
    gstRate?: number; // Hidden field for calculation
    netValue: number;
    packingNotes: string;
}

interface CreateSalesOrderProps {
    onCancel: () => void;
    editId?: string | null;
}

const CreateSalesOrder: React.FC<CreateSalesOrderProps> = ({ onCancel, editId }) => {
    // Section 1: Basic Details
    const [soSeries, setSOSeries] = useState('SO-2024');
    const [soNumber, setSONumber] = useState(`SO-${Date.now().toString().slice(-6)}`); // Auto-generated unique ID
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [customerPONumber, setCustomerPONumber] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [branch, setBranch] = useState('');
    const [address, setAddress] = useState('');
    const [email, setEmail] = useState('');
    const [contactNumber, setContactNumber] = useState('');
    const [gstNo, setGstNo] = useState('');

    // Section 2: Quotation/Contract Linking
    const [quotationType, setQuotationType] = useState('');
    const [quotationNumber, setQuotationNumber] = useState('');
    const [salesQuotations, setSalesQuotations] = useState<any[]>([]);

    // Customer Data Types
    interface Customer {
        id: number;
        customer_name: string;
        customer_code: string;
        gst_details: {
            branches: {
                id: number;
                gstin: string;
                defaultRef: string;
                address: string;
            }[];
        };
        address_line1?: string;
        city?: string;
        state?: string;
        pincode?: string;
        products_services?: {
            items: {
                itemCode: string;
                packingNotes: string;
            }[];
        };
    }

    const [customers, setCustomers] = useState<Customer[]>([]);
    const [filteredBranches, setFilteredBranches] = useState<any[]>([]);
    const [allCustomerBranches, setAllCustomerBranches] = useState<any[]>([]);

    const [contracts, setContracts] = useState<any[]>([]);

    // Inventory Data
    const [inventoryItems, setInventoryItems] = useState<any[]>([]);

    useEffect(() => {
        const fetchOrderForEdit = async () => {
            if (!editId) return;
            try {
                const order = await httpClient.get<any>(`/api/customerportal/sales-orders/${editId}/`);


                // Set Basic Details
                setSOSeries(order.so_series_name);
                setSONumber(order.so_number);
                setDate(order.date);
                setCustomerPONumber(order.customer_po_number || '');
                setCustomerName(order.customer_name);
                setBranch(order.branch);
                setAddress(order.address || '');
                setEmail(order.email || '');
                setContactNumber(order.contact_number || '');
                setGstNo(order.gst_no || '');

                // Quotation Details
                if (order.quotation_details) {
                    setQuotationType(order.quotation_details.quotation_type || '');
                    setQuotationNumber(order.quotation_details.quotation_number || '');
                }

                // Items
                if (order.items && order.items.length > 0) {
                    setItems(order.items.map((item: any, idx: number) => ({
                        id: idx + 1,
                        itemCode: item.item_code,
                        itemName: item.item_name,
                        quantity: item.quantity?.toString() || '0',
                        uom: item.uom || '',
                        price: item.price?.toString() || '0',
                        taxableValue: parseFloat(item.taxable_value) || 0,
                        gst: parseFloat(item.gst) || 0,
                        gstRate: parseFloat(item.gst_rate) || 0,
                        netValue: parseFloat(item.net_value) || 0,
                        packingNotes: item.packing_notes || ''
                    })));
                }

                // Delivery Terms
                if (order.delivery_terms) {
                    setDeliverAt(order.delivery_terms.deliver_at || '');
                    setDeliveryDate(order.delivery_terms.delivery_date || '');

                    if (order.delivery_terms.third_party_address) {
                        const tp = order.delivery_terms.third_party_address;
                        // Map country/state name back to code if possible, or just use as is
                        // CSC dropdowns expect codes for searching but we might have names
                        // For now we set whatever we have
                        setThirdPartyCountry(tp.country || '');
                        setThirdPartyState(tp.state || '');
                        setThirdPartyPincode(tp.pincode || '');
                        setThirdPartyAddress1(tp.address_line_1 || '');
                        setThirdPartyAddress2(tp.address_line_2 || '');
                        setThirdPartyAddress3(tp.address_line_3 || '');
                        setThirdPartyCity(tp.city || '');
                    }
                }

                // Payment Terms
                if (order.payment_and_salesperson) {
                    setCreditPeriod(order.payment_and_salesperson.credit_period || '');
                    setSalespersonInCharge(order.payment_and_salesperson.salesperson_in_charge || '');
                    setEmployeeId(order.payment_and_salesperson.employee_id || '');
                    setEmployeeName(order.payment_and_salesperson.employee_name || '');
                    // Agent fields if applicable...
                }

            } catch (error) {
                handleApiError(error, 'Fetch Order for Edit');
            }
        };

        const fetchAllData = async () => {
            await Promise.all([
                fetchQuotations(),
                fetchContracts(),
                fetchInventoryItems(),
                fetchCustomers()
            ]);
            // Call edit fetch after base data is loaded
            if (editId) await fetchOrderForEdit();
        };

        const fetchQuotations = async () => {
            try {
                const [generalResponse, specificResponse] = await Promise.all([
                    httpClient.get('/api/customerportal/sales-quotations-general/'),
                    httpClient.get('/api/customerportal/sales-quotations-specific/')
                ]);

                const general: any[] = Array.isArray(generalResponse) ? generalResponse : (generalResponse as any).results || [];
                const specific: any[] = Array.isArray(specificResponse) ? specificResponse : (specificResponse as any).results || [];

                const combined = [
                    ...general.map(q => ({ ...q, type: 'General', label: `${q.quote_number} (General)` })),
                    ...specific.map(q => ({ ...q, type: 'Specific', label: `${q.quote_number} (Specific)` }))
                ];
                setSalesQuotations(combined);
            } catch (error) {
                handleApiError(error, 'Fetch Sales Quotations');
            }
        };

        const fetchContracts = async () => {
            try {
                const response = await httpClient.get<any[]>('/api/customerportal/long-term-contracts/');
                setContracts(Array.isArray(response) ? response : (response as any).results || []);
            } catch (error) {
                handleApiError(error, 'Fetch Contracts');
            }
        };

        const fetchInventoryItems = async () => {
            try {
                const response = await httpClient.get<any[]>('/api/inventory/items/?is_active=true');
                const itemsList = Array.isArray(response) ? response : (response as any).results || [];
                setInventoryItems(itemsList);
            } catch (error) {
                handleApiError(error, 'Fetch Inventory Items');
            }
        };

        const fetchCustomers = async () => {
            try {
                const response = await httpClient.get<any[]>('/api/customerportal/customer-master/');
                const customerList = Array.isArray(response) ? response : (response as any).results || [];
                setCustomers(customerList);
            } catch (error) {
                handleApiError(error, 'Fetch Customers');
            }
        };

        fetchAllData();
    }, [editId]);

    // Section 3: Item Details
    // Section 3: Item Details
    const [items, setItems] = useState<ItemRow[]>([
        {
            id: 1,
            itemCode: '',
            itemName: '',
            quantity: '',
            uom: '',
            price: '',
            taxableValue: 0,
            gst: 0,
            gstRate: 0,
            netValue: 0,
            packingNotes: ''
        }
    ]);

    // Section 4: Totals
    const [totalTaxableValue, setTotalTaxableValue] = useState(0);
    const [gstTotal, setGSTTotal] = useState(0);
    const [totalValue, setTotalValue] = useState(0);
    const [netValueTotal, setNetValueTotal] = useState(0);

    // Section 5: Delivery Terms
    const [deliverAt, setDeliverAt] = useState('');
    const [deliveryDate, setDeliveryDate] = useState('');

    // Third Party Delivery Address
    const [thirdPartyCountry, setThirdPartyCountry] = useState('');
    const [thirdPartyState, setThirdPartyState] = useState('');
    const [thirdPartyCity, setThirdPartyCity] = useState('');
    const [thirdPartyPincode, setThirdPartyPincode] = useState('');
    const [thirdPartyAddress1, setThirdPartyAddress1] = useState('');
    const [thirdPartyAddress2, setThirdPartyAddress2] = useState('');
    const [thirdPartyAddress3, setThirdPartyAddress3] = useState('');

    // Section 6: Payment Terms
    const [creditPeriod, setCreditPeriod] = useState('');

    // Section 7: Salesperson
    const [employeeId, setEmployeeId] = useState('');
    const [employeeName, setEmployeeName] = useState('');
    const [thirdPartyAgentId, setThirdPartyAgentId] = useState('');
    const [thirdPartyAgentName, setThirdPartyAgentName] = useState('');
    const [salespersonInCharge, setSalespersonInCharge] = useState('');

    // Calculate item values
    const calculateItemValues = (item: ItemRow): ItemRow => {
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.price) || 0;
        const taxableValue = qty * price;
        const gstRate = item.gstRate || 0;
        const gst = taxableValue * (gstRate / 100);
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
            uom: '',
            price: '',
            taxableValue: 0,
            gst: 0,
            gstRate: 0,
            netValue: 0,
            packingNotes: ''
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
                let updatedItem = { ...item, [field]: value };

                // Auto-fill logic based on Item Code or Item Name
                if (field === 'itemCode') {
                    const selectedItem = inventoryItems.find(i => i.item_code === value);
                    if (selectedItem) {
                        updatedItem = {
                            ...updatedItem,
                            itemName: selectedItem.item_name,
                            uom: selectedItem.uom || '',
                            price: selectedItem.rate ? selectedItem.rate.toString() : '0',
                            gstRate: parseFloat(selectedItem.gst_rate) || 0,
                        };

                        // Auto-fill packing notes from customer master
                        const currentCustomer = customers.find(c => c.customer_name === customerName);
                        if (currentCustomer && currentCustomer.products_services) {
                            const customerProduct = currentCustomer.products_services.items.find(i => i.itemCode === value);
                            if (customerProduct) {
                                updatedItem.packingNotes = customerProduct.packingNotes || '';
                            }
                        }
                    }
                } else if (field === 'itemName') {
                    const selectedItem = inventoryItems.find(i => i.item_name === value);
                    if (selectedItem) {
                        updatedItem = {
                            ...updatedItem,
                            itemCode: selectedItem.item_code,
                            uom: selectedItem.uom || '',
                            price: selectedItem.rate ? selectedItem.rate.toString() : '0',
                            gstRate: parseFloat(selectedItem.gst_rate) || 0,
                        };

                        // Auto-fill packing notes from customer master
                        const currentCustomer = customers.find(c => c.customer_name === customerName);
                        if (currentCustomer && currentCustomer.products_services) {
                            const customerProduct = currentCustomer.products_services.items.find(i => i.itemCode === selectedItem.item_code);
                            if (customerProduct) {
                                updatedItem.packingNotes = customerProduct.packingNotes || '';
                            }
                        }
                    }
                }

                return calculateItemValues(updatedItem);
            }
            return item;
        }));
    };

    const handleSave = async () => {
        try {
            // Validate required fields
            if (!soSeries) {
                showError('Please select SO Series Name');
                return;
            }
            if (!customerName) {
                showError('Please select Customer Name');
                return;
            }
            if (!branch) {
                showError('Please select Branch');
                return;
            }
            if (!date) {
                showError('Please select Date');
                return;
            }
            // detailed item validation
            if (items.length === 0) {
                showError('Please add at least one item');
                return;
            }

            const invalidItem = items.find(i => !i.itemCode || !i.quantity || !i.price);
            if (invalidItem) {
                showError(`Please fill in all details for item #${invalidItem.id} (Code, Qty, Price)`);
                return;
            }

            // Prepare the data structure for backend
            const salesOrderData = {
                // Basic Details
                so_series_name: soSeries,
                so_number: soNumber,
                date: date,
                customer_po_number: customerPONumber || null,
                gst_no: gstNo || null,
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
                    uom: item.uom,
                    price: parseFloat(item.price) || 0,
                    taxable_value: item.taxableValue,
                    gst_rate: item.gstRate, // Include GST Rate from hidden field
                    gst: item.gst,
                    net_value: item.netValue,
                    packing_notes: item.packingNotes
                })),

                // Delivery Terms
                delivery_terms: {
                    deliver_at: deliverAt || null,
                    delivery_date: deliveryDate || null,
                    // Third Party Address (conditional)
                    third_party_address: deliverAt === 'Third Party' ? {
                        country: Country.getCountryByCode(thirdPartyCountry)?.name || thirdPartyCountry,
                        state: State.getStateByCodeAndCountry(thirdPartyState, thirdPartyCountry)?.name || thirdPartyState,
                        city: thirdPartyCity,
                        pincode: thirdPartyPincode,
                        address_line_1: thirdPartyAddress1,
                        address_line_2: thirdPartyAddress2 || null,
                        address_line_3: thirdPartyAddress3 || null
                    } : null
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



            let result;
            if (editId) {
                result = await httpClient.patch(`/api/customerportal/sales-orders/${editId}/`, salesOrderData);

                showSuccess('Sales Order updated successfully!');
            } else {
                result = await httpClient.post('/api/customerportal/sales-orders/', salesOrderData);

                showSuccess('Sales Order saved successfully!');
            }

            onCancel();
        } catch (error: any) {
            handleApiError(error, 'Save Sales Order');
        }
    };


    const handleCustomerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedName = e.target.value;
        setCustomerName(selectedName);
        setBranch('');
        setGstNo('');
        setAddress('');

        const customer = customers.find(c => c.customer_name === selectedName);
        if (customer && customer.gst_details && customer.gst_details.branches) {
            setAllCustomerBranches(customer.gst_details.branches);
            setFilteredBranches(customer.gst_details.branches);
            // If only one branch, auto-select it
            if (customer.gst_details.branches.length === 1) {
                const singleBranch = customer.gst_details.branches[0];
                setBranch(singleBranch.defaultRef || 'Main Branch');
                setGstNo(singleBranch.gstin || '');
                setAddress(singleBranch.address || '');
                setDeliverAt(singleBranch.address || '');
            }
        } else {
            setAllCustomerBranches([]);
            setFilteredBranches([]);
        }
    };

    const handleGstChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedGst = e.target.value;
        setGstNo(selectedGst);
        setBranch(''); // Reset branch when GST changes
        setAddress('');

        if (selectedGst) {
            const branchesForGst = allCustomerBranches.filter(b => b.gstin === selectedGst);
            setFilteredBranches(branchesForGst);
            // If only one branch for this GST, auto-select it
            if (branchesForGst.length === 1) {
                const singleBranch = branchesForGst[0];
                setBranch(singleBranch.defaultRef || '');
                setAddress(singleBranch.address || '');
                setDeliverAt(singleBranch.address || '');
            }
        } else {
            // If GST is cleared, show all branches for the customer
            setFilteredBranches(allCustomerBranches);
        }
    };

    const handleBranchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedBranchRef = e.target.value;
        setBranch(selectedBranchRef);

        const branchDetails = allCustomerBranches.find(b => b.defaultRef === selectedBranchRef);
        if (branchDetails) {
            setGstNo(branchDetails.gstin || '');
            setAddress(branchDetails.address || '');
            setDeliverAt(branchDetails.address || '');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Main Content */}
            <div className="px-8 py-6">
                <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-200 p-8">
                    {/* Page Title */}
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">
                        {editId ? 'Edit Sales Order' : 'Create Sales Order'}
                    </h2>

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
                                    onClick={() => showInfo('Import Customer PO functionality')}
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
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Customer Name <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={customerName}
                                    onChange={handleCustomerChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                >
                                    <option value="">Select customer</option>
                                    {customers.map(customer => (
                                        <option key={customer.id} value={customer.customer_name}>
                                            {customer.customer_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    GST NUMBER
                                </label>
                                <select
                                    value={gstNo}
                                    onChange={handleGstChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                    disabled={!customerName}
                                >
                                    <option value="">Select GST Number</option>
                                    {/* Get unique GSTINs */}
                                    {Array.from(new Set(allCustomerBranches.map(b => b.gstin))).filter(Boolean).map(gst => (
                                        <option key={gst} value={gst}>
                                            {gst}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Branch <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={branch}
                                    onChange={handleBranchChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                >
                                    <option value="">Select branch</option>
                                    {filteredBranches.map(b => (
                                        <option key={b.id} value={b.defaultRef}>
                                            {b.defaultRef}
                                        </option>
                                    ))}
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
                                />
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
                                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                    disabled={!quotationType}
                                >
                                    <option value="">Select quotation/contract</option>
                                    {quotationType === 'quotation' && salesQuotations.map((sq) => (
                                        <option key={sq.id} value={sq.quote_number}>
                                            {sq.label}
                                        </option>
                                    ))}
                                    {quotationType === 'contract' && contracts.map((contract) => (
                                        <option key={contract.id} value={contract.contract_number}>
                                            {contract.contract_number}
                                        </option>
                                    ))}
                                </select>
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
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">UOM</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Taxable Value</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GST</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Net Value</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {items.map((item, index) => (
                                        <React.Fragment key={item.id}>
                                            <tr className="hover:bg-gray-50">
                                                <td className="px-4 py-3 text-sm text-gray-900">{index + 1}</td>
                                                <td className="px-4 py-3">
                                                    <select
                                                        value={item.itemCode}
                                                        onChange={(e) => handleItemChange(item.id, 'itemCode', e.target.value)}
                                                        className="w-32 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                                    >
                                                        <option value="">Select Code</option>
                                                        {inventoryItems.map(invItem => (
                                                            <option key={invItem.id} value={invItem.item_code}>
                                                                {invItem.item_code}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <select
                                                        value={item.itemName}
                                                        onChange={(e) => handleItemChange(item.id, 'itemName', e.target.value)}
                                                        className="w-48 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                                    >
                                                        <option value="">Select Name</option>
                                                        {inventoryItems.map(invItem => (
                                                            <option key={invItem.id} value={invItem.item_name}>
                                                                {invItem.item_name}
                                                            </option>
                                                        ))}
                                                    </select>
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
                                                        type="text"
                                                        value={item.uom}
                                                        readOnly // Set to readOnly as per requirement
                                                        className="w-20 px-2 py-1 border border-gray-300 rounded text-sm bg-gray-50 text-gray-600"
                                                        placeholder="UOM"
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <input
                                                        type="number"
                                                        value={item.price}
                                                        readOnly // Set to readOnly as per requirement
                                                        className="w-24 px-2 py-1 border border-gray-300 rounded text-sm bg-gray-50 text-gray-600"
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
                                            <tr className="bg-gray-50/50">
                                                <td colSpan={10} className="px-4 py-2 border-b border-gray-200">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                                                            Packing Notes:
                                                        </span>
                                                        <input
                                                            type="text"
                                                            value={item.packingNotes}
                                                            onChange={(e) => handleItemChange(item.id, 'packingNotes', e.target.value)}
                                                            className="flex-1 px-3 py-1.5 text-sm border-0 border-b border-transparent focus:border-indigo-500 focus:ring-0 bg-transparent placeholder-gray-400 italic"
                                                            placeholder="Enter any special packing instructions for this item..."
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        </React.Fragment>
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
                                    {allCustomerBranches.map((branch, index) => (
                                        <option key={index} value={branch.address}>
                                            {branch.address}
                                        </option>
                                    ))}
                                    <option value="Third Party">Third Party</option>
                                </select>
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

                    {/* Third Party Delivery Address - Conditional */}
                    {deliverAt === 'Third Party' && (
                        <div className="mb-8">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">Third Party Delivery Address</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Country <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={thirdPartyCountry}
                                        onChange={(e) => {
                                            setThirdPartyCountry(e.target.value);
                                            setThirdPartyState('');
                                            setThirdPartyCity('');
                                        }}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                    >
                                        <option value="">Select country</option>
                                        {Country.getAllCountries().map((country) => (
                                            <option key={country.isoCode} value={country.isoCode}>
                                                {country.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        State <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={thirdPartyState}
                                        onChange={(e) => {
                                            setThirdPartyState(e.target.value);
                                            setThirdPartyCity('');
                                        }}
                                        disabled={!thirdPartyCountry}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                                    >
                                        <option value="">Select state</option>
                                        {thirdPartyCountry && State.getStatesOfCountry(thirdPartyCountry).map((state) => (
                                            <option key={state.isoCode} value={state.isoCode}>
                                                {state.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        City <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={thirdPartyCity}
                                        onChange={(e) => setThirdPartyCity(e.target.value)}
                                        disabled={!thirdPartyState}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                                    >
                                        <option value="">Select city</option>
                                        {thirdPartyCountry && thirdPartyState && City.getCitiesOfState(thirdPartyCountry, thirdPartyState).map((city) => (
                                            <option key={city.name} value={city.name}>
                                                {city.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Pincode <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={thirdPartyPincode}
                                        onChange={(e) => setThirdPartyPincode(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Enter pincode"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Address Line 1 <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={thirdPartyAddress1}
                                        onChange={(e) => setThirdPartyAddress1(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Building name, Street name"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Address Line 2
                                    </label>
                                    <input
                                        type="text"
                                        value={thirdPartyAddress2}
                                        onChange={(e) => setThirdPartyAddress2(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Locality, Area"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Address Line 3
                                    </label>
                                    <input
                                        type="text"
                                        value={thirdPartyAddress3}
                                        onChange={(e) => setThirdPartyAddress3(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Landmark (optional)"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

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
                                />
                                <p className="text-xs text-gray-500 mt-1">From customer master</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Salesperson-in-charge
                                </label>
                                <select
                                    value={salespersonInCharge}
                                    onChange={(e) => {
                                        const newVal = e.target.value;
                                        setSalespersonInCharge(newVal);
                                        if (newVal === 'Employee') {
                                            setThirdPartyAgentId('');
                                            setThirdPartyAgentName('');
                                        } else if (newVal === 'Third Party Agent') {
                                            setEmployeeId('');
                                            setEmployeeName('');
                                        } else {
                                            setEmployeeId('');
                                            setEmployeeName('');
                                            setThirdPartyAgentId('');
                                            setThirdPartyAgentName('');
                                        }
                                    }}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                >
                                    <option value="">Select Type</option>
                                    <option value="Employee">Employee</option>
                                    <option value="Third Party Agent">Third Party Agent</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Employee Fields */}
                    <div className="mb-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

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
                                    disabled={salespersonInCharge !== 'Employee'}
                                    className={`w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 ${salespersonInCharge !== 'Employee' ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`}
                                >
                                    <option value="">Select Employee ID</option>
                                    <option value="emp001">EMP-001</option>
                                    <option value="emp002">EMP-002</option>
                                </select>
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
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Third Party Agent ID
                                </label>
                                <select
                                    value={thirdPartyAgentId}
                                    onChange={(e) => {
                                        setThirdPartyAgentId(e.target.value);
                                        // Auto-fill agent name based on ID
                                        if (e.target.value === 'agent001') setThirdPartyAgentName('Agent Smith');
                                        else if (e.target.value === 'agent002') setThirdPartyAgentName('Agent Johnson');
                                    }}
                                    disabled={salespersonInCharge !== 'Third Party Agent'}
                                    className={`w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 ${salespersonInCharge !== 'Third Party Agent' ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`}
                                >
                                    <option value="">Select agent</option>
                                    <option value="agent001">AGENT-001</option>
                                    <option value="agent002">AGENT-002</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Third Party Agent Name
                                </label>
                                <input
                                    type="text"
                                    value={thirdPartyAgentName}
                                    readOnly
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-600"
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


