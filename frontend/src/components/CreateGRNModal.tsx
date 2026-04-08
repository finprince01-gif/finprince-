import React, { useState, useEffect, useMemo } from 'react';
import { apiService } from '../services/api';
import { httpClient } from '../services/httpClient';
import { showWarning } from '../utils/toast';
import { ChevronDown } from 'lucide-react';

interface GRNItem {
    id: number;
    itemCode: string;
    itemName: string;
    hsnCode: string; // This handles HSN or SAC
    uom: string;
    refQty: string; // PO Qty
    secondaryQty: string; // Invoice Qty
    receivedQty: string;
    acceptedQty: string;
    rejectedQty: string;
    shortExcessQty: string;
    remarks: string;
    boxes: string;
    poNumber?: string;
}

interface Location {
    id: number;
    name: string;
}

interface CreateGRNModalProps {
    onClose: () => void;
    onSave: (data: any) => void;
    initialSupplierInvoiceNo?: string;
    initialExtractedData?: any;
    mainVendorName?: string;
    mainBranch?: string;
    mainGstin?: string;
    context?: 'Credit Note' | 'Purchase';
}

const CreateGRNModal: React.FC<CreateGRNModalProps> = ({ onClose, onSave, initialSupplierInvoiceNo = '', initialExtractedData, mainVendorName, mainBranch, mainGstin, context = 'Purchase' }) => {
    // Form State
    const [grnType, setGrnType] = useState<'purchases' | 'sales_return'>(context === 'Credit Note' ? 'sales_return' : 'purchases');
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
    const [selectedPOs, setSelectedPOs] = useState<string[]>([]);
    const [isPoDropdownOpen, setIsPoDropdownOpen] = useState(false);
    const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
    const [isInvoiceDropdownOpen, setIsInvoiceDropdownOpen] = useState(false);
    const [purchaseOrderNo, setPurchaseOrderNo] = useState(''); // Keep for single value inputs if needed
    const [supplierInvoiceNo, setSupplierInvoiceNo] = useState(initialSupplierInvoiceNo);

    const [postingNote, setPostingNote] = useState('');
    const [reasonsForReturn, setReasonsForReturn] = useState('');

    // Data Source State
    const [locations, setLocations] = useState<Location[]>([]);
    const [grnSeriesList, setGrnSeriesList] = useState<any[]>([]);

    const filteredGrnSeriesList = useMemo(() => {
        return grnSeriesList.filter((series: any) => {
            const seriesType = (series.grn_type || '').toLowerCase().replace(' ', '_');
            const currentType = (grnType || '').toLowerCase();
            if (currentType === 'purchases') return seriesType === 'purchase';
            return seriesType === currentType;
        });
    }, [grnSeriesList, grnType]);
    const [vendors, setVendors] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [itemsList, setItemsList] = useState<any[]>([]);

    // PO Color Mapping
    const poColorMap = useMemo(() => {
        const colors = [
            '#f0f7ff', // Alice Blue
            '#f0fff4', // Honeydew
            '#fffaf0', // Floral White
            '#fff5f5', // Snow Red
            '#faf5ff', // Lavender
            '#f0feff', // Azure
            '#fffaf5', // Seashell
            '#f5f7ff'  // Ghost White
        ];
        const map: Record<string, string> = {};
        const allRefs = [...selectedPOs, ...selectedInvoices];
        allRefs.forEach((ref, index) => {
            map[ref] = colors[index % colors.length];
        });
        return map;
    }, [selectedPOs, selectedInvoices]);

    // Dynamic Options State
    const [branchOptions, setBranchOptions] = useState<any[]>([]);
    const [poOptions, setPoOptions] = useState<any[]>([]);
    const [invoiceOptions, setInvoiceOptions] = useState<any[]>([]);
    const [customerSalesInvoices, setCustomerSalesInvoices] = useState<any[]>([]);

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
            rejectedQty: '0',
            shortExcessQty: '',
            remarks: '',
            boxes: ''
        }
    ]);

    // Fetch initial data on mount
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                // Fetch each resource independently to prevent one failure from blocking others

                // 1. Fetch GRN Series
                try {
                    const seriesResponse = await httpClient.get<any[]>('/api/inventory/master-voucher-grn/');
                    setGrnSeriesList(seriesResponse || []);
                } catch (e) { console.error('Failed to fetch GRN series:', e); }

                // 2. Fetch Locations
                try {
                    const locResponse = await httpClient.get<any>('/api/inventory/locations/');
                    setLocations(Array.isArray(locResponse) ? locResponse : (locResponse?.results || []));
                } catch (e) { console.error('Failed to fetch locations:', e); }

                // 3. Fetch Vendors
                try {
                    const vendorsResponse = await apiService.getRichVendors() as any;
                    setVendors(Array.isArray(vendorsResponse) ? vendorsResponse : (vendorsResponse?.results || []));
                } catch (e) { console.error('Failed to fetch vendors:', e); }

                // 4. Fetch Customers
                try {
                    const customersResponse = await apiService.getRichCustomers() as any;
                    setCustomers(Array.isArray(customersResponse) ? customersResponse : (customersResponse?.results || []));
                } catch (e) { console.error('Failed to fetch customers:', e); }

                // 5. Fetch Items (Stock Items)
                let stockItemsData: any[] = [];
                try {
                    const itemsResponseRaw = await httpClient.get('/api/inventory/items/') as any;
                    stockItemsData = Array.isArray(itemsResponseRaw) ? itemsResponseRaw : (itemsResponseRaw?.results || itemsResponseRaw?.data || []);
                } catch (e) { console.error('Failed to fetch stock items:', e); }

                // 6. Fetch Services
                let servicesData: any[] = [];
                try {
                    const servicesResponseRaw = await httpClient.get('/api/services/') as any;
                    servicesData = Array.isArray(servicesResponseRaw) ? servicesResponseRaw : (servicesResponseRaw?.results || servicesResponseRaw?.data || []);
                } catch (e) {
                    console.error('Failed to fetch services:', e);
                }

                // Map services to match item structure
                const mappedServices = servicesData.map((s: any) => ({
                    ...s,
                    item_code: s.service_code || s.code || '',
                    item_name: s.service_name || s.name || '',
                    hsn_code: s.sac_code || s.hsn_code || s.hsn_sac_code || '',
                    is_service: true
                }));

                // Combine and update state
                setItemsList([...stockItemsData, ...mappedServices]);

            } catch (error) {
                console.error('Fatal error in fetchInitialData:', error);
            }
        };
        fetchInitialData();
    }, []);

    useEffect(() => {
        if (initialExtractedData) {
            if (initialExtractedData.sellerName) setVendorName(initialExtractedData.sellerName);
            if (initialExtractedData.invoiceNumber) setSupplierInvoiceNo(initialExtractedData.invoiceNumber);
            if (initialExtractedData.invoiceDate) setDate(initialExtractedData.invoiceDate);
            if (initialExtractedData.postingNote) setPostingNote(initialExtractedData.postingNote);

            if (initialExtractedData.lineItems && initialExtractedData.lineItems.length > 0) {
                const prefilledItems: GRNItem[] = initialExtractedData.lineItems.map((item: any, index: number) => ({
                    id: Date.now() + index,
                    itemCode: '',
                    itemName: item.itemDescription || '',
                    hsnCode: item.hsnCode || '',
                    uom: item.uom || '',
                    refQty: '',
                    secondaryQty: (item.quantity || 0).toString(),
                    receivedQty: (item.quantity || 0).toString(),
                    acceptedQty: (item.quantity || 0).toString(),
                    rejectedQty: '0',
                    shortExcessQty: '0',
                    remarks: '',
                    boxes: '0'
                }));
                setItems(prefilledItems);
            }
        } else if (grnType === 'purchases') {
            // Priority 2: Use values from main Voucher form
            if (mainVendorName) setVendorName(mainVendorName);
            if (mainBranch) setBranch(mainBranch);
            if (mainGstin) setGstin(mainGstin);
        } else if (grnType === 'sales_return') {
            if (mainVendorName) setCustomerName(mainVendorName);
            if (mainBranch) setBranch(mainBranch);
            if (mainGstin) setGstin(mainGstin);
        }
    }, [initialExtractedData, mainVendorName, mainBranch, mainGstin, grnType]);

    // Handle Vendor Change (Manual)
    const handleVendorChange = (selectedVendorName: string) => {
        setVendorName(selectedVendorName);

        // Reset dependent fields only on manual change
        setBranch('');
        setBranchOptions([]);
        setAddress('');
        setGstin('');
        setSelectedPOs([]); // Reset selected POs
        setPurchaseOrderNo('');
        setPoOptions([]);
        setSelectedInvoices([]);
        setIsInvoiceDropdownOpen(false);
        setSupplierInvoiceNo('');
        setInvoiceOptions([]);
    };

    // Load Vendor Details (Branches, POs, Invoices) whenever vendorName changes
    useEffect(() => {
        const loadDetails = async () => {
            console.log('[CreateGRNModal] useEffect triggered. vendorName:', vendorName, 'vendors count:', vendors.length);
            if (!vendorName || vendors.length === 0) return;

            const vendor = vendors.find(v => v.vendor_name === vendorName);
            console.log('[CreateGRNModal] Finding vendor in list:', vendorName, 'Found:', !!vendor);

            if (vendor) {
                try {
                    // Fetch Branches (GST Details)
                    const branchResponse = await apiService.getVendorGSTDetails(vendor.id);
                    const branches = Array.isArray(branchResponse) ? branchResponse : [];
                    setBranchOptions(branches);
                    console.log('[CreateGRNModal] Branches for vendor:', branches.length);

                    // Auto-select if only one branch exists and no branch selected
                    if (branches.length === 1 && !branch) {
                        const onlyBranch = branches[0];
                        const branchName = onlyBranch.reference_name || onlyBranch.trade_name || 'Main';
                        setBranch(branchName);
                        // ... address logic ...
                        if (onlyBranch.branch_address) {
                            setAddress(onlyBranch.branch_address);
                        } else {
                            const addressParts = [
                                onlyBranch.address_line_1,
                                onlyBranch.address_line_2,
                                onlyBranch.city,
                                onlyBranch.state,
                                onlyBranch.pincode,
                                onlyBranch.country
                            ].filter(Boolean);
                            setAddress(addressParts.join(', '));
                        }
                        setGstin(onlyBranch.gstin || '');
                    }

                    // Fetch Pending Purchase Orders specifically for this vendor
                    console.log('[CreateGRNModal] Fetching pending POs for vendor:', vendorName, 'ID:', vendor.id);
                    const poResponse = await apiService.getPendingPOs(vendor.id, vendor.vendor_name);
                    console.log('[CreateGRNModal] Pending PO Fetch Response:', poResponse);

                    if (Array.isArray(poResponse)) {
                        setPoOptions(poResponse);
                    } else if (poResponse && (poResponse as any).success && Array.isArray((poResponse as any).data)) {
                        setPoOptions((poResponse as any).data);
                    } else {
                        setPoOptions([]);
                    }

                    // Fetch Purchase Invoices
                    const invResponse = await apiService.getVendorPurchaseInvoices(vendorName);
                    if (Array.isArray(invResponse)) {
                        setInvoiceOptions(invResponse);
                    }
                } catch (error) {
                    console.error("Error loading vendor details in effect:", error);
                }
            } else {
                console.warn('[CreateGRNModal] Could not find vendor object for name:', vendorName, 'in vendors list:', vendors.map(v => v.vendor_name));
            }
        };

        loadDetails();
    }, [vendorName, vendors]);

    // Fetch Customer Sales Invoices & Branches
    useEffect(() => {
        const fetchInvoices = async () => {
            if (grnType === 'sales_return' && customerName) {
                try {
                    const response = await apiService.getCustomerSalesInvoices(customerName);
                    setCustomerSalesInvoices(response || []);
                } catch (error) {
                    console.error("Error fetching customer invoices:", error);
                }

                // Fill branches from pre-loaded customers list
                if (customers.length > 0) {
                    const customer = customers.find(c => c.customer_name === customerName);
                    if (customer && customer.branches) {
                        setBranchOptions(customer.branches);
                        console.log('[CreateGRNModal] Popularing branches for customer:', customerName, customer.branches);

                        // Auto-select if only one branch exists
                        if (customer.branches.length === 1 && !branch) {
                            const b = customer.branches[0];
                            const branchName = b.branch_reference_name || 'Main Branch';
                            setBranch(branchName);
                            setGstin(b.gstin || '');

                            // Reconstruct address from branch details if possible
                            const addrParts = [b.addressLine1, b.addressLine2, b.addressLine3, b.city, b.state, b.pincode].filter(Boolean);
                            setAddress(addrParts.join(', '));
                        }
                    }
                }
            }
        };
        fetchInvoices();
    }, [customerName, grnType, customers]);

    // Auto-fetch items when PO(s) are selected
    useEffect(() => {
        const fetchMultiplePOItems = async () => {
            if (selectedPOs.length === 0 || grnType !== 'purchases') return;

            try {
                let allPoItemsRaw: any[] = [];

                for (const poNo of selectedPOs) {
                    // Find PO ID from poOptions
                    const selectedPO = poOptions.find(po => po.po_number === poNo);
                    if (selectedPO && selectedPO.id) {
                        const response = await apiService.getVendorPurchaseOrderById(selectedPO.id);
                        if (response && response.success && response.data && Array.isArray(response.data.items)) {
                            allPoItemsRaw = [...allPoItemsRaw, ...response.data.items.map((item: any) => ({ ...item, _poNumber: poNo }))];
                        }
                    }
                }

                if (allPoItemsRaw.length > 0) {
                    const poItems = allPoItemsRaw.map((item: any) => {
                        // Find full item details to get HSN correctly if not in PO item
                        const fullItem = itemsList.find(i =>
                            (i.item_code || i.code) === item.item_code
                        );

                        return {
                            id: Date.now() + Math.random(),
                            itemCode: item.item_code || '',
                            itemName: item.item_name || '',
                            hsnCode: fullItem?.hsn_code || fullItem?.hsn_sac_code || fullItem?.sac_code || '',
                            uom: item.uom || fullItem?.uom || fullItem?.base_unit || '',
                            // Use pending_qty if available; fall back to full quantity
                            refQty: (item.pending_qty !== undefined ? item.pending_qty : item.quantity)?.toString() || '',
                            secondaryQty: '',
                            receivedQty: '',
                            acceptedQty: '',
                            rejectedQty: '0',
                            shortExcessQty: '',
                            remarks: '',
                            boxes: '',
                            poNumber: item._poNumber
                        };
                    });
                    setItems(poItems);
                }
            } catch (error) {
                console.error("Error fetching PO items:", error);
            }
        };

        fetchMultiplePOItems();
    }, [selectedPOs, poOptions, grnType, itemsList]);

    // Auto-fetch items when Invoice(s) are selected
    useEffect(() => {
        const fetchMultipleInvoiceItems = async () => {
            if (selectedInvoices.length === 0 || grnType !== 'sales_return') return;

            try {
                let allInvItemsRaw: any[] = [];

                for (const invNo of selectedInvoices) {
                    let selectedInv = customerSalesInvoices.find(inv => (inv.voucher_no || inv.sales_invoice_no) === invNo);
                    
                    if (selectedInv) {
                        // If items are missing (could happen if list view is restricted), fetch detail
                        if (!Array.isArray(selectedInv.items) || selectedInv.items.length === 0) {
                            try {
                                const detailedInv = await httpClient.get<any>(`/api/vouchers/sales/${selectedInv.id}/`);
                                if (detailedInv && (Array.isArray(detailedInv.items) || Array.isArray(detailedInv.foreign_items))) {
                                    selectedInv = { ...selectedInv, ...detailedInv };
                                }
                            } catch (e) {
                                console.error(`Failed to fetch detail for invoice ${invNo}:`, e);
                            }
                        }

                        // Handle standard items
                        if (Array.isArray(selectedInv.items)) {
                            allInvItemsRaw = [...allInvItemsRaw, ...selectedInv.items.map((item: any) => ({ ...item, _invNo: invNo }))];
                        }
                        
                        // Handle foreign items
                        if (Array.isArray(selectedInv.foreign_items)) {
                            allInvItemsRaw = [...allInvItemsRaw, ...selectedInv.foreign_items.map((item: any) => ({ 
                                ...item, 
                                _invNo: invNo,
                                // Normalize field names from foreign model
                                qty: item.quantity,
                                uom: item.uqc
                            }))];
                        }
                    }
                }

                if (allInvItemsRaw.length > 0) {
                    const invItems = allInvItemsRaw.map((item: any) => {
                        // The items from sales vouchers have item_name and item_code
                        const fullItem = itemsList.find(i =>
                            (i.item_name || i.name) === item.item_name || (i.item_code || i.code) === item.item_code
                        );

                        return {
                            id: Date.now() + Math.random(),
                            itemCode: fullItem?.item_code || fullItem?.code || item.item_code || '',
                            itemName: fullItem?.item_name || fullItem?.name || item.item_name || item.name || '',
                            hsnCode: fullItem?.hsn_code || fullItem?.hsn_sac_code || fullItem?.sac_code || item.hsn_sac || '',
                            uom: item.uom || fullItem?.uom || fullItem?.base_unit || '',
                            refQty: item.qty?.toString() || '',
                            secondaryQty: '',
                            receivedQty: '',
                            acceptedQty: '',
                            rejectedQty: '0',
                            shortExcessQty: '',
                            remarks: '',
                            boxes: '',
                            poNumber: item._invNo // Reusing field for styling/grouping
                        };
                    });
                    setItems(invItems);
                } else if (selectedInvoices.length === 0 && selectedPOs.length === 0) {
                    // Reset to single empty item if no references selected
                    setItems([{
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
                    }]);
                }
            } catch (error) {
                console.error("Error fetching Invoice items:", error);
            }
        };

        fetchMultipleInvoiceItems();
    }, [selectedInvoices, selectedPOs, customerSalesInvoices, grnType, itemsList]);

    // Auto-select GRN Series if only 1 is available
    useEffect(() => {
        if (filteredGrnSeriesList.length === 1 && grnSeriesId !== filteredGrnSeriesList[0].id.toString()) {
            handleGrnSeriesChange(filteredGrnSeriesList[0].id.toString());
        } else if (filteredGrnSeriesList.length === 0 && grnSeriesId) {
            handleGrnSeriesChange('');
        }
    }, [filteredGrnSeriesList, grnSeriesId]);

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

        if (grnType === 'purchases') {
            const selectedBranch = branchOptions.find(b =>
                (b.reference_name || b.trade_name || 'Main') === selectedBranchName
            );

            if (selectedBranch) {
                // Use branch_address if available, otherwise fallback to assembling from components
                if (selectedBranch.branch_address) {
                    setAddress(selectedBranch.branch_address);
                } else {
                    const addressParts = [
                        selectedBranch.address_line_1,
                        selectedBranch.address_line_2,
                        selectedBranch.city,
                        selectedBranch.state,
                        selectedBranch.pincode,
                        selectedBranch.country
                    ].filter(Boolean);
                    setAddress(addressParts.join(', '));
                }
                setGstin(selectedBranch.gstin || '');
            }
        } else {
            // Customer branches (sales_return)
            const b = branchOptions.find(opt => opt.branch_reference_name === selectedBranchName);
            if (b) {
                setGstin(b.gstin || '');
                const addrParts = [b.addressLine1, b.addressLine2, b.addressLine3, b.city, b.state, b.pincode].filter(Boolean);
                setAddress(addrParts.join(', '));
            }
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
                    updatedItem.hsnCode = selectedStockItem.hsn_code || selectedStockItem.hsn_sac_code || selectedStockItem.sac_code || '';
                    updatedItem.uom = selectedStockItem.uom || selectedStockItem.base_unit || selectedStockItem.unit || '';
                }
            }

            // Calculation Logic: Rejected = Received - Accepted
            if (field === 'receivedQty' || field === 'acceptedQty') {
                const received = parseFloat(updatedItem.receivedQty) || 0;
                const accepted = parseFloat(updatedItem.acceptedQty) || 0;
                updatedItem.rejectedQty = (received - accepted).toString();
            }

            // Calculation Logic: Short/Excess = Inv Qty - Received
            if (field === 'secondaryQty' || field === 'receivedQty') {
                const invQty = parseFloat(updatedItem.secondaryQty) || 0;
                const received = parseFloat(updatedItem.receivedQty) || 0;
                updatedItem.shortExcessQty = (invQty - received).toString();
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

        // Comparison Warning logic
        if (grnType === 'purchases') {
            if (mainVendorName && vendorName !== mainVendorName) {
                showWarning(`Vendor mismatch: GRN is for "${vendorName}" but Voucher is for "${mainVendorName}"`);
            }
            if (mainBranch && branch !== mainBranch) {
                showWarning(`Branch mismatch: GRN is for "${branch}" but Voucher is for "${mainBranch}"`);
            }
            if (mainGstin && gstin !== mainGstin) {
                showWarning(`GSTIN mismatch: GRN is for "${gstin}" but Voucher is for "${mainGstin}"`);
            }
        }

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

            reference_no: grnType === 'purchases' ? selectedPOs.join(', ') : selectedInvoices.join(', '),
            secondary_ref_no: supplierInvoiceNo || '',
            reasons_for_return: reasonsForReturn,
            posting_note: postingNote || '',
            status: 'Posted',

            items: items.map(item => ({
                item_code: item.itemCode || '',
                item_name: item.itemName || '',
                hsn_sac_code: item.hsnCode || '',
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
                    <h3 className="text-xl font-bold text-gray-800 uppercase">{context === 'Credit Note' ? 'Create GRN (Sales Return)' : 'Create GRN'}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
                </div>

                <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                    {/* Top Row */}




                    {/* Primary Header Row */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">DATE</label>
                            <input
                                type="date"
                                value={date}
                                max={new Date().toISOString().split('T')[0]}
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
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">GRN SERIES NAME</label>
                            <select
                                value={grnSeriesId}
                                onChange={(e) => handleGrnSeriesChange(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                                <option value="">Select Series</option>
                                {filteredGrnSeriesList.map((series) => (
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
                                readOnly
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none bg-gray-50 cursor-not-allowed font-medium text-gray-700"
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
                                        setBranch('');
                                        setBranchOptions([]);
                                        setAddress('');
                                        setGstin('');
                                        setSelectedInvoices([]);
                                        setIsInvoiceDropdownOpen(false);
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
                                {branchOptions.map((b, idx) => {
                                    const bName = grnType === 'purchases'
                                        ? (b.reference_name || b.trade_name || 'Main')
                                        : (b.branch_reference_name || 'Main Branch');
                                    return (
                                        <option key={idx} value={bName}>
                                            {bName}
                                        </option>
                                    );
                                })}
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
                                {grnType === 'purchases' ? 'PURCHASE ORDER NO.' : 'SALES INVOICE NO.'}
                            </label>
                            {grnType === 'purchases' ? (
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setIsPoDropdownOpen(!isPoDropdownOpen)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-left flex justify-between items-center min-h-[38px]"
                                    >
                                        <span className="truncate">
                                            {selectedPOs.length > 0 ? selectedPOs.join(', ') : 'Select POs'}
                                        </span>
                                        <ChevronDown size={16} className={`text-gray-400 transition-transform ${isPoDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isPoDropdownOpen && (
                                        <>
                                            <div
                                                className="fixed inset-0 z-10"
                                                onClick={() => setIsPoDropdownOpen(false)}
                                            />
                                            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-300 rounded-[4px] shadow-lg max-h-60 overflow-y-auto">
                                                {poOptions.length === 0 ? (
                                                    <div className="px-3 py-2 text-sm text-gray-500">No POs available</div>
                                                ) : (
                                                    poOptions.map((po) => {
                                                        const isSelected = selectedPOs.includes(po.po_number);
                                                        return (
                                                            <div
                                                                key={po.po_number}
                                                                className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (isSelected) {
                                                                        setSelectedPOs(selectedPOs.filter(p => p !== po.po_number));
                                                                    } else {
                                                                        setSelectedPOs([...selectedPOs, po.po_number]);
                                                                    }
                                                                }}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isSelected}
                                                                    readOnly
                                                                    className="mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                                                />
                                                                <span>{po.po_number}</span>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setIsInvoiceDropdownOpen(!isInvoiceDropdownOpen)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-left flex justify-between items-center min-h-[38px]"
                                    >
                                        <span className="truncate">
                                            {selectedInvoices.length > 0 ? selectedInvoices.join(', ') : 'Select Invoices'}
                                        </span>
                                        <ChevronDown size={16} className={`text-gray-400 transition-transform ${isInvoiceDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isInvoiceDropdownOpen && (
                                        <>
                                            <div
                                                className="fixed inset-0 z-10"
                                                onClick={() => setIsInvoiceDropdownOpen(false)}
                                            />
                                            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-300 rounded-[4px] shadow-lg max-h-60 overflow-y-auto">
                                                {customerSalesInvoices.length === 0 ? (
                                                    <div className="px-3 py-2 text-sm text-gray-500">No Invoices available</div>
                                                ) : (
                                                    customerSalesInvoices.map((inv) => {
                                                        const invoiceNo = inv.voucher_no || inv.sales_invoice_no;
                                                        const isSelected = selectedInvoices.includes(invoiceNo);
                                                        return (
                                                            <div
                                                                key={invoiceNo}
                                                                className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (isSelected) {
                                                                        setSelectedInvoices(selectedInvoices.filter(i => i !== invoiceNo));
                                                                    } else {
                                                                        setSelectedInvoices([...selectedInvoices, invoiceNo]);
                                                                    }
                                                                }}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isSelected}
                                                                    readOnly
                                                                    className="mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                                                />
                                                                <span>{invoiceNo} ({inv.date})</span>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                                {grnType === 'purchases' ? 'SUPPLIER INVOICE NO.' : 'DEBIT NOTE NO.'}
                            </label>
                            <input
                                type="text"
                                value={supplierInvoiceNo}
                                onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                                placeholder={grnType === 'purchases' ? "Enter Invoice No." : "Enter Debit Note No."}
                            />
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
                                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 w-24">HSN/SAC</th>
                                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 w-20">UOM</th>
                                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 w-20 truncate">{grnType === 'purchases' ? 'PO Qty' : 'Sales Voucher Qty'}</th>
                                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 w-20 truncate">{grnType === 'purchases' ? 'Inv Qty' : 'Debit Note Qty'}</th>
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
                                        <tr
                                            key={item.id}
                                            style={{ backgroundColor: item.poNumber ? poColorMap[item.poNumber] : 'transparent' }}
                                            className="transition-colors"
                                        >
                                            <td className="px-3 py-2">
                                                <select
                                                    value={item.itemCode}
                                                    onChange={(e) => handleItemChange(item.id, 'itemCode', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded-[4px] text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                >
                                                    <option value="">Select</option>
                                                    {itemsList.map(i => {
                                                        const code = i.item_code || i.code || '';
                                                        return <option key={i.id} value={code}>{code}</option>;
                                                    })}
                                                    {item.itemCode && !itemsList.some(i => (i.item_code || i.code) === item.itemCode) && (
                                                        <option value={item.itemCode}>{item.itemCode}</option>
                                                    )}
                                                </select>
                                            </td>
                                            <td className="px-3 py-2">
                                                <select
                                                    value={item.itemName}
                                                    onChange={(e) => handleItemChange(item.id, 'itemName', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded-[4px] text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                >
                                                    <option value="">Select Item</option>
                                                    {itemsList.map(i => {
                                                        const name = i.item_name || i.name || '';
                                                        return <option key={i.id} value={name}>{name}</option>;
                                                    })}
                                                    {item.itemName && !itemsList.some(i => (i.item_name || i.name) === item.itemName) && (
                                                        <option value={item.itemName}>{item.itemName}</option>
                                                    )}
                                                </select>
                                            </td>
                                            <td className="px-3 py-2">
                                                <input
                                                    type="text"
                                                    value={item.hsnCode}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-gray-300 rounded-[4px] text-xs bg-gray-50 focus:outline-none"
                                                />
                                            </td>
                                            <td className="px-3 py-2">
                                                <input
                                                    type="text"
                                                    value={item.uom}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-gray-300 rounded-[4px] text-xs bg-gray-50 focus:outline-none"
                                                />
                                            </td>
                                            <td className="px-3 py-2">
                                                <input
                                                    type="number"
                                                    value={item.refQty}
                                                    readOnly
                                                    title={grnType === 'purchases' ? "Pending PO Quantity (auto-fetched from Purchase Order)" : "Invoice Quantity (auto-fetched from Sales Invoice)"}
                                                    className={`w-full px-2 py-1 border border-gray-200 rounded-[4px] text-xs bg-amber-50 cursor-not-allowed text-gray-700 font-medium focus:outline-none`}
                                                />
                                            </td>
                                            <td className="px-3 py-2"><input type="number" value={item.secondaryQty} onChange={(e) => handleItemChange(item.id, 'secondaryQty', e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded-[4px] text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" /></td>
                                            <td className="px-3 py-2"><input type="number" value={item.receivedQty} onChange={(e) => handleItemChange(item.id, 'receivedQty', e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded-[4px] text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" /></td>
                                            <td className="px-3 py-2"><input type="number" value={item.acceptedQty} onChange={(e) => handleItemChange(item.id, 'acceptedQty', e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded-[4px] text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" /></td>
                                            <td className="px-3 py-2"><input type="number" value={item.rejectedQty} readOnly className="w-full px-2 py-1 border border-gray-200 rounded-[4px] text-xs bg-red-50 focus:outline-none" /></td>
                                            <td className="px-3 py-2"><input type="number" value={item.shortExcessQty} readOnly className="w-full px-2 py-1 border border-gray-200 rounded-[4px] text-xs bg-gray-50 focus:outline-none" /></td>
                                            <td className="px-3 py-2"><input type="text" value={item.remarks} onChange={(e) => handleItemChange(item.id, 'remarks', e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded-[4px] text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" /></td>
                                            <td className="px-3 py-2 text-center">
                                                <button onClick={() => handleRemoveItem(item.id)} className="text-red-500 hover:text-red-700 transition-colors p-1">
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mx-auto">
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

                    {/* Posting Note & Reasons for Return */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">REASONS FOR RETURN (MANDATORY)</label>
                            <textarea
                                value={reasonsForReturn}
                                onChange={(e) => setReasonsForReturn(e.target.value)}
                                required
                                className={`w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 h-20 resize-none ${!reasonsForReturn ? 'border-red-300 bg-red-50' : ''}`}
                                placeholder="State reason for returning items..."
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">POSTING NOTE</label>
                            <textarea
                                value={postingNote}
                                onChange={(e) => setPostingNote(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 h-20 resize-none"
                                placeholder="Enter additional notes here..."
                            />
                        </div>
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
