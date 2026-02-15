import React, { useState, useEffect } from 'react';
import { httpClient } from '../services/httpClient';
import { showWarning } from '../utils/toast';
import Icon from './Icon';
import SearchableDropdown from './SearchableDropdown';
import { apiService } from '../services/api';

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
    const [salesOrderNo, setSalesOrderNo] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [branch, setBranch] = useState('');
    const [address, setAddress] = useState('');
    const [gstin, setGstin] = useState('');
    const [postingNote, setPostingNote] = useState('');

    // Locations State
    const [locations, setLocations] = useState<Location[]>([]);
    const [salesOrdersList, setSalesOrdersList] = useState<any[]>([]);
    const [customersList, setCustomersList] = useState<string[]>([]);
    const [fullCustomersData, setFullCustomersData] = useState<any[]>([]); // Detailed customer records
    const [inventoryItems, setInventoryItems] = useState<any[]>([]); // Inventory Masters data

    // Items State
    const [items, setItems] = useState<IssueSlipItem[]>([
        { id: 1, itemCode: '', itemName: '', hsnCode: '', uom: '', alternateUnit: '', quantity: '', boxes: '' }
    ]);

    // Fetch data on mount
    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch data from multiple sources to ensure full coverage
                const [locResponse, soResponse, custResponse, richCustResponse, invResponse] = await Promise.all([
                    httpClient.get<any>('/api/inventory/locations/').catch(() => []),
                    httpClient.get<any>('/api/customerportal/sales-orders/').catch(() => []),
                    httpClient.get<any>('/api/customerportal/customers/').catch(() => []),
                    apiService.getRichCustomers().catch(() => []),
                    apiService.getStockItems().catch(() => [])
                ]);

                const getList = (response: any) => {
                    if (!response) return [];
                    if (Array.isArray(response)) return response;
                    if (Array.isArray(response.results)) return response.results;
                    if (Array.isArray(response.data)) return response.data;
                    return [];
                };

                setLocations(getList(locResponse));
                setInventoryItems(getList(invResponse));

                const soList = getList(soResponse);
                setSalesOrdersList(soList);

                const custData = getList(custResponse);
                const richCustData = getList(richCustResponse);
                setFullCustomersData([...custData, ...richCustData]);

                // Merge customers from all sources for maximum coverage
                const extractNames = (arr: any[]) =>
                    arr.map((c: any) => c.customer_name || c.name || c.party_name).filter(Boolean);

                const customers = extractNames(custData);
                const richCustomers = extractNames(richCustData);
                const soCustomers = extractNames(soList);

                const allCustomers = Array.from(new Set([...customers, ...richCustomers, ...soCustomers])).sort();
                setCustomersList(allCustomers);

            } catch (error) {
                console.error('Failed to fetch initial data:', error);
            }
        };
        fetchData();
    }, []);

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

    // Derived State: Branches for selected customer
    const customerBranches = React.useMemo(() => {
        if (!customerName) return [];

        const detail = fullCustomersData.find(c =>
            (c.customer_name || c.name || c.party_name) === customerName
        );
        let masterBranches = detail?.branches?.map((b: any) => b.branch_reference_name) || [];

        // Also check Sales Orders for this customer for extra reliability
        const soBranches = salesOrdersList
            .filter(so => (so.customer_name || so.party_name) === customerName && so.branch)
            .map(so => so.branch);

        return Array.from(new Set([...masterBranches, ...soBranches])).filter(Boolean).sort();
    }, [customerName, fullCustomersData, salesOrdersList]);

    // Autofetch Address & GSTIN logic - Only triggers when BOTH are present
    useEffect(() => {
        if (!customerName || !branch) {
            setAddress('');
            setGstin('');
            return;
        }

        // 1. Try finding in Master Customers (Preferred source for accuracy)
        const customer = fullCustomersData.find(c =>
            (c.customer_name || c.name || c.party_name) === customerName
        );

        if (customer) {
            const branchDetail = customer.gst_details?.branches?.find((b: any) =>
                b.defaultRef === branch
            );

            if (branchDetail) {
                const city = branchDetail.city ? `, ${branchDetail.city}` : '';
                const state = branchDetail.state ? `, ${branchDetail.state}` : '';
                const pin = branchDetail.pincode ? ` - ${branchDetail.pincode}` : '';
                const fullAddr = `${branchDetail.addressLine1}${branchDetail.addressLine2 ? ', ' + branchDetail.addressLine2 : ''}${city}${state}${pin}`;

                setAddress(fullAddr);
                if (branchDetail.gstin) setGstin(branchDetail.gstin);
                return;
            }
        }

        // 2. Fallback: Search in Sales Orders
        const order = salesOrdersList.find(so =>
            (so.customer_name || so.party_name) === customerName && so.branch === branch
        );

        if (order) {
            if (order.address) setAddress(order.address);
            if (order.gst_no) setGstin(order.gst_no);
        }
    }, [customerName, branch, fullCustomersData, salesOrdersList]);

    const handleItemChange = (id: number, field: keyof IssueSlipItem, value: string) => {
        setItems(items.map(item => {
            if (item.id !== id) return item;

            let updatedItem = { ...item, [field]: value };

            // Cross-fetch logic
            if (field === 'itemCode') {
                const found = inventoryItems.find(i => i.item_code === value);
                if (found) {
                    updatedItem.itemName = found.item_name || found.name || '';
                    updatedItem.hsnCode = found.hsn_code || '';
                    updatedItem.uom = found.uom || '';
                    updatedItem.alternateUnit = found.alternate_uom || '';
                }
            } else if (field === 'itemName') {
                const found = inventoryItems.find(i => (i.item_name || i.name) === value);
                if (found) {
                    updatedItem.itemCode = found.item_code || '';
                    updatedItem.hsnCode = found.hsn_code || '';
                    updatedItem.uom = found.uom || '';
                    updatedItem.alternateUnit = found.alternate_uom || '';
                }
            }

            return updatedItem;
        }));
    };

    const calculateTotalBoxes = () => {
        return items.reduce((sum, item) => sum + (parseFloat(item.boxes) || 0), 0);
    };

    const handleSave = () => {
        // Validate required fields
        if (!outwardSlipNo) {
            showWarning('Please enter Outward Slip No');
            return;
        }

        // Construct payload to match InventoryOperationOutwardSerializer
        const payload = {
            outward_slip_no: outwardSlipNo,
            date: date || null,
            time: time || null,
            location: location ? parseInt(location) : null, // Convert to integer ID
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
            }))
        };


        onSave(payload);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 w-full max-w-6xl mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-xl font-bold text-gray-800">Create Issue Slip</h3>
                </div>

                <div className="p-6 space-y-6">
                    {/* Row 1 */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Outward Slip No</label>
                            <input
                                type="text"
                                value={outwardSlipNo}
                                onChange={(e) => setOutwardSlipNo(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                            <div className="relative">
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                {/* Icon handling handled by browser date input or we can add custom icon absolute positioned */}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                            <input
                                type="time"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                            <select
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                            <label className="block text-sm font-medium text-gray-700 mb-1">Sales Order No.</label>
                            <select
                                value={salesOrderNo}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setSalesOrderNo(val);
                                    const order = salesOrdersList.find(so => so.so_number === val);
                                    if (order) {
                                        if (order.customer_name) setCustomerName(order.customer_name);
                                        if (order.branch) setBranch(order.branch);
                                        // Address and GSTIN will be autofetched by useEffect once branch is set

                                        // Autofetch items from Sales Order if they exist
                                        if (order.items && Array.isArray(order.items)) {
                                            const newItems = order.items.map((soItem: any, idx: number) => {
                                                // Try to get HSN from Inventory Masters if missing in SO
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
                                            if (newItems.length > 0) {
                                                setItems(newItems);
                                            } else {
                                                // Reset to one empty item if SO has no items
                                                setItems([{ id: Date.now(), itemCode: '', itemName: '', hsnCode: '', uom: '', alternateUnit: '', quantity: '', boxes: '' }]);
                                            }
                                        }
                                    }
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                                <option value="">Select Pending Sales Order</option>
                                {salesOrdersList.map((so) => (
                                    <option key={so.id} value={so.so_number}>
                                        {so.so_number}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                            <SearchableDropdown
                                options={customersList}
                                value={customerName}
                                onChange={(val) => {
                                    setCustomerName(val);
                                    setBranch('');
                                    setAddress('');
                                    setGstin('');
                                }}
                                placeholder="Select Customer"
                                noResultsText="No customers found in portal"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                            <select
                                value={branch}
                                onChange={(e) => setBranch(e.target.value)}
                                disabled={!customerName}
                                className={`w-full px-3 py-2 border rounded-[4px] focus:outline-none focus:ring-1 focus:ring-indigo-500 ${!customerName ? 'bg-gray-50 text-gray-400 cursor-not-allowed border-gray-200' : 'border-gray-300'}`}
                            >
                                <option value="">Select Branch</option>
                                {customerBranches.map((br: any) => (
                                    <option key={br} value={br}>{br}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Row 3 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                            <textarea
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                                rows={2}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN No.</label>
                            <input
                                type="text"
                                value={gstin}
                                onChange={(e) => setGstin(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Items Section */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="text-sm font-medium text-gray-700">Items</h4>
                            <button
                                onClick={handleAddItem}
                                className="text-indigo-600 hover:text-slate-700 text-sm font-medium flex items-center"
                            >
                                + Add Item
                            </button>
                        </div>
                        <div className="border border-gray-200 rounded-[4px] overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Item Code</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Item Name</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">HSN Code</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">UOM</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Alternate Unit</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Quantity</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">No. of boxes/packs</th>
                                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {items.map((item) => (
                                        <tr key={item.id}>
                                            <td className="p-2 min-w-[150px]">
                                                <SearchableDropdown
                                                    options={inventoryItems.map(i => i.item_code).filter(Boolean)}
                                                    value={item.itemCode}
                                                    onChange={(val) => handleItemChange(item.id, 'itemCode', val)}
                                                    placeholder="Select Code"
                                                />
                                            </td>
                                            <td className="p-2 min-w-[200px]">
                                                <SearchableDropdown
                                                    options={inventoryItems.map(i => i.item_name || i.name).filter(Boolean)}
                                                    value={item.itemName}
                                                    onChange={(val) => handleItemChange(item.id, 'itemName', val)}
                                                    placeholder="Select Item"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={item.hsnCode}
                                                    onChange={(e) => handleItemChange(item.id, 'hsnCode', e.target.value)}
                                                    className="w-full px-2 py-1 border border-primary-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={item.uom}
                                                    onChange={(e) => handleItemChange(item.id, 'uom', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={item.alternateUnit}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-gray-100 bg-gray-50 text-gray-500 rounded text-sm focus:outline-none"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="number"
                                                    value={item.boxes}
                                                    onChange={(e) => handleItemChange(item.id, 'boxes', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                            className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none h-24"
                        />
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


