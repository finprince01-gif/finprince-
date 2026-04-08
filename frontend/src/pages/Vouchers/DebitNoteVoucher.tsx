import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { ExtractedInvoiceData, CompanyDetails, Voucher } from '../../types';
import { apiService, httpClient } from '../../services';
import { showError, showSuccess, showInfo } from '../../utils/toast';
import SearchableDropdown from '../../components/SearchableDropdown';
import CreateIssueSlipModal from '../../components/CreateIssueSlipModal';
import CreateNewVendorFullModal from '../../components/CreateNewVendorFullModal';
import { ChevronDown, Search, X, Trash2 } from 'lucide-react';

export interface ItemRow {
    id: number | string;
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
    cessRate: string;
    invoiceValue: string;
    purchaseLedger: string;
    description: string;
    alternateUnit: string;
    gstRate?: string;
    selected?: boolean;
    reasonForReturn?: string;
    invoiceRef?: string;
    fcRate?: string;
    fcAmount?: string;
    ledgerNarration?: string;
    maxQty?: string | number;
}

interface DebitNoteVoucherProps {
    prefilledData?: ExtractedInvoiceData | null;
    clearPrefilledData?: () => void;
    companyDetails: CompanyDetails;
    onAddVouchers: (vouchers: Voucher[]) => void;
}

