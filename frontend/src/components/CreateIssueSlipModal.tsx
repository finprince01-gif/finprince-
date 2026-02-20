import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import { httpClient } from '../services/httpClient';
import { showWarning } from '../utils/toast';

interface IssueSlipItem {
    id: number;
    itemCode: string;
    itemName: string;
    hsnCode: string;
    uom: string;
    alternateUnit: string;
    quantity: string;
    boxes: string;
}

interface Location {
    id: number;
    name: string;
    location_type?: string;
}

interface CreateIssueSlipModalProps {
    onClose: () => void;
    onSave: (data: any) => void;
}

const CreateIssueSlipModal: React.FC<CreateIssueSlipModalProps> = ({ onClose, onSave }) => {
    // Form State
    const [outwardSlipNo, setOutwardSlipNo] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [location, setLocation] = useState('');

    // Reference Details
    const [salesOrderNo, setSalesOrderNo] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [branch, setBranch] = useState('');
    const [address, setAddress] = useState('');
    const [gstin, setGstin] = useState('');
    const [postingNote, setPostingNote] = useState('');

    // Delivery Challan / Dispatch Details State
    const [dispatchFrom, setDispatchFrom] = useState('');
    const [modeOfTransport, setModeOfTransport] = useState('');
    const [dispatchDate, setDispatchDate] = useState('');
    const [dispatchTime, setDispatchTime] = useState('');
    const [dispatchDocument, setDispatchDocument] = useState<File | null>(null);
    const [deliveryType, setDeliveryType] = useState('');
    const [transporterId, setTransporterId] = useState('');
    const [transporterName, setTransporterName] = useState('');
    const [vehicleNo, setVehicleNo] = useState('');
    const [lrGrConsignment, setLrGrConsignment] = useState('');

    // Air/Sea Details
    const [uptoPortShippingBillNo, setUptoPortShippingBillNo] = useState('');
    const [uptoPortShipPortCode, setUptoPortShipPortCode] = useState('');
    const [uptoPortShippingBillDate, setUptoPortShippingBillDate] = useState('');
    const [uptoPortOrigin, setUptoPortOrigin] = useState('');
    const [beyondPortShippingBillNo, setBeyondPortShippingBillNo] = useState('');
    const [beyondPortShipPortCode, setBeyondPortShipPortCode] = useState('');
    const [beyondPortShippingBillDate, setBeyondPortShippingBillDate] = useState('');
    const [beyondPortVesselFlightNo, setBeyondPortVesselFlightNo] = useState('');
    const [beyondPortPortOfLoading, setBeyondPortPortOfLoading] = useState('');
    const [beyondPortPortOfDischarge, setBeyondPortPortOfDischarge] = useState('');
    const [beyondPortFinalDestination, setBeyondPortFinalDestination] = useState('');
    const [beyondPortOriginCountry, setBeyondPortOriginCountry] = useState('');
    const [beyondPortDestCountry, setBeyondPortDestCountry] = useState('');

    // Rail Details
    const [railUptoPortDeliveryType, setRailUptoPortDeliveryType] = useState('');
    const [railUptoPortTransporterName, setRailUptoPortTransporterName] = useState('');
    const [railUptoPortTransporterId, setRailUptoPortTransporterId] = useState('');
    const [railBeyondPortRailwayReceiptNo, setRailBeyondPortRailwayReceiptNo] = useState('');
    const [railBeyondPortRailwayReceiptDate, setRailBeyondPortRailwayReceiptDate] = useState('');
    const [railBeyondPortOrigin, setRailBeyondPortOrigin] = useState('');
    const [railBeyondPortRailNo, setRailBeyondPortRailNo] = useState('');
    const [railBeyondPortStationOfDischarge, setRailBeyondPortStationOfDischarge] = useState('');
    const [railBeyondPortDestCountry, setRailBeyondPortDestCountry] = useState('');
    const [railBeyondPortOriginCountry, setRailBeyondPortOriginCountry] = useState('');
    const [railBeyondPortStationOfLoading, setRailBeyondPortStationOfLoading] = useState('');
    const [railBeyondPortFinalDestination, setRailBeyondPortFinalDestination] = useState('');

    // Data Source State
    const [locations, setLocations] = useState<Location[]>([]);
    const [salesOrdersList, setSalesOrdersList] = useState<any[]>([]);
    const [customersList, setCustomersList] = useState<any[]>([]);
    const [availableBranches, setAvailableBranches] = useState<any[]>([]);
    const [inventoryItems, setInventoryItems] = useState<any[]>([]);

    // Items State
    const [items, setItems] = useState<IssueSlipItem[]>([
        { id: 1, itemCode: '', itemName: '', hsnCode: '', uom: '', alternateUnit: '', quantity: '', boxes: '' }
    ]);

    // Fetch data on mount
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [locResponse, soResponse, custResponse, invResponse] = await Promise.all([
                    httpClient.get<any>('/api/inventory/locations/').catch(() => []),
                    apiService.getSalesVouchers({ status: 'Pending' }).catch(() => []),
                    apiService.getSalesCustomers().catch(() => []),
                    apiService.getStockItems().catch(() => [])
                ]);

                const getList = (response: any) => {
                    if (!response) return [];
                    if (Array.isArray(response)) return response;
                    if (Array.isArray(response.results)) return response.results;
                    if (Array.isArray(response.data)) return response.data;
                    return [];
                };

                const allLocations = getList(locResponse);
                setLocations(allLocations.filter((l: any) => l.location_type === 'company_premises'));

                setSalesOrdersList(getList(soResponse));
                setCustomersList(getList(custResponse));
                setInventoryItems(getList(invResponse));

            } catch (error) {
                console.error('Failed to fetch initial data:', error);
            }
        };
        fetchData();
    }, []);

    // Update Branches when Customer changes
    useEffect(() => {
        if (!customerName) {
            setAvailableBranches([]);
            return;
        }

        const customer = customersList.find(c => c.customer_name === customerName);
        if (customer && customer.branches) {
            setAvailableBranches(customer.branches);
        } else {
            setAvailableBranches([]);
        }
    }, [customerName, customersList]);

    // Update Address & GSTIN when Branch changes
    useEffect(() => {
        if (!customerName || !branch) {
            setAddress('');
            setGstin('');
            return;
        }

        const customer = customersList.find(c => c.customer_name === customerName);
        if (customer && customer.branches) {
            const selectedBranch = customer.branches.find((b: any) => b.branch_reference_name === branch || b.reference_name === branch);
            if (selectedBranch) {
                const city = selectedBranch.city ? `, ${selectedBranch.city}` : '';
                const state = selectedBranch.state ? `, ${selectedBranch.state}` : '';
                const pin = selectedBranch.pincode ? ` - ${selectedBranch.pincode}` : '';
                const fullAddr = `${selectedBranch.address_line_1 || selectedBranch.addressLine1 || ''}${selectedBranch.address_line_2 || selectedBranch.addressLine2 ? ', ' + (selectedBranch.address_line_2 || selectedBranch.addressLine2) : ''}${city}${state}${pin}`;

                setAddress(fullAddr);
                setGstin(selectedBranch.gstin || '');
            }
        }
    }, [customerName, branch, customersList]);

    const handleSalesOrderChange = (soVoucherNumber: string) => {
        setSalesOrderNo(soVoucherNumber);

        const order = salesOrdersList.find(so => (so.voucher_number || so.so_number || so.id.toString()) === soVoucherNumber);

        if (order) {
            setCustomerName(order.customer_name || '');
            setBranch(order.branch || '');

            if (order.items && Array.isArray(order.items)) {
                const newItems = order.items.map((soItem: any, idx: number) => {
                    const masterItem = inventoryItems.find(i => i.item_code === soItem.item_code);
                    return {
                        id: Date.now() + idx,
                        itemCode: soItem.item_code || '',
                        itemName: soItem.item_name || '',
                        hsnCode: soItem.hsn_code || masterItem?.hsn_code || '',
                        uom: soItem.uom || masterItem?.uom || '',
                        alternateUnit: masterItem?.alternate_uom || '',
                        quantity: soItem.quantity?.toString() || '',
                        boxes: ''
                    };
                });
                if (newItems.length > 0) setItems(newItems);
            }
        } else {
            setCustomerName('');
            setBranch('');
            setItems([{ id: Date.now(), itemCode: '', itemName: '', hsnCode: '', uom: '', alternateUnit: '', quantity: '', boxes: '' }]);
        }
    };

    const handleAddItem = () => {
        const newItem: IssueSlipItem = {
            id: Date.now(),
            itemCode: '',
            itemName: '',
            hsnCode: '',
            uom: '',
            alternateUnit: '',
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

    const handleItemChange = (id: number, field: keyof IssueSlipItem, value: string) => {
        setItems(items.map(item => {
            if (item.id !== id) return item;

            let updatedItem = { ...item, [field]: value };

            if (field === 'itemCode') {
                const found = inventoryItems.find(i => i.item_code === value);
                if (found) {
                    updatedItem.itemName = found.item_name || found.name || '';
                    updatedItem.hsnCode = found.hsn_code || '';
                    updatedItem.uom = found.uom || found.unit || '';
                }
            } else if (field === 'itemName') {
                const found = inventoryItems.find(i => (i.item_name || i.name) === value);
                if (found) {
                    updatedItem.itemCode = found.item_code || '';
                    updatedItem.hsnCode = found.hsn_code || '';
                    updatedItem.uom = found.uom || found.unit || '';
                }
            }

            return updatedItem;
        }));
    };

    const calculateTotalBoxes = () => {
        return items.reduce((sum, item) => sum + (parseFloat(item.boxes) || 0), 0);
    };

    const handleSave = () => {
        if (!outwardSlipNo) {
            showWarning('Please enter Outward Slip No');
            return;
        }

        const payload = {
            outward_slip_no: outwardSlipNo,
            date: date || null,
            time: time || null,
            outward_type: 'sales',
            location: location ? parseInt(location) : null,
            sales_order_no: salesOrderNo || '',
            customer_name: customerName || '',
            branch: branch || '',
            address: address || '',
            gstin: gstin || '',
            posting_note: postingNote || '',
            total_boxes: calculateTotalBoxes().toString(),
            items: items.map(item => ({
                item_code: item.itemCode || '',
                item_name: item.itemName || '',
                hsn_code: item.hsnCode || '',
                uom: item.uom || '',
                alternate_unit: item.alternateUnit || '',
                quantity: parseFloat(item.quantity) || 0,
                no_of_boxes: item.boxes || '0'
            })),

            // Nested Delivery Challan Object matching Inventory.tsx structure
            delivery_challan: {
                dispatch_from: dispatchFrom,
                mode_of_transport: modeOfTransport,
                dispatch_date: dispatchDate || null,
                dispatch_time: dispatchTime || null,
                delivery_type: deliveryType,
                transporter_id: transporterId,
                transporter_name: transporterName,
                vehicle_no: vehicleNo,
                lr_gr_consignment: lrGrConsignment,

                // Air/Sea Upto Port
                shipping_bill_no: uptoPortShippingBillNo,
                ship_port_code: uptoPortShipPortCode,
                shipping_bill_date: uptoPortShippingBillDate || null,
                origin: uptoPortOrigin,

                // Air/Sea Beyond Port
                beyond_port_shipping_bill_no: beyondPortShippingBillNo,
                beyond_port_ship_port_code: beyondPortShipPortCode,
                beyond_port_shipping_bill_date: beyondPortShippingBillDate || null,
                beyond_port_vessel_flight_no: beyondPortVesselFlightNo,
                beyond_port_port_of_loading: beyondPortPortOfLoading,
                beyond_port_port_of_discharge: beyondPortPortOfDischarge,
                beyond_port_final_destination: beyondPortFinalDestination,
                beyond_port_origin_country: beyondPortOriginCountry,
                beyond_port_dest_country: beyondPortDestCountry,

                // Rail Upto Port
                rail_upto_port_delivery_type: railUptoPortDeliveryType,
                rail_upto_port_transporter_name: railUptoPortTransporterName,
                rail_upto_port_transporter_id: railUptoPortTransporterId,

                // Rail Beyond Port
                rail_beyond_port_receipt_no: railBeyondPortRailwayReceiptNo,
                rail_beyond_port_receipt_date: railBeyondPortRailwayReceiptDate || null,
                rail_beyond_port_origin: railBeyondPortOrigin,
                rail_beyond_port_rail_no: railBeyondPortRailNo,
                rail_beyond_port_station_discharge: railBeyondPortStationOfDischarge,
                rail_beyond_port_dest_country: railBeyondPortDestCountry,
                rail_beyond_port_origin_country: railBeyondPortOriginCountry,
                rail_beyond_port_station_loading: railBeyondPortStationOfLoading,
                rail_beyond_port_final_destination: railBeyondPortFinalDestination,

                // Document
                dispatch_document: dispatchDocument
            }
        };

        onSave(payload);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-[4px] shadow-none border border-slate-200 w-full max-w-6xl mx-4 max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-xl font-bold text-gray-800">Create Issue Slip</h3>
                </div>

                <div className="p-6">
                    {/* Row 1 */}
                    <div className="grid grid-cols-4 gap-5">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Outward Slip No</label>
                            <input
                                type="text"
                                value={outwardSlipNo}
                                onChange={(e) => setOutwardSlipNo(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Date</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Time</label>
                            <input
                                type="time"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Location</label>
                            <select
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    <div className="grid grid-cols-2 gap-5 mt-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Sales Order No.</label>
                            <select
                                value={salesOrderNo}
                                onChange={(e) => handleSalesOrderChange(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">Select Pending Sales Order</option>
                                {salesOrdersList.map((so) => (
                                    <option key={so.id} value={so.voucher_number || so.so_number || so.id}>
                                        {so.voucher_number || so.sales_order_no || `SO #${so.id}`}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Customer Name</label>
                                {salesOrderNo ? (
                                    <input
                                        type="text"
                                        value={customerName}
                                        readOnly
                                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-100"
                                    />
                                ) : (
                                    <select
                                        value={customerName}
                                        onChange={(e) => {
                                            setCustomerName(e.target.value);
                                            setBranch('');
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="">Select Customer</option>
                                        {customersList.map((c) => (
                                            <option key={c.id} value={c.customer_name}>{c.customer_name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Branch</label>
                                <select
                                    value={branch}
                                    onChange={(e) => setBranch(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">Select Branch</option>
                                    {availableBranches.map((br: any) => (
                                        <option key={br.id || br.branch_reference_name || br.reference_name} value={br.branch_reference_name || br.reference_name}>
                                            {br.branch_reference_name || br.reference_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Row 3 */}
                    <div className="grid grid-cols-2 gap-5 mt-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                            <textarea
                                value={address}
                                readOnly
                                rows={2}
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-100 cursor-not-allowed"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">GSTIN No.</label>
                            <input
                                type="text"
                                value={gstin}
                                readOnly
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-100 cursor-not-allowed"
                            />
                        </div>
                    </div>

                    {/* Items Section */}
                    <div className="mt-6">
                        <div className="flex justify-between items-center mb-3">
                            <label className="block text-sm font-semibold text-gray-700">Items</label>
                            <button
                                onClick={handleAddItem}
                                className="text-indigo-600 hover:text-indigo-800 text-sm font-semibold"
                            >
                                + Add Item
                            </button>
                        </div>
                        <div className="overflow-x-auto border border-gray-300 rounded text-sm">
                            <table className="min-w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Item Code</th>
                                        <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Item Name</th>
                                        <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">HSN Code</th>
                                        <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">UOM</th>
                                        <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Quantity</th>
                                        <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">No. of boxes/packs</th>
                                        <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {items.map((item) => (
                                        <tr key={item.id}>
                                            <td className="px-3 py-2">
                                                <select
                                                    value={item.itemCode}
                                                    onChange={(e) => handleItemChange(item.id, 'itemCode', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm min-w-[120px]"
                                                >
                                                    <option value="">Code</option>
                                                    {inventoryItems.map(i => (
                                                        <option key={i.id} value={i.item_code}>{i.item_code}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="px-3 py-2">
                                                <select
                                                    value={item.itemName}
                                                    onChange={(e) => handleItemChange(item.id, 'itemName', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm min-w-[150px]"
                                                >
                                                    <option value="">Item</option>
                                                    {inventoryItems.map(i => (
                                                        <option key={i.id} value={i.item_name || i.name}>{i.item_name || i.name}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="px-3 py-2">
                                                <input
                                                    type="text"
                                                    value={item.hsnCode}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-gray-50"
                                                />
                                            </td>
                                            <td className="px-3 py-2">
                                                <select
                                                    value={item.uom}
                                                    onChange={(e) => handleItemChange(item.id, 'uom', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-center"
                                                >
                                                    <option value="">Unit</option>
                                                    {(() => {
                                                        const selectedItem = inventoryItems.find(i => i.item_code === item.itemCode);
                                                        const units = [];
                                                        if (selectedItem) {
                                                            const u1 = selectedItem.uom || selectedItem.unit;
                                                            const u2 = selectedItem.alternate_uom || selectedItem.alternative_unit;
                                                            if (u1) units.push(u1);
                                                            if (u2 && u2 !== u1) units.push(u2);
                                                        }
                                                        if (item.uom && !units.includes(item.uom)) units.push(item.uom);

                                                        return units.map(u => (
                                                            <option key={u} value={u}>{u}</option>
                                                        ));
                                                    })()}
                                                </select>
                                            </td>
                                            <td className="px-3 py-2">
                                                <input
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                />
                                            </td>
                                            <td className="px-3 py-2">
                                                <input
                                                    type="number"
                                                    value={item.boxes}
                                                    onChange={(e) => handleItemChange(item.id, 'boxes', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <button
                                                    onClick={() => handleRemoveItem(item.id)}
                                                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                                                >
                                                    Remove
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-4 flex justify-end items-center gap-4">
                            <label className="text-sm font-bold text-gray-900">Total Number of Boxes / Packs:</label>
                            <input
                                type="text"
                                value={calculateTotalBoxes()}
                                readOnly
                                className="w-32 px-2 py-1 border border-gray-300 rounded text-sm font-bold text-right bg-gray-50"
                            />
                        </div>
                    </div>

                    {/* Posting Note */}
                    <div className="mt-6">
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Posting Note</label>
                        <textarea
                            value={postingNote}
                            onChange={(e) => setPostingNote(e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    {/* Delivery Challan / Dispatch Details */}
                    <div className="mt-8 pt-6 border-t border-gray-200">
                        <h3 className="text-lg font-bold text-gray-800 mb-4">Delivery Challan / Dispatch Details</h3>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Left Column */}
                            <div className="space-y-4">
                                {/* Dispatch From */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Dispatch From</label>
                                    <textarea
                                        value={dispatchFrom}
                                        onChange={(e) => setDispatchFrom(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                        rows={3}
                                    />
                                </div>

                                {/* Mode of Transport */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Mode of Transport</label>
                                    <select
                                        value={modeOfTransport}
                                        onChange={(e) => setModeOfTransport(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                    >
                                        <option value="">Select Mode</option>
                                        <option value="Road">Road</option>
                                        <option value="Air">Air</option>
                                        <option value="Sea">Sea</option>
                                        <option value="Rail">Rail</option>
                                        <option value="Courier">Courier</option>
                                    </select>
                                </div>

                                {/* Dispatch Date & Time */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Dispatch Date</label>
                                        <input
                                            type="date"
                                            value={dispatchDate}
                                            onChange={(e) => setDispatchDate(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Dispatch Time</label>
                                        <input
                                            type="time"
                                            value={dispatchTime}
                                            onChange={(e) => setDispatchTime(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                </div>

                                {/* Upload Document */}
                                <div className="mt-2">
                                    <input
                                        type="file"
                                        id="dispatch-doc-inventory"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) setDispatchDocument(file);
                                        }}
                                        className="hidden"
                                        accept=".jpg,.jpeg,.pdf"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => document.getElementById('dispatch-doc-inventory')?.click()}
                                        className="w-full h-32 border-2 border-dashed border-gray-300 hover:border-indigo-500 bg-gray-50 hover:bg-indigo-50/50 text-gray-600 rounded transition-colors flex flex-col items-center justify-center gap-2"
                                    >
                                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                        <span className="text-xs font-medium">UPLOAD DOCUMENT</span>
                                        {dispatchDocument && (
                                            <span className="text-xs mt-1 text-indigo-600 font-medium">✓ {dispatchDocument.name}</span>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Right Column */}
                            <div className="space-y-4">
                                {/* Delivery Type */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Type</label>
                                    <select
                                        value={deliveryType}
                                        onChange={(e) => {
                                            setDeliveryType(e.target.value);
                                            if (e.target.value === 'Courier') {
                                                setTransporterId('');
                                                setTransporterName('');
                                                setVehicleNo('');
                                                setLrGrConsignment('');
                                            }
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                    >
                                        <option value="">Select</option>
                                        <option value="Self">Self</option>
                                        <option value="Third Party">Third Party</option>
                                        <option value="Courier">Courier</option>
                                    </select>
                                </div>

                                {/* Transporter ID/GSTIN */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Transporter ID/GSTIN</label>
                                    <input
                                        type="text"
                                        value={transporterId}
                                        onChange={(e) => setTransporterId(e.target.value)}
                                        disabled={deliveryType === 'Courier'}
                                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                        placeholder="Editable with numerics and alphabet"
                                    />
                                </div>

                                {/* Transporter Name */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Transporter Name</label>
                                    <input
                                        type="text"
                                        value={transporterName}
                                        onChange={(e) => setTransporterName(e.target.value)}
                                        disabled={deliveryType === 'Courier'}
                                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                        placeholder="Editable with numerics and alphabet"
                                    />
                                </div>

                                {/* Vehicle No. */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle No.</label>
                                    <input
                                        type="text"
                                        value={vehicleNo}
                                        onChange={(e) => setVehicleNo(e.target.value)}
                                        disabled={deliveryType === 'Courier'}
                                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                        placeholder="Editable with numerics and alphabet"
                                    />
                                </div>

                                {/* LR/GR/Consignment */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">LR/GR/Consignment</label>
                                    <input
                                        type="text"
                                        value={lrGrConsignment}
                                        onChange={(e) => setLrGrConsignment(e.target.value)}
                                        disabled={deliveryType === 'Courier'}
                                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                        placeholder="Editable with numerics and alphabet"
                                    />
                                </div>
                            </div>
                        </div>

                        {(modeOfTransport === 'Air' || modeOfTransport === 'Sea') && (
                            <div className="space-y-6 mt-6 border-t border-gray-200 pt-4">
                                {/* UPTO PORT */}
                                <div>
                                    <h3 className="text-md font-semibold text-gray-800 mb-3">UPTO PORT</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Bill No.</label>
                                                <input type="text" value={uptoPortShippingBillNo} onChange={(e) => setUptoPortShippingBillNo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Ship/Port Code</label>
                                                <input type="text" value={uptoPortShipPortCode} onChange={(e) => setUptoPortShipPortCode(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Bill Date</label>
                                                <input type="date" value={uptoPortShippingBillDate} onChange={(e) => setUptoPortShippingBillDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Origin</label>
                                                <input type="text" value={uptoPortOrigin} onChange={(e) => setUptoPortOrigin(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="City" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* BEYOND PORT */}
                                <div>
                                    <h3 className="text-md font-semibold text-gray-800 mb-3">BEYOND PORT</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Bill No.</label>
                                                <input type="text" value={beyondPortShippingBillNo} onChange={(e) => setBeyondPortShippingBillNo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Ship/Port Code</label>
                                                <input type="text" value={beyondPortShipPortCode} onChange={(e) => setBeyondPortShipPortCode(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Port of Loading</label>
                                                <input type="text" value={beyondPortPortOfLoading} onChange={(e) => setBeyondPortPortOfLoading(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Final Destination</label>
                                                <input type="text" value={beyondPortFinalDestination} onChange={(e) => setBeyondPortFinalDestination(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Destination Country</label>
                                                <input type="text" value={beyondPortDestCountry} onChange={(e) => setBeyondPortDestCountry(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Bill Date</label>
                                                <input type="date" value={beyondPortShippingBillDate} onChange={(e) => setBeyondPortShippingBillDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Vessel/Flight No.</label>
                                                <input type="text" value={beyondPortVesselFlightNo} onChange={(e) => setBeyondPortVesselFlightNo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Port of Discharge</label>
                                                <input type="text" value={beyondPortPortOfDischarge} onChange={(e) => setBeyondPortPortOfDischarge(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Origin Country</label>
                                                <input type="text" value={beyondPortOriginCountry} onChange={(e) => setBeyondPortOriginCountry(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {modeOfTransport === 'Rail' && (
                            <div className="space-y-6 mt-6 border-t border-gray-200 pt-4">
                                {/* UPTO PORT (Rail) */}
                                <div>
                                    <h3 className="text-md font-semibold text-gray-800 mb-3">UPTO PORT</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Type</label>
                                                <input type="text" value={railUptoPortDeliveryType} onChange={(e) => setRailUptoPortDeliveryType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Transporter Name</label>
                                                <input type="text" value={railUptoPortTransporterName} onChange={(e) => setRailUptoPortTransporterName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Transporter ID</label>
                                                <input type="text" value={railUptoPortTransporterId} onChange={(e) => setRailUptoPortTransporterId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* BEYOND PORT (Rail) */}
                                <div>
                                    <h3 className="text-md font-semibold text-gray-800 mb-3">BEYOND PORT</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Railway Receipt No.</label>
                                                <input type="text" value={railBeyondPortRailwayReceiptNo} onChange={(e) => setRailBeyondPortRailwayReceiptNo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Origin</label>
                                                <input type="text" value={railBeyondPortOrigin} onChange={(e) => setRailBeyondPortOrigin(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Rail No.</label>
                                                <input type="text" value={railBeyondPortRailNo} onChange={(e) => setRailBeyondPortRailNo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Station of Discharge</label>
                                                <input type="text" value={railBeyondPortStationOfDischarge} onChange={(e) => setRailBeyondPortStationOfDischarge(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Destination Country</label>
                                                <input type="text" value={railBeyondPortDestCountry} onChange={(e) => setRailBeyondPortDestCountry(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Railway Receipt Date</label>
                                                <input type="date" value={railBeyondPortRailwayReceiptDate} onChange={(e) => setRailBeyondPortRailwayReceiptDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Origin Country</label>
                                                <input type="text" value={railBeyondPortOriginCountry} onChange={(e) => setRailBeyondPortOriginCountry(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Station of Loading</label>
                                                <input type="text" value={railBeyondPortStationOfLoading} onChange={(e) => setRailBeyondPortStationOfLoading(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Final Destination</label>
                                                <input type="text" value={railBeyondPortFinalDestination} onChange={(e) => setRailBeyondPortFinalDestination(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50 rounded-b-lg">
                    <button
                        onClick={handleSave}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-[4px] transition-colors"
                    >
                        Post & Close
                    </button>
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-[4px] hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateIssueSlipModal;
