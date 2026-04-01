import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import { httpClient } from '../services/httpClient';
import { showWarning } from '../utils/toast';
import MultiSelectDropdown from './MultiSelectDropdown';
import SearchableDropdown from './SearchableDropdown';

interface IssueSlipItem {
    id: number;
    itemCode: string;
    itemName: string;
    hsnCode: string;
    uom: string;
    alternateUnit: string;
    quantity: string;
    pendingQuantity?: string; // Original SO quantity
    stockBalance?: number;    // Balance at selected location
    boxes: string;
    packingNotes: string;
    remarks: string;
    soNo?: string;
    itemRate: string;
}


// Helper to generate consistent vibrant colors for SO tags
const getSOColor = (value: string) => {
    const colors = [
        'bg-indigo-50 text-indigo-700 border-indigo-100 shadow-sm',
        'bg-emerald-50 text-emerald-700 border-emerald-100 shadow-sm',
        'bg-amber-50 text-amber-700 border-amber-100 shadow-sm',
        'bg-rose-50 text-rose-700 border-rose-100 shadow-sm',
        'bg-sky-50 text-sky-700 border-sky-100 shadow-sm',
        'bg-violet-50 text-violet-700 border-violet-100 shadow-sm',
        'bg-orange-50 text-orange-700 border-orange-100 shadow-sm',
        'bg-teal-50 text-teal-700 border-teal-100 shadow-sm',
    ];
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = value.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

interface Location {
    id: number;
    name: string;
    location_type?: string;
}

interface CreateIssueSlipModalProps {
    onClose: () => void;
    onSave: (data: any) => void;
    initialData?: {
        customerName?: string;
        branch?: string;
        address?: string;
        gstin?: string;
    };
}

const CreateIssueSlipModal: React.FC<CreateIssueSlipModalProps> = ({ onClose, onSave, initialData }) => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Form State
    const [outwardSlipNo, setOutwardSlipNo] = useState('');
    const [outwardSlipSeries, setOutwardSlipSeries] = useState('');
    const [outwardSeriesList, setOutwardSeriesList] = useState<any[]>([]);
    const [date, setDate] = useState(todayStr);
    const [time, setTime] = useState('');
    const [location, setLocation] = useState('');

    // Reference Details
    const [salesOrderNo, setSalesOrderNo] = useState('');
    const [selectedSalesOrders, setSelectedSalesOrders] = useState<string[]>([]);
    const [customerName, setCustomerName] = useState(initialData?.customerName || '');
    const [branch, setBranch] = useState(initialData?.branch || '');
    const [address, setAddress] = useState(initialData?.address || '');
    const [gstin, setGstin] = useState(initialData?.gstin || '');
    const [postingNote, setPostingNote] = useState('');
    const [outwardType, setOutwardType] = useState<'sales' | 'purchase_return'>('sales');
    const [reasonsForReturn, setReasonsForReturn] = useState('');

    // Delivery Challan / Dispatch Details State
    const [dispatchFrom, setDispatchFrom] = useState('');
    const [modeOfTransport, setModeOfTransport] = useState('');
    const [dispatchDate, setDispatchDate] = useState(todayStr);
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

    // Confirmation Dialog State
    const [confirmDialog, setConfirmDialog] = useState<{
        isOpen: boolean;
        message: string;
        onConfirm: () => void;
        onCancel: () => void;
    }>({
        isOpen: false,
        message: '',
        onConfirm: () => {},
        onCancel: () => {}
    });


    // Items State
    const [items, setItems] = useState<IssueSlipItem[]>([
        { id: 1, itemCode: '', itemName: '', hsnCode: '', uom: '', alternateUnit: '', quantity: '', boxes: '', packingNotes: '', remarks: '', itemRate: '' }
    ]);

    // Fetch data on mount
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [locResponse, soResponse, custResponse, invResponse, servResponse, issueSlipResponse] = await Promise.all([
                    httpClient.get<any>('/api/inventory/locations/').catch(() => []),
                    apiService.getSalesOrders({ status: 'Pending' }).catch(() => []),
                    apiService.getRichCustomers().catch(() => []),
                    apiService.getStockItems().catch(() => []),
                    apiService.getServices().catch(() => []),
                    httpClient.get<any>('/api/inventory/master-voucher-issue-slip/').catch(() => [])
                ]);

                const getList = (response: any) => {
                    if (!response) return [];
                    if (Array.isArray(response)) return response;
                    if (Array.isArray(response.results)) return response.results;
                    if (Array.isArray(response.data)) return response.data;
                    return [];
                };

                const allLocations = getList(locResponse);
                setLocations(allLocations);
                setSalesOrdersList(getList(soResponse));
                setCustomersList(getList(custResponse));

                const invList = getList(invResponse);
                const servList = getList(servResponse).map((s: any) => ({
                    ...s,
                    item_code: s.service_code,
                    item_name: s.service_name,
                    is_service: true
                }));

                setInventoryItems([...invList, ...servList]);

                // Filter Issue Slip series to Outward type only
                const allSlips = getList(issueSlipResponse);
                const outwardSlips = allSlips.filter((s: any) =>
                    (s.issue_slip_type || '').toLowerCase() === 'outward'
                );
                setOutwardSeriesList(outwardSlips);
                // Auto-select if only one exists
                if (outwardSlips.length === 1) {
                    setOutwardSlipSeries(outwardSlips[0].name);
                }

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

        // Customer Portal returns customer_name field
        const customer = customersList.find(c => c.customer_name === customerName);
        if (customer && customer.branches && customer.branches.length > 0) {
            setAvailableBranches(customer.branches);
        } else {
            setAvailableBranches([]);
        }
    }, [customerName, customersList]);

    // Fetch Pending Sales Orders when Customer or Branch changes
    useEffect(() => {
        const fetchPendingOrders = async () => {
            if (!customerName || !branch) {
                setSalesOrdersList([]);
                return;
            }

            try {
                // The source must be Pending Sales Orders for this customer and branch
                const response = await apiService.getSalesOrders({
                    customer_name: customerName,
                    branch: branch,
                    status: 'Pending'
                });
                
                const getList = (resp: any) => {
                    if (!resp) return [];
                    if (Array.isArray(resp)) return resp;
                    if (Array.isArray(resp.results)) return resp.results;
                    if (Array.isArray(resp.data)) return resp.data;
                    return [];
                };
                
                setSalesOrdersList(getList(response));
            } catch (error) {
                console.error('Failed to fetch pending sales orders:', error);
                setSalesOrdersList([]);
            }
        };

        fetchPendingOrders();
    }, [customerName, branch]);

    // Filter Sales Orders by selected Customer and Branch (local safeguard)
    const filteredSalesOrders = React.useMemo(() => {
        if (!customerName || !branch) return [];
        return salesOrdersList.filter(so =>
            (so.customer_name === customerName) &&
            (so.branch === branch)
        );
    }, [customerName, branch, salesOrdersList]);

    // Update Address & GSTIN when Branch changes

    // Fetch next Issue Slip Number
    const fetchNextSlipNo = React.useCallback((seriesName: string, seriesList: any[]) => {
        if (!seriesName || seriesList.length === 0) {
            setOutwardSlipNo('');
            return;
        }
        const selectedSeriesObj = seriesList.find((s: any) => s.name === seriesName);
        if (selectedSeriesObj) {
            // Fetch the preview value of the selected Outward Slip Series
            setOutwardSlipNo(selectedSeriesObj.preview || '');
        }
    }, []);

    useEffect(() => {
        fetchNextSlipNo(outwardSlipSeries, outwardSeriesList);
    }, [outwardSlipSeries, outwardSeriesList, fetchNextSlipNo]);

    useEffect(() => {
        if (!customerName) {
            setAddress('');
            setGstin('');
            return;
        }

        // If customer/branch matches initialData, keep the manually passed values and don't overwrite from DB defaults
        if (
            initialData &&
            customerName === initialData.customerName &&
            branch === initialData.branch
        ) {
            setAddress(initialData.address || '');
            setGstin(initialData.gstin || '');
            return;
        }

        // Customer Portal returns customer_name and branches.
        // Deep address data is inside customer.gst_details.branches
        const customer = customersList.find(c => c.customer_name === customerName);
        if (customer && customer.gst_details && customer.gst_details.branches) {
            const allBranches = customer.gst_details.branches;

            // Use selected branch if available, otherwise default to first branch for the customer
            const selectedBranch = branch
                ? (allBranches.find((b: any) => (b.branch_reference_name || b.defaultRef || b.reference_name) === branch) || allBranches[0])
                : allBranches[0];

            if (selectedBranch) {
                // Portal serializer returns camelCase fields (addressLine1, city, etc.)
                const addr1 = selectedBranch.addressLine1 || '';
                const addr2 = selectedBranch.addressLine2 || '';
                const addr3 = selectedBranch.addressLine3 || '';
                const city = selectedBranch.city ? `, ${selectedBranch.city}` : '';
                const state = selectedBranch.state ? `, ${selectedBranch.state}` : '';
                const pin = selectedBranch.pincode ? ` - ${selectedBranch.pincode}` : '';
                const fullAddr = `${addr1}${addr2 ? ', ' + addr2 : ''}${addr3 ? ', ' + addr3 : ''}${city}${state}${pin}`;

                setAddress(fullAddr.trim().replace(/^,\s*/, ''));
                setGstin(selectedBranch.gstin || '');
            } else {
                setAddress('');
                setGstin('');
            }
        }
    }, [customerName, branch, customersList]);

    const handleSalesOrdersChange = (selectedVoucherNumbers: string[]) => {
        setSelectedSalesOrders(selectedVoucherNumbers);
        setSalesOrderNo(selectedVoucherNumbers.join(', '));

        if (selectedVoucherNumbers.length > 0) {
            // Get all selected orders
            const selectedOrders = salesOrdersList.filter(so =>
                selectedVoucherNumbers.includes(so.voucher_number || so.so_number || so.id.toString())
            );

            // Aggregate items from all selected orders, grouped by SO + Item Code to support color coding
            const aggregatedItems: Record<string, any> = {};

            selectedOrders.forEach(order => {
                const orderNo = order.voucher_number || order.so_number || order.id.toString();
                if (order.items && Array.isArray(order.items)) {
                    order.items.forEach((soItem: any) => {
                        const code = soItem.item_code || '';
                        if (!code) return;

                        const key = `${orderNo}_${code}`;

                        if (aggregatedItems[key]) {
                            // Sum quantities for same item code within same SO
                            const currentQty = parseFloat(aggregatedItems[key].quantity) || 0;
                            const additionalQty = parseFloat(soItem.quantity) || 0;
                            aggregatedItems[key].quantity = (currentQty + additionalQty).toString();
                        } else {
                            // Fetch from SO first, fallback to Customer Master
                            let notes = soItem.packing_notes || '';
                            if (!notes) {
                                const customer = customersList.find(c => c.customer_name === customerName);
                                if (customer && customer.products_services && customer.products_services.items) {
                                    const custProduct = customer.products_services.items.find((i: any) => i.itemCode === code || i.item_code === code);
                                    if (custProduct && custProduct.packingNotes) {
                                        notes = custProduct.packingNotes;
                                    }
                                }
                            }

                            const masterItem = inventoryItems.find(i => (i.item_code || i.service_code) === code);
                            aggregatedItems[key] = {
                                id: Date.now() + Math.random(),
                                itemCode: code,
                                itemName: soItem.item_name || masterItem?.item_name || masterItem?.service_name || '',
                                hsnCode: soItem.hsn_code || masterItem?.hsn_code || masterItem?.hsn_sac_code || '',
                                uom: soItem.uom || masterItem?.uom || masterItem?.unit || '',
                                alternateUnit: masterItem?.alternate_uom || '',
                                quantity: soItem.quantity?.toString() || '',
                                pendingQuantity: soItem.quantity?.toString() || '', // Store original SO quantity
                                boxes: '',
                                packingNotes: notes,
                                remarks: '',
                                soNo: orderNo,
                                itemRate: (soItem.item_rate || soItem.price || soItem.negotiated_price || soItem.rate || '0').toString()
                            };
                        }
                    });
                }
            });


            const newItemsList = Object.values(aggregatedItems);
            if (newItemsList.length > 0) {
                setItems(newItemsList as IssueSlipItem[]);
            } else {
                setItems([{ id: Date.now(), itemCode: '', itemName: '', hsnCode: '', uom: '', alternateUnit: '', quantity: '', boxes: '', packingNotes: '', itemRate: '' }]);
            }
        } else {
            // Keep current customer/branch but clear items
            setItems([{ id: Date.now(), itemCode: '', itemName: '', hsnCode: '', uom: '', alternateUnit: '', quantity: '', boxes: '', packingNotes: '', itemRate: '' }]);
        }
    };

    const removeSO = (so: string) => {
        handleSalesOrdersChange(selectedSalesOrders.filter(v => v !== so));
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
            boxes: '',
            packingNotes: '',
            remarks: '',
            itemRate: ''
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

            if (field === 'quantity') {
                const enteredQty = parseFloat(value) || 0;
                
                // 1. Stock Validation
                // For now, if stockBalance is unknown, we assume it's infinite in this mock/partial implementation
                // In a real system, we'd fetch it earlier.
                if (item.stockBalance !== undefined && enteredQty > item.stockBalance) {
                    showWarning(`Insufficient stock at selected location. Available: ${item.stockBalance}`);
                    // Optional: auto-adjust to max or just show warning. Requirement says "Show error".
                }

                // 2. SO Quantity Validation
                if (item.pendingQuantity) {
                    const pendingQty = parseFloat(item.pendingQuantity) || 0;
                    if (enteredQty > pendingQty) {
                        setConfirmDialog({
                            isOpen: true,
                            message: "Issue quantity exceeds Sales Order quantity. Proceed?",
                            onConfirm: () => {
                                // Keep the entered quantity (already in updatedItem)
                                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                            },
                            onCancel: () => {
                                // Overwrite with SO quantity
                                setItems(prevItems => prevItems.map(p => 
                                    p.id === id ? { ...p, quantity: item.pendingQuantity || '' } : p
                                ));
                                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                            }
                        });
                    }
                }
            }

            if (field === 'itemCode') {

                const found = inventoryItems.find(i => (i.item_code || i.service_code) === value);
                if (found) {
                    updatedItem.itemName = found.item_name || found.service_name || found.name || '';
                    updatedItem.hsnCode = found.hsn_code || found.hsn_sac_code || '';
                    updatedItem.uom = found.uom || found.unit || '';
                    updatedItem.itemRate = (found.rate || found.price || '0').toString();

                    // Auto-populate Packing Notes from Customer Master
                    const customer = customersList.find(c => c.customer_name === customerName);
                    if (customer && customer.products_services && customer.products_services.items) {
                        const custProduct = customer.products_services.items.find((i: any) => i.itemCode === value);
                        if (custProduct && custProduct.packingNotes) {
                            updatedItem.packingNotes = custProduct.packingNotes;
                        }
                    }
                } else {
                    updatedItem.itemName = '';
                }
            } else if (field === 'itemName') {
                const found = inventoryItems.find(i => (i.item_name || i.service_name || i.name) === value);
                if (found) {
                    updatedItem.itemCode = found.item_code || found.service_code || '';
                    updatedItem.hsnCode = found.hsn_code || found.hsn_sac_code || '';
                    updatedItem.uom = found.uom || found.unit || '';
                    updatedItem.itemRate = (found.rate || found.price || '0').toString();

                    // Auto-populate Packing Notes from Customer Master
                    const customer = customersList.find(c => c.customer_name === customerName);
                    if (customer && customer.products_services && customer.products_services.items) {
                        const custProduct = customer.products_services.items.find((i: any) => i.item_name === value || i.itemName === value);
                        if (custProduct && custProduct.packingNotes) {
                            updatedItem.packingNotes = custProduct.packingNotes;
                        }
                    }
                } else {
                    updatedItem.itemCode = '';
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

        // Validate that Customer Name and Branch match the Invoice Details
        if (initialData) {
            const invoiceCustomer = (initialData.customerName || '').trim();
            const invoiceBranch = (initialData.branch || '').trim();
            const slipCustomer = (customerName || '').trim();
            const slipBranch = (branch || '').trim();

            if (invoiceCustomer && slipCustomer !== invoiceCustomer) {
                showWarning(
                    `Customer Name mismatch! The Issue Slip has "${slipCustomer}" but the Invoice has "${invoiceCustomer}". Please correct and try again.`
                );
                return;
            }
            if (invoiceBranch && slipBranch !== invoiceBranch) {
                showWarning(
                    `Branch mismatch! The Issue Slip has "${slipBranch}" but the Invoice has "${invoiceBranch}". Please correct and try again.`
                );
                return;
            }
        }

        const payload = {
            outward_slip_no: outwardSlipNo,
            issue_slip_series_name: outwardSlipSeries || '',
            date: date || null,
            time: time || null,
            outward_type: outwardType,
            reasons_for_return: reasonsForReturn,
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
                rate: parseFloat(item.itemRate) || 0,
                no_of_boxes: item.boxes || '0',
                packing_notes: item.packingNotes || ''
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
                    {/* Outward Type Toggle */}
                    <div className="flex items-center gap-6 mb-6">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                                type="radio"
                                name="outward_type"
                                checked={outwardType === 'sales'}
                                onChange={() => setOutwardType('sales')}
                                className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span className={`text-sm font-bold uppercase tracking-wide transition-colors ${outwardType === 'sales' ? 'text-indigo-700' : 'text-gray-400 group-hover:text-gray-600'}`}>
                                Sales
                            </span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                                type="radio"
                                name="outward_type"
                                checked={outwardType === 'purchase_return'}
                                onChange={() => setOutwardType('purchase_return')}
                                className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span className={`text-sm font-bold uppercase tracking-wide transition-colors ${outwardType === 'purchase_return' ? 'text-indigo-700' : 'text-gray-400 group-hover:text-gray-600'}`}>
                                Purchase Return
                            </span>
                        </label>
                    </div>

                    {/* Row 1 */}
                    <div className="grid grid-cols-4 gap-5">
                        {/* Outward Slip Series – full width above the 4-col row */}
                        <div className="col-span-4">
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Outward Slip Series
                            </label>
                            <select
                                value={outwardSlipSeries}
                                onChange={(e) => setOutwardSlipSeries(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                            >
                                <option value="">Select Outward Slip Series</option>
                                {outwardSeriesList.map((s: any) => (
                                    <option key={s.id} value={s.name}>{s.name}</option>
                                ))}
                            </select>
                            {outwardSeriesList.length === 0 && (
                                <p className="text-xs text-amber-600 mt-1">No Outward series found. Go to Inventory &gt; Masters &gt; GRN &amp; Issue Slip &gt; Issue Slip to create one.</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Outward Slip No.</label>
                            <input
                                type="text"
                                value={outwardSlipNo}
                                readOnly
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-gray-100 cursor-not-allowed focus:outline-none"
                                placeholder="Auto-generated based on series"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Date</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                max={todayStr}
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

                    {/* Row 2: Sales Order No, Customer Name, Branch */}
                    <div className="grid grid-cols-12 gap-5 mt-4 items-start">
                        <div className="col-span-6">
                            <label className="block text-sm font-semibold text-gray-700 mb-2 uppercase tracking-tight">Sales Order No.</label>
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="w-64 min-w-[200px]">
                                    <MultiSelectDropdown
                                        options={filteredSalesOrders.map(so => ({
                                            value: so.voucher_number || so.so_number || so.id.toString(),
                                            label: so.voucher_number || so.so_number || `SO #${so.id}`
                                        }))}
                                        selectedValues={selectedSalesOrders}
                                        onChange={handleSalesOrdersChange}
                                        placeholder={customerName && branch ? "Select Pending Sales Orders" : "Select Customer & Branch first"}
                                        disabled={!customerName || !branch}
                                    />
                                </div>
                                
                                {/* Color-coded SO Tags - Displayed next to the dropdown */}
                                {selectedSalesOrders.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 py-1">
                                        {selectedSalesOrders.map((so) => (
                                            <div
                                                key={so}
                                                className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-bold border transition-all duration-200 hover:shadow-md ${getSOColor(so)}`}
                                            >
                                                <span className="tracking-wide uppercase">{so}</span>
                                                <span
                                                    onClick={() => removeSO(so)}
                                                    className="cursor-pointer hover:bg-white/50 rounded-full p-0.5"
                                                    title="Remove"
                                                >
                                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="col-span-3">
                            <label className="block text-sm font-semibold text-gray-400 uppercase tracking-tight mb-2">
                                Customer Name
                            </label>
                            <SearchableDropdown
                                options={customersList.map(c => c.customer_name).filter(Boolean)}
                                value={customerName}
                                onChange={(val) => {
                                    setCustomerName(val);
                                    setBranch('');
                                    setSelectedSalesOrders([]);
                                    setSalesOrderNo('');
                                }}
                                disabled={selectedSalesOrders.length > 0}
                                placeholder="Select Customer"
                            />
                        </div>
                        <div className="col-span-3">
                            <label className="block text-sm font-semibold text-gray-700 mb-2 uppercase tracking-tight">Branch</label>
                            <select
                                value={branch}
                                onChange={(e) => {
                                    setBranch(e.target.value);
                                    setSelectedSalesOrders([]);
                                    setSalesOrderNo('');
                                }}
                                disabled={selectedSalesOrders.length > 0}
                                className={`erp-input py-[7px] w-full px-3 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${selectedSalesOrders.length > 0 ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`}
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

                    {/* Row 3 */}
                    <div className="grid grid-cols-2 gap-5 mt-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                            <textarea
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                rows={2}
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                                        <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700 min-w-[200px]">Packing Notes</th>
                                        <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700 min-w-[150px]">Remarks</th>
                                        <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {items.map((item) => {
                                        // Get base color classes for this item's Sales Order
                                        const soColorClasses = item.soNo && selectedSalesOrders.length > 1
                                            ? getSOColor(item.soNo)
                                            : '';

                                        // Extract just the background part for the row (e.g., bg-indigo-50)
                                        const rowBgClass = soColorClasses
                                            ? soColorClasses.split(' ').find(c => c.startsWith('bg-'))
                                            : '';
                                        const borderClass = soColorClasses
                                            ? `border-l-4 ${soColorClasses.split(' ').find(c => c.startsWith('border-'))?.replace('border-', 'border-l-')}`
                                            : '';

                                        return (
                                            <tr key={item.id} className={`border-t border-gray-100 ${rowBgClass} ${borderClass}`}>
                                                <td className="px-3 py-2 min-w-[150px]">
                                                    <SearchableDropdown
                                                        options={inventoryItems.map(i => i.item_code || i.service_code).filter(Boolean)}
                                                        value={item.itemCode}
                                                        onChange={(val) => handleItemChange(item.id, 'itemCode', val)}
                                                        placeholder="Code"
                                                    />
                                                </td>
                                                <td className="px-3 py-2 min-w-[200px]">
                                                    <SearchableDropdown
                                                        options={inventoryItems.map(i => i.item_name || i.service_name || i.name).filter(Boolean)}
                                                        value={item.itemName}
                                                        onChange={(val) => handleItemChange(item.id, 'itemName', val)}
                                                        placeholder="Item"
                                                    />
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
                                                        min="0"
                                                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="number"
                                                        value={item.boxes}
                                                        onChange={(e) => handleItemChange(item.id, 'boxes', e.target.value)}
                                                        min="0"
                                                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                    />
                                                </td>
                                                <td className="px-3 py-2 min-w-[200px]">
                                                    <input
                                                        type="text"
                                                        value={item.packingNotes}
                                                        onChange={(e) => handleItemChange(item.id, 'packingNotes', e.target.value)}
                                                        className="w-full px-2 py-1 border border-indigo-100 rounded text-sm focus:ring-1 focus:ring-indigo-500 bg-white shadow-sm"
                                                        placeholder="Packing instructions..."
                                                    />
                                                </td>
                                                <td className="px-3 py-2 min-w-[150px]">
                                                    <input
                                                        type="text"
                                                        value={item.remarks}
                                                        onChange={(e) => handleItemChange(item.id, 'remarks', e.target.value)}
                                                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500 bg-white"
                                                        placeholder="Remarks..."
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
                                        );

                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-4 flex justify-end items-center gap-4">
                            <label className="text-sm font-bold text-gray-900">Total Number of Boxes / Packs:</label>
                            <input
                                type="number"
                                min="0"
                                value={calculateTotalBoxes()}
                                readOnly
                                className="w-32 px-2 py-1 border border-gray-300 rounded text-sm font-bold text-right bg-gray-50"
                            />
                        </div>

                        {/* Reasons for Return - Specific to Purchase Return */}
                        {outwardType === 'purchase_return' && (
                            <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-tight">Reasons for Return</label>
                                <textarea
                                    value={reasonsForReturn}
                                    onChange={(e) => setReasonsForReturn(e.target.value)}
                                    rows={2}
                                    placeholder="Enter specific reasons for item returns..."
                                    className="w-full px-4 py-3 border-2 border-indigo-50 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-inner"
                                />
                            </div>
                        )}
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
                                            value={dispatchDate || todayStr}
                                            onChange={(e) => setDispatchDate(e.target.value)}
                                            max={todayStr}
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
                                                <input type="date" value={uptoPortShippingBillDate} onChange={(e) => setUptoPortShippingBillDate(e.target.value)} max={todayStr} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
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
                                                <input type="date" value={beyondPortShippingBillDate} onChange={(e) => setBeyondPortShippingBillDate(e.target.value)} max={todayStr} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
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
                                                <input type="date" value={railBeyondPortRailwayReceiptDate} onChange={(e) => setRailBeyondPortRailwayReceiptDate(e.target.value)} max={todayStr} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
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