const DebitNoteVoucher: React.FC<DebitNoteVoucherProps> = ({
    prefilledData,
    clearPrefilledData,
    companyDetails,
    onAddVouchers
}) => {
    const [activeTab, setActiveTab] = useState('invoice');

    // Form States
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [voucherSeries, setVoucherSeries] = useState<any[]>([]);
    const [selectedSeriesId, setSelectedSeriesId] = useState<number | string>('');
    const [debitNoteNo, setDebitNoteNo] = useState('');
    const [vendorName, setVendorName] = useState('');
    const [vendors, setVendors] = useState<any[]>([]);
    const [ledgers, setLedgers] = useState<any[]>([]);
    const [vendorBranch, setVendorBranch] = useState('');
    const [branches, setBranches] = useState<any[]>([]);
    const [isCreateVendorModalOpen, setIsCreateVendorModalOpen] = useState(false);
    const [supplierInvoiceNos, setSupplierInvoiceNos] = useState<string[]>([]);
    const [selectedSupplierInvoices, setSelectedSupplierInvoices] = useState<string[]>([]);
    const [allPurchaseInvoices, setAllPurchaseInvoices] = useState<any[]>([]);
    const [purchaseVoucherNo, setPurchaseVoucherNo] = useState('');
    const [purchaseVoucherDate, setPurchaseVoucherDate] = useState('');
    const [gstin, setGstin] = useState('');
    const [document, setDocument] = useState<File | null>(null);
    const [outwardSlipNos, setOutwardSlipNos] = useState<string[]>([]);
    const [pendingOutwardSlips, setPendingOutwardSlips] = useState<any[]>([]);
    const [isIssueSlipModalOpen, setIsIssueSlipModalOpen] = useState(false);
    const [natureOfSupply, setNatureOfSupply] = useState('Regular');
    const [reverseCharge, setReverseCharge] = useState('No');
    const [placeOfSupply, setPlaceOfSupply] = useState('');
    const [billToAddress, setBillToAddress] = useState('');
    const [shipToAddress, setShipToAddress] = useState('');
    const [sameAsBillTo, setSameAsBillTo] = useState(false);
    const [itemRows, setItemRows] = useState<ItemRow[]>([{
        id: Date.now(),
        itemCode: '', itemName: '', hsnSac: '', qty: '0', uom: '', alternateUnit: '',
        itemRate: '0', taxableValue: '0', igst: '0', cgst: '0', sgst: '0', cess: '0', cessRate: '0',
        invoiceValue: '0', purchaseLedger: '', description: '', gstRate: '0', selected: true,
        reasonForReturn: '', invoiceRef: '', fcRate: '0', fcAmount: '0',
        ledgerNarration: ''
    }]);

    // Foreign Currency States
    const [exchangeRate, setExchangeRate] = useState('1');
    const [foreignCurrency, setForeignCurrency] = useState('USD');

    // Payment Tab States
    const [reverseTcs, setReverseTcs] = useState('');
    const [reverseTds, setReverseTds] = useState('');
    const [tdsIt, setTdsIt] = useState('');
    const [purchaseInvoiceAmountApplied, setPurchaseInvoiceAmountApplied] = useState('');
    const [termsAndConditions, setTermsAndConditions] = useState('');

    const totalTaxable = itemRows.reduce((sum, item) => sum + (parseFloat(item.taxableValue) || 0), 0);
    const totalIgst = itemRows.reduce((sum, item) => sum + (parseFloat(item.igst) || 0), 0);
    const totalCgst = itemRows.reduce((sum, item) => sum + (parseFloat(item.cgst) || 0), 0);
    const totalSgst = itemRows.reduce((sum, item) => sum + (parseFloat(item.sgst) || 0), 0);
    const totalCess = itemRows.reduce((sum, item) => sum + (parseFloat(item.cess) || 0), 0);
    const totalInvoiceValue = itemRows.reduce((sum, item) => sum + (parseFloat(item.invoiceValue) || 0), 0);

    const grossAmountDue = (
        totalInvoiceValue
        + (parseFloat(reverseTcs) || 0)
        - (parseFloat(reverseTds) || 0)
        - (parseFloat(tdsIt) || 0)
    );

    const netAmountDue = grossAmountDue - (parseFloat(purchaseInvoiceAmountApplied) || 0);

    // Dispatch Tab States
    const [dispatchFrom, setDispatchFrom] = useState('');
    const [modeOfTransport, setModeOfTransport] = useState('Road');
    const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().split('T')[0]);
    const [dispatchTime, setDispatchTime] = useState('');

    const [deliveryType, setDeliveryType] = useState('Self');
    const [transporterIdGstin, setTransporterIdGstin] = useState('');
    const [transporterName, setTransporterName] = useState('');
    const [vehicleNo, setVehicleNo] = useState('');
    const [lrGrConsignmentNo, setLrGrConsignmentNo] = useState('');

    // Beyond Port (Air/Sea/Rail) properties
    const [shippingBillNo, setShippingBillNo] = useState('');
    const [shippingBillDate, setShippingBillDate] = useState('');
    const [shipPortCode, setShipPortCode] = useState('');
    const [vesselFlightNo, setVesselFlightNo] = useState('');
    const [portOfLoading, setPortOfLoading] = useState('');
    const [portOfDischarge, setPortOfDischarge] = useState('');

    const [railwayReceiptNo, setRailwayReceiptNo] = useState('');
    const [railwayReceiptDate, setRailwayReceiptDate] = useState('');
    const [fnrNo, setFnrNo] = useState('');
    const [stationOfLoading, setStationOfLoading] = useState('');
    const [stationOfDischarge, setStationOfDischarge] = useState('');

    const [originCity, setOriginCity] = useState('');
    const [originCountry, setOriginCountry] = useState('');
    const [destinationCity, setDestinationCity] = useState('');
    const [destinationCountry, setDestinationCountry] = useState('');
    const [narration, setNarration] = useState('');

    // Memoized available items from selected invoices
    const availableItems = useMemo(() => {
        const items: any[] = [];
        allPurchaseInvoices
            .filter(inv => selectedSupplierInvoices.includes(inv.invoice_no))
            .forEach(inv => {
                const invItems = inv.supply_inr_details?.items || inv.supply_foreign_details?.items || inv.items_data || [];
                invItems.forEach((item: any) => {
                    items.push({
                        ...item,
                        invoice_no: inv.invoice_no,
                        purchase_ledger: inv.supply_inr_details?.purchase_ledger || inv.supply_foreign_details?.purchase_ledger || ''
                    });
                });
            });
        return items;
    }, [allPurchaseInvoices, selectedSupplierInvoices]);


    // Fetch initial data on mount
    useEffect(() => {
        const fetchInitialData = async () => {
            // Fetch series
            try {
                const res = await apiService.getDebitNoteSeries();
                const series = Array.isArray(res) ? res : ((res as any).results || []);
                setVoucherSeries(series);
                if (series && series.length === 1) {
                    setSelectedSeriesId(series[0].id);
                }
            } catch (error) {
                console.error("Error fetching Debit Note series:", error);
            }

            // Fetch vendors
            try {
                const res = await apiService.getRichVendors();
                const vds = Array.isArray(res) ? res : ((res as any).results || []);
                setVendors(vds);
            } catch (error) {
                console.error("Error fetching vendors:", error);
            }

            // Fetch ledgers
            try {
                const res = await apiService.getLedgers();
                const lds = Array.isArray(res) ? res : ((res as any).results || []);
                setLedgers(lds);
            } catch (error) {
                console.error("Error fetching ledgers:", error);
            }
        };
        fetchInitialData();
    }, []);

    const handleVendorChange = async (name: string) => {
        setVendorName(name);
        setGstin('');
        setBillToAddress('');

        const vendor = vendors.find(v => v.vendor_name === name);
        if (vendor) {
            try {
                const gstDetailsRes = await apiService.getVendorGSTDetails(vendor.id);
                const gstDetails = Array.isArray(gstDetailsRes) ? gstDetailsRes : ((gstDetailsRes as any).results || []);
                setBranches(gstDetails);

                // If only one branch, auto-select it
                if (gstDetails.length === 1) {
                    handleBranchChange(gstDetails[0].reference_name, name, vendor.id);
                } else {
                    // Pre-fetch transactions for the whole vendor (Procurement Source)
                    fetchVendorTransactions(vendor.id, name);
                }
            } catch (error) {
                console.error("Error fetching vendor GST details:", error);
            }
        }
    };

    const fetchVendorTransactions = async (vId: number, vName: string, branchName?: string) => {
        try {
            // 1. Fetch from Procurement Source (Unified Transactions)
            const transactionsRes = await apiService.getVendorTransactions(vId);
            const transactions = Array.isArray(transactionsRes) ? transactionsRes : ((transactionsRes as any).results || []);

            // 2. Fetch from Voucher Source (Historical Purchase Vouchers)
            const prevInvoicesRes = await apiService.getVendorPurchaseInvoices(vName, branchName);
            const prevVouchers = Array.isArray(prevInvoicesRes) ? prevInvoicesRes : ((prevInvoicesRes as any).results || []);

            // Normalize and Merge
            const allInvsMap = new Map();

            // First source: PROCUREMENT (Reference number priority)
            // If branch is selected, only keep transactions that match our branch-filtered vouchers
            const procurementSource = branchName
                ? transactions.filter((t: any) => {
                    const invNo = t.reference_number || t.transaction_number || '';
                    return prevVouchers.some((v: any) => (v.invoice_no === invNo || v.reference_no === invNo || v.supplier_invoice_no === invNo));
                })
                : transactions;

            procurementSource
                .filter((t: any) => (t.transaction_type || '').toLowerCase() === 'purchase')
                .forEach((t: any) => {
                    const invNo = t.reference_number || t.transaction_number;
                    if (invNo) {
                        allInvsMap.set(invNo, {
                            invoice_no: invNo,
                            purchase_voucher_no: t.transaction_number,
                            date: t.transaction_date,
                            total: t.total_amount,
                            due_status: t.due_status,
                            id: t.id
                        });
                    }
                });

            // Second source: Vouchers (Items data priority)
            prevVouchers.forEach((inv: any) => {
                const invNo = inv.invoice_no || inv.supplier_invoice_no || inv.reference_no;
                if (invNo) {
                    const existing = allInvsMap.get(invNo) || {};
                    allInvsMap.set(invNo, {
                        ...existing,
                        ...inv,
                        invoice_no: invNo, // Normalize key
                    });
                }
            });

            const mergedInvoices = Array.from(allInvsMap.values());
            setAllPurchaseInvoices(mergedInvoices);
            setSupplierInvoiceNos(mergedInvoices.map(inv => inv.invoice_no).filter(Boolean));

            // Fetch pending outward slips
            const slipsRes = await apiService.getPendingOutwardSlips(vName);
            const slips = Array.isArray(slipsRes) ? slipsRes : ((slipsRes as any).results || []);
            setPendingOutwardSlips(slips);
        } catch (error) {
            console.error("Error fetching vendor transactions:", error);
        }
    };

    const handleBranchChange = async (branchName: string, explicitVendorName?: string, explicitVendorId?: number) => {
        const vName = explicitVendorName || vendorName;
        setVendorBranch(branchName);
        const branch = branches.find(b => b.reference_name === branchName);
        if (branch) {
            setGstin(branch.gstin || '');
            const addr = [
                branch.branch_address,
                branch.branch_city,
                branch.branch_state,
                branch.branch_pincode
            ].filter(Boolean).join(', ');
            setBillToAddress(addr);
            if (sameAsBillTo) {
                setShipToAddress(addr);
            }
            setPlaceOfSupply(branch.gst_state || '');

            // Fetch transactions if we have the ID
            const vId = explicitVendorId || vendors.find(v => v.vendor_name === vName)?.id;
            if (vId) {
                // Clear old data first to ensure clean state
                setAllPurchaseInvoices([]);
                setSupplierInvoiceNos([]);
                setSelectedSupplierInvoices([]);

                fetchVendorTransactions(vId, vName, branchName);
            }
        }
    };

    // Fetch next number when series changes
    useEffect(() => {
        if (selectedSeriesId) {
            const fetchNextNo = async () => {
                try {
                    const data = await apiService.getDebitNoteNextNumber(selectedSeriesId);
                    setDebitNoteNo(data.invoice_number);
                } catch (error) {
                    console.error("Error fetching next debit note number:", error);
                }
            };
            fetchNextNo();
        } else {
            setDebitNoteNo('');
        }
    }, [selectedSeriesId]);

    // E-Invoice & E-way Bill Details State
    const [ewayValidationEntries, setEwayValidationEntries] = useState<any[]>([{
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

    const handleEwayEntryChange = (id: number, field: string, value: string) => {
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

    const [irn, setIrn] = useState('');
    const [ackNo, setAckNo] = useState('');
    const [ackDate, setAckDate] = useState('');

    const updateItemRow = useCallback((index: number, updates: Partial<ItemRow>) => {
        setItemRows(prev => {
            const newRows = [...prev];
            const oldRow = newRows[index];
            let updatedRow = { ...oldRow, ...updates };

            // Logic for item selection (auto-fill)
            if (updates.itemCode || updates.itemName) {
                const selectedItem = availableItems.find(it =>
                    (updates.itemCode && it.itemCode === updates.itemCode) ||
                    (updates.itemName && it.itemName === updates.itemName)
                );
                if (selectedItem) {
                    updatedRow = {
                        ...updatedRow,
                        invoiceRef: selectedItem.invoice_no,
                        itemCode: selectedItem.itemCode,
                        itemName: selectedItem.itemName,
                        hsnSac: selectedItem.hsnSac || selectedItem.hsn_sac || '',
                        uom: selectedItem.uom || 'PCS',
                        itemRate: selectedItem.itemRate || selectedItem.rate || '0',
                        gstRate: selectedItem.gstRate || selectedItem.tax_rate || '0',
                        cessRate: selectedItem.cessRate || '0',
                        purchaseLedger: selectedItem.purchase_ledger || '',
                        maxQty: parseFloat(selectedItem.qty || '0')
                    };
                }
            }

            const qty = parseFloat(updatedRow.qty || '0') || 0;
            const maxQty = Number(updatedRow.maxQty || 0);

            // Limit quantity to billed quantity
            const finalQty = maxQty > 0 ? Math.min(qty, maxQty) : qty;
            if (finalQty !== qty) {
                updatedRow.qty = finalQty.toString();
            }

            const gstRate = parseFloat(updatedRow.gstRate || '0') || 0;
            const cessRate = parseFloat(updatedRow.cessRate || '0') || 0;
            const xr = parseFloat(exchangeRate) || 1;

            let itemRate = 0;
            let fcRate = parseFloat(updatedRow.fcRate || '0') || 0;
            let fcAmount = (qty * fcRate).toFixed(2);

            if (natureOfSupply === 'Re-Export') {
                itemRate = fcRate * xr;
                updatedRow.itemRate = itemRate.toFixed(2);
            } else {
                itemRate = parseFloat(updatedRow.itemRate || '0') || 0;
            }

            const taxableValue = qty * itemRate;
            let igst = 0, cgst = 0, sgst = 0;

            if (placeOfSupply === companyDetails.state) {
                cgst = taxableValue * (gstRate / 100) * 0.5;
                sgst = taxableValue * (gstRate / 100) * 0.5;
            } else {
                igst = taxableValue * (gstRate / 100);
            }

            const cess = taxableValue * (cessRate / 100);
            const invoiceValue = taxableValue + igst + cgst + sgst + cess;

            newRows[index] = {
                ...updatedRow,
                taxableValue: taxableValue.toFixed(2),
                igst: igst.toFixed(2),
                cgst: cgst.toFixed(2),
                sgst: sgst.toFixed(2),
                cess: cess.toFixed(2),
                invoiceValue: invoiceValue.toFixed(2),
                fcAmount: fcAmount
            };
            return newRows;
        });
    }, [exchangeRate, natureOfSupply, placeOfSupply, companyDetails.state]);

    // Recalculate all rows when exchangeRate or global factors change
    useEffect(() => {
        setItemRows(prev => prev.map((_, idx) => {
            // This is a bit inefficient but ensures everything stays in sync
            // A more elegant solution would be to derive these in render, 
            // but the state needs these values for submission.
            return _;
        }));
        // Actually, trigger a manual refresh logic or just use derived data.
        // For simplicity, let's just make sure updateItemRow is called on changes.
    }, [exchangeRate, natureOfSupply, placeOfSupply]);

    // Add logic to auto-fill when sameAsBillTo changes
    useEffect(() => {
        if (sameAsBillTo) {
            setShipToAddress(billToAddress);
        }
    }, [sameAsBillTo, billToAddress]);
    const handleInvoiceSelectionChange = (newSelection: string[]) => {
        setSelectedSupplierInvoices(newSelection);

        // Auto-fill Purchase Voucher No and Date
        const selectedInvoicesData = allPurchaseInvoices.filter(inv => newSelection.includes(inv.invoice_no));
        const vNos = selectedInvoicesData.map(inv => inv.purchase_voucher_no || inv.voucher_no).filter(Boolean);
        const vDates = selectedInvoicesData.map(inv => inv.date).filter(Boolean);

        setPurchaseVoucherNo(vNos.join(', '));
        setPurchaseVoucherDate(vDates.join(', '));

        // Extract and set items from selected invoices
        const newItems: any[] = [];
        selectedInvoicesData.forEach((inv: any) => {
            // Very aggressive item search
            let items: any[] = [];
            
            // 1. Try known nested locations
            if (inv.supply_inr_details?.items) items = inv.supply_inr_details.items;
            else if (inv.supply_foreign_details?.items) items = inv.supply_foreign_details.items;
            else if (inv.items_data) items = inv.items_data;
            else if (inv.items) items = inv.items;
            else if (inv.Items) items = inv.Items;
            
            // 2. Try parsing strings
            if ((!items || items.length === 0) && typeof inv.supply_inr_details === 'string') {
                try {
                    const parsed = JSON.parse(inv.supply_inr_details);
                    if (parsed.items) items = parsed.items;
                } catch (e) {}
            }
            if ((!items || items.length === 0) && typeof inv.items_data === 'string') {
                try {
                    items = JSON.parse(inv.items_data);
                } catch (e) {}
            }

            // 3. Fallback: Search all object keys for any array that might be items
            if (!items || items.length === 0) {
                Object.keys(inv).forEach(key => {
                    if (Array.isArray((inv as any)[key]) && (inv as any)[key].length > 0) {
                        const firstItem = (inv as any)[key][0];
                        if (firstItem && (firstItem.itemCode || firstItem.itemName || firstItem.code || firstItem.name)) {
                            items = (inv as any)[key];
                        }
                    }
                });
            }
            
            if (Array.isArray(items)) {
                items.forEach((item: any) => {
                    newItems.push({
                        id: Date.now() + Math.random(),
                        invoiceRef: inv.invoice_no,
                        itemCode: item.itemCode || item.code || '',
                        itemName: item.itemName || item.name || '',
                        hsnSac: item.hsnSac || item.hsn_sac || '',
                        qty: item.qty || '0',
                        uom: item.uom || '',
                        itemRate: item.itemRate || item.rate || '0',
                        taxableValue: item.taxableValue || '0',
                        igst: item.igst || '0',
                        cgst: item.cgst || '0',
                        sgst: item.sgst || '0',
                        cess: item.cess || '0',
                        invoiceValue: item.invoiceValue || '0',
                        purchaseLedger: item.purchaseLedger || '',
                        description: item.description || '',
                        gstRate: item.gstRate || item.gst_rate || '0',
                        selected: true,
                        reasonForReturn: '',
                        fcRate: item.fcRate || '0',
                        fcAmount: item.fcAmount || '0',
                        ledgerNarration: ''
                    });
                });
            }
        });

        if (newItems.length > 0) {
            setItemRows(newItems);
        } else if (newSelection.length === 0) {
            // Reset to empty default row
            setItemRows([{
                id: Date.now(),
                itemCode: '', itemName: '', hsnSac: '', qty: '0', uom: '', alternateUnit: '',
                itemRate: '0', taxableValue: '0', igst: '0', cgst: '0', sgst: '0', cess: '0', cessRate: '0',
                invoiceValue: '0', purchaseLedger: '', description: '', gstRate: '0', selected: true,
                reasonForReturn: '', invoiceRef: '', fcRate: '0', fcAmount: '0',
                ledgerNarration: ''
            }]);
        }
    };


    const handlePostDebitNote = async () => {
        try {
            if (!vendorName) {
                showError('Please select a Vendor.');
                return;
            }
            if (!date) {
                showError('Please select a Date.');
                return;
            }
            if (selectedSupplierInvoices.length === 0) {
                showError('Please select at least one Supplier Invoice.');
                return;
            }

            // Construct FormData for multipart/form-data (required for file upload)
            const formData = new FormData();
            
            // Basic fields (Mapped to VoucherDebitNoteSupplierDetailsSerializer)
            formData.append('date', date);
            formData.append('debit_note_series', selectedSeriesId.toString());
            formData.append('debit_note_no', debitNoteNo);
            formData.append('vendor_name', vendorName);
            formData.append('gstin', gstin);
            formData.append('branch', vendorBranch);
            
            // TextField fields in Backend (Comma-separated strings)
            formData.append('supplier_invoice_nos', selectedSupplierInvoices.join(', '));
            formData.append('purchase_voucher_nos', purchaseVoucherNo);
            formData.append('purchase_voucher_dates', purchaseVoucherDate);
            formData.append('outward_slip_nos', outwardSlipNos.join(', '));
            
            formData.append('bill_to', billToAddress);
            formData.append('ship_to', shipToAddress);
            
            formData.append('nature_of_supply', natureOfSupply);
            formData.append('reverse_charge', reverseCharge);
            formData.append('place_of_supply', placeOfSupply);
            
            formData.append('invoice_in_foreign_currency', natureOfSupply === 'Re-Export' ? 'Yes' : 'No');
            formData.append('exchange_rate', exchangeRate);
            formData.append('foreign_currency', foreignCurrency);
            formData.append('narration', narration);

            // File upload
            if (document) {
                formData.append('supporting_document', document);
            }

            // Nested Supply Details
            const supplyDetails = {
                items: itemRows.map(r => ({
                    ...r,
                    qty: parseFloat(r.qty) || 0,
                    itemRate: parseFloat(r.itemRate) || 0,
                    taxableValue: parseFloat(r.taxableValue) || 0,
                    igst: parseFloat(r.igst) || 0,
                    cgst: parseFloat(r.cgst) || 0,
                    sgst: parseFloat(r.sgst) || 0,
                    cess: parseFloat(r.cess) || 0,
                    invoiceValue: parseFloat(r.invoiceValue) || 0
                })),
                total_taxable_value: totalTaxable,
                total_igst: totalIgst,
                total_cgst: totalCgst,
                total_sgst: totalSgst,
                total_cess: totalCess,
                total_invoice_value: totalInvoiceValue
            };
            formData.append('supply_details', JSON.stringify(supplyDetails));

            // Nested Due Details
            const dueDetails = {
                reverse_tcs: parseFloat(reverseTcs) || 0,
                reverse_tds: parseFloat(reverseTds) || 0,
                tds_it: parseFloat(tdsIt) || 0,
                purchase_invoice_amount_applied: parseFloat(purchaseInvoiceAmountApplied) || 0,
                gross_amount_due: grossAmountDue,
                net_amount_due: netAmountDue,
                terms_and_conditions: termsAndConditions
            };
            formData.append('due_details', JSON.stringify(dueDetails));

            // Nested Transit Details
            const transitDetails = {
                dispatch_from: dispatchFrom,
                mode_of_transport: modeOfTransport,
                dispatch_date: dispatchDate || null,
                dispatch_time: dispatchTime || null,
                delivery_type: deliveryType,
                transporter_id_gstin: transporterIdGstin,
                transporter_name: transporterName,
                vehicle_no: vehicleNo,
                lr_gr_consignment_no: lrGrConsignmentNo,
                shipping_details: {
                    shipping_bill_no: shippingBillNo,
                    shipping_bill_date: shippingBillDate,
                    ship_port_code: shipPortCode,
                    vessel_flight_no: vesselFlightNo,
                    port_of_loading: portOfLoading,
                    port_of_discharge: portOfDischarge,
                    railway_receipt_no: railwayReceiptNo,
                    railway_receipt_date: railwayReceiptDate,
                    fnr_no: fnrNo,
                    station_of_loading: stationOfLoading,
                    station_of_discharge: stationOfDischarge,
                    origin_city: originCity,
                    origin_country: originCountry,
                    destination_city: destinationCity,
                    destination_country: destinationCountry
                }
            };
            formData.append('transit_details', JSON.stringify(transitDetails));

            // Send request
            const response = await httpClient.postFormData<any>('/api/accounting/vouchers/debit-note/', formData);

            showSuccess('Debit Note Saved Successfully!');
            
            if (onAddVouchers) {
                onAddVouchers([response]);
            }
            handleCancel(); 
        } catch (error: any) {
            console.error('Error posting Debit Note:', error);
            const serverError = error.response?.data;
            const message = typeof serverError === 'object' ? JSON.stringify(serverError) : serverError || error.message;
            showError(`Failed to save Debit Note: ${message}`);
        }
    };

    const handleCancel = () => {
        // Reset local states
        setVendorName('');
        setVendorBranch('');
        setGstin('');
        setDate(new Date().toISOString().split('T')[0]);
        setSelectedSupplierInvoices([]);
        setPurchaseVoucherNo('');
        setPurchaseVoucherDate('');
        setDebitNoteNo('');
        setNarration('');
        setDocument(null);
        setOutwardSlipNos([]);
        setNatureOfSupply('Regular');
        setReverseCharge('No');
        setPlaceOfSupply('');
        setBillToAddress('');
        setShipToAddress('');
        setSameAsBillTo(false);
        setItemRows([{
            id: Date.now(),
            itemCode: '', itemName: '', hsnSac: '', qty: '0', uom: '', alternateUnit: '',
            itemRate: '0', taxableValue: '0', igst: '0', cgst: '0', sgst: '0', cess: '0', cessRate: '0',
            invoiceValue: '0', purchaseLedger: '', description: '', gstRate: '0', selected: true,
            reasonForReturn: '', invoiceRef: '', fcRate: '0', fcAmount: '0',
            ledgerNarration: ''
        }]);
        setExchangeRate('1');
        setForeignCurrency('USD');
        setReverseTcs('');
        setReverseTds('');
        setTdsIt('');
        setPurchaseInvoiceAmountApplied('');
        setTermsAndConditions('');
        setDispatchFrom('');
        setModeOfTransport('Road');
        setDispatchTime('');
        setDeliveryType('Self');
        setTransporterIdGstin('');
        setTransporterName('');
        setVehicleNo('');
        setLrGrConsignmentNo('');
        setIrn('');
        setAckNo('');
        setAckDate('');
        setActiveTab('invoice');
    };

    const tabs = useMemo(() => {
        const baseTabs = [{ id: 'invoice', label: 'Invoice Details' }];

        if (natureOfSupply === 'Re-Export') {
            baseTabs.push(
                { id: 'item_tax_fc', label: 'Item & Tax Details (Foreign Currency)' },
                { id: 'item_tax_inr', label: 'Item & Tax Details (INR)' }
            );
        } else {
            baseTabs.push({ id: 'item_tax', label: 'Item & Tax Details' });
        }

        return [
            ...baseTabs,
            { id: 'payment', label: 'Payment Details' },
            { id: 'dispatch', label: 'Dispatch Details' },
            { id: 'einvoice', label: 'E-Invoice & E-way Bill' }
        ];
    }, [natureOfSupply]);

    return (
        <div className="w-full">
            <div className="border-b border-gray-200 mb-6">
                <div className="flex flex-wrap gap-8">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`pb-3 text-sm font-medium transition-colors duration-200 relative ${activeTab === tab.id
                                ? 'text-indigo-600 border-b-2 border-indigo-600'
                                : 'text-gray-600 hover:text-gray-800'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="min-h-[400px] bg-white">
                {activeTab === 'invoice' && (
                    <div className="space-y-6">
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
                                    Debit Note Series
                                </label>
                                <select
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                    value={selectedSeriesId}
                                    onChange={(e) => setSelectedSeriesId(Number(e.target.value))}
                                >
                                    <option value={0}>Select series</option>
                                    {voucherSeries.map((s) => (
                                        <option key={s.id} value={s.id}>{s.voucher_name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Debit Note No.
                                </label>
                                <input
                                    type="text"
                                    value={debitNoteNo}
                                    readOnly
                                    className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-[4px] text-gray-500 focus:outline-none"
                                    placeholder="Auto-generated"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Vendor Name
                                </label>
                                <SearchableDropdown
                                    value={vendorName}
                                    onChange={handleVendorChange}
                                    options={vendors.map(v => v.vendor_name)}
                                    placeholder="Select Vendor"
                                    onCreateAction={{
                                        label: "Add New Vendor",
                                        onClick: () => setIsCreateVendorModalOpen(true)
                                    }}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Branch
                                </label>
                                <SearchableDropdown
                                    value={vendorBranch}
                                    onChange={handleBranchChange}
                                    options={branches.map(b => b.reference_name)}
                                    placeholder="Select Branch"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Supplier Invoice No.
                                </label>
                                <div className="space-y-2">
                                    <SearchableDropdown
                                        options={supplierInvoiceNos.filter(no => !selectedSupplierInvoices.includes(no))}
                                        value=""
                                        onChange={(val) => {
                                            if (val) {
                                                const newSelection = [...selectedSupplierInvoices, val];
                                                handleInvoiceSelectionChange(newSelection);
                                            }
                                        }}
                                        placeholder="Select Invoice"
                                    />
                                    {selectedSupplierInvoices.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {selectedSupplierInvoices.map((no, idx) => {
                                                const colors = ['bg-blue-100 text-blue-700 border-blue-200', 'bg-green-100 text-green-700 border-green-200', 'bg-purple-100 text-purple-700 border-purple-200', 'bg-orange-100 text-orange-700 border-orange-200'];
                                                const colorClass = colors[idx % colors.length];

                                                return (
                                                    <div key={no} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${colorClass}`}>
                                                        <span>{no}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const newSelection = selectedSupplierInvoices.filter(n => n !== no);
                                                                handleInvoiceSelectionChange(newSelection);
                                                            }}
                                                            className="hover:bg-black/10 rounded-full p-0.5"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Purchase Voucher No.
                                </label>
                                <input
                                    type="text"
                                    value={purchaseVoucherNo}
                                    readOnly
                                    className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-[4px] text-gray-500 focus:outline-none"
                                    placeholder="Auto-filled"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Purchase Voucher Date
                                </label>
                                <input
                                    type="text"
                                    value={purchaseVoucherDate}
                                    readOnly
                                    className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-[4px] text-gray-500 focus:outline-none"
                                    placeholder="Auto-filled"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    GSTIN
                                </label>
                                <input
                                    type="text"
                                    value={gstin}
                                    readOnly
                                    className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-[4px] text-gray-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Upload Document
                                </label>
                                <div className="flex items-center space-x-2">
                                    <label className="flex-1 cursor-pointer">
                                        <div className="w-full flex items-center justify-between px-4 py-2 border border-gray-300 rounded-[4px] hover:border-indigo-400 transition-colors bg-white">
                                            <span className="text-gray-500 truncate text-sm">
                                                {document ? document.name : 'Choose file...'}
                                            </span>
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M16 8l-4-4m0 0L8 8m4-4v12" />
                                            </svg>
                                        </div>
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept=".jpg,.pdf,.jpeg"
                                            onChange={(e) => setDocument(e.target.files?.[0] || null)}
                                        />
                                    </label>
                                    {document && <X className="w-5 h-5 text-red-500 cursor-pointer" onClick={() => setDocument(null)} />}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Outward Slip No.
                                </label>
                                <div className="flex space-x-2">
                                    <div className="flex-1">
                                        <SearchableDropdown
                                            value=""
                                            onChange={(val) => {
                                                if (!outwardSlipNos.includes(val)) {
                                                    setOutwardSlipNos([...outwardSlipNos, val]);
                                                }
                                            }}
                                            options={pendingOutwardSlips.map(s => s.outward_slip_no).filter(no => !outwardSlipNos.includes(no))}
                                            placeholder="Select Slip"
                                            onCreateAction={{
                                                label: "Create Outward Slip",
                                                onClick: () => setIsIssueSlipModalOpen(true)
                                            }}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsIssueSlipModalOpen(true)}
                                        className="px-3 py-2 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-[4px] text-sm font-medium hover:bg-indigo-100 transition-colors whitespace-nowrap"
                                    >
                                        Create New
                                    </button>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {outwardSlipNos.map(no => (
                                        <span key={no} className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs flex items-center gap-1">
                                            {no}
                                            <X className="w-3 h-3 cursor-pointer" onClick={() => setOutwardSlipNos(outwardSlipNos.filter(n => n !== no))} />
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-200">
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-sm font-medium text-gray-700">Bill To</label>
                                </div>
                                <textarea
                                    value={billToAddress}
                                    onChange={(e) => setBillToAddress(e.target.value)}
                                    rows={4}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="Billing address..."
                                ></textarea>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-sm font-medium text-gray-700">Ship To</label>
                                    <label className="flex items-center text-sm text-gray-600">
                                        <input
                                            type="checkbox"
                                            checked={sameAsBillTo}
                                            onChange={(e) => setSameAsBillTo(e.target.checked)}
                                            className="mr-2 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        Same as Bill To
                                    </label>
                                </div>
                                <textarea
                                    value={shipToAddress}
                                    onChange={(e) => setShipToAddress(e.target.value)}
                                    rows={4}
                                    disabled={sameAsBillTo}
                                    className={`w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 ${sameAsBillTo ? 'bg-gray-50' : ''}`}
                                    placeholder="Shipping address..."
                                ></textarea>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Place of Supply (POS)</label>
                                <SearchableDropdown
                                    value={placeOfSupply}
                                    onChange={setPlaceOfSupply}
                                    options={['01-Jammu & Kashmir', '02-Himachal Pradesh', '03-Punjab', '04-Chandigarh', '05-Uttarakhand', '06-Haryana', '07-Delhi', '08-Rajasthan', '09-Uttar Pradesh', '10-Bihar', '11-Sikkim', '12-Arunachal Pradesh', '13-Nagaland', '14-Manipur', '15-Mizoram', '16-Tripura', '17-Meghalaya', '18-Assam', '19-West Bengal', '20-Jharkhand', '21-Odisha', '22-Chhattisgarh', '23-Madhya Pradesh', '24-Gujarat', '27-Maharashtra', '28-Andhra Pradesh', '29-Karnataka', '30-Goa', '31-Lakshadweep', '32-Kerala', '33-Tamil Nadu', '34-Puducherry', '35-Andaman & Nicobar Islands', '36-Telangana', '37-Andhra Pradesh (New)', '38-Ladakh']}
                                    placeholder="Select State"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Nature of Supply</label>
                                <select
                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                    value={natureOfSupply}
                                    onChange={(e) => setNatureOfSupply(e.target.value)}
                                >
                                    <option value="Regular">Regular</option>
                                    <option value="SEZ with Payment of Tax">SEZ with Payment of Tax</option>
                                    <option value="SEZ without Payment of Tax">SEZ without Payment of Tax</option>
                                    <option value="Re-Export">Re-Export</option>
                                    <option value="Deemed Export">Deemed Export</option>
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Reverse Charge Applicable</label>
                                <div className="flex items-center space-x-6">
                                    <label className="flex items-center cursor-pointer">
                                        <input
                                            type="radio"
                                            name="reverseCharge"
                                            value="Yes"
                                            checked={reverseCharge === 'Yes'}
                                            onChange={(e) => setReverseCharge(e.target.value)}
                                            className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                                        />
                                        <span className="ml-2 text-sm text-gray-700 font-medium">Yes</span>
                                    </label>
                                    <label className="flex items-center cursor-pointer">
                                        <input
                                            type="radio"
                                            name="reverseCharge"
                                            value="No"
                                            checked={reverseCharge === 'No'}
                                            onChange={(e) => setReverseCharge(e.target.value)}
                                            className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                                        />
                                        <span className="ml-2 text-sm text-gray-700 font-medium">No</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                )}


                {(activeTab === 'item_tax' || activeTab === 'item_tax_fc' || activeTab === 'item_tax_inr') && (
                    <div className="space-y-4">
                        <div className="w-full overflow-x-auto border border-gray-200 rounded-[4px]">
                            <table className="w-full text-sm text-left text-gray-500 whitespace-nowrap min-w-[1500px]">
                                <thead className="bg-[#4F46E5] text-white uppercase font-semibold">
                                    <tr>
                                        <th className="px-3 py-4 w-16 text-center border-r border-indigo-400">S. No.</th>
                                        <th className="px-4 py-4 w-40 border-r border-indigo-400">Invoice Ref</th>
                                        <th className="px-4 py-4 w-40 border-r border-indigo-400">Item Code</th>
                                        <th className="px-4 py-4 w-52 border-r border-indigo-400">Item Name</th>
                                        <th className="px-4 py-4 w-28 border-r border-indigo-400">HSN/SAC</th>
                                        <th className="px-4 py-4 w-24 text-center border-r border-indigo-400">Inv Qty</th>
                                        <th className="px-4 py-4 w-20 border-r border-indigo-400">UQC</th>
                                        <th className="px-4 py-4 w-48 border-r border-indigo-400">Reason for Return</th>

                                        {activeTab === 'item_tax_fc' ? (
                                            <>
                                                <th className="px-4 py-4 w-32 text-right border-r border-indigo-400">Rate ({foreignCurrency})</th>
                                                <th className="px-4 py-4 w-32 text-right border-r border-indigo-400 font-semibold bg-indigo-500">Amount ({foreignCurrency})</th>
                                            </>
                                        ) : (
                                            <>
                                                <th className="px-4 py-4 w-32 text-right border-r border-indigo-400 font-medium">Item Rate</th>
                                                <th className="px-4 py-4 w-32 text-right border-r border-indigo-400 font-medium">Taxable Value</th>
                                                {placeOfSupply === companyDetails.state ? (
                                                    <>
                                                        <th className="px-4 py-4 w-28 text-right border-r border-indigo-400 font-medium">CGST</th>
                                                        <th className="px-4 py-4 w-28 text-right border-r border-indigo-400 font-medium">SGST/UTGST</th>
                                                    </>
                                                ) : (
                                                    <th className="px-4 py-4 w-28 text-right border-r border-indigo-400 font-medium">IGST</th>
                                                )}
                                                <th className="px-4 py-4 w-24 text-right border-r border-indigo-400 font-medium">CESS</th>
                                                <th className="px-4 py-4 w-32 text-right border-l border-indigo-400 font-semibold bg-indigo-500">Invoice Value</th>
                                            </>
                                        )}

                                        <th className="px-4 py-4 w-20 text-center">Delete</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {itemRows.map((row, index) => {
                                        return (
                                            <React.Fragment key={row.id}>
                                                <tr className="border-b border-gray-100 transition-colors">
                                                    <td className="px-3 py-3 text-center border-l-0">
                                                        <div className="flex items-center justify-center space-x-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={row.selected !== false}
                                                                onChange={(e) => updateItemRow(index, { selected: e.target.checked })}
                                                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                            <span className="text-sm font-medium">{index + 1}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 border-l border-gray-100">
                                                        <input type="text" value={row.invoiceRef} onChange={(e) => updateItemRow(index, { invoiceRef: e.target.value })} className="w-full bg-transparent outline-none p-1 text-xs font-semibold border border-gray-200 rounded" />
                                                    </td>
                                                    <td className="px-4 py-3 border-l border-gray-100">
                                                        <SearchableDropdown
                                                            value={row.itemCode}
                                                            onChange={(val) => updateItemRow(index, { itemCode: val })}
                                                            options={availableItems.map(it => it.itemCode).filter(Boolean)}
                                                            placeholder="Select"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 border-l border-gray-100">
                                                        <SearchableDropdown
                                                            value={row.itemName}
                                                            onChange={(val) => updateItemRow(index, { itemName: val })}
                                                            options={availableItems.map(it => it.itemName).filter(Boolean)}
                                                            placeholder="Item"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 border-l border-gray-100">
                                                        <input type="text" value={row.hsnSac} placeholder="HSN/SAC" readOnly className="w-full bg-gray-50 outline-none p-1 border border-gray-200 rounded text-gray-500" />
                                                    </td>
                                                    <td className="px-4 py-3 border-l border-gray-100 text-center">
                                                        <input type="number"
                                                            value={row.qty}
                                                            onChange={(e) => updateItemRow(index, { qty: e.target.value })}
                                                            className="w-20 bg-white text-center outline-none p-1 border border-gray-300 focus:border-indigo-500 rounded"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 border-l border-gray-100">
                                                        <input type="text" value={row.uom} readOnly className="w-full bg-gray-50 border-gray-200 rounded p-1 text-sm text-gray-500" />
                                                    </td>
                                                    <td className="px-3 py-2 whitespace-nowrap">
                                                        <select
                                                            value={row.reasonForReturn}
                                                            onChange={(e) => updateItemRow(index, { reasonForReturn: e.target.value })}
                                                            className="w-[180px] px-2 py-1 border border-gray-300 rounded-[4px] text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                        >
                                                            <option value="">Select Reason</option>
                                                            <option value="Sales Return">Sales Return</option>
                                                            <option value="Post Sale Discount">Post Sale Discount</option>
                                                            <option value="Deficiency in Service">Deficiency in Service</option>
                                                            <option value="Correction in Invoice">Correction in Invoice</option>
                                                            <option value="Change in POS">Change in POS</option>
                                                            <option value="Finalization of Provisional Assessment">Finalization of Provisional Assessment</option>
                                                            <option value="Others">Others</option>
                                                        </select>
                                                    </td>

                                                    {activeTab === 'item_tax_fc' ? (
                                                        <>
                                                            <td className="px-4 py-3 border-l border-gray-100">
                                                                <input type="number" value={row.fcRate} onChange={(e) => updateItemRow(index, { fcRate: e.target.value })} className="w-full bg-white outline-none p-1 border border-gray-300 focus:border-indigo-500 rounded text-right" />
                                                            </td>
                                                            <td className="px-4 py-3 border-l border-gray-100 bg-indigo-50/50">
                                                                <div className="w-full bg-[#EBF5FF] text-blue-700 font-bold p-1 text-right rounded">{row.fcAmount}</div>
                                                            </td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td className="px-4 py-3 border-l border-gray-100">
                                                                <input type="number" value={row.itemRate} readOnly className="w-full bg-gray-50 outline-none p-1 border border-gray-200 rounded text-right text-gray-500" />
                                                            </td>
                                                            <td className="px-4 py-3 border-l border-gray-100">
                                                                <div className="w-full bg-[#EBF5FF] text-blue-700 font-bold p-1 text-right rounded px-3">{row.taxableValue}</div>
                                                            </td>
                                                            {placeOfSupply === companyDetails.state ? (
                                                                <>
                                                                    <td className="px-4 py-3 border-l border-gray-100">
                                                                        <div className="w-full bg-[#EBF5FF] text-blue-700 font-bold p-1 text-right rounded px-3">{row.cgst}</div>
                                                                    </td>
                                                                    <td className="px-4 py-3 border-l border-gray-100">
                                                                        <div className="w-full bg-[#F0FDF4] text-green-700 font-bold p-1 text-right rounded px-3">{row.sgst}</div>
                                                                    </td>
                                                                </>
                                                            ) : (
                                                                <td className="px-4 py-3 border-l border-gray-100">
                                                                    <div className="w-full bg-[#EBF5FF] text-blue-700 font-bold p-1 text-right rounded px-3">{row.igst}</div>
                                                                </td>
                                                            )}
                                                            <td className="px-4 py-3 border-l border-gray-100">
                                                                <div className="w-full bg-[#F5F3FF] text-purple-700 font-bold p-1 text-right rounded px-3">{row.cess}</div>
                                                            </td>
                                                            <td className="px-4 py-3 border-l border-gray-100 bg-indigo-50/30">
                                                                <div className="w-full bg-transparent outline-none p-1 text-right font-bold text-gray-900">{row.invoiceValue}</div>
                                                            </td>
                                                        </>
                                                    )}

                                                    <td className="px-4 py-3 border-l border-gray-100 text-center">
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                setItemRows(prev => prev.filter(r => r.id !== row.id));
                                                            }}
                                                            className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                                                        >
                                                            <Trash2 className="w-5 h-5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                                {/* Details Sub-row */}
                                                <tr className="border-b border-gray-200 bg-gray-50/50">
                                                    <td colSpan={6} className="px-4 py-3 text-right text-xs font-semibold text-gray-600">PURCHASE LEDGER:</td>
                                                    <td colSpan={2} className="px-2 py-2">
                                                        <SearchableDropdown
                                                            value={row.purchaseLedger}
                                                            onChange={(val) => updateItemRow(index, { purchaseLedger: val })}
                                                            options={ledgers.map(l => l.name)}
                                                            placeholder="-- Select Ledger --"
                                                        />
                                                    </td>
                                                    <td colSpan={2} className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Ledger Narration:</td>
                                                    <td colSpan={3} className="px-2 py-2">
                                                        <input
                                                            type="text"
                                                            value={row.ledgerNarration}
                                                            onChange={(e) => updateItemRow(index, { ledgerNarration: e.target.value })}
                                                            placeholder="Enter ledger narration"
                                                            className="w-full bg-white outline-none p-1 border border-gray-200 focus:border-indigo-500 rounded text-sm h-8"
                                                        />
                                                    </td>
                                                </tr>
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="pt-4 flex justify-between items-center">
                            <button
                                type="button"
                                onClick={() => setItemRows(prev => [...prev, {
                                    id: Date.now(),
                                    itemCode: '', itemName: '', hsnSac: '', qty: '0', uom: '', alternateUnit: '',
                                    itemRate: '0', taxableValue: '0', igst: '0', cgst: '0', sgst: '0', cess: '0', cessRate: '0',
                                    invoiceValue: '0', purchaseLedger: '', description: '', gstRate: '0', selected: true,
                                    reasonForReturn: '', invoiceRef: '', fcRate: '0', fcAmount: '0', ledgerNarration: ''
                                }])}
                                className="text-indigo-600 font-bold text-sm uppercase flex items-center hover:text-indigo-800 transition-colors"
                            >
                                <span className="mr-1 text-lg">+</span> ADD ITEM
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab('payment')}
                                className="px-10 py-2.5 bg-[#4F46E5] text-white rounded-[4px] font-bold text-sm uppercase shadow-lg hover:bg-indigo-700 transition-all active:scale-95"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'payment' && (
                    <div className="space-y-6">
                        {/* Top Tax Summary Grid */}
                        <div className="border border-gray-300 rounded-[4px] overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-[#4F46E5] text-white uppercase">
                                    <tr>
                                        <th className="px-4 py-3 text-center border-r border-indigo-400 font-semibold text-sm">Taxable Value</th>
                                        <th className="px-4 py-3 text-center border-r border-indigo-400 font-semibold text-sm">IGST</th>
                                        <th className="px-4 py-3 text-center border-r border-indigo-400 font-semibold text-sm">CGST</th>
                                        <th className="px-4 py-3 text-center border-r border-indigo-400 font-semibold text-sm">SGST/UTGST</th>
                                        <th className="px-4 py-3 text-center font-semibold text-sm">Cess</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="bg-white">
                                        <td className="px-4 py-3 border-r border-gray-200 text-center text-sm font-medium">{totalTaxable.toFixed(2)}</td>
                                        <td className="px-4 py-3 border-r border-gray-200 text-center text-sm font-medium">{totalIgst.toFixed(2)}</td>
                                        <td className="px-4 py-3 border-r border-gray-200 text-center text-sm font-medium">{totalCgst.toFixed(2)}</td>
                                        <td className="px-4 py-3 border-r border-gray-200 text-center text-sm font-medium">{totalSgst.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-center text-sm font-medium">{totalCess.toFixed(2)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Left Column: Payment Summary */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Value</label>
                                    <input
                                        type="number"
                                        readOnly
                                        value={totalInvoiceValue.toFixed(2)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-right font-semibold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Reverse TCS on the Debit Note</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={reverseTcs}
                                        onChange={(e) => setReverseTcs(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-right"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Reverse TDS on the Debit Note</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={reverseTds}
                                        onChange={(e) => setReverseTds(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-right"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">TDS/TCS under Income Tax</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={tdsIt}
                                        onChange={(e) => setTdsIt(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-right"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Gross Amount Due</label>
                                    <input
                                        type="text"
                                        readOnly
                                        value={grossAmountDue.toFixed(2)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-right font-semibold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Net Amount Due</label>
                                    <input
                                        type="text"
                                        readOnly
                                        value={netAmountDue.toFixed(2)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-right font-bold text-lg text-indigo-700"
                                    />
                                </div>
                            </div>

                            {/* Middle Column: Supplier Invoices Application */}
                            <div className="border border-gray-300 rounded-[4px] p-4 bg-indigo-50/50 flex flex-col h-full">
                                <h3 className="text-sm font-semibold text-gray-800 mb-4 border-b border-gray-200 pb-2">Supplier Invoices</h3>
                                <div className="space-y-4 flex-1">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Selected Supplier Invoices</label>
                                        <div className="min-h-[80px] p-3 bg-white border border-gray-200 rounded-[4px] text-sm text-gray-600">
                                            {supplierInvoiceNos.length > 0 ? supplierInvoiceNos.join(', ') : 'No invoices selected'}
                                        </div>
                                    </div>
                                    <div className="pt-4">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Invoice Amount Applied</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={purchaseInvoiceAmountApplied}
                                            onChange={(e) => setPurchaseInvoiceAmountApplied(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-right"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Edit Masters & Terms */}
                            <div className="border border-gray-200 rounded-[4px] p-6 bg-gray-50">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                                        <span className="text-sm font-medium text-gray-700">Terms & Conditions</span>
                                        <button
                                            type="button"
                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-[4px] transition-colors shadow-sm"
                                        >
                                            Edit Masters
                                        </button>
                                    </div>
                                    <div>
                                        <textarea
                                            value={termsAndConditions}
                                            onChange={(e) => setTermsAndConditions(e.target.value)}
                                            className="w-full px-4 py-3 border border-gray-200 rounded-[4px] text-gray-700 resize-none bg-white focus:ring-indigo-500 focus:border-indigo-500"
                                            rows={6}
                                            placeholder="Enter terms & conditions..."
                                        />
                                    </div>
                                    <div className="pt-2">
                                        <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Narration/Notes:</label>
                                        <textarea
                                            value={narration}
                                            onChange={(e) => setNarration(e.target.value)}
                                            className="w-full px-4 py-3 border border-gray-300 rounded-[4px] bg-white text-xs h-24 resize-none placeholder:text-gray-300 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                                            placeholder="Enter additional notes about this debit note..."
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'dispatch' && (
                    <div className="space-y-6">
                        {/* Top Section */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-[4px] border border-gray-200">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Dispatch From</label>
                                    <input type="text" value={dispatchFrom} onChange={e => setDispatchFrom(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Mode of Transport</label>
                                    <select value={modeOfTransport} onChange={e => setModeOfTransport(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white">
                                        <option value="Road">Road</option>
                                        <option value="Air">Air</option>
                                        <option value="Sea">Sea</option>
                                        <option value="Rail">Rail</option>
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Dispatch Date</label>
                                    <input type="date" value={dispatchDate} onChange={e => setDispatchDate(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Dispatch Time</label>
                                    <input type="time" value={dispatchTime} onChange={e => setDispatchTime(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500" />
                                </div>
                            </div>
                        </div>

                        {/* Layouts based on Mode */}
                        {(modeOfTransport === 'Air' || modeOfTransport === 'Sea' || modeOfTransport === 'Rail') ? (
                            <div className="space-y-6 mt-6">
                                <div>
                                    <h3 className="text-lg font-bold text-indigo-700 mb-4">Upto Port</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-[4px] border border-gray-200">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Type</label>
                                                <select
                                                    value={deliveryType}
                                                    onChange={e => {
                                                        setDeliveryType(e.target.value);
                                                        if (e.target.value === 'Courier') {
                                                            setTransporterIdGstin('');
                                                            setTransporterName('');
                                                            setVehicleNo('');
                                                            setLrGrConsignmentNo('');
                                                        }
                                                    }}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                                >
                                                    <option value="Self">Self</option>
                                                    <option value="Third Party">Third Party</option>
                                                    <option value="Courier">Courier</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Transporter ID/GSTIN</label>
                                                <input type="text" value={transporterIdGstin} onChange={e => setTransporterIdGstin(e.target.value.toUpperCase())} maxLength={15} disabled={deliveryType === 'Courier'} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 uppercase disabled:bg-gray-100 disabled:cursor-not-allowed" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Transporter Name</label>
                                                <input type="text" value={transporterName} onChange={e => setTransporterName(e.target.value)} disabled={deliveryType === 'Courier'} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed" />
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle No.</label>
                                                <input type="text" value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} disabled={deliveryType === 'Courier'} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">LR/GR/Consignment No.</label>
                                                <input type="text" value={lrGrConsignmentNo} onChange={e => setLrGrConsignmentNo(e.target.value)} disabled={deliveryType === 'Courier'} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-lg font-bold text-indigo-700 mb-4">Beyond Port</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-[4px] border border-gray-200">
                                        {(modeOfTransport === 'Air' || modeOfTransport === 'Sea') && (
                                            <>
                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Bill No.</label>
                                                        <input type="text" value={shippingBillNo} onChange={e => setShippingBillNo(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Bill Date</label>
                                                        <input type="date" value={shippingBillDate} onChange={e => setShippingBillDate(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Ship Port Code</label>
                                                        <input type="text" value={shipPortCode} onChange={e => setShipPortCode(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Vessel/Flight No.</label>
                                                        <input type="text" value={vesselFlightNo} onChange={e => setVesselFlightNo(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500" />
                                                    </div>
                                                </div>
                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Port of Loading</label>
                                                        <input type="text" value={portOfLoading} onChange={e => setPortOfLoading(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Port of Discharge</label>
                                                        <input type="text" value={portOfDischarge} onChange={e => setPortOfDischarge(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Origin</label>
                                                        <input type="text" placeholder="City" value={originCity} onChange={e => setOriginCity(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 mb-2" />
                                                        <input type="text" placeholder="Country" value={originCountry} onChange={e => setOriginCountry(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Destination</label>
                                                        <input type="text" placeholder="City" value={destinationCity} onChange={e => setDestinationCity(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 mb-2" />
                                                        <input type="text" placeholder="Country" value={destinationCountry} onChange={e => setDestinationCountry(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500" />
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {modeOfTransport === 'Rail' && (
                                            <>
                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Railway Receipt No.</label>
                                                        <input type="text" value={railwayReceiptNo} onChange={e => setRailwayReceiptNo(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Railway Receipt Date</label>
                                                        <input type="date" value={railwayReceiptDate} onChange={e => setRailwayReceiptDate(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">FNR No.</label>
                                                        <input type="text" value={fnrNo} onChange={e => setFnrNo(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Station of Loading</label>
                                                        <input type="text" value={stationOfLoading} onChange={e => setStationOfLoading(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500" />
                                                    </div>
                                                </div>
                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Station of Discharge</label>
                                                        <input type="text" value={stationOfDischarge} onChange={e => setStationOfDischarge(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Origin</label>
                                                        <input type="text" placeholder="City" value={originCity} onChange={e => setOriginCity(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 mb-2" />
                                                        <input type="text" placeholder="Country" value={originCountry} onChange={e => setOriginCountry(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Destination</label>
                                                        <input type="text" placeholder="City" value={destinationCity} onChange={e => setDestinationCity(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 mb-2" />
                                                        <input type="text" placeholder="Country" value={destinationCountry} onChange={e => setDestinationCountry(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500" />
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6 mt-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-[4px] border border-gray-200">
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Type</label>
                                            <select
                                                value={deliveryType}
                                                onChange={e => {
                                                    setDeliveryType(e.target.value);
                                                    if (e.target.value === 'Courier') {
                                                        setTransporterIdGstin('');
                                                        setTransporterName('');
                                                        setVehicleNo('');
                                                        setLrGrConsignmentNo('');
                                                    }
                                                }}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                            >
                                                <option value="Self">Self</option>
                                                <option value="Third Party">Third Party</option>
                                                <option value="Courier">Courier</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Transporter ID/GSTIN</label>
                                            <input type="text" value={transporterIdGstin} onChange={e => setTransporterIdGstin(e.target.value.toUpperCase())} maxLength={15} disabled={deliveryType === 'Courier'} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 uppercase disabled:bg-gray-100 disabled:cursor-not-allowed" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Transporter Name</label>
                                            <input type="text" value={transporterName} onChange={e => setTransporterName(e.target.value)} disabled={deliveryType === 'Courier'} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed" />
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle No.</label>
                                            <input type="text" value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} disabled={deliveryType === 'Courier'} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">LR/GR/Consignment No.</label>
                                            <input type="text" value={lrGrConsignmentNo} onChange={e => setLrGrConsignmentNo(e.target.value)} disabled={deliveryType === 'Courier'} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
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
                        <div className="pb-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">E-Invoice</h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
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
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="mt-8 pt-6 border-t border-gray-100 flex justify-center gap-4">
                    <button
                        onClick={handleCancel}
                        className="px-10 py-2.5 text-sm font-bold text-gray-700 bg-white border-2 border-gray-300 rounded-[4px] hover:bg-gray-50 transition-all active:scale-95 shadow-sm"
                    >
                        CANCEL
                    </button>
                    <button
                        onClick={handlePostDebitNote}
                        className="px-10 py-2.5 text-sm font-bold text-white bg-indigo-600 border-b-4 border-indigo-800 rounded-[4px] hover:bg-indigo-700 active:border-b-0 active:translate-y-1 transition-all shadow-lg"
                    >
                        POST DEBIT NOTE
                    </button>
                </div>
            </div>

            {isIssueSlipModalOpen && (
                <CreateIssueSlipModal
                    onClose={() => setIsIssueSlipModalOpen(false)}
                    onSave={(data) => {
                        console.log('Outward Slip Data:', data);
                        setIsIssueSlipModalOpen(false);
                    }}
                />
            )}

            {isCreateVendorModalOpen && (
                <CreateNewVendorFullModal
                    onClose={() => setIsCreateVendorModalOpen(false)}
                    onVendorCreated={(name, id) => {
                        const newVendor = { id, vendor_name: name };
                        setVendors(prev => [...prev, newVendor]);
                        handleVendorChange(name);
                        setIsCreateVendorModalOpen(false);
                    }}
                />
            )}
        </div>
    );
};

export default DebitNoteVoucher;
