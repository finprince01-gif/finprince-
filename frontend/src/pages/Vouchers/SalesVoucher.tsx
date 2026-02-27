import React, { useState, useMemo } from 'react';
import { apiService } from '../../services/api';
import { httpClient } from '../../services/httpClient';
import { showError, showSuccess } from '../../utils/toast';
import CreateIssueSlipModal from '../../components/CreateIssueSlipModal';
import SearchableDropdown from '../../components/SearchableDropdown';

import { INDIA_STATE_CODES, GST_INVOICE_TYPES, EXPORT_TYPES } from '../../utils/gstConstants';

import { ExtractedInvoiceData } from '../../types';

interface ItemRow {
    id: number;
    itemCode: string;
    itemName: string;
    hsnSac: string;
    qty: string;
    uom: string;
    itemRate: string;
    taxableValue: string;
    igst: string;
    cgst: string;
    sgst: string;
    cess: string;
    invoiceValue: string;
    salesLedger: string;
    description: string;
    alternateUnit: string;
}

interface SalesVoucherProps {
    prefilledData?: ExtractedInvoiceData | null;
    clearPrefilledData?: () => void;
    isLimitReached?: boolean;
    onLimitReached?: () => void;
    customers?: any[];
}

const SalesVoucher: React.FC<SalesVoucherProps> = ({ prefilledData, clearPrefilledData, isLimitReached, onLimitReached, customers = [] }) => {
    const [activeTab, setActiveTab] = useState('invoice');
    const [isIssueSlipModalOpen, setIsIssueSlipModalOpen] = useState(false);
    const [inventoryItems, setInventoryItems] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [ledgers, setLedgers] = useState<any[]>([]);
    const [hierarchy, setHierarchy] = useState<any[]>([]);

    React.useEffect(() => {
        const fetchAllData = async () => {
            try {
                const [items, locs, ledgersData, hierarchyData] = await Promise.all([
                    apiService.getStockItems(),
                    apiService.getInventoryLocations().catch(() => []),
                    apiService.getLedgers().catch(() => []),
                    apiService.getHierarchy().catch(() => [])
                ]);
                setInventoryItems(items);
                setLocations(locs);
                setLedgers(ledgersData);
                setHierarchy(hierarchyData);
            } catch (error) {
                console.error('Error fetching inventory data:', error);
            }
        };
        fetchAllData();
    }, []);

    const itemCodeOptions = useMemo(() => {
        return inventoryItems.map(item => item.item_code).filter(Boolean);
    }, [inventoryItems]);

    const itemNameOptions = useMemo(() => {
        return inventoryItems.map(item => item.name || item.item_name).filter(Boolean);
    }, [inventoryItems]);

    const salesLedgerOptions = useMemo(() => {
        const userLedgers = ledgers.map(l => l.name);

        // Extract leaf nodes or relevant names from hierarchy
        const hierarchyLedgers = new Set<string>();
        hierarchy.forEach(row => {
            // Collect all unique names from all levels of the hierarchy
            if (row.ledger_1) hierarchyLedgers.add(row.ledger_1);
            if (row.sub_group_3_1) hierarchyLedgers.add(row.sub_group_3_1);
            if (row.sub_group_2_1) hierarchyLedgers.add(row.sub_group_2_1);
            if (row.sub_group_1_1) hierarchyLedgers.add(row.sub_group_1_1);
            if (row.group_1) hierarchyLedgers.add(row.group_1);
            if (row.major_group_1) hierarchyLedgers.add(row.major_group_1);
        });

        // Combine and remove duplicates
        return Array.from(new Set([...userLedgers, ...Array.from(hierarchyLedgers)]));
    }, [ledgers, hierarchy]);

    // Populate from AI Extraction
    React.useEffect(() => {
        if (prefilledData) {

            setDate(prefilledData.invoiceDate || new Date().toISOString().split('T')[0]);
            setSalesInvoiceNo(prefilledData.invoiceNumber || '');
            setCustomerName(prefilledData.sellerName || ''); // Maps Seller/Party -> Customer Name

            // Map items
            if (prefilledData.lineItems && prefilledData.lineItems.length > 0) {
                const newRows = prefilledData.lineItems.map((item, index) => {
                    const qty = item.quantity || 1;
                    const rate = item.rate || 0;
                    const taxable = qty * rate;
                    // Default GST to 18% if not extracted (mostly not extracted in simple prompt)
                    const gstRate = 18;
                    const tax = taxable * (gstRate / 100);

                    return {
                        id: index + 1,
                        itemCode: '',
                        itemName: item.itemDescription || '', // AI extracted "description" usually goes to itemName in our simple setup
                        salesLedger: '',
                        description: item.itemDescription || '',
                        hsnSac: item.hsnCode || '',
                        qty: qty.toString(),
                        uom: '',
                        itemRate: rate.toString(),
                        taxableValue: taxable.toFixed(2),
                        igst: '0',
                        cgst: (tax / 2).toFixed(2),
                        sgst: (tax / 2).toFixed(2),
                        cess: '0',
                        invoiceValue: (taxable + tax).toFixed(2),
                        alternateUnit: ''
                    };
                });
                setItemRows(newRows);
            }

            if (clearPrefilledData) clearPrefilledData();
        }
    }, [prefilledData, clearPrefilledData]);

    // Invoice Details State
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [salesInvoiceNo, setSalesInvoiceNo] = useState('');
    const [voucherName, setVoucherName] = useState('');
    const [salesVoucherConfigs, setSalesVoucherConfigs] = useState<any[]>([]);

    React.useEffect(() => {
        const fetchSalesConfigs = async () => {
            try {
                const data = await httpClient.get<any[]>('/api/masters/master-voucher-sales/').catch(() => []);
                if (Array.isArray(data) && data.length > 0) {
                    setSalesVoucherConfigs(data);
                    if (!voucherName) {
                        setVoucherName(data[0].voucher_name);
                    }
                } else {
                    setSalesVoucherConfigs([{ voucher_name: 'Main' }]);
                    if (!voucherName) setVoucherName('Main');
                }
            } catch (e) {
                setSalesVoucherConfigs([{ voucher_name: 'Main' }]);
                if (!voucherName) setVoucherName('Main');
            }
        };
        fetchSalesConfigs();
    }, []);

    // Effect to auto-populate Sales Invoice No based on selected series
    React.useEffect(() => {
        if (voucherName && salesVoucherConfigs.length > 0) {
            const config = salesVoucherConfigs.find((c: any) => c.voucher_name === voucherName);
            if (config && config.enable_auto_numbering) {
                const nextNum = config.current_number || config.start_from || 1;
                const formatted = `${config.prefix || ''}${String(nextNum).padStart(config.required_digits || 4, '0')}${config.suffix || ''}`;
                setSalesInvoiceNo(formatted);
            }
        }
    }, [voucherName, salesVoucherConfigs]);

    const [outwardSlipNo, setOutwardSlipNo] = useState('');
    const [outwardSlipOptions, setOutwardSlipOptions] = useState<string[]>([]);

    // Fetch Outward Slips
    React.useEffect(() => {
        const fetchOutwardSlips = async () => {
            try {
                const data = await httpClient.get<any[]>('/api/inventory/operations/outward/').catch(() => []);
                if (Array.isArray(data)) {
                    // Assuming the field is 'outward_slip_no' or 'slip_no' or 'id'
                    const options = data.map(item => item.outward_slip_no || item.slip_no || item.id || '').filter(Boolean);
                    // Deduplicate
                    setOutwardSlipOptions([...new Set(options)]);
                }
            } catch (e) {
                console.error('Failed to fetch outward slips', e);
            }
        };
        fetchOutwardSlips();
    }, []);

    const [customerName, setCustomerName] = useState('');
    const [customerBillingCurrency, setCustomerBillingCurrency] = useState('');
    const [billToAddress1, setBillToAddress1] = useState('');
    const [billToAddress2, setBillToAddress2] = useState('');
    const [billToAddress3, setBillToAddress3] = useState('');
    const [billToCity, setBillToCity] = useState('');
    const [billToPincode, setBillToPincode] = useState('');
    const [billToState, setBillToState] = useState('');
    const [billToCountry, setBillToCountry] = useState('India');

    const [shipToAddress1, setShipToAddress1] = useState('');
    const [shipToAddress2, setShipToAddress2] = useState('');
    const [shipToAddress3, setShipToAddress3] = useState('');
    const [shipToCity, setShipToCity] = useState('');
    const [shipToPincode, setShipToPincode] = useState('');
    const [shipToState, setShipToState] = useState('');
    const [shipToCountry, setShipToCountry] = useState('India');
    const [sameAsBillTo, setSameAsBillTo] = useState(false);

    React.useEffect(() => {
        if (sameAsBillTo) {
            setShipToAddress1(billToAddress1);
            setShipToAddress2(billToAddress2);
            setShipToAddress3(billToAddress3);
            setShipToCity(billToCity);
            setShipToPincode(billToPincode);
            setShipToState(billToState);
            setShipToCountry(billToCountry);
        }
    }, [sameAsBillTo, billToAddress1, billToAddress2, billToAddress3, billToCity, billToPincode, billToState, billToCountry]);

    const customerOptions = useMemo(() => {
        return Array.from(new Set(customers.map(c => c.customer_name).filter(Boolean)));
    }, [customers]);

    // Show GSTINs only for the selected customer
    const gstinOptions = useMemo(() => {
        if (!customerName) return [];

        const customer = customers.find(c => c.customer_name === customerName);
        if (!customer) return [];

        const options: string[] = [];
        const branches = customer.gst_details?.branches || [];

        branches.forEach((b: any) => {
            if (b.gstin) {
                options.push(b.gstin);
            } else {
                options.push('Unregistered');
            }
        });

        // Add main GSTIN if exists
        if (customer.gstin && !options.includes(customer.gstin)) {
            options.push(customer.gstin);
        }

        if (options.length === 0) {
            options.push('Unregistered');
        }

        return Array.from(new Set(options));
    }, [customerName, customers]);

    // Handle Customer Selection
    const handleCustomerChange = (val: string) => {
        setCustomerName(val);
        setCustomerBillingCurrency('');

        const customer = customers.find(c => c.customer_name === val);
        if (customer) {
            const branches = customer.gst_details?.branches || [];
            const allGstins: string[] = [];

            // Collect all GSTINs
            branches.forEach((b: any) => {
                if (b.gstin) {
                    allGstins.push(b.gstin);
                } else {
                    allGstins.push('Unregistered');
                }
            });
            if (customer.gstin && !allGstins.includes(customer.gstin)) {
                allGstins.push(customer.gstin);
            }
            const uniqueGstins = Array.from(new Set(allGstins));

            // If only 1 GSTIN: auto-fill and populate address
            if (uniqueGstins.length === 1) {
                setGstin(uniqueGstins[0]);

                // Auto-fill address from branch structured fields
                console.log('Selected Customer:', customer);
                console.log('Branches:', branches);

                const selectedGstin = uniqueGstins[0];
                const isUnregistered = selectedGstin === 'Unregistered';

                if (branches.length === 1 || (isUnregistered && branches.length > 0)) {
                    const branch = branches[0];
                    setContact(branch.contactNumber || customer.contact_number || '');
                    // Check for structured address fields first
                    if (branch.addressLine1 || branch.city || branch.state) {
                        setBillToAddress1(branch.addressLine1 || '');
                        setBillToAddress2(branch.addressLine2 || '');
                        setBillToAddress3(branch.addressLine3 || '');
                        setBillToCity(branch.city || '');
                        setBillToPincode(branch.pincode || '');
                        setBillToState(branch.state || '');
                        setBillToCountry(branch.country || 'India');
                    } else if (branch.address) {
                        // Fallback to old single address field
                        setBillToAddress1(branch.address);
                        setBillToAddress2('');
                        setBillToAddress3('');
                        setBillToCity('');
                        setBillToState('');
                        setBillToPincode('');
                        setBillToCountry('India');
                    }
                } else if (customer.bill_to) {
                    try {
                        const billTo = typeof customer.bill_to === 'string' ? JSON.parse(customer.bill_to) : customer.bill_to;
                        setBillToAddress1(billTo.address_line_1 || '');
                        setBillToAddress2(billTo.address_line_2 || '');
                        setBillToAddress3(billTo.address_line_3 || '');
                        setBillToCity(billTo.city || '');
                        setBillToPincode(billTo.pincode || '');
                        setBillToState(billTo.state || '');
                        setBillToCountry(billTo.country || 'India');
                    } catch (e) {
                        console.error('Error parsing customer address', e);
                    }
                }
            } else {
                // Multiple GSTINs: reset GSTIN, user must choose from dropdown
                setGstin('');
            }

            // Auto-populate Terms & Conditions from customer master
            const parts: string[] = [];
            if (customer.credit_period) parts.push(`Credit Period: ${customer.credit_period}`);
            if (customer.credit_terms) parts.push(`Credit Terms: ${customer.credit_terms}`);
            if (customer.penalty_terms) parts.push(`Penalty Terms: ${customer.penalty_terms}`);
            if (customer.delivery_terms) parts.push(`Delivery Terms: ${customer.delivery_terms}`);
            if (customer.warranty_details) parts.push(`Warranty / Guarantee: ${customer.warranty_details}`);
            if (customer.force_majeure) parts.push(`Force Majeure: ${customer.force_majeure}`);
            if (customer.dispute_terms) parts.push(`Dispute & Redressal: ${customer.dispute_terms}`);
            if (parts.length > 0) {
                setTermsConditions(parts.join('\n\n'));
            } else {
                setTermsConditions('');
            }
            setMasterTermsData(customer);

            // Set billing currency from customer master
            if (customer.billing_currency) {
                setCustomerBillingCurrency(customer.billing_currency);
            }
        } else {
            setTermsConditions('');
            setMasterTermsData(null);
        }
    };

    const handleGstinChange = (val: string) => {
        setGstin(val);
        const customer = customers.find(c => c.customer_name === customerName);
        if (customer) {
            const branches = customer.gst_details?.branches || [];
            const matchedBranch = branches.find((b: any) => {
                const bGstin = b.gstin || 'Unregistered';
                return bGstin === val;
            });

            // Check for structured address fields first
            if (matchedBranch) {
                setContact(matchedBranch.contactNumber || customer.contact_number || '');
                if (matchedBranch.addressLine1 || matchedBranch.city || matchedBranch.state) {
                    setBillToAddress1(matchedBranch.addressLine1 || '');
                    setBillToAddress2(matchedBranch.addressLine2 || '');
                    setBillToAddress3(matchedBranch.addressLine3 || '');
                    setBillToCity(matchedBranch.city || '');
                    setBillToPincode(matchedBranch.pincode || '');
                    setBillToState(matchedBranch.state || '');
                    setBillToCountry(matchedBranch.country || 'India');
                } else if (matchedBranch.address) {
                    // Fallback to old single address field
                    setBillToAddress1(matchedBranch.address);
                    setBillToAddress2('');
                    setBillToAddress3('');
                    setBillToCity('');
                    setBillToState('');
                    setBillToPincode('');
                    setBillToCountry('India');
                }
            }
        }
    };

    const [gstin, setGstin] = useState('');
    const [contact, setContact] = useState('');
    const [taxType, setTaxType] = useState('');
    const [stateType, setStateType] = useState<'within' | 'other' | 'export'>('within');
    const [exportType, setExportType] = useState('EXWP');
    const [supportingDocument, setSupportingDocument] = useState<File | null>(null);

    // GST-Compliant Fields
    const [placeOfSupply, setPlaceOfSupply] = useState(''); // State code (01-38)
    const [reverseCharge, setReverseCharge] = useState('N'); // Y or N
    const [invoiceType, setInvoiceType] = useState('Regular'); // Regular, SEZ with payment, etc.
    const [gstExportType, setGstExportType] = useState('WPAY'); // WPAY or WOPAY
    const [portCode, setPortCode] = useState(''); // 6-digit code for exports
    const [shippingBillNumber, setShippingBillNumber] = useState('');
    const [shippingBillDate, setShippingBillDate] = useState('');
    const [ecommerceGstin, setEcommerceGstin] = useState('');

    // Item & Tax Details State
    const [salesOrderNo, setSalesOrderNo] = useState('');
    const [salesOrders, setSalesOrders] = useState<any[]>([]);
    const [salesQuotations, setSalesQuotations] = useState<any[]>([]);
    const [masterCustomers, setMasterCustomers] = useState<any[]>([]);

    React.useEffect(() => {
        const fetchSalesDocs = async () => {
            try {
                const [soRes, sqGenRes, sqSpecRes, custRes] = await Promise.all([
                    httpClient.get('/api/customerportal/sales-orders/').catch(() => []),
                    httpClient.get('/api/customerportal/sales-quotations-general/').catch(() => []),
                    httpClient.get('/api/customerportal/sales-quotations-specific/').catch(() => []),
                    httpClient.get('/api/customerportal/customer-master/').catch(() => [])
                ]);

                const getList = (res: any) => Array.isArray(res) ? res : (res as any).results || [];

                setSalesOrders(getList(soRes));
                setSalesQuotations([...getList(sqGenRes), ...getList(sqSpecRes)]);
                setMasterCustomers(getList(custRes));
            } catch (error) {
                console.error('Error fetching sales documents:', error);
            }
        };
        fetchSalesDocs();
    }, []);

    const handleSalesDocChange = async (val: string) => {
        setSalesOrderNo(val);
        if (!val) return;

        const doc = salesDocOptions.find(d => d.number === val);
        if (!doc) return;

        try {
            let fullDoc: any;
            if (doc.type === 'Order') {
                fullDoc = await httpClient.get(`/api/customerportal/sales-orders/${doc.id}/`);
            } else {
                try {
                    fullDoc = await httpClient.get(`/api/customerportal/sales-quotations-general/${doc.id}/`);
                } catch {
                    fullDoc = await httpClient.get(`/api/customerportal/sales-quotations-specific/${doc.id}/`);
                }
            }

            if (fullDoc && fullDoc.items) {
                const itemsToMap = Array.isArray(fullDoc.items) ? fullDoc.items : [];
                const mappedRows: ItemRow[] = itemsToMap.map((item: any, idx: number) => {
                    const qty = parseFloat(item.quantity || item.qty) || 0;
                    const rate = parseFloat(item.item_rate || item.price || item.negotiated_price || item.rate) || 0;
                    const taxable = qty * rate;
                    const igst = parseFloat(item.igst || item.igst_amount) || 0;
                    const cgst = parseFloat(item.cgst || item.cgst_amount) || (taxable * 0.09);
                    const cess = parseFloat(item.cess || item.cess_amount) || 0;
                    const invVal = taxable + igst + (cgst * 2) + cess;

                    return {
                        id: Date.now() + idx,
                        itemCode: item.item_code || '',
                        itemName: item.item_name || '',
                        hsnSac: item.hsn_sac || '',
                        qty: qty.toString(),
                        uom: item.uom || '',
                        itemRate: rate.toString(),
                        taxableValue: taxable.toFixed(2),
                        igst: igst.toString(),
                        cgst: cgst.toFixed(2),
                        sgst: cgst.toFixed(2),
                        cess: cess.toString(),
                        invoiceValue: invVal.toFixed(2),
                        salesLedger: '',
                        description: item.description || '',
                        alternateUnit: item.alternative_unit || item.alternate_uom || ''
                    };
                });

                if (mappedRows.length > 0) {
                    setItemRows(mappedRows);
                }

                let customerToSet = fullDoc.customer_name || fullDoc.party_name;
                if (!customerToSet && fullDoc.customer_id) {
                    const cust = masterCustomers.find(c => c.id === fullDoc.customer_id);
                    if (cust) customerToSet = cust.customer_name;
                }

                if (!customerName && customerToSet) {
                    handleCustomerChange(customerToSet);
                }
            }
        } catch (error) {
            console.error('Error fetching full document details:', error);
        }
    };

    const salesDocOptions = useMemo(() => {
        const getCustomerName = (doc: any) => {
            if (doc.customer_name) return doc.customer_name;
            if (doc.party_name) return doc.party_name;
            if (doc.customer_id) {
                const cust = masterCustomers.find(c => c.id === doc.customer_id);
                return cust ? cust.customer_name : null;
            }
            return doc.customer_category || null;
        };

        const orders = salesOrders.map(o => ({
            id: o.id,
            number: o.so_number || o.order_number || o.number || `Order-${o.id}`,
            type: 'Order',
            customer: getCustomerName(o)
        }));

        const quotations = salesQuotations.map(q => ({
            id: q.id,
            number: q.quote_number || q.quotation_number || q.number || `Quote-${q.id}`,
            type: 'Quotation',
            customer: getCustomerName(q)
        }));

        const combined = [...orders, ...quotations];
        const uniqueMap = new Map();
        combined.forEach(doc => {
            if (doc.number && !uniqueMap.has(doc.number)) {
                uniqueMap.set(doc.number, doc);
            }
        });

        let filtered = Array.from(uniqueMap.values());
        if (customerName) {
            filtered = filtered.filter(doc =>
                !doc.customer ||
                doc.customer.toLowerCase() === customerName.toLowerCase()
            );
        }
        return filtered;
    }, [salesOrders, salesQuotations, customerName, masterCustomers]);
    const [itemRows, setItemRows] = useState<ItemRow[]>([
        {
            id: 1,
            itemCode: '',
            itemName: '',
            hsnSac: '',
            qty: '',
            uom: '',
            alternateUnit: '',
            itemRate: '',
            taxableValue: '',
            igst: '',
            cgst: '',
            sgst: '',
            cess: '',
            invoiceValue: '',
            salesLedger: '',
            description: ''
        }
    ]);

    const [foreignItemRows, setForeignItemRows] = useState<ItemRow[]>([
        {
            id: 1,
            itemCode: '',
            itemName: '',
            hsnSac: '',
            qty: '',
            uom: '',
            alternateUnit: '',
            itemRate: '',
            taxableValue: '',
            igst: '',
            cgst: '',
            sgst: '',
            cess: '',
            invoiceValue: '',
            salesLedger: '',
            description: ''
        }
    ]);

    // Payment Details State
    const [paymentTaxableValue, setPaymentTaxableValue] = useState('0.00');
    const [paymentIgst, setPaymentIgst] = useState('0.00');
    const [paymentCgst, setPaymentCgst] = useState('0.00');
    const [paymentSgst, setPaymentSgst] = useState('0.00');
    const [paymentCess, setPaymentCess] = useState('0.00');
    const [paymentStateCess, setPaymentStateCess] = useState('0.00');
    const [paymentInvoiceValue, setPaymentInvoiceValue] = useState('0.00');
    const [paymentTdsIncomeTax, setPaymentTdsIncomeTax] = useState('0.00');
    const [paymentTdsGst, setPaymentTdsGst] = useState('0.00');
    const [paymentAdvance, setPaymentAdvance] = useState('0.00');
    const [paymentPayable, setPaymentPayable] = useState('0.00');
    const [paymentPostingNote, setPaymentPostingNote] = useState('');
    const [advanceReferences, setAdvanceReferences] = useState<Array<{
        id: number;
        date: string;
        refNo: string;
        amount: string;
        appliedNow: boolean;
    }>>([]);
    const [termsConditions, setTermsConditions] = useState('');
    const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
    const [masterTermsData, setMasterTermsData] = useState<any>(null);

    // Draft states for Edit Masters modal fields
    const [draftCreditPeriod, setDraftCreditPeriod] = useState('');
    const [draftCreditTerms, setDraftCreditTerms] = useState('');
    const [draftPenaltyTerms, setDraftPenaltyTerms] = useState('');
    const [draftDeliveryTerms, setDraftDeliveryTerms] = useState('');
    const [draftWarrantyDetails, setDraftWarrantyDetails] = useState('');
    const [draftForceMajeure, setDraftForceMajeure] = useState('');
    const [draftDisputeTerms, setDraftDisputeTerms] = useState('');

    const openTermsModal = () => {
        // Pre-fill draft fields from current customer's T&C data
        setDraftCreditPeriod(masterTermsData?.credit_period || '');
        setDraftCreditTerms(masterTermsData?.credit_terms || '');
        setDraftPenaltyTerms(masterTermsData?.penalty_terms || '');
        setDraftDeliveryTerms(masterTermsData?.delivery_terms || '');
        setDraftWarrantyDetails(masterTermsData?.warranty_details || '');
        setDraftForceMajeure(masterTermsData?.force_majeure || '');
        setDraftDisputeTerms(masterTermsData?.dispute_terms || '');
        setIsTermsModalOpen(true);
    };

    const saveTermsModal = () => {
        // Build formatted display string from individual fields
        const parts: string[] = [];
        if (draftCreditPeriod) parts.push(`Credit Period: ${draftCreditPeriod}`);
        if (draftCreditTerms) parts.push(`Credit Terms: ${draftCreditTerms}`);
        if (draftPenaltyTerms) parts.push(`Penalty Terms: ${draftPenaltyTerms}`);
        if (draftDeliveryTerms) parts.push(`Delivery Terms: ${draftDeliveryTerms}`);
        if (draftWarrantyDetails) parts.push(`Warranty / Guarantee: ${draftWarrantyDetails}`);
        if (draftForceMajeure) parts.push(`Force Majeure: ${draftForceMajeure}`);
        if (draftDisputeTerms) parts.push(`Dispute & Redressal: ${draftDisputeTerms}`);
        setTermsConditions(parts.join('\n\n'));
        setIsTermsModalOpen(false);
    };

    // --- Qty Mismatch Validation ---
    const [qtyMismatchError, setQtyMismatchError] = useState('');

    const validateQtyMatch = (): boolean => {
        // This check is only meaningful for export invoices where the
        // Foreign Currency tab is actually used.  For domestic (within / other)
        // invoices the foreignItemRows array holds only blank placeholder rows,
        // so comparing them against real INR rows always causes a false alarm.
        if (stateType !== 'export') return true;

        for (let i = 0; i < Math.max(foreignItemRows.length, itemRows.length); i++) {
            const foreignQty = parseFloat(foreignItemRows[i]?.qty || '0') || 0;
            const inrQty = parseFloat(itemRows[i]?.qty || '0') || 0;
            if (Math.abs(foreignQty - inrQty) > 0.0001) {
                setQtyMismatchError('Items in Foreign Currency Tab & INR Tab does not match. Please correct it.');
                return false;
            }
        }
        setQtyMismatchError('');
        return true;
    };

    // Dispatch Details State
    const [skipDispatch, setSkipDispatch] = useState(false);
    const [dispatchFrom, setDispatchFrom] = useState('');
    const [modeOfTransport, setModeOfTransport] = useState('Road');
    const [dispatchDate, setDispatchDate] = useState('');
    const [dispatchTime, setDispatchTime] = useState('');
    const [deliveryType, setDeliveryType] = useState('');
    const [selfThirdParty, setSelfThirdParty] = useState('');
    const [transporterId, setTransporterId] = useState('');
    const [transporterName, setTransporterName] = useState('');
    const [vehicleNo, setVehicleNo] = useState('');
    const [lrGrConsignment, setLrGrConsignment] = useState('');
    const [dispatchDocument, setDispatchDocument] = useState<File | null>(null);

    // Port Details (for Air/Sea transport)
    const [uptoPortShippingBillNo, setUptoPortShippingBillNo] = useState('');
    const [uptoPortShippingBillDate, setUptoPortShippingBillDate] = useState('');
    const [uptoPortShipPortCode, setUptoPortShipPortCode] = useState('');
    const [uptoPortOrigin, setUptoPortOrigin] = useState('');
    const [beyondPortShippingBillNo, setBeyondPortShippingBillNo] = useState('');
    const [beyondPortShippingBillDate, setBeyondPortShippingBillDate] = useState('');
    const [beyondPortShipPortCode, setBeyondPortShipPortCode] = useState('');
    const [beyondPortVesselFlightNo, setBeyondPortVesselFlightNo] = useState('');
    const [beyondPortPortOfLoading, setBeyondPortPortOfLoading] = useState('');
    const [beyondPortPortOfDischarge, setBeyondPortPortOfDischarge] = useState('');
    const [beyondPortFinalDestination, setBeyondPortFinalDestination] = useState('');
    const [beyondPortOrigin, setBeyondPortOrigin] = useState('');
    const [beyondPortOriginCountry, setBeyondPortOriginCountry] = useState('');
    const [beyondPortDestCountry, setBeyondPortDestCountry] = useState('');

    // Rail Details (for Rail transport)
    const [railUptoPortDeliveryType, setRailUptoPortDeliveryType] = useState('');
    const [railUptoPortTransporterId, setRailUptoPortTransporterId] = useState('');
    const [railUptoPortTransporterName, setRailUptoPortTransporterName] = useState('');
    const [railUptoPortVehicleNo, setRailUptoPortVehicleNo] = useState('');
    const [railUptoPortLrGrConsignment, setRailUptoPortLrGrConsignment] = useState('');
    const [railBeyondPortRailwayReceiptNo, setRailBeyondPortRailwayReceiptNo] = useState('');
    const [railBeyondPortRailwayReceiptDate, setRailBeyondPortRailwayReceiptDate] = useState('');
    const [railBeyondPortOrigin, setRailBeyondPortOrigin] = useState('');
    const [railBeyondPortOriginCountry, setRailBeyondPortOriginCountry] = useState('');
    const [railBeyondPortRailNo, setRailBeyondPortRailNo] = useState('');
    const [railBeyondPortFnrNo, setRailBeyondPortFnrNo] = useState('');
    const [railBeyondPortStationOfLoading, setRailBeyondPortStationOfLoading] = useState('');
    const [railBeyondPortStationOfDischarge, setRailBeyondPortStationOfDischarge] = useState('');
    const [railBeyondPortFinalDestination, setRailBeyondPortFinalDestination] = useState('');
    const [railBeyondPortDestCountry, setRailBeyondPortDestCountry] = useState('');

    // E-Invoice & E-way Bill Details State
    // E-Invoice & E-way Bill Details State
    interface EwayBillEntry {
        id: number;
        available: string;
        ewayBillNo: string;
        date: string;
        validityPeriod: string;
        distance: string;
        // Extended details
        extensionDate: string;
        extendedEwbNo: string;
        extensionReason: string;
        fromPlace: string;
        remainingDistance: string;
        newValidity: string;
        updatedVehicleNo: string;
    }

    const [ewayValidationEntries, setEwayValidationEntries] = useState<EwayBillEntry[]>([{
        id: 1,
        available: 'Yes',
        ewayBillNo: '',
        date: '',
        validityPeriod: '',
        distance: '',
        extensionDate: '',
        extendedEwbNo: '',
        extensionReason: '',
        fromPlace: '',
        remainingDistance: '',
        newValidity: '',
        updatedVehicleNo: ''
    }]);

    const handleEwayEntryChange = (id: number, field: keyof EwayBillEntry, value: string) => {
        setEwayValidationEntries(prev => prev.map(entry =>
            entry.id === id ? { ...entry, [field]: value } : entry
        ));
    };

    const handleAddEwayEntry = () => {
        setEwayValidationEntries(prev => [...prev, {
            id: Date.now(),
            available: 'Yes',
            ewayBillNo: '',
            date: '',
            validityPeriod: '',
            distance: '',
            extensionDate: '',
            extendedEwbNo: '',
            extensionReason: '',
            fromPlace: '',
            remainingDistance: '',
            newValidity: '',
            updatedVehicleNo: ''
        }]);
    };

    const handleRemoveEwayEntry = (id: number) => {
        if (ewayValidationEntries.length > 1) {
            setEwayValidationEntries(prev => prev.filter(entry => entry.id !== id));
        }
    };

    // E-Invoice
    const [irn, setIrn] = useState('');
    const [ackNo, setAckNo] = useState('');
    const [exchangeRate, setExchangeRate] = useState('');

    const tabs = stateType === 'export' ? [
        { id: 'invoice', label: 'Invoice Details' },
        { id: 'item_tax_foreign', label: 'Item & Tax Details (Foreign Currency)' },
        { id: 'item_tax_inr', label: 'Item & Tax Details (INR)' },
        { id: 'payment', label: 'Payment Details' },
        { id: 'dispatch', label: 'Dispatch Details' },
        { id: 'einvoice', label: 'E-Invoice & E-way Bill Details' }
    ] : [
        { id: 'invoice', label: 'Invoice Details' },
        { id: 'item_tax', label: 'Item & Tax Details' },
        { id: 'payment', label: 'Payment Details' },
        { id: 'dispatch', label: 'Dispatch Details' },
        { id: 'einvoice', label: 'E-Invoice & E-way Bill Details' }
    ];

    const handlePost = async () => {
        // Validate Qty match between Foreign Currency and INR tabs
        if (!validateQtyMatch()) {
            setActiveTab('item_tax_inr');
            return;
        }
        try {
            const parseNum = (val: any) => {
                if (val === '' || val === null || val === undefined) return 0;
                const num = parseFloat(val);
                return isNaN(num) ? 0 : num;
            };
            const formatDate = (val: string) => (!val || val.trim() === '') ? null : val;

            const billTo = {
                address_line_1: billToAddress1,
                address_line_2: billToAddress2,
                address_line_3: billToAddress3,
                city: billToCity,
                pincode: billToPincode,
                state: billToState,
                country: billToCountry
            };

            const shipTo = {
                address_line_1: shipToAddress1,
                address_line_2: shipToAddress2,
                address_line_3: shipToAddress3,
                city: shipToCity,
                pincode: shipToPincode,
                state: shipToState,
                country: shipToCountry
            };

            const payload = {
                // Invoice Details
                date: formatDate(date),
                sales_invoice_no: salesInvoiceNo,
                voucher_name: voucherName,
                outward_slip_no: outwardSlipNo,
                customer_name: customerName,
                bill_to: JSON.stringify(billTo),
                ship_to: JSON.stringify(shipTo),
                gstin,
                contact,
                tax_type: taxType,
                state_type: stateType,
                export_type: exportType,
                exchange_rate: exchangeRate,
                supporting_document: supportingDocument, // Passed but likely needs special handling if file
                sales_order_no: salesOrderNo,

                // GST-Compliant Fields
                place_of_supply: placeOfSupply || null,
                reverse_charge: reverseCharge,
                invoice_type: invoiceType,
                gst_export_type: stateType === 'export' ? gstExportType : null,
                port_code: stateType === 'export' ? portCode : null,
                shipping_bill_number: stateType === 'export' ? shippingBillNumber : null,
                shipping_bill_date: stateType === 'export' ? formatDate(shippingBillDate) : null,
                ecommerce_gstin: ecommerceGstin || null,

                // Items (Domestic/INR)
                items: itemRows.map(row => ({
                    item_code: row.itemCode,
                    item_name: row.itemName,
                    hsn_sac: row.hsnSac,
                    qty: parseNum(row.qty),
                    uom: row.uom,
                    item_rate: parseNum(row.itemRate),
                    taxable_value: parseNum(row.taxableValue),
                    igst: parseNum(row.igst),
                    cgst: parseNum(row.cgst),
                    sgst: parseNum(row.sgst),
                    cess: parseNum(row.cess),
                    invoice_value: parseNum(row.invoiceValue),
                    sales_ledger: row.salesLedger,
                    description: row.description,
                    alternate_unit: row.alternateUnit
                })),

                // Items (Foreign)
                foreign_items: stateType === 'export' ? foreignItemRows.map(row => ({
                    description: row.description,
                    quantity: parseNum(row.qty),
                    uqc: row.uom, // mapped from frontend state alias if any, using uom as placeholder
                    rate: parseNum(row.itemRate),
                    amount: parseNum(row.invoiceValue) // assuming invoiceValue is the calculated amount
                })) : [],

                // Payment Details
                payment_details: {
                    payment_taxable_value: calculateTotals().taxableValue,
                    payment_igst: calculateTotals().igst,
                    payment_cgst: calculateTotals().cgst,
                    payment_sgst: calculateTotals().sgst,
                    payment_cess: calculateTotals().cess,
                    payment_state_cess: parseNum(paymentStateCess),
                    payment_invoice_value: calculateTotals().invoiceValue,
                    payment_tds_income_tax: parseNum(paymentTdsIncomeTax),
                    payment_tds_gst: parseNum(paymentTdsGst),
                    payment_advance: parseNum(paymentAdvance),
                    payment_payable: parseNum(paymentPayable),
                    posting_note: paymentPostingNote,
                    terms_conditions: termsConditions,
                    advance_references: JSON.stringify(advanceReferences)
                },

                // Dispatch Details
                dispatch_details: {
                    dispatch_from: dispatchFrom,
                    mode_of_transport: modeOfTransport,
                    dispatch_date: formatDate(dispatchDate),
                    dispatch_time: formatDate(dispatchTime),
                    delivery_type: deliveryType,
                    self_third_party: selfThirdParty,
                    transporter_id: transporterId,
                    transporter_name: transporterName,
                    vehicle_no: vehicleNo,
                    lr_gr_consignment: lrGrConsignment,
                    dispatch_document: dispatchDocument,

                    // Air/Sea
                    upto_port_shipping_bill_no: uptoPortShippingBillNo,
                    upto_port_shipping_bill_date: formatDate(uptoPortShippingBillDate),
                    upto_port_ship_port_code: uptoPortShipPortCode,
                    upto_port_origin: uptoPortOrigin,
                    beyond_port_shipping_bill_no: beyondPortShippingBillNo,
                    beyond_port_shipping_bill_date: formatDate(beyondPortShippingBillDate),
                    beyond_port_ship_port_code: beyondPortShipPortCode,
                    beyond_port_vessel_flight_no: beyondPortVesselFlightNo,
                    beyond_port_port_of_loading: beyondPortPortOfLoading,
                    beyond_port_port_of_discharge: beyondPortPortOfDischarge,
                    beyond_port_final_destination: beyondPortFinalDestination,
                    beyond_port_origin_country: beyondPortOriginCountry,
                    beyond_port_dest_country: beyondPortDestCountry,

                    // Rail
                    rail_upto_port_delivery_type: railUptoPortDeliveryType,
                    rail_upto_port_transporter_id: railUptoPortTransporterId,
                    rail_upto_port_transporter_name: railUptoPortTransporterName,
                    rail_upto_port_vehicle_no: railUptoPortVehicleNo,
                    rail_upto_port_lr_gr_consignment: railUptoPortLrGrConsignment,
                    rail_beyond_port_receipt_no: railBeyondPortRailwayReceiptNo,
                    rail_beyond_port_receipt_date: formatDate(railBeyondPortRailwayReceiptDate),
                    rail_beyond_port_origin: railBeyondPortOrigin,
                    rail_beyond_port_origin_country: railBeyondPortOriginCountry,
                    rail_beyond_port_rail_no: railBeyondPortRailNo,
                    rail_beyond_port_fnr_no: railBeyondPortFnrNo,
                    rail_beyond_port_station_loading: railBeyondPortStationOfLoading,
                    rail_beyond_port_station_discharge: railBeyondPortStationOfDischarge,
                    rail_beyond_port_final_destination: railBeyondPortFinalDestination,
                    rail_beyond_port_dest_country: railBeyondPortDestCountry
                },

                // E-way Bill Details
                eway_bill_details: ewayValidationEntries.map(entry => ({
                    eway_bill_available: entry.available === 'Yes',
                    eway_bill_no: entry.ewayBillNo || '',
                    eway_bill_date: formatDate(entry.date || ''),
                    validity_period: entry.validityPeriod || '',
                    distance: entry.distance || '',
                    extension_date: formatDate(entry.extensionDate || ''),
                    extended_ewb_no: entry.extendedEwbNo || '',
                    extension_reason: entry.extensionReason || '',
                    from_place: entry.fromPlace || '',
                    remaining_distance: entry.remainingDistance || '',
                    new_validity: entry.newValidity || '',
                    updated_vehicle_no: entry.updatedVehicleNo || '',
                    irn: irn,
                    ack_no: ackNo
                }))
            };

            await apiService.createSalesVoucherNew(payload);
            showSuccess('Sales Voucher Saved Successfully!');

            // Reset form or redirect logic here if needed
        } catch (error) {
            console.error('Failed to save sales voucher:');
            showError('Failed to save voucher. Please check inputs.');
        }

    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSupportingDocument(file);
        }
    };

    // Item Row Handlers
    const handleItemRowChange = (id: number, field: keyof ItemRow, value: string) => {
        setItemRows(itemRows.map(row => {
            if (row.id === id) {
                // Prevent negative values for specific numeric fields
                let cleanValue = value;
                if (['qty', 'itemRate', 'igst', 'cgst', 'sgst', 'cess'].includes(field)) {
                    if (parseFloat(value) < 0) {
                        cleanValue = '0';
                    }
                }
                let updatedRow = { ...row, [field]: cleanValue };

                // Auto-fill item details when itemCode or itemName changes
                if (field === 'itemCode' || field === 'itemName') {
                    const matchedItem = inventoryItems.find(item =>
                        field === 'itemCode' ? item.item_code === value : (item.name === value || item.item_name === value)
                    );
                    if (matchedItem) {
                        updatedRow.itemCode = matchedItem.item_code || updatedRow.itemCode;
                        updatedRow.itemName = matchedItem.name || matchedItem.item_name || updatedRow.itemName;
                        updatedRow.hsnSac = matchedItem.hsn_code || matchedItem.hsn || updatedRow.hsnSac;
                        updatedRow.uom = matchedItem.uom || matchedItem.unit || updatedRow.uom;
                        updatedRow.alternateUnit = matchedItem.alternative_unit || matchedItem.alternate_uom || '';
                        updatedRow.itemRate = (matchedItem.rate || matchedItem.standard_rate || 0).toString();

                        // Trigger recalculation of taxable value
                        const qty = parseFloat(updatedRow.qty) || 0;
                        const rate = parseFloat(updatedRow.itemRate) || 0;
                        updatedRow.taxableValue = (qty * rate).toFixed(2);

                        // Recalculate invoice value
                        const taxableVal = parseFloat(updatedRow.taxableValue) || 0;
                        const igst = parseFloat(updatedRow.igst) || 0;
                        const cgst = parseFloat(updatedRow.cgst) || 0;
                        const sgst = parseFloat(updatedRow.sgst) || 0;
                        const cess = parseFloat(updatedRow.cess) || 0;
                        updatedRow.invoiceValue = (taxableVal + igst + cgst + sgst + cess).toFixed(2);
                    }
                }

                // Auto-calculate taxable value when qty or item rate changes
                if (field === 'qty' || field === 'itemRate') {
                    const qty = parseFloat(field === 'qty' ? value : updatedRow.qty) || 0;
                    const rate = parseFloat(field === 'itemRate' ? value : updatedRow.itemRate) || 0;
                    updatedRow.taxableValue = (qty * rate).toFixed(2);

                    // Recalculate invoice value
                    const taxableVal = parseFloat(updatedRow.taxableValue) || 0;
                    const igst = parseFloat(updatedRow.igst) || 0;
                    const cgst = parseFloat(updatedRow.cgst) || 0;
                    const sgst = parseFloat(updatedRow.sgst) || 0;
                    const cess = parseFloat(updatedRow.cess) || 0;
                    updatedRow.invoiceValue = (taxableVal + igst + cgst + sgst + cess).toFixed(2);
                }

                // Auto-calculate invoice value when tax fields change
                if (field === 'igst' || field === 'cgst' || field === 'sgst' || field === 'cess') {
                    const taxableVal = parseFloat(updatedRow.taxableValue) || 0;
                    const igst = parseFloat(updatedRow.igst) || 0;
                    const cgst = parseFloat(updatedRow.cgst) || 0;
                    const sgst = parseFloat(updatedRow.sgst) || 0;
                    const cess = parseFloat(updatedRow.cess) || 0;
                    updatedRow.invoiceValue = (taxableVal + igst + cgst + sgst + cess).toFixed(2);
                }

                return updatedRow;
            }
            return row;
        }));
    };
    const handleAddItemRow = () => {
        const newRow: ItemRow = {
            id: itemRows.length + 1,
            itemCode: '',
            itemName: '',
            hsnSac: '',
            qty: '',
            uom: '',
            itemRate: '',
            taxableValue: '',
            igst: '',
            cgst: '',
            sgst: '',
            cess: '',
            invoiceValue: '',
            salesLedger: '',
            description: '',
            alternateUnit: ''
        };
        setItemRows([...itemRows, newRow]);
    };

    const handleDeleteItemRow = (id: number) => {
        if (itemRows.length > 1) {
            setItemRows(itemRows.filter(row => row.id !== id));
        }
    };

    const handleDeleteSelectedItems = () => {
        // This would delete selected items based on checkboxes
        // For now, we'll keep at least one row
        if (itemRows.length > 1) {
            setItemRows([itemRows[0]]);
        }
    };

    // Foreign Item Row Handlers
    const handleForeignItemRowChange = (id: number, field: keyof ItemRow, value: string) => {
        setForeignItemRows(prev => prev.map(row => {
            if (row.id === id) {
                // Prevent negative values for specific numeric fields
                let cleanValue = value;
                if (['qty', 'itemRate'].includes(field)) {
                    if (parseFloat(value) < 0) {
                        cleanValue = '0';
                    }
                }
                let updatedRow = { ...row, [field]: cleanValue };

                // Auto-calculate amount when qty or rate changes
                if (field === 'qty' || field === 'itemRate') {
                    const qty = parseFloat(field === 'qty' ? cleanValue : updatedRow.qty) || 0;
                    const rate = parseFloat(field === 'itemRate' ? cleanValue : updatedRow.itemRate) || 0;
                    updatedRow.invoiceValue = (qty * rate).toFixed(2);
                }

                return updatedRow;
            }
            return row;
        }));

        // Sync Qty to the INR tab when qty changes in Foreign Currency tab
        if (field === 'qty') {
            const cleanValue = parseFloat(value) < 0 ? '0' : value;
            setItemRows(prev => prev.map(row => {
                if (row.id === id) {
                    // Recalculate INR taxable value with new qty
                    const qty = parseFloat(cleanValue) || 0;
                    const rate = parseFloat(row.itemRate) || 0;
                    const taxable = (qty * rate).toFixed(2);
                    return { ...row, qty: cleanValue, taxableValue: taxable };
                }
                return row;
            }));
        }

        // Sync Description to the INR tab when description changes in Foreign Currency tab
        if (field === 'description') {
            setItemRows(prev => prev.map(row => {
                if (row.id === id) {
                    return { ...row, description: value };
                }
                return row;
            }));
        }

        // Sync UQC (uom) to the UOM field in the INR tab when it changes in Foreign Currency tab
        if (field === 'uom') {
            setItemRows(prev => prev.map(row => {
                if (row.id === id) {
                    return { ...row, uom: value };
                }
                return row;
            }));
        }

        // Sync INR Rate = FC Rate × Conversion Rate when itemRate changes in Foreign Currency tab
        if (field === 'itemRate') {
            const cleanValue = parseFloat(value) < 0 ? '0' : value;
            const convRate = parseFloat(exchangeRate) || 1;
            const inrRate = (parseFloat(cleanValue) || 0) * convRate;
            setItemRows(prev => prev.map(row => {
                if (row.id === id) {
                    const qty = parseFloat(row.qty) || 0;
                    const taxable = (qty * inrRate).toFixed(2);
                    // Recalculate invoice value
                    const igst = parseFloat(row.igst) || 0;
                    const cgst = parseFloat(row.cgst) || 0;
                    const sgst = parseFloat(row.sgst) || 0;
                    const cess = parseFloat(row.cess) || 0;
                    const invoiceVal = (parseFloat(taxable) + igst + cgst + sgst + cess).toFixed(2);
                    return { ...row, itemRate: inrRate.toFixed(2), taxableValue: taxable, invoiceValue: invoiceVal };
                }
                return row;
            }));
        }
    };

    const handleAddForeignItemRow = () => {
        const newRow: ItemRow = {
            id: foreignItemRows.length + 1 + Date.now(), // Ensure unique ID
            itemCode: '',
            itemName: '',
            hsnSac: '',
            qty: '',
            uom: '',
            itemRate: '',
            taxableValue: '',
            igst: '',
            cgst: '',
            sgst: '',
            cess: '',
            invoiceValue: '',
            salesLedger: '',
            description: '',
            alternateUnit: ''
        };
        setForeignItemRows([...foreignItemRows, newRow]);
    };

    const handleDeleteForeignItemRow = (id: number) => {
        if (foreignItemRows.length > 1) {
            setForeignItemRows(foreignItemRows.filter(row => row.id !== id));
        }
    };

    const handleDeleteSelectedForeignItems = () => {
        if (foreignItemRows.length > 1) {
            setForeignItemRows([foreignItemRows[0]]);
        }
    };

    const calculateTotals = () => {
        const totals = itemRows.reduce((acc, row) => {
            return {
                taxableValue: acc.taxableValue + (parseFloat(row.taxableValue) || 0),
                igst: acc.igst + (parseFloat(row.igst) || 0),
                cgst: acc.cgst + (parseFloat(row.cgst) || 0),
                sgst: acc.sgst + (parseFloat(row.sgst) || 0),
                cess: acc.cess + (parseFloat(row.cess) || 0),
                invoiceValue: acc.invoiceValue + (parseFloat(row.invoiceValue) || 0)
            };
        }, { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, invoiceValue: 0 });

        return totals;
    };

    React.useEffect(() => {
        const totals = calculateTotals();
        const invVal = totals.invoiceValue;
        const tdsIT = parseFloat(paymentTdsIncomeTax) || 0;
        const tdsGST = parseFloat(paymentTdsGst) || 0;
        const advance = parseFloat(paymentAdvance) || 0;
        const payable = invVal - tdsIT - tdsGST - advance;
        setPaymentPayable(payable.toFixed(2));
    }, [itemRows, paymentTdsIncomeTax, paymentTdsGst, paymentAdvance]);

    // Sync qty, description, and INR rate from Foreign Currency tab → INR tab whenever foreign rows change
    React.useEffect(() => {
        const convRate = parseFloat(exchangeRate) || 1;
        setItemRows(prev => prev.map((inrRow, idx) => {
            const foreignRow = foreignItemRows[idx];
            if (!foreignRow) return inrRow;
            const qty = foreignRow.qty;
            const description = foreignRow.description;
            // Calculate INR rate from FC rate × conversion rate
            const fcRate = parseFloat(foreignRow.itemRate) || 0;
            const inrRate = fcRate > 0 ? (fcRate * convRate).toFixed(2) : inrRow.itemRate;
            const rate = parseFloat(inrRate) || parseFloat(inrRow.itemRate) || 0;
            const taxable = (parseFloat(qty) || 0) * rate;
            // Recalculate invoice value
            const igst = parseFloat(inrRow.igst) || 0;
            const cgst = parseFloat(inrRow.cgst) || 0;
            const sgst = parseFloat(inrRow.sgst) || 0;
            const cess = parseFloat(inrRow.cess) || 0;
            const invoiceVal = (taxable + igst + cgst + sgst + cess).toFixed(2);
            return {
                ...inrRow,
                qty,
                uom: foreignRow.uom || inrRow.uom,
                description,
                itemRate: inrRate,
                taxableValue: taxable > 0 ? taxable.toFixed(2) : inrRow.taxableValue,
                invoiceValue: invoiceVal,
            };
        }));
    }, [foreignItemRows]);

    // Recalculate INR rates when exchange rate changes
    React.useEffect(() => {
        const convRate = parseFloat(exchangeRate) || 1;
        setItemRows(prev => prev.map((inrRow, idx) => {
            const foreignRow = foreignItemRows[idx];
            if (!foreignRow) return inrRow;
            const fcRate = parseFloat(foreignRow.itemRate) || 0;
            if (fcRate === 0) return inrRow; // Don't overwrite manually-set INR rates if FC rate isn't set
            const inrRate = (fcRate * convRate).toFixed(2);
            const qty = parseFloat(inrRow.qty) || 0;
            const taxable = qty * parseFloat(inrRate);
            const igst = parseFloat(inrRow.igst) || 0;
            const cgst = parseFloat(inrRow.cgst) || 0;
            const sgst = parseFloat(inrRow.sgst) || 0;
            const cess = parseFloat(inrRow.cess) || 0;
            const invoiceVal = (taxable + igst + cgst + sgst + cess).toFixed(2);
            return {
                ...inrRow,
                itemRate: inrRate,
                taxableValue: taxable.toFixed(2),
                invoiceValue: invoiceVal,
            };
        }));
    }, [exchangeRate]);

    const handleNext = () => {
        // Validation
        if (!date || !salesInvoiceNo || !customerName) {
            showError('Please fill in all required fields');
            return;
        }

        // Move to next tab
        setActiveTab('item_tax');
    };

    return (
        <div className="w-full">
            {/* Tabs Section - Underline Style */}
            <div className="border-b border-gray-200 mb-6">
                <div className="flex flex-wrap gap-8">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`
                                pb-3 text-sm font-medium transition-colors duration-200 relative
                                ${activeTab === tab.id
                                    ? 'text-indigo-600 border-b-2 border-indigo-600'
                                    : 'text-gray-600 hover:text-gray-800'
                                }
                            `}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Section */}
            <div className="min-h-[400px] bg-white">
                {activeTab === 'invoice' && (
                    <div className="space-y-6">
                        {/* Row 1: Date, Sales Invoice No, Customer Name, Upload Document */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Date <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Sales Invoice Series
                                </label>
                                <SearchableDropdown
                                    value={voucherName}
                                    onChange={setVoucherName}
                                    options={salesVoucherConfigs.map(c => c.voucher_name)}
                                    placeholder="Select series"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Sales Invoice No. <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={salesInvoiceNo}
                                    onChange={(e) => setSalesInvoiceNo(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="Enter invoice number"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Customer Name <span className="text-red-500">*</span>
                                </label>
                                <SearchableDropdown
                                    value={customerName}
                                    onChange={handleCustomerChange}
                                    options={customerOptions}
                                    placeholder="Search or select customer"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    GSTIN
                                </label>
                                {gstinOptions.length > 1 ? (
                                    <SearchableDropdown
                                        value={gstin}
                                        onChange={handleGstinChange}
                                        options={gstinOptions}
                                        placeholder={customerName ? "Select GSTIN" : "Select Customer first"}
                                        disabled={!customerName}
                                    />
                                ) : (
                                    <input
                                        type="text"
                                        value={gstin}
                                        onChange={(e) => setGstin(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Enter GSTIN"
                                    />
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Upload Supporting Document
                                </label>
                                <div className="relative">
                                    <input
                                        type="file"
                                        id="supporting-doc"
                                        onChange={handleFileUpload}
                                        className="hidden"
                                        accept=".pdf,.jpg,.jpeg,.png"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => document.getElementById('supporting-doc')?.click()}
                                        className="w-full h-[42px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-[4px] transition-colors flex items-center justify-center gap-2"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                        <span className="text-sm">Upload Document</span>
                                    </button>
                                    {supportingDocument && (
                                        <p className="absolute -bottom-6 left-0 text-xs text-indigo-600">✓ {supportingDocument.name}</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-transparent mb-2">
                                    Action
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setIsIssueSlipModalOpen(true)}
                                    className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[4px] transition-colors font-medium"
                                >
                                    Create Outward Slip
                                </button>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Outward Slip No.
                                </label>
                                <SearchableDropdown
                                    value={outwardSlipNo}
                                    onChange={setOutwardSlipNo}
                                    options={outwardSlipOptions}
                                    placeholder="Select or enter slip no"
                                    disabled={false}
                                />
                            </div>
                        </div>

                        {/* Row 2: Bill To and Ship To */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Bill To Section */}
                            <div className="space-y-4">
                                <h3 className="font-semibold text-gray-700">Bill To (Full Address)</h3>
                                <div>
                                    <input
                                        type="text"
                                        value={billToAddress1}
                                        onChange={(e) => setBillToAddress1(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Address Line 1"
                                    />
                                </div>
                                <div>
                                    <input
                                        type="text"
                                        value={billToAddress2}
                                        onChange={(e) => setBillToAddress2(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Address Line 2"
                                    />
                                </div>
                                <div>
                                    <input
                                        type="text"
                                        value={billToAddress3}
                                        onChange={(e) => setBillToAddress3(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Address Line 3"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <input
                                        type="text"
                                        value={billToCity}
                                        onChange={(e) => setBillToCity(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="City"
                                    />
                                    <input
                                        type="text"
                                        value={billToPincode}
                                        onChange={(e) => setBillToPincode(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Pincode"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <input
                                        type="text"
                                        value={billToState}
                                        onChange={(e) => setBillToState(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="State"
                                    />
                                    <input
                                        type="text"
                                        value={billToCountry}
                                        onChange={(e) => setBillToCountry(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Country"
                                    />
                                </div>

                                <div className="mt-3">
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Contact</label>
                                    <input
                                        type="text"
                                        value={contact}
                                        onChange={(e) => setContact(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Enter contact number"
                                    />
                                </div>
                            </div>

                            {/* Ship To Section */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-semibold text-gray-700">Ship To</h3>
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={sameAsBillTo}
                                            onChange={(e) => setSameAsBillTo(e.target.checked)}
                                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                        />
                                        <span className="text-xs text-gray-600">Same as Bill To Address</span>
                                    </label>
                                </div>
                                <div>
                                    <input
                                        type="text"
                                        value={shipToAddress1}
                                        onChange={(e) => setShipToAddress1(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Address Line 1"
                                    />
                                </div>
                                <div>
                                    <input
                                        type="text"
                                        value={shipToAddress2}
                                        onChange={(e) => setShipToAddress2(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Address Line 2"
                                    />
                                </div>
                                <div>
                                    <input
                                        type="text"
                                        value={shipToAddress3}
                                        onChange={(e) => setShipToAddress3(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Address Line 3"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <input
                                        type="text"
                                        value={shipToCity}
                                        onChange={(e) => setShipToCity(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="City"
                                    />
                                    <input
                                        type="text"
                                        value={shipToPincode}
                                        onChange={(e) => setShipToPincode(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Pincode"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <input
                                        type="text"
                                        value={shipToState}
                                        onChange={(e) => setShipToState(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="State"
                                    />
                                    <input
                                        type="text"
                                        value={shipToCountry}
                                        onChange={(e) => setShipToCountry(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Country"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Row 3: GST-Compliant Fields */}
                        <div className="border-t pt-6 mt-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">GST Details</h3>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                                {/* Place of Supply */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Place of Supply <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={placeOfSupply}
                                        onChange={(e) => setPlaceOfSupply(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        required
                                    >
                                        <option value="">Select State</option>
                                        {INDIA_STATE_CODES.map(state => (
                                            <option key={state.code} value={state.code}>
                                                {state.code} - {state.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Invoice Type */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Invoice Type <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={invoiceType}
                                        onChange={(e) => setInvoiceType(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                    >
                                        {GST_INVOICE_TYPES.map(type => (
                                            <option key={type.value} value={type.value}>
                                                {type.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* E-commerce GSTIN */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        E-commerce GST IN
                                    </label>
                                    <input
                                        type="text"
                                        value={ecommerceGstin}
                                        onChange={(e) => setEcommerceGstin(e.target.value.toUpperCase())}
                                        maxLength={15}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="15-digit GSTIN"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Reverse Charge */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Reverse Charge Applicable
                                    </label>
                                    <div className="flex gap-4 mt-3">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="reverseCharge"
                                                value="N"
                                                checked={reverseCharge === 'N'}
                                                onChange={(e) => setReverseCharge(e.target.value)}
                                                className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                                            />
                                            <span className="text-sm text-gray-700">No</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="reverseCharge"
                                                value="Y"
                                                checked={reverseCharge === 'Y'}
                                                onChange={(e) => setReverseCharge(e.target.value)}
                                                className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                                            />
                                            <span className="text-sm text-gray-700">Yes</span>
                                        </label>
                                    </div>
                                </div>

                                {/* Export Type - Only show for exports */}
                                {stateType === 'export' && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Export Type <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            value={gstExportType}
                                            onChange={(e) => setGstExportType(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        >
                                            {EXPORT_TYPES.map(type => (
                                                <option key={type.value} value={type.value}>
                                                    {type.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Port Code - Only for exports */}
                                {stateType === 'export' && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Port Code
                                        </label>
                                        <input
                                            type="text"
                                            value={portCode}
                                            onChange={(e) => setPortCode(e.target.value.toUpperCase())}
                                            maxLength={6}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                            placeholder="e.g., INBLR1"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Shipping Bill Details - Only for exports */}
                            {stateType === 'export' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Shipping Bill Number
                                        </label>
                                        <input
                                            type="text"
                                            value={shippingBillNumber}
                                            onChange={(e) => setShippingBillNumber(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                            placeholder="Enter shipping bill number"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Shipping Bill Date
                                        </label>
                                        <input
                                            type="date"
                                            value={shippingBillDate}
                                            onChange={(e) => setShippingBillDate(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Row 4: Tax Type and State Selection */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Tax Type
                            </label>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <div>
                                    <button
                                        type="button"
                                        onClick={() => setStateType('within')}
                                        className={`w-full px-4 py-2 border rounded-[4px] transition-all duration-200 ${stateType === 'within'
                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-md font-semibold scale-105'
                                            : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'
                                            }`}
                                    >
                                        Within State
                                    </button>
                                </div>

                                <div>
                                    <button
                                        type="button"
                                        onClick={() => setStateType('other')}
                                        className={`w-full px-4 py-2 border rounded-[4px] transition-all duration-200 ${stateType === 'other'
                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-md font-semibold scale-105'
                                            : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'
                                            }`}
                                    >
                                        Other State
                                    </button>
                                </div>

                                <div>
                                    <button
                                        type="button"
                                        onClick={() => setStateType('export')}
                                        className={`w-full px-4 py-2 border rounded-[4px] transition-all duration-200 ${stateType === 'export'
                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-md font-semibold scale-105'
                                            : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'
                                            }`}
                                    >
                                        Export
                                    </button>
                                </div>

                                <div>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab(stateType === 'export' ? 'item_tax_foreign' : 'item_tax')}
                                        className="w-full px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[4px] transition-colors flex items-center justify-center gap-2 font-medium"
                                    >
                                        NEXT
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Export Options */}
                            {stateType === 'export' && (
                                <div className="mt-4 flex gap-6 pl-1">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="exportType"
                                            value="EXWP"
                                            checked={exportType === 'EXWP'}
                                            onChange={(e) => setExportType(e.target.value)}
                                            className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm font-medium text-gray-700">EXWP (With Payment)</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="exportType"
                                            value="EXWOP"
                                            checked={exportType === 'EXWOP'}
                                            onChange={(e) => setExportType(e.target.value)}
                                            className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm font-medium text-gray-700">EXWOP (Without Payment)</span>
                                    </label>
                                </div>
                            )}
                        </div>


                    </div>
                )}

                {activeTab === 'item_tax_foreign' && (
                    <div className="space-y-6">
                        {/* Header: Sales Order and Exchange Rate */}
                        <div className="flex flex-wrap justify-between items-end gap-4">
                            <div className="flex items-center gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1 whitespace-nowrap">
                                        Sales Order/Quotation No.
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={salesOrderNo}
                                            onChange={(e) => handleSalesDocChange(e.target.value)}
                                            className="px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 min-w-[200px]"
                                        >
                                            <option value="">Select Sales Order/Quotation</option>
                                            {salesDocOptions.map((doc, idx) => (
                                                <option key={`${doc.type}-${doc.id}-${idx}`} value={doc.number}>
                                                    {doc.number} ({doc.type})
                                                </option>
                                            ))}
                                        </select>

                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 bg-white px-4 py-2 border border-blue-200 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200">
                                <span className="text-sm font-medium text-gray-700">
                                    1 {customerBillingCurrency || 'Foreign Currency'} =
                                </span>
                                <input
                                    type="text"
                                    value={exchangeRate}
                                    onChange={(e) => setExchangeRate(e.target.value)}
                                    className="w-24 border-b-2 border-gray-300 focus:border-indigo-500 focus:outline-none px-2 py-1 text-center font-medium text-indigo-600"
                                    placeholder="Rate"
                                />
                                <span className="text-sm font-medium text-gray-700">INR</span>
                            </div>
                        </div>

                        {/* Foreign Currency Table */}
                        <div className="overflow-x-auto border border-gray-200 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200">
                            <table className="w-full">
                                <thead className="bg-indigo-600 text-white">
                                    <tr>
                                        <th className="px-3 py-3 text-center w-12 border-r border-blue-400">

                                        </th>
                                        <th className="px-3 py-3 text-sm font-semibold text-center border-r border-blue-400">Description</th>
                                        <th className="px-3 py-3 text-sm font-semibold text-center w-32 border-r border-blue-400">Quantity</th>
                                        <th className="px-3 py-3 text-sm font-semibold text-center w-32 border-r border-blue-400">UQC</th>
                                        <th className="px-3 py-3 text-sm font-semibold text-center w-40 border-r border-blue-400">
                                            Rate ({customerBillingCurrency || 'FC'})
                                        </th>
                                        <th className="px-3 py-3 text-sm font-semibold text-center w-40">
                                            Amount ({customerBillingCurrency || 'FC'})
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {foreignItemRows.map((row) => (
                                        <React.Fragment key={row.id}>
                                            <tr className="hover:bg-gray-50">
                                                <td className="px-3 py-2 text-center border-r border-gray-200">
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                                    />
                                                </td>
                                                <td className="px-3 py-2 border-r border-gray-200">
                                                    <input
                                                        type="text"
                                                        value={row.description}
                                                        onChange={(e) => handleForeignItemRowChange(row.id, 'description', e.target.value)}
                                                        className="w-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm bg-transparent"
                                                        placeholder="Item description"
                                                    />
                                                </td>
                                                <td className="px-3 py-2 border-r border-gray-200">
                                                    <input
                                                        type="text"
                                                        value={row.qty}
                                                        onChange={(e) => handleForeignItemRowChange(row.id, 'qty', e.target.value)}
                                                        className="w-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm text-center bg-transparent"
                                                        placeholder="0"
                                                    />
                                                </td>
                                                <td className="px-3 py-2 border-r border-gray-200">
                                                    <input
                                                        type="text"
                                                        value={row.uom}
                                                        onChange={(e) => handleForeignItemRowChange(row.id, 'uom', e.target.value)}
                                                        className="w-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm text-center bg-transparent"
                                                        placeholder="UQC"
                                                    />
                                                </td>
                                                <td className="px-3 py-2 border-r border-gray-200">
                                                    <input
                                                        type="number"
                                                        value={row.itemRate}
                                                        onChange={(e) => handleForeignItemRowChange(row.id, 'itemRate', e.target.value)}
                                                        className="w-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm text-center bg-transparent"
                                                        placeholder="0.00"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="text"
                                                        value={row.invoiceValue}
                                                        readOnly
                                                        className="w-full px-2 py-1.5 bg-gray-50 border-0 rounded text-sm font-medium text-center text-gray-700"
                                                        placeholder="0.00"
                                                    />
                                                </td>
                                            </tr>
                                            {/* Sales Ledger and Description row for Foreign Currency */}
                                            <tr className="border-b border-gray-200 bg-gray-50">
                                                <td colSpan={3} className="px-2 py-2">
                                                    <div className="flex items-center gap-2">
                                                        <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Sales Ledger:</label>
                                                        <div className="flex-1">
                                                            <SearchableDropdown
                                                                options={salesLedgerOptions}
                                                                value={row.salesLedger}
                                                                onChange={(val) => handleForeignItemRowChange(row.id, 'salesLedger', val)}
                                                                placeholder="Select sales ledger"
                                                            />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td colSpan={3} className="px-2 py-2">
                                                    <div className="flex items-center gap-2">
                                                        <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Description:</label>
                                                        <input
                                                            type="text"
                                                            value={row.description}
                                                            onChange={(e) => handleForeignItemRowChange(row.id, 'description', e.target.value)}
                                                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500"
                                                            placeholder="Enter description"
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer Actions */}
                        <div className="flex items-center justify-between pt-2">
                            <button
                                type="button"
                                onClick={handleAddForeignItemRow}
                                className="px-4 py-2 text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-2 transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Add Row
                            </button>

                            <div className="flex items-center gap-4">
                                <button
                                    type="button"
                                    onClick={handleDeleteSelectedForeignItems}
                                    className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-[4px] transition-colors font-medium flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Delete Items
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setActiveTab('item_tax_inr')}
                                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[4px] transition-colors flex items-center gap-2 font-medium shadow-none border border-slate-200-none border border-slate-200"
                                >
                                    NEXT
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {(activeTab === 'item_tax' || activeTab === 'item_tax_inr') && (
                    <div className="space-y-6">
                        {/* Sales Order Selection */}
                        <div className="flex items-center gap-4">
                            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                                Sales Order/Quotation No.
                            </label>
                            <select
                                value={salesOrderNo}
                                onChange={(e) => handleSalesDocChange(e.target.value)}
                                className="px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                            >
                                <option value="">Select Sales Order/Quotation</option>
                                {salesDocOptions.map((doc, idx) => (
                                    <option key={`${doc.type}-${doc.id}-${idx}`} value={doc.number}>
                                        {doc.number} ({doc.type})
                                    </option>
                                ))}
                            </select>

                        </div>

                        {/* Items Table */}
                        <div className="overflow-x-auto border border-gray-200 rounded-[4px]">
                            <table className="w-full">
                                <thead className="bg-indigo-600 text-white">
                                    <tr>
                                        <th className="px-3 py-2 text-xs font-semibold text-center border-r border-blue-400">S. No.</th>
                                        <th className="px-3 py-2 text-xs font-semibold text-center border-r border-blue-400">Item Code</th>
                                        <th className="px-3 py-2 text-xs font-semibold text-center border-r border-blue-400">Item Name</th>
                                        <th className="px-3 py-2 text-xs font-semibold text-center border-r border-blue-400">HSN/SAC</th>
                                        <th className="px-3 py-2 text-xs font-semibold text-center border-r border-blue-400">Qty</th>
                                        <th className="px-3 py-2 text-xs font-semibold text-center border-r border-blue-400">UOM</th>
                                        <th className="px-3 py-2 text-xs font-semibold text-center border-r border-blue-400">Alternate Unit</th>
                                        <th className="px-3 py-2 text-xs font-semibold text-center border-r border-blue-400">Item Rate</th>
                                        <th className="px-3 py-2 text-xs font-semibold text-center border-r border-blue-400">Taxable Value</th>
                                        {stateType === 'within' ? (
                                            <>
                                                <th className="px-3 py-2 text-xs font-semibold text-center border-r border-blue-400">CGST</th>
                                                <th className="px-3 py-2 text-xs font-semibold text-center border-r border-blue-400">SGST/UTGST</th>
                                            </>
                                        ) : (
                                            <th className="px-3 py-2 text-xs font-semibold text-center border-r border-blue-400">IGST</th>
                                        )}
                                        <th className="px-3 py-2 text-xs font-semibold text-center border-r border-blue-400">CESS</th>
                                        <th className="px-3 py-2 text-xs font-semibold text-center border-r border-blue-400">Invoice Value</th>
                                        <th className="px-3 py-2 text-xs font-semibold text-center">Delete</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {itemRows.map((row, index) => (
                                        <React.Fragment key={row.id}>
                                            <tr className="border-b border-gray-200 hover:bg-gray-50">
                                                <td className="px-2 py-2 text-center text-sm border-r border-gray-200">
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                                    />
                                                    <span className="ml-2">{index + 1}</span>
                                                </td>
                                                <td className="px-2 py-2 border-r border-gray-200">
                                                    <SearchableDropdown
                                                        options={itemCodeOptions}
                                                        value={row.itemCode}
                                                        onChange={(val) => handleItemRowChange(row.id, 'itemCode', val)}
                                                        placeholder="Item code"
                                                    />
                                                </td>
                                                <td className="px-2 py-2 border-r border-gray-200">
                                                    <SearchableDropdown
                                                        options={itemNameOptions}
                                                        value={row.itemName}
                                                        onChange={(val) => handleItemRowChange(row.id, 'itemName', val)}
                                                        placeholder="Item name"
                                                    />
                                                </td>
                                                <td className="px-2 py-2 border-r border-gray-200">
                                                    <input
                                                        type="text"
                                                        value={row.hsnSac}
                                                        onChange={(e) => handleItemRowChange(row.id, 'hsnSac', e.target.value)}
                                                        className="w-full px-2 py-1 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm"
                                                        placeholder="HSN/SAC"
                                                    />
                                                </td>
                                                <td className="px-2 py-2 border-r border-gray-200">
                                                    <input
                                                        type="number"
                                                        value={row.qty}
                                                        min="0"
                                                        readOnly={activeTab === 'item_tax_inr'}
                                                        onChange={activeTab === 'item_tax_inr' ? undefined : (e) => handleItemRowChange(row.id, 'qty', e.target.value)}
                                                        title={activeTab === 'item_tax_inr' ? 'Quantity is auto-fetched from the Item & Tax Details (Foreign Currency) tab' : undefined}
                                                        className={`w-20 px-2 py-1 border-0 rounded text-sm text-center ${activeTab === 'item_tax_inr'
                                                            ? 'bg-gray-100 text-gray-600 cursor-not-allowed select-none'
                                                            : 'focus:ring-1 focus:ring-indigo-500'
                                                            }`}
                                                        placeholder="Qty"
                                                    />
                                                </td>
                                                <td className="px-2 py-2 border-r border-gray-200">
                                                    <input
                                                        type="text"
                                                        value={row.uom}
                                                        onChange={(e) => handleItemRowChange(row.id, 'uom', e.target.value)}
                                                        className="w-20 px-2 py-1 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm"
                                                        placeholder="UOM"
                                                    />
                                                </td>
                                                <td className="px-2 py-2 border-r border-gray-200">
                                                    <input
                                                        type="text"
                                                        value={row.alternateUnit}
                                                        readOnly
                                                        className="w-24 px-2 py-1 bg-gray-50 border-0 rounded text-sm"
                                                        placeholder="Alt Unit"
                                                    />
                                                </td>
                                                <td className="px-2 py-2 border-r border-gray-200">
                                                    <input
                                                        type="number"
                                                        value={row.itemRate}
                                                        min="0"
                                                        readOnly={activeTab === 'item_tax_inr'}
                                                        onChange={activeTab === 'item_tax_inr' ? undefined : (e) => handleItemRowChange(row.id, 'itemRate', e.target.value)}
                                                        title={activeTab === 'item_tax_inr' ? 'Rate (INR) is auto-calculated as Rate (FC) × Conversion Rate' : undefined}
                                                        className={`w-24 px-2 py-1 border-0 rounded text-sm ${activeTab === 'item_tax_inr'
                                                            ? 'bg-gray-100 text-gray-600 cursor-not-allowed select-none'
                                                            : 'focus:ring-1 focus:ring-indigo-500'
                                                            }`}
                                                        placeholder="Rate"
                                                    />
                                                </td>
                                                <td className="px-2 py-2 border-r border-gray-200">
                                                    <input
                                                        type="text"
                                                        value={row.taxableValue}
                                                        readOnly
                                                        className="w-24 px-2 py-1 bg-gray-50 border-0 rounded text-sm"
                                                    />
                                                </td>
                                                {stateType === 'within' ? (
                                                    <>
                                                        <td className="px-2 py-2 border-r border-gray-200">
                                                            <input
                                                                type="number"
                                                                value={row.cgst}
                                                                min="0"
                                                                onChange={(e) => handleItemRowChange(row.id, 'cgst', e.target.value)}
                                                                className="w-20 px-2 py-1 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm"
                                                                placeholder="CGST"
                                                            />
                                                        </td>
                                                        <td className="px-2 py-2 border-r border-gray-200">
                                                            <input
                                                                type="number"
                                                                value={row.sgst}
                                                                min="0"
                                                                onChange={(e) => handleItemRowChange(row.id, 'sgst', e.target.value)}
                                                                className="w-20 px-2 py-1 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm"
                                                                placeholder="SGST"
                                                            />
                                                        </td>
                                                    </>
                                                ) : (
                                                    <td className="px-2 py-2 border-r border-gray-200">
                                                        <input
                                                            type="number"
                                                            value={row.igst}
                                                            min="0"
                                                            onChange={(e) => handleItemRowChange(row.id, 'igst', e.target.value)}
                                                            className="w-20 px-2 py-1 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm"
                                                            placeholder="IGST"
                                                        />
                                                    </td>
                                                )}
                                                <td className="px-2 py-2 border-r border-gray-200">
                                                    <input
                                                        type="number"
                                                        value={row.cess}
                                                        min="0"
                                                        onChange={(e) => handleItemRowChange(row.id, 'cess', e.target.value)}
                                                        className="w-20 px-2 py-1 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm"
                                                        placeholder="CESS"
                                                    />
                                                </td>
                                                <td className="px-2 py-2 border-r border-gray-200">
                                                    <input
                                                        type="text"
                                                        value={row.invoiceValue}
                                                        readOnly
                                                        className="w-28 px-2 py-1 bg-gray-50 border-0 rounded text-sm font-medium"
                                                    />
                                                </td>
                                                <td className="px-2 py-2 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteItemRow(row.id)}
                                                        className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                                                        title="Delete this item"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </td>
                                            </tr>
                                            {/* Sales Ledger and Description Row */}
                                            <tr className="border-b border-gray-200 bg-gray-50">
                                                <td colSpan={4} className="px-2 py-2">
                                                    <div className="flex items-center gap-2">
                                                        <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Sales Ledger:</label>
                                                        <div className="flex-1">
                                                            <SearchableDropdown
                                                                options={salesLedgerOptions}
                                                                value={row.salesLedger}
                                                                onChange={(val) => handleItemRowChange(row.id, 'salesLedger', val)}
                                                                placeholder="Select sales ledger"
                                                            />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td colSpan={stateType === 'within' ? 10 : 9} className="px-2 py-2">
                                                    <div className="flex items-center gap-2">
                                                        <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Description:</label>
                                                        <input
                                                            type="text"
                                                            value={row.description}
                                                            readOnly={activeTab === 'item_tax_inr'}
                                                            onChange={activeTab === 'item_tax_inr' ? undefined : (e) => handleItemRowChange(row.id, 'description', e.target.value)}
                                                            title={activeTab === 'item_tax_inr' ? 'Description is auto-fetched from the Item & Tax Details (Foreign Currency) tab' : undefined}
                                                            placeholder={activeTab === 'item_tax_inr' ? undefined : 'Enter description'}
                                                            className={`flex-1 px-2 py-1 border rounded text-sm ${activeTab === 'item_tax_inr'
                                                                ? 'bg-gray-100 border-gray-200 text-gray-600 cursor-not-allowed select-none'
                                                                : 'border-gray-300 focus:ring-1 focus:ring-indigo-500'
                                                                }`}
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        </React.Fragment>
                                    ))}

                                    {/* Totals Row */}
                                    <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                                        <td colSpan={8} className="px-3 py-2 text-right text-sm">Total:</td>
                                        <td className="px-2 py-2">
                                            <input
                                                type="text"
                                                value={calculateTotals().taxableValue.toFixed(2)}
                                                readOnly
                                                className="w-24 px-2 py-1 bg-white border border-gray-300 rounded text-sm font-semibold text-center"
                                            />
                                        </td>
                                        {stateType === 'within' ? (
                                            <>
                                                <td className="px-2 py-2">
                                                    <input
                                                        type="text"
                                                        value={calculateTotals().cgst.toFixed(2)}
                                                        readOnly
                                                        className="w-20 px-2 py-1 bg-white border border-gray-300 rounded text-sm font-semibold text-center"
                                                    />
                                                </td>
                                                <td className="px-2 py-2">
                                                    <input
                                                        type="text"
                                                        value={calculateTotals().sgst.toFixed(2)}
                                                        readOnly
                                                        className="w-20 px-2 py-1 bg-white border border-gray-300 rounded text-sm font-semibold text-center"
                                                    />
                                                </td>
                                            </>
                                        ) : (
                                            <td className="px-2 py-2">
                                                <input
                                                    type="text"
                                                    value={calculateTotals().igst.toFixed(2)}
                                                    readOnly
                                                    className="w-20 px-2 py-1 bg-white border border-gray-300 rounded text-sm font-semibold text-center"
                                                />
                                            </td>
                                        )}
                                        <td className="px-2 py-2">
                                            <input
                                                type="text"
                                                value={calculateTotals().cess.toFixed(2)}
                                                readOnly
                                                className="w-20 px-2 py-1 bg-white border border-gray-300 rounded text-sm font-semibold text-center"
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <input
                                                type="text"
                                                value={calculateTotals().invoiceValue.toFixed(2)}
                                                readOnly
                                                className="w-28 px-2 py-1 bg-white border border-gray-300 rounded text-sm font-semibold text-center"
                                            />
                                        </td>
                                        <td className="px-2 py-2"></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Qty Mismatch Error Banner */}
                        {qtyMismatchError && (
                            <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-300 rounded-[4px] text-red-700 text-sm font-medium">
                                <svg className="w-5 h-5 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                </svg>
                                {qtyMismatchError}
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={handleAddItemRow}
                                className="px-4 py-2 text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Add Row
                            </button>

                            <div className="flex items-center gap-4">

                                <button
                                    type="button"
                                    onClick={() => {
                                        if (validateQtyMatch()) {
                                            setActiveTab('payment');
                                        }
                                    }}
                                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[4px] transition-colors flex items-center gap-2 font-medium"
                                >
                                    NEXT
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'payment' && (
                    <div className="space-y-6">
                        {/* Tax Summary Table */}
                        <div className="border border-gray-300 rounded-[4px] overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="px-4 py-2 text-sm font-semibold text-gray-700 border-r border-gray-300">Taxable Value</th>
                                        <th className="px-4 py-2 text-sm font-semibold text-gray-700 border-r border-gray-300">IGST</th>
                                        <th className="px-4 py-2 text-sm font-semibold text-gray-700 border-r border-gray-300">CGST</th>
                                        <th className="px-4 py-2 text-sm font-semibold text-gray-700 border-r border-gray-300">SGST/UTGST</th>
                                        <th className="px-4 py-2 text-sm font-semibold text-gray-700 border-r border-gray-300">Cess</th>
                                        <th className="px-4 py-2 text-sm font-semibold text-gray-700">State Cess</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="bg-white">
                                        <td className="px-4 py-3 border-r border-gray-300">
                                            <input
                                                type="text"
                                                value={calculateTotals().taxableValue.toFixed(2)}
                                                readOnly
                                                className="w-full px-2 py-1 bg-gray-50 border-0 rounded text-sm text-center"
                                            />
                                        </td>
                                        <td className="px-4 py-3 border-r border-gray-300">
                                            <input
                                                type="text"
                                                value={calculateTotals().igst.toFixed(2)}
                                                readOnly
                                                className="w-full px-2 py-1 bg-gray-50 border-0 rounded text-sm text-center"
                                            />
                                        </td>
                                        <td className="px-4 py-3 border-r border-gray-300">
                                            <input
                                                type="text"
                                                value={calculateTotals().cgst.toFixed(2)}
                                                readOnly
                                                className="w-full px-2 py-1 bg-gray-50 border-0 rounded text-sm text-center"
                                            />
                                        </td>
                                        <td className="px-4 py-3 border-r border-gray-300">
                                            <input
                                                type="text"
                                                value={calculateTotals().sgst.toFixed(2)}
                                                readOnly
                                                className="w-full px-2 py-1 bg-gray-50 border-0 rounded text-sm text-center"
                                            />
                                        </td>
                                        <td className="px-4 py-3 border-r border-gray-300">
                                            <input
                                                type="text"
                                                value={calculateTotals().cess.toFixed(2)}
                                                readOnly
                                                className="w-full px-2 py-1 bg-gray-50 border-0 rounded text-sm text-center"
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input
                                                type="text"
                                                value={paymentStateCess}
                                                readOnly
                                                className="w-full px-2 py-1 bg-gray-50 border-0 rounded text-sm text-center"
                                            />
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Main Content Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Left Column - Payment Summary */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Invoice Value
                                    </label>
                                    <input
                                        type="text"
                                        value={calculateTotals().invoiceValue.toFixed(2)}
                                        readOnly
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-right"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        TDS/TCS under Income Tax
                                    </label>
                                    <input
                                        type="text"
                                        value={paymentTdsIncomeTax}
                                        onChange={(e) => setPaymentTdsIncomeTax(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-right"
                                        placeholder="0.00"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        TDS/TCS under GST
                                    </label>
                                    <input
                                        type="text"
                                        value={paymentTdsGst}
                                        onChange={(e) => setPaymentTdsGst(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-right"
                                        placeholder="0.00"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Advance
                                    </label>
                                    <input
                                        type="text"
                                        value={paymentAdvance}
                                        readOnly
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-right"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Payable
                                    </label>
                                    <input
                                        type="text"
                                        value={paymentPayable}
                                        readOnly
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-right font-bold"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Posting Note:
                                    </label>
                                    <textarea
                                        value={paymentPostingNote}
                                        onChange={(e) => setPaymentPostingNote(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                                        rows={6}
                                        placeholder="Enter posting notes..."
                                    />
                                </div>
                            </div>

                            {/* Middle Column - Advance References */}
                            <div className="border border-gray-300 rounded-[4px] p-4 bg-blue-50">
                                <div className="space-y-3">
                                    <div className="grid grid-cols-4 gap-2 text-xs font-semibold text-gray-700">
                                        <div className="text-center">Date</div>
                                        <div className="text-center">Advance Ref. No.</div>
                                        <div className="text-center">Amount</div>
                                        <div className="text-center">Applied Now</div>
                                    </div>

                                    {advanceReferences.length === 0 ? (
                                        <div className="text-center py-8 text-gray-500 text-sm">
                                            No advance references available
                                        </div>
                                    ) : (
                                        advanceReferences.map((ref) => (
                                            <div key={ref.id} className="grid grid-cols-4 gap-2">
                                                <input
                                                    type="date"
                                                    value={ref.date}
                                                    readOnly
                                                    className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                                                />
                                                <select
                                                    value={ref.refNo}
                                                    className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                                                >
                                                    <option value="">Select</option>
                                                    <option value={ref.refNo}>{ref.refNo}</option>
                                                </select>
                                                <input
                                                    type="text"
                                                    value={ref.amount}
                                                    readOnly
                                                    className="px-2 py-1 border border-gray-300 rounded text-xs bg-white text-center"
                                                />
                                                <div className="flex items-center justify-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={ref.appliedNow}
                                                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                                    />
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Right Column - Edit Master */}
                            <div className="border border-gray-200 rounded-[4px] p-6 bg-gray-50">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                                        <button
                                            type="button"
                                            className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-[4px] hover:bg-gray-50 transition-colors text-sm font-medium shadow-none border border-slate-200-none border border-slate-200"
                                        >
                                            Terms & Conditions
                                        </button>
                                        <button
                                            type="button"
                                            onClick={openTermsModal}
                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[4px] transition-colors text-sm font-medium shadow-none border border-slate-200-none border border-slate-200"
                                        >
                                            Edit Masters
                                        </button>
                                    </div>

                                    <div>
                                        <textarea
                                            value={termsConditions}
                                            readOnly
                                            className="w-full px-4 py-3 border border-gray-200 rounded-[4px] text-gray-700 resize-none bg-white cursor-default select-none"
                                            rows={8}
                                            placeholder="Select a customer to auto-load their terms & conditions, or click Edit Masters to add manually."
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => setActiveTab('dispatch')}
                                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[4px] transition-colors flex items-center gap-2 font-medium"
                            >
                                NEXT
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                    </div>
                )}

                {/* Terms & Conditions Master Modal */}
                {isTermsModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-[4px] shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
                            {/* Modal Header */}
                            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50">
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">Edit Terms &amp; Conditions</h2>
                                    {masterTermsData && (
                                        <p className="text-sm text-gray-500 mt-0.5">{masterTermsData.customer_name}</p>
                                    )}
                                </div>
                                <button
                                    onClick={() => setIsTermsModalOpen(false)}
                                    className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-[4px] text-gray-400 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Modal Body — individual T&C fields matching Customer Portal layout */}
                            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

                                {/* Credit Period */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Credit Period</label>
                                    <input
                                        type="text"
                                        value={draftCreditPeriod}
                                        onChange={(e) => setDraftCreditPeriod(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm text-gray-800 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400"
                                        placeholder="e.g., 30 Days"
                                    />
                                </div>

                                {/* Credit Terms */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Credit Terms</label>
                                    <textarea
                                        value={draftCreditTerms}
                                        onChange={(e) => setDraftCreditTerms(e.target.value)}
                                        rows={3}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm text-gray-800 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400 resize-none"
                                        placeholder="Enter credit terms details"
                                    />
                                </div>

                                {/* Penalty Terms */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Penalty Terms</label>
                                    <textarea
                                        value={draftPenaltyTerms}
                                        onChange={(e) => setDraftPenaltyTerms(e.target.value)}
                                        rows={3}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm text-gray-800 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400 resize-none"
                                        placeholder="Enter penalty terms"
                                    />
                                </div>

                                {/* Delivery Terms */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Delivery Terms</label>
                                    <textarea
                                        value={draftDeliveryTerms}
                                        onChange={(e) => setDraftDeliveryTerms(e.target.value)}
                                        rows={3}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm text-gray-800 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400 resize-none"
                                        placeholder="Enter delivery terms"
                                    />
                                </div>

                                {/* Warranty / Guarantee Details */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Warranty / Guarantee Details</label>
                                    <textarea
                                        value={draftWarrantyDetails}
                                        onChange={(e) => setDraftWarrantyDetails(e.target.value)}
                                        rows={3}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm text-gray-800 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400 resize-none"
                                        placeholder="Enter warranty or guarantee details"
                                    />
                                </div>

                                {/* Force Majeure */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Force Majeure</label>
                                    <textarea
                                        value={draftForceMajeure}
                                        onChange={(e) => setDraftForceMajeure(e.target.value)}
                                        rows={3}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm text-gray-800 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400 resize-none"
                                        placeholder="Enter force majeure terms"
                                    />
                                </div>

                                {/* Dispute Redressal Terms */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Dispute Redressal Terms</label>
                                    <textarea
                                        value={draftDisputeTerms}
                                        onChange={(e) => setDraftDisputeTerms(e.target.value)}
                                        rows={3}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm text-gray-800 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400 resize-none"
                                        placeholder="Enter dispute redressal terms"
                                    />
                                </div>

                            </div>

                            {/* Modal Footer */}
                            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsTermsModalOpen(false)}
                                    className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-[4px] hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={saveTermsModal}
                                    className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-[4px] transition-colors"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'dispatch' && (
                    <div className="space-y-6">
                        {/* Skip Button */}
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    setSkipDispatch(true);
                                    setActiveTab('einvoice');
                                }}
                                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[4px] transition-colors font-medium"
                            >
                                Skip
                            </button>
                        </div>

                        {/* Main Grid Layout */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Left Column */}
                            <div className="space-y-4">
                                {/* Dispatch From */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Dispatch From
                                    </label>
                                    <select
                                        value={dispatchFrom}
                                        onChange={(e) => setDispatchFrom(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm"
                                    >
                                        <option value="">Select Location</option>
                                        {locations.map((loc, idx) => (
                                            <option key={loc.id || idx} value={loc.name || loc.location_name}>
                                                {loc.name || loc.location_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Mode of Transport */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Mode of Transport
                                    </label>
                                    <select
                                        value={modeOfTransport}
                                        onChange={(e) => setModeOfTransport(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                    >
                                        <option value="Road">Road</option>
                                        <option value="Air">Air</option>
                                        <option value="Sea">Sea</option>
                                        <option value="Rail">Rail</option>
                                    </select>
                                </div>

                                {/* Dispatch Date */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Dispatch Date
                                    </label>
                                    <input
                                        type="date"
                                        value={dispatchDate}
                                        onChange={(e) => setDispatchDate(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>

                                {/* Dispatch Time */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Dispatch Time
                                    </label>
                                    <input
                                        type="time"
                                        value={dispatchTime}
                                        onChange={(e) => setDispatchTime(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>

                                {/* Upload Document */}
                                {!['Air', 'Sea', 'Rail'].includes(modeOfTransport) && (
                                    <div className="mt-6">
                                        <input
                                            type="file"
                                            id="dispatch-doc"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) setDispatchDocument(file);
                                            }}
                                            className="hidden"
                                            accept=".jpg,.jpeg,.pdf"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => document.getElementById('dispatch-doc')?.click()}
                                            className="w-full h-40 border-2 border-dashed border-gray-300 hover:border-indigo-500 bg-gray-50 hover:bg-indigo-50/50 text-gray-600 rounded-[4px] transition-colors flex flex-col items-center justify-center gap-2"
                                        >
                                            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                            </svg>
                                            <span className="text-sm font-medium">UPLOAD DOCUMENT</span>
                                            {dispatchDocument && (
                                                <span className="text-xs mt-2 text-indigo-600 font-medium">✓ {dispatchDocument.name}</span>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Right Column */}
                            <div className={`space-y-4 ${['Air', 'Sea', 'Rail'].includes(modeOfTransport) ? 'hidden' : ''}`}>
                                {/* Delivery Type */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Delivery Type
                                    </label>
                                    <select
                                        value={deliveryType}
                                        onChange={(e) => {
                                            setDeliveryType(e.target.value);
                                            // If Courier is selected, disable other fields
                                            if (e.target.value === 'Courier') {
                                                setTransporterId('');
                                                setTransporterName('');
                                                setVehicleNo('');
                                            }
                                        }}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                    >
                                        <option value="">Select</option>
                                        <option value="Self">Self</option>
                                        <option value="Third Party">Third Party</option>
                                        <option value="Courier">Courier</option>
                                    </select>
                                </div>



                                {/* Transporter ID/GSTIN */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Transporter ID/GSTIN
                                    </label>
                                    <input
                                        type="text"
                                        value={transporterId}
                                        onChange={(e) => setTransporterId(e.target.value)}
                                        disabled={deliveryType === 'Courier'}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"

                                    />
                                </div>

                                {/* Transporter Name */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Transporter Name
                                    </label>
                                    <input
                                        type="text"
                                        value={transporterName}
                                        onChange={(e) => setTransporterName(e.target.value)}
                                        disabled={deliveryType === 'Courier'}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"

                                    />
                                </div>

                                {/* Vehicle No. */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Vehicle No.
                                    </label>
                                    <input
                                        type="text"
                                        value={vehicleNo}
                                        onChange={(e) => setVehicleNo(e.target.value)}
                                        disabled={deliveryType === 'Courier'}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"

                                    />
                                </div>

                                {/* LR/GR/Consignment */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        LR/GR/Consignment
                                    </label>
                                    <input
                                        type="text"
                                        value={lrGrConsignment}
                                        onChange={(e) => setLrGrConsignment(e.target.value)}
                                        disabled={false}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"

                                    />
                                </div>
                            </div>
                        </div>

                        {/* Conditional Port Details for Air/Sea */}
                        {(modeOfTransport === 'Air' || modeOfTransport === 'Sea') && (
                            <div className="space-y-6 mt-6">
                                {/* UPTO PORT Section */}
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">UPTO PORT</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {/* Col 1 */}
                                        <div className="space-y-4">
                                            {/* Delivery Type */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Delivery Type
                                                </label>
                                                <select
                                                    value={deliveryType}
                                                    onChange={(e) => {
                                                        setDeliveryType(e.target.value);
                                                        // If Courier is selected, disable other fields
                                                        if (e.target.value === 'Courier') {
                                                            setTransporterId('');
                                                            setTransporterName('');
                                                            setVehicleNo('');
                                                        }
                                                    }}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                                >
                                                    <option value="">Select</option>
                                                    <option value="Self">Self</option>
                                                    <option value="Third Party">Third Party</option>
                                                    <option value="Courier">Courier</option>
                                                </select>
                                            </div>

                                            {/* Transporter ID/GSTIN */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Transporter ID/GSTIN
                                                </label>
                                                <input
                                                    type="text"
                                                    value={transporterId}
                                                    onChange={(e) => setTransporterId(e.target.value)}
                                                    disabled={deliveryType === 'Courier'}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                />
                                            </div>

                                            {/* Transporter Name */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Transporter Name
                                                </label>
                                                <input
                                                    type="text"
                                                    value={transporterName}
                                                    onChange={(e) => setTransporterName(e.target.value)}
                                                    disabled={deliveryType === 'Courier'}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                />
                                            </div>
                                        </div>

                                        {/* Col 2 */}
                                        <div className="space-y-4">
                                            {/* Vehicle No. */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Vehicle No.
                                                </label>
                                                <input
                                                    type="text"
                                                    value={vehicleNo}
                                                    onChange={(e) => setVehicleNo(e.target.value)}
                                                    disabled={deliveryType === 'Courier'}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                />
                                            </div>

                                            {/* LR/GR/Consignment */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    LR/GR/Consignment
                                                </label>
                                                <input
                                                    type="text"
                                                    value={lrGrConsignment}
                                                    onChange={(e) => setLrGrConsignment(e.target.value)}
                                                    disabled={false}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                />
                                            </div>
                                        </div>

                                        {/* Col 3 - Upload Document */}
                                        <div className="h-full">
                                            <input
                                                type="file"
                                                id="dispatch-doc-upto"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) setDispatchDocument(file);
                                                }}
                                                className="hidden"
                                                accept=".jpg,.jpeg,.pdf"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => document.getElementById('dispatch-doc-upto')?.click()}
                                                className="w-full h-full min-h-[200px] border-2 border-dashed border-gray-300 hover:border-indigo-500 bg-gray-50 hover:bg-indigo-50/50 text-gray-600 rounded-[4px] transition-colors flex flex-col items-center justify-center gap-2"
                                            >
                                                <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                </svg>
                                                <span className="text-sm font-medium">UPLOAD DOCUMENT</span>
                                                {dispatchDocument && (
                                                    <span className="text-xs mt-2 text-indigo-600 font-medium">✓ {dispatchDocument.name}</span>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* BEYOND PORT Section */}
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">BEYOND PORT</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Shipping Bill No.
                                                </label>
                                                <input
                                                    type="text"
                                                    value={beyondPortShippingBillNo}
                                                    onChange={(e) => setBeyondPortShippingBillNo(e.target.value)}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Shipping Bill Date
                                                </label>
                                                <input
                                                    type="date"
                                                    value={beyondPortShippingBillDate}
                                                    onChange={(e) => setBeyondPortShippingBillDate(e.target.value)}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Ship/Port Code
                                                </label>
                                                <input
                                                    type="text"
                                                    value={beyondPortShipPortCode}
                                                    onChange={(e) => setBeyondPortShipPortCode(e.target.value)}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Origin
                                                </label>
                                                <input
                                                    type="text"
                                                    value={beyondPortOrigin}
                                                    onChange={(e) => setBeyondPortOrigin(e.target.value)}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 mb-2"
                                                    placeholder="City"
                                                />
                                                <input
                                                    type="text"
                                                    value={beyondPortOriginCountry}
                                                    onChange={(e) => setBeyondPortOriginCountry(e.target.value)}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                    placeholder="Country"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Vessel/Flight No.
                                                </label>
                                                <input
                                                    type="text"
                                                    value={beyondPortVesselFlightNo}
                                                    onChange={(e) => setBeyondPortVesselFlightNo(e.target.value)}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Port of Loading
                                                </label>
                                                <input
                                                    type="text"
                                                    value={beyondPortPortOfLoading}
                                                    onChange={(e) => setBeyondPortPortOfLoading(e.target.value)}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Port of Discharge
                                                </label>
                                                <input
                                                    type="text"
                                                    value={beyondPortPortOfDischarge}
                                                    onChange={(e) => setBeyondPortPortOfDischarge(e.target.value)}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Final Destination
                                                </label>
                                                <input
                                                    type="text"
                                                    value={beyondPortFinalDestination}
                                                    onChange={(e) => setBeyondPortFinalDestination(e.target.value)}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 mb-2"
                                                    placeholder="City"
                                                />
                                                <input
                                                    type="text"
                                                    value={beyondPortDestCountry}
                                                    onChange={(e) => setBeyondPortDestCountry(e.target.value)}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                    placeholder="Country"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}


                        {/* Conditional Rail Details */}
                        {modeOfTransport === 'Rail' && (
                            <div className="space-y-6 mt-6">
                                {/* UPTO PORT Section for Rail */}
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">UPTO PORT</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {/* Col 1 */}
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Delivery Type
                                                </label>
                                                <select
                                                    value={deliveryType}
                                                    onChange={(e) => {
                                                        setDeliveryType(e.target.value);
                                                        // If Courier is selected, disable other fields
                                                        if (e.target.value === 'Courier') {
                                                            setTransporterId('');
                                                            setTransporterName('');
                                                            setVehicleNo('');
                                                        }
                                                    }}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                                >
                                                    <option value="">Select</option>
                                                    <option value="Self">Self</option>
                                                    <option value="Third Party">Third Party</option>
                                                    <option value="Courier">Courier</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Transporter ID/GSTIN
                                                </label>
                                                <input
                                                    type="text"
                                                    value={transporterId}
                                                    onChange={(e) => setTransporterId(e.target.value)}
                                                    disabled={deliveryType === 'Courier'}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Transporter Name
                                                </label>
                                                <input
                                                    type="text"
                                                    value={transporterName}
                                                    onChange={(e) => setTransporterName(e.target.value)}
                                                    disabled={deliveryType === 'Courier'}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                />
                                            </div>
                                        </div>

                                        {/* Col 2 */}
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Vehicle No.
                                                </label>
                                                <input
                                                    type="text"
                                                    value={vehicleNo}
                                                    onChange={(e) => setVehicleNo(e.target.value)}
                                                    disabled={deliveryType === 'Courier'}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    LR/GR/Consignment No.
                                                </label>
                                                <input
                                                    type="text"
                                                    value={lrGrConsignment}
                                                    onChange={(e) => setLrGrConsignment(e.target.value)}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                />
                                            </div>
                                        </div>

                                        {/* Col 3 - Upload Document */}
                                        <div className="h-full">
                                            <input
                                                type="file"
                                                id="dispatch-doc-rail"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) setDispatchDocument(file);
                                                }}
                                                className="hidden"
                                                accept=".jpg,.jpeg,.pdf"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => document.getElementById('dispatch-doc-rail')?.click()}
                                                className="w-full h-full min-h-[200px] border-2 border-dashed border-gray-300 hover:border-indigo-500 bg-gray-50 hover:bg-indigo-50/50 text-gray-600 rounded-[4px] transition-colors flex flex-col items-center justify-center gap-2"
                                            >
                                                <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                </svg>
                                                <span className="text-sm font-medium">UPLOAD DOCUMENT</span>
                                                {dispatchDocument && (
                                                    <span className="text-xs mt-2 text-indigo-600 font-medium">✓ {dispatchDocument.name}</span>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* BEYOND PORT Section for Rail */}
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">BEYOND PORT</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Railway Receipt No.
                                                </label>
                                                <input
                                                    type="text"
                                                    value={railBeyondPortRailwayReceiptNo}
                                                    onChange={(e) => setRailBeyondPortRailwayReceiptNo(e.target.value)}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Railway Receipt Date
                                                </label>
                                                <input
                                                    type="date"
                                                    value={railBeyondPortRailwayReceiptDate}
                                                    onChange={(e) => setRailBeyondPortRailwayReceiptDate(e.target.value)}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Origin
                                                </label>
                                                <input
                                                    type="text"
                                                    value={railBeyondPortOrigin}
                                                    onChange={(e) => setRailBeyondPortOrigin(e.target.value)}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 mb-2"
                                                    placeholder="City"
                                                />
                                                <input
                                                    type="text"
                                                    value={railBeyondPortOriginCountry}
                                                    onChange={(e) => setRailBeyondPortOriginCountry(e.target.value)}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                    placeholder="Country"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    FNR No.
                                                </label>
                                                <input
                                                    type="text"
                                                    value={railBeyondPortFnrNo}
                                                    onChange={(e) => setRailBeyondPortFnrNo(e.target.value)}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Station of Loading
                                                </label>
                                                <input
                                                    type="text"
                                                    value={railBeyondPortStationOfLoading}
                                                    onChange={(e) => setRailBeyondPortStationOfLoading(e.target.value)}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Station of Discharge
                                                </label>
                                                <input
                                                    type="text"
                                                    value={railBeyondPortStationOfDischarge}
                                                    onChange={(e) => setRailBeyondPortStationOfDischarge(e.target.value)}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Final Destination
                                                </label>
                                                <input
                                                    type="text"
                                                    value={railBeyondPortFinalDestination}
                                                    onChange={(e) => setRailBeyondPortFinalDestination(e.target.value)}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 mb-2"
                                                    placeholder="City"
                                                />
                                                <input
                                                    type="text"
                                                    value={railBeyondPortDestCountry}
                                                    onChange={(e) => setRailBeyondPortDestCountry(e.target.value)}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                    placeholder="Country"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}


                        {/* Action Buttons */}
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => setActiveTab('einvoice')}
                                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[4px] transition-colors flex items-center gap-2 font-medium"
                            >
                                NEXT
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'einvoice' && (
                    <div className="space-y-6">
                        {/* E-way Bill Entries */}
                        {ewayValidationEntries.map((entry, index) => (
                            <div key={entry.id} className="border-b border-gray-300 pb-6 mb-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold text-gray-800">
                                        E-way Bill {ewayValidationEntries.length > 1 ? `#${index + 1}` : ''}
                                    </h3>
                                    {ewayValidationEntries.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveEwayEntry(entry.id)}
                                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                    {/* Left Column */}
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Eway Bill - Available
                                            </label>

                                            <div className="flex gap-4">
                                                <button
                                                    type="button"
                                                    onClick={() => handleEwayEntryChange(entry.id, 'available', 'Yes')}
                                                    className={`flex-1 px-4 py-2 border rounded-[4px] transition-colors ${entry.available === 'Yes'
                                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                                        }`}
                                                >
                                                    Yes
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleEwayEntryChange(entry.id, 'available', 'No')}
                                                    className={`flex-1 px-4 py-2 border rounded-[4px] transition-colors ${entry.available === 'No'
                                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                                        }`}
                                                >
                                                    No
                                                </button>
                                            </div>

                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Eway Bill No.
                                            </label>
                                            <input
                                                type="text"
                                                value={entry.ewayBillNo}
                                                onChange={(e) => handleEwayEntryChange(entry.id, 'ewayBillNo', e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Eway Bill Date
                                            </label>
                                            <input
                                                type="date"
                                                value={entry.date}
                                                onChange={(e) => handleEwayEntryChange(entry.id, 'date', e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>
                                    </div>

                                    {/* Right Column */}
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Validity Period
                                            </label>
                                            <input
                                                type="text"
                                                value={entry.validityPeriod}
                                                onChange={(e) => handleEwayEntryChange(entry.id, 'validityPeriod', e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Distance (KM)
                                            </label>
                                            <input
                                                type="text"
                                                value={entry.distance}
                                                onChange={(e) => handleEwayEntryChange(entry.id, 'distance', e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <h3 className="text-lg font-semibold text-gray-800 mb-4">Extended E-way Bill</h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Left Column */}
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Extension Date
                                            </label>
                                            <input
                                                type="date"
                                                value={entry.extensionDate}
                                                onChange={(e) => handleEwayEntryChange(entry.id, 'extensionDate', e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Extended EWB No.
                                            </label>
                                            <input
                                                type="text"
                                                value={entry.extendedEwbNo}
                                                onChange={(e) => handleEwayEntryChange(entry.id, 'extendedEwbNo', e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Extension Reason
                                            </label>
                                            <input
                                                type="text"
                                                value={entry.extensionReason}
                                                onChange={(e) => handleEwayEntryChange(entry.id, 'extensionReason', e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                From Place
                                            </label>
                                            <input
                                                type="text"
                                                value={entry.fromPlace}
                                                onChange={(e) => handleEwayEntryChange(entry.id, 'fromPlace', e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>
                                    </div>

                                    {/* Right Column */}
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Remaining Distance
                                            </label>
                                            <input
                                                type="text"
                                                value={entry.remainingDistance}
                                                onChange={(e) => handleEwayEntryChange(entry.id, 'remainingDistance', e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                New Validity
                                            </label>
                                            <input
                                                type="text"
                                                value={entry.newValidity}
                                                onChange={(e) => handleEwayEntryChange(entry.id, 'newValidity', e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Updated Vehicle No.
                                            </label>
                                            <input
                                                type="text"
                                                value={entry.updatedVehicleNo}
                                                onChange={(e) => handleEwayEntryChange(entry.id, 'updatedVehicleNo', e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        <div className="pb-6">
                            <button
                                type="button"
                                onClick={handleAddEwayEntry}
                                className="px-4 py-2 bg-blue-50 text-indigo-600 hover:bg-blue-100 rounded-[4px] font-medium flex items-center gap-2 border border-blue-200"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Add E-way Bill
                            </button>
                        </div>

                        {/* E-Invoice Section */}
                        <div className="pb-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">E-Invoice</h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        IRN
                                    </label>
                                    <input
                                        type="text"
                                        value={irn}
                                        onChange={(e) => setIrn(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Ack. No.
                                    </label>
                                    <input
                                        type="text"
                                        value={ackNo}
                                        onChange={(e) => setAckNo(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-end gap-4 pt-4">
                            <button
                                type="button"
                                onClick={handlePost}
                                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[4px] transition-colors font-medium"
                            >
                                Post & Close
                            </button>
                            <button
                                type="button"
                                onClick={handlePost}
                                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[4px] transition-colors font-medium"
                            >
                                Post & Print/Email
                            </button>

                        </div>
                    </div>
                )}
            </div>
            {/* Issue Slip Modal */}
            {
                isIssueSlipModalOpen && (
                    <CreateIssueSlipModal
                        onClose={() => setIsIssueSlipModalOpen(false)}
                        onSave={async (data) => {
                            try {

                                const response = await apiService.createInventoryOperationOutward(data);

                                setOutwardSlipNo(response.outward_slip_no);
                                showSuccess('Issue Slip Created Successfully!');

                            } catch (error) {
                                console.error("Failed to create Issue Slip");
                                showError("Failed to create Issue Slip. Please check inputs.");

                            }
                        }}
                    />
                )
            }
        </div>
    );
};

export default SalesVoucher;


