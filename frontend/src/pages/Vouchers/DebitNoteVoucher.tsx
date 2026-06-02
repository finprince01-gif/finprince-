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
    supplierInvoiceNo?: string;
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
    isReadOnlyMode?: boolean;
}

const DebitNoteVoucher: React.FC<DebitNoteVoucherProps> = ({
    prefilledData,
    clearPrefilledData,
    companyDetails,
    onAddVouchers,
    isReadOnlyMode = false
}) => {
    const [activeTab, setActiveTab] = useState('invoice');
    const [editingVoucherId, setEditingVoucherId] = useState<number | string | null>(null);

    // Form States
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [voucherSeries, setVoucherSeries] = useState<any[]>([]);
    const [selectedSeriesId, setSelectedSeriesId] = useState<number | string>('');
    const [debitNoteNo, setDebitNoteNo] = useState('');
    const [vendorName, setVendorName] = useState('');
    const [vendorId, setVendorId] = useState<number | string>('');
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
    const [billFromAddress, setBillFromAddress] = useState({ line1: '', line2: '', line3: '', city: '', pincode: '' });
    const [shipFromAddress, setShipFromAddress] = useState({ line1: '', line2: '', line3: '', city: '', pincode: '' });
    const [sameAsBillTo, setSameAsBillTo] = useState(false);
    const [itemRows, setItemRows] = useState<ItemRow[]>([{
        id: Date.now(),
        itemCode: '', itemName: '', hsnSac: '', qty: '0', uom: '', alternateUnit: '',
        itemRate: '0', taxableValue: '0', igst: '0', cgst: '0', sgst: '0', cess: '0', cessRate: '0',
        invoiceValue: '0', purchaseLedger: '', description: '', gstRate: '0', selected: true,
        reasonForReturn: '', supplierInvoiceNo: '', invoiceRef: '', fcRate: '0', fcAmount: '0',
        ledgerNarration: ''
    }]);

    // Foreign Currency States
    const [exchangeRate, setExchangeRate] = useState('1');
    const [foreignCurrency, setForeignCurrency] = useState('USD');
    const [isFinancial, setIsFinancial] = useState('No');

    // Payment Tab States
    const [reverseTcs, setReverseTcs] = useState('');
    const [reverseTds, setReverseTds] = useState('');
    const [tdsIt, setTdsIt] = useState('');
    const [purchaseInvoiceAmountApplied, setPurchaseInvoiceAmountApplied] = useState('');
    const [termsAndConditions, setTermsAndConditions] = useState('');
    const [isTermsEditable, setIsTermsEditable] = useState(false);

    // Reverse Tax Toggles (Yes/No)
    const [reverseGstTcs, setReverseGstTcs] = useState<'Yes' | 'No'>('No');
    const [reverseGstTds, setReverseGstTds] = useState<'Yes' | 'No'>('No');
    const [reverseIncomeTaxTcs, setReverseIncomeTaxTcs] = useState<'Yes' | 'No'>('No');
    const [reverseIncomeTaxTds, setReverseIncomeTaxTds] = useState<'Yes' | 'No'>('No');



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
                const invItems = inv.supply_inr_details?.line_items || inv.supply_inr_details?.items ||
                    inv.supply_foreign_details?.line_items || inv.supply_foreign_details?.items ||
                    inv.items_data || inv.items || [];
                invItems.forEach((item: any) => {
                    items.push({
                        ...item,
                        itemCode: item.itemCode || item.item_code || item.code || '',
                        itemName: item.itemName || item.item_name || item.name || '',
                        hsnSac: item.hsnSac || item.hsn_sac || '',
                        qty: item.qty || item.quantity || '0',
                        itemRate: item.itemRate || item.rate || '0',
                        invoice_no: inv.invoice_no,
                        purchase_ledger: inv.supply_inr_details?.purchase_ledger || inv.supply_foreign_details?.purchase_ledger || ''
                    });
                });
            });
        return items;
    }, [allPurchaseInvoices, selectedSupplierInvoices]);
    // Populate from Edit Mode (prefilledData)
    useEffect(() => {
        if (prefilledData) {
            if ((prefilledData as any).voucherId || (prefilledData as any).id) {
                setEditingVoucherId((prefilledData as any).voucherId || (prefilledData as any).id);
            }
            if (prefilledData.invoiceDate || (prefilledData as any).date) setDate(prefilledData.invoiceDate || (prefilledData as any).date);
            if ((prefilledData as any).debit_note_no) setDebitNoteNo((prefilledData as any).debit_note_no || '');
            
            // Branch and GSTIN
            if (prefilledData.branch) setVendorBranch(prefilledData.branch);
            if (prefilledData.gstin) setGstin(prefilledData.gstin);
            if ((prefilledData as any).place_of_supply) setPlaceOfSupply((prefilledData as any).place_of_supply);

            // Set vendorName
            if (prefilledData.sellerName || (prefilledData as any).vendor_name) {
                setVendorName(prefilledData.sellerName || (prefilledData as any).vendor_name || '');
            }
            if ((prefilledData as any).vendor_id) setVendorId((prefilledData as any).vendor_id);
            
            // Narration
            if (prefilledData.narration) setNarration(prefilledData.narration);
            
            // Address Fields
            if ((prefilledData as any).bill_to) {
                setBillFromAddress({ line1: (prefilledData as any).bill_to, line2: '', line3: '', city: '', pincode: '' });
            }
            if ((prefilledData as any).ship_to) {
                setShipFromAddress({ line1: (prefilledData as any).ship_to, line2: '', line3: '', city: '', pincode: '' });
            }

            // Purchase Reference
            if ((prefilledData as any).supplier_invoice_nos) {
                const invoices = typeof (prefilledData as any).supplier_invoice_nos === 'string' 
                    ? (prefilledData as any).supplier_invoice_nos.split(',').map((s: string) => s.trim()).filter(Boolean)
                    : (Array.isArray((prefilledData as any).supplier_invoice_nos) ? (prefilledData as any).supplier_invoice_nos : []);
                setSelectedSupplierInvoices(invoices);
                setSupplierInvoiceNos(prev => Array.from(new Set([...prev, ...invoices])));
            }
            if ((prefilledData as any).purchase_voucher_nos) setPurchaseVoucherNo((prefilledData as any).purchase_voucher_nos);
            if ((prefilledData as any).purchase_voucher_dates) setPurchaseVoucherDate((prefilledData as any).purchase_voucher_dates);

            // General fields
            if ((prefilledData as any).nature_of_supply) setNatureOfSupply((prefilledData as any).nature_of_supply);
            if ((prefilledData as any).is_financial) setIsFinancial((prefilledData as any).is_financial);
            if ((prefilledData as any).reverse_charge) setReverseCharge((prefilledData as any).reverse_charge);
            if ((prefilledData as any).invoice_in_foreign_currency) setForeignCurrency((prefilledData as any).foreign_currency || 'USD');
            if ((prefilledData as any).exchange_rate) setExchangeRate((prefilledData as any).exchange_rate.toString());

            // Items
            const items = (prefilledData as any).item_details?.items || (prefilledData as any).item_details?.line_items || [];
            if (Array.isArray(items) && items.length > 0) {
                setItemRows(items.map((item: any, idx: number) => ({
                    id: item.id || (idx + 1).toString(),
                    itemCode: item.item_code || item.itemCode || '',
                    itemName: item.item_name || item.itemName || '',
                    hsnSac: item.hsn_sac || item.hsnSac || '',
                    qty: (item.quantity || item.qty || 0).toString(),
                    uom: item.uom || '',
                    itemRate: (item.rate || item.itemRate || 0).toString(),
                    taxableValue: (item.taxable_value || item.taxableValue || 0).toString(),
                    igst: (item.igst_amount || item.igst || 0).toString(),
                    cgst: (item.cgst_amount || item.cgst || 0).toString(),
                    sgst: (item.sgst_amount || item.sgst || 0).toString(),
                    cess: (item.cess_amount || item.cess || 0).toString(),
                    cessRate: '0',
                    invoiceValue: (item.invoice_value || item.invoiceValue || 0).toString(),
                    purchaseLedger: item.purchase_ledger || item.purchaseLedger || item.ledger || '',
                    description: item.description || '',
                    alternateUnit: '',
                    gstRate: item.gstRate || item.gst_rate || '0',
                    selected: true,
                    reasonForReturn: item.reason_for_return || item.reasonForReturn || '',
                    supplierInvoiceNo: item.sales_invoice_no || item.supplierInvoiceNo || '',
                    invoiceRef: item.invoiceRef || '',
                    fcRate: (item.foreign_rate || item.fcRate || 0).toString(),
                    fcAmount: (item.foreign_amount || item.fcAmount || 0).toString(),
                    ledgerNarration: item.ledgerNarration || ''
                })));
            }
            
            // Due Details
            if ((prefilledData as any).due_details) {
                const due = (prefilledData as any).due_details;
                if (due.reverse_tcs) setReverseTcs(due.reverse_tcs.toString());
                if (due.reverse_tds) setReverseTds(due.reverse_tds.toString());
                if (due.tds_it) setTdsIt(due.tds_it.toString());
                if (due.reverse_gst_tcs) setReverseGstTcs(due.reverse_gst_tcs);
                if (due.reverse_gst_tds) setReverseGstTds(due.reverse_gst_tds);
                if (due.reverse_income_tax_tcs) setReverseIncomeTaxTcs(due.reverse_income_tax_tcs);
                if (due.reverse_income_tax_tds) setReverseIncomeTaxTds(due.reverse_income_tax_tds);
                if (due.purchase_invoice_amount_applied) setPurchaseInvoiceAmountApplied(due.purchase_invoice_amount_applied.toString());
                if (due.terms_conditions) setTermsAndConditions(due.terms_conditions);
            }

            if (clearPrefilledData) clearPrefilledData();
        }
    }, [prefilledData, clearPrefilledData]);


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

    const handlePost = async (shouldPrint: boolean = false) => {
        // Basic Validation
        if (!date) { showError('Please select a Date.'); return; }
        if (!selectedSeriesId) { showError('Please select a Voucher Series.'); return; }
        if (!debitNoteNo) { showError('Voucher Number is required.'); return; }
        if (!vendorName) { showError('Please select a Vendor.'); return; }
        if (!vendorBranch) { showError('Please select a Branch.'); return; }
        if (!selectedSupplierInvoices || selectedSupplierInvoices.length === 0) {
            showError('Please select at least one Supplier Invoice No.');
            return;
        }
        if (itemRows.length === 0) { showError('Please add at least one item.'); return; }

        // 1. Format addresses as plain strings (backend expects text)
        const formatAddress = (addr: any) => {
            return [addr.line1, addr.line2, addr.line3, addr.city, addr.pincode]
                .filter(Boolean)
                .join(', ');
        };

        const payload = {
            id: editingVoucherId || '',
            reference_id: prefilledData ? (prefilledData as any).reference_id : undefined,
            type: 'Debit Note',
            date,
            party: vendorName,
            total: Number(netAmountDue) || 0,
            amount: Number(netAmountDue) || 0,
            voucher_number: debitNoteNo,
            debit_note_series: selectedSeriesId,
            debit_note_no: debitNoteNo,
            vendor_name: vendorName,
            vendor_id: vendorId,
            gstin: gstin,
            branch: vendorBranch,
            supplier_invoice_nos: selectedSupplierInvoices.join(','),
            purchase_voucher_nos: purchaseVoucherNo,
            purchase_voucher_dates: purchaseVoucherDate,
            outward_slip_nos: outwardSlipNos.join(','),
            bill_to: formatAddress(billFromAddress),
            ship_to: formatAddress(shipFromAddress),
            nature_of_supply: natureOfSupply,
            is_financial: isFinancial,
            reverse_charge: reverseCharge,
            place_of_supply: placeOfSupply,
            invoice_in_foreign_currency: (natureOfSupply === 'Re-Export' || natureOfSupply === 'Deemed Export') ? 'Yes' : 'No',
            exchange_rate: Number(exchangeRate) || 1,
            foreign_currency: foreignCurrency,
            narration: narration,

            // Nested Tab 2: Supply
            item_details: {
                items: itemRows.map(row => ({
                    ...row,
                    qty: Number(row.qty) || 0,
                    itemRate: Number(row.itemRate) || 0,
                    taxableValue: Number(row.taxableValue) || 0,
                    igst: Number(row.igst) || 0,
                    cgst: Number(row.cgst) || 0,
                    sgst: Number(row.sgst) || 0,
                    cess: Number(row.cess) || 0,
                    invoiceValue: Number(row.invoiceValue) || 0
                })),
                total_taxable_value: Number(totalTaxable) || 0,
                total_igst: Number(totalIgst) || 0,
                total_cgst: Number(totalCgst) || 0,
                total_sgst: Number(totalSgst) || 0,
                total_cess: Number(totalCess) || 0,
                total_invoice_value: Number(totalInvoiceValue) || 0,
            },

            // Nested Tab 3: Due
            due_details: {
                reverse_tcs: Number(reverseTcs) || 0,
                reverse_tds: Number(reverseTds) || 0,
                tds_it: Number(tdsIt) || 0,
                reverse_gst_tcs: reverseGstTcs,
                reverse_gst_tds: reverseGstTds,
                reverse_income_tax_tcs: reverseIncomeTaxTcs,
                reverse_income_tax_tds: reverseIncomeTaxTds,
                purchase_invoice_amount_applied: Number(purchaseInvoiceAmountApplied) || 0,
                gross_amount_due: Number(grossAmountDue) || 0,
                net_amount_due: Number(netAmountDue) || 0,
                terms_and_conditions: termsAndConditions,
            },

            // Nested Tab 4: Dispatch
            transit_details: {
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
                    origin_city: originCity,
                    origin_country: originCountry,
                    destination_city: destinationCity,
                    destination_country: destinationCountry,
                    railway_receipt_no: railwayReceiptNo,
                    railway_receipt_date: railwayReceiptDate,
                    fnr_no: fnrNo,
                    station_of_loading: stationOfLoading,
                    station_of_discharge: stationOfDischarge
                }
            },
            irn,
            ack_no: ackNo,
            ack_date: ackDate,
            should_print: shouldPrint
        };

        console.log("Saving Debit Note Payload:", payload);

        try {
            await onAddVouchers([payload as any]);
            showSuccess('Debit Note Voucher Saved Successfully!');
            // Refresh the next voucher number after save
            fetchNextNo();
        } catch (error) {
            console.error('Error saving Debit Note:', error);
            showError('Failed to save Debit Note Voucher.');
        }
    };

    const handleVendorChange = async (name: string) => {
        setVendorName(name);
        setGstin('');
        setBillFromAddress({ line1: '', line2: '', line3: '', city: '', pincode: '' });
        setShipFromAddress({ line1: '', line2: '', line3: '', city: '', pincode: '' });
        setSupplierInvoiceNos([]);
        setSelectedSupplierInvoices([]);

        const vendor = vendors.find(v => v.vendor_name === name);
        if (vendor) {
            setVendorId(vendor.id);
            // Auto-fill terms and conditions from vendor master (Detailed Formatting)
            const parts: string[] = [];
            if (vendor.credit_period) parts.push(`Credit Period: ${vendor.credit_period}`);
            if (vendor.credit_terms) parts.push(`Credit Terms: ${vendor.credit_terms}`);
            if (vendor.penalty_terms) parts.push(`Penalty Terms: ${vendor.penalty_terms}`);
            if (vendor.delivery_terms) parts.push(`Delivery Terms: ${vendor.delivery_terms}`);

            const warranty = vendor.warranty_details || vendor.warranty_guarantee_details;
            if (warranty) parts.push(`Warranty / Guarantee: ${warranty}`);
            if (vendor.force_majeure) parts.push(`Force Majeure: ${vendor.force_majeure}`);

            const dispute = vendor.dispute_terms || vendor.dispute_redressal_terms;
            if (dispute) parts.push(`Dispute & Redressal: ${dispute}`);

            if (parts.length > 0) {
                setTermsAndConditions(parts.join('\n\n'));
            } else if (vendor.terms_and_conditions) {
                setTermsAndConditions(vendor.terms_and_conditions);
            } else {
                setTermsAndConditions('');
            }

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
            // For Debit Note, we want to see ALL invoices even if fully paid (showAll: true)
            const prevInvoicesRes = await apiService.getVendorPurchaseInvoices(vName, branchName, true);
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

            procurementSource.forEach((t: any) => {
                const invNo = (t.reference_number || t.transaction_number || '').trim();
                if (invNo) {
                    const key = invNo.toUpperCase();
                    allInvsMap.set(key, {
                        invoice_no: invNo,
                        purchase_voucher_no: t.transaction_number,
                        date: t.transaction_date,
                        total_amount: t.total_amount,
                        due_status: t.due_status,
                        id: t.id,
                        items_data: []
                    });
                }
            });

            // Second pass: Merge historical vouchers for items & details
            prevVouchers.forEach((inv: any) => {
                const invNo = (inv.invoice_no || inv.supplier_invoice_no || inv.reference_no || '').trim();
                if (invNo) {
                    const key = invNo.toUpperCase();
                    const existing = allInvsMap.get(key) || {};
                    allInvsMap.set(key, {
                        ...existing,
                        ...inv,
                        invoice_no: (inv.invoice_no || inv.supplier_invoice_no || invNo), // Keep best display name
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
        const vId = explicitVendorId || vendorId;
        if (explicitVendorId) setVendorId(explicitVendorId);
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
            const fullBillAddr = [
                branch.branch_address,
                branch.branch_city,
                branch.branch_state,
                branch.branch_pincode
            ].filter(Boolean).join(', ');

            setBillFromAddress({
                line1: branch.branch_address || '',
                line2: '',
                line3: '',
                city: branch.branch_city || '',
                pincode: branch.branch_pincode || ''
            });

            if (sameAsBillTo) {
                setShipFromAddress({
                    line1: branch.branch_address || '',
                    line2: '',
                    line3: '',
                    city: branch.branch_city || '',
                    pincode: branch.branch_pincode || ''
                });
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

    const fetchNextNo = useCallback(async () => {
        if (editingVoucherId) return;
        if (prefilledData && ((prefilledData as any).voucherId || (prefilledData as any).id)) {
            return; // Do not overwrite existing voucher number in edit mode
        }
        if (selectedSeriesId) {
            try {
                const data = await apiService.getDebitNoteNextNumber(selectedSeriesId);
                setDebitNoteNo(data.invoice_number);
            } catch (error) {
                console.error("Error fetching next debit note number:", error);
            }
        } else {
            setDebitNoteNo('');
        }
    }, [selectedSeriesId, prefilledData]);

    // Fetch next number when series changes
    useEffect(() => {
        fetchNextNo();
    }, [selectedSeriesId, fetchNextNo]);

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
            if (updates.itemCode || updates.itemName || updates.hsnSac) {
                updatedRow.qty = '0'; // Reset qty
                const selectedItem = availableItems.find(it =>
                    (updates.itemCode && it.itemCode === updates.itemCode) ||
                    (updates.itemName && it.itemName === updates.itemName) ||
                    (updates.hsnSac && (it.hsnSac === updates.hsnSac || it.hsn_sac === updates.hsnSac))
                );
                if (selectedItem) {
                    updatedRow = {
                        ...updatedRow,
                        supplierInvoiceNo: selectedItem.invoice_no,
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

                    // Default qty to 1 if HSN/SAC starts with 99 (Services)
                    if (updatedRow.hsnSac?.toString().startsWith('99')) {
                        updatedRow.qty = '1';
                    }
                }
            }

            const isManualTaxMode = isFinancial === 'Yes' || reverseGstTcs === 'Yes';

            if (isManualTaxMode) {
                if (isFinancial === 'Yes') updatedRow.qty = '1';

                // If user directly edits taxableValue, sync itemRate to it if qty is 1
                if (updates.taxableValue !== undefined && updatedRow.qty === '1') {
                    updatedRow.itemRate = (parseFloat(updates.taxableValue) || 0).toString();
                }
                // If user directly edits any tax field OR taxableValue, just recompute invoiceValue
                if (updates.igst !== undefined || updates.cgst !== undefined ||
                    updates.sgst !== undefined || updates.cess !== undefined || updates.taxableValue !== undefined) {
                    const tv = parseFloat(updatedRow.taxableValue || '0') || 0;
                    const ig = parseFloat(updatedRow.igst || '0') || 0;
                    const cg = parseFloat(updatedRow.cgst || '0') || 0;
                    const sg = parseFloat(updatedRow.sgst || '0') || 0;
                    const cs = parseFloat(updatedRow.cess || '0') || 0;
                    newRows[index] = {
                        ...updatedRow,
                        invoiceValue: (tv + ig + cg + sg + cs).toFixed(2),
                        fcAmount: (parseFloat(updatedRow.qty || '0') * (parseFloat(updatedRow.fcRate || '0') || 0)).toFixed(2)
                    };
                    return newRows;
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

            if (natureOfSupply === 'Re-Export' || natureOfSupply === 'Deemed Export') {
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
    }, [exchangeRate, natureOfSupply, placeOfSupply, companyDetails.state, isFinancial, reverseGstTcs, availableItems]);

    // Recalculate all rows when exchangeRate or global factors change
    useEffect(() => {
        setItemRows(prev => prev.map((row) => {
            const isManualTaxMode = isFinancial === 'Yes' || reverseGstTcs === 'Yes';

            // If in manual mode, don't overwrite user's manual edits for taxes
            if (isManualTaxMode) {
                const tv = parseFloat(row.taxableValue || '0') || 0;
                const ig = parseFloat(row.igst || '0') || 0;
                const cg = parseFloat(row.cgst || '0') || 0;
                const sg = parseFloat(row.sgst || '0') || 0;
                const cs = parseFloat(row.cess || '0') || 0;
                return {
                    ...row,
                    qty: isFinancial === 'Yes' ? '1' : row.qty,
                    invoiceValue: (tv + ig + cg + sg + cs).toFixed(2)
                };
            }

            const qty = parseFloat(row.qty || '0') || 0;
            const xr = parseFloat(exchangeRate) || 1;
            const fcRate = parseFloat(row.fcRate || '0') || 0;
            const gstRate = parseFloat(row.gstRate || '0') || 0;
            const cessRate = parseFloat(row.cessRate || '0') || 0;

            let itemRate = row.itemRate;
            if (natureOfSupply === 'Re-Export' || natureOfSupply === 'Deemed Export') {
                itemRate = (fcRate * xr).toFixed(2);
            }

            const parsedItemRate = parseFloat(itemRate || '0') || 0;
            const taxableValue = qty * parsedItemRate;
            let igst = 0, cgst = 0, sgst = 0;

            if (placeOfSupply === companyDetails.state) {
                cgst = taxableValue * (gstRate / 100) * 0.5;
                sgst = taxableValue * (gstRate / 100) * 0.5;
            } else {
                igst = taxableValue * (gstRate / 100);
            }

            const cess = taxableValue * (cessRate / 100);
            const invoiceValue = taxableValue + igst + cgst + sgst + cess;

            return {
                ...row,
                itemRate: itemRate,
                taxableValue: taxableValue.toFixed(2),
                igst: igst.toFixed(2),
                cgst: cgst.toFixed(2),
                sgst: sgst.toFixed(2),
                cess: cess.toFixed(2),
                invoiceValue: invoiceValue.toFixed(2),
                fcAmount: (qty * fcRate).toFixed(2)
            };
        }));
    }, [exchangeRate, natureOfSupply, placeOfSupply, companyDetails.state, isFinancial, reverseGstTcs]);

    // Add logic to auto-fill when sameAsBillTo changes
    useEffect(() => {
        if (sameAsBillTo) {
            setShipFromAddress(billFromAddress);
        }
    }, [sameAsBillTo, billFromAddress]);
    const handleInvoiceSelectionChange = (newSelection: string[]) => {
        console.log("Debit Note: Invoice Selection Changed:", newSelection);
        setSelectedSupplierInvoices(newSelection);

        // Auto-fill Purchase Voucher No and Date
        // Use resilient matching (trimming both sides)
        const selectedInvoicesData = allPurchaseInvoices.filter(inv =>
            newSelection.some(sel => sel.trim() === String(inv.invoice_no || '').trim())
        );

        console.log("Debit Note: Matched Voucher Data:", selectedInvoicesData);

        const vNos = selectedInvoicesData.map(inv => inv.purchase_voucher_no || inv.voucher_no).filter(Boolean);
        const vDates = selectedInvoicesData.map(inv => inv.date).filter(Boolean);

        setPurchaseVoucherNo(vNos.join(', '));
        setPurchaseVoucherDate(vDates.join(', '));

        // Extract and set items from selected invoices 
        const newItems: any[] = [];
        selectedInvoicesData.forEach(inv => {
            const invNo = inv.invoice_no || inv.supplier_invoice_no || inv.voucher_no || '';

            // Aggressive search for items in nested structures
            let rawItems: any[] = [];
            if (inv.line_items) rawItems = inv.line_items; // NEWest top level
            else if (inv.supply_inr_details?.line_items) rawItems = inv.supply_inr_details.line_items;
            else if (inv.supply_inr_details?.items) rawItems = inv.supply_inr_details.items;
            else if (inv.supply_foreign_details?.line_items) rawItems = inv.supply_foreign_details.line_items;
            else if (inv.supply_foreign_details?.items) rawItems = inv.supply_foreign_details.items;
            else if (inv.items) rawItems = inv.items;

            console.log(`Debit Note: Extraction for ${invNo}: Found ${rawItems.length} items. Raw:`, inv);

            // Fallback for string-encoded items (legacy)
            if (rawItems.length === 0 && typeof inv.items_data === 'string') {
                try { rawItems = JSON.parse(inv.items_data); } catch (e) { }
            }

            if (Array.isArray(rawItems)) {
                rawItems.forEach((item: any) => {
                    // Extract numeric values safely
                    const qty = parseFloat(item.quantity || item.qty || '0') || 0;
                    const rate = parseFloat(item.rate || item.itemRate || item.item_rate || '0') || 0;
                    const txVal = parseFloat(item.taxable_value || item.taxableValue || item.amount || '0') || 0;
                    const igst = parseFloat(item.igst_amount || item.igst || '0') || 0;
                    const cgst = parseFloat(item.cgst_amount || item.cgst || '0') || 0;
                    const sgst = parseFloat(item.sgst_amount || item.sgst || '0') || 0;
                    const cess = parseFloat(item.cess_amount || item.cess || '0') || 0;
                    const invVal = parseFloat(item.invoice_value || item.invoiceValue || '0') || 0;

                    // CRITICAL: Determine GST Rate to prevent auto-calc from wiping out taxes
                    let gstRate = parseFloat(item.gst_rate || item.gstRate || item.igst_rate || '0');
                    if (gstRate === 0 && txVal > 0) {
                        const totalTax = igst || (cgst + sgst);
                        if (totalTax > 0) {
                            gstRate = Math.round((totalTax / txVal) * 100);
                        }
                    }

                    newItems.push({
                        id: Date.now() + Math.random(),
                        supplierInvoiceNo: invNo,
                        itemCode: item.item_code || item.itemCode || '',
                        itemName: item.item_name || item.itemName || item.name || '',
                        hsnSac: item.hsn_sac || item.hsnSac || '',
                        qty: String(qty),
                        uom: item.uom || '',
                        alternateUnit: item.alternateUnit || '',
                        itemRate: String(rate),
                        taxableValue: txVal.toFixed(2),
                        igst: igst.toFixed(2),
                        cgst: cgst.toFixed(2),
                        sgst: sgst.toFixed(2),
                        cess: cess.toFixed(2),
                        cessRate: String(item.cessRate || item.cess_rate || '0'),
                        invoiceValue: invVal.toFixed(2),
                        purchaseLedger: inv.purchase_ledger || item.purchaseLedger || item.purchase_ledger || '',
                        description: item.description || '',
                        gstRate: String(gstRate),
                        selected: true,
                        reasonForReturn: '',
                        invoiceRef: invNo,
                        fcRate: String(item.fcRate || item.foreign_rate || '0'),
                        fcAmount: String(item.fcAmount || item.foreign_amount || '0'),
                        ledgerNarration: item.ledgerNarration || ''
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
                reasonForReturn: '', supplierInvoiceNo: '', invoiceRef: '', fcRate: '0', fcAmount: '0',
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
            formData.append('vendor_id', vendorId.toString());
            formData.append('gstin', gstin);
            formData.append('branch', vendorBranch);

            // TextField fields in Backend (Comma-separated strings)
            formData.append('supplier_invoice_nos', selectedSupplierInvoices.join(', '));
            formData.append('purchase_voucher_nos', purchaseVoucherNo);
            formData.append('purchase_voucher_dates', purchaseVoucherDate);
            formData.append('outward_slip_nos', outwardSlipNos.join(', '));

            const billAddrStr = `${billFromAddress.line1}, ${billFromAddress.line2}, ${billFromAddress.line3}, ${billFromAddress.city}, ${billFromAddress.pincode}`;
            const shipAddrStr = `${shipFromAddress.line1}, ${shipFromAddress.line2}, ${shipFromAddress.line3}, ${shipFromAddress.city}, ${shipFromAddress.pincode}`;
            formData.append('bill_to', billAddrStr);
            formData.append('ship_to', shipAddrStr);

            formData.append('nature_of_supply', natureOfSupply);
            formData.append('reverse_charge', reverseCharge);
            formData.append('place_of_supply', placeOfSupply);

            formData.append('invoice_in_foreign_currency', (natureOfSupply === 'Re-Export' || natureOfSupply === 'Deemed Export') ? 'Yes' : 'No');
            formData.append('exchange_rate', exchangeRate);
            formData.append('foreign_currency', foreignCurrency);
            formData.append('is_financial', isFinancial);
            formData.append('narration', narration);

            // File upload
            if (document) {
                formData.append('supporting_document', document);
            }

            // Nested Supply Details
            const supplyDetails = {
                items: itemRows.map(r => ({
                    ...r,
                    supplierInvoiceNo: r.supplierInvoiceNo || '',
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
            formData.append('item_details', JSON.stringify(supplyDetails));

            // Nested Payment Details (needed for Allocation Link in Vendor Portal)
            const paymentDetails = selectedSupplierInvoices.map(invNo => ({
                supplierInvoiceNo: invNo,
                appliedNow: 0 // Backend will auto-compute based on item mapping
            }));
            formData.append('payment_details', JSON.stringify(paymentDetails));

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
            let response: any;
            if (prefilledData && prefilledData.voucherId) {
                response = await httpClient.patchFormData<any>(`/api/vouchers/debit-note/${prefilledData.voucherId}/`, formData);
                showSuccess('Debit Note Updated Successfully!');
            } else {
                response = await httpClient.postFormData<any>('/api/vouchers/debit-note/', formData);
                showSuccess('Debit Note Saved Successfully!');
            }

            if (onAddVouchers) {
                const vid = response?.id || prefilledData?.voucherId || Date.now().toString();
                // Map the backend response or local state to a normalized Voucher format
                const totalAmt = response?.due_details?.net_amount_due || netAmountDue || 0;
                const savedVoucher = { 
                    ...response, 
                    id: vid,
                    type: 'Debit Note',
                    date: date,
                    invoiceNo: debitNoteNo || response?.debit_note_no || '',
                    voucherNo: debitNoteNo || response?.debit_note_no || '',
                    party: vendorName || response?.vendor_name || '',
                    total: parseFloat(totalAmt.toString()),
                    amount: parseFloat(totalAmt.toString()),
                    totalTaxableAmount: parseFloat(totalTaxable.toString()),
                    totalCgst: parseFloat(totalCgst.toString()),
                    totalSgst: parseFloat(totalSgst.toString()),
                    totalIgst: parseFloat(totalIgst.toString()),
                    isInterState: parseFloat(totalIgst.toString()) > 0,
                    narration: narration || response?.narration || ''
                };
                onAddVouchers([savedVoucher], false);
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
        setBillFromAddress({ line1: '', line2: '', line3: '', city: '', pincode: '' });
        setShipFromAddress({ line1: '', line2: '', line3: '', city: '', pincode: '' });
        setSameAsBillTo(false);
        setItemRows([{
            id: Date.now(),
            itemCode: '', itemName: '', hsnSac: '', qty: '0', uom: '', alternateUnit: '',
            itemRate: '0', taxableValue: '0', igst: '0', cgst: '0', sgst: '0', cess: '0', cessRate: '0',
            invoiceValue: '0', purchaseLedger: '', description: '', gstRate: '0', selected: true,
            reasonForReturn: '', supplierInvoiceNo: '', fcRate: '0', fcAmount: '0',
            ledgerNarration: ''
        }]);
        setExchangeRate('1');
        setForeignCurrency('USD');
        setIsFinancial('No');
        setReverseTcs('');
        setReverseTds('');
        setTdsIt('');
        setPurchaseInvoiceAmountApplied('');
        setTermsAndConditions('');
        setReverseGstTcs('No');
        setReverseGstTds('No');
        setReverseIncomeTaxTcs('No');
        setReverseIncomeTaxTds('No');
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

        if (natureOfSupply === 'Re-Export' || natureOfSupply === 'Deemed Export') {
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

            <fieldset disabled={isReadOnlyMode} className={`min-h-[400px] bg-white ${isReadOnlyMode ? 'pointer-events-none opacity-90' : ''}`}>
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
                            <div className="md:col-span-1">
                                <label className="block text-sm font-bold text-[#2D3748] mb-4 uppercase tracking-wider">
                                    BILL FROM (FULL ADDRESS)
                                </label>
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        placeholder="Address Line 1"
                                        value={billFromAddress.line1}
                                        onChange={(e) => setBillFromAddress({ ...billFromAddress, line1: e.target.value })}
                                        className="w-full px-4 py-2 border border-blue-100 rounded-[8px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-[#F8FAFC] placeholder-gray-400 text-sm"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Address Line 2"
                                        value={billFromAddress.line2}
                                        onChange={(e) => setBillFromAddress({ ...billFromAddress, line2: e.target.value })}
                                        className="w-full px-4 py-2 border border-blue-100 rounded-[8px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-[#F8FAFC] placeholder-gray-400 text-sm"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Address Line 3"
                                        value={billFromAddress.line3}
                                        onChange={(e) => setBillFromAddress({ ...billFromAddress, line3: e.target.value })}
                                        className="w-full px-4 py-2 border border-blue-100 rounded-[8px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-[#F8FAFC] placeholder-gray-400 text-sm"
                                    />
                                    <div className="grid grid-cols-2 gap-3">
                                        <input
                                            type="text"
                                            placeholder="City"
                                            value={billFromAddress.city}
                                            onChange={(e) => setBillFromAddress({ ...billFromAddress, city: e.target.value })}
                                            className="w-full px-4 py-2 border border-blue-100 rounded-[8px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-[#F8FAFC] placeholder-gray-400 text-sm"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Pincode"
                                            value={billFromAddress.pincode}
                                            onChange={(e) => setBillFromAddress({ ...billFromAddress, pincode: e.target.value })}
                                            className="w-full px-4 py-2 border border-blue-100 rounded-[8px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-[#F8FAFC] placeholder-gray-400 text-sm"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="md:col-span-1">
                                <div className="flex justify-between items-center mb-4">
                                    <label className="block text-sm font-bold text-[#2D3748] uppercase tracking-wider">
                                        SHIP FROM
                                    </label>
                                    <label className="flex items-center text-xs font-bold text-[#4F46E5] cursor-pointer uppercase tracking-tight">
                                        <input
                                            type="checkbox"
                                            checked={sameAsBillTo}
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                setSameAsBillTo(checked);
                                                if (!checked) {
                                                    setShipFromAddress({ line1: '', line2: '', line3: '', city: '', pincode: '' });
                                                }
                                            }}
                                            className="mr-2 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 shadow-sm"
                                        />
                                        SAME AS BILL TO ADDRESS
                                    </label>
                                </div>
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        placeholder="Address Line 1"
                                        value={shipFromAddress.line1}
                                        disabled={sameAsBillTo}
                                        onChange={(e) => setShipFromAddress({ ...shipFromAddress, line1: e.target.value })}
                                        className={`w-full px-4 py-2 border border-blue-100 rounded-[8px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${sameAsBillTo ? 'bg-gray-100' : 'bg-[#F8FAFC]'} placeholder-gray-400 text-sm transition-all`}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Address Line 2"
                                        value={shipFromAddress.line2}
                                        disabled={sameAsBillTo}
                                        onChange={(e) => setShipFromAddress({ ...shipFromAddress, line2: e.target.value })}
                                        className={`w-full px-4 py-2 border border-blue-100 rounded-[8px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${sameAsBillTo ? 'bg-gray-100' : 'bg-[#F8FAFC]'} placeholder-gray-400 text-sm transition-all`}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Address Line 3"
                                        value={shipFromAddress.line3}
                                        disabled={sameAsBillTo}
                                        onChange={(e) => setShipFromAddress({ ...shipFromAddress, line3: e.target.value })}
                                        className={`w-full px-4 py-2 border border-blue-100 rounded-[8px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${sameAsBillTo ? 'bg-gray-100' : 'bg-[#F8FAFC]'} placeholder-gray-400 text-sm transition-all`}
                                    />
                                    <div className="grid grid-cols-2 gap-3">
                                        <input
                                            type="text"
                                            placeholder="City"
                                            value={shipFromAddress.city}
                                            disabled={sameAsBillTo}
                                            onChange={(e) => setShipFromAddress({ ...shipFromAddress, city: e.target.value })}
                                            className={`w-full px-4 py-2 border border-blue-100 rounded-[8px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${sameAsBillTo ? 'bg-gray-100' : 'bg-[#F8FAFC]'} placeholder-gray-400 text-sm transition-all`}
                                        />
                                        <input
                                            type="text"
                                            placeholder="Pincode"
                                            value={shipFromAddress.pincode}
                                            disabled={sameAsBillTo}
                                            onChange={(e) => setShipFromAddress({ ...shipFromAddress, pincode: e.target.value })}
                                            className={`w-full px-4 py-2 border border-blue-100 rounded-[8px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${sameAsBillTo ? 'bg-gray-100' : 'bg-[#F8FAFC]'} placeholder-gray-400 text-sm transition-all`}
                                        />
                                    </div>
                                </div>
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
                            {(natureOfSupply === 'Re-Export' || natureOfSupply === 'Deemed Export') && (
                                <>
                                    <div className="bg-blue-50/50 p-4 rounded-[8px] border border-blue-100 space-y-4 md:col-span-1">
                                        <label className="block text-sm font-bold text-blue-900 uppercase tracking-wider mb-2">Currency</label>
                                        <select
                                            value={foreignCurrency}
                                            onChange={(e) => setForeignCurrency(e.target.value)}
                                            className="w-full px-4 py-2 border border-blue-200 rounded-[8px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-sm font-medium"
                                        >
                                            <option value="USD">USD - US Dollar</option>
                                            <option value="EUR">EUR - Euro</option>
                                            <option value="GBP">GBP - British Pound</option>
                                            <option value="JPY">JPY - Japanese Yen</option>
                                            <option value="AUD">AUD - Australian Dollar</option>
                                            <option value="CAD">CAD - Canadian Dollar</option>
                                            <option value="INR">INR - Indian Rupee (Special Case)</option>
                                        </select>
                                    </div>
                                    <div className="bg-blue-50/50 p-4 rounded-[8px] border border-blue-100 space-y-4 md:col-span-1">
                                        <label className="block text-sm font-bold text-blue-900 uppercase tracking-wider mb-2">Exchange Rate</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 font-bold text-xs ring-1 ring-blue-200 bg-blue-50 px-1.5 py-0.5 rounded">1 {foreignCurrency} =</span>
                                            <input
                                                type="number" onWheel={(e) => e.currentTarget.blur()}
                                                step="0.0001"
                                                value={exchangeRate}
                                                onChange={(e) => setExchangeRate(e.target.value)}
                                                className="w-full pl-20 pr-12 py-2 border border-blue-200 rounded-[8px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-sm font-bold text-right"
                                                placeholder="1.0000"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs uppercase">INR</span>
                                        </div>
                                    </div>
                                </>
                            )}
                            <div className="md:col-span-1">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Reverse Charge Applicable</label>
                                <div className="flex items-center space-x-6 h-[40px] bg-white border border-blue-200 rounded-[4px] px-4 w-max">
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
                            <div className="md:col-span-1">
                                <label className="block text-sm font-bold text-indigo-600 mb-2 uppercase tracking-wide">
                                    IT IS FINANCIAL DEBIT NOTE?
                                </label>
                                <div className="flex bg-white p-1 rounded-[4px] border border-blue-200 w-max h-[40px] items-center">
                                    {['No', 'Yes'].map(opt => (
                                        <button
                                            key={opt}
                                            type="button"
                                            onClick={() => setIsFinancial(opt)}
                                            className={`px-8 py-1 rounded-[2px] text-[13px] font-bold transition-all ${isFinancial === opt
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                        >
                                            {opt.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="md:col-span-1">
                                <label className="block text-sm font-bold text-indigo-600 mb-2 uppercase tracking-wide">
                                    Reverse GST (TCS/TDS)
                                </label>
                                <div className="flex bg-white p-1 rounded-[4px] border border-blue-200 w-max h-[40px] items-center">
                                    {['No', 'Yes'].map(opt => (
                                        <button
                                            key={opt}
                                            type="button"
                                            onClick={() => {
                                                if (opt === 'Yes') {
                                                    setReverseGstTcs('Yes');
                                                    setReverseGstTds('Yes');
                                                } else {
                                                    setReverseGstTcs('No');
                                                    setReverseGstTds('No');
                                                }
                                            }}
                                            className={`px-8 py-1 rounded-[2px] text-[13px] font-bold transition-all ${(reverseGstTcs === opt || reverseGstTds === opt)
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                        >
                                            {opt.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="md:col-span-1">
                                <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wide">
                                    Reverse IT (TCS/TDS)
                                </label>
                                <div className="flex bg-white p-1 rounded-[4px] border border-blue-200 w-max h-[40px] items-center">
                                    {['No', 'Yes'].map(opt => (
                                        <button
                                            key={opt}
                                            type="button"
                                            onClick={() => {
                                                if (opt === 'Yes') {
                                                    setReverseIncomeTaxTcs('Yes');
                                                    setReverseIncomeTaxTds('Yes');
                                                } else {
                                                    setReverseIncomeTaxTcs('No');
                                                    setReverseIncomeTaxTds('No');
                                                }
                                            }}
                                            className={`px-8 py-1 rounded-[2px] text-[13px] font-bold transition-all ${(reverseIncomeTaxTcs === opt || reverseIncomeTaxTds === opt)
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                        >
                                            {opt.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-start pt-6 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={() => setActiveTab(natureOfSupply === 'Re-Export' || natureOfSupply === 'Deemed Export' ? 'item_tax_fc' : 'item_tax')}
                                className="erp-button-primary"
                            >
                                NEXT
                            </button>
                        </div>
                    </div>
                )}



                {activeTab === 'item_tax_fc' && (
                    <div className="space-y-6">
                        <div className="flex flex-wrap justify-between items-end gap-4">
                            <div className="flex items-center gap-2 bg-white px-4 py-2 border border-blue-200 rounded-[4px] shadow-none">
                                <span className="text-sm font-medium text-gray-700">1 {foreignCurrency} =</span>
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
                        <div className="overflow-x-auto border border-gray-200 rounded-[4px]">
                            <table className="w-full">
                                <thead className="bg-indigo-600 text-white">
                                    <tr>
                                        <th className="px-3 py-3 text-center w-12 border-r border-blue-400"></th>
                                        <th className="px-3 py-3 text-sm font-semibold text-center border-r border-blue-400 w-40">Supplier Invoice No.</th>
                                        <th className="px-3 py-3 text-sm font-semibold text-center border-r border-blue-400">Description</th>
                                        <th className="px-3 py-3 text-sm font-semibold text-center w-32 border-r border-blue-400">Quantity</th>
                                        <th className="px-3 py-3 text-sm font-semibold text-center w-32 border-r border-blue-400">UQC</th>
                                        <th className="px-3 py-3 text-sm font-semibold text-center w-40 border-r border-blue-400">Rate ({foreignCurrency})</th>
                                        <th className="px-3 py-3 text-sm font-semibold text-center w-40">Amount ({foreignCurrency})</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {itemRows.map((row, index) => {
                                        const isSelected = row.selected !== false;
                                        return (
                                            <React.Fragment key={row.id}>
                                                <tr className={`hover:bg-gray-50 transition-colors ${!isSelected ? 'opacity-50' : ''}`}>
                                                    <td className="px-3 py-2 text-center border-r border-gray-200">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={(e) => updateItemRow(index, { selected: e.target.checked })}
                                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 border-r border-gray-200">
                                                        <input
                                                            type="text"
                                                            value={row.supplierInvoiceNo || ''}
                                                            readOnly
                                                            className="w-full px-2 py-1.5 border-0 bg-gray-50 rounded text-sm text-center text-indigo-700 font-bold"
                                                            placeholder="Auto"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 border-r border-gray-200">
                                                        <SearchableDropdown
                                                            options={availableItems.map(it => it.itemName).filter(Boolean)}
                                                            value={row.itemName}
                                                            onChange={(val) => updateItemRow(index, { itemName: val })}
                                                            placeholder="Select item description"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 border-r border-gray-200">
                                                        <input
                                                            type="number" onWheel={(e) => e.currentTarget.blur()}
                                                            value={row.qty}
                                                            onChange={(e) => updateItemRow(index, { qty: e.target.value })}
                                                            className="w-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm text-center bg-transparent"
                                                            placeholder="0"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 border-r border-gray-200">
                                                        <input
                                                            type="text"
                                                            value={row.uom}
                                                            readOnly
                                                            className="w-full px-2 py-1.5 border-0 bg-gray-50 rounded text-sm text-center text-gray-500"
                                                            placeholder="UQC"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 border-r border-gray-200">
                                                        <input
                                                            type="number" onWheel={(e) => e.currentTarget.blur()}
                                                            value={row.fcRate}
                                                            onChange={(e) => updateItemRow(index, { fcRate: e.target.value })}
                                                            className="w-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm text-center bg-transparent"
                                                            placeholder="0.00"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="text"
                                                            value={row.fcAmount}
                                                            readOnly
                                                            className="w-full px-2 py-1.5 bg-gray-50 border-0 rounded text-sm font-medium text-center text-gray-700"
                                                            placeholder="0.00"
                                                        />
                                                    </td>
                                                </tr>
                                                <tr className={`border-b border-gray-200 bg-gray-50/30 ${!isSelected ? 'opacity-50' : ''}`}>
                                                    <td colSpan={2} className="px-4 py-2 border-r border-gray-200">
                                                        <div className="flex items-center gap-3">
                                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Purchase Ledger:</label>
                                                            <div className="flex-1">
                                                                <SearchableDropdown options={ledgers.map(l => l.name)} value={row.purchaseLedger} onChange={(val) => updateItemRow(index, { purchaseLedger: val })} placeholder="Select Purchase Ledger" />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td colSpan={5} className="px-4 py-2">
                                                        <div className="flex items-center gap-3">
                                                            {!isFinancial || isFinancial === 'No' ? (
                                                                <>
                                                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Invoice Ref:</label>
                                                                    <input type="text" value={row.invoiceRef} onChange={(e) => updateItemRow(index, { invoiceRef: e.target.value })} className="w-28 border-b border-gray-200 focus:border-indigo-500 bg-transparent py-1 text-sm outline-none transition-colors" placeholder="Ref" />
                                                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Reason:</label>
                                                                    <select value={row.reasonForReturn} onChange={(e) => updateItemRow(index, { reasonForReturn: e.target.value })} className="border-b border-gray-200 focus:border-indigo-500 bg-transparent py-1 text-sm outline-none transition-colors">
                                                                        <option value="">Select Reason</option>
                                                                        <option value="Sales Return">Sales Return</option>
                                                                        <option value="Post Sale Discount">Post Sale Discount</option>
                                                                        <option value="Deficiency in Service">Deficiency in Service</option>
                                                                        <option value="Correction in Invoice">Correction in Invoice</option>
                                                                        <option value="Change in POS">Change in POS</option>
                                                                        <option value="Finalization of Provisional Assessment">Finalization of Prov. Assessment</option>
                                                                        <option value="Others">Others</option>
                                                                    </select>
                                                                </>
                                                            ) : null}
                                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Ledger Narration:</label>
                                                            <input type="text" value={row.ledgerNarration} onChange={(e) => updateItemRow(index, { ledgerNarration: e.target.value })} className="flex-1 border-b border-gray-200 focus:border-indigo-500 bg-transparent py-1 text-sm outline-none transition-colors" placeholder="Enter ledger narration" />
                                                            {isFinancial === 'Yes' && (
                                                                <div className="flex items-center gap-2 ml-4">
                                                                    <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider whitespace-nowrap">Amount:</label>
                                                                    <input
                                                                        type="number" onWheel={(e) => e.currentTarget.blur()}
                                                                        value={row.taxableValue || 0}
                                                                        onChange={(e) => updateItemRow(index, { taxableValue: e.target.value })}
                                                                        placeholder="0.00"
                                                                        className="w-24 border-b border-indigo-200 focus:border-indigo-500 bg-transparent py-1 text-sm font-bold text-indigo-700 outline-none transition-colors text-right"
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex items-center justify-between pt-2">
                            <div className="flex items-center gap-4">
                                <button
                                    type="button"
                                    onClick={() => setItemRows(prev => [...prev, {
                                        id: Date.now(), itemCode: '', itemName: '', hsnSac: '', qty: '0', uom: '', alternateUnit: '', itemRate: '0', taxableValue: '0', igst: '0', cgst: '0', sgst: '0', cess: '0', cessRate: '0', invoiceValue: '0', purchaseLedger: '', description: '', gstRate: '0', selected: true, reasonForReturn: '', invoiceRef: '', supplierInvoiceNo: '', fcRate: '0', fcAmount: '0', ledgerNarration: ''
                                    }])}
                                    className="px-4 py-2 text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-2 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> Add Row
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('item_tax_inr')}
                                    className="erp-button-primary"
                                >
                                    NEXT
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => setItemRows(prev => prev.filter(r => r.selected !== false))}
                                className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-[4px] transition-colors font-medium flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> Delete Items
                            </button>
                        </div>
                    </div>
                )}
                {(activeTab === 'item_tax' || activeTab === 'item_tax_inr') && (
                    <div className="space-y-6">
                        <div className="overflow-x-auto border border-gray-200 rounded-[4px]">
                            <table className="w-full text-sm text-left text-gray-500 whitespace-nowrap min-w-[1200px]">
                                <thead className="bg-[#4F46E5] text-white uppercase font-semibold">
                                    <tr>
                                        <th className="px-3 py-2 text-center border-r border-indigo-400 w-16">S. No.</th>
                                        <th className="px-3 py-2 text-center border-r border-indigo-400 w-40">Supplier Invoice No.</th>
                                        <th className="px-3 py-2 text-center border-r border-indigo-400 w-32">Item Code</th>
                                        <th className="px-3 py-2 text-center border-r border-indigo-400 w-48">Item Name</th>
                                        <th className="px-3 py-2 text-center border-r border-indigo-400 w-24">HSN/SAC</th>
                                        <th className="px-3 py-2 text-center border-r border-indigo-400 w-20">Qty</th>
                                        <th className="px-3 py-2 text-center border-r border-indigo-400 w-20">UOM</th>
                                        <th className="px-3 py-2 text-center border-r border-indigo-400 w-24">Alt Unit</th>
                                        <th className="px-3 py-2 text-center border-r border-indigo-400 w-28">Item Rate</th>
                                        <th className="px-3 py-2 text-center border-r border-indigo-400 w-32">Taxable Value</th>
                                        {placeOfSupply === companyDetails.state ? (
                                            <>
                                                <th className="px-3 py-2 text-center border-r border-indigo-400 w-28">CGST</th>
                                                <th className="px-3 py-2 text-center border-r border-indigo-400 w-28">SGST</th>
                                            </>
                                        ) : (
                                            <th className="px-3 py-2 text-center border-r border-indigo-400 w-28">IGST</th>
                                        )}
                                        <th className="px-3 py-2 text-center border-r border-indigo-400 w-24">CESS</th>
                                        <th className="px-3 py-2 text-center w-32 bg-indigo-500">Invoice Value</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {itemRows.map((row, index) => {
                                        const isSelected = row.selected !== false;
                                        return (
                                            <React.Fragment key={row.id}>
                                                <tr className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${!isSelected ? 'opacity-50' : ''}`}>
                                                    <td className="px-2 py-2 text-center text-sm font-medium border-l-0 border-r border-gray-200">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={(e) => updateItemRow(index, { selected: e.target.checked })}
                                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                                                        />
                                                        <span className="ml-2">{index + 1}</span>
                                                    </td>
                                                    <td className="px-2 py-2 border-r border-gray-200">
                                                        <input
                                                            type="text"
                                                            value={row.supplierInvoiceNo || ''}
                                                            readOnly
                                                            className="w-full px-2 py-1.5 border-0 bg-gray-50 rounded text-sm text-center text-indigo-700 font-bold"
                                                            placeholder="Auto"
                                                        />
                                                    </td>
                                                    <td className="px-2 py-2 border-r border-gray-200">
                                                        <SearchableDropdown disabled={isFinancial === 'Yes'} options={availableItems.map(it => it.itemCode).filter(Boolean)} value={row.itemCode} onChange={(val) => updateItemRow(index, { itemCode: val })} placeholder="Item code" />
                                                    </td>
                                                    <td className="px-2 py-2 border-r border-gray-200">
                                                        <SearchableDropdown disabled={isFinancial === 'Yes'} options={availableItems.map(it => it.itemName).filter(Boolean)} value={row.itemName} onChange={(val) => updateItemRow(index, { itemName: val })} placeholder="Item name" />
                                                    </td>
                                                    <td className="px-2 py-2 border-r border-gray-200">
                                                        <input
                                                            disabled={isFinancial === 'Yes'}
                                                            type="text"
                                                            value={row.hsnSac}
                                                            onChange={(e) => updateItemRow(index, { hsnSac: e.target.value })}
                                                            className={`w-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm text-center bg-transparent ${isFinancial === 'Yes' ? 'opacity-50 cursor-not-allowed bg-gray-50/50' : ''}`}
                                                            placeholder="HSN"
                                                        />
                                                    </td>
                                                    <td className="px-2 py-2 border-r border-gray-200">
                                                        <input disabled={isFinancial === 'Yes'} type="number" onWheel={(e) => e.currentTarget.blur()} value={row.qty} onChange={(e) => updateItemRow(index, { qty: e.target.value })} className={`w-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm text-center bg-transparent ${isFinancial === 'Yes' ? 'opacity-50 cursor-not-allowed bg-gray-50/50' : ''}`} placeholder="0" />
                                                    </td>
                                                    <td className="px-2 py-2 border-r border-gray-200">
                                                        <input disabled={isFinancial === 'Yes'} type="text" value={row.uom} readOnly className="w-full px-2 py-1.5 border-0 bg-gray-50 rounded text-sm text-center text-gray-500" placeholder="UOM" />
                                                    </td>
                                                    <td className="px-2 py-2 border-r border-gray-200">
                                                        <input disabled={isFinancial === 'Yes'} type="text" value={row.alternateUnit} readOnly className="w-full px-2 py-1.5 border-0 bg-gray-50 rounded text-sm text-center text-gray-500" placeholder="Alt Unit" />
                                                    </td>
                                                    <td className="px-2 py-2 border-r border-gray-200">
                                                        <input disabled={isFinancial === 'Yes'} type="number" onWheel={(e) => e.currentTarget.blur()} value={row.itemRate} onChange={(e) => updateItemRow(index, { itemRate: e.target.value })} className={`w-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm text-right bg-transparent ${isFinancial === 'Yes' ? 'opacity-50 cursor-not-allowed bg-gray-50/50' : ''}`} placeholder="0.00" />
                                                    </td>
                                                    <td className="px-2 py-2 border-r border-gray-200">
                                                        {(isFinancial === 'Yes' || reverseGstTcs === 'Yes') ? (
                                                            <input
                                                                type="number" onWheel={(e) => e.currentTarget.blur()}
                                                                value={row.taxableValue}
                                                                onChange={(e) => updateItemRow(index, { taxableValue: e.target.value })}
                                                                className="w-full px-2 py-1.5 bg-[#EBF5FF] text-blue-700 font-bold border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm text-right"
                                                                placeholder="0.00"
                                                                step="0.01"
                                                            />
                                                        ) : (
                                                            <input type="text" value={row.taxableValue} readOnly className="w-full px-2 py-1.5 bg-[#EBF5FF] text-blue-700 font-bold border-0 rounded text-sm text-right" placeholder="0.00" />
                                                        )}
                                                    </td>
                                                    {placeOfSupply === companyDetails.state ? (
                                                        <>
                                                            <td className="px-2 py-2 border-r border-gray-200">
                                                                {(isFinancial === 'Yes' || reverseGstTcs === 'Yes') ? (
                                                                    <input type="number" onWheel={(e) => e.currentTarget.blur()} value={row.cgst} onChange={(e) => updateItemRow(index, { cgst: e.target.value })} className="w-full px-2 py-1.5 bg-[#EBF5FF] text-blue-700 font-bold border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm text-right" placeholder="0.00" step="0.01" />
                                                                ) : (
                                                                    <input type="text" value={row.cgst} readOnly className="w-full px-2 py-1.5 bg-[#EBF5FF] text-blue-700 font-bold border-0 rounded text-sm text-right" placeholder="0.00" />
                                                                )}
                                                            </td>
                                                            <td className="px-2 py-2 border-r border-gray-200">
                                                                {(isFinancial === 'Yes' || reverseGstTcs === 'Yes') ? (
                                                                    <input type="number" onWheel={(e) => e.currentTarget.blur()} value={row.sgst} onChange={(e) => updateItemRow(index, { sgst: e.target.value })} className="w-full px-2 py-1.5 bg-[#F0FDF4] text-green-700 font-bold border-0 focus:ring-1 focus:ring-green-500 rounded text-sm text-right" placeholder="0.00" step="0.01" />
                                                                ) : (
                                                                    <input type="text" value={row.sgst} readOnly className="w-full px-2 py-1.5 bg-[#F0FDF4] text-green-700 font-bold border-0 rounded text-sm text-right" placeholder="0.00" />
                                                                )}
                                                            </td>
                                                        </>
                                                    ) : (
                                                        <td className="px-2 py-2 border-r border-gray-200">
                                                            {(isFinancial === 'Yes' || reverseGstTcs === 'Yes') ? (
                                                                <input type="number" onWheel={(e) => e.currentTarget.blur()} value={row.igst} onChange={(e) => updateItemRow(index, { igst: e.target.value })} className="w-full px-2 py-1.5 bg-[#EBF5FF] text-blue-700 font-bold border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm text-right" placeholder="0.00" step="0.01" />
                                                            ) : (
                                                                <input type="text" value={row.igst} readOnly className="w-full px-2 py-1.5 bg-[#EBF5FF] text-blue-700 font-bold border-0 rounded text-sm text-right" placeholder="0.00" />
                                                            )}
                                                        </td>
                                                    )}
                                                    <td className="px-2 py-2 border-r border-gray-200">
                                                        {(isFinancial === 'Yes' || reverseGstTcs === 'Yes') ? (
                                                            <input type="number" onWheel={(e) => e.currentTarget.blur()} value={row.cess} onChange={(e) => updateItemRow(index, { cess: e.target.value })} className="w-full px-2 py-1.5 bg-[#F5F3FF] text-purple-700 font-bold border-0 focus:ring-1 focus:ring-purple-500 rounded text-sm text-right" placeholder="0.00" step="0.01" />
                                                        ) : (
                                                            <input type="text" value={row.cess} readOnly className="w-full px-2 py-1.5 bg-[#F5F3FF] text-purple-700 font-bold border-0 rounded text-sm text-right" placeholder="0.00" />
                                                        )}
                                                    </td>
                                                    <td className="px-2 py-2 bg-indigo-50/30">
                                                        <input type="text" value={row.invoiceValue} readOnly className="w-full px-2 py-1.5 bg-transparent border-0 rounded text-sm font-bold text-right text-gray-900" placeholder="0.00" />
                                                    </td>
                                                </tr>
                                                <tr className={`border-b border-gray-200 bg-gray-50/30 ${!isSelected ? 'opacity-50' : ''}`}>
                                                    <td colSpan={4} className="px-4 py-2 border-r border-gray-200">
                                                        <div className="flex items-center gap-3">
                                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Purchase Ledger:</label>
                                                            <div className="flex-1">
                                                                <SearchableDropdown options={ledgers.map(l => l.name)} value={row.purchaseLedger} onChange={(val) => updateItemRow(index, { purchaseLedger: val })} placeholder="Select Purchase Ledger" />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td colSpan={placeOfSupply === companyDetails.state ? 10 : 9} className="px-4 py-2">
                                                        <div className="flex items-center gap-3">
                                                            {isFinancial !== 'Yes' && (
                                                                <>
                                                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Invoice Ref:</label>
                                                                    <input type="text" value={row.invoiceRef} onChange={(e) => updateItemRow(index, { invoiceRef: e.target.value })} className="w-28 border-b border-gray-200 focus:border-indigo-500 bg-transparent py-1 text-sm outline-none transition-colors" placeholder="Ref" />
                                                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Reason:</label>
                                                                    <select value={row.reasonForReturn} onChange={(e) => updateItemRow(index, { reasonForReturn: e.target.value })} className="border-b border-gray-200 focus:border-indigo-500 bg-transparent py-1 text-sm outline-none transition-colors">
                                                                        <option value="">Select Reason</option>
                                                                        <option value="Sales Return">Sales Return</option>
                                                                        <option value="Post Sale Discount">Post Sale Discount</option>
                                                                        <option value="Deficiency in Service">Deficiency in Service</option>
                                                                        <option value="Correction in Invoice">Correction in Invoice</option>
                                                                        <option value="Change in POS">Change in POS</option>
                                                                        <option value="Finalization of Provisional Assessment">Finalization of Prov. Assessment</option>
                                                                        <option value="Others">Others</option>
                                                                    </select>
                                                                </>
                                                            )}
                                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Ledger Narration:</label>
                                                            <input type="text" value={row.ledgerNarration} onChange={(e) => updateItemRow(index, { ledgerNarration: e.target.value })} className="flex-1 border-b border-gray-200 focus:border-indigo-500 bg-transparent py-1 text-sm outline-none transition-colors" placeholder="Enter ledger narration" />
                                                            {isFinancial === 'Yes' && (
                                                                <div className="flex items-center gap-2 ml-4">
                                                                    <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider whitespace-nowrap">Amount:</label>
                                                                    <input
                                                                        type="number" onWheel={(e) => e.currentTarget.blur()}
                                                                        value={row.taxableValue || 0}
                                                                        onChange={(e) => updateItemRow(index, { taxableValue: e.target.value })}
                                                                        placeholder="0.00"
                                                                        className="w-24 border-b border-indigo-200 focus:border-indigo-500 bg-transparent py-1 text-sm font-bold text-indigo-700 outline-none transition-colors text-right"
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex items-center justify-between pt-2">
                            <div className="flex items-center gap-4">
                                <button
                                    type="button"
                                    onClick={() => setItemRows(prev => [...prev, {
                                        id: Date.now(), itemCode: '', itemName: '', hsnSac: '', qty: '0', uom: '', alternateUnit: '', itemRate: '0', taxableValue: '0', igst: '0', cgst: '0', sgst: '0', cess: '0', cessRate: '0', invoiceValue: '0', purchaseLedger: '', description: '', gstRate: '0', selected: true, reasonForReturn: '', invoiceRef: '', supplierInvoiceNo: '', fcRate: '0', fcAmount: '0', ledgerNarration: ''
                                    }])}
                                    className="px-4 py-2 text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-2 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> Add Row
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('payment')}
                                    className="erp-button-primary"
                                >
                                    NEXT
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => setItemRows(prev => prev.filter(r => r.selected !== false))}
                                className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-[4px] transition-colors font-medium flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> Delete Items
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

                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr_1fr] gap-6">
                            {/* Left Column: Payment Summary */}
                            <div className="space-y-4">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Invoice Value</label>
                                        <input
                                            type="number" onWheel={(e) => e.currentTarget.blur()}
                                            readOnly
                                            value={totalInvoiceValue.toFixed(2)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-right font-semibold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Reverse TCS on the Debit Note</label>
                                        <input
                                            type="number" onWheel={(e) => e.currentTarget.blur()}
                                            step="0.01"
                                            value={reverseTcs}
                                            onChange={(e) => setReverseTcs(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-right font-semibold"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Reverse TDS on the Debit Note</label>
                                        <input
                                            type="number" onWheel={(e) => e.currentTarget.blur()}
                                            step="0.01"
                                            value={reverseTds}
                                            onChange={(e) => setReverseTds(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-right font-semibold"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">TDS/TCS under Income Tax</label>
                                        <input
                                            type="number" onWheel={(e) => e.currentTarget.blur()}
                                            step="0.01"
                                            value={tdsIt}
                                            onChange={(e) => setTdsIt(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-right font-semibold"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Gross Amount Due</label>
                                        <input
                                            type="text"
                                            readOnly
                                            value={grossAmountDue.toFixed(2)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-right font-semibold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Net Amount Due</label>
                                        <input
                                            type="text"
                                            readOnly
                                            value={netAmountDue.toFixed(2)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-right font-bold text-lg text-indigo-700"
                                        />
                                    </div>
                                </div>
                                <div className="mt-2">
                                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Narration / Posting Note:</label>
                                    <textarea
                                        value={narration}
                                        onChange={(e) => setNarration(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 resize-none h-24"
                                        placeholder="Enter narration or posting notes..."
                                    />
                                </div>
                            </div>

                            {/* Middle Column: Supplier Invoices Application */}
                            <div className="border border-gray-300 rounded-[4px] p-4 bg-slate-50/50 flex flex-col h-full">
                                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-200 pb-2">Supplier Invoices</h3>
                                <div className="space-y-4 flex-1 scrollbar-thin">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Selected Supplier Invoices</label>
                                        <div className="min-h-[80px] p-3 bg-white border border-gray-200 rounded-[4px] text-sm text-gray-600">
                                            {supplierInvoiceNos.length > 0 ? supplierInvoiceNos.join(', ') : 'No invoices selected'}
                                        </div>
                                    </div>
                                    <div className="pt-4">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Invoice Amount Applied</label>
                                        <input
                                            type="number" onWheel={(e) => e.currentTarget.blur()}
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
                                            onClick={() => setIsTermsEditable(!isTermsEditable)}
                                            className={`px-4 py-2 text-white text-sm font-medium rounded-[4px] transition-colors shadow-sm ${isTermsEditable ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                                        >
                                            {isTermsEditable ? 'Lock Terms' : 'Edit Masters'}
                                        </button>
                                    </div>
                                    <div>
                                        <textarea
                                            value={termsAndConditions}
                                            onChange={(e) => setTermsAndConditions(e.target.value)}
                                            readOnly={!isTermsEditable}
                                            className={`w-full px-4 py-3 border rounded-[4px] text-xs h-32 resize-none placeholder:text-gray-300 focus:ring-1 focus:ring-indigo-500 transition-all font-medium ${!isTermsEditable ? 'bg-gray-100 border-gray-200 cursor-not-allowed text-gray-600' : 'bg-white border-indigo-300'}`}
                                            placeholder="Enter terms & conditions..."
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-start pt-6 border-t border-gray-200 mt-6">
                            <button
                                type="button"
                                onClick={() => setActiveTab('dispatch')}
                                className="erp-button-primary"
                            >
                                NEXT
                            </button>
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
                        <div className="flex justify-start pt-6 border-t border-gray-200 mt-6">
                            <button
                                type="button"
                                onClick={() => setActiveTab('einvoice')}
                                className="erp-button-primary"
                            >
                                NEXT
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
                        <div className="flex justify-start gap-4 pt-8 border-t border-gray-200 mt-8">
                            <button
                                type="button"
                                onClick={() => handlePost(false)}
                                className="erp-button-primary"
                            >
                                POST & CLOSE
                            </button>
                            <button
                                type="button"
                                onClick={() => handlePost(true)}
                                className="erp-button-secondary border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                            >
                                POST & PRINT/EMAIL
                            </button>
                        </div>
                    </div>
                )}
            </fieldset>


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

