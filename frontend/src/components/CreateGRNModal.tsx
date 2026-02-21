import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import { httpClient } from '../services/httpClient';
import { showWarning } from '../utils/toast';

interface GRNItem {
    id: number;
    itemCode: string;
    itemName: string;
    hsnCode: string;
    uom: string;
    refQty: string; // PO Qty
    secondaryQty: string; // Invoice Qty
    receivedQty: string;
    acceptedQty: string;
    rejectedQty: string;
    shortExcessQty: string;
    remarks: string;
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
    const [grnType, setGrnType] = useState<'purchases' | 'sales_return'>('purchases');
    const [grnNo, setGrnNo] = useState('');
    const [grnSeriesId, setGrnSeriesId] = useState('');
    const [grnSeriesName, setGrnSeriesName] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [time, setTime] = useState(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    const [location, setLocation] = useState('');

    // Vendor/Customer State
    const [vendorName, setVendorName] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [branch, setBranch] = useState('');
    const [address, setAddress] = useState('');
    const [gstin, setGstin] = useState('');

    // References State
    const [purchaseOrderNo, setPurchaseOrderNo] = useState('');
    const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');

    const [postingNote, setPostingNote] = useState('');

    // Data Source State
    const [locations, setLocations] = useState<Location[]>([]);
    const [grnSeriesList, setGrnSeriesList] = useState<any[]>([]);
    const [vendors, setVendors] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [itemsList, setItemsList] = useState<any[]>([]);

    // Dynamic Options State
    const [branchOptions, setBranchOptions] = useState<any[]>([]);
    const [poOptions, setPoOptions] = useState<any[]>([]);
    const [invoiceOptions, setInvoiceOptions] = useState<any[]>([]);

    // Items State
    const [items, setItems] = useState<GRNItem[]>([
        {
            id: 1,
            itemCode: '',
            itemName: '',
            hsnCode: '',
            uom: '',
            refQty: '',
            secondaryQty: '',
            receivedQty: '',
            acceptedQty: '',
            rejectedQty: '',
            shortExcessQty: '',
            remarks: '',
            boxes: ''
        }
    ]);

    // Fetch initial data on mount
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                // Fetch GRN Series
                const seriesResponse = await httpClient.get<any[]>('/api/inventory/master-voucher-grn/');
                setGrnSeriesList(seriesResponse || []);

                // Fetch Locations
                const locResponse = await httpClient.get<any>('/api/inventory/locations/');
                setLocations(Array.isArray(locResponse) ? locResponse : (locResponse?.results || []));

                // Fetch Vendors (Basic Details)
                const vendorsResponse = await apiService.getRichVendors() as any;
                setVendors(Array.isArray(vendorsResponse) ? vendorsResponse : (vendorsResponse?.results || []));

                // Fetch Customers
                const customersResponse = await apiService.getRichCustomers();
                setCustomers(customersResponse || []);

                // Fetch Items
                const itemsResponse = await apiService.getStockItems() as any;
                setItemsList(Array.isArray(itemsResponse) ? itemsResponse : (itemsResponse?.results || []));

            } catch (error) {
                console.error('Failed to fetch locations:');
            }
        };
        fetchInitialData();
    }, []);

    // Handle Vendor Change
    const handleVendorChange = async (selectedVendorName: string) => {
        setVendorName(selectedVendorName);

        // Reset dependent fields
        setBranch('');
        setBranchOptions([]);
        setAddress('');
        setGstin('');
        setPurchaseOrderNo('');
        setPoOptions([]);
        setSupplierInvoiceNo('');
        setInvoiceOptions([]);

        const vendor = vendors.find(v => v.vendor_name === selectedVendorName);
        if (vendor) {
            try {
                // Fetch Branches (GST Details)
                const branchResponse = await apiService.getVendorGSTDetails(vendor.id);
                setBranchOptions(Array.isArray(branchResponse) ? branchResponse : []);

                // Fetch Purchase Orders
                const poResponse = await apiService.getVendorPurchaseOrders(selectedVendorName);
                if (poResponse && poResponse.success && Array.isArray(poResponse.data)) {
                    setPoOptions(poResponse.data);
                }

                // Fetch Purchase Invoices
                const invResponse = await apiService.getVendorPurchaseInvoices(selectedVendorName);
                if (Array.isArray(invResponse)) {
                    setInvoiceOptions(invResponse);
                }
            } catch (error) {
                console.error("Error fetching vendor details:", error);
            }
        }
    };

    // Handle GRN Series Change
    const handleGrnSeriesChange = async (seriesId: string) => {
        setGrnSeriesId(seriesId);
        const series = grnSeriesList.find(s => s.id.toString() === seriesId);
        if (series) {
            setGrnSeriesName(series.name);
            try {
                const response = await httpClient.get<{ grn_no: string }>(`/api/inventory/master-voucher-grn/${seriesId}/next-number/`);
                if (response && response.grn_no) {
                    setGrnNo(response.grn_no);
                }
            } catch (error) {
                console.error("Error fetching next GRN number:", error);
            }
        } else {
            setGrnSeriesName('');
            setGrnNo('');
        }
    };

    // Handle Branch Change
    const handleBranchChange = (selectedBranchName: string) => {
        setBranch(selectedBranchName);
        const selectedBranch = branchOptions.find(b =>
            (b.reference_name || b.trade_name || 'Main') === selectedBranchName
        );

        if (selectedBranch) {
            const addressParts = [
                selectedBranch.address_line_1,
                selectedBranch.address_line_2,
                selectedBranch.city,
                selectedBranch.state,
                selectedBranch.pincode,
                selectedBranch.country
            ].filter(Boolean);

            setAddress(addressParts.join(', '));
            setGstin(selectedBranch.gstin || '');
        }
    };

    const handleAddItem = () => {
        const newItem: GRNItem = {
            id: Date.now(),
            itemCode: '',
            itemName: '',
            hsnCode: '',
            uom: '',
            refQty: '',
            secondaryQty: '',
            receivedQty: '',
            acceptedQty: '',
            rejectedQty: '',
            shortExcessQty: '',
            remarks: '',
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
        setItems(items.map(item => {
            if (item.id !== id) return item;

            const updatedItem = { ...item, [field]: value };

            // Logic for Item Selection
            if (field === 'itemCode' || field === 'itemName') {
                const selectedStockItem = itemsList.find(i => {
                    const code = i.item_code || i.code || '';
                    const name = i.item_name || i.name || '';
                    return (field === 'itemCode' ? code : name) === value;
                });

                if (selectedStockItem) {
                    updatedItem.itemCode = selectedStockItem.item_code || selectedStockItem.code || '';
                    updatedItem.itemName = selectedStockItem.item_name || selectedStockItem.name || '';
                    updatedItem.hsnCode = selectedStockItem.hsn_code || selectedStockItem.hsn_sac_code || '';
                    updatedItem.uom = selectedStockItem.uom || selectedStockItem.base_unit || selectedStockItem.unit || '';
                }
            }

            // Calculation Logic: Rejected = Received - Accepted
            if (field === 'receivedQty' || field === 'acceptedQty') {
                const received = parseFloat(updatedItem.receivedQty) || 0;
                const accepted = parseFloat(updatedItem.acceptedQty) || 0;
                updatedItem.rejectedQty = (received - accepted).toString();

                // Short/Excess logic could be added here if needed, comparing with Ref/Sec Qty
                // But for now keeping it manual or based on inventory logic
            }

            return updatedItem;
        }));
    };

    const handleSave = () => {
        // Validate required fields
        if (!grnNo) { alert('Please enter GRN No'); return; }
        if (grnType === 'purchases' && !vendorName) { alert('Please select a Vendor'); return; }
        if (grnType === 'sales_return' && !customerName) { alert('Please select a Customer'); return; }
        if (!location) { alert('Please select a Location'); return; }

        // Construct payload
        const payload = {
            grn_type: grnType,
            grn_no: grnNo,
            grn_series_name: grnSeriesName,
            date: date || null,
            time: time || null,
            location_id: location ? parseInt(location) : null,

            vendor_name: grnType === 'purchases' ? vendorName : null,
            customer_name: grnType === 'sales_return' ? customerName : null,
            branch: branch,
            address: address,
            gstin: gstin,

            reference_no: purchaseOrderNo,
            secondary_ref_no: supplierInvoiceNo || '',

            posting_note: postingNote || '',
            status: 'Posted',

            items: items.map(item => ({
                item_code: item.itemCode || '',
                item_name: item.itemName || '',
                uom: item.uom || '',
                ref_qty: parseFloat(item.refQty) || 0,
                secondary_qty: parseFloat(item.secondaryQty) || 0,
                received_qty: parseFloat(item.receivedQty) || 0,
                accepted_qty: parseFloat(item.acceptedQty) || 0,
                rejected_qty: parseFloat(item.rejectedQty) || 0,
                short_excess_qty: parseFloat(item.shortExcessQty) || 0,
                remarks: item.remarks,
                no_of_boxes: item.boxes || '0'
            }))
        };


        onSave(payload);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-[4px] shadow-none border border-slate-200 w-full max-w-7xl mx-4 max-h-[90vh] overflow-y-auto flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
                    <h3 className="text-xl font-bold text-gray-800">GOODS RECEIPT NOTE</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
                </div>

                <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                    {/* Top Row */}


                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">GRN NO.</label>
                            <input
                                type="radio"
                                name="grnType"
                                checked={grnType === 'sales_return'}
                                onChange={() => {
                                    setGrnType('sales_return');
                                    setVendorName('');
                                    setCustomerName('');
                                    setBranch('');
                                    setAddress('');
                                    setGstin('');
                                }}
                                className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm font-bold text-gray-700 uppercase">SALES RETURN</span>
                        </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">DATE</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">TIME</label>
                            <input
                                type="time"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">LOCATION</label>
                            <select
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">GRN SERIES NAME</label>
                            <select
                                value={grnSeriesId}
                                onChange={(e) => handleGrnSeriesChange(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                                <option value="">Select Series</option>
                                {grnSeriesList.map((series) => (
                                    <option key={series.id} value={series.id.toString()}>
                                        {series.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">GRN NO.</label>
                            <input
                                type="text"
                                value={grnNo}
                                onChange={(e) => setGrnNo(e.target.value)}
                                readOnly={!!grnSeriesId}
                                className={`w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 ${grnSeriesId ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                            />
                        </div>
                    </div>

                    {/* Vendor/Customer Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{grnType === 'purchases' ? 'VENDOR NAME' : 'CUSTOMER NAME'}</label>
                            {grnType === 'purchases' ? (
                                <select
                                    value={vendorName}
                                    onChange={(e) => handleVendorChange(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                >
                                    <option value="">Select Vendor</option>
                                    {vendors.map((v) => (
                                        <option key={v.id} value={v.vendor_name}>
                                            {v.vendor_name}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <select
                                    value={customerName}
                                    onChange={(e) => {
                                        setCustomerName(e.target.value);
                                        // Reset dependent fields if needed
                                        setBranch('');
                                        setBranchOptions([]);
                                        setAddress('');
                                        setGstin('');
                                        // Fetch branches for customer if applicable...
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                >
                                    <option value="">Select Customer</option>
                                    {customers.map((c) => (
                                        <option key={c.id} value={c.customer_name}>
                                            {c.customer_name}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">BRANCH</label>
                            <select
                                value={branch}
                                onChange={(e) => handleBranchChange(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                                <option value="">Select Branch</option>
                                {branchOptions.map((b, idx) => (
                                    <option key={idx} value={b.reference_name || b.trade_name || 'Main'}>
                                        {b.reference_name || b.trade_name || 'Main'}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Address Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ADDRESS</label>
                            <textarea
                                value={address}
                                readOnly
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none bg-gray-50 resize-none h-[42px]"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">GSTIN NO.</label>
                            <input
                                type="text"
                                value={gstin}
                                readOnly
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none bg-gray-50"
                            />
                        </div>
                    </div>

                    {/* Reference Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                                {grnType === 'purchases' ? 'PURCHASE ORDER NO.' : 'SALES VOUCHER NO.'}
                            </label>
                            {grnType === 'purchases' ? (
                                <select
                                    value={purchaseOrderNo}
                                    onChange={(e) => setPurchaseOrderNo(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                >
                                    <option value="">Select PO</option>
                                    {poOptions.map((po) => (
                                        <option key={po.id} value={po.po_number}>
                                            {po.po_number}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    value={purchaseOrderNo}
                                    onChange={(e) => setPurchaseOrderNo(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    placeholder="Enter Sales Voucher No."
                                />
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                                {grnType === 'purchases' ? 'SUPPLIER INVOICE NO.' : 'DEBIT NOTE NO.'}
                            </label>
                            {grnType === 'purchases' ? (
                                <select
                                    value={supplierInvoiceNo}
                                    onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                >
                                    <option value="">Select Invoice</option>
                                    {invoiceOptions.map((inv) => (
                                        <option key={inv.id} value={inv.voucher_number}>
                                            {inv.voucher_number}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    value={supplierInvoiceNo}
                                    onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    placeholder="Enter Debit Note No."
                                />
                            )}
                        </div>
                    </div>

                    {/* Items Section */}
                    <div>
                        <h4 className="text-sm font-bold text-gray-800 uppercase mb-4">ITEMS</h4>
                        <div className="border border-gray-200 rounded-[4px] overflow-hidden overflow-x-auto">
                            <table className="w-full min-w-[1000px]">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-600">Item Code</th>
                                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 w-48">Item Name</th>
                                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 w-20">UOM</th>
                                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 w-20">PO Qty</th>
                                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 w-20">Inv Qty</th>
                                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 w-20">Received</th>
                                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 w-20">Accepted</th>
                                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 w-20">Rejected</th>
                                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 w-20">Shrt/Excess</th>
                                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-600">Remarks</th>
                                        <th className="px-3 py-2 text-center text-xs font-bold text-gray-600 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {items.map((item) => (
                                        <tr key={item.id}>
                                            <td className="p-2">
                                                <select
                                                    value={item.itemCode}
                                                    onChange={(e) => handleItemChange(item.id, 'itemCode', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none"
                                                >
                                                    <option value="">Select</option>
                                                    {itemsList.map(i => {
                                                        const code = i.item_code || i.code || '';
                                                        return <option key={i.id} value={code}>{code}</option>;
                                                    })}
                                                </select>
                                            </td>
                                            <td className="p-2">
                                                <select
                                                    value={item.itemName}
                                                    onChange={(e) => handleItemChange(item.id, 'itemName', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none"
                                                >
                                                    <option value="">Select Item</option>
                                                    {itemsList.map(i => {
                                                        const name = i.item_name || i.name || '';
                                                        return <option key={i.id} value={name}>{name}</option>;
                                                    })}
                                                </select>
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={item.uom}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-gray-50"
                                                />
                                            </td>
                                            <td className="p-2"><input type="number" value={item.refQty} onChange={(e) => handleItemChange(item.id, 'refQty', e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-xs" /></td>
                                            <td className="p-2"><input type="number" value={item.secondaryQty} onChange={(e) => handleItemChange(item.id, 'secondaryQty', e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-xs" /></td>
                                            <td className="p-2"><input type="number" value={item.receivedQty} onChange={(e) => handleItemChange(item.id, 'receivedQty', e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-xs" /></td>
                                            <td className="p-2"><input type="number" value={item.acceptedQty} onChange={(e) => handleItemChange(item.id, 'acceptedQty', e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-xs" /></td>
                                            <td className="p-2"><input type="number" value={item.rejectedQty} readOnly className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-red-50" /></td>
                                            <td className="p-2"><input type="number" value={item.shortExcessQty} onChange={(e) => handleItemChange(item.id, 'shortExcessQty', e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-xs" /></td>
                                            <td className="p-2"><input type="text" value={item.remarks} onChange={(e) => handleItemChange(item.id, 'remarks', e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-xs" /></td>
                                            <td className="p-2 text-center">
                                                <button onClick={() => handleRemoveItem(item.id)} className="text-red-500 hover:text-red-700">
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                                    </svg>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <button onClick={handleAddItem} className="mt-2 text-indigo-600 hover:text-indigo-800 text-sm font-semibold flex items-center gap-1">
                            + Add Another Item
                        </button>
                    </div>

                    {/* Posting Note */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">POSTING NOTE</label>
                        <textarea
                            value={postingNote}
                            onChange={(e) => setPostingNote(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 h-20 resize-none"
                            placeholder="Enter notes here..."
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50 shrink-0">
                    <button
                        onClick={handleSave}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-[4px] transition-colors uppercase text-sm"
                    >
                        Save GRN
                    </button>
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-[4px] hover:bg-gray-50 transition-colors uppercase text-sm"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateGRNModal;
