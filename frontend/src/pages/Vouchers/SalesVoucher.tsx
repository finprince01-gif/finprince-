import React, { useState, useMemo, useRef } from 'react';
import { apiService } from '../../services/api';
import { httpClient } from '../../services/httpClient';
import { showError, showSuccess } from '../../utils/toast';
import CreateIssueSlipModal from '../../components/CreateIssueSlipModal';
import SearchableDropdown from '../../components/SearchableDropdown';
import AddNewCustomerModal from '../../components/AddNewCustomerModal';

import { INDIA_STATE_CODES, GST_INVOICE_TYPES, EXPORT_TYPES } from '../../utils/gstConstants';
import { SALES_VOUCHER_COLUMNS, SALES_VOUCHER_HEADER_LABELS } from '../../constants/salesVoucherColumns';

import { ExtractedInvoiceData, CompanyDetails } from '../../types';

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
    sourceDoc?: string;
    selected?: boolean;
}

interface SalesVoucherProps {
    prefilledData?: ExtractedInvoiceData | null;
    clearPrefilledData?: () => void;
    isLimitReached?: boolean;
    onLimitReached?: () => void;
    customers?: any[];
    companyDetails: CompanyDetails;
}

const SalesVoucher: React.FC<SalesVoucherProps> = ({
    prefilledData,
    clearPrefilledData,
    isLimitReached,
    onLimitReached,
    customers = [],
    companyDetails
}) => {
    const [activeTab, setActiveTab] = useState('invoice');
    const [isIssueSlipModalOpen, setIsIssueSlipModalOpen] = useState(false);
    const [inventoryItems, setInventoryItems] = useState<any[]>([]);
    const [serviceItems, setServiceItems] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [ledgers, setLedgers] = useState<any[]>([]);
    const [hierarchy, setHierarchy] = useState<any[]>([]);
    const [units, setUnits] = useState<any[]>([]);



    React.useEffect(() => {
        const fetchAllData = async () => {
            try {
                const [items, services, locs, ledgersData, hierarchyData, unitsData] = await Promise.all([
                    apiService.getStockItems(),
                    httpClient.get<any[]>('/api/services/?is_active=true').catch(() => []),
                    apiService.getInventoryLocations().catch(() => []),
                    apiService.getLedgers().catch(() => []),
                    apiService.getHierarchy().catch(() => []),
                    apiService.getUnits().catch(() => [])
                ]);
                setInventoryItems(items);
                setServiceItems(services);
                setLocations(locs);
                setLedgers(ledgersData);
                setHierarchy(hierarchyData);
                setUnits(unitsData || []);
            } catch (error) {
                console.error('Error fetching inventory data:', error);
            }
        };
        fetchAllData();
    }, []);

    const itemCodeOptions = useMemo(() => {
        const invCodes = inventoryItems.map(item => item.item_code).filter(Boolean);
        const srvCodes = serviceItems.map(item => item.serviceCode || item.service_code).filter(Boolean);
        return Array.from(new Set([...invCodes, ...srvCodes]));
    }, [inventoryItems, serviceItems]);

    const itemNameOptions = useMemo(() => {
        const invNames = inventoryItems.map(item => item.name || item.item_name).filter(Boolean);
        const srvNames = serviceItems.map(item => item.serviceName || item.service_name).filter(Boolean);
        return Array.from(new Set([...invNames, ...srvNames]));
    }, [inventoryItems, serviceItems]);

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

    const uomOptions = useMemo(() => {
        // Use symbol if available, fallback to name
        return Array.from(new Set(units.map(u => u.symbol || u.name))).filter(Boolean);
    }, [units]);

    const getRowUomOptions = (row: ItemRow) => {
        if (!row.itemCode && !row.itemName) return uomOptions;

        const item = inventoryItems.find(i =>
            (row.itemCode && i.item_code === row.itemCode) ||
            (row.itemName && (i.name === row.itemName || i.item_name === row.itemName))
        ) || serviceItems.find(i =>
            (row.itemCode && (i.serviceCode === row.itemCode || i.service_code === row.itemCode)) ||
            (row.itemName && (i.serviceName === row.itemName || i.service_name === row.itemName))
        );

        if (!item) return uomOptions;

        const opts = [];
        // Primary Unit
        const pUnit = item.uom || item.unit || item.base_unit;
        if (pUnit) opts.push(pUnit);

        // Alternate Unit
        const aUnit = item.alternate_uom || item.alternate_unit || item.alternateUnit || item.alternative_unit;
        if (aUnit) opts.push(aUnit);

        const uniqueOpts = Array.from(new Set(opts.filter(Boolean)));
        return uniqueOpts.length > 0 ? uniqueOpts : uomOptions;
    };

    const formatDateForInput = (dateString: string): string => {
        if (!dateString) return '';
        const parts = dateString.split(/[-\/]/);
        if (parts.length === 3) {
            if (parts[0].length === 4) {
                return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
            }
            if (parts[2].length === 4) {
                return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
        }
        try {
            const d = new Date(dateString);
            if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        } catch { /* ignore */ }
        return '';
    };

    // Populate from AI Extraction
    React.useEffect(() => {
        if (prefilledData) {

            setDate(prefilledData.invoiceDate || new Date().toISOString().split('T')[0]);
            setSalesInvoiceNo(prefilledData.invoiceNumber || '');
            setCustomerName(prefilledData.sellerName || ''); // Maps Seller/Party -> Customer Name
            if (prefilledData.gstin) setGstin(prefilledData.gstin);
            if (prefilledData.placeOfSupply) setPlaceOfSupply(prefilledData.placeOfSupply);
            if (prefilledData.invoiceType) setInvoiceType(prefilledData.invoiceType);
            if (prefilledData.currency) setCustomerBillingCurrency(prefilledData.currency);

            if (prefilledData.billToAddress1) setBillToAddress1(prefilledData.billToAddress1);
            if (prefilledData.billToAddress2) setBillToAddress2(prefilledData.billToAddress2);
            if (prefilledData.billToCity) setBillToCity(prefilledData.billToCity);
            if (prefilledData.billToState) setBillToState(prefilledData.billToState);
            if (prefilledData.billToPincode) setBillToPincode(prefilledData.billToPincode);
            if (prefilledData.billToCountry) setBillToCountry(prefilledData.billToCountry);

            // Summary mapping
            if (prefilledData.stateCess) setPaymentStateCess(prefilledData.stateCess);
            if (prefilledData.tdsIncomeTax) setPaymentTdsIncomeTax(prefilledData.tdsIncomeTax);
            if (prefilledData.tdsGst) setPaymentTdsGst(prefilledData.tdsGst);
            if (prefilledData.advanceAmount) setPaymentAdvance(prefilledData.advanceAmount);
            if (prefilledData.payable) setPaymentPayable(prefilledData.payable);
            if (prefilledData.postingNote) setPaymentPostingNote(prefilledData.postingNote);

            // Dispatch mapping
            if (prefilledData.dispatchFrom) setDispatchFrom(prefilledData.dispatchFrom);
            if (prefilledData.modeOfTransport) setModeOfTransport(prefilledData.modeOfTransport);
            if (prefilledData.dispatchDate) setDispatchDate(formatDateForInput(prefilledData.dispatchDate) || '');
            if (prefilledData.dispatchTime) setDispatchTime(prefilledData.dispatchTime);
            if (prefilledData.transporterId) setTransporterId(prefilledData.transporterId);
            if (prefilledData.transporterName) setTransporterName(prefilledData.transporterName);
            if (prefilledData.vehicleNo) setVehicleNo(prefilledData.vehicleNo);
            if (prefilledData.lrGrConsignment) setLrGrConsignment(prefilledData.lrGrConsignment);

            // Map items
            if (prefilledData.lineItems && prefilledData.lineItems.length > 0) {
                const newRows = prefilledData.lineItems.map((item, index) => {
                    const qty = item.quantity || 1;
                    const rate = item.rate || 0;
                    const taxable = item.taxableValue || (qty * rate);

                    // Check if we have extracted taxes (even if 0)
                    const hasExtractedTax = (
                        item.cgst !== undefined ||
                        item.sgst !== undefined ||
                        item.igst !== undefined ||
                        item.cess !== undefined
                    );

                    const cgst = hasExtractedTax ? (item.cgst || 0) : (taxable * 0.09);
                    const sgst = hasExtractedTax ? (item.sgst || 0) : (taxable * 0.09);
                    const igst = hasExtractedTax ? (item.igst || 0) : 0;
                    const cess = item.cess || 0;
                    const invVal = item.amount || (taxable + cgst + sgst + igst + cess);

                    return {
                        id: index + 1,
                        itemCode: '',
                        itemName: item.itemDescription || '',
                        salesLedger: '',
                        description: item.itemDescription || '',
                        hsnSac: item.hsnCode || '',
                        qty: qty.toString(),
                        uom: item.uom || '',
                        itemRate: rate.toString(),
                        taxableValue: taxable.toFixed(2),
                        igst: igst.toFixed(2),
                        cgst: cgst.toFixed(2),
                        sgst: sgst.toFixed(2),
                        cess: cess.toFixed(2),
                        invoiceValue: invVal.toFixed(2),
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
    const [selectedSeriesId, setSelectedSeriesId] = useState<number | null>(null);
    // Ref so that handleVoucherNameChange always sees the latest configs (avoids stale closure)
    const salesVoucherConfigsRef = React.useRef<any[]>([]);

    // Helper: format number from config (mirrors backend _format_invoice_number logic)
    const formatInvoiceNo = (config: any): string => {
        const num = config.current_number || config.start_from || 1;
        const start = config.start_from || 1;
        const digits = config.required_digits || 4;
        const prefix = config.prefix || '';
        const suffix = config.suffix || '';

        if (suffix && /^\d+$/.test(suffix)) {
            // Numeric suffix: treat as part of the sequential number
            // e.g. start=1, digits=4, suffix='24' → base=000124=124, offset=num-start
            const baseStr = String(start).padStart(digits, '0') + suffix;
            const base = parseInt(baseStr, 10);
            const offset = num - start;
            const fullNum = base + offset;
            const totalDigits = digits + suffix.length;
            return `${prefix}${String(fullNum).padStart(totalDigits, '0')}`;
        } else {
            // Non-numeric suffix: pad number then append suffix
            return `${prefix}${String(num).padStart(digits, '0')}${suffix}`;
        }
    };

    // Helper: fetch next number from backend and update display
    const refreshInvoiceNumber = React.useCallback(async (seriesId: number, latestConfigs?: any[]) => {
        try {
            const res: any = await httpClient.get(`/api/masters/master-voucher-sales/${seriesId}/next-number/`);
            if (res && res.invoice_number) {
                setSalesInvoiceNo(res.invoice_number);
            }
        } catch {
            // Fall back to local config calculation
            const configs = latestConfigs || salesVoucherConfigs;
            const config = configs.find((c: any) => c.id === seriesId);
            if (config) setSalesInvoiceNo(formatInvoiceNo(config));
        }
    }, [salesVoucherConfigs]);

    // Helper: increment backend counter after successful save, return next number
    const incrementInvoiceNumber = React.useCallback(async (seriesId: number): Promise<string> => {
        try {
            const res: any = await httpClient.post(`/api/masters/master-voucher-sales/${seriesId}/increment-number/`, {});
            if (res && res.next_invoice_number) {
                // Update local configs cache with new current_number
                setSalesVoucherConfigs(prev => prev.map(c =>
                    c.id === seriesId ? { ...c, current_number: res.new_current_number } : c
                ));
                setSalesInvoiceNo(res.next_invoice_number);
                return res.assigned_number;
            }
        } catch (e) {
            console.error('Failed to increment invoice number', e);
        }
        return salesInvoiceNo;
    }, [salesInvoiceNo]);

    React.useEffect(() => {
        const fetchSalesConfigs = async () => {
            try {
                const data = await httpClient.get<any[]>('/api/masters/master-voucher-sales/').catch(() => []);
                if (Array.isArray(data) && data.length > 0) {
                    setSalesVoucherConfigs(data);
                    if (!voucherName) {
                        if (data.length === 1) {
                            const first = data[0];
                            setVoucherName(first.voucher_name);
                            setSelectedSeriesId(first.id);
                            // Get accurate next number from backend
                            if (first.enable_auto_numbering) {
                                try {
                                    const res: any = await httpClient.get(`/api/masters/master-voucher-sales/${first.id}/next-number/`);
                                    if (res?.invoice_number) setSalesInvoiceNo(res.invoice_number);
                                } catch {
                                    setSalesInvoiceNo(formatInvoiceNo(first));
                                }
                            }
                        } else {
                            // Empty selection when there are multiple choices
                            setVoucherName('');
                            setSelectedSeriesId(null);
                            setSalesInvoiceNo('');
                        }
                    }
                } else {
                    setSalesVoucherConfigs([{ voucher_name: 'Main' }]);
                    if (!voucherName) {
                        setVoucherName('');
                        setSalesInvoiceNo('');
                    }
                }
            } catch (e) {
                setSalesVoucherConfigs([{ voucher_name: 'Main' }]);
                if (!voucherName) {
                    setVoucherName('');
                    setSalesInvoiceNo('');
                }
            }
        };
        fetchSalesConfigs();
    }, []);

    // Keep ref in sync with state so handleVoucherNameChange never has a stale closure
    React.useEffect(() => {
        salesVoucherConfigsRef.current = salesVoucherConfigs;
    }, [salesVoucherConfigs]);

    // When user changes the selected series — uses ref to avoid stale closure
    const handleVoucherNameChange = React.useCallback(async (name: string) => {
        setVoucherName(name);
        // Always read from ref so we have the latest list
        const configs = salesVoucherConfigsRef.current;
        const config = configs.find((c: any) =>
            c.voucher_name?.toLowerCase() === name?.toLowerCase()
        );
        if (config) {
            setSelectedSeriesId(config.id);
            // Always fetch from backend regardless of enable_auto_numbering
            try {
                const res: any = await httpClient.get(`/api/masters/master-voucher-sales/${config.id}/next-number/`);
                if (res?.invoice_number) {
                    setSalesInvoiceNo(res.invoice_number);
                } else {
                    setSalesInvoiceNo(formatInvoiceNo(config));
                }
            } catch {
                setSalesInvoiceNo(formatInvoiceNo(config));
            }
        } else {
            // Series not found in config (manual entry or no auto-numbering)
            setSalesInvoiceNo('');
        }
    }, []); // empty deps — reads from ref, never stale


    const [outwardSlipNo, setOutwardSlipNo] = useState('');
    const [outwardSlipOptions, setOutwardSlipOptions] = useState<string[]>([]);
    const [outwardSlipsData, setOutwardSlipsData] = useState<any[]>([]);

    // Fetch Outward Slips
    React.useEffect(() => {
        const fetchOutwardSlips = async () => {
            try {
                const data = await httpClient.get<any[]>('/api/inventory/operations/outward/').catch(() => []);
                if (Array.isArray(data)) {
                    setOutwardSlipsData(data);
                    const options = data.map(item => item.outward_slip_no || item.slip_no || item.id || '').filter(Boolean);
                    setOutwardSlipOptions([...new Set(options)]);
                }
            } catch (e) {
                console.error('Failed to fetch outward slips', e);
            }
        };
        fetchOutwardSlips();
    }, []);

    const [customerName, setCustomerName] = useState('');
    const [customerBranch, setCustomerBranch] = useState('');
    const [masterCustomers, setMasterCustomers] = useState<any[]>([]);
    const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
    const [customerBillingCurrency, setCustomerBillingCurrency] = useState('');
    const [customerTcsRate, setCustomerTcsRate] = useState<number>(0); // TCS rate as decimal (e.g. 0.01 for 1%)
    const [customerTdsRate, setCustomerTdsRate] = useState<number>(0); // TDS rate as decimal
    const [customerGstTdsApplicable, setCustomerGstTdsApplicable] = useState(false);
    const [customerTdsEnabled, setCustomerTdsEnabled] = useState(false);
    const [customerTcsEnabled, setCustomerTcsEnabled] = useState(false);
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
        const allCustomers = [...(customers || []), ...(masterCustomers || [])];
        return Array.from(new Set(allCustomers.map(c => c.customer_name).filter(Boolean)));
    }, [customers, masterCustomers]);

    // Branch options: Reference Names from the selected customer's GST branches
    const branchOptions = useMemo(() => {
        if (!customerName) return [];
        const allCustomers = [...(customers || []), ...(masterCustomers || [])];
        const customer = allCustomers.find(c => c.customer_name === customerName);
        if (!customer) return [];
        const branches: any[] = customer.gst_details?.branches || [];
        return branches
            .map((b: any) => b.defaultRef || b.referenceName || '')
            .filter(Boolean);
    }, [customerName, customers, masterCustomers]);

    // Show GSTINs only for the selected customer
    const gstinOptions = useMemo(() => {
        if (!customerName) return [];

        const allCustomers = [...(customers || []), ...(masterCustomers || [])];
        const customer = allCustomers.find(c => c.customer_name === customerName);
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
    }, [customerName, customers, masterCustomers]);

    // Handle Customer Selection
    const handleCustomerChange = (val: string) => {
        setCustomerName(val);
        setCustomerBranch(''); // reset branch on customer change
        setCustomerBillingCurrency('');

        const allCustomers = [...(customers || []), ...(masterCustomers || [])];
        const customer = allCustomers.find(c => c.customer_name === val);
        if (customer) {
            const branches: any[] = customer.gst_details?.branches || [];
            const refs = branches.map((b: any) => b.defaultRef || b.referenceName || '').filter(Boolean);

            // ── Auto-select branch if only one exists ──
            if (refs.length === 1) {
                setCustomerBranch(refs[0]);
                const branch = branches[0];
                setBillToAddress1(branch.addressLine1 || branch.address || '');
                setBillToAddress2(branch.addressLine2 || '');
                setBillToAddress3(branch.addressLine3 || '');
                setBillToCity(branch.city || '');
                setBillToPincode(branch.pincode || '');
                setBillToState(branch.state || '');
                setBillToCountry(branch.country || 'India');
                if (branch.contactNumber) setContact(branch.contactNumber);
                if (branch.gstin) setGstin(branch.gstin);
            }

            // ── GSTIN auto-select ──
            const allGstins: string[] = [];
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

            if (uniqueGstins.length === 1) {
                setGstin(uniqueGstins[0]);

                // Auto-fill address if branch not already auto-selected above
                if (refs.length !== 1) {
                    const selectedGstin = uniqueGstins[0];
                    const isUnregistered = selectedGstin === 'Unregistered';

                    if (branches.length === 1 || (isUnregistered && branches.length > 0)) {
                        const branch = branches[0];
                        setContact(branch.contactNumber || customer.contact_number || '');
                        if (branch.addressLine1 || branch.city || branch.state) {
                            setBillToAddress1(branch.addressLine1 || '');
                            setBillToAddress2(branch.addressLine2 || '');
                            setBillToAddress3(branch.addressLine3 || '');
                            setBillToCity(branch.city || '');
                            setBillToPincode(branch.pincode || '');
                            setBillToState(branch.state || '');
                            setBillToCountry(branch.country || 'India');
                        } else if (branch.address) {
                            setBillToAddress1(branch.address);
                            setBillToAddress2(''); setBillToAddress3(''); setBillToCity('');
                            setBillToState(''); setBillToPincode(''); setBillToCountry('India');
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
                        } catch (e) { console.error('Error parsing customer address', e); }
                    }
                }
            } else {
                // Multiple GSTINs: reset GSTIN, user must choose from dropdown
                if (refs.length !== 1) setGstin('');
            }

            // ── Terms & Conditions ──
            const parts: string[] = [];
            if (customer.credit_period) parts.push(`Credit Period: ${customer.credit_period}`);
            if (customer.credit_terms) parts.push(`Credit Terms: ${customer.credit_terms}`);
            if (customer.penalty_terms) parts.push(`Penalty Terms: ${customer.penalty_terms}`);
            if (customer.delivery_terms) parts.push(`Delivery Terms: ${customer.delivery_terms}`);
            if (customer.warranty_details) parts.push(`Warranty / Guarantee: ${customer.warranty_details}`);
            if (customer.force_majeure) parts.push(`Force Majeure: ${customer.force_majeure}`);
            if (customer.dispute_terms) parts.push(`Dispute & Redressal: ${customer.dispute_terms}`);
            setTermsConditions(parts.length > 0 ? parts.join('\n\n') : '');
            setMasterTermsData(customer);

            if (customer.billing_currency) {
                setCustomerBillingCurrency(customer.billing_currency);
            }

            // ── TCS Rate from Customer Master ──
            // Map TCS section name → rate (decimal)
            const TCS_RATE_MAP: Record<string, number> = {
                'Sale of Scrap, Alcoholic Liquor, Minerals': 0.01,  // 1%
                'Sale of Tendu Leaves': 0.05,                        // 5%
                'Sale of Forest Produce': 0.02,                      // 2%
                'Sale of Timber': 0.02,                              // 2%
                'Sale of Motor Vehicles': 0.01,                      // 1%
                'Sale of Specified Luxury Goods': 0.01,              // 1%
            };
            const tcsSection = customer.tcs_section || '';
            // tcs_section is stored as "Section 206C(1)|Sale of Tendu Leaves"
            const tcsSectionName = tcsSection.includes('|') ? tcsSection.split('|')[1] : tcsSection;
            const tcsRateVal = TCS_RATE_MAP[tcsSectionName] ?? 0;
            setCustomerTcsRate(tcsRateVal);

            // ── TDS Rate from Customer Master ──
            const TDS_RATE_MAP: Record<string, number> = {
                'Contracts- Individual/HUF': 0.01,
                'Contracts- Others': 0.02,
                'Commission/Brokerage': 0.02,
                'Rent- Land, Building, Furniture & fitting': 0.02,
                'Rent- Plant & Machinery, Equipment': 0.10,
                'Technical Services': 0.02,
                'Professional Services': 0.10,
                'Director\'s Remuneration': 0.10,
                'Purchase of Goods': 0.001, // 0.10%
                'Interest other than interest on securities': 0.10,
                'Benefit or Perquisite': 0.10,
                'Immovable Property Transfer': 0.01,
                'Rent by Individual or HUF': 0.02,
                'Joint Development Agreements': 0.10,
                'Contractors & Professionals': 0.02,
                'E-Commerce': 0.01,
            };
            const tdsSection = customer.tds_section || '';
            const tdsSectionName = tdsSection.includes('|') ? tdsSection.split('|')[1] : tdsSection;
            const tdsRateVal = TDS_RATE_MAP[tdsSectionName] ?? 0;
            setCustomerTdsRate(tdsRateVal);

            // ── GST TDS Configuration from Customer Master ──
            console.log('Customer TDS Data:', {
                name: val,
                gst_tds_applicable: customer.gst_tds_applicable,
                tds_enabled: customer.tds_enabled,
                tcs_enabled: customer.tcs_enabled
            });
            setCustomerGstTdsApplicable(!!customer.gst_tds_applicable);
            setCustomerTdsEnabled(!!customer.tds_enabled);
            setCustomerTcsEnabled(!!customer.tcs_enabled);
        } else {
            setTermsConditions('');
            setMasterTermsData(null);
            setCustomerTcsRate(0);
            setCustomerTdsRate(0);
            setCustomerGstTdsApplicable(false);
            setCustomerTdsEnabled(false);
            setCustomerTcsEnabled(false);
        }
    };

    // Handle Branch selection – auto-fill address from that branch
    const handleBranchChange = (branchRef: string) => {
        setCustomerBranch(branchRef);
        const allCustomers = [...(customers || []), ...(masterCustomers || [])];
        const customer = allCustomers.find(c => c.customer_name === customerName);
        if (!customer) return;
        const branches: any[] = customer.gst_details?.branches || [];
        const branch = branches.find((b: any) => (b.defaultRef || b.referenceName || '') === branchRef);
        if (!branch) return;
        // Fill billing address from branch
        setBillToAddress1(branch.addressLine1 || branch.address || '');
        setBillToAddress2(branch.addressLine2 || '');
        setBillToAddress3(branch.addressLine3 || '');
        setBillToCity(branch.city || '');
        setBillToPincode(branch.pincode || '');
        setBillToState(branch.state || '');
        setBillToCountry(branch.country || 'India');
        if (branch.contactNumber) setContact(branch.contactNumber);
        // Also auto-fill GSTIN if registered branch
        if (branch.gstin) setGstin(branch.gstin);
    };


    const handleGstinChange = (val: string) => {
        setGstin(val);
        const allCustomers = [...(customers || []), ...(masterCustomers || [])];
        const customer = allCustomers.find(c => c.customer_name === customerName);
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
    const [exportType, setExportType] = useState('EXWP');
    const [supportingDocument, setSupportingDocument] = useState<File | null>(null);
    const [salesPreviewUrl, setSalesPreviewUrl] = useState<string | null>(null);
    const [isSalesPreviewModalOpen, setIsSalesPreviewModalOpen] = useState(false);

    // Handle object URL creation and cleanup
    React.useEffect(() => {
        if (supportingDocument) {
            const url = URL.createObjectURL(supportingDocument);
            setSalesPreviewUrl(url);
            return () => URL.revokeObjectURL(url);
        } else {
            setSalesPreviewUrl(null);
        }
    }, [supportingDocument]);

    // GST-Compliant Fields
    const [placeOfSupply, setPlaceOfSupply] = useState(''); // State code (01-38)
    const [reverseCharge, setReverseCharge] = useState('N'); // Y or N

    // Auto-Populate Place of Supply from Bill To State (Editable)
    React.useEffect(() => {
        if (billToState) {
            const stateStr = billToState.trim().toLowerCase();
            const matchedState = INDIA_STATE_CODES.find(
                s => s.name.toLowerCase() === stateStr || s.code === billToState.trim()
            );
            if (matchedState) {
                setPlaceOfSupply(matchedState.code);
            }
        }
    }, [billToState, setPlaceOfSupply]);
    const [invoiceType, setInvoiceType] = useState('Regular'); // Regular, SEZ with payment, etc.
    const [gstExportType, setGstExportType] = useState('WPAY'); // WPAY or WOPAY
    const [portCode, setPortCode] = useState(''); // 6-digit code for exports
    const [shippingBillNumber, setShippingBillNumber] = useState('');
    const [shippingBillDate, setShippingBillDate] = useState('');
    const [ecommerceGstin, setEcommerceGstin] = useState('');
    const [isEcommerceSales, setIsEcommerceSales] = useState('No');
    const [ecommerceOperator, setEcommerceOperator] = useState('');

    const ecommerceOperatorOptions = useMemo(() => {
        const defaults = ['Amazon', 'Flipkart', 'Myntra', 'Meesho', 'GlowRoad', 'JioMart'];
        const ledgerNames = ledgers.map(l => l.name);
        return Array.from(new Set([...defaults, ...ledgerNames])).sort();
    }, [ledgers]);

    const handleEcommerceOperatorChange = (val: string) => {
        setEcommerceOperator(val);
        const ledger = ledgers.find(l => l.name === val);
        if (ledger && ledger.gstin) {
            setEcommerceGstin(ledger.gstin);
        }
    };

    // --- TAX HELPERS ---
    const getPlaceOfSupplyName = (code: string) => {
        const state = INDIA_STATE_CODES.find(s => s.code === code);
        return state ? state.name : '';
    };

    const placeOfSupplyName = useMemo(() => getPlaceOfSupplyName(placeOfSupply), [placeOfSupply]);

    const isTaxHidden = useMemo(() => {
        return invoiceType === 'SEZ without payment' || invoiceType === 'Export without payment';
    }, [invoiceType]);

    const isCessHidden = useMemo(() => {
        return invoiceType === 'Regular' || invoiceType === 'SEZ with payment' || invoiceType === 'Export with payment' || invoiceType === 'Deemed Export' || isTaxHidden;
    }, [invoiceType, isTaxHidden]);

    const stateType = useMemo(() => {
        const lowerType = invoiceType.toLowerCase();
        if (lowerType.includes('export') && lowerType !== 'deemed export') return 'export';
        if (placeOfSupplyName.toLowerCase() !== (companyDetails?.state || '').toLowerCase()) return 'other';
        return 'within';
    }, [invoiceType, placeOfSupplyName, companyDetails?.state]);

    const isInterState = useMemo(() => {
        if (invoiceType === 'SEZ with payment' || invoiceType === 'Export with payment') return true;
        return stateType === 'export' || placeOfSupplyName.toLowerCase() !== (companyDetails?.state || '').toLowerCase();
    }, [stateType, placeOfSupplyName, companyDetails?.state, invoiceType]);

    // Item & Tax Details State
    const [salesOrderNos, setSalesOrderNos] = useState<string[]>([]);
    const [salesDocDropdownOpen, setSalesDocDropdownOpen] = useState(false);
    const [salesOrders, setSalesOrders] = useState<any[]>([]);
    const [salesQuotations, setSalesQuotations] = useState<any[]>([]);

    // Color palette for multi-selected sales doc badges
    const SALES_DOC_COLORS = [
        { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-400', dot: 'bg-indigo-500' },
        { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-400', dot: 'bg-emerald-500' },
        { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-400', dot: 'bg-amber-500' },
        { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-400', dot: 'bg-rose-500' },
        { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-400', dot: 'bg-violet-500' },
        { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-400', dot: 'bg-cyan-500' },
        { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-400', dot: 'bg-orange-500' },
        { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-400', dot: 'bg-teal-500' },
    ];
    const getSalesDocColor = (num: string) => {
        const idx = salesOrderNos.indexOf(num);
        return SALES_DOC_COLORS[idx % SALES_DOC_COLORS.length];
    };

    React.useEffect(() => {
        const fetchSalesDocs = async () => {
            try {
                const [soRes, sqGenRes, sqSpecRes, custRes] = await Promise.all([
                    httpClient.get('/api/customerportal/sales-orders/').catch(() => []),
                    httpClient.get('/api/customerportal/sales-quotations-general/').catch(() => []),
                    httpClient.get('/api/customerportal/sales-quotations-specific/').catch(() => []),
                    httpClient.get('/api/customerportal/customer-master/').catch(() => []),
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

    // Close sales doc dropdown on outside click
    React.useEffect(() => {
        if (!salesDocDropdownOpen) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('[data-salesdoc-dropdown]')) {
                setSalesDocDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [salesDocDropdownOpen]);

    const handleSalesDocToggle = async (val: string) => {
        const isAlreadySelected = salesOrderNos.includes(val);

        if (isAlreadySelected) {
            // Deselect: remove from list
            setSalesOrderNos(prev => prev.filter(v => v !== val));

            // Also remove items associated with this document from both tabs
            const removeFunc = (prev: ItemRow[]) => {
                const filtered = prev.filter(row => row.sourceDoc !== val);
                // If all items are removed, add back a blank row to maintain UI
                if (filtered.length === 0) {
                    return [{
                        id: Date.now(),
                        itemCode: '', itemName: '', hsnSac: '', qty: '', uom: '', alternateUnit: '',
                        itemRate: '', taxableValue: '', igst: '', cgst: '', sgst: '', cess: '',
                        invoiceValue: '', salesLedger: '', description: ''
                    }];
                }
                return filtered;
            };
            setItemRows(removeFunc);
            setForeignItemRows(removeFunc);
            return;
        }

        // Select: add to list and load items
        setSalesOrderNos(prev => [...prev, val]);

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
                const convRate = parseFloat(exchangeRate) || 1;

                const newRows: ItemRow[] = itemsToMap.map((item: any, idx: number) => {
                    const qty = parseFloat(item.quantity || item.qty) || 0;
                    const rateFromDoc = parseFloat(item.item_rate || item.price || item.negotiated_price || item.rate) || 0;

                    // For INR tab: Rate = Doc Rate * Exchange Rate
                    const inrRate = rateFromDoc * convRate;
                    const taxableInr = qty * inrRate;

                    const igst = parseFloat(item.igst || item.igst_amount) || 0;
                    const cgst = parseFloat(item.cgst || item.cgst_amount) || 0;
                    const sgst = parseFloat(item.sgst || item.sgst_amount) || 0;
                    const cess = parseFloat(item.cess || item.cess_amount) || 0;
                    const invValInr = taxableInr + igst + cgst + sgst + cess;

                    return {
                        id: Date.now() + idx,
                        itemCode: item.item_code || '',
                        itemName: item.item_name || '',
                        hsnSac: item.hsn_sac || '',
                        qty: qty.toString(),
                        uom: item.uom || '',
                        itemRate: inrRate.toFixed(2),
                        taxableValue: taxableInr.toFixed(2),
                        igst: igst.toFixed(2),
                        cgst: cgst.toFixed(2),
                        sgst: sgst.toFixed(2),
                        cess: cess.toFixed(2),
                        invoiceValue: invValInr.toFixed(2),
                        salesLedger: '',
                        description: item.description || '',
                        alternateUnit: item.alternative_unit || item.alternate_uom || '',
                        sourceDoc: val,
                        selected: true
                    };
                });

                const newForeignRows: ItemRow[] = itemsToMap.map((item: any, idx: number) => {
                    const qty = parseFloat(item.quantity || item.qty) || 0;
                    const rateFromDoc = parseFloat(item.item_rate || item.price || item.negotiated_price || item.rate) || 0;
                    const amtFc = qty * rateFromDoc;

                    return {
                        id: Date.now() + idx,
                        itemCode: item.item_code || '',
                        itemName: item.item_name || '',
                        hsnSac: item.hsn_sac || '',
                        qty: qty.toString(),
                        uom: item.uom || '',
                        itemRate: rateFromDoc.toString(), // Doc rate is treated as FC
                        taxableValue: amtFc.toFixed(2),
                        igst: '0', cgst: '0', sgst: '0', cess: '0',
                        invoiceValue: amtFc.toFixed(2),
                        salesLedger: '',
                        description: item.description || '',
                        alternateUnit: item.alternative_unit || item.alternate_uom || '',
                        sourceDoc: val,
                        selected: true
                    };
                });

                if (newRows.length > 0) {
                    const updateInrFunc = (prev: ItemRow[]) => {
                        const isBlank = prev.length === 1 && !prev[0].itemCode && !prev[0].itemName;
                        return isBlank ? newRows : [...prev, ...newRows];
                    };
                    const updateFcFunc = (prev: ItemRow[]) => {
                        const isBlank = prev.length === 1 && !prev[0].itemCode && !prev[0].itemName;
                        return isBlank ? newForeignRows : [...prev, ...newForeignRows];
                    };
                    setItemRows(updateInrFunc);
                    setForeignItemRows(updateFcFunc);
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

        // Actual transaction records
        const orders = salesOrders.map(o => ({
            id: o.id,
            number: o.so_number || o.order_number || o.number || `Order-${o.id}`,
            type: 'Order',
            customer: getCustomerName(o),
            isTransaction: true
        }));

        const quotations = salesQuotations.map(q => ({
            id: q.id,
            number: q.quote_number || q.quotation_number || q.number || `Quote-${q.id}`,
            type: 'Quotation',
            customer: getCustomerName(q),
            isTransaction: true
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
            description: '',
            selected: true
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
            itemRate: '',
            taxableValue: '',
            igst: '0',
            cgst: '0',
            sgst: '0',
            cess: '0',
            invoiceValue: '',
            salesLedger: '',
            description: '',
            alternateUnit: '',
            selected: true
        }
    ]);

    // Payment Details State
    const [paymentStateCess, setPaymentStateCess] = useState('0.00');
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
    const [outwardSlipError, setOutwardSlipError] = useState('');

    const validateQtyMatch = (): boolean => {
        // This check is only meaningful for export invoices where the
        // Foreign Currency tab is actually used.  For domestic (within / other)
        // invoices the foreignItemRows array holds only blank placeholder rows,
        // so comparing them against real INR rows always causes a false alarm.
        const _foreignTypes = ['Export with payment', 'Export without payment', 'Deemed Export'];
        if (stateType !== 'export' && !_foreignTypes.includes(invoiceType)) return true;

        const activeForeignRows = foreignItemRows.filter(row => row.selected !== false);
        const activeInrRows = itemRows.filter(row => row.selected !== false);

        for (let i = 0; i < Math.max(activeForeignRows.length, activeInrRows.length); i++) {
            const foreignQty = parseFloat(activeForeignRows[i]?.qty || '0') || 0;
            const inrQty = parseFloat(activeInrRows[i]?.qty || '0') || 0;
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
    const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().split('T')[0]);
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
        available: 'No',
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
    const [ackDate, setAckDate] = useState('');
    const [exchangeRate, setExchangeRate] = useState('');

    // Print Preview State
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    const [postedVoucherData, setPostedVoucherData] = useState<any>(null);
    const [companyInfo, setCompanyInfo] = useState<any>(null);

    React.useEffect(() => {
        const fetchCompany = async () => {
            try {
                const data = await httpClient.get<any>('/api/company-settings/').catch(() => null);
                if (data) setCompanyInfo(data);
            } catch { }
        };
        fetchCompany();
    }, []);

    // Show Foreign Currency + INR tabs when stateType is 'export' OR when Nature of Supply is
    // Export with payment, Export without payment, or Deemed Export
    const FOREIGN_INVOICE_TYPES = ['Export with payment', 'Export without payment', 'Deemed Export'];
    const showForeignTabs = stateType === 'export' || FOREIGN_INVOICE_TYPES.includes(invoiceType);

    const handleOutwardSlipChange = (val: string) => {
        setOutwardSlipNo(val);
        const selectedSlip = outwardSlipsData.find(s =>
            (s.outward_slip_no === val) ||
            (s.slip_no === val) ||
            (s.id?.toString() === val)
        );
        if (selectedSlip && selectedSlip.items) {
            const slipItems = Array.isArray(selectedSlip.items) ? selectedSlip.items : [];
            const newRows: ItemRow[] = slipItems.map((item: any, idx: number) => {
                const qty = (parseFloat(item.qty || item.quantity || '0')).toString();
                // Map fields from outward slip item to ItemRow
                // Note: field names might vary based on Backend API
                return {
                    id: Date.now() + idx,
                    itemCode: item.item_code || item.itemCode || item.serviceCode || item.service_code || '',
                    itemName: item.item_name || item.itemName || item.serviceName || item.service_name || '',
                    hsnSac: item.hsn_sac || item.hsnSac || item.sacCode || item.sac_code || '',
                    qty: qty,
                    uom: item.uom || '',
                    itemRate: (parseFloat(item.rate || item.item_rate || '0')).toString(),
                    taxableValue: (parseFloat(item.taxable_value || '0')).toFixed(2),
                    igst: (parseFloat(item.igst || '0')).toFixed(2),
                    cgst: (parseFloat(item.cgst || '0')).toFixed(2),
                    sgst: (parseFloat(item.sgst || '0')).toFixed(2),
                    cess: (parseFloat(item.cess || '0')).toFixed(2),
                    invoiceValue: (parseFloat(item.invoice_value || '0')).toFixed(2),
                    salesLedger: '',
                    description: item.description || '',
                    alternateUnit: item.alternate_uom || item.alternateUnit || '',
                    sourceDoc: 'Outward Slip: ' + val,
                    selected: true
                };
            });

            if (newRows.length > 0) {
                setItemRows(newRows);
                setForeignItemRows(newRows);
            }
        }
    };

    const tabs = showForeignTabs ? [
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

    const validateOutwardSlipMatch = () => {
        if (!outwardSlipNo) {
            setOutwardSlipError('');
            return true;
        }
        const selectedSlip = outwardSlipsData.find(s =>
            (s.outward_slip_no === outwardSlipNo) ||
            (s.slip_no === outwardSlipNo) ||
            (s.id?.toString() === outwardSlipNo)
        );
        if (!selectedSlip) {
            setOutwardSlipError('');
            return true;
        }

        // 1. Validate Header Info (Customer, Branch, GSTIN)
        const slipCustomer = selectedSlip.customer_name || selectedSlip.customerName || '';
        const slipBranch = selectedSlip.branch || selectedSlip.branch_name || '';
        const slipGstin = selectedSlip.gstin || '';

        if (slipCustomer && customerName && slipCustomer !== customerName) {
            setOutwardSlipError(`Customer Name '${customerName}' does not match Outward Slip (${slipCustomer}).`);
            return false;
        }

        if (slipBranch && customerBranch && slipBranch !== customerBranch) {
            setOutwardSlipError(`Branch '${customerBranch}' does not match Outward Slip (${slipBranch}).`);
            return false;
        }

        if (slipGstin && gstin && slipGstin !== gstin) {
            setOutwardSlipError(`GSTIN '${gstin}' does not match Outward Slip (${slipGstin}).`);
            return false;
        }

        // 2. Validate Items
        const slipItems = Array.isArray(selectedSlip.items) ? selectedSlip.items : [];
        const activeItemRows = itemRows.filter(row =>
            (row.itemCode && row.itemCode.trim() !== '') ||
            (row.itemName && row.itemName.trim() !== '')
        ).filter(row => row.selected !== false);

        // Map slip items by code/name
        const slipMap: Record<string, { qty: number, uom: string }> = {};
        slipItems.forEach((s: any) => {
            const code = (s.item_code || s.itemCode || s.serviceCode || s.service_code || s.item_name || s.itemName || '').trim();
            const qty = parseFloat((s.qty || s.quantity || '0').toString());
            const uom = (s.uom || s.uqc || '').trim();
            if (code) {
                if (!slipMap[code]) {
                    slipMap[code] = { qty: 0, uom: uom };
                }
                slipMap[code].qty += qty;
            }
        });

        // Map grid items by code/name
        const gridMap: Record<string, { qty: number, uom: string }> = {};
        activeItemRows.forEach((r: ItemRow) => {
            const code = (r.itemCode || r.itemName || '').trim();
            const qty = parseFloat((r.qty || '0').toString());
            const uom = (r.uom || '').trim();
            if (code) {
                if (!gridMap[code]) {
                    gridMap[code] = { qty: 0, uom: uom };
                }
                gridMap[code].qty += qty;
            }
        });

        const slipKeys = Object.keys(slipMap);
        const gridKeys = Object.keys(gridMap);

        // Check if all slip items are present in grid with correct quantities
        for (const key of slipKeys) {
            if (!gridMap[key]) {
                setOutwardSlipError(`Item '${key}' from Outward Slip is missing or not selected in Grid.`);
                return false;
            }
            if (Math.abs(slipMap[key].qty - gridMap[key].qty) > 0.0001) {
                setOutwardSlipError(`Quantity for item '${key}' (${gridMap[key].qty}) does not match Outward Slip (${slipMap[key].qty}).`);
                return false;
            }
            if (slipMap[key].uom && gridMap[key].uom && slipMap[key].uom !== gridMap[key].uom) {
                setOutwardSlipError(`UOM for item '${key}' (${gridMap[key].uom}) does not match Outward Slip (${slipMap[key].uom}).`);
                return false;
            }
        }

        // Check if there are extra items in grid that are NOT in the slip
        for (const key of gridKeys) {
            if (!slipMap[key]) {
                setOutwardSlipError(`Item '${key}' in Grid is not present in the selected Outward Slip.`);
                return false;
            }
        }

        setOutwardSlipError('');
        return true;
    };

    const handlePost = async () => {
        // Validate Qty match between Foreign Currency and INR tabs
        if (!validateQtyMatch()) {
            setActiveTab('item_tax_inr');
            return;
        }

        if (!validateOutwardSlipMatch()) {
            showError("Items do not match the Outward Slip.");
            setActiveTab(showForeignTabs ? 'item_tax_inr' : 'item_tax');
            return;
        }

        // Validate Transporter ID/GSTIN format
        if (transporterId && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(transporterId)) {
            showError("Invalid Transporter ID/GSTIN format. Please enter a valid 15-character GSTIN.");
            setActiveTab('dispatch');
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
                sales_order_no: salesOrderNos.join(', '),

                // GST-Compliant Fields
                place_of_supply: placeOfSupply || null,
                reverse_charge: reverseCharge,
                invoice_type: invoiceType,
                gst_export_type: stateType === 'export' ? gstExportType : null,
                port_code: stateType === 'export' ? portCode : null,
                shipping_bill_number: stateType === 'export' ? shippingBillNumber : null,
                shipping_bill_date: stateType === 'export' ? formatDate(shippingBillDate) : null,
                ecommerce_gstin: ecommerceGstin || null,
                is_ecommerce_sales: isEcommerceSales === 'Yes',

                // Items (Domestic/INR)
                items: itemRows.filter(row => row.selected !== false).map(row => ({
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
                foreign_items: showForeignTabs ? foreignItemRows.filter(row => row.selected !== false).map(row => ({
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
                    ack_no: ackNo,
                    ack_date: formatDate(ackDate)
                }))
            };

            await apiService.createSalesVoucherNew(payload);
            showSuccess('Sales Voucher Saved Successfully!');

            // Increment series counter so next invoice gets auto-incremented number
            if (selectedSeriesId) {
                await incrementInvoiceNumber(selectedSeriesId);
            }

            // Reset form or redirect logic here if needed
        } catch (error) {
            console.error('Failed to save sales voucher:');
            showError('Failed to save voucher. Please check inputs.');
        }

    };

    const handlePostAndPrint = async () => {
        if (!validateQtyMatch()) {
            setActiveTab('item_tax_inr');
            return;
        }

        if (!validateOutwardSlipMatch()) {
            showError("Items do not match the Outward Slip.");
            setActiveTab(showForeignTabs ? 'item_tax_inr' : 'item_tax');
            return;
        }

        // Validate Transporter ID/GSTIN format
        if (transporterId && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(transporterId)) {
            showError("Invalid Transporter ID/GSTIN format. Please enter a valid 15-character GSTIN.");
            setActiveTab('dispatch');
            return;
        }
        try {
            const parseNum = (val: any) => {
                if (val === '' || val === null || val === undefined) return 0;
                const num = parseFloat(val);
                return isNaN(num) ? 0 : num;
            };
            const formatDate = (val: string) => (!val || val.trim() === '') ? null : val;

            const billTo = { address_line_1: billToAddress1, address_line_2: billToAddress2, address_line_3: billToAddress3, city: billToCity, pincode: billToPincode, state: billToState, country: billToCountry };
            const shipTo = { address_line_1: shipToAddress1, address_line_2: shipToAddress2, address_line_3: shipToAddress3, city: shipToCity, pincode: shipToPincode, state: shipToState, country: shipToCountry };

            const payload = {
                date: formatDate(date), sales_invoice_no: salesInvoiceNo, voucher_name: voucherName, outward_slip_no: outwardSlipNo,
                customer_name: customerName, bill_to: JSON.stringify(billTo), ship_to: JSON.stringify(shipTo), gstin, contact, tax_type: taxType,
                state_type: stateType, export_type: exportType, exchange_rate: exchangeRate, supporting_document: supportingDocument,
                sales_order_no: salesOrderNos.join(', '), place_of_supply: placeOfSupply || null, reverse_charge: reverseCharge, invoice_type: invoiceType,
                gst_export_type: stateType === 'export' ? gstExportType : null, port_code: stateType === 'export' ? portCode : null,
                shipping_bill_number: stateType === 'export' ? shippingBillNumber : null, shipping_bill_date: stateType === 'export' ? formatDate(shippingBillDate) : null,
                ecommerce_gstin: ecommerceGstin || null,
                is_ecommerce_sales: isEcommerceSales === 'Yes',
                items: itemRows.filter(row => row.selected !== false).map(row => ({ item_code: row.itemCode, item_name: row.itemName, hsn_sac: row.hsnSac, qty: parseNum(row.qty), uom: row.uom, item_rate: parseNum(row.itemRate), taxable_value: parseNum(row.taxableValue), igst: parseNum(row.igst), cgst: parseNum(row.cgst), sgst: parseNum(row.sgst), cess: parseNum(row.cess), invoice_value: parseNum(row.invoiceValue), sales_ledger: row.salesLedger, description: row.description, alternate_unit: row.alternateUnit })),
                foreign_items: stateType === 'export' ? foreignItemRows.filter(row => row.selected !== false).map(row => ({ description: row.description, quantity: parseNum(row.qty), uqc: row.uom, rate: parseNum(row.itemRate), amount: parseNum(row.invoiceValue) })) : [],
                payment_details: { payment_taxable_value: calculateTotals().taxableValue, payment_igst: calculateTotals().igst, payment_cgst: calculateTotals().cgst, payment_sgst: calculateTotals().sgst, payment_cess: calculateTotals().cess, payment_state_cess: parseNum(paymentStateCess), payment_invoice_value: calculateTotals().invoiceValue, payment_tds_income_tax: parseNum(paymentTdsIncomeTax), payment_tds_gst: parseNum(paymentTdsGst), payment_advance: parseNum(paymentAdvance), payment_payable: parseNum(paymentPayable), posting_note: paymentPostingNote, terms_conditions: termsConditions, advance_references: JSON.stringify(advanceReferences) },
                dispatch_details: { dispatch_from: dispatchFrom, mode_of_transport: modeOfTransport, dispatch_date: formatDate(dispatchDate), dispatch_time: formatDate(dispatchTime), delivery_type: deliveryType, self_third_party: selfThirdParty, transporter_id: transporterId, transporter_name: transporterName, vehicle_no: vehicleNo, lr_gr_consignment: lrGrConsignment, dispatch_document: dispatchDocument },
                eway_bill_details: ewayValidationEntries.map(entry => ({ eway_bill_available: entry.available === 'Yes', eway_bill_no: entry.ewayBillNo || '', eway_bill_date: formatDate(entry.date || ''), validity_period: entry.validityPeriod || '', distance: entry.distance || '', irn, ack_no: ackNo, ack_date: formatDate(ackDate) }))
            };

            await apiService.createSalesVoucherNew(payload);
            showSuccess('Sales Voucher Saved Successfully!');

            // Increment series counter so next invoice gets auto-incremented number
            if (selectedSeriesId) {
                await incrementInvoiceNumber(selectedSeriesId);
            }

            // Prepare data for print preview
            const totals = calculateTotals();
            setPostedVoucherData({ ...payload, totals, billTo, shipTo });
            setShowPrintPreview(true);

        } catch (error) {
            console.error('Failed to save sales voucher:');
            showError('Failed to save voucher. Please check inputs.');
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const allowed = ['image/jpeg', 'application/pdf'];
        if (!allowed.includes(file.type)) {
            alert('Only JPG, JPEG, and PDF files are accepted.');
            e.target.value = '';
            return;
        }
        setSupportingDocument(file);
    };

    // Item Row Handlers
    const handleItemRowChange = (id: number, field: keyof ItemRow, value: string | boolean) => {
        setItemRows(itemRows.map(row => {
            if (row.id === id) {
                if (field === 'selected') {
                    return { ...row, [field]: value as boolean };
                }

                // Prevent negative values for specific numeric fields
                let cleanValue = value as string;
                if (['qty', 'itemRate', 'igst', 'cgst', 'sgst', 'cess'].includes(field)) {
                    if (parseFloat(value as string) < 0) {
                        cleanValue = '0';
                    }
                }
                let updatedRow = { ...row, [field]: cleanValue };

                // Auto-fill item details when itemCode or itemName changes
                if (field === 'itemCode' || field === 'itemName') {
                    let matchedItem = inventoryItems.find(item =>
                        field === 'itemCode' ? item.item_code === value : (item.name === value || item.item_name === value)
                    );

                    let isService = false;
                    if (!matchedItem) {
                        matchedItem = serviceItems.find(item =>
                            field === 'itemCode'
                                ? (item.serviceCode === value || item.service_code === value)
                                : (item.serviceName === value || item.service_name === value)
                        );
                        if (matchedItem) isService = true;
                    }

                    if (matchedItem) {
                        let inrRate = 0;
                        if (isService) {
                            updatedRow.itemCode = matchedItem.serviceCode || matchedItem.service_code || updatedRow.itemCode;
                            updatedRow.itemName = matchedItem.serviceName || matchedItem.service_name || updatedRow.itemName;
                            updatedRow.hsnSac = matchedItem.sacCode || matchedItem.sac_code || updatedRow.hsnSac;
                            updatedRow.uom = matchedItem.uom || updatedRow.uom;
                            updatedRow.alternateUnit = '';
                            updatedRow.description = matchedItem.description || updatedRow.description;
                            inrRate = parseFloat(matchedItem.rate || matchedItem.price || '0');
                            updatedRow.itemRate = inrRate.toString();
                        } else {
                            updatedRow.itemCode = matchedItem.item_code || updatedRow.itemCode;
                            updatedRow.itemName = matchedItem.name || matchedItem.item_name || updatedRow.itemName;
                            updatedRow.hsnSac = matchedItem.hsn_code || matchedItem.hsn || updatedRow.hsnSac;
                            updatedRow.uom = matchedItem.uom || matchedItem.unit || updatedRow.uom;
                            updatedRow.alternateUnit = matchedItem.alternative_unit || matchedItem.alternate_uom || '';
                            updatedRow.description = matchedItem.description || updatedRow.description;
                            inrRate = parseFloat(matchedItem.rate || matchedItem.standard_rate || '0');
                            updatedRow.itemRate = inrRate.toString();
                        }

                        // Recalculate values
                        const qty = parseFloat(updatedRow.qty) || 0;
                        updatedRow.taxableValue = (qty * inrRate).toFixed(2);
                        const taxableVal = parseFloat(updatedRow.taxableValue) || 0;
                        const igst = parseFloat(updatedRow.igst) || 0;
                        const cgst = parseFloat(updatedRow.cgst) || 0;
                        const sgst = parseFloat(updatedRow.sgst) || 0;
                        const cess = parseFloat(updatedRow.cess) || 0;
                        updatedRow.invoiceValue = (taxableVal + igst + cgst + sgst + cess).toFixed(2);

                        // Sync to FC tab
                        const convRate = parseFloat(exchangeRate) || 1;
                        const fcRate = inrRate / convRate;
                        setForeignItemRows(prevFC => prevFC.map(fcRow => {
                            if (fcRow.id === id) {
                                return {
                                    ...fcRow,
                                    itemCode: updatedRow.itemCode,
                                    itemName: updatedRow.itemName,
                                    hsnSac: updatedRow.hsnSac,
                                    uom: updatedRow.uom,
                                    qty: updatedRow.qty,
                                    itemRate: fcRate.toFixed(2),
                                    invoiceValue: (qty * fcRate).toFixed(2),
                                    description: updatedRow.description
                                };
                            }
                            return fcRow;
                        }));
                    }
                }

                // Auto-calculate taxable value when qty or item rate changes
                if (field === 'qty' || field === 'itemRate') {
                    const qty = parseFloat(field === 'qty' ? cleanValue : updatedRow.qty) || 0;
                    const rate = parseFloat(field === 'itemRate' ? cleanValue : updatedRow.itemRate) || 0;
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

        // Sync to FC tab when qty changes in INR tab
        if (field === 'qty') {
            const cleanValue = (parseFloat(value as string) < 0) ? '0' : (value as string);
            setForeignItemRows(prev => prev.map(row => {
                if (row.id === id) {
                    const qty = parseFloat(cleanValue) || 0;
                    const rate = parseFloat(row.itemRate) || 0;
                    return {
                        ...row,
                        qty: cleanValue,
                        invoiceValue: (qty * rate).toFixed(2)
                    };
                }
                return row;
            }));
        }

        // Sync basic identity fields to FC tab
        if (['itemCode', 'itemName', 'hsnSac', 'description', 'uom'].includes(field as string)) {
            setForeignItemRows(prev => prev.map(row => {
                if (row.id === id) {
                    return { ...row, [field]: value };
                }
                return row;
            }));
        }
    };

    const handleAddItemRow = () => {
        const newId = Date.now() + Math.random();
        const newRow: ItemRow = {
            id: newId,
            itemCode: '',
            itemName: '',
            hsnSac: '',
            qty: '0',
            uom: '',
            itemRate: '0',
            taxableValue: '0',
            igst: '0',
            cgst: '0',
            sgst: '0',
            cess: '0',
            invoiceValue: '0',
            salesLedger: '',
            description: '',
            alternateUnit: '',
            selected: true
        };
        setItemRows(prev => [...prev, newRow]);
        setForeignItemRows(prev => [...prev, newRow]);
    };

    const handleDeleteItemRow = (id: number) => {
        if (itemRows.length > 1) {
            setItemRows(prev => prev.filter(row => row.id !== id));
            setForeignItemRows(prev => prev.filter(row => row.id !== id));
        }
    };

    const handleDeleteSelectedItems = () => {
        // Delete all unselected items, but ensure at least one row remains in both tabs
        const selectedIds = itemRows.filter(row => row.selected !== false).map(r => r.id);

        if (selectedIds.length === 0) {
            const newId = Date.now();
            const blankRow: ItemRow = {
                id: newId,
                itemCode: '', itemName: '', hsnSac: '', qty: '0', uom: '', alternateUnit: '',
                itemRate: '0', taxableValue: '0', igst: '0', cgst: '0', sgst: '0', cess: '0',
                invoiceValue: '0', salesLedger: '', description: '', selected: true
            };
            setItemRows([blankRow]);
            setForeignItemRows([blankRow]);
        } else {
            setItemRows(prev => prev.filter(row => selectedIds.includes(row.id)));
            setForeignItemRows(prev => prev.filter(row => selectedIds.includes(row.id)));
        }
    };

    // Foreign Item Row Handlers
    const handleForeignItemRowChange = (id: number, field: keyof ItemRow, value: string | boolean) => {
        setForeignItemRows(prev => prev.map(row => {
            if (row.id === id) {
                if (field === 'selected') {
                    return { ...row, [field]: value as boolean };
                }

                // Prevent negative values for specific numeric fields
                let cleanValue = value as string;
                if (['qty', 'itemRate'].includes(field)) {
                    if (parseFloat(value as string) < 0) {
                        cleanValue = '0';
                    }
                }
                let updatedRow = { ...row, [field]: cleanValue };

                // Auto-fill item details when itemCode or itemName changes in Foreign Currency tab
                if (field === 'itemCode' || field === 'itemName') {
                    let matchedItem = inventoryItems.find(item =>
                        field === 'itemCode' ? item.item_code === value : (item.name === value || item.item_name === value)
                    );

                    let isService = false;
                    if (!matchedItem) {
                        matchedItem = serviceItems.find(item =>
                            field === 'itemCode'
                                ? (item.serviceCode === value || item.service_code === value)
                                : (item.serviceName === value || item.service_name === value)
                        );
                        if (matchedItem) isService = true;
                    }

                    if (matchedItem) {
                        const convRate = parseFloat(exchangeRate) || 1;
                        let inrRate = 0;
                        if (isService) {
                            updatedRow.itemCode = matchedItem.serviceCode || matchedItem.service_code || updatedRow.itemCode;
                            updatedRow.itemName = matchedItem.serviceName || matchedItem.service_name || updatedRow.itemName;
                            updatedRow.hsnSac = matchedItem.sacCode || matchedItem.sac_code || updatedRow.hsnSac;
                            updatedRow.uom = matchedItem.uom || updatedRow.uom;
                            inrRate = parseFloat(matchedItem.rate || matchedItem.price || '0');
                        } else {
                            updatedRow.itemCode = matchedItem.item_code || updatedRow.itemCode;
                            updatedRow.itemName = matchedItem.name || matchedItem.item_name || updatedRow.itemName;
                            updatedRow.hsnSac = matchedItem.hsn_code || matchedItem.hsn || updatedRow.hsnSac;
                            updatedRow.uom = matchedItem.uom || matchedItem.unit || updatedRow.uom;
                            updatedRow.description = matchedItem.description || updatedRow.description;
                            inrRate = parseFloat(matchedItem.rate || matchedItem.standard_rate || '0');
                        }
                        const fcRate = inrRate / convRate;

                        // Set rate in FC (running balance rate converted to FC)
                        updatedRow.itemRate = fcRate.toFixed(2);

                        const qty = parseFloat(updatedRow.qty) || 0;
                        updatedRow.invoiceValue = (qty * fcRate).toFixed(2);

                        // Sync basic details to the INR tab immediately
                        setItemRows(prevInr => prevInr.map(inrRow => {
                            if (inrRow.id === id) {
                                return {
                                    ...inrRow,
                                    itemCode: updatedRow.itemCode,
                                    itemName: updatedRow.itemName,
                                    hsnSac: updatedRow.hsnSac,
                                    uom: updatedRow.uom,
                                    itemRate: inrRate.toFixed(2),
                                    taxableValue: (qty * inrRate).toFixed(2),
                                    qty: updatedRow.qty,
                                    description: updatedRow.description
                                };
                            }
                            return inrRow;
                        }));
                    }
                }

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
            const cleanValue = parseFloat(value as string) < 0 ? '0' : value as string;
            setItemRows(prev => prev.map(row => {
                if (row.id === id) {
                    const qty = parseFloat(cleanValue) || 0;
                    const rate = parseFloat(row.itemRate) || 0;
                    const taxable = (qty * rate).toFixed(2);
                    return { ...row, qty: cleanValue, taxableValue: taxable };
                }
                return row;
            }));
        }

        // Sync basic identity fields to the INR tab
        if (['itemCode', 'itemName', 'hsnSac'].includes(field as string)) {
            setItemRows(prev => prev.map(row => {
                if (row.id === id) {
                    return { ...row, [field]: value };
                }
                return row;
            }));
        }

        // Sync Description to the INR tab when description changes in Foreign Currency tab
        if (field === 'description') {
            setItemRows(prev => prev.map(row => {
                if (row.id === id) {
                    return { ...row, description: value as string };
                }
                return row;
            }));
        }

        // Sync UQC (uom) to the UOM field in the INR tab when it changes in Foreign Currency tab
        if (field === 'uom') {
            setItemRows(prev => prev.map(row => {
                if (row.id === id) {
                    return { ...row, uom: value as string };
                }
                return row;
            }));
        }

        // Sync INR Rate = FC Rate × Conversion Rate when itemRate changes in Foreign Currency tab
        if (field === 'itemRate') {
            const cleanValue = parseFloat(value as string) < 0 ? '0' : value as string;
            const convRate = parseFloat(exchangeRate) || 1;
            const inrRate = (parseFloat(cleanValue) || 0) * convRate;
            setItemRows(prev => prev.map(row => {
                if (row.id === id) {
                    const qty = parseFloat(row.qty) || 0;
                    const taxable = (qty * inrRate).toFixed(2);
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

    const handleAddForeignItemRow = handleAddItemRow;

    const handleDeleteForeignItemRow = handleDeleteItemRow;

    const handleDeleteSelectedForeignItems = handleDeleteSelectedItems;

    const calculateTotals = () => {
        const activeRows = itemRows.filter(row => row.selected !== false);
        const sums = activeRows.reduce((acc, row) => {
            return {
                taxableValue: acc.taxableValue + (parseFloat(row.taxableValue) || 0),
                igst: acc.igst + (parseFloat(row.igst) || 0),
                cgst: acc.cgst + (parseFloat(row.cgst) || 0),
                sgst: acc.sgst + (parseFloat(row.sgst) || 0),
                cess: acc.cess + (parseFloat(row.cess) || 0),
            };
        }, { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });

        const finalIgst = (isInterState && !isTaxHidden) ? sums.igst : 0;
        const finalCgst = (!isInterState && !isTaxHidden) ? sums.cgst : 0;
        const finalSgst = (!isInterState && !isTaxHidden) ? sums.sgst : 0;
        const finalCess = isCessHidden ? 0 : sums.cess;

        const invoiceValue = sums.taxableValue + finalIgst + finalCgst + finalSgst + finalCess;

        return {
            taxableValue: sums.taxableValue,
            igst: finalIgst,
            cgst: finalCgst,
            sgst: finalSgst,
            cess: finalCess,
            invoiceValue
        };
    };

    React.useEffect(() => {
        const totals = calculateTotals();
        const invVal = totals.invoiceValue;
        const tdsIT = parseFloat(paymentTdsIncomeTax) || 0;
        const tdsGST = parseFloat(paymentTdsGst) || 0;
        const advance = parseFloat(paymentAdvance) || 0;
        const isTcsActive = customerTcsEnabled || customerTcsRate > 0;

        let payable = invVal - tdsGST - advance;
        if (isTcsActive) {
            payable += tdsIT;
        } else {
            payable -= tdsIT;
        }

        setPaymentPayable(payable.toFixed(2));
    }, [itemRows, paymentTdsIncomeTax, paymentTdsGst, paymentAdvance, customerTcsEnabled, customerTcsRate]);

    // Auto-calculate TDS/TCS under Income Tax = Invoice Value × (TCS Rate + TDS Rate)
    React.useEffect(() => {
        const totalRate = customerTcsRate + customerTdsRate;
        if (totalRate > 0) {
            const invVal = calculateTotals().invoiceValue;
            const taxAmount = invVal * totalRate;
            setPaymentTdsIncomeTax(taxAmount.toFixed(2));
        } else {
            setPaymentTdsIncomeTax('0.00');
        }
    }, [itemRows, customerTcsRate, customerTdsRate]);

    // Auto-calculate TDS/TCS under GST
    // Condition 1: Basic Details (gst_tds_applicable) YES AND TDS & Statutory (tds_enabled) YES (or equivalent derived config via rates or TCS) - Rate: 2%
    // Condition 2: TDS & Statutory (tds_enabled) YES AND Taxable Value > 2,50,000 - Rate: 2%
    // Condition 3: Sales through E-Commerce Operator (Yes) AND TCS Configuration Active (customerTcsEnabled or customerTcsRate > 0) - Rate: 1%
    React.useEffect(() => {
        const taxableVal = calculateTotals().taxableValue;

        // Treat as enabled if the toggle is ON or a valid rate has been configured
        const isTdsOrTcsEnabled = customerTdsEnabled || customerTcsEnabled || customerTdsRate > 0 || customerTcsRate > 0;
        const isTcsActive = customerTcsEnabled || customerTcsRate > 0;

        const condition1 = customerGstTdsApplicable && isTdsOrTcsEnabled;
        const condition2 = isTdsOrTcsEnabled && taxableVal > 250000;
        const condition3 = isEcommerceSales === 'Yes' && isTcsActive;

        console.log('TDS Calculation Debug:', {
            taxableVal,
            customerGstTdsApplicable,
            customerTdsEnabled,
            customerTcsEnabled,
            customerTdsRate,
            customerTcsRate,
            isTdsOrTcsEnabled,
            isTcsActive,
            isEcommerceSales,
            condition1,
            condition2,
            condition3
        });

        if (condition3) {
            const tcsAmount = taxableVal * 0.01;
            console.log('Setting paymentTdsGst (E-Commerce TCS 1%):', tcsAmount.toFixed(2));
            setPaymentTdsGst(tcsAmount.toFixed(2));
        } else if (condition1 || condition2) {
            const tdsGstAmount = taxableVal * 0.02;
            console.log('Setting paymentTdsGst (Regular TDS 2%):', tdsGstAmount.toFixed(2));
            setPaymentTdsGst(tdsGstAmount.toFixed(2));
        } else {
            console.log('Resetting paymentTdsGst to 0.00');
            setPaymentTdsGst('0.00');
        }
    }, [itemRows, customerGstTdsApplicable, customerTdsEnabled, customerTcsEnabled, customerTdsRate, customerTcsRate, isEcommerceSales]);

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


            {/* Add New Customer Modal */}
            <AddNewCustomerModal
                isOpen={showAddCustomerModal}
                onClose={() => setShowAddCustomerModal(false)}
                onCustomerCreated={async (newName) => {
                    // Refresh the masterCustomers list so the new customer appears
                    try {
                        const res = await httpClient.get('/api/customerportal/customer-master/');
                        const list = Array.isArray(res) ? res : (res as any).results || [];
                        setMasterCustomers(list);
                        // Auto-select the new customer
                        handleCustomerChange(newName);
                    } catch {
                        // still set the name so it's selected even if refresh fails
                        handleCustomerChange(newName);
                    }
                    setShowAddCustomerModal(false);
                }}
            />
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
                                    max={new Date().toISOString().split('T')[0]}
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
                                    onChange={handleVoucherNameChange}
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
                                <div className="flex flex-col gap-1.5">
                                    <SearchableDropdown
                                        value={customerName}
                                        onChange={handleCustomerChange}
                                        options={customerOptions}
                                        placeholder="Search or select customer"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowAddCustomerModal(true)}
                                        className="flex items-center self-start gap-1.5 px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 text-[13px] font-medium rounded-[4px] transition-all whitespace-nowrap shadow-sm"
                                        title="Add New Customer"
                                    >
                                        <span className="text-lg leading-none">+</span> Add New Customer
                                    </button>
                                </div>
                            </div>

                            {/* Branch Dropdown – always visible */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Branch
                                </label>
                                {branchOptions.length > 0 ? (
                                    <SearchableDropdown
                                        value={customerBranch}
                                        onChange={handleBranchChange}
                                        options={branchOptions}
                                        placeholder="Select branch"
                                        disabled={!customerName}
                                    />
                                ) : (
                                    <select
                                        disabled
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-400 text-sm cursor-not-allowed"
                                    >
                                        <option>
                                            {customerName ? 'No branches configured' : 'Select customer first'}
                                        </option>
                                    </select>
                                )}
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

                            {/* Row 3 Col 1: Create Outward Slip */}
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

                            {/* Row 3 Col 2: Outward Slip No. */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Outward Slip No.
                                </label>
                                <SearchableDropdown
                                    value={outwardSlipNo}
                                    onChange={handleOutwardSlipChange}
                                    options={outwardSlipOptions}
                                    placeholder="Select or enter slip no"
                                    disabled={false}
                                />
                            </div>

                            {/* Row 3 Col 3: Upload Supporting Document */}
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Upload Supporting Document
                                </label>
                                {!supportingDocument ? (
                                    <div className="relative group">
                                        <input
                                            type="file"
                                            id="supporting-doc"
                                            onChange={handleFileUpload}
                                            className="hidden"
                                            accept=".jpg,.jpeg,.pdf"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => document.getElementById('supporting-doc')?.click()}
                                            className="w-full h-[42px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-[4px] transition-all flex items-center justify-center gap-2 shadow-sm"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                            </svg>
                                            <span className="text-sm">Upload Document</span>
                                        </button>
                                        <p className="text-xs text-gray-400 text-center mt-1">Accepted: JPG, JPEG, PDF</p>
                                    </div>
                                ) : (
                                    <div className="relative border-2 border-dashed border-indigo-200 rounded-[4px] p-2 bg-indigo-50/30">
                                        {supportingDocument.type.startsWith('image/') ? (
                                            <div
                                                className="relative aspect-video w-full overflow-hidden rounded-[2px] bg-white border border-indigo-100 cursor-pointer group/preview"
                                                onClick={() => setIsSalesPreviewModalOpen(true)}
                                            >
                                                <img
                                                    src={salesPreviewUrl || ''}
                                                    alt="Preview"
                                                    className="w-full h-full object-contain transition-transform duration-300 group-hover/preview:scale-105"
                                                />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center">
                                                    <span className="text-white text-xs font-bold uppercase tracking-wider">Click to View</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                className="flex items-center gap-3 p-2 bg-white rounded border border-indigo-100 cursor-pointer hover:bg-indigo-50 transition-colors group/file"
                                                onClick={() => setIsSalesPreviewModalOpen(true)}
                                            >
                                                <div className="p-2 bg-red-50 text-red-600 rounded">
                                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                    </svg>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 truncate uppercase tracking-tight leading-none">{supportingDocument.name}</p>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">PDF Document</p>
                                                </div>
                                            </div>
                                        )}

                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSupportingDocument(null);
                                            }}
                                            className="absolute -top-2 -right-2 p-1 bg-red-600 text-white rounded-full shadow-lg hover:bg-red-700 transition-colors z-10"
                                            title="Remove file"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                )}
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

                                {/* Nature of Supply */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Nature of Supply <span className="text-red-500">*</span>
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

                                {/* Sales through E-Commerce Operator */}
                                <div className={isEcommerceSales === 'Yes' ? 'md:col-span-1' : ''}>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Sales through E-Commerce Operator?
                                    </label>
                                    <div className="flex gap-4 mt-3">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="isEcommerceSales"
                                                value="No"
                                                checked={isEcommerceSales === 'No'}
                                                onChange={(e) => setIsEcommerceSales(e.target.value)}
                                                className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                                            />
                                            <span className="text-sm text-gray-700">No</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="isEcommerceSales"
                                                value="Yes"
                                                checked={isEcommerceSales === 'Yes'}
                                                onChange={(e) => setIsEcommerceSales(e.target.value)}
                                                className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                                            />
                                            <span className="text-sm text-gray-700">Yes</span>
                                        </label>
                                    </div>
                                </div>

                                {isEcommerceSales === 'Yes' && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            E-Commerce Operator <span className="text-red-500">*</span>
                                        </label>
                                        <SearchableDropdown
                                            value={ecommerceOperator}
                                            onChange={handleEcommerceOperatorChange}
                                            options={ecommerceOperatorOptions}
                                            placeholder="Select Operator"
                                        />
                                    </div>
                                )}
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


                            </div>


                        </div>

                        {/* Row 4: Navigation */}
                        <div className="flex justify-end mt-6">
                            <button
                                type="button"
                                onClick={() => setActiveTab(showForeignTabs ? 'item_tax_foreign' : 'item_tax')}
                                className="px-10 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[4px] transition-colors flex items-center justify-center gap-2 font-medium shadow-sm hover:shadow-md"
                            >
                                NEXT
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                    </div>
                )
                }

                {
                    activeTab === 'item_tax_foreign' && (
                        <div className="space-y-6">
                            {/* Header: Sales Order and Exchange Rate */}
                            <div className="flex flex-wrap justify-between items-end gap-4">
                                <div className="flex items-center gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1 whitespace-nowrap">
                                            Sales Order/Quotation No.
                                        </label>
                                        <div className="relative" data-salesdoc-dropdown style={{ minWidth: 240 }}>
                                            <button
                                                type="button"
                                                onClick={() => setSalesDocDropdownOpen(o => !o)}
                                                className="w-full flex flex-wrap gap-1 items-center px-3 py-1.5 border border-gray-300 rounded-[4px] bg-white min-h-[38px] text-left focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                            >
                                                {salesOrderNos.length === 0 ? (
                                                    <span className="text-gray-400 text-sm">Select Sales Order/Quotation</span>
                                                ) : (
                                                    <span className="text-sm text-gray-700 font-medium">{salesOrderNos.length} selected</span>
                                                )}
                                                <span className="ml-auto text-gray-400 text-xs">▾</span>
                                            </button>
                                            {/* Color-coded badges beside the dropdown */}
                                            {salesOrderNos.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {salesOrderNos.map((num) => {
                                                        const c = getSalesDocColor(num);
                                                        return (
                                                            <span
                                                                key={num}
                                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] border text-xs font-semibold ${c.bg} ${c.text} ${c.border}`}
                                                            >
                                                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
                                                                {num}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSalesOrderNos(prev => prev.filter(v => v !== num))}
                                                                    className={`ml-0.5 font-bold leading-none opacity-60 hover:opacity-100`}
                                                                >×</button>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {salesDocDropdownOpen && (
                                                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-[4px] shadow-lg max-h-56 overflow-y-auto">
                                                    {salesDocOptions.filter(d => d.type === 'Order').length > 0 && (
                                                        <>
                                                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-100">
                                                                ── Sales Orders ──
                                                            </div>
                                                            {salesDocOptions.filter(d => d.type === 'Order').map((doc, idx) => (
                                                                <label key={`so-${doc.id}-${idx}`} className="flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 cursor-pointer text-sm">
                                                                    <input type="checkbox" checked={salesOrderNos.includes(doc.number)} onChange={() => handleSalesDocToggle(doc.number)} className="w-4 h-4 text-indigo-600 border-gray-300 rounded" />
                                                                    <span className="font-medium text-gray-800">{doc.number}</span>
                                                                    {doc.customer && <span className="text-gray-400 text-xs">({doc.customer})</span>}
                                                                </label>
                                                            ))}
                                                        </>
                                                    )}
                                                    {salesDocOptions.filter(d => d.type === 'Quotation').length > 0 && (
                                                        <>
                                                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-100">
                                                                ── Sales Quotations ──
                                                            </div>
                                                            {salesDocOptions.filter(d => d.type === 'Quotation').map((doc, idx) => (
                                                                <label key={`sq-${doc.id}-${idx}`} className="flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 cursor-pointer text-sm">
                                                                    <input type="checkbox" checked={salesOrderNos.includes(doc.number)} onChange={() => handleSalesDocToggle(doc.number)} className="w-4 h-4 text-indigo-600 border-gray-300 rounded" />
                                                                    <span className="font-medium text-gray-800">{doc.number}</span>
                                                                    {doc.customer && <span className="text-gray-400 text-xs">({doc.customer})</span>}
                                                                </label>
                                                            ))}
                                                        </>
                                                    )}
                                                </div>
                                            )}
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
                                        {foreignItemRows.map((row) => {
                                            const rowColorClass = (row.sourceDoc && getSalesDocColor(row.sourceDoc)) ? getSalesDocColor(row.sourceDoc).bg : '';
                                            const isSelected = row.selected !== false;
                                            return (
                                                <React.Fragment key={row.id}>
                                                    <tr className={`hover:bg-opacity-80 transition-colors ${rowColorClass || 'hover:bg-gray-50'} ${!isSelected ? 'opacity-50' : ''}`}>
                                                        <td className="px-3 py-2 text-center border-r border-gray-200">
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={(e) => handleForeignItemRowChange(row.id, 'selected', e.target.checked)}
                                                                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2 border-r border-gray-200">
                                                            <SearchableDropdown
                                                                options={itemNameOptions}
                                                                value={row.itemName}
                                                                onChange={(val) => handleForeignItemRowChange(row.id, 'itemName', val)}
                                                                placeholder="Select item description"
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2 border-r border-gray-200">
                                                            <input
                                                                type="number"
                                                                value={row.qty}
                                                                onChange={(e) => handleForeignItemRowChange(row.id, 'qty', e.target.value)}
                                                                className="w-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm text-center bg-transparent"
                                                                placeholder="0"
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2 border-r border-gray-200">
                                                            <SearchableDropdown
                                                                options={getRowUomOptions(row)}
                                                                value={row.uom}
                                                                onChange={(val) => handleForeignItemRowChange(row.id, 'uom', val)}
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
                                                                className="w-full px-2 py-1.5 bg-gray-50 bg-opacity-50 border-0 rounded text-sm font-medium text-center text-gray-700"
                                                                placeholder="0.00"
                                                            />
                                                        </td>
                                                    </tr>
                                                    {/* Sales Ledger and Description row for Foreign Currency */}
                                                    <tr className={`border-b border-gray-200 ${rowColorClass || 'bg-gray-50'} ${!isSelected ? 'opacity-50' : ''}`}>
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
                                                                <label className="text-xs font-medium text-gray-700 whitespace-nowrap">ledger narration:</label>
                                                                <input
                                                                    type="text"
                                                                    value={row.description}
                                                                    onChange={(e) => handleForeignItemRowChange(row.id, 'description', e.target.value)}
                                                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500 bg-white bg-opacity-80"
                                                                    placeholder="Enter ledger narration"
                                                                />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Outward Slip Error Banner */}
                            {outwardSlipError && (
                                <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-300 rounded-[4px] text-red-700 text-sm font-medium">
                                    <svg className="w-5 h-5 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                    </svg>
                                    {outwardSlipError}
                                </div>
                            )}

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
                                        onClick={() => {
                                            if (validateOutwardSlipMatch()) {
                                                setActiveTab('item_tax_inr');
                                            }
                                        }}
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
                    )
                }

                {
                    (activeTab === 'item_tax' || activeTab === 'item_tax_inr') && (
                        <div className="space-y-6">
                            {/* Sales Order / Quotation Multi-Select */}
                            <div className="flex items-start gap-4 flex-wrap">
                                <label className="text-sm font-medium text-gray-700 whitespace-nowrap pt-2">
                                    Sales Order/Quotation No.
                                </label>
                                {/* Dropdown trigger + panel */}
                                <div className="relative" data-salesdoc-dropdown style={{ minWidth: 260 }}>
                                    <button
                                        type="button"
                                        onClick={() => setSalesDocDropdownOpen(o => !o)}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-[4px] bg-white min-h-[38px] text-left focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    >
                                        {salesOrderNos.length === 0 ? (
                                            <span className="text-gray-400 text-sm">Select Sales Order/Quotation</span>
                                        ) : (
                                            <span className="text-sm text-gray-700 font-medium">{salesOrderNos.length} selected</span>
                                        )}
                                        <span className="ml-auto text-gray-400 text-xs">▾</span>
                                    </button>

                                    {/* Dropdown panel */}
                                    {salesDocDropdownOpen && (
                                        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-[4px] shadow-lg max-h-64 overflow-y-auto">
                                            {salesDocOptions.filter(d => d.type === 'Order').length > 0 && (
                                                <>
                                                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-100 sticky top-0">
                                                        ── Sales Orders ──
                                                    </div>
                                                    {salesDocOptions.filter(d => d.type === 'Order').map((doc, idx) => (
                                                        <label
                                                            key={`so-${doc.id}-${idx}`}
                                                            className="flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 cursor-pointer text-sm"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={salesOrderNos.includes(doc.number)}
                                                                onChange={() => handleSalesDocToggle(doc.number)}
                                                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded"
                                                            />
                                                            <span className="font-medium text-gray-800">{doc.number}</span>
                                                            {doc.customer && <span className="text-gray-400 text-xs">({doc.customer})</span>}
                                                        </label>
                                                    ))}
                                                </>
                                            )}
                                            {salesDocOptions.filter(d => d.type === 'Quotation').length > 0 && (
                                                <>
                                                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-100 sticky top-0">
                                                        ── Sales Quotations ──
                                                    </div>
                                                    {salesDocOptions.filter(d => d.type === 'Quotation').map((doc, idx) => (
                                                        <label
                                                            key={`sq-${doc.id}-${idx}`}
                                                            className="flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 cursor-pointer text-sm"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={salesOrderNos.includes(doc.number)}
                                                                onChange={() => handleSalesDocToggle(doc.number)}
                                                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded"
                                                            />
                                                            <span className="font-medium text-gray-800">{doc.number}</span>
                                                            {doc.customer && <span className="text-gray-400 text-xs">({doc.customer})</span>}
                                                        </label>
                                                    ))}
                                                </>
                                            )}
                                            {salesDocOptions.length === 0 && (
                                                <div className="px-3 py-3 text-sm text-gray-400 text-center">No options available</div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Color-coded badges beside the dropdown */}
                                {salesOrderNos.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 items-center pt-1">
                                        {salesOrderNos.map((num) => {
                                            const c = getSalesDocColor(num);
                                            return (
                                                <span
                                                    key={num}
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] border text-xs font-semibold ${c.bg} ${c.text} ${c.border}`}
                                                >
                                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
                                                    {num}
                                                    <button
                                                        type="button"
                                                        onClick={() => setSalesOrderNos(prev => prev.filter(v => v !== num))}
                                                        className="ml-0.5 font-bold leading-none opacity-60 hover:opacity-100"
                                                    >×</button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
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
                                            {!isTaxHidden && (
                                                !isInterState ? (
                                                    <>
                                                        <th className="px-3 py-2 text-xs font-semibold text-center border-r border-blue-400">CGST</th>
                                                        <th className="px-3 py-2 text-xs font-semibold text-center border-r border-blue-400">SGST/UTGST</th>
                                                    </>
                                                ) : (
                                                    <th className="px-3 py-2 text-xs font-semibold text-center border-r border-blue-400">IGST</th>
                                                )
                                            )}
                                            {!isCessHidden && (
                                                <th className="px-3 py-2 text-xs font-semibold text-center border-r border-blue-400">CESS</th>
                                            )}
                                            <th className="px-3 py-2 text-xs font-semibold text-center border-r border-blue-400">Invoice Value</th>
                                            <th className="px-3 py-2 text-xs font-semibold text-center">Delete</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {itemRows.map((row, index) => {
                                            const rowColorClass = (row.sourceDoc && getSalesDocColor(row.sourceDoc)) ? getSalesDocColor(row.sourceDoc).bg : '';
                                            const isSelected = row.selected !== false;
                                            return (
                                                <React.Fragment key={row.id}>
                                                    <tr className={`border-b border-gray-200 hover:bg-opacity-80 transition-colors ${rowColorClass || 'hover:bg-gray-50'} ${!isSelected ? 'opacity-50' : ''}`}>
                                                        <td className="px-2 py-2 text-center text-sm font-medium border-r border-gray-200">
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={(e) => handleItemRowChange(row.id, 'selected', e.target.checked)}
                                                                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
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
                                                                readOnly
                                                                className="w-full px-2 py-1 bg-gray-50 bg-opacity-50 border-0 rounded text-sm text-center text-gray-700 cursor-not-allowed"
                                                                placeholder="HSN/SAC"
                                                            />
                                                        </td>
                                                        <td className="px-2 py-2 border-r border-gray-200">
                                                            <input
                                                                type="number"
                                                                value={row.qty}
                                                                min="0"
                                                                onChange={(e) => handleItemRowChange(row.id, 'qty', e.target.value)}
                                                                className="w-20 px-2 py-1 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm text-center bg-transparent"
                                                                placeholder="Qty"
                                                            />
                                                        </td>
                                                        <td className="px-2 py-2 border-r border-gray-200">
                                                            <SearchableDropdown
                                                                options={getRowUomOptions(row)}
                                                                value={row.uom}
                                                                onChange={(val) => handleItemRowChange(row.id, 'uom', val)}
                                                                placeholder="UOM"
                                                            />
                                                        </td>
                                                        <td className="px-2 py-2 border-r border-gray-200">
                                                            <input
                                                                type="text"
                                                                value={row.alternateUnit}
                                                                readOnly
                                                                className="w-24 px-2 py-1 bg-gray-50 bg-opacity-50 border-0 rounded text-sm"
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
                                                                    ? 'bg-gray-100 bg-opacity-50 text-gray-600 cursor-not-allowed select-none'
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
                                                                className="w-24 px-2 py-1 bg-gray-50 bg-opacity-50 border-0 rounded text-sm"
                                                            />
                                                        </td>
                                                        {!isTaxHidden && (
                                                            !isInterState ? (
                                                                <>
                                                                    <td className="px-2 py-2 border-r border-gray-200">
                                                                        <input
                                                                            type="number"
                                                                            value={row.cgst}
                                                                            min="0"
                                                                            onChange={(e) => handleItemRowChange(row.id, 'cgst', e.target.value)}
                                                                            className="w-20 px-2 py-1 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm bg-transparent"
                                                                            placeholder="CGST"
                                                                        />
                                                                    </td>
                                                                    <td className="px-2 py-2 border-r border-gray-200">
                                                                        <input
                                                                            type="number"
                                                                            value={row.sgst}
                                                                            min="0"
                                                                            onChange={(e) => handleItemRowChange(row.id, 'sgst', e.target.value)}
                                                                            className="w-20 px-2 py-1 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm bg-transparent"
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
                                                                        className="w-20 px-2 py-1 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm bg-transparent"
                                                                        placeholder="IGST"
                                                                    />
                                                                </td>
                                                            )
                                                        )}
                                                        {!isCessHidden && (
                                                            <td className="px-2 py-2 border-r border-gray-200">
                                                                <input
                                                                    type="number"
                                                                    value={row.cess}
                                                                    min="0"
                                                                    onChange={(e) => handleItemRowChange(row.id, 'cess', e.target.value)}
                                                                    className="w-20 px-2 py-1 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm bg-transparent"
                                                                    placeholder="CESS"
                                                                />
                                                            </td>
                                                        )}
                                                        <td className="px-2 py-2 border-r border-gray-200">
                                                            <input
                                                                type="text"
                                                                value={row.invoiceValue}
                                                                readOnly
                                                                className="w-28 px-2 py-1 bg-gray-50 bg-opacity-50 border-0 rounded text-sm font-medium"
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
                                                    <tr className={`border-b border-gray-200 ${rowColorClass || 'bg-gray-50'} ${!isSelected ? 'opacity-50' : ''}`}>
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
                                                        <td colSpan={!isInterState ? 10 : 9} className="px-2 py-2">
                                                            <div className="flex items-center gap-2">
                                                                <label className="text-xs font-medium text-gray-700 whitespace-nowrap">ledger narration:</label>
                                                                <input
                                                                    type="text"
                                                                    value={row.description}
                                                                    onChange={(e) => handleItemRowChange(row.id, 'description', e.target.value)}
                                                                    placeholder="Enter ledger narration"
                                                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm bg-white bg-opacity-80 focus:ring-1 focus:ring-indigo-500"
                                                                />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                </React.Fragment>
                                            );
                                        })}

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
                                            {!isTaxHidden && (
                                                !isInterState ? (
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
                                                )
                                            )}
                                            {!isCessHidden && (
                                                <td className="px-2 py-2">
                                                    <input
                                                        type="text"
                                                        value={calculateTotals().cess.toFixed(2)}
                                                        readOnly
                                                        className="w-20 px-2 py-1 bg-white border border-gray-300 rounded text-sm font-semibold text-center"
                                                    />
                                                </td>
                                            )}
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

                            {/* Error Banners */}
                            <div className="space-y-3">
                                {qtyMismatchError && (
                                    <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-300 rounded-[4px] text-red-700 text-sm font-medium">
                                        <svg className="w-5 h-5 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                        </svg>
                                        {qtyMismatchError}
                                    </div>
                                )}

                                {outwardSlipError && (
                                    <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-300 rounded-[4px] text-red-700 text-sm font-medium">
                                        <svg className="w-5 h-5 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                        </svg>
                                        {outwardSlipError}
                                    </div>
                                )}
                            </div>

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
                                            if (validateQtyMatch() && validateOutwardSlipMatch()) {
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
                    )
                }

                {
                    activeTab === 'payment' && (
                        <div className="space-y-6">
                            {/* Tax Summary Table */}
                            <div className="border border-gray-300 rounded-[4px] overflow-hidden">
                                <table className="w-full">
                                    <thead className="bg-gray-100">
                                        <tr>
                                            <th className="px-4 py-2 text-sm font-semibold text-gray-700 border-r border-gray-300">Taxable Value</th>
                                            {isInterState && (
                                                <th className="px-4 py-2 text-sm font-semibold text-gray-700 border-r border-gray-300">IGST</th>
                                            )}
                                            {!isInterState && (
                                                <>
                                                    <th className="px-4 py-2 text-sm font-semibold text-gray-700 border-r border-gray-300">CGST</th>
                                                    <th className="px-4 py-2 text-sm font-semibold text-gray-700 border-r border-gray-300">SGST/UTGST</th>
                                                </>
                                            )}
                                            {!isCessHidden && (
                                                <>
                                                    <th className="px-4 py-2 text-sm font-semibold text-gray-700 border-r border-gray-300">Cess</th>
                                                    <th className="px-4 py-2 text-sm font-semibold text-gray-700">State Cess</th>
                                                </>
                                            )}
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
                                            {isInterState && (
                                                <td className="px-4 py-3 border-r border-gray-300">
                                                    <input
                                                        type="text"
                                                        value={calculateTotals().igst.toFixed(2)}
                                                        readOnly
                                                        className="w-full px-2 py-1 bg-gray-50 border-0 rounded text-sm text-center"
                                                    />
                                                </td>
                                            )}
                                            {!isInterState && (
                                                <>
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
                                                </>
                                            )}
                                            {!isCessHidden && (
                                                <>
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
                                                </>
                                            )}
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
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="block text-sm font-medium text-gray-700">
                                                TDS/TCS under Income Tax
                                            </label>
                                            <div className="flex gap-1">
                                                {customerTcsRate > 0 && (
                                                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5" title="TCS Rate">
                                                        TCS: {(customerTcsRate * 100).toFixed(customerTcsRate < 0.01 ? 2 : 0)}%
                                                    </span>
                                                )}
                                                {customerTdsRate > 0 && (
                                                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5" title="TDS Rate">
                                                        TDS: {(customerTdsRate * 100).toFixed(customerTdsRate < 0.01 ? 2 : 0)}%
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <input
                                            type="text"
                                            value={paymentTdsIncomeTax}
                                            readOnly
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-right cursor-not-allowed"
                                            placeholder="0.00"
                                            title={customerTcsRate + customerTdsRate > 0
                                                ? `Auto-calculated: Invoice Value × ${((customerTcsRate + customerTdsRate) * 100).toFixed(2)}%`
                                                : 'No TCS or TDS rate configured for this customer'}
                                        />
                                        {customerTcsRate === 0 && customerTdsRate === 0 && (
                                            <p className="text-xs text-gray-400 mt-1">No TDS/TCS section configured for this customer</p>
                                        )}
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
                                            Gross Amount Receivable
                                        </label>
                                        <input
                                            type="text"
                                            value={(() => {
                                                const invVal = calculateTotals().invoiceValue;
                                                const tdsIT = parseFloat(paymentTdsIncomeTax) || 0;
                                                const tdsGst = parseFloat(paymentTdsGst) || 0;
                                                const isTcsActive = customerTcsEnabled || customerTcsRate > 0;

                                                // If TCS is configured: Invoice Value + IT - GST
                                                if (isTcsActive) {
                                                    return (invVal + tdsIT - tdsGst).toFixed(2);
                                                }
                                                // Default/TDS configured: Invoice Value - IT - GST
                                                return (invVal - tdsIT - tdsGst).toFixed(2);
                                            })()}
                                            readOnly
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-right cursor-not-allowed"
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
                    )
                }

                {/* Terms & Conditions Master Modal */}
                {
                    isTermsModalOpen && (
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
                    )
                }

                {
                    activeTab === 'dispatch' && (
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
                                            max={new Date().toISOString().split('T')[0]}
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
                                            onChange={(e) => {
                                                const val = e.target.value.toUpperCase();
                                                if (val.length <= 15) setTransporterId(val);
                                            }}
                                            maxLength={15}
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
                                                        onChange={(e) => {
                                                            const val = e.target.value.toUpperCase();
                                                            if (val.length <= 15) setTransporterId(val);
                                                        }}
                                                        maxLength={15}
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
                                                        onChange={(e) => {
                                                            const val = e.target.value.toUpperCase();
                                                            if (val.length <= 15) setTransporterId(val);
                                                        }}
                                                        maxLength={15}
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
                    )
                }

                {
                    activeTab === 'einvoice' && (
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

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Ack. Date
                                        </label>
                                        <input
                                            type="date"
                                            value={ackDate}
                                            onChange={(e) => setAckDate(e.target.value)}
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
                                    onClick={handlePostAndPrint}
                                    className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[4px] transition-colors font-medium flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
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
            {/* Sales Supporting Document Preview Modal */}
            {
                isSalesPreviewModalOpen && (
                    <div className="fixed inset-0 bg-black/75 z-[100] flex flex-col items-center justify-center p-4 backdrop-blur-sm">
                        <div className="w-full h-full max-w-6xl bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden animate-zoom-in">
                            {/* Modal Header */}
                            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900 leading-none">
                                            Document Preview
                                        </h3>
                                        <p className="text-sm text-gray-500 mt-1">
                                            {supportingDocument?.name}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    {salesPreviewUrl && (
                                        <a
                                            href={salesPreviewUrl}
                                            download={supportingDocument?.name}
                                            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                            Download
                                        </a>
                                    )}
                                    <button
                                        onClick={() => setIsSalesPreviewModalOpen(false)}
                                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                                    >
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div className="flex-1 bg-gray-100/50 relative overflow-auto flex items-center justify-center">
                                {supportingDocument?.type.startsWith('image/') ? (
                                    <img
                                        src={salesPreviewUrl || ''}
                                        alt="Full Preview"
                                        className="max-w-full max-h-full object-contain p-4"
                                    />
                                ) : (
                                    <iframe
                                        src={salesPreviewUrl || ''}
                                        className="w-full h-full border-none bg-white"
                                        title="PDF Preview"
                                    />
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-center">
                                <button
                                    onClick={() => setIsSalesPreviewModalOpen(false)}
                                    className="px-10 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95"
                                >
                                    Close Preview
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* ===================== PRINT PREVIEW MODAL ===================== */}
            {
                showPrintPreview && postedVoucherData && (
                    <div className="fixed inset-0 bg-black/80 z-[200] flex flex-col items-center justify-center p-4 backdrop-blur-sm">
                        <div className="w-full max-w-4xl bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '95vh' }}>
                            {/* Modal Header */}
                            <div className="flex justify-between items-center px-6 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white">
                                <div className="flex items-center gap-3">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    <div>
                                        <h3 className="text-lg font-bold">Invoice Print Preview</h3>
                                        <p className="text-indigo-200 text-xs">Invoice #{postedVoucherData.sales_invoice_no}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => {
                                            const printContent = document.getElementById('sales-invoice-print-area');
                                            if (!printContent) return;
                                            const win = window.open('', '_blank');
                                            if (!win) return;
                                            win.document.write(`<html><head><title>Invoice ${postedVoucherData.sales_invoice_no}</title><style>body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#111}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;font-size:13px}th{background:#f5f5f5;font-weight:600}@media print{body{padding:0}}</style></head><body>${printContent.innerHTML}</body></html>`);
                                            win.document.close();
                                            win.focus();
                                            win.print();
                                        }}
                                        className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                        Print
                                    </button>
                                    <button
                                        onClick={() => setShowPrintPreview(false)}
                                        className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            </div>

                            {/* Invoice Content */}
                            <div className="flex-1 overflow-auto bg-gray-100 p-6">
                                <div id="sales-invoice-print-area" className="bg-white rounded-lg shadow-sm max-w-3xl mx-auto p-8">
                                    {/* Company Header */}
                                    <div className="flex justify-between items-start mb-6 pb-6 border-b-2 border-indigo-600">
                                        <div>
                                            {companyInfo?.logo_path && (
                                                <img src={companyInfo.logo_path} alt="Logo" className="h-12 mb-2 object-contain" />
                                            )}
                                            <h2 className="text-xl font-bold text-gray-900">{companyInfo?.company_name || 'Your Company'}</h2>
                                            <p className="text-sm text-gray-500">{companyInfo?.address_line1 || ''}{companyInfo?.city ? `, ${companyInfo.city}` : ''}{companyInfo?.state ? `, ${companyInfo.state}` : ''}{companyInfo?.pincode ? ` - ${companyInfo.pincode}` : ''}</p>
                                            {companyInfo?.gstin && <p className="text-xs text-gray-500 mt-1">GSTIN: {companyInfo.gstin}</p>}
                                            {companyInfo?.phone && <p className="text-xs text-gray-500">Ph: {companyInfo.phone}</p>}
                                        </div>
                                        <div className="text-right">
                                            <div className="inline-block bg-indigo-600 text-white text-xs font-bold px-4 py-1 rounded-full mb-3">TAX INVOICE</div>
                                            <table className="text-sm text-right">
                                                <tbody>
                                                    <tr><td className="pr-4 text-gray-500 font-medium">Invoice No.</td><td className="font-bold text-gray-900">{postedVoucherData.sales_invoice_no}</td></tr>
                                                    <tr><td className="pr-4 text-gray-500 font-medium">Date</td><td className="font-bold text-gray-900">{postedVoucherData.date}</td></tr>
                                                    {postedVoucherData.voucher_name && <tr><td className="pr-4 text-gray-500 font-medium">Voucher</td><td className="text-gray-700">{postedVoucherData.voucher_name}</td></tr>}
                                                    {postedVoucherData.sales_order_no && <tr><td className="pr-4 text-gray-500 font-medium">Order Ref.</td><td className="text-gray-700">{postedVoucherData.sales_order_no}</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Bill To / Ship To */}
                                    <div className="grid grid-cols-2 gap-6 mb-6">
                                        <div className="bg-gray-50 rounded-lg p-4">
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Bill To</p>
                                            <p className="font-semibold text-gray-900">{postedVoucherData.customer_name}</p>
                                            {postedVoucherData.gstin && <p className="text-xs text-gray-500">GSTIN: {postedVoucherData.gstin}</p>}
                                            {postedVoucherData.contact && <p className="text-xs text-gray-500">Contact: {postedVoucherData.contact}</p>}
                                            {postedVoucherData.billTo && (
                                                <p className="text-xs text-gray-600 mt-1">
                                                    {[postedVoucherData.billTo.address_line_1, postedVoucherData.billTo.address_line_2, postedVoucherData.billTo.address_line_3, postedVoucherData.billTo.city, postedVoucherData.billTo.state, postedVoucherData.billTo.pincode].filter(Boolean).join(', ')}
                                                </p>
                                            )}
                                        </div>
                                        <div className="bg-gray-50 rounded-lg p-4">
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ship To</p>
                                            {postedVoucherData.shipTo && (
                                                <p className="text-xs text-gray-600">
                                                    {[postedVoucherData.shipTo.address_line_1, postedVoucherData.shipTo.address_line_2, postedVoucherData.shipTo.city, postedVoucherData.shipTo.state, postedVoucherData.shipTo.pincode].filter(Boolean).join(', ') || 'Same as Billing Address'}
                                                </p>
                                            )}
                                            {postedVoucherData.place_of_supply && <p className="text-xs text-gray-500 mt-1">Place of Supply: {postedVoucherData.place_of_supply}</p>}
                                            {postedVoucherData.tax_type && <p className="text-xs text-gray-500">Tax Type: {postedVoucherData.tax_type}</p>}
                                            {postedVoucherData.invoice_type && <p className="text-xs text-gray-500">Nature of Supply: {postedVoucherData.invoice_type}</p>}
                                            {postedVoucherData.reverse_charge === 'Y' && <p className="text-xs text-amber-600 font-medium mt-1">⚠ Reverse Charge Applicable</p>}
                                        </div>
                                    </div>

                                    {/* ── SECTION: Item & Tax Details ── */}
                                    <div className="mb-6">
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="h-px flex-1 bg-gray-200" />
                                            <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest px-2">Item &amp; Tax Details</span>
                                            <div className="h-px flex-1 bg-gray-200" />
                                        </div>
                                        <table className="w-full text-sm mb-3" style={{ borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: '#4f46e5', color: 'white' }}>
                                                    <th style={{ padding: '9px 6px', textAlign: 'left', fontWeight: 600 }}>#</th>
                                                    <th style={{ padding: '9px 6px', textAlign: 'left', fontWeight: 600 }}>Item / Description</th>
                                                    <th style={{ padding: '9px 6px', textAlign: 'center', fontWeight: 600 }}>HSN</th>
                                                    <th style={{ padding: '9px 6px', textAlign: 'center', fontWeight: 600 }}>Qty</th>
                                                    <th style={{ padding: '9px 6px', textAlign: 'right', fontWeight: 600 }}>Rate</th>
                                                    <th style={{ padding: '9px 6px', textAlign: 'right', fontWeight: 600 }}>Taxable</th>
                                                    {Number(postedVoucherData.totals?.cgst || 0) > 0 && <th style={{ padding: '9px 6px', textAlign: 'right', fontWeight: 600 }}>CGST</th>}
                                                    {Number(postedVoucherData.totals?.sgst || 0) > 0 && <th style={{ padding: '9px 6px', textAlign: 'right', fontWeight: 600 }}>SGST</th>}
                                                    {Number(postedVoucherData.totals?.igst || 0) > 0 && <th style={{ padding: '9px 6px', textAlign: 'right', fontWeight: 600 }}>IGST</th>}
                                                    {Number(postedVoucherData.totals?.cess || 0) > 0 && <th style={{ padding: '9px 6px', textAlign: 'right', fontWeight: 600 }}>Cess</th>}
                                                    <th style={{ padding: '9px 6px', textAlign: 'right', fontWeight: 600 }}>Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(postedVoucherData.items || []).map((item: any, i: number) => (
                                                    <tr key={i} style={{ background: i % 2 === 0 ? '#fafafa' : '#ffffff', borderBottom: '1px solid #e5e7eb' }}>
                                                        <td style={{ padding: '7px 6px', color: '#6b7280' }}>{i + 1}</td>
                                                        <td style={{ padding: '7px 6px' }}>
                                                            <div className="font-medium text-gray-900">{item.item_name || item.item_code}</div>
                                                            {item.description && <div className="text-xs text-gray-500">{item.description}</div>}
                                                            {item.sales_ledger && <div className="text-xs text-indigo-500">{item.sales_ledger}</div>}
                                                            {item.alternate_unit && <div className="text-xs text-gray-400">Alt: {item.alternate_unit}</div>}
                                                        </td>
                                                        <td style={{ padding: '7px 6px', textAlign: 'center', color: '#6b7280' }}>{item.hsn_sac || '-'}</td>
                                                        <td style={{ padding: '7px 6px', textAlign: 'center' }}>{item.qty} {item.uom}</td>
                                                        <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'monospace' }}>₹{Number(item.item_rate).toFixed(2)}</td>
                                                        <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'monospace' }}>₹{Number(item.taxable_value).toFixed(2)}</td>
                                                        {Number(postedVoucherData.totals?.cgst || 0) > 0 && <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'monospace' }}>₹{Number(item.cgst).toFixed(2)}</td>}
                                                        {Number(postedVoucherData.totals?.sgst || 0) > 0 && <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'monospace' }}>₹{Number(item.sgst).toFixed(2)}</td>}
                                                        {Number(postedVoucherData.totals?.igst || 0) > 0 && <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'monospace' }}>₹{Number(item.igst).toFixed(2)}</td>}
                                                        {Number(postedVoucherData.totals?.cess || 0) > 0 && <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'monospace' }}>₹{Number(item.cess).toFixed(2)}</td>}
                                                        <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>₹{Number(item.invoice_value).toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        <div className="flex justify-end">
                                            <div className="w-72 bg-indigo-50 rounded-lg p-4 border border-indigo-100">
                                                <div className="space-y-1.5 text-sm">
                                                    <div className="flex justify-between"><span className="text-gray-500">Taxable Amount</span><span className="font-mono">₹{Number(postedVoucherData.totals?.taxableValue || 0).toFixed(2)}</span></div>
                                                    {Number(postedVoucherData.totals?.cgst || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">CGST</span><span className="font-mono">₹{Number(postedVoucherData.totals.cgst).toFixed(2)}</span></div>}
                                                    {Number(postedVoucherData.totals?.sgst || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">SGST</span><span className="font-mono">₹{Number(postedVoucherData.totals.sgst).toFixed(2)}</span></div>}
                                                    {Number(postedVoucherData.totals?.igst || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">IGST</span><span className="font-mono">₹{Number(postedVoucherData.totals.igst).toFixed(2)}</span></div>}
                                                    {Number(postedVoucherData.totals?.cess || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">Cess</span><span className="font-mono">₹{Number(postedVoucherData.totals.cess).toFixed(2)}</span></div>}
                                                    <div className="flex justify-between pt-2 border-t-2 border-indigo-600">
                                                        <span className="font-bold text-gray-900 text-base">Grand Total</span>
                                                        <span className="font-bold text-indigo-700 text-base font-mono">₹{Number(postedVoucherData.totals?.invoiceValue || 0).toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── SECTION: Payment Details ── */}
                                    <div className="mb-6">
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="h-px flex-1 bg-gray-200" />
                                            <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest px-2">Payment Details</span>
                                            <div className="h-px flex-1 bg-gray-200" />
                                        </div>
                                        <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                                            {[
                                                { label: 'Invoice Value', value: postedVoucherData.payment_details?.payment_invoice_value },
                                                { label: 'TDS (Income Tax)', value: postedVoucherData.payment_details?.payment_tds_income_tax },
                                                { label: 'TDS (GST)', value: postedVoucherData.payment_details?.payment_tds_gst },
                                                { label: 'Advance Paid', value: postedVoucherData.payment_details?.payment_advance },
                                                ...(Number(postedVoucherData.payment_details?.payment_state_cess || 0) > 0 ? [{ label: 'State Cess', value: postedVoucherData.payment_details?.payment_state_cess }] : []),
                                                { label: 'Net Payable', value: postedVoucherData.payment_details?.payment_payable },
                                            ].map((row, i) => (
                                                <div key={i} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                                    <p className="text-xs text-gray-400 mb-1">{row.label}</p>
                                                    <p className="font-semibold text-gray-800 font-mono">₹{Number(row.value || 0).toFixed(2)}</p>
                                                </div>
                                            ))}
                                        </div>
                                        {postedVoucherData.payment_details?.posting_note && (
                                            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 mb-2">
                                                <p className="text-xs font-bold text-amber-700 mb-1">📝 Posting Note</p>
                                                <p className="text-xs text-gray-700">{postedVoucherData.payment_details.posting_note}</p>
                                            </div>
                                        )}
                                        {postedVoucherData.payment_details?.terms_conditions && (
                                            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                                <p className="text-xs font-bold text-gray-500 mb-1">Terms &amp; Conditions</p>
                                                <p className="text-xs text-gray-600 whitespace-pre-line">{postedVoucherData.payment_details.terms_conditions}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* ── SECTION: Dispatch Details ── */}
                                    {postedVoucherData.dispatch_details && Object.values(postedVoucherData.dispatch_details).some((v: any) => v && typeof v === 'string') && (
                                        <div className="mb-6">
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="h-px flex-1 bg-gray-200" />
                                                <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest px-2">Dispatch Details</span>
                                                <div className="h-px flex-1 bg-gray-200" />
                                            </div>
                                            <div className="grid grid-cols-3 gap-3 text-sm">
                                                {[
                                                    { label: 'Dispatch From', value: postedVoucherData.dispatch_details.dispatch_from },
                                                    { label: 'Mode of Transport', value: postedVoucherData.dispatch_details.mode_of_transport },
                                                    { label: 'Dispatch Date', value: postedVoucherData.dispatch_details.dispatch_date },
                                                    { label: 'Dispatch Time', value: postedVoucherData.dispatch_details.dispatch_time },
                                                    { label: 'Delivery Type', value: postedVoucherData.dispatch_details.delivery_type },
                                                    { label: 'Self / 3rd Party', value: postedVoucherData.dispatch_details.self_third_party },
                                                    { label: 'Transporter ID', value: postedVoucherData.dispatch_details.transporter_id },
                                                    { label: 'Transporter Name', value: postedVoucherData.dispatch_details.transporter_name },
                                                    { label: 'Vehicle No.', value: postedVoucherData.dispatch_details.vehicle_no },
                                                    { label: 'LR/GR/Consignment', value: postedVoucherData.dispatch_details.lr_gr_consignment },
                                                ].filter(r => r.value).map((row, i) => (
                                                    <div key={i} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                                        <p className="text-xs text-gray-400 mb-1">{row.label}</p>
                                                        <p className="text-sm font-medium text-gray-800">{row.value}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* ── SECTION: E-Invoice & E-way Bill ── */}
                                    {(postedVoucherData.eway_bill_details || []).some((e: any) => e.eway_bill_no || e.irn || e.ack_no) && (
                                        <div className="mb-6">
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="h-px flex-1 bg-gray-200" />
                                                <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest px-2">E-Invoice &amp; E-way Bill</span>
                                                <div className="h-px flex-1 bg-gray-200" />
                                            </div>
                                            {(postedVoucherData.eway_bill_details || []).map((eway: any, i: number) => (
                                                <div key={i} className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-3">
                                                    <p className="text-xs font-bold text-blue-600 mb-2">E-way Bill #{i + 1}</p>
                                                    <div className="grid grid-cols-3 gap-3 text-xs">
                                                        {[
                                                            { label: 'E-way Bill No.', value: eway.eway_bill_no },
                                                            { label: 'Date', value: eway.eway_bill_date },
                                                            { label: 'Validity Period', value: eway.validity_period },
                                                            { label: 'Distance', value: eway.distance },
                                                            { label: 'IRN', value: eway.irn },
                                                            { label: 'Ack. No.', value: eway.ack_no },
                                                        ].filter(r => r.value).map((row, j) => (
                                                            <div key={j}>
                                                                <p className="text-gray-400">{row.label}</p>
                                                                <p className="font-medium text-gray-700 break-all">{row.value}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Footer: Bank Details + Signature */}
                                    <div className="border-t-2 border-gray-200 pt-4 flex justify-between items-end">
                                        <div>
                                            {companyInfo?.bank_name && (
                                                <div className="text-xs text-gray-500">
                                                    <p className="font-semibold text-gray-700 mb-1">Bank Details</p>
                                                    <p>{companyInfo.bank_name}</p>
                                                    {companyInfo.bank_account_no && <p>A/C: {companyInfo.bank_account_no}</p>}
                                                    {companyInfo.bank_ifsc && <p>IFSC: {companyInfo.bank_ifsc}</p>}
                                                    {companyInfo.bank_branch && <p>Branch: {companyInfo.bank_branch}</p>}
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <div className="border-t border-gray-400 pt-2 w-44 text-xs text-gray-500 text-center">Authorised Signature</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer Buttons */}
                            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
                                <button
                                    onClick={() => setShowPrintPreview(false)}
                                    className="px-6 py-2.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-100 text-sm font-medium transition-colors"
                                >
                                    Close
                                </button>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => {
                                            const printContent = document.getElementById('sales-invoice-print-area');
                                            if (!printContent) return;
                                            const win = window.open('', '_blank');
                                            if (!win) return;
                                            win.document.write(`<html><head><title>Invoice ${postedVoucherData.sales_invoice_no}</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;padding:30px;color:#111;font-size:13px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;font-size:12px}th{background:#f5f5f5;font-weight:600}h2{margin:0}@page{margin:15mm}@media print{body{padding:0}}</style></head><body>${printContent.innerHTML}</body></html>`);
                                            win.document.close();
                                            setTimeout(() => { win.focus(); win.print(); }, 500);
                                        }}
                                        className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                        Print Invoice
                                    </button>
                                    <button
                                        onClick={() => {
                                            const email = prompt('Enter recipient email address:');
                                            if (email) {
                                                const subject = encodeURIComponent(`Invoice ${postedVoucherData.sales_invoice_no} from ${companyInfo?.company_name || 'Our Company'}`);
                                                const body = encodeURIComponent(`Dear ${postedVoucherData.customer_name},\n\nPlease find attached Invoice No. ${postedVoucherData.sales_invoice_no} dated ${postedVoucherData.date}.\n\nTotal Amount: ₹${Number(postedVoucherData.totals?.invoiceValue || 0).toFixed(2)}\n\nThank you for your business.\n\nRegards,\n${companyInfo?.company_name || ''}`);
                                                window.open(`mailto:${email}?subject=${subject}&body=${body}`);
                                            }
                                        }}
                                        className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                        Email Invoice
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default SalesVoucher;


